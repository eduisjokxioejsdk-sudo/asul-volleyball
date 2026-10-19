// ============================================================================
// Test d'intégration : les 4 modes de codage (Saisie · Consultation ·
// Correction · Analyse) sur un VRAI serveur ASUL.
//
// Démarre le serveur (dossier de données temporaire), insère un match codé,
// puis vérifie de bout en bout ce que chaque mode lit et écrit :
//   • Consultation : les points jouables (sans les temps morts), la rotation au
//     moment d'une action, les filtres de relecture ;
//   • Correction   : le calage de la vidéo, les temps vidéo, les anomalies
//     relevées, les commandes (temps mort, remplacement, code libre) ;
//   • Analyse      : la descente d'un chiffre vers les actions (drill-down) ;
//   • Saisie       : la fin de point ([ / ]) et son annulation (Ctrl+A).
//
// Exécution : node server/scripts/coding-modes-e2e.mjs
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

import {
  buildPointSegments,
  decomposeCode,
  effectiveTime,
  formatCode,
  getPointWinner,
  groupActionsIntoRallies,
} from '../../client/src/utils/datavolley.js';
import { computeMatchState } from '../../client/src/utils/rotation.js';
import {
  codeIssues,
  drillDown,
  firstServeAnchor,
  pointIndexAt,
  reviewTotals,
  rotationAt,
  searchCodes,
  shiftTimecode,
} from '../../client/src/utils/codingTools.js';

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
// Serveur de test + match codé
// ---------------------------------------------------------------------------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-modes-'));
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

/**
 * Match de test : 3 points.
 *   Point 1 : le visiteur gagne sur son attaque (a08A4#).
 *   Point 2 : ace du domicile (*02S#).
 *   Point 3 : point encore ouvert, terminé par un code incomplet (a07A).
 */
const SEED = [
  { code: '*04S+', timecode: 10, system_time: 1000 },
  { code: 'a08R#', timecode: 12 },
  { code: 'a09E+', timecode: 14 },
  { code: 'a08A4#', timecode: 16 },
  { code: '*02S#', timecode: 30 },
  { code: '*05S+', timecode: 50 },
  { code: 'a03R#', timecode: 52 },
  { code: 'a07A', timecode: 54 },
];

async function seedMatch(userId) {
  const db = new sqlite3.Database(path.join(dataDir, 'asul.db'));
  const now = new Date().toISOString();
  const video = await run(
    db,
    `INSERT INTO videos (user_id, filename, original_name, filepath, team1_name, team2_name, status, sync_uuid, dirty, deleted, local_updated_at)
     VALUES (?, 'match1.mp4', 'R1 ASUL vs Nantes.mp4', 'uploads/match1.mp4', 'ASUL', 'Nantes', 'uploaded', 'uuid-match-1', 1, 0, ?)`,
    [userId, now]
  );
  for (let i = 0; i < SEED.length; i += 1) {
    const a = SEED[i];
    const f = decomposeCode(a.code);
    await run(
      db,
      `INSERT INTO volley_actions (video_id, action_index, code, timecode, system_time, team, player_number, action, type, evaluation, start_zone, end_zone, set_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        video.lastID,
        i,
        a.code,
        a.timecode,
        a.system_time ?? null,
        f.team,
        f.player_number,
        f.action,
        f.type ?? null,
        f.evaluation ?? null,
        f.start_zone ?? null,
        f.end_zone ?? null,
      ]
    );
  }
  await new Promise((resolve) => db.close(resolve));
  return video.lastID;
}

const LINEUPS = {
  1: {
    first_server: 'team1',
    home_setter_pos: 'P1',
    away_setter_pos: 'P4',
    home_lineup: { P1: 11, P2: 12, P3: 13, P4: 14, P5: 15, P6: 16 },
    away_lineup: { P1: 1, P2: 2, P3: 3, P4: 8, P5: 5, P6: 6 },
  },
};

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

const setupsRes = await asul(base, `/api/datavolley/${videoId}/setups`, {
  method: 'PUT',
  token,
  body: { setups: LINEUPS },
});
eq('six de départ enregistrés', setupsRes.status, 200);


// ---------------------------------------------------------------------------
// Lecture des données comme le fait l'application
// ---------------------------------------------------------------------------

async function loadMatch() {
  const res = await asul(base, `/api/datavolley/${videoId}/actions`, { token });
  const actions = (res.data?.actions || []).map((a) => ({ ...a, uid: a.uid || `a${a.action_index}` }));
  const rallies = groupActionsIntoRallies(actions);
  const state = computeMatchState(rallies, LINEUPS, {}, await loadEvents());
  return { actions, rallies, state, status: res.status };
}

async function loadEvents() {
  const res = await asul(base, `/api/datavolley/${videoId}/events`, { token });
  return res.data?.events || [];
}

const loaded = await loadMatch();
eq('actions lues', loaded.status, 200);
eq('8 actions', loaded.actions.length, 8);
eq('3 points reconstitués', loaded.rallies.length, 3);
eq('le visiteur gagne le point 1', getPointWinner(loaded.rallies[0]), 'team2');
eq('le domicile gagne le point 2', getPointWinner(loaded.rallies[1]), 'team1');
eq('le point 3 est encore ouvert', getPointWinner(loaded.rallies[2]), null);

console.log('\n== Mode Consultation ==');
const segments = buildPointSegments(loaded.rallies, { syncOffset: 0, leadIn: 4, leadOut: 3 });
eq('3 points jouables', segments.length, 3);
eq('point 1 : de 6 s à 19 s', [segments[0].segmentStart, segments[0].segmentEnd], [6, 19]);
eq('point 3 : de 46 s à 57 s', [segments[2].segmentStart, segments[2].segmentEnd], [46, 57]);
eq('lecture à 12 s → point 1', pointIndexAt(segments, 12), 0);
eq('temps mort à 25 s → aucun point', pointIndexAt(segments, 25), -1);
const totals = reviewTotals(segments, 60);
eq('temps morts évités', Math.round(totals.skipped), 26);
check('point 1 plus court que la vidéo', totals.played < totals.full);

const at = rotationAt(loaded.rallies, loaded.state, 3);
eq('rotation au point 1 : équipe qui joue', at.team, 'away');
eq('rotation au point 1 : visiteur en P4', at.awayRotation, 4);
eq('rotation au point 1 : domicile en P1', at.homeRotation, 1);
eq('rotation au point 1 : score avant le point', at.score, { team1: 0, team2: 0 });
const atPoint3 = rotationAt(loaded.rallies, loaded.state, 7);
eq('rotation au point 3 : score avant le point', atPoint3.score, { team1: 1, team2: 1 });

const homeServes = searchCodes(loaded.actions, { action: 'S', team: 'home' });
eq('filtre : services du domicile', homeServes.length, 3);
eq('filtre : attaques du visiteur', searchCodes(loaded.actions, { action: 'A' }).map((a) => a.code), ['a08A4#', 'a07A']);
eq('filtre : joueur 8', searchCodes(loaded.actions, { player: 8 }).length, 2);
eq('filtre : recherche libre', searchCodes(loaded.actions, { query: '*0?S*' }).length, 3);
eq('filtre : qualité « # »', searchCodes(loaded.actions, { evaluation: '#' }).length, 4);
eq('filtre : zone 4', searchCodes(loaded.actions, { zone: '4' }).length, 1);

console.log('\n== Mode Analyse (Click to Rally) ==');
eq('descente : attaques du visiteur', drillDown(loaded.actions, { action: 'A' }).length, 2);
eq('descente : services gagnants', drillDown(loaded.actions, { action: 'S', evaluation: '#' }).length, 1);
eq('descente : par point', drillDown(loaded.actions, { pointNumbers: [2] }, { pointOf: () => 2 }).length, 8);
eq('descente : par rotation', drillDown(loaded.actions, { rotation: 4 }, { rotationOf: (a) => (a.action === 'R' ? 4 : 1) }).length, 2);
eq('descente : aucun résultat', drillDown(loaded.actions, { action: 'B' }).length, 0);

console.log('\n== Mode Correction : anomalies ==');
const issues = codeIssues(loaded.actions, { requireTimecode: true });
eq('une seule anomalie', issues.length, 1);
eq('code incomplet signalé', issues[0].issue, 'invalid_code');
eq('code fautif', issues[0].code, 'a07A');
// Fiche équipe incomplète : le n°4 du domicile n'y figure pas.
const withRoster = codeIssues(loaded.actions, { roster: { home: [2, 5], away: [3, 8, 9] } });
check('joueur absent de la fiche signalé', withRoster.some((i) => i.issue === 'unknown_player' && i.code === '*04S+'));


console.log('\n== Mode Correction : calage de la vidéo ==');
const syncRes = await asul(base, `/api/datavolley/${videoId}/sync`, {
  method: 'PUT',
  token,
  body: { sync_offset: 0, lead_in: 4, lead_out: 3 },
});
eq('synchronisation enregistrée', syncRes.status, 200);
const syncGet = await asul(base, `/api/datavolley/${videoId}/sync`, { token });
eq('synchronisation relue', syncGet.data?.sync?.lead_in, 4);

// « Caler ici » : l'heure système du premier service doit tomber pile sur la
// position vidéo (c'est ce décalage qui place les actions sans temps vidéo).
const anchor = firstServeAnchor(loaded.actions, 1005, syncGet.data.sync);
eq('service d’ancre', anchor.action.code, '*04S+');
eq('heure système du service', anchor.sync.anchor_system_time, 1000);
eq('temps vidéo du service après calage', anchor.sync.anchor_system_time + anchor.offset, 1005);
const syncSaved = await asul(base, `/api/datavolley/${videoId}/sync`, { method: 'PUT', token, body: anchor.sync });
eq('calage enregistré', syncSaved.status, 200);
const syncAfter = await asul(base, `/api/datavolley/${videoId}/sync`, { token });
eq('décalage relu', Math.round(syncAfter.data.sync.sync_offset), Math.round(anchor.offset));

// Ajustement du temps d'une action (mode Correction) puis enregistrement.
const target = loaded.actions[2];
const shifted = shiftTimecode(loaded.actions, target.uid, 1.5);
eq('temps décalé dans la liste', shifted.find((a) => a.uid === target.uid).timecode, target.timecode + 1.5);
const savedShift = await asul(base, `/api/datavolley/${videoId}/actions`, { method: 'POST', token, body: { actions: shifted } });
eq('temps enregistré', savedShift.status, 200);
const reloaded = await loadMatch();
eq('temps relu', reloaded.actions.find((a) => a.action_index === target.action_index).timecode, target.timecode + 1.5);


console.log('\n== Mode Correction : commandes (Échap) ==');
const timeout = await asul(base, `/api/datavolley/${videoId}/events`, {
  method: 'POST',
  token,
  body: { kind: 'timeout', set_number: 1, point_number: 2, team: 'home' },
});
eq('temps mort enregistré', timeout.status, 200);
const sub = await asul(base, `/api/datavolley/${videoId}/events`, {
  method: 'POST',
  token,
  body: { kind: 'substitution', set_number: 1, point_number: 2, team: 'away', payload: { out: 8, in: 12 } },
});
eq('remplacement enregistré', sub.status, 200);
const note = await asul(base, `/api/datavolley/${videoId}/events`, {
  method: 'POST',
  token,
  body: { kind: 'note', set_number: 1, point_number: 3, team: 'home', payload: { text: 'redca' } },
});
eq('code libre enregistré', note.status, 200);
eq('code libre mis en majuscules', note.data?.event?.payload?.text, 'REDCA');

const refusedKind = await asul(base, `/api/datavolley/${videoId}/events`, {
  method: 'POST',
  token,
  body: { kind: 'inconnu', set_number: 1, point_number: 1, team: 'home' },
});
eq('type d’événement inconnu refusé', refusedKind.status, 400);
const refusedSub = await asul(base, `/api/datavolley/${videoId}/events`, {
  method: 'POST',
  token,
  body: { kind: 'substitution', set_number: 1, point_number: 1, team: 'home', payload: { out: 4, in: 4 } },
});
eq('remplacement avec le même joueur refusé', refusedSub.status, 400);
const refusedNote = await asul(base, `/api/datavolley/${videoId}/events`, {
  method: 'POST',
  token,
  body: { kind: 'note', set_number: 1, point_number: 1, team: 'home', payload: { text: '   ' } },
});
eq('code libre vide refusé', refusedNote.status, 400);

const events = await loadEvents();
eq('3 événements enregistrés', events.length, 3);
// Le visiteur a gagné le point 1 en réception : il a tourné, le n°8 est passé
// en P3 — c'est donc là que le remplaçant entre.
const afterSub = computeMatchState(loaded.rallies, LINEUPS, {}, events);
eq('le remplaçant entre sur le terrain', afterSub.states[2].awayLineup.P3, 12);
eq('les six du point 1 sont inchangés', afterSub.states[0].awayLineup.P4, 8);
eq('le temps mort du domicile est enregistré', events.filter((e) => e.kind === 'timeout').length, 1);
eq('le code libre est relu', events.find((e) => e.kind === 'note')?.payload?.text, 'REDCA');


console.log('\n== Mode Saisie : fin de point ==');
// Geste « ] » : le point 3 revient au visiteur, qui a joué la dernière action.
const last = reloaded.actions[reloaded.actions.length - 1];
const codeFields = (evaluation) => ({
  teamKey: last.team === 'away' ? 'a' : '*',
  player_number: last.player_number,
  action: last.action,
  type: last.type || '',
  evaluation,
  start_zone: last.start_zone || '',
  end_zone: last.end_zone || '',
  end_subzone: last.end_subzone || '',
});
const closedCode = formatCode(codeFields('#'));
eq('code de fin de point', closedCode, 'a07A#');
const closedList = reloaded.actions.map((a) =>
  a.uid === last.uid ? { ...a, code: closedCode, ...decomposeCode(closedCode) } : a
);
const savedClosed = await asul(base, `/api/datavolley/${videoId}/actions`, {
  method: 'POST',
  token,
  body: { actions: closedList },
});
eq('fin de point enregistrée', savedClosed.status, 200);
const closedMatch = await loadMatch();
eq('le point 3 est clos', getPointWinner(closedMatch.rallies[2]), 'team2');
eq('plus aucune anomalie', codeIssues(closedMatch.actions, { requireTimecode: true }).length, 0);

// Ctrl+A : on retire l'évaluation, le point redevient ouvert.
const reopenedCode = formatCode(codeFields(''));
const reopenedList = closedMatch.actions.map((a) =>
  a.uid === last.uid ? { ...a, code: reopenedCode, ...decomposeCode(reopenedCode) } : a
);
await asul(base, `/api/datavolley/${videoId}/actions`, { method: 'POST', token, body: { actions: reopenedList } });
const reopenedMatch = await loadMatch();
eq('fin de point annulée', getPointWinner(reopenedMatch.rallies[2]), null);
eq('l’anomalie revient', codeIssues(reopenedMatch.actions, { requireTimecode: true }).length, 1);

// ---------------------------------------------------------------------------
// Arrêt du serveur
// ---------------------------------------------------------------------------
if (child) child.kill();
await sleep(300);
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* dossier temporaire déjà libéré */
}

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

