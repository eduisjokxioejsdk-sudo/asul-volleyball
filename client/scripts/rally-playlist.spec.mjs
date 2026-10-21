// Vérifie la logique de la playlist de rallies : construction, tri, statistiques
// et navigation (point suivant / précédent, avec boucle).
// Exécution : node client/scripts/rally-playlist.spec.mjs
import {
  PLAYLIST_SORTS,
  buildPlaylist,
  nextPlaylistIndex,
  playlistIndexOfAction,
  playlistStats,
  prevPlaylistIndex,
  sortPlaylist,
} from '../src/utils/rallyPlaylist.js';

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

// --- Construction ---------------------------------------------------------

const raw = [
  { pointNumber: 3, actions: [{ action_index: 5, code: 'S', timecode: 30 }, { action_index: 6, code: 'A', timecode: 33 }] },
  { pointNumber: 1, actions: [{ action_index: 1, code: 'S', timecode: 10 }] },
  { pointNumber: 2, actions: [{ action_index: 3, code: 'R', timecode: 20 }] },
];

const pl = buildPlaylist(raw);
check('la playlist garde le nombre de points', pl.length === 3, `obtenu ${pl.length}`);
eq('le code du point est la concaténation des actions', pl[0].code, 'SA');
eq('le nombre d\'actions est calculé', pl[0].actionCount, 2);
eq('le premier timecode est retenu', pl[0].firstTimecode, 30);
eq('le dernier timecode est retenu', pl[0].lastTimecode, 33);

const empty = buildPlaylist([]);
check('une liste vide donne une playlist vide', empty.length === 0);
check('une entrée invalide ne casse rien', buildPlaylist([null, undefined]).length === 2);

// --- Tri ------------------------------------------------------------------

eq('tri par ordre de point', sortPlaylist(pl, 'order', 'asc').map((r) => r.pointNumber), [1, 2, 3]);
eq('tri par ordre décroissant', sortPlaylist(pl, 'order', 'desc').map((r) => r.pointNumber), [3, 2, 1]);
eq('tri par timecode', sortPlaylist(pl, 'time', 'asc').map((r) => r.pointNumber), [1, 2, 3]);
eq('tri par nombre d\'actions', sortPlaylist(pl, 'actions', 'asc').map((r) => r.pointNumber), [1, 2, 3]);
eq('tri par nombre d\'actions décroissant', sortPlaylist(pl, 'actions', 'desc').map((r) => r.pointNumber), [3, 1, 2]);
eq('tri par code', sortPlaylist(pl, 'code', 'asc').map((r) => r.code), ['R', 'S', 'SA']);
check('le tri ne modifie pas la liste d\'origine', pl.map((r) => r.pointNumber).join(',') === '3,1,2');
check('les tris connus sont listés', PLAYLIST_SORTS.includes('order') && PLAYLIST_SORTS.includes('code'));

// --- Statistiques ---------------------------------------------------------

const stats = playlistStats(pl);
eq('le nombre de points est compté', stats.count, 3);
eq('le nombre d\'actions total est compté', stats.actions, 4);
check('la moyenne d\'actions est calculée', Math.abs(stats.avgActions - 4 / 3) < 1e-9, `obtenu ${stats.avgActions}`);
const stats0 = playlistStats([]);
eq('une playlist vide a des stats nulles', stats0.count, 0);

// --- Navigation -----------------------------------------------------------

eq('l\'index du point contenant l\'action est trouvé', playlistIndexOfAction(pl, 3), 2);
eq('une action absente donne -1', playlistIndexOfAction(pl, 99), -1);
eq('un index d\'action nul donne -1', playlistIndexOfAction(pl, null), -1);

eq('le point suivant avance', nextPlaylistIndex(pl, 0), 1);
eq('après le dernier point il n\'y a pas de suivant', nextPlaylistIndex(pl, 2), -1);
eq('avec la boucle on revient au début', nextPlaylistIndex(pl, 2, true), 0);

eq('le point précédent recule', prevPlaylistIndex(pl, 2), 1);
eq('avant le premier point il n\'y a pas de précédent', prevPlaylistIndex(pl, 0), -1);
eq('avec la boucle on revient à la fin', prevPlaylistIndex(pl, 0, true), 2);

eq('une playlist vide n\'a pas de suivant', nextPlaylistIndex([], 0), -1);
eq('une playlist vide n\'a pas de précédent', prevPlaylistIndex([], 0), -1);

console.log(failures === 0 ? '\nOK — playlist de rallies' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
