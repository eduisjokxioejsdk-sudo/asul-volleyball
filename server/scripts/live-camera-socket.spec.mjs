// Vérifie le câblage Socket.IO du flux caméra de bout en bout : un téléphone
// (rôle caméra) annonce la diffusion, envoie des morceaux vidéo, et un PC les
// reçoit rediffusés dans l'ordre avec le bon délai (server/src/socket.js +
// server/src/liveStream.js).
//
// Exécution : node server/scripts/live-camera-socket.spec.mjs
import { createRequire } from 'node:module';

// Le serveur est écrit en CommonJS : on réutilise ses modules tels quels.
const require = createRequire(import.meta.url);
const http = require('http');
const { initSocket } = require('../src/socket');
const stream = require('../src/liveStream');

let ioClient;
try {
  // socket.io-client est installé avec le client (dépendance de test seulement).
  ({ io: ioClient } = require('../../client/node_modules/socket.io-client'));
} catch {
  console.log('socket.io-client absent : test d’intégration ignoré.');
  process.exit(0);
}

let failures = 0;
const check = (label, cond, detail = '') => {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SESSION_ID = require('crypto').randomUUID();
const bytes = () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

const server = http.createServer((req, res) => res.end('ok'));
const io = initSocket(server);

server.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  const camera = ioClient(url, { transports: ['websocket'] });
  const viewer = ioClient(url, { transports: ['websocket'] });

  const seen = [];
  viewer.on('live:camera-joined', (p) => seen.push({ event: 'joined', p }));
  viewer.on('live:video-ready', (p) => seen.push({ event: 'ready', p }));
  viewer.on('live:camera-left', () => seen.push({ event: 'left' }));
  viewer.on('live:video-delay', (p) => seen.push({ event: 'delay', p }));
  const of = (name) => seen.filter((e) => e.event === name);

  await new Promise((r) => camera.once('connect', r));
  await new Promise((r) => viewer.once('connect', r));

  console.log('\n== Rejoindre la session ==');
  viewer.emit('live:join', SESSION_ID);
  camera.emit('live:join', SESSION_ID);
  await wait(150);
  check('aucun flux tant que la caméra ne démarre pas', seen.length === 0, JSON.stringify(seen));

  console.log('\n== La caméra démarre ==');
  camera.emit('live:camera-start', { sessionId: SESSION_ID, mimeType: 'video/webm;codecs=vp8', delay: 0 });
  await wait(200);
  check('le lecteur apprend que la caméra est là', of('joined').length === 1);
  check('le format vidéo est transmis', of('joined')[0]?.p.mimeType === 'video/webm;codecs=vp8', JSON.stringify(of('joined')[0]));
  check('le délai demandé est transmis', of('joined')[0]?.p.delay === 0, JSON.stringify(of('joined')[0]));
  check('le serveur accuse réception', stream.isCameraActive(SESSION_ID));

  console.log('\n== Morceaux vidéo ==');
  for (let i = 0; i < 3; i += 1) {
    camera.emit('live:video-chunk', { sessionId: SESSION_ID, data: bytes().buffer, mimeType: 'video/webm;codecs=vp8' });
  }
  await wait(600);
  check('les 3 morceaux arrivent au lecteur', of('ready').length === 3, String(of('ready').length));
  check('les morceaux arrivent dans l’ordre', of('ready').map((e) => e.p.seq).join(',') === '1,2,3', of('ready').map((e) => e.p.seq).join(','));
  check(
    'le contenu binaire traverse intact',
    of('ready').every((e) => Buffer.from(e.p.data).equals(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])))
  );

  console.log('\n== Délai de rediffusion ==');
  viewer.emit('live:video-delay', { sessionId: SESSION_ID, delay: 12 });
  camera.emit('live:video-delay', { sessionId: SESSION_ID, delay: 12 });
  await wait(200);
  check('un événement socket ne peut pas détourner le délai', stream.streamState(SESSION_ID).delay === 0, String(stream.streamState(SESSION_ID).delay));
  stream.setDelay(SESSION_ID, 12, (event, payload) => io.to(`live:${SESSION_ID}`).emit(event, payload));
  await wait(200);
  check('le délai réglé par l’API est diffusé à tous', of('delay').length === 1 && of('delay')[0].p.delay === 12, JSON.stringify(of('delay')));

  console.log('\n== Arrivée tardive ==');
  const latecomer = ioClient(url, { transports: ['websocket'] });
  const late = [];
  latecomer.on('live:camera-joined', (p) => late.push(p));
  const lateInit = [];
  latecomer.on('live:video-init', (p) => lateInit.push(p));
  await new Promise((r) => latecomer.once('connect', r));
  latecomer.emit('live:join', SESSION_ID);
  await wait(300);
  check('un nouvel appareil voit la caméra active et le délai', late.length === 1 && late[0].delay === 12, JSON.stringify(late));
  check('il ne reçoit pas l’en-tête sans le demander', lateInit.length === 0, JSON.stringify(lateInit));

  // C'est l'affichage de la vidéo qui réclame l'en-tête du flux.
  latecomer.emit('live:camera-state', SESSION_ID);
  await wait(200);
  check('l’en-tête du flux est renvoyé sur demande', lateInit.length === 1, String(lateInit.length));
  check('il s’agit du premier morceau', lateInit[0]?.seq === 1, JSON.stringify(lateInit[0] && { seq: lateInit[0].seq }));
  check('son contenu est intact', Buffer.from(lateInit[0].data).equals(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])));
  latecomer.disconnect();

  console.log('\n== Arrêt ==');
  camera.emit('live:camera-stop', { sessionId: SESSION_ID });
  await wait(200);
  check('l’arrêt est annoncé', of('left').length === 1);
  check('le serveur libère le flux', !stream.isCameraActive(SESSION_ID));

  console.log('\n== Déconnexion brutale du téléphone ==');
  camera.emit('live:camera-start', { sessionId: SESSION_ID, mimeType: 'video/webm', delay: 0 });
  await wait(150);
  camera.disconnect();
  await wait(250);
  check('la caméra disparue est annoncée', of('left').length === 2, String(of('left').length));

  const before = of('ready').length;
  viewer.emit('live:video-chunk', { sessionId: SESSION_ID, data: bytes().buffer });
  await wait(400);
  check('plus aucun morceau rediffusé après l’arrêt', of('ready').length === before);

  viewer.disconnect();
  stream.dispose(SESSION_ID);
  io.close();
  server.close();
  console.log(`\n${failures === 0 ? 'OK' : 'ÉCHEC'} — ${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
});