// Vérifie le rapport global des trajectoires : flèches réunies (services +
// attaque), agrégation par joueur, totaux et taux de réussite d'équipe.
// Exécution : node client/scripts/trajectoryReport.spec.mjs
import {
  ATTACK_START_ZONES,
  TRAJECTORY_RESULTS,
  attackZone,
  filterShotsByZone,
  playerReport,
  resultsForKind,
  shotsOfKind,
  shotsReport,
  sumCounts,
  teamReport,
} from '../src/utils/trajectory.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

/** Flèche minimale : le rapport ne regarde que le joueur, la frappe et l'issue. */
const shot = (player_number, kind, result) => ({ team_side: 'home', player_number, kind, result });

const shots = [
  shot(4, 'serve', 'point'),
  shot(4, 'serve', 'out'),
  shot(4, 'attack', 'point'),
  shot(4, 'attack', 'feinte_point'),
  shot(4, 'attack', 'contree'),
  shot(7, 'serve', 'continuite'),
  shot(7, 'attack', 'faute'),
];

console.log('\n== Flèches réunies (onglet « Tout ») ==');
check('« Tout » réunit services et attaques', shotsOfKind(shots, 'all').length === 7, `${shotsOfKind(shots, 'all').length}`);
check('services seuls', shotsOfKind(shots, 'serve').length === 3);
check('attaques seules', shotsOfKind(shots, 'attack').length === 4);
check('liste absente acceptée', shotsOfKind(null, 'all').length === 0);

console.log('\n== Somme des compteurs ==');
check('somme d’un dictionnaire', sumCounts({ a: 2, b: 3 }) === 5);
check('somme d’un dictionnaire vide', sumCounts({}) === 0);
check('somme d’un objet absent', sumCounts(null) === 0);

console.log('\n== Rapport d’un joueur ==');
const p4 = playerReport(shots, 4);
check('total services + attaque', p4.total === 5, `${p4.total}`);
check('services', p4.serveTotal === 2, `${p4.serveTotal}`);
check('attaques', p4.attackTotal === 3, `${p4.attackTotal}`);
check('points (feinte comprise)', p4.points === 3, `${p4.points}`);
check('fautes et sorties', p4.errors === 1, `${p4.errors}`);
check('taux de réussite', Math.abs(p4.successRate - 3 / 5) < 1e-9, `${p4.successRate}`);
check('détail des issues', p4.counts.contree === 1 && p4.counts.feinte_point === 1);
check('numéro comparé en chaîne', playerReport(shots, '4').total === 5);
check('joueur sans flèche', playerReport(shots, 9).total === 0);
check('joueur sans flèche : taux 0', playerReport(shots, 9).successRate === 0);

console.log('\n== Rapport d’équipe ==');
const roster = [
  { number: 4, name: 'Ada', role: 'outside' },
  { number: 7, name: 'Bea', role: 'middle' },
  { number: 12, name: 'Cleo', role: 'setter' },
];
const report = teamReport(shots, roster);
check('un rapport par joueur de l’effectif', report.players.length === 3, `${report.players.length}`);
check('effectif conservé sans flèche', report.players.find((p) => p.player_number === 12)?.total === 0);
check('noms repris de l’effectif', report.players[0].name === 'Ada' && report.players[1].name === 'Bea');
check('total d’équipe = somme des flèches', report.total === 7, `${report.total}`);
check('services d’équipe', report.serveTotal === 3, `${report.serveTotal}`);
check('attaques d’équipe', report.attackTotal === 4, `${report.attackTotal}`);
check('taux de réussite d’équipe', Math.abs(report.successRate - 3 / 7) < 1e-9, `${report.successRate}`);

const extra = teamReport([shot(99, 'serve', 'point')], roster);
check(
  'numéro hors effectif ajouté à la fin',
  extra.players.length === 4 && extra.players[3].player_number === 99,
  extra.players.map((p) => p.player_number).join(',')
);
check('rôle par défaut hors effectif', extra.players[3].role === 'universal');
check('rapport d’une équipe vide', teamReport([], []).total === 0 && teamReport([], []).players.length === 0);

console.log('\n== Issues de l’onglet « Tout » ==');
check(
  'issues du rapport global = celles de l’attaque',
  resultsForKind('all').map((r) => r.id).join(',') === resultsForKind('attack').map((r) => r.id).join(',')
);
check('la contrée est comprise', resultsForKind('all').some((r) => r.id === 'contree'));
check('7 issues au catalogue', TRAJECTORY_RESULTS.length === 7);

console.log('\n== Tri des attaques par poste de départ ==');
check(
  '4 postes proposés',
  ATTACK_START_ZONES.map((z) => z.id).join(',') === '4,3,2,arriere',
  ATTACK_START_ZONES.map((z) => z.id).join(',')
);
// Repère du terrain : 1 unité = 10 cm, ligne d'attaque à 3 m du filet.
check('avant gauche → zone 4', attackZone({ x: 75, y: 20 }) === '4', attackZone({ x: 75, y: 20 }));
check('avant centre → zone 3', attackZone({ x: 75, y: 50 }) === '3', attackZone({ x: 75, y: 50 }));
check('avant droit → zone 2', attackZone({ x: 75, y: 80 }) === '2', attackZone({ x: 75, y: 80 }));
check('sur la ligne d’attaque : avant', attackZone({ x: 65, y: 20 }) === '4', attackZone({ x: 65, y: 20 }));
check('juste derrière la ligne d’attaque : arrière', attackZone({ x: 55, y: 80 }) === 'arriere', attackZone({ x: 55, y: 80 }));
check('fond de terrain → arrière', attackZone({ x: 30, y: 20 }) === 'arriere', attackZone({ x: 30, y: 20 }));
check('service lancé du fond → arrière', attackZone({ x: 2, y: 80 }) === 'arriere', attackZone({ x: 2, y: 80 }));
// Équipe de droite : même repère, vu de son propre camp.
check('côté droit : avant gauche → zone 4', attackZone({ x: 115, y: 80 }, 'away') === '4', attackZone({ x: 115, y: 80 }, 'away'));
check('côté droit : avant centre → zone 3', attackZone({ x: 115, y: 50 }, 'away') === '3', attackZone({ x: 115, y: 50 }, 'away'));
check('côté droit : avant droit → zone 2', attackZone({ x: 115, y: 20 }, 'away') === '2', attackZone({ x: 115, y: 20 }, 'away'));
check('côté droit : fond → arrière', attackZone({ x: 160, y: 80 }, 'away') === 'arriere', attackZone({ x: 160, y: 80 }, 'away'));
check('point illisible', attackZone(null) === null && attackZone({ x: 'a', y: 1 }) === null);

const zoneShots = [
  { kind: 'serve', start: { x: 2, y: 80 } },
  { kind: 'attack', start: { x: 75, y: 20 } }, // 4
  { kind: 'attack', start: { x: 75, y: 80 } }, // 2
  { kind: 'attack', start: { x: 30, y: 50 } }, // arrière
];
check('sans tri : tout est affiché', filterShotsByZone(zoneShots, []).length === 4);
check('zone 4 : le service reste affiché', filterShotsByZone(zoneShots, ['4']).length === 2, `${filterShotsByZone(zoneShots, ['4']).length}`);
check('zone 2 : le service reste affiché', filterShotsByZone(zoneShots, ['2']).length === 2);
check('plusieurs postes', filterShotsByZone(zoneShots, ['4', '2']).length === 3);
check('poste arrière', filterShotsByZone(zoneShots, ['arriere']).length === 2);
check('poste sans attaque', filterShotsByZone(zoneShots, ['3']).length === 1);
check('liste absente acceptée', filterShotsByZone(null, ['4']).length === 0);
const awayZoneShots = [
  { kind: 'attack', start: { x: 115, y: 80 } }, // 4 côté droit
  { kind: 'attack', start: { x: 115, y: 20 } }, // 2 côté droit
];
check('côté droit : zone 4', filterShotsByZone(awayZoneShots, ['4'], 'away').length === 1);
check('côté droit : zone 2', filterShotsByZone(awayZoneShots, ['2'], 'away').length === 1);

console.log('\n== Cohérence du rapport brut ==');
check('total = somme des issues', sumCounts(shotsReport(shots).counts) === shotsReport(shots).total);
check('rapport vide', shotsReport([]).total === 0 && shotsReport([]).successRate === 0);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
