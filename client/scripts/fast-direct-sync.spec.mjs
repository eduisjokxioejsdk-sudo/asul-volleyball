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

console.log(`\n${failures === 0 ? 'Fusion Fast Direct validée.' : `${failures} contrôle(s) en échec.`}`);
await vite.close();
if (failures > 0) process.exit(1);
