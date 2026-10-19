// ============================================================================
// Test d'intégration : export de clips MP4 d'une playlist de séance.
//
// Le script :
//   • génère une petite vidéo de test avec ffmpeg (30 s, mire + son) ;
//   • démarre un vrai serveur ASUL (dossier de données temporaire) ;
//   • crée une playlist de 3 actions réparties sur 2 joueurs / 2 postes ;
//   • lance un export « un fichier par joueur et par poste » + un clip par
//     action, suit l'avancement, puis télécharge le ZIP et vérifie son contenu ;
//   • vérifie aussi le mode « coupes précises » et les refus (playlist vide,
//     groupement inconnu, export inconnu).
//
// Exécution : node server/scripts/clip-export-e2e.mjs
// (nécessite ffmpeg : embarqué dans desktop/resources/ffmpeg ou dans le PATH)
// ============================================================================

import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(SCRIPT_DIR, '..');
const FFMPEG_BIN = fs.existsSync(path.join(SERVER_DIR, '..', 'desktop', 'resources', 'ffmpeg', 'ffmpeg.exe'))
  ? path.join(SERVER_DIR, '..', 'desktop', 'resources', 'ffmpeg', 'ffmpeg.exe')
  : 'ffmpeg';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `attendu ${e} — obtenu ${a}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, probe, timeoutMs = 30000, stepMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(stepMs);
  }
  check(label, false, `délai dépassé (dernier résultat : ${JSON.stringify(last)})`);
  return null;
}

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Appel HTTP vers le serveur ASUL ; ne lève jamais (renvoie le statut). */
async function asul(base, route, { method = 'GET', token, body } = {}) {
  try {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: response.status, data };
  } catch (err) {
    const cause = err.cause && err.cause.message ? ` (${err.cause.message})` : '';
    return { status: 0, data: null, error: `${err.message}${cause}` };
  }
}

// ---------------------------------------------------------------------------
// Vidéo de test, serveur, données
// ---------------------------------------------------------------------------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-clips-'));
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const videoPath = path.join(uploadsDir, 'test.mp4');
let child = null;

/** Appel direct du binaire ffmpeg (mêmes arguments que la ligne de commande). */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, { timeout: 180000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg : ${err.message}\n${String(stderr || '').slice(-400)}`));
      else resolve(stdout);
    });
  });
}

/** Génère une vidéo de 30 s (mire + son) : la source des extraits. */
function generateVideo() {
  return runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=30:size=320x240:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    videoPath,
  ]);
}

function startServer(port) {
  child = spawn(process.execPath, [path.join(SERVER_DIR, 'src', 'index.js')], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      CLIENT_DIST: path.join(SERVER_DIR, '..', 'client', 'dist'),
      ...(FFMPEG_BIN !== 'ffmpeg' ? { FFMPEG_PATH: FFMPEG_BIN } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  return logs;
}

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

/** Insère la vidéo de test et deux actions codées (pour /sources). */
async function seedMatch(userId) {
  const db = new sqlite3.Database(path.join(dataDir, 'asul.db'));
  const now = new Date().toISOString();
  const video = await run(
    db,
    `INSERT INTO videos (user_id, filename, original_name, filepath, team1_name, team2_name, status, sync_uuid, dirty, deleted, local_updated_at)
     VALUES (?, 'test.mp4', 'R1 ASUL vs Nantes.mp4', ?, 'ASUL', 'Nantes', 'uploaded', 'uuid-match-1', 1, 0, ?)`,
    [userId, videoPath, now]
  );
  await run(
    db,
    `INSERT INTO volley_actions (video_id, action_index, code, timecode, team, player_number, action, evaluation, start_zone, set_number)
     VALUES (?, 0, '*04S+', 2, 'home', 4, 'S', '+', '1', 1)`,
    [video.lastID]
  );
  await run(
    db,
    `INSERT INTO volley_actions (video_id, action_index, code, timecode, team, player_number, action, evaluation, start_zone, set_number)
     VALUES (?, 1, 'a08A4#', 6, 'away', 8, 'A', '#', '4', 1)`,
    [video.lastID]
  );
  await new Promise((resolve) => db.close(resolve));
  return video.lastID;
}

/** Entrée de playlist (extraite de la vidéo de test). */
function item(videoId, overrides = {}) {
  return {
    id: `pl_${Math.random().toString(36).slice(2, 8)}`,
    position: 1,
    video_id: videoId,
    video_uuid: 'uuid-match-1',
    video_label: 'R1 ASUL vs Nantes.mp4',
    video_filename: 'test.mp4',
    team1_name: 'ASUL',
    team2_name: 'Nantes',
    team: 'away',
    team_label: 'Nantes',
    player_number: 4,
    player_name: 'Martin',
    set_number: 1,
    point_number: 1,
    action_code: '*04AX1#',
    action: 'A',
    evaluation: '#',
    start_zone: '4',
    poste: '4',
    scope: 'action',
    lead_in: 4,
    lead_out: 3,
    segment_start: 2,
    segment_end: 7,
    note: '',
    ...overrides,
  };
}

console.log('\n== Préparation ==');
await generateVideo();
check(
  'vidéo de test générée',
  fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1000,
  `${fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0} octets`
);

const port = await freePort();
const logs = startServer(port);
const base = `http://127.0.0.1:${port}`;
const ready = await waitFor('serveur prêt', async () => (await asul(base, '/api/health')).status === 200);
if (!ready) console.log(logs.join(''));

const auth = await asul(base, '/api/auth/register', {
  method: 'POST',
  body: { email: 'coach@asul.test', password: 'motdepasse', name: 'Coach' },
});
check('compte créé', auth.status === 201 && !!auth.data?.token, `statut ${auth.status}`);
const token = auth.data.token;
const videoId = await seedMatch(auth.data.user.id);
check('match codé inséré', Number.isInteger(videoId) && videoId > 0, `id ${videoId}`);

console.log('\n== Playlist de séance ==');
const playlistItems = [
  item(videoId, { id: 'pl_1', player_number: 4, player_name: 'Martin', poste: '4', segment_start: 2, segment_end: 7 }),
  item(videoId, { id: 'pl_2', player_number: 4, player_name: 'Martin', poste: '4', segment_start: 9, segment_end: 14 }),
  item(videoId, { id: 'pl_3', player_number: 8, player_name: 'Paul', poste: 'arriere', action_code: 'a08A8#', segment_start: 16, segment_end: 21 }),
];
const created = await asul(base, '/api/playlists', {
  method: 'POST',
  token,
  body: { name: 'Séance n°4', items: playlistItems },
});
eq('playlist créée', created.status, 201);
const playlistId = created.data.playlist.id;

console.log('\n== Export « un fichier par joueur et par poste » ==');
const started = await asul(base, `/api/playlists/${playlistId}/export`, {
  method: 'POST',
  token,
  body: { groupBy: 'player-poste', mode: 'copy', includeClips: true },
});
eq('export accepté', started.status, 202);
const jobId = started.data?.job?.jobId;
check('identifiant d’export reçu', typeof jobId === 'string' && jobId.length > 0);

const finished = await waitFor(
  'export terminé',
  async () => {
    const res = await asul(base, `/api/playlists/exports/${jobId}`, { token });
    if (res.status !== 200) return null;
    return res.data.job.state === 'running' ? null : res.data.job;
  },
  60000,
  400
);
eq('état final', finished?.state, 'done');
eq('avancement à 100 %', finished?.progress, 100);
const names = (finished?.files || []).map((file) => file.name);
check(
  'un fichier par joueur × poste',
  names.includes('n04_Martin_poste4.mp4') && names.includes('n08_Paul_arriere.mp4'),
  names.join(', ')
);
check('un clip par action', names.filter((name) => name.startsWith('clips/')).length === 3, names.join(', '));
check('feuille de séance incluse', names.includes('feuille_de_seance.csv'));
check('tous les fichiers ont une taille', (finished?.files || []).every((file) => file.size > 0));
check('aucune action ignorée', (finished?.skipped || []).length === 0);

console.log('\n== Téléchargement du ZIP ==');
const zipRes = await fetch(`${base}/api/playlists/exports/${jobId}/download`);
const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
eq('téléchargement accepté', zipRes.status, 200);
check('archive ZIP', zipBuffer.subarray(0, 2).toString('latin1') === 'PK', zipBuffer.subarray(0, 4).toString('hex'));
check('archive non vide', zipBuffer.length > 1000, `${zipBuffer.length} octets`);
check(
  'clips présents dans l’archive',
  zipBuffer.includes('n04_Martin_poste4.mp4') && zipBuffer.includes('clips/001_n04_Martin_poste4_04AX1.mp4')
);
check('feuille de séance dans l’archive', zipBuffer.includes('feuille_de_seance.csv'));

console.log('\n== Coupes précises ==');
const precisePlaylist = await asul(base, '/api/playlists', {
  method: 'POST',
  token,
  body: { name: 'Précis', items: [item(videoId, { id: 'pl_9', segment_start: 10, segment_end: 11.5 })] },
});
const preciseStart = await asul(base, `/api/playlists/${precisePlaylist.data.playlist.id}/export`, {
  method: 'POST',
  token,
  body: { groupBy: 'playlist', mode: 'precise' },
});
eq('export précis accepté', preciseStart.status, 202);
const preciseDone = await waitFor(
  'export précis terminé',
  async () => {
    const res = await asul(base, `/api/playlists/exports/${preciseStart.data.job.jobId}`, { token });
    return res.data?.job?.state === 'running' ? null : res.data?.job;
  },
  120000,
  500
);
eq('état final (précis)', preciseDone?.state, 'done');
check(
  'fichier produit',
  (preciseDone?.files || []).some((file) => file.name === 'playlist.mp4'),
  (preciseDone?.files || []).map((file) => file.name).join(', ')
);

console.log('\n== Refus ==');
const emptyPlaylist = await asul(base, '/api/playlists', {
  method: 'POST',
  token,
  body: { name: 'Vide', items: [] },
});
const emptyExport = await asul(base, `/api/playlists/${emptyPlaylist.data.playlist.id}/export`, {
  method: 'POST',
  token,
  body: { groupBy: 'playlist', mode: 'copy' },
});
eq('playlist vide refusée', emptyExport.status, 400);
const badGroup = await asul(base, `/api/playlists/${playlistId}/export`, {
  method: 'POST',
  token,
  body: { groupBy: 'nimporte' },
});
eq('groupement inconnu refusé', badGroup.status, 400);
const badMode = await asul(base, `/api/playlists/${playlistId}/export`, {
  method: 'POST',
  token,
  body: { mode: 'turbo' },
});
eq('mode inconnu refusé', badMode.status, 400);
const unknownJob = await asul(base, '/api/playlists/exports/inconnu', { token });
eq('export inconnu', unknownJob.status, 404);

console.log('\n== Abandon d’un export ==');
const toCancel = await asul(base, `/api/playlists/${playlistId}/export`, {
  method: 'POST',
  token,
  body: { groupBy: 'player', mode: 'precise', includeClips: true },
});
const cancelled = await asul(base, `/api/playlists/exports/${toCancel.data.job.jobId}`, {
  method: 'DELETE',
  token,
});
eq('abandon accepté', cancelled.status, 200);
eq('export retiré', cancelled.data?.removed, true);

try {
  child.kill();
} catch {
  /* processus déjà arrêté */
}
await sleep(800);
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* fichiers encore verrouillés sous Windows : le dossier temporaire restera */
}

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);



