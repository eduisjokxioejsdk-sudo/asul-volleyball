// ============================================================================
// Test d'intégration : partage des équipes entre DEUX postes via le cloud.
//
// Le script démarre :
//   • un faux serveur Supabase (REST PostgREST) en mémoire, qui reproduit
//     l'upsert `on_conflict=sync_uuid` + trigger `updated_at` côté serveur ;
//   • deux serveurs ASUL complets (server/src/index.js) avec deux dossiers de
//     données différents, comme deux PC statisticiens.
// Il vérifie ensuite : création propagée, modification propagée, suppression
// propagée, état exposé par /api/teams/sync/status.
//
// Exécution : node server/scripts/teams-sync-e2e.mjs
// ============================================================================

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(SCRIPT_DIR, '..');
const TABLE = 'asul_teams';

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

/** Attend qu'une condition devienne vraie (évite les attentes fixes). */
async function waitFor(label, probe, timeoutMs = 8000, stepMs = 150) {
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

/** Appel HTTP vers un serveur ASUL ; ne lève jamais (renvoie le statut). */
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
      } catch (err) {
        data = text;
      }
    }
    return { status: response.status, data };
  } catch (err) {
    const cause = err.cause && err.cause.message ? ` (${err.cause.message})` : '';
    return { status: 0, data: null, error: `${err.message}${cause}` };
  }
}

/** Dernières lignes du journal d'un poste (diagnostic en cas d'échec). */
function dumpLogs(post, lines = 25) {
  const journal = post.logs.join('').split('\n').filter(Boolean).slice(-lines);
  console.log(`\n--- Journal de « ${post.label} » ---`);
  console.log(journal.join('\n'));
  console.log('--- fin du journal ---\n');
}

// ---------------------------------------------------------------------------
// Deux postes ASUL (deux dossiers de données, deux ports)
// ---------------------------------------------------------------------------

const posts = [];

async function startPost(label, cloudUrl, options = {}) {
  const withCloud = options.withCloud !== false;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `asul-sync-${label}-`));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'src', 'index.js')], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      CLIENT_DIST: path.join(SERVER_DIR, '..', 'client', 'dist'),
      ...(withCloud
        ? {
            TEAMS_SYNC_URL: cloudUrl,
            TEAMS_SYNC_KEY: 'cle-de-test',
            TEAMS_SYNC_TABLE: TABLE,
            // Période longue : ce test déclenche lui-même les cycles (POST /teams/sync).
            TEAMS_SYNC_INTERVAL_MS: '3600000',
          }
        : {}),
      FFMPEG_PATH: process.env.FFMPEG_PATH || '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));

  const base = `http://127.0.0.1:${port}`;
  const post = { label, base, token: null, dataDir, child, logs };
  posts.push(post);

  const ready = await waitFor(
    `serveur « ${label} » prêt`,
    async () => {
      const res = await asul(base, '/api/health');
      return res.status === 200;
    },
    30000
  );
  if (!ready) dumpLogs(post);

  const auth = await asul(base, '/api/auth/register', {
    method: 'POST',
    body: { email: `${label}@asul.test`, password: 'motdepasse', name: `Poste ${label}` },
  });
  if (auth.status !== 201 || !auth.data?.token) {
    check(`compte créé sur « ${label} »`, false, `statut ${auth.status} ${auth.error || ''} ${JSON.stringify(auth.data)}`);
    dumpLogs(post);
    throw new Error(`poste « ${label} » : création du compte impossible`);
  }
  check(`compte créé sur « ${label} »`, true);
  post.token = auth.data.token;
  return post;
}

async function teamsOf(post) {
  const res = await asul(post.base, '/api/teams', { token: post.token });
  return (res.data?.teams || []).map((team) => team.name).sort();
}

async function syncPost(post) {
  const res = await asul(post.base, '/api/teams/sync', { method: 'POST', token: post.token });
  if (res.status !== 200) {
    check(`cycle de synchronisation sur « ${post.label} »`, false, JSON.stringify(res.data));
  }
  return res.data;
}

async function cleanup() {
  for (const post of posts) {
    try {
      post.child.kill();
    } catch (err) {
      /* processus déjà arrêté */
    }
  }
  await sleep(500);
  for (const post of posts) {
    try {
      fs.rmSync(post.dataDir, { recursive: true, force: true });
    } catch (err) {
      /* fichiers encore verrouillés sous Windows : le dossier temporaire restera */
    }
  }
}

// ---------------------------------------------------------------------------
// Faux Supabase (API REST PostgREST : lecture incrémentale + upsert)
// ---------------------------------------------------------------------------

function startFakeSupabase() {
  const rows = new Map();
  let counter = 0;
  const serverTimestamp = () => {
    counter += 1;
    return new Date(Date.UTC(2026, 0, 1, 12, 0, 0) + counter * 1000).toISOString();
  };
  const sortedRows = () => [...rows.values()].sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (!url.pathname.startsWith(`/rest/v1/${TABLE}`)) return send(404, { message: 'Not found' });
    if (!req.headers.apikey) return send(401, { message: 'No API key found in request' });

    if (req.method === 'GET') {
      const cursor = url.searchParams.get('updated_at');
      const limit = Number(url.searchParams.get('limit') || 1000);
      let list = sortedRows();
      if (cursor && cursor.startsWith('gt.')) {
        const from = cursor.slice(3);
        list = list.filter((row) => row.updated_at > from);
      }
      return send(200, list.slice(0, limit));
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(body || '[]');
        } catch (err) {
          return send(400, { message: 'Invalid JSON body' });
        }
        const list = Array.isArray(payload) ? payload : [payload];
        const saved = list.map((row) => {
          const stored = { ...row, updated_at: serverTimestamp() };
          rows.set(String(stored.sync_uuid), stored);
          return stored;
        });
        return send(201, saved);
      });
      return undefined;
    }

    return send(405, { message: 'Method not allowed' });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
        count: () => rows.size,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Scénario complet
// ---------------------------------------------------------------------------

const cloud = await startFakeSupabase();
console.log(`\nFaux Supabase : ${cloud.url} (table ${TABLE})`);

try {
  const postA = await startPost('poste-a', cloud.url);
  const postB = await startPost('poste-b', cloud.url);

  console.log('\n== Création sur le poste A → visible sur le poste B ==');
  const created = await asul(postA.base, '/api/teams', {
    method: 'POST',
    token: postA.token,
    body: {
      name: 'ASUL Lyon',
      players: [
        { number: 4, name: 'Léa', role: 'setter' },
        { number: 9, name: 'Nina', role: 'middle' },
      ],
      libero: 12,
      libero_for: 4,
    },
  });
  check('équipe créée sur A', created.status === 201, JSON.stringify(created.data));
  await syncPost(postA);

  const namesOnB = await waitFor('équipe reçue par le poste B', async () => {
    await syncPost(postB);
    const names = await teamsOf(postB);
    return names.includes('ASUL Lyon') ? names : null;
  });
  eq('liste du poste B', namesOnB, ['ASUL Lyon']);

  const teamOnB = (await asul(postB.base, '/api/teams', { token: postB.token })).data.teams[0];
  eq('joueurs transmis', (teamOnB?.players || []).map((player) => player.name), ['Léa', 'Nina']);
  eq('libéro transmis', teamOnB?.libero, 12);

  console.log('\n== Modification sur le poste B → visible sur le poste A ==');
  const patched = await asul(postB.base, `/api/teams/${teamOnB.id}`, {
    method: 'PATCH',
    token: postB.token,
    body: {
      name: 'ASUL Lyon',
      players: [
        { number: 4, name: 'Léa', role: 'setter' },
        { number: 7, name: 'Sacha', role: 'opposite' },
      ],
      libero: null,
      libero_for: null,
    },
  });
  check('équipe modifiée sur B', patched.status === 200, JSON.stringify(patched.data));
  await syncPost(postB);

  const playersOnA = await waitFor('modification reçue par le poste A', async () => {
    await syncPost(postA);
    const res = await asul(postA.base, '/api/teams', { token: postA.token });
    const team = (res.data?.teams || [])[0];
    return team && team.players.some((player) => player.name === 'Sacha')
      ? team.players.map((player) => player.name)
      : null;
  });
  eq('joueurs mis à jour sur A', playersOnA, ['Léa', 'Sacha']);

  console.log('\n== Suppression sur le poste A → supprimée sur le poste B ==');
  const teamOnA = (await asul(postA.base, '/api/teams', { token: postA.token })).data.teams[0];
  const deletion = await asul(postA.base, `/api/teams/${teamOnA.id}`, { method: 'DELETE', token: postA.token });
  check('suppression acceptée sur A', deletion.status === 200, JSON.stringify(deletion.data));
  await syncPost(postA);

  const leftOnB = await waitFor('suppression reçue par le poste B', async () => {
    await syncPost(postB);
    const names = await teamsOf(postB);
    return names.length === 0 ? names : null;
  });
  eq('liste vide sur le poste B', leftOnB, []);

  console.log('\n== État exposé par /api/teams/sync/status ==');
  const status = await waitFor('synchronisation au repos', async () => {
    const res = await asul(postA.base, '/api/teams/sync/status', { token: postA.token });
    const data = res.data;
    return data && data.enabled && data.pending === 0 && data.running === false ? data : null;
  });
  eq('synchronisation activée', status?.enabled, true);
  eq('clé enregistrée', status?.hasKey, true);
  eq('aucune erreur', status?.lastError, null);
  eq('équipes actives sur A', status?.teams, 0);
  check('pierre tombale conservée en local', Number(status?.tombstones) >= 1, `tombstones=${status?.tombstones}`);
  check('table alimentée dans le cloud', cloud.count() >= 1, `lignes=${cloud.count()}`);

  console.log('\n== Configuration depuis l’interface (PUT /api/teams/sync/config) ==');
  const postC = await startPost('poste-c', null, { withCloud: false });

  const initial = (await asul(postC.base, '/api/teams/sync/status', { token: postC.token })).data;
  eq('partage non configuré au départ', initial?.configured, false);
  eq('partage inactif au départ', initial?.enabled, false);

  const configured = await asul(postC.base, '/api/teams/sync/config', {
    method: 'PUT',
    token: postC.token,
    body: { enabled: true, url: cloud.url, key: 'cle-de-test', table: TABLE },
  });
  check('configuration acceptée', configured.status === 200, JSON.stringify(configured.data));
  eq('connexion au cloud vérifiée', configured.data?.check?.ok, true);
  eq('partage activé', configured.data?.config?.enabled, true);
  eq('clé enregistrée', configured.data?.config?.hasKey, true);
  check(
    'configuration écrite dans le dossier de données',
    fs.existsSync(path.join(postC.dataDir, 'sync.json')),
    postC.dataDir
  );

  const reconfigured = await asul(postC.base, '/api/teams/sync/config', {
    method: 'PUT',
    token: postC.token,
    body: { enabled: true, url: cloud.url },
  });
  eq('clé conservée si elle n’est pas renvoyée', reconfigured.data?.config?.hasKey, true);

  const createdOnC = await asul(postC.base, '/api/teams', {
    method: 'POST',
    token: postC.token,
    body: { name: 'Caluire', players: [{ number: 5, name: 'Zoé', role: 'libero' }] },
  });
  check('équipe créée sur C', createdOnC.status === 201, JSON.stringify(createdOnC.data));
  await syncPost(postC);

  const onAAfterC = await waitFor('équipe du poste C reçue par le poste A', async () => {
    await syncPost(postA);
    const names = await teamsOf(postA);
    return names.includes('Caluire') ? names : null;
  });
  eq('liste du poste A après configuration de C', onAAfterC, ['Caluire']);
} finally {
  await cleanup();
  await cloud.close();
}

console.log('');
if (failures > 0) {
  console.log(`${failures} vérification(s) en échec.\n`);
  process.exit(1);
}
console.log('Test d’intégration du partage des équipes : tout est vert.\n');
