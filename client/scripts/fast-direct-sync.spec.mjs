// Vérifie la fusion des modifications Fast Direct après une coupure réseau.
// Exécution : node client/scripts/fast-direct-sync.spec.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({
  root: CLIENT_DIR,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
const { mergeFastDirectStates } = await vite.ssrLoadModule(
  '/src/features/fast-direct/utils/cloudSync.js'
);
const {
  computeVolleyStatsDelta,
  mergeVolleyStatsStates,
  buildInitialVolleyStatsSeed,
} = await vite.ssrLoadModule('/src/features/fast-direct/utils/statsSync.js');

let failures = 0;
function check(label, condition, details = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${details ? ` — ${details}` : ''}`);
  }
}

const remote = {
  rows: [
    { uid: 'r1', joueur: '1', resAtt: '+' },
    { uid: 'r2', joueur: '2', resAtt: '#' },
    { uid: 'r3', joueur: '3', resAtt: '0' },
  ],
  matchList: ['ASUL', 'NANTES'],
  setterList: [
    { code: '6', name: 'PAUL' },
    { code: '3', name: 'MARCUS' },
  ],
  sheetConfigs: [
    { id: 'S6', title: 'PAUL', matches: ['ASUL'] },
    { id: 'S3', title: 'MARCUS', matches: ['NANTES'] },
  ],
  teamLineup: { 1: { num: '6', role: 'Passeur' } },
};

const local = {
  ...remote,
  rows: [
    { uid: 'r1', joueur: '1', resAtt: '#' },
    { uid: 'r2', joueur: '2', resAtt: '#' },
    { uid: 'r3', joueur: '3', resAtt: '0' },
    { uid: 'r4', joueur: '4', resAtt: '+' },
  ],
  matchList: ['ASUL', 'NANTES', 'PARIS'],
  sheetConfigs: [
    { id: 'S6', title: 'PAUL', matches: ['ASUL', 'PARIS'] },
    { id: 'S3', title: 'MARCUS', matches: ['NANTES'] },
  ],
};

const merged = mergeFastDirectStates(remote, local, {
  addedRowUids: ['r4'],
  updatedRowUids: ['r1'],
  deletedRowUids: ['r2'],
  addedMatches: ['PARIS'],
  deletedMatches: [],
  renamedMatches: [],
  addedSetters: [],
  deletedSetters: [],
  updatedSheetIds: ['S6'],
  deletedSheetIds: [],
  lineupChanged: false,
});

const byUid = Object.fromEntries(merged.rows.map((row) => [row.uid, row]));
check('ligne distante non touchée conservée', byUid.r3?.resAtt === '0');
check('ligne locale modifiée appliquée', byUid.r1?.resAtt === '#');
check('ligne locale ajoutée appliquée', byUid.r4?.joueur === '4');
check('ligne supprimée retirée', !byUid.r2);
check('match ajouté conservé', merged.matchList.includes('PARIS'));
check('feuille modifiée fusionnée', merged.sheetConfigs.find((s) => s.id === 'S6')?.matches.includes('PARIS'));
check('feuille distante non touchée conservée', !!merged.sheetConfigs.find((s) => s.id === 'S3'));
check('six distant conservé sans changement', merged.teamLineup[1]?.num === '6');

const replaced = mergeFastDirectStates(remote, { ...local, rows: [] }, {}, true);
check('remplacement explicite respecté', replaced.rows.length === 0);

// --- Synchronisation Volley Stats (Autres stats) ---
const baseStats = {
  v: 2,
  players: [{ id: 'p1', num: 6, first: 'Paul', name: 'D.', starter: true }],
  match: { id: 'm1', us: 'ASUL', opp: 'Lyon', set: 1, scores: [{ u: 5, o: 5 }], adv: { s: 0, a: 0, d: 0 } },
  actions: [{ id: 'a0', pid: 'p1', num: 6, k: 'S', r: 'S#', set: 1, sc: 'u', ts: '2026-11-21T10:00:00.000Z' }],
  archive: [],
  opp: [{ id: 'o1', num: '4', first: 'Adv', name: '' }],
  oact: [],
};
const remoteStats = {
  ...baseStats,
  match: { ...baseStats.match, scores: [{ u: 5, o: 6 }] },
  oact: [{ id: 'oa1', pid: 'o1', num: '4', k: 'ATT', r: 'ATT#', set: 1, sc: 'o', ts: '2026-11-21T10:01:00.000Z' }],
};
const localStats = {
  ...baseStats,
  match: { ...baseStats.match, scores: [{ u: 6, o: 5 }] },
  actions: [
    ...baseStats.actions,
    { id: 'a1', pid: 'p1', num: 6, k: 'ATT', r: 'ATT#', set: 1, sc: 'u', ts: '2026-11-21T10:02:00.000Z' },
  ],
};
const statsDelta = computeVolleyStatsDelta(baseStats, localStats);
check('delta Volley Stats détecte l’action ajoutée', statsDelta.addedActionIds.includes('a1'));
const mergedStats = mergeVolleyStatsStates(remoteStats, localStats, statsDelta, false);
check('actions locales et distantes conservées', mergedStats.actions.length === 2 && mergedStats.oact.length === 1);
check('score fusionné sur actions concurrentes (6-6)', mergedStats.match.scores[0].u === 6 && mergedStats.match.scores[0].o === 6);

const replacedStats = mergeVolleyStatsStates(remoteStats, { ...baseStats, actions: [] }, statsDelta, true);
check('remplacement explicite Volley Stats respecté', replacedStats.actions.length === 0);

const seed = buildInitialVolleyStatsSeed(
  { team1_name: 'ASUL', team2_name: 'Nantes' },
  { players: [{ id: 1, number: '6', name: 'Paul D.' }] },
  null
);
check(
  'seed Volley Stats généré depuis les équipes',
  seed.us === 'ASUL' &&
    seed.opp === 'Nantes' &&
    seed.players?.length === 1 &&
    seed.players[0].first === 'Paul' &&
    seed.oppPlayers === null
);

console.log(`\n${failures === 0 ? 'Fusion Fast Direct validée.' : `${failures} contrôle(s) en échec.`}`);
await vite.close();
if (failures > 0) process.exit(1);
