// Vérifie les parties pures de l'export de clips MP4 (mode « Playlists ») :
// regroupement par joueur / poste (jamais à cheval sur deux matchs), noms de
// fichiers, options ffmpeg selon le mode de coupe, feuille de séance CSV.
// Exécution : node server/scripts/clip-export.spec.mjs
import {
  buildGroups,
  clipFileName,
  clipOptions,
  groupFileName,
  groupKey,
  groupLabel,
  itemsToCsv,
  posteSlug,
  sanitizeLabel,
} from '../src/clipExport.js';

let failures = 0;
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}\n       attendu ${e}\n       obtenu  ${a}`);
  }
}
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

/** Entrée de playlist réaliste. */
const item = (overrides = {}) => ({
  id: 'pl_1',
  video_id: 7,
  video_uuid: 'u1',
  video_label: 'R1 ASUL vs Nantes.mp4',
  video_filename: 'm1.mp4',
  team_label: 'ASUL',
  player_number: 4,
  player_name: 'Martin',
  poste: '4',
  action_code: '*04AX1#',
  segment_start: 12,
  segment_end: 19,
  scope: 'action',
  point_number: 3,
  set_number: 1,
  ...overrides,
});

const items = [
  item(),
  item({ id: 'pl_2', action_code: 'a08A4#', player_number: 8, player_name: 'Paul', segment_start: 30, segment_end: 36 }),
  item({ id: 'pl_3', action_code: 'a08A8#', player_number: 8, player_name: 'Paul', poste: 'arriere', segment_start: 40, segment_end: 47 }),
  item({ id: 'pl_4', video_id: 9, video_uuid: 'u2', video_label: 'R2 vs Paris.mp4', segment_start: 60, segment_end: 68 }),
];

console.log('\n== Noms de fichiers ==');
eq('libellé nettoyé', sanitizeLabel('N°4 — Martin'), 'N_4_Martin');
eq('libellé vide', sanitizeLabel('   '), '');
eq('poste 4', posteSlug({ poste: '4' }), 'poste4');
eq('poste arrière', posteSlug({ poste: 'arriere' }), 'arriere');
eq('sans poste', posteSlug({}), 'sansposte');
eq('nom d’un clip', clipFileName(3, items[0]), '003_n04_Martin_poste4_04AX1.mp4');
eq('nom d’un groupe', groupFileName({ label: 'n04_Martin_poste4' }), 'n04_Martin_poste4.mp4');
eq(
  'groupe multi-matchs suffixé du match',
  groupFileName({ label: 'n04_Martin_poste4', videoLabel: 'R1 ASUL vs Nantes.mp4' }, true),
  'n04_Martin_poste4_R1_ASUL_vs_Nantes.mp4'
);

console.log('\n== Regroupements ==');
eq('clé joueur × poste', groupKey(items[0], 'player-poste'), 'v7|pn04|poste4');
eq('libellé joueur', groupLabel(items[1], 'player'), 'n08_Paul');
eq('libellé playlist', groupLabel(items[1], 'playlist'), 'playlist');
eq('toute la playlist : un fichier par match', buildGroups(items, 'playlist').map((g) => [g.videoId, g.items.length]), [[7, 3], [9, 1]]);
eq('par joueur (un fichier par match)', buildGroups(items, 'player').map((g) => [g.label, g.items.length]), [['n04_Martin', 1], ['n08_Paul', 2], ['n04_Martin', 1]]);
eq('par poste', buildGroups(items, 'poste').map((g) => [g.videoId, g.label, g.items.length]), [[7, 'poste4', 2], [7, 'arriere', 1], [9, 'poste4', 1]]);
eq(
  'par joueur et par poste',
  buildGroups(items, 'player-poste').map((g) => [g.label, g.items.length]),
  [['n04_Martin_poste4', 1], ['n08_Paul_poste4', 1], ['n08_Paul_arriere', 1], ['n04_Martin_poste4', 1]]
);
eq('aucune entrée', buildGroups([], 'player'), []);

console.log('\n== Options ffmpeg ==');
const copy = clipOptions(items[0], 'copy');
eq('début et durée', [copy.start, copy.duration], [12, 7]);
eq('mode rapide : copie de flux', copy.outputOptions.slice(0, 2), ['-c', 'copy']);
check('mode rapide : horodatage remis à zéro', copy.outputOptions.includes('-avoid_negative_ts'));
const precise = clipOptions(items[0], 'precise');
check('mode précis : réencodage H.264', precise.outputOptions.includes('libx264'));
check('mode précis : audio AAC', precise.outputOptions.includes('aac'));
check('lecture immédiate (faststart)', precise.outputOptions.includes('+faststart'));
eq('durée minimale garantie', clipOptions({ segment_start: 5, segment_end: 5 }, 'copy').duration, 0.1);

console.log('\n== Feuille de séance ==');
const csv = itemsToCsv(items);
const lines = csv.trim().split('\n');
check('en-tête', lines[0].startsWith('#;Match;Équipe;Joueur;Poste;Set;Point;Code;'), lines[0]);
check('une ligne par action', lines.length === items.length + 1, `${lines.length} ligne(s)`);
check('joueur et poste lisibles', lines[1].includes('n04 Martin') && lines[1].includes('Poste 4 (aile gauche)'));
check('durées calculées', lines[1].includes('12;19;7'), lines[1]);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
