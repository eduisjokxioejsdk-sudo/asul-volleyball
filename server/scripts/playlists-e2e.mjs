// ============================================================================
// Test d'intégration : playlists de séance (mode « Playlists »).
//
// Démarre un vrai serveur ASUL (dossier de données temporaire) puis vérifie de
// bout en bout : liste des matchs proposés au parcours (/sources), création,
// lecture, renommage, mise à jour des entrées, refus des saisies invalides et
// suppression (pierre tombale) d'une playlist.
//
// Exécution : node server/scripts/playlists-e2e.mjs
// ============================================================================

import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

import { playlistItemFromRally, normalizePlaylistItems, rallyPlaylist } from '../../client/src/utils/playlists.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(SCRIPT_DIR, '..');

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
// Serveur de test + données de match (vidéo + 2 actions codées)
// ---------------------------------------------------------------------------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-playlists-'));
let child = null;

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

/** Insère un match codé (sert de source au parcours d'actions). */
async function seedMatch(userId) {
  const db = new sqlite3.Database(path.join(dataDir, 'asul.db'));
  const now = new Date().toISOString();
  const video = await run(
    db,
    `INSERT INTO videos (user_id, filename, original_name, filepath, team1_name, team2_name, status, sync_uuid, dirty, deleted, local_updated_at)
     VALUES (?, 'match1.mp4', 'R1 ASUL vs Nantes.mp4', 'uploads/match1.mp4', 'ASUL', 'Nantes', 'uploaded', 'uuid-match-1', 1, 0, ?)`,
    [userId, now]
  );
  await run(
    db,
    `INSERT INTO volley_actions (video_id, action_index, code, timecode, team, player_number, action, evaluation, start_zone, set_number)
     VALUES (?, 0, '*04S+', 10, 'home', 4, 'S', '+', '1', 1)`,
    [video.lastID]
  );
  await run(
    db,
    `INSERT INTO volley_actions (video_id, action_index, code, timecode, team, player_number, action, evaluation, start_zone, set_number)
     VALUES (?, 1, 'a08A4#', 16, 'away', 8, 'A', '#', '4', 1)`,
    [video.lastID]
  );
  await new Promise((resolve) => db.close(resolve));
  return video.lastID;
}

/** Entrée de playlist telle que l'application l'enregistre. */
function item(overrides = {}) {
  return {
    id: 'pl_test_1',
    position: 1,
    video_id: 1,
    video_uuid: 'uuid-match-1',
    video_label: 'R1 ASUL vs Nantes.mp4',
    video_filename: 'match1.mp4',
    team1_name: 'ASUL',
    team2_name: 'Nantes',
    team: 'away',
    team_label: 'Nantes',
    player_number: 8,
    player_name: 'Martin',
    set_number: 1,
    point_number: 1,
    action_index: 1,
    action_code: 'a08A4#',
    action: 'A',
    evaluation: '#',
    start_zone: '4',
    end_zone: '5',
    poste: '4',
    scope: 'rally',
    lead_in: 4,
    lead_out: 3,
    segment_start: 6,
    segment_end: 19,
    note: '',
    ...overrides,
  };
}

const port = await freePort();
const logs = startServer(port);
const base = `http://127.0.0.1:${port}`;

const ready = await waitFor('serveur prêt', async () => (await asul(base, '/api/health')).status === 200);
if (!ready) console.log(logs.join(''));

const auth = await asul(base, '/api/auth/register', {
  method: 'POST',
  body: { email: 'coach@asul.test', password: 'motdepasse', name: 'Coach' },
});
check('compte créé', auth.status === 201 && !!auth.data?.token, `statut ${auth.status} ${JSON.stringify(auth.data)}`);
const token = auth.data.token;
const userId = auth.data.user.id;

const videoId = await seedMatch(userId);
check('match codé inséré', Number.isInteger(videoId) && videoId > 0, `id ${videoId}`);

console.log('\n== Matchs proposés au parcours ==');
const sources = await asul(base, '/api/playlists/sources', { token });
eq('liste des sources', sources.status, 200);
eq('1 match proposé', (sources.data?.sources || []).length, 1);
eq('compteur d’actions', Number(sources.data.sources[0].action_count), 2);
eq('fichier local signalé', sources.data.sources[0].filename, 'match1.mp4');

console.log('\n== Création et lecture ==');
const created = await asul(base, '/api/playlists', {
  method: 'POST',
  token,
  body: { name: 'N°4 — attaques poste 4', items: [item({ video_id: videoId })] },
});
eq('création acceptée', created.status, 201);
eq('nom enregistré', created.data?.playlist?.name, 'N°4 — attaques poste 4');
eq('entrées analysées', created.data?.playlist?.items?.length, 1);
eq('poste conservé', created.data?.playlist?.items?.[0]?.poste, '4');
const playlistId = created.data.playlist.id;

const list = await asul(base, '/api/playlists', { token });
eq('playlist listée', (list.data?.playlists || []).length, 1);
const one = await asul(base, `/api/playlists/${playlistId}`, { token });
eq('lecture d’une playlist', one.status, 200);
eq('timecodes conservés', one.data?.playlist?.items?.[0]?.segment_start, 6);

console.log('\n== Modification ==');
const renamed = await asul(base, `/api/playlists/${playlistId}`, { method: 'PATCH', token, body: { name: 'Séance n°4' } });
eq('renommage', renamed.data?.playlist?.name, 'Séance n°4');
const second = item({
  id: 'pl_test_2',
  position: 2,
  video_id: videoId,
  action_code: '*04S+',
  action: 'S',
  evaluation: '+',
  start_zone: '1',
  poste: null,
  segment_start: 6,
  segment_end: 13,
});
const filled = await asul(base, `/api/playlists/${playlistId}`, {
  method: 'PATCH',
  token,
  body: { items: [item({ video_id: videoId }), second] },
});
eq('entrées mises à jour', filled.data?.playlist?.items?.length, 2);
eq('service sans poste de départ', filled.data?.playlist?.items?.[1]?.poste, null);
const untouched = await asul(base, `/api/playlists/${playlistId}`, { method: 'PATCH', token, body: {} });
eq('mise à jour vide sans effet', untouched.data?.playlist?.items?.length, 2);

console.log('\n== Saisies refusées ==');
const noName = await asul(base, '/api/playlists', { method: 'POST', token, body: { items: [] } });
eq('nom obligatoire', noName.status, 400);
const blankName = await asul(base, '/api/playlists', { method: 'POST', token, body: { name: '   ', items: [] } });
eq('nom vide refusé', blankName.status, 400);
const badItems = await asul(base, '/api/playlists', { method: 'POST', token, body: { name: 'Test', items: 'pas un tableau' } });
eq('entrées invalides refusées', badItems.status, 400);
const unknown = await asul(base, '/api/playlists/99999', { token });
eq('playlist inconnue', unknown.status, 404);

console.log('\n== Chaîne complète : codage réel → entrées de playlist ==');
const coded = await asul(base, `/api/datavolley/${videoId}/actions`, { token });
eq('actions du match récupérées', (coded.data?.actions || []).length, 2);
const syncRes = await asul(base, `/api/datavolley/${videoId}/sync`, { token });
const matchSync = syncRes.data?.sync || { sync_offset: 0, lead_in: 4, lead_out: 3 };
const derived = rallyPlaylist(coded.data.actions, matchSync);
eq('1 point dérivé du codage', derived.length, 1);
const attack = derived[0].actions.find((a) => a.action === 'A');
const builtItem = playlistItemFromRally(derived[0], attack, {
  video: {
    id: videoId,
    sync_uuid: 'uuid-match-1',
    filename: 'match1.mp4',
    original_name: 'R1 ASUL vs Nantes.mp4',
    team1_name: 'ASUL',
    team2_name: 'Nantes',
  },
  sync: matchSync,
  scope: 'action',
  teamLabel: 'Nantes',
  playerName: 'Martin',
});
eq(
  'entrée construite depuis le codage',
  [builtItem.action_code, builtItem.poste, builtItem.segment_start, builtItem.segment_end],
  ['a08A4#', '4', 12, 19]
);
const saved = await asul(base, '/api/playlists', {
  method: 'POST',
  token,
  body: { name: 'Chaîne complète', items: normalizePlaylistItems([builtItem]) },
});
eq('playlist enregistrée depuis le codage', saved.status, 201);
eq(
  'timecodes relus à l’identique',
  [saved.data?.playlist?.items?.[0]?.segment_start, saved.data?.playlist?.items?.[0]?.segment_end],
  [12, 19]
);
const removedChain = await asul(base, `/api/playlists/${saved.data.playlist.id}`, { method: 'DELETE', token });
eq('playlist de démonstration retirée', removedChain.status, 200);

console.log('\n== Suppression ==');
const removed = await asul(base, `/api/playlists/${playlistId}`, { method: 'DELETE', token });
eq('suppression acceptée', removed.status, 200);
const afterDelete = await asul(base, '/api/playlists', { token });
eq('playlist retirée de la liste', (afterDelete.data?.playlists || []).length, 0);
const gone = await asul(base, `/api/playlists/${playlistId}`, { token });
eq('lecture après suppression', gone.status, 404);

try {
  child.kill();
} catch {
  /* processus déjà arrêté */
}
await sleep(500);
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* fichiers encore verrouillés sous Windows : le dossier temporaire restera */
}

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);


