// Vérifie le socle des playlists de séance (mode « Playlists ») : poste de
// départ d'une attaque, filtres joueur × action × poste, matrice joueur × poste,
// entrées de playlist (action seule ou point entier) et exports (CSV, EDL).
// Exécution : node client/scripts/playlists.spec.mjs
import { decomposeCode } from '../src/utils/datavolley.js';
import {
  PLAYLIST_POSTE_IDS,
  buildPlayerPlaylists,
  edlReelName,
  filterPlaylistPoints,
  itemsFromMatches,
  matchedActionIndexes,
  matchesActionFilters,
  movePlaylistItem,
  normalizePlaylistItems,
  parsePlaylistItems,
  playlistItemFromRally,
  playlistStats,
  playlistToCsv,
  playlistToEdl,
  posteLabel,
  posteOfAction,
  rallyMatchesFilters,
  rallyPlaylist,
  removePlaylistItem,
  secondsToTimecode,
  selectMatches,
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
// Match de test : 3 points, une attaque par point (postes 2, arrière, 4).
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
const rallies = rallyPlaylist(actions, sync);

console.log('\n== Poste de départ d’une attaque ==');
eq('postes proposés', PLAYLIST_POSTE_IDS, ['4', '3', '2', 'arriere']);
eq('libellé du poste 4', posteLabel('4'), '4 — avant gauche');
eq('libellé de l’arrière', posteLabel('arriere'), 'Arrière (5, 6, 1, 7, 8, 9)');
eq('zone 4 → poste 4', posteOfAction({ action: 'A', start_zone: '4' }), '4');
eq('zone 2 → poste 2', posteOfAction({ action: 'A', start_zone: '2' }), '2');
eq('zone 6 (pipe) → arrière', posteOfAction({ action: 'A', start_zone: '6' }), 'arriere');
eq('zone 8 → arrière', posteOfAction({ action: 'A', start_zone: '8' }), 'arriere');
eq('champ historique attack_zone', posteOfAction({ action: 'A', attack_zone: 'deca' }), '4');
eq('service : pas de poste', posteOfAction({ action: 'S', start_zone: '1' }), null);
eq('attaque sans zone : pas de poste', posteOfAction({ action: 'A' }), null);
eq('code combiné X1 (centre)', posteOfAction(decomposeCode('*04AX1#')), '3');
eq('code combiné VP (pipe)', posteOfAction(decomposeCode('a11AVP#')), 'arriere');
eq('code à zone explicite', posteOfAction(decomposeCode('*04A4#')), '4');

console.log('\n== Points et segments vidéo du match ==');
eq('3 points dérivés', rallies.length, 3);
eq('segments du point 1', [rallies[0].segmentStart, rallies[0].segmentEnd], [6, 19]);
eq('segments du point 2', [rallies[1].segmentStart, rallies[1].segmentEnd], [36, 49]);
eq('numérotation des points', rallies.map((r) => r.pointNumber), [1, 2, 3]);
eq('numérotation des index', rallies.map((r) => r.index), [1, 2, 3]);

console.log('\n== Filtres joueur × action × poste ==');
const attaqueAway8 = { action: 'A', team: 'away', player_number: 8, set_number: 1, start_zone: '8' };
eq('bon joueur + bon poste', matchesActionFilters(attaqueAway8, { team: 'away', playerNumber: 8, action: 'A', poste: 'arriere' }), true);
eq('mauvais poste', matchesActionFilters(attaqueAway8, { poste: '4' }), false);
eq('mauvais joueur', matchesActionFilters(attaqueAway8, { playerNumber: 7 }), false);
eq('mauvais set', matchesActionFilters(attaqueAway8, { setNumber: 2 }), false);
eq('le tri par poste ignore les services', matchesActionFilters({ action: 'S', team: 'home', player_number: 4 }, { poste: 'arriere' }), false);
eq('poste = tous : services conservés', matchesActionFilters({ action: 'S', team: 'home', player_number: 4 }, { poste: 'all' }), true);
eq('point 1 retenu (attaque n°8 zone 2)', rallyMatchesFilters(rallies[0], { team: 'away', playerNumber: 8, action: 'A', poste: '2' }), true);
eq('point 2 écarté', rallyMatchesFilters(rallies[1], { team: 'away', playerNumber: 8, action: 'A', poste: '2' }), false);

console.log('\n== Filtres du « Point par point » (codage) ==');
// Critères « présents dans le point » : le point passe dès qu'il contient l'élément demandé.
eq('sans filtre : tous les points', filterPlaylistPoints(rallies, {}).length, 3);
eq('équipe présente', filterPlaylistPoints(rallies, { team: 'away' }).length, 3);
eq('action présente', filterPlaylistPoints(rallies, { action: 'A' }).length, 3);
eq('évaluation présente', filterPlaylistPoints(rallies, { evaluation: '#' }).length, 3);
eq('conclusion du point', filterPlaylistPoints(rallies, { method: 'kill' }).length, 3);
eq('conclusion absente', filterPlaylistPoints(rallies, { method: 'ace' }).length, 0);

// « Joueur » et « poste » s'appliquent à la MÊME action.
eq('joueur seul (n°4 au service)', filterPlaylistPoints(rallies, { playerNumber: 4 }).length, 2);
eq('joueur + action', filterPlaylistPoints(rallies, { playerNumber: 4, action: 'S' }).length, 2);
eq('n°8 en poste 2', filterPlaylistPoints(rallies, { playerNumber: 8, poste: '2' }).length, 1);
eq('n°8 en arrière', filterPlaylistPoints(rallies, { playerNumber: 8, poste: 'arriere' }).length, 1);
eq('n°8 en poste 4 : rien', filterPlaylistPoints(rallies, { playerNumber: 8, poste: '4' }).length, 0);
eq('n°7 (réception) en poste 2 : rien', filterPlaylistPoints(rallies, { playerNumber: 7, poste: '2' }).length, 0);
eq('n°8 en poste 2 avec évaluation #', filterPlaylistPoints(rallies, { playerNumber: 8, poste: '2', evaluation: '#' }).length, 1);
eq('n°8 en poste 2 avec évaluation = : rien', filterPlaylistPoints(rallies, { playerNumber: 8, poste: '2', evaluation: '=' }).length, 0);
eq('mauvaise équipe : rien', filterPlaylistPoints(rallies, { team: 'home', playerNumber: 8 }).length, 0);
eq('surlignage de l’action retenue', [...matchedActionIndexes(rallies[0], { playerNumber: 8, poste: '2' })], [3]);
eq('surlignage vide si le point ne correspond pas', matchedActionIndexes(rallies[1], { playerNumber: 8, poste: '2' }).size, 0);

console.log('\n== Matrice joueur × poste ==');
const roster = [{ number: 8, name: 'Martin', role: 'middle' }];
const away = buildPlayerPlaylists(rallies, { team: 'away', roster });
const home = buildPlayerPlaylists(rallies, { team: 'home' });
eq('joueurs de l’équipe extérieure', away.map((p) => p.number), [3, 7, 8, 10]);
eq('nom repris de l’effectif', away.find((p) => p.number === 8).name, 'Martin');
eq('n°8 : 2 actions, 2 attaques', [away.find((p) => p.number === 8).total, away.find((p) => p.number === 8).counts.A], [2, 2]);
eq('n°8 : postes 2 et arrière', away.find((p) => p.number === 8).postes, { 2: 1, arriere: 1 });
eq('n°3 : réception + attaque', away.find((p) => p.number === 3).counts, { R: 1, A: 1 });
eq('n°3 : attaque au poste 4', away.find((p) => p.number === 3).postes, { 4: 1 });
eq('passeur : 3 passes, aucun poste', [away.find((p) => p.number === 10).counts.E, away.find((p) => p.number === 10).postes], [3, {}]);
eq('équipe au service : n°4 et n°12', home.map((p) => [p.number, p.counts.S]), [[4, 2], [12, 1]]);

const n8 = away.find((p) => p.number === 8);
eq('sélection attaques en poste arrière', selectMatches(n8.matches, { action: 'A', poste: 'arriere' }).length, 1);
eq('sélection toutes ses attaques', selectMatches(n8.matches, { action: 'A' }).length, 2);
eq('sélection poste 4 : rien', selectMatches(n8.matches, { poste: '4' }).length, 0);

console.log('\n== Entrées de playlist (ajout manuel) ==');
const video = {
  id: 7,
  sync_uuid: 'uuid-1',
  filename: 'm1.mp4',
  original_name: 'R1 ASUL vs Nantes.mp4',
  display_name: '',
  team1_name: 'ASUL',
  team2_name: 'Nantes',
};
const attack = rallies[0].actions[3];
const item = playlistItemFromRally(rallies[0], attack, { video, sync, teamLabel: 'Nantes', playerName: 'Martin', poste: '2' });
eq('match référencé', [item.video_id, item.video_uuid], [7, 'uuid-1']);
eq('nom du match et fichier', [item.video_label, item.video_filename], ['R1 ASUL vs Nantes.mp4', 'm1.mp4']);
eq('libellés du match', [item.team1_name, item.team2_name, item.team_label], ['ASUL', 'Nantes', 'Nantes']);
eq('joueur et poste', [item.player_number, item.player_name, item.poste], [8, 'Martin', '2']);
eq('action reprise', [item.action_code, item.action, item.evaluation], ['a08A2#', 'A', '#']);
eq('point, set et index', [item.point_number, item.set_number, item.action_index], [1, 1, 3]);
eq('segment du point entier', [item.segment_start, item.segment_end], [6, 19]);
eq('portée par défaut', item.scope, 'rally');
eq('avance et sortie mémorisées', [item.lead_in, item.lead_out], [4, 3]);
eq('poste déduit du code', playlistItemFromRally(rallies[0], attack, { video, sync }).poste, '2');

const actionItem = playlistItemFromRally(rallies[0], attack, { video, sync, scope: 'action' });
eq('portée « action seule »', actionItem.scope, 'action');
eq('segment de l’action seule', [actionItem.segment_start, actionItem.segment_end], [12, 19]);

const shifted = playlistItemFromRally(rallies[0], { action: 'A', timecode: null, system_time: 100 }, {
  video,
  sync: { sync_offset: 10, lead_in: 4, lead_out: 3 },
  scope: 'action',
});
eq('offset appliqué au timecode système', [shifted.segment_start, shifted.segment_end], [106, 113]);
eq('action sans temps : entrée refusée', playlistItemFromRally(rallies[0], { action: 'A', timecode: null, system_time: null }, { video, sync, scope: 'action' }), null);

const built = itemsFromMatches(selectMatches(n8.matches, { action: 'A', poste: 'arriere' }), { video, sync });
eq('sélection transformée en entrée', built.length, 1);
eq('poste conservé dans l’entrée', built[0].poste, 'arriere');

console.log('\n== Nettoyage et compteurs ==');
const raw = [
  { ...item, position: 9 },
  { id: 'sans-video', video_id: null, video_uuid: null, segment_start: 0, segment_end: 5 },
  { ...item, id: 'inverse', video_id: 8, segment_start: 30, segment_end: 10 },
];
const normalized = normalizePlaylistItems(raw);
eq('entrées jouables conservées', normalized.length, 1);
eq('position renumérotée', normalized[0].position, 1);
eq('identifiant conservé', normalized[0].id, item.id);
eq('lecture depuis le JSON de la base', parsePlaylistItems(JSON.stringify([item])).length, 1);
eq('JSON illisible ignoré', parsePlaylistItems('{').length, 0);
eq('valeur absente ignorée', parsePlaylistItems(null).length, 0);

const item2 = playlistItemFromRally(rallies[1], rallies[1].actions[3], {
  video: { id: 9, sync_uuid: 'uuid-2', filename: 'm2.mp4', original_name: 'R2.mp4' },
  sync,
});
const list = normalizePlaylistItems([item, item2]);
const stats = playlistStats(list);
eq('compteurs de la playlist', [stats.count, stats.matches, stats.duration], [2, 2, 26]);
const moved = movePlaylistItem(list, 0, 1);
eq('ordre après déplacement', moved.map((it) => it.video_id), [9, 7]);
eq('positions après déplacement', moved.map((it) => it.position), [1, 2]);
const trimmed = removePlaylistItem(moved, item2.id);
eq('retrait d’une entrée', [trimmed.length, trimmed[0].video_id, trimmed[0].position], [1, 7, 1]);

console.log('\n== Exports (feuille de séance) ==');
const csv = playlistToCsv(list);
check('en-tête CSV', csv.split('\n')[0].startsWith('#;Match;Équipe;Joueur;Poste;Set;Point;Code;'), csv.split('\n')[0]);
check('joueur et poste lisibles', csv.includes('n°08 Martin') && csv.includes('2 — avant droit'));
check('timecodes lisibles', csv.includes('0:06.0;0:19.0'));
const edl = playlistToEdl(list, { title: 'Séance n°4', fps: 25 });
const edlLines = edl.split('\n');
eq('titre EDL', edlLines[0], 'TITLE: Séance n°4');
eq('format EDL', edlLines[1], 'FCM: NON-DROP FRAME');
check('source et montage', edl.includes('00:00:06:00 00:00:19:00 00:00:00:00 00:00:13:00'), edlLines[3]);
check('clip source', edl.includes('* FROM CLIP NAME: m1.mp4'));
check('commentaire', edl.includes('* COMMENT: a08A2# · n°08 Martin · 2 — avant droit · point 1 · set 1'));
eq('timecode 6,5 s à 25 i/s', secondsToTimecode(6.5, 25), '00:00:06:13');
eq('nom de bande court', edlReelName({ video_label: 'R1 — ASUL vs Nantes.mp4' }), 'R1_ASUL_');

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);


