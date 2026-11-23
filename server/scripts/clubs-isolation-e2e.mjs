// Teste le système d'équipes cloisonnées (multi-clubs) sur un serveur ASUL réel.
// Exécution : node server/scripts/clubs-isolation-e2e.mjs
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(scriptDir, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-clubs-e2e-'));
let child = null;
let serverLogs = [];

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function startServer(port) {
  const logs = [];
  child = spawn(process.execPath, [path.join(serverDir, 'src', 'index.js')], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      JWT_SECRET: 'clubs-e2e-secret',
      TEAMS_SYNC_NO_DEFAULT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  return logs;
}

async function stopServer() {
  if (!child) return;
  const current = child;
  child = null;
  if (current.exitCode !== null || current.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    current.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    current.kill();
  });
}

async function waitReady(base, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child?.exitCode != null) throw new Error(`Serveur arrêté au démarrage: ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      /* serveur pas encore prêt */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Délai de démarrage dépassé\n${serverLogs.join('')}`);
}

async function request(base, route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

try {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  serverLogs = startServer(port);
  await waitReady(base);

  // 1. Liste publique des clubs
  const clubsRes = await request(base, '/api/auth/clubs');
  assert.equal(clubsRes.status, 200, 'GET /api/auth/clubs répond 200');
  assert(clubsRes.data.clubs.some((c) => c.id === 'asul'), 'club asul présent');
  assert(clubsRes.data.clubs.some((c) => c.id === 'club-2'), 'club club-2 présent');

  // 2. Inscription sans club → club_id === null (choix requis à la première connexion)
  const userARes = await request(base, '/api/auth/register', {
    method: 'POST',
    body: { email: 'user-a@example.test', password: 'password123', name: 'Scout A' },
  });
  assert.equal(userARes.status, 201, 'inscription utilisateur A');
  assert.equal(userARes.data.user.club_id, null, 'utilisateur démarre sans club_id');
  const tokenA = userARes.data.token;

  // 3. Choix d'une équipe invalide → 400
  const invalidClub = await request(base, '/api/auth/club', {
    method: 'PUT',
    token: tokenA,
    body: { club_id: 'inexistant' },
  });
  assert.equal(invalidClub.status, 400, 'club inexistant rejeté (400)');

  // 4. Choix de l'équipe 'asul'
  const selectAsul = await request(base, '/api/auth/club', {
    method: 'PUT',
    token: tokenA,
    body: { club_id: 'asul' },
  });
  assert.equal(selectAsul.status, 200, 'sélection club asul');
  assert.equal(selectAsul.data.user.club_id, 'asul');

  // 5. Création d'un écosystème complet sous 'asul'
  const teamAsul = await request(base, '/api/teams', {
    method: 'POST',
    token: tokenA,
    body: { name: 'ASUL N2', players: [{ number: 4, name: 'Léo', role: 'setter' }] },
  });
  assert.equal(teamAsul.status, 201, 'équipe créée dans asul');
  const teamAsulId = teamAsul.data.team.id;

  const folderAsul = await request(base, '/api/videos/folders', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Dossier ASUL' },
  });
  assert.equal(folderAsul.status, 201, 'dossier créé dans asul');
  const folderAsulId = folderAsul.data.folder.id;

  const videoAsul = await request(base, '/api/videos/upload', {
    method: 'POST',
    token: tokenA,
    body: {
      team1_name: 'ASUL N2',
      team2_name: 'Adversaire',
      home_team_id: teamAsulId,
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      journee: 'J1',
    },
  });
  assert.equal(videoAsul.status, 201, 'vidéo créée dans asul');
  const videoAsulId = videoAsul.data.id;

  const saveActions = await request(base, `/api/datavolley/${videoAsulId}/actions`, {
    method: 'POST',
    token: tokenA,
    body: { actions: [{ action_index: 0, code: '*04S#', set_number: 1, timecode: 5 }] },
  });
  assert.equal(saveActions.status, 200, 'action DataVolley sauvée dans asul');

  const trajAsul = await request(base, '/api/trajectories', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Traj ASUL', home_team_id: teamAsulId, video_id: videoAsulId },
  });
  assert.equal(trajAsul.status, 201, 'fiche trajectoire créée dans asul');
  const trajAsulId = trajAsul.data.match.id;

  const playlistAsul = await request(base, '/api/playlists', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Playlist ASUL', items: [{ video_id: videoAsulId, code: '*04S#', timecode: 5 }] },
  });
  assert.equal(playlistAsul.status, 201, 'playlist créée dans asul');

  const practiceAsul = await request(base, '/api/practice/sessions', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Entraînement ASUL', team_id: teamAsulId },
  });
  assert.equal(practiceAsul.status, 201, 'séance entraînement créée dans asul');
  const practiceAsulId = practiceAsul.data.session.id;

  const liveAsul = await request(base, '/api/live', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Live ASUL', team1_name: 'ASUL N2', team2_name: 'Adv', home_team_id: teamAsulId },
  });
  assert.equal(liveAsul.status, 201, 'live créé dans asul');
  const liveAsulId = liveAsul.data.id;
  const liveAsulCode = liveAsul.data.join_code;

  // Progression Académie personnelle
  const acadPut = await request(base, '/api/academy/progress', {
    method: 'PUT',
    token: tokenA,
    body: {
      progress: {
        version: 1,
        completed: ['syntax-1'],
        xp: 25,
        level: 1,
        streak: 1,
        bestStreak: 1,
        badges: ['first-level'],
        lastActivityDate: new Date().toISOString().slice(0, 10),
      },
    },
  });
  assert.equal(acadPut.status, 200, 'progression Académie enregistrée');

  // 6. Bascule vers 'club-2' : toutes les listes doivent être vides et les accès directs bloqués
  const switchClub2 = await request(base, '/api/auth/club', {
    method: 'PUT',
    token: tokenA,
    body: { club_id: 'club-2' },
  });
  assert.equal(switchClub2.status, 200, 'bascule vers club-2');
  assert.equal(switchClub2.data.user.club_id, 'club-2');

  assert.equal((await request(base, '/api/teams', { token: tokenA })).data.teams.length, 0, 'teams vide dans club-2');
  assert.equal((await request(base, '/api/videos', { token: tokenA })).data.videos.length, 0, 'videos vide dans club-2');
  assert.equal((await request(base, '/api/videos/folders/all', { token: tokenA })).data.folders.length, 0, 'folders vide dans club-2');
  assert.equal((await request(base, '/api/trajectories', { token: tokenA })).data.matches.length, 0, 'trajectories vide dans club-2');
  assert.equal((await request(base, '/api/live/mine', { token: tokenA })).data.sessions.length, 0, 'live vide dans club-2');
  assert.equal((await request(base, '/api/playlists', { token: tokenA })).data.playlists.length, 0, 'playlists vide dans club-2');
  assert.equal((await request(base, '/api/practice/sessions', { token: tokenA })).data.sessions.length, 0, 'practice vide dans club-2');

  // Accès directs par ID vers les ressources de 'asul' → 404
  assert.equal((await request(base, `/api/videos/${videoAsulId}`, { token: tokenA })).status, 404, 'GET vidéo asul refusé depuis club-2');
  assert.equal((await request(base, `/api/videos/folders/${folderAsulId}/videos`, { token: tokenA })).status, 404, 'GET dossier asul refusé depuis club-2');
  assert.equal((await request(base, `/api/datavolley/${videoAsulId}/actions`, { token: tokenA })).status, 404, 'GET actions asul refusé depuis club-2');
  assert.equal((await request(base, `/api/trajectories/${trajAsulId}`, { token: tokenA })).status, 404, 'GET trajectoire asul refusé depuis club-2');
  assert.equal((await request(base, `/api/live/${liveAsulId}`, { token: tokenA })).status, 404, 'GET live asul refusé depuis club-2');
  assert.equal((await request(base, `/api/practice/sessions/${practiceAsulId}`, { token: tokenA })).status, 404, 'GET practice asul refusé depuis club-2');
  assert.equal(
    (await request(base, '/api/datavolley/multi-match-data', { method: 'POST', token: tokenA, body: { videoIds: [videoAsulId] } })).data.matches.length,
    0,
    'multi-match-data ne retourne pas les matchs asul dans club-2'
  );

  // Rejoindre le live d'asul avec son join_code depuis club-2 → 403 explicite
  const crossJoin = await request(base, '/api/live/join', {
    method: 'POST',
    token: tokenA,
    body: { join_code: liveAsulCode },
  });
  assert.equal(crossJoin.status, 403, 'rejoindre un live d’une autre équipe renvoie 403');

  // Création d'une équipe dans club-2
  const teamClub2 = await request(base, '/api/teams', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Équipe Club 2', players: [] },
  });
  assert.equal(teamClub2.status, 201, 'équipe créée dans club-2');
  assert.equal((await request(base, '/api/teams', { token: tokenA })).data.teams.length, 1, '1 équipe visible dans club-2');

  // Progression Académie reste disponible dans club-2
  const acadInClub2 = await request(base, '/api/academy/progress', { token: tokenA });
  assert.deepEqual(acadInClub2.data.progress.completed, ['syntax-1'], 'progression Académie conservée entre équipes');

  // 7. Retour vers 'asul' et vérification que les données club-2 n'apparaissent pas
  const backAsul = await request(base, '/api/auth/club', {
    method: 'PUT',
    token: tokenA,
    body: { club_id: 'asul' },
  });
  assert.equal(backAsul.status, 200);
  const teamsAfterBack = (await request(base, '/api/teams', { token: tokenA })).data.teams;
  assert.equal(teamsAfterBack.length, 1, 'seule l’équipe asul est visible dans asul');
  assert.equal(teamsAfterBack[0].name, 'ASUL N2');
  assert.equal((await request(base, `/api/videos/${videoAsulId}`, { token: tokenA })).status, 200, 'vidéo asul retrouvée');

  // Basculons sur club-2 puis redémarrons le serveur pour vérifier la persistance de users.club_id
  await request(base, '/api/auth/club', { method: 'PUT', token: tokenA, body: { club_id: 'club-2' } });
  await stopServer();
  serverLogs = startServer(port);
  await waitReady(base);

  const meAfterRestart = await request(base, '/api/auth/me', { token: tokenA });
  assert.equal(meAfterRestart.status, 200);
  assert.equal(meAfterRestart.data.user.club_id, 'club-2', 'club_id persisté après redémarrage');

  console.log('Clubs isolation E2E OK — sélection première connexion, cloisonnement complet, blocage cross-club et persistance.');
} catch (err) {
  console.error('Clubs isolation E2E FAILED:', err);
  if (serverLogs.length) {
    console.error('--- Server logs ---\n' + serverLogs.join(''));
  }
  process.exitCode = 1;
} finally {
  await stopServer();
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedDataDir = path.resolve(dataDir);
  if (resolvedDataDir.startsWith(`${tempRoot}${path.sep}`) && path.basename(resolvedDataDir).startsWith('asul-clubs-e2e-')) {
    fs.rmSync(resolvedDataDir, { recursive: true, force: true });
  }
}
