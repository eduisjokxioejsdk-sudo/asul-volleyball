// Vérifie le buffer de rediffusion du flux caméra (module serveur
// server/src/liveStream.js) : ouverture/fermeture de la caméra, horodatage des
// morceaux, délai de rediffusion réellement appliqué, bornage mémoire et
// resynchronisation des lecteurs.
//
// Exécution : node server/scripts/live-stream.spec.mjs
import stream from '../src/liveStream.js';

const {
  DEFAULT_DELAY_S,
  DELAY_CHOICES,
  MAX_BUFFER_BYTES,
  REPLAY_TICK_MS,
  bufferedBytes,
  cameraStarted,
  cameraStopped,
  dispose,
  initChunk,
  isCameraActive,
  setDelay,
  streamState,
  writeChunk,
} = stream;

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `attendu ${JSON.stringify(expected)} — obtenu ${JSON.stringify(actual)}`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (size = 8) => Buffer.alloc(size, 1);

/** Émetteur de test : mémorise les événements reçus. */
function recorder() {
  const events = [];
  const emit = (event, payload) => events.push({ event, payload });
  const names = (name) => events.filter((e) => e.event === name);
  return { emit, events, names, reset: () => { events.length = 0; } };
}

console.log('\n== Constantes ==');
check('délai par défaut = 10 s', DEFAULT_DELAY_S === 10, String(DEFAULT_DELAY_S));
check('le délai 0 (vrai direct) est proposé', DELAY_CHOICES.includes(0));
check('le délai par défaut est proposé', DELAY_CHOICES.includes(DEFAULT_DELAY_S));
check('au moins 5 délais proposés', DELAY_CHOICES.length >= 5, String(DELAY_CHOICES.length));
check('les délais sont croissants', DELAY_CHOICES.every((v, i) => i === 0 || v > DELAY_CHOICES[i - 1]));
check('le minuteur de rediffusion est sub-seconde', REPLAY_TICK_MS > 0 && REPLAY_TICK_MS <= 500, String(REPLAY_TICK_MS));
check('capacité mémoire bornée (≥ 16 Mo)', MAX_BUFFER_BYTES >= 16 * 1024 * 1024, String(MAX_BUFFER_BYTES));

console.log('\n== État initial ==');
eq('session inconnue : caméra inactive + délai par défaut', streamState('inconnue'), {
  cameraActive: false,
  delay: DEFAULT_DELAY_S,
  mimeType: '',
  hasInit: false,
});
check('aucun octet en attente', bufferedBytes('inconnue') === 0);
check('écrire sans caméra est refusé', writeChunk('inconnue', chunk()) === false);
check('aucun en-tête de flux sans caméra', initChunk('inconnue') === null);

console.log('\n== Ouverture de la caméra ==');
{
  const rec = recorder();
  const started = cameraStarted('s1', { mimeType: 'video/webm;codecs=vp8', delay: 1, emit: rec.emit });
  eq('délai retenu', started.delay, 1);
  eq('type MIME mémorisé', started.mimeType, 'video/webm;codecs=vp8');
  check('caméra signalée active', isCameraActive('s1'));
  eq('les appareils sont prévenus', rec.names('live:camera-joined').length, 1);
  eq('le message porte le délai', rec.names('live:camera-joined')[0].payload.delay, 1);
  eq('le message porte le type MIME', rec.names('live:camera-joined')[0].payload.mimeType, 'video/webm;codecs=vp8');
  eq('état du flux', streamState('s1').cameraActive, true);

  rec.reset();
  check('un morceau est accepté', writeChunk('s1', chunk(16)) === true);
  eq('les octets sont mis en attente', bufferedBytes('s1'), 16);
  eq('rien n’est envoyé avant le délai', rec.names('live:video-ready').length, 0);

  await wait(1_300);
  eq('le morceau est rediffusé après le délai', rec.names('live:video-ready').length, 1);
  eq('le premier morceau porte le numéro 1', rec.names('live:video-ready')[0].payload.seq, 1);
  eq('le morceau transporté fait 16 octets', rec.names('live:video-ready')[0].payload.data.length, 16);
  eq('le type MIME est joint au morceau', rec.names('live:video-ready')[0].payload.mimeType, 'video/webm;codecs=vp8');
  eq('le buffer est vidé après envoi', bufferedBytes('s1'), 0);
  dispose('s1');
}

console.log('\n== Ordre et continuité ==');
{
  const rec = recorder();
  cameraStarted('s2', { mimeType: 'video/webm', delay: 0, emit: rec.emit });
  for (let i = 0; i < 5; i += 1) writeChunk('s2', chunk(4));
  await wait(REPLAY_TICK_MS * 3);
  const seqs = rec.names('live:video-ready').map((e) => e.payload.seq);
  eq('tous les morceaux sont rediffusés', seqs, [1, 2, 3, 4, 5]);
  eq('aucun octet restant', bufferedBytes('s2'), 0);
  cameraStopped('s2');
  dispose('s2');
}

console.log('\n== Délai : valeurs anormales ramenées dans les bornes ==');
{
  const rec = recorder();
  cameraStarted('s3', { emit: rec.emit });
  eq('délai négatif → 0', setDelay('s3', -8, rec.emit), 0);
  eq('délai énorme → 60 s', setDelay('s3', 999, rec.emit), 60);
  eq('délai non numérique → défaut', setDelay('s3', 'abc', rec.emit), DEFAULT_DELAY_S);
  eq('délai décimal arrondi', setDelay('s3', 7.4, rec.emit), 7);
  check('les appareils sont prévenus du changement', rec.names('live:video-delay').length === 4);
  dispose('s3');
}

console.log('\n== Le délai laisse le temps de coder ==');
{
  const rec = recorder();
  cameraStarted('s4', { mimeType: 'video/webm', delay: 2, emit: rec.emit });
  writeChunk('s4', chunk(8));
  await wait(400);
  eq('rien à 0,4 s avec 2 s de retard', rec.names('live:video-ready').length, 0);
  setDelay('s4', 0, rec.emit);
  await wait(REPLAY_TICK_MS * 2);
  eq('réduire le délai libère immédiatement le buffer', rec.names('live:video-ready').length, 1);
  dispose('s4');
}

console.log('\n== Buffer borné : les lecteurs sont prévenus ==');
{
  const rec = recorder();
  cameraStarted('s5', { mimeType: 'video/webm', delay: 60, emit: rec.emit });
  const big = Buffer.alloc(1024 * 1024, 7); // 1 Mio
  const writes = Math.ceil(MAX_BUFFER_BYTES / big.length) + 5; // dépasse la capacité
  for (let i = 0; i < writes; i += 1) writeChunk('s5', Buffer.from(big));
  check('la mémoire reste bornée', bufferedBytes('s5') <= MAX_BUFFER_BYTES, `${bufferedBytes('s5')} octets`);
  check('un trou est signalé aux lecteurs', rec.names('live:video-gap').length > 0);
  eq('le morceau garde son numéro de séquence', rec.names('live:video-gap')[0].payload.dropped > 0, true);
  cameraStopped('s5');
  eq('arrêter la caméra vide le buffer', bufferedBytes('s5'), 0);
  dispose('s5');
}

console.log('\n== Arrêt et libération ==');
{
  const rec = recorder();
  cameraStarted('s6', { mimeType: 'video/webm', delay: 0, emit: rec.emit });
  writeChunk('s6', chunk(8));
  cameraStopped('s6');
  check('caméra signalée inactive', !isCameraActive('s6'));
  eq('les appareils sont prévenus de l’arrêt', rec.names('live:camera-left').length, 1);
  eq('le buffer est vidé', bufferedBytes('s6'), 0);

  rec.reset();
  writeChunk('s6', chunk(8));
  await wait(REPLAY_TICK_MS * 3);
  eq('plus rien n’est rediffusé après l’arrêt', rec.names('live:video-ready').length, 0);

  dispose('s6');
  eq('après libération : état par défaut', streamState('s6'), {
    cameraActive: false,
    delay: DEFAULT_DELAY_S,
    mimeType: '',
    hasInit: false,
  });
}

console.log('\n== En-tête du flux (appareil qui rejoint en cours de match) ==');
{
  const rec = recorder();
  cameraStarted('s8', { mimeType: 'video/webm;codecs=vp8', delay: 30, emit: rec.emit });
  check('aucun en-tête avant le premier morceau', initChunk('s8') === null);
  eq('état : pas encore d’en-tête', streamState('s8').hasInit, false);

  const first = Buffer.from([1, 1, 1, 1]);
  writeChunk('s8', first, 'video/webm;codecs=vp8');
  const init = initChunk('s8');
  check('l’en-tête est disponible', !!init);
  eq('il s’agit bien du premier morceau', init.seq, 1);
  eq('son contenu est intact', init.data.equals(first), true);
  eq('le type MIME l’accompagne', init.mimeType, 'video/webm;codecs=vp8');
  eq('état : en-tête disponible', streamState('s8').hasInit, true);

  // Les morceaux suivants ne remplacent pas l'en-tête.
  writeChunk('s8', Buffer.from([2, 2]), 'video/webm;codecs=vp8');
  eq('l’en-tête reste le premier morceau', initChunk('s8').seq, 1);
  eq('son contenu ne change pas', initChunk('s8').data.equals(first), true);

  // Il survit à la rediffusion (il est retiré de la file d'attente).
  await wait(REPLAY_TICK_MS * 2);
  eq('l’en-tête survit à la rediffusion', initChunk('s8').seq, 1);

  cameraStopped('s8');
  check('plus d’en-tête quand la caméra s’arrête', initChunk('s8') === null);

  // Une nouvelle diffusion repart d'un nouvel en-tête.
  cameraStarted('s8', { mimeType: 'video/webm', delay: 0, emit: rec.emit });
  check('aucun en-tête pour le nouveau flux', initChunk('s8') === null);
  writeChunk('s8', Buffer.from([9, 9, 9]), 'video/webm');
  eq('le nouvel en-tête est le nouveau premier morceau', initChunk('s8').seq, 1);
  eq('sa taille est correcte', initChunk('s8').data.length, 3);
  dispose('s8');
}

console.log('\n== Une seule caméra par session ==');
{
  const rec = recorder();
  cameraStarted('s7', { mimeType: 'video/webm', delay: 0, emit: rec.emit });
  writeChunk('s7', chunk(8));
  // Une seconde caméra démarre : le flux repart de zéro, sans mélange.
  const rec2 = recorder();
  cameraStarted('s7', { mimeType: 'video/mp4', delay: 5, emit: rec2.emit });
  eq('buffer remis à zéro', bufferedBytes('s7'), 0);
  eq('nouveau type MIME', streamState('s7').mimeType, 'video/mp4');
  eq('nouveau délai', streamState('s7').delay, 5);
  eq('compteur d’images neuf', rec2.names('live:camera-joined').length, 1);
  dispose('s7');
}

console.log(`\n${failures === 0 ? 'OK' : 'ÉCHEC'} — ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);