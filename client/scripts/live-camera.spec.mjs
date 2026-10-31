// Vérifie la capture et la lecture du flux caméra (client/src/services/
// liveCamera.js et liveCameraPlayer.js) : choix du format vidéo, bornage du
// délai, transport des morceaux binaires, lecture MediaSource différée et
// cohérence avec le buffer serveur (server/src/liveStream.js).
//
// Exécution : node client/scripts/live-camera.spec.mjs
import {
  CAMERA_MIME_CANDIDATES,
  CHUNK_INTERVAL_MS,
  DEFAULT_DELAY_S,
  DELAY_CHOICES,
  cameraConstraints,
  clampDelay,
  pickCameraMimeType,
  recorderSupports,
  sourceSupports,
} from '../src/services/liveCamera.js';
import { chunkToBytes, createCameraPlayer } from '../src/services/liveCameraPlayer.js';
import serverStream from '../../server/src/liveStream.js';

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
  check(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `attendu ${JSON.stringify(expected)} — obtenu ${JSON.stringify(actual)}`
  );

console.log('\n== Format vidéo : ce que le téléphone envoie et ce que le PC lit ==');
check('le VP8 est proposé en premier', CAMERA_MIME_CANDIDATES[0].startsWith('video/webm'), CAMERA_MIME_CANDIDATES[0]);
check('le MP4 est proposé (Safari)', CAMERA_MIME_CANDIDATES.some((m) => m.startsWith('video/mp4')));
check('au moins 3 formats testés', CAMERA_MIME_CANDIDATES.length >= 3);
check('envoi fréquent des morceaux (≤ 500 ms)', CHUNK_INTERVAL_MS > 0 && CHUNK_INTERVAL_MS <= 500, String(CHUNK_INTERVAL_MS));

globalThis.window = {
  MediaRecorder: { isTypeSupported: (t) => t.startsWith('video/webm') },
  MediaSource: { isTypeSupported: (t) => t.startsWith('video/webm') || t.startsWith('video/mp4') },
};
check('le navigateur sait enregistrer le WebM', recorderSupports('video/webm;codecs=vp8'));
check('le navigateur sait lire le WebM', sourceSupports('video/webm;codecs=vp8'));
eq('format commun retenu', pickCameraMimeType(), 'video/webm;codecs=vp8');

globalThis.window.MediaRecorder.isTypeSupported = () => false;
eq('aucun format commun → chaîne vide', pickCameraMimeType(), '');
globalThis.window.MediaRecorder.isTypeSupported = (t) => t.startsWith('video/mp4');
globalThis.window.MediaSource.isTypeSupported = (t) => t.startsWith('video/mp4');
eq('repli sur le MP4 quand le WebM est absent', pickCameraMimeType(), 'video/mp4;codecs=avc1.42E01E');

// iOS Safari (rôle caméra sans window.MediaSource)
delete globalThis.window.MediaSource;
eq('iOS Safari sans MediaSource choisit quand même le format supporté par MediaRecorder', pickCameraMimeType(), 'video/mp4;codecs=avc1.42E01E');

console.log('\n== Contraintes de capture ==');
const constraints = cameraConstraints();
check('pas de son', constraints.audio === false);
check('caméra arrière du téléphone par défaut', JSON.stringify(constraints.video.facingMode) === JSON.stringify({ ideal: 'environment' }));
check('résolution 720p demandée', constraints.video.height.ideal === 720 && constraints.video.width.ideal === 1280);
check('cadence plafonnée à 30 i/s', constraints.video.frameRate.max === 30);
const usbConstraints = cameraConstraints('usb-capture-card-01');
eq('sélection d’une source USB/HDMI par deviceId', usbConstraints.video.deviceId, { exact: 'usb-capture-card-01' });

console.log('\n== Délai : mêmes règles des deux côtés ==');
eq('même délai par défaut que le serveur', DEFAULT_DELAY_S, serverStream.DEFAULT_DELAY_S);
eq('même liste de délais que le serveur', DELAY_CHOICES, serverStream.DELAY_CHOICES);
eq('délai négatif → 0', clampDelay(-5), 0);
eq('délai démesuré → 60 s', clampDelay(600), 60);
eq('délai illisible → défaut', clampDelay('xyz'), DEFAULT_DELAY_S);
eq('délai décimal arrondi', clampDelay(7.6), 8);
eq('chaque délai proposé est accepté tel quel', DELAY_CHOICES.map((s) => clampDelay(s)), DELAY_CHOICES);

console.log('\n== Transport des morceaux binaires ==');
eq('Uint8Array transmis tel quel', Array.from(chunkToBytes(new Uint8Array([1, 2, 3]))), [1, 2, 3]);
eq('ArrayBuffer converti', Array.from(chunkToBytes(new Uint8Array([4, 5]).buffer)), [4, 5]);
const view = new DataView(new Uint8Array([7, 8, 9]).buffer);
eq('vue typée convertie', Array.from(chunkToBytes(view)), [7, 8, 9]);
eq('chaîne base64 convertie', Array.from(chunkToBytes('QUI=')), [65, 66]);
check('morceau absent → rien', chunkToBytes(null) === null);
check('objet inconnu → rien', chunkToBytes(42) === null);
check('chaîne invalide → rien', chunkToBytes('!!!pas-du-base64!!!') === null);
console.log('\n== Lecture différée (MediaSource simulé) ==');
{
  const appended = [];
  const removed = [];
  let endOfStreamCalls = 0;
  let createdUrls = 0;
  let revokedUrls = 0;

  class FakeSourceBuffer {
    constructor() {
      this.updating = false;
      this.mode = 'segments';
      this.ranges = [];
      this.listeners = {};
      this.failNext = false;
    }
    get buffered() {
      const ranges = this.ranges;
      return { length: ranges.length, start: (i) => ranges[i][0], end: (i) => ranges[i][1] };
    }
    addEventListener(ev, fn) { this.listeners[ev] = fn; }
    // Le vrai SourceBuffer prévient la fin de l'opération par `updateend` :
    // c'est cet événement qui fait avancer la file des morceaux.
    fireUpdateEnd() { if (this.listeners.updateend) this.listeners.updateend(); }
    appendBuffer(data) {
      if (this.failNext) { this.failNext = false; throw new Error('QuotaExceededError'); }
      appended.push(data.length);
      this.fireUpdateEnd();
    }
    remove(a, b) {
      removed.push([a, b]);
      // Les données purgées ne sont plus « buffered » : on tient compte de la
      // suppression pour éviter que le lecteur ne purge en boucle.
      if (this.ranges.length) this.ranges = [[b, this.ranges[this.ranges.length - 1][1]]];
      this.fireUpdateEnd();
    }
  }

  class FakeMediaSource {
    static instances = [];
    constructor() {
      this.readyState = 'closed';
      this.sourceBuffers = [];
      this.listeners = {};
      FakeMediaSource.instances.push(this);
    }
    addEventListener(ev, fn) {
      this.listeners[ev] = fn;
      if (ev === 'sourceopen') { this.readyState = 'open'; fn(); }
    }
    addSourceBuffer(type) {
      this.lastType = type;
      const sb = new FakeSourceBuffer();
      this.sourceBuffers.push(sb);
      return sb;
    }
    endOfStream() { endOfStreamCalls += 1; this.readyState = 'ended'; }
  }

  globalThis.window.MediaSource = FakeMediaSource;
  globalThis.URL = {
    createObjectURL: () => { createdUrls += 1; return `blob:cam-${createdUrls}`; },
    revokeObjectURL: () => { revokedUrls += 1; },
  };

  const video = {
    currentTime: 0,
    paused: false,
    playCalled: false,
    src: null,
    play() { this.playCalled = true; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute() { this.src = null; },
    load() {},
  };

  const messages = [];
  const player = createCameraPlayer(video, (text, ok) => messages.push({ text, ok }));

  // --- Arrivée en cours de match : les morceaux attendent l'en-tête du flux ---
  player.push(new Uint8Array([1, 2, 3]), 'video/webm;codecs=vp8', 2);
  eq('aucune source tant que l’en-tête manque', FakeMediaSource.instances.length, 0);
  eq('aucun morceau poussé sans en-tête', appended.length, 0);

  player.push(new Uint8Array([4, 5, 6, 7]), 'video/webm;codecs=vp8', 3);
  eq('les morceaux s’accumulent en attendant', appended.length, 0);

  // Le serveur renvoie l'en-tête : la lecture peut démarrer.
  player.pushInit(new Uint8Array([9, 9]), 'video/webm;codecs=vp8');
  const ms = FakeMediaSource.instances.at(-1);
  eq('une source MediaSource est créée', FakeMediaSource.instances.length, 1);
  eq('le format du flux est respecté', ms.lastType, 'video/webm;codecs=vp8');
  eq('l’en-tête passe en premier, puis les morceaux en attente', appended, [2, 3, 4]);
  check('le lecteur démarre tout seul', video.playCalled);
  eq('la vidéo est muette (obligatoire pour l’autoplay)', video.muted, true);
  check('une URL d’objet est créée', createdUrls === 1);

  // Si seq=1 arrive une seconde fois (après pushInit), il est dédupliqué
  player.push(new Uint8Array([9, 9]), 'video/webm;codecs=vp8', 1);
  eq('le morceau seq=1 déjà reçu par pushInit est dédupliqué', appended, [2, 3, 4]);

  player.push(new Uint8Array([8]), 'video/webm;codecs=vp8', 4);
  eq('les morceaux suivants s’enchaînent', appended, [2, 3, 4, 1]);
  eq('une seule source pour le flux', FakeMediaSource.instances.length, 1);

  // Trous du flux : la tête de lecture bloquée derrière un trou saute au direct.
  const sb = ms.sourceBuffers[0];
  sb.ranges = [[0, 0.25], [30, 30.5]];
  video.currentTime = 0.1;
  const gapsBefore = player.gapCount();
  player.push(new Uint8Array([5]), 'video/webm;codecs=vp8', 5);
  eq('la tête de lecture franchit le trou', video.currentTime, 30);
  eq('le trou est compté', player.gapCount(), gapsBefore + 1);
  eq('le morceau est quand même poussé', appended[appended.length - 1], 1);

  // Retard lu : écart entre la tête de lecture et la fin du flux.
  sb.ranges = [[0, 30.5]];
  video.currentTime = 29.3;
  check('retard lu ≈ 1,2 s', Math.abs(player.latency() - 1.2) < 0.05, String(player.latency()));

  // Contrôles DVR : seekRelative, jumpToLive, togglePause
  check('seekRelative(-5) réussit', player.seekRelative(-5) === true);
  check('seekRelative(-5) recule de 5s dans le buffer', Math.abs(video.currentTime - 24.3) < 0.05, String(video.currentTime));
  check('jumpToLive() réussit', player.jumpToLive() === true);
  check('jumpToLive() ramène près du bord du direct', Math.abs(video.currentTime - 30.35) < 0.05, String(video.currentTime));
  eq('togglePause() met en pause', player.togglePause(), true);
  eq('togglePause() relance la lecture', player.togglePause(), false);

  // Mémoire bornée : les données déjà vues sont libérées pendant le match.
  const removedBefore = removed.length;
  sb.ranges = [[0, 120]];
  video.currentTime = 100;
  player.push(new Uint8Array([6]), 'video/webm;codecs=vp8', 6);
  eq('le passé est purgé', removed.length, removedBefore + 1);
  eq('seules les images non vues sont conservées', removed[removed.length - 1], [0, 98]);
  eq('le morceau est tout de même poussé', appended[appended.length - 1], 1);

  // Buffer saturé : le morceau fautif est écarté et le lecteur se resynchronise.
  sb.failNext = true;
  player.push(new Uint8Array([7]), 'video/webm;codecs=vp8', 7);
  eq('un trou est compté', player.gapCount(), gapsBefore + 2);
  eq('le buffer est vidé', removed.length, removedBefore + 2);
  player.push(new Uint8Array([9]), 'video/webm;codecs=vp8', 8);
  eq('le flux reprend après le trou', appended[appended.length - 1], 1);

  // Nouvelle caméra : on repart de zéro, et si seq=1 arrive par push() sans pushInit,
  // le lecteur démarre automatiquement.
  player.reset();
  check('l’URL de l’ancien flux est libérée', revokedUrls === 1);
  eq('la source est refermée', ms.readyState, 'ended');
  player.push(new Uint8Array([2, 2]), 'video/webm;codecs=vp8', 1);
  eq('une nouvelle source est créée automatiquement sur seq=1', FakeMediaSource.instances.length, 2);
  eq('le premier morceau seq=1 est poussé comme en-tête', appended[appended.length - 1], 2);

  // Fin du flux.
  player.end();
  check('fin de flux annoncée au lecteur', endOfStreamCalls >= 2, String(endOfStreamCalls));
  player.destroy();
  eq('l’URL de la nouvelle source est libérée', revokedUrls, 2);
  check('aucun message d’erreur pendant la lecture', messages.filter((m) => !m.ok).length === 0, JSON.stringify(messages));
}

console.log('\n== MediaSource avec sourceopen asynchrone (comportement réel des navigateurs) ==');
{
  const appendedAsync = [];
  class AsyncMediaSource {
    constructor() {
      this.readyState = 'closed';
      this.listeners = {};
    }
    addEventListener(ev, fn) {
      this.listeners[ev] = fn;
      // Dans Chrome/Firefox/Edge/Safari, sourceopen est déclenché de façon asynchrone
      if (ev === 'sourceopen') {
        setTimeout(() => {
          this.readyState = 'open';
          fn();
        }, 5);
      }
    }
    addSourceBuffer() {
      return {
        updating: false,
        mode: 'segments',
        buffered: { length: 0, start: () => 0, end: () => 0 },
        listeners: {},
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        appendBuffer(data) {
          appendedAsync.push(data.length);
          if (this.listeners.updateend) this.listeners.updateend();
        },
        remove() {},
      };
    }
    endOfStream() { this.readyState = 'ended'; }
  }

  globalThis.window.MediaSource = AsyncMediaSource;
  const video = {
    currentTime: 0,
    src: null,
    play() { return Promise.resolve(); },
    removeAttribute() { this.src = null; },
    load() {},
  };
  const player = createCameraPlayer(video);
  player.pushInit(new Uint8Array([10, 20, 30]), 'video/webm;codecs=vp8');
  player.push(new Uint8Array([40, 50]), 'video/webm;codecs=vp8', 2);
  eq('avant sourceopen : les morceaux sont gardés en file d’attente', appendedAsync.length, 0);
  await new Promise((r) => setTimeout(r, 20));
  eq('après sourceopen asynchrone : l’en-tête et le morceau suivant sont bien décodés', appendedAsync, [3, 2]);
  player.destroy();
}

console.log('\n== Navigateur sans MediaSource ==');
{
  delete globalThis.window.MediaSource;
  const messages = [];
  const player = createCameraPlayer({}, (text, ok) => messages.push({ text, ok }));
  player.pushInit(new Uint8Array([1]), 'video/webm');
  eq('un message explique le problème', messages.length, 1);
  check('le message est une erreur', messages[0].ok === false);
  check('la lecture n’a pas planté', player.latency() === 0);
  player.destroy();
}

console.log('\n== Capture sur le téléphone (API média simulée) ==');
{
  const stopped = [];
  const fakeStream = {
    getTracks: () => [{ stop() { stopped.push('track'); } }],
  };

  class FakeRecorder {
    static instances = [];
    static isTypeSupported = () => true;
    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || '';
      this.options = options;
      this.state = 'inactive';
      FakeRecorder.instances.push(this);
    }
    start(timeslice) { this.state = 'recording'; this.timeslice = timeslice; }
    stop() { this.state = 'inactive'; }
    push(bytes) {
      return this.ondataavailable({ data: { size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer } });
    }
  }

  globalThis.window = {
    MediaRecorder: FakeRecorder,
    MediaSource: { isTypeSupported: () => true },
    isSecureContext: true,
  };
  // Node définit un `navigator` en lecture seule : on le remplace proprement.
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => fakeStream } },
    configurable: true,
    writable: true,
  });

  const { startCameraCapture, cameraSupported } = await import('../src/services/liveCamera.js');
  check('l’appareil est jugé capable de filmer', cameraSupported());

  const socket = { emitted: [], emit(event, payload) { this.emitted.push([event, payload]); } };
  const statuses = [];
  let previewed = null;

  const capture = await startCameraCapture({
    socket,
    sessionId: 'session-1',
    delay: 8,
    onStream: (s) => { previewed = s; },
    onStatus: (text, ok) => statuses.push({ text, ok }),
  });

  const recorder = FakeRecorder.instances.at(-1);
  eq('le démarrage est annoncé au serveur', socket.emitted[0][0], 'live:camera-start');
  eq('la session est transmise', socket.emitted[0][1].sessionId, 'session-1');
  eq('le délai voulu est transmis', socket.emitted[0][1].delay, 8);
  check('un format vidéo est transmis', String(socket.emitted[0][1].mimeType).startsWith('video/'), socket.emitted[0][1].mimeType);
  check('l’aperçu local reçoit le flux', previewed === fakeStream);
  eq('l’enregistreur est lancé', recorder.state, 'recording');
  eq('morceaux envoyés par petits paquets', recorder.timeslice, CHUNK_INTERVAL_MS);
  eq('la capture vise un débit raisonnable', recorder.options.videoBitsPerSecond, 2_500_000);
  check('le statut annonce la diffusion', statuses.some((s) => s.ok && /direct/i.test(s.text)), JSON.stringify(statuses));

  await recorder.push([1, 2, 3, 4]);
  await new Promise((r) => setImmediate(r));
  eq('le morceau est transmis au serveur', socket.emitted[1][0], 'live:video-chunk');
  eq('le morceau porte la session', socket.emitted[1][1].sessionId, 'session-1');
  eq('le morceau fait 4 octets', socket.emitted[1][1].data.byteLength, 4);

  capture.stop();
  eq('la caméra du téléphone est coupée', recorder.state, 'inactive');
  eq('la piste vidéo est libérée', stopped.length, 1);
  eq('l’arrêt est annoncé au serveur', socket.emitted[socket.emitted.length - 1][0], 'live:camera-stop');
  check('un statut signale l’arrêt', statuses.some((s) => !s.ok && /arrêt/i.test(s.text)));

  // Un morceau vide (fréquent chez MediaRecorder) ne doit rien envoyer.
  const before = socket.emitted.length;
  await recorder.push(new Uint8Array(0));
  await new Promise((r) => setImmediate(r));
  eq('un morceau vide est ignoré', socket.emitted.length, before);

  // Refus de l'utilisateur.
  globalThis.navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission refusée'); };
  let refused = null;
  try {
    await startCameraCapture({ socket, sessionId: 'session-1', delay: 0 });
  } catch (err) {
    refused = err;
  }
  check('un refus de caméra remonte une erreur claire', refused && /Permission refusée/.test(refused.message), String(refused));

  // Contexte non sécurisé : la capture doit être refusée avant toute demande.
  globalThis.window.isSecureContext = false;
  check('hors HTTPS la capture est refusée', cameraSupported() === false);
  let blocked = null;
  try {
    await startCameraCapture({ socket, sessionId: 'session-1' });
  } catch (err) {
    blocked = err;
  }
  check('le message explique le besoin de HTTPS', blocked && /HTTPS|autorisez/i.test(blocked.message), String(blocked));
  globalThis.window.isSecureContext = true;
}

console.log(`\n${failures === 0 ? 'OK' : 'ÉCHEC'} — ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
