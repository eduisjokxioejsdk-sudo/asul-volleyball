// Vérifications du moteur de statistiques Fast Direct (aucun navigateur requis).
import assert from 'node:assert/strict';
import {
  computeCombos,
  computeDistribution,
  computeOverview,
  computePlayers,
  computeReception,
  computeStats,
  describeDistrib,
  filterRows,
  mapDistribToZoneKey,
  normalizeRow,
  rowsToCsv,
} from '../src/utils/statsEngine.js';
import {
  buildDataset,
  listLocalSessions,
  loadLocalSession,
  parseBackupPayload,
} from '../src/utils/dataSource.js';

let passed = 0;

function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log(`ok   ${label}`);
}

const rawRows = [
  { id: 1, match: 'MATCH 1', rotation: '1', setter: '6', service: 'F', zoneR: '5', qualiteR: '#', zoneP: '3', baseOff: '1', distribP: '5', joueur: '1', resAtt: '-' },
  { id: 2, match: 'MATCH 1', rotation: '1', setter: '6', service: 'F', zoneR: '5', qualiteR: '+', zoneP: '3', baseOff: '1', distribP: '5', joueur: '1', resAtt: '-' },
  { id: 3, match: 'MATCH 1', rotation: '1', setter: '6', service: 'F', zoneR: '6', qualiteR: '0', zoneP: '2', baseOff: '2', distribP: '6', joueur: '3', resAtt: '#' },
  { id: 4, match: 'MATCH 2', rotation: '4', setter: 'NP', service: 'F', zoneR: '1', qualiteR: 'Err', zoneP: '1', baseOff: '0', distribP: '8', joueur: '3', resAtt: '-' },
  { id: 5, match: 'MATCH 2', rotation: '4', setter: 'NP', service: 'F', zoneR: '4', qualiteR: '-', zoneP: '5', baseOff: '0', distribP: '9', joueur: '2', resAtt: '-' },
  { id: 6, match: 'MATCH 2', rotation: '4', setter: 'NP', service: 'F', zoneR: '4', qualiteR: '#', zoneP: '6', baseOff: '7', distribP: '10', joueur: '4', resAtt: '-' },
];

const rows = rawRows.map((row, index) => normalizeRow(row, index));

// --- Normalisation ---------------------------------------------------------
check('uid hérité conservé', rows[0].uid === 'legacy_1');
check('code qualité normalisé', normalizeRow({ qualiteR: 'err' }).qualiteR === 'Err');
check('passeur NP conservé', rows[3].setter === 'NP');

// --- Zones de distribution -------------------------------------------------
const mapping = {
  '5': 'EN4',
  '9': 'EN4',
  '4': 'autres',
  '7': 'DECA',
  '1': 'FIX_AV',
  '1C': 'FIX_AV',
  '3': 'FIX_AV',
  '2': 'FIX_ARR',
  '6': 'EN2',
  '8': 'EN1',
  '10': 'PIPE',
  PM: 'autres',
};
Object.entries(mapping).forEach(([code, zone]) => {
  assert.equal(mapDistribToZoneKey(code), zone, `zone de ${code}`);
});
passed += 1;
console.log('ok   mapping complet des 12 codes de distribution');
check('libellé de distribution', describeDistrib('10') === 'PIPE');

// --- Filtres ---------------------------------------------------------------
check('filtre par match', filterRows(rows, { matches: ['match 1'] }).length === 3);
check(
  'filtre match + rotation',
  filterRows(rows, { matches: ['MATCH 2'], rotations: ['4'] }).length === 3
);
check('filtre attaquant', filterRows(rows, { players: ['1'] }).length === 2);

// --- Indicateurs -----------------------------------------------------------
const overview = computeOverview(rows);
check('total des actions', overview.totalActions === 6);
check('nombre de matchs', overview.matchCount === 2);
check('nombre de passeurs', overview.setterCount === 2);
check('zone dominante = EN 4', overview.topZone && overview.topZone.label === 'EN 4');
check(
  'attaquant le plus utilisé parmi #1 et #3',
  overview.topPlayer && ['1', '3'].includes(overview.topPlayer.player)
);

const reception = computeReception(rows);
check('réceptions comptées', reception.total === 6);
check('taux de réceptions positives', Math.abs(reception.positiveRate - 3 / 6) < 1e-9);
check('taux de réceptions parfaites', Math.abs(reception.perfectRate - 2 / 6) < 1e-9);
check('taux d’erreurs de réception', Math.abs(reception.errorRate - 1 / 6) < 1e-9);
check(
  'matrice zone 5 parfaite et positive',
  reception.matrix['5']['#'] === 1 && reception.matrix['5']['+'] === 1
);

const distribution = computeDistribution(rows);
check('distributions valides comptées', distribution.total === 6);
const shareSum = distribution.zones.reduce((sum, zone) => sum + (zone.share || 0), 0);
check('somme des parts de distribution = 100 %', Math.abs(shareSum - 1) < 1e-9);
check(
  'EN 4 = trois ballons (5, 5, 9)',
  distribution.zones.find((zone) => zone.key === 'EN4').count === 3
);
check(
  'efficacité EN 2 (1 point sur 1)',
  distribution.zones.find((zone) => zone.key === 'EN2').efficiency === 1
);
check('quatre annonces BASE distinctes', distribution.baseOff.length === 4);
check(
  'rotations P1 et P4 renseignées',
  distribution.rotations.find((rot) => rot.rotation === '1').actions === 3 &&
    distribution.rotations.find((rot) => rot.rotation === '4').actions === 3
);

const players = computePlayers(rows);
check('quatre attaquants utilisés', players.length === 4);
check(
  'joueur 1 et joueur 3 à deux ballons',
  players.find((player) => player.player === '1').actions === 2 &&
    players.find((player) => player.player === '3').actions === 2
);
check(
  'détail des zones du joueur 3 (EN 2 et EN 1)',
  players.find((player) => player.player === '3').byZone.EN2 === 1 &&
    players.find((player) => player.player === '3').byZone.EN1 === 1
);
check(
  'zone forte du joueur 1 = EN 4 à 100 %',
  players.find((player) => player.player === '1').topZone === 'EN4' &&
    players.find((player) => player.player === '1').topShare === 1
);

const combos = computeCombos(rows, 5);
check('combinaison détectée', combos.some((combo) => combo.label === '5# → 3 → EN 4'));
check('limite des combinaisons respectée', combos.length <= 5);

const full = computeStats(rows);
check('computeStats regroupe les analyses', Object.keys(full).length === 7);

// --- Export CSV ------------------------------------------------------------
const csv = rowsToCsv(rows);
const csvLines = csv.split('\r\n');
check('en-tête CSV', csvLines[0].startsWith('Match;Rotation;Passeur;Service'));
check('une ligne CSV par action', csvLines.length === rows.length + 1);

// --- Jeu de données & sauvegarde ------------------------------------------
const dataset = buildDataset(
  { rows: rawRows, matchList: [] },
  { sourceKind: 'file', label: 'test.json' }
);
check('dataset normalisé', dataset.rows.length === 6);
check('matchs dérivés', dataset.matchList.join('|') === 'MATCH 1|MATCH 2');
check('passeurs dérivés', dataset.setterList.map((s) => s.code).join('|') === '6|NP');

const payload = parseBackupPayload({
  exportedAt: '2026-11-18T10:00:00.000Z',
  data: { rows: rawRows },
});
check('sauvegarde .json lue', payload.rows.length === 6 && payload.exportedAt !== null);
assert.throws(() => parseBackupPayload({ data: {} }), /invalide/i);
passed += 1;
console.log('ok   sauvegarde invalide rejetée');

// --- localStorage ----------------------------------------------------------
const prefix = 'pancake_fd_sess_A_';
const entries = {
  [`${prefix}pancake_dist_rows_v1`]: JSON.stringify(rawRows),
  [`${prefix}pancake_dist_matches_v2`]: JSON.stringify(['MATCH 1', 'MATCH 2']),
  [`${prefix}pancake_dist_setters_v1`]: JSON.stringify([{ code: '6', name: 'Paul' }]),
};
const fakeStorage = {
  _map: new Map(Object.entries(entries)),
  get length() {
    return this._map.size;
  },
  key(index) {
    return [...this._map.keys()][index] ?? null;
  },
  getItem(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  },
  setItem(key, value) {
    this._map.set(key, String(value));
  },
};

const sessions = listLocalSessions(fakeStorage);
check('session locale détectée', sessions.length === 1 && sessions[0].sessionId === 'sess_A');
check('volume de la session', sessions[0].rowCount === 6 && sessions[0].matchCount === 2);

const local = loadLocalSession(prefix, fakeStorage);
check('session locale chargée', local.rows.length === 6);
check('meta de session locale', local.meta.sourceKind === 'local');

check('filtres vides = toutes les lignes', filterRows(rows, {}).length === 6);

console.log(`\n${passed} vérifications — Fast Direct Analytics validées.`);
