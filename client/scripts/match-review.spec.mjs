// Vérifie le socle du mode « Relecture » : points prêts à lire (segments sans
// les temps morts), point en cours pendant la lecture, navigation entre points,
// temps morts évités et filtres action / qualité / position sur ces points.
// Exécution : node client/scripts/match-review.spec.mjs
import {
  deadTimeGaps,
  isLightCoding,
  pointIndexAt,
  reviewPoints,
  reviewTotals,
  stepPoint,
} from '../src/utils/matchReview.js';
import {
  filterPlaylistPoints,
  matchedActionIndexes,
  playlistItemFromRally,
  posteOfAction,
} from '../src/utils/playlists.js';

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

// ---------------------------------------------------------------------------
// Match de test : 3 points, temps morts de 17 s entre chacun.
// ---------------------------------------------------------------------------
const action = (code, act, evaluation, team, player_number, action_index, timecode, extra = {}) => ({
  code, action: act, evaluation, team, player_number, action_index, timecode, set_number: 1, ...extra,
});

const actions = [
  action('*04S+', 'S', '+', 'home', 4, 0, 10),
  action('a07R#', 'R', '#', 'away', 7, 1, 12),
  action('a10E+', 'E', '+', 'away', 10, 2, 14),
  action('a08A2#', 'A', '#', 'away', 8, 3, 16, { start_zone: '2' }),
  action('*12S+', 'S', '+', 'home', 12, 4, 40),
  action('a07R#', 'R', '#', 'away', 7, 5, 42),
  action('a10E+', 'E', '+', 'away', 10, 6, 44),
  action('a08A8#', 'A', '#', 'away', 8, 7, 46, { start_zone: '8' }),
  action('*04S+', 'S', '+', 'home', 4, 8, 70),
  action('a03R#', 'R', '#', 'away', 3, 9, 72),
  action('a10E+', 'E', '+', 'away', 10, 10, 74),
  action('a03A4#', 'A', '#', 'away', 3, 11, 76, { start_zone: '4' }),
];

const sync = { sync_offset: 0, lead_in: 4, lead_out: 3 };
const points = reviewPoints(actions, sync);

console.log('\n== Points de relecture (segments sans les temps morts) ==');
eq('3 points dérivés', points.length, 3);
eq('segments du point 1', [points[0].segmentStart, points[0].segmentEnd], [6, 19]);
eq('segments du point 2', [points[1].segmentStart, points[1].segmentEnd], [36, 49]);
eq('segments du point 3', [points[2].segmentStart, points[2].segmentEnd], [66, 79]);
eq('numérotation des points', points.map((p) => p.pointNumber), [1, 2, 3]);
eq('les actions voyagent avec le point', points[1].actions.map((a) => a.code), [
  '*12S+', 'a07R#', 'a10E+', 'a08A8#',
]);
check('les segments sont ordonnés', points.every((p, i) => i === 0 || p.segmentStart >= points[i - 1].segmentEnd));

console.log('\n== Réglages du match (lead-in / lead-out / offset) ==');
const tight = reviewPoints(actions, { sync_offset: 0, lead_in: 2, lead_out: 1 });
eq('lead-in 2 s / lead-out 1 s', [tight[0].segmentStart, tight[0].segmentEnd], [8, 17]);
const shifted = reviewPoints(
  actions.map((a) => ({ ...a, timecode: null, system_time: a.timecode })),
  { sync_offset: 5, lead_in: 4, lead_out: 3 }
);
eq('system_time + offset', [shifted[0].segmentStart, shifted[0].segmentEnd], [11, 24]);

console.log('\n== Codage sans évaluation (mode Consultation) ==');
eq('codage noté : découpage par issue', isLightCoding(actions), false);
const lightActions = [
  action('*04S', 'S', '', 'home', 4, 0, 10),
  action('a07R', 'R', '', 'away', 7, 1, 12),
  action('a10A', 'A', '', 'away', 10, 2, 16),
  action('*12S', 'S', '', 'home', 12, 3, 40),
  action('a07R', 'R', '', 'away', 7, 4, 42),
  action('a10A', 'A', '', 'away', 10, 5, 46),
];
eq('codage de consultation reconnu', isLightCoding(lightActions), true);
const lightPoints = reviewPoints(lightActions, sync);
eq('découpage par service', lightPoints.map((p) => p.actions.length), [3, 3]);
eq('deux segments de consultation', [lightPoints[1].segmentStart, lightPoints[1].segmentEnd], [36, 49]);

console.log('\n== Points sans timecode (match non synchronisé) ==');
const unsynced = reviewPoints(
  actions.map((a) => ({ ...a, timecode: null, system_time: null })),
  sync
);
eq('aucun point lisible', unsynced.length, 0);
const partiallySynced = reviewPoints(
  actions.map((a) => (a.action_index < 4 ? a : { ...a, timecode: null, system_time: null })),
  sync
);
eq('seul le point synchronisé est lisible', partiallySynced.map((p) => p.pointNumber), [1]);

console.log('\n== Point en cours pendant la lecture ==');
eq('dans le point 1', pointIndexAt(points, 12), 0);
eq('dans le point 2', pointIndexAt(points, 40), 1);
eq('dans le point 3 (dernière seconde)', pointIndexAt(points, 78.5), 2);
eq('temps mort entre les points 1 et 2', pointIndexAt(points, 25), -1);
eq('avant le premier point', pointIndexAt(points, 2), -1);
eq('après le dernier point', pointIndexAt(points, 100), -1);
eq('temps inconnu', pointIndexAt(points, null), -1);
eq('temps non numérique', pointIndexAt(points, 'abc'), -1);

console.log('\n== Navigation entre points ==');
eq('premier pas depuis rien', stepPoint(points, -1, 1), 0);
eq('point suivant', stepPoint(points, 0, 1), 1);
eq('point précédent', stepPoint(points, 2, -1), 1);
eq('borné au dernier point', stepPoint(points, 2, 1), 2);
eq('borné au premier point', stepPoint(points, 0, -1), 0);
eq('liste vide', stepPoint([], 0, 1), -1);

console.log('\n== Temps morts évités ==');
const gaps = deadTimeGaps(points);
eq('deux temps morts sautés', gaps.map((g) => Number(g.duration.toFixed(2))), [17, 17]);
eq('bornes du premier temps mort', [gaps[0].start, gaps[0].end], [19, 36]);
const totals = reviewTotals(points, 100);
eq('durée couverte', totals.covered, 39);
eq('temps morts évités (match de 100 s)', totals.skipped, 61);
eq('durée inconnue : temps morts non calculés', reviewTotals(points, null).skipped, null);
eq('un seul point : aucun temps mort', deadTimeGaps(points.slice(0, 1)).length, 0);

console.log('\n== Filtres action / qualité / position (relecture) ==');
eq('sans filtre : tous les points', filterPlaylistPoints(points, {}).length, 3);
eq('filtre action (attaque)', filterPlaylistPoints(points, { action: 'A' }).length, 3);
eq('filtre qualité (# sur l’attaque du n°8 en poste 2)', filterPlaylistPoints(points, { playerNumber: 8, poste: '2', evaluation: '#' }).length, 1);
eq('filtre position (poste 4)', filterPlaylistPoints(points, { poste: '4' }).length, 1);
eq('filtre position (arrière)', filterPlaylistPoints(points, { poste: 'arriere' }).length, 1);
eq('position 2 : point du n°8 uniquement', filterPlaylistPoints(points, { playerNumber: 8, poste: '2' }).map((p) => p.pointNumber), [1]);
eq('surlignage de l’action retenue', [...matchedActionIndexes(points[0], { playerNumber: 8, poste: '2' })], [3]);

console.log('\n== Ajout à une playlist depuis la relecture ==');
const video = { id: 7, filename: 'match.mp4', sync_uuid: 'uuid-7', display_name: 'ASUL vs Visiteurs', team1_name: 'ASUL', team2_name: 'Visiteurs' };
const rallyPoint = filterPlaylistPoints(points, { playerNumber: 8, poste: '2' })[0];
const attack = rallyPoint.actions[3];
eq('poste de l’attaque n°8', posteOfAction(attack), '2');
const itemAction = playlistItemFromRally(rallyPoint, attack, { video, sync, scope: 'action', playerName: 'Paul', teamLabel: 'ASUL' });
eq('action seule : segment autour de l’action', [itemAction.segment_start, itemAction.segment_end], [12, 19]);
const itemRally = playlistItemFromRally(rallyPoint, attack, { video, sync, scope: 'rally', playerName: 'Paul', teamLabel: 'ASUL' });
eq('point entier : segment du point', [itemRally.segment_start, itemRally.segment_end], [6, 19]);
eq('référence du match conservée', [itemRally.video_id, itemRally.video_uuid, itemRally.video_label], [7, 'uuid-7', 'ASUL vs Visiteurs']);
eq('joueur et poste conservés', [itemRally.player_number, itemRally.player_name, itemRally.poste], [8, 'Paul', '2']);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

