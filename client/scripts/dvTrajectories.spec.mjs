// Vérifie les trajectoires DataVolley (flèches, filtres, agrégats).
// Exécution : node client/scripts/dvTrajectories.spec.mjs
import {
  actionTrajectory, buildShots, directionCoverage, summarizeShots, endZoneCounts,
} from '../src/utils/dvTrajectories.js';

let failures = 0;
function check(label, ok) {
  if (ok) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}`); }
}

const A1 = { uid: 1, team: 'home', player_number: 4, action: 'A', start_zone: '4', end_zone: '5', end_subzone: 'A', evaluation: '#' };
const A2 = { uid: 2, team: 'home', player_number: 4, action: 'A', start_zone: '4', end_zone: '1', evaluation: '=' };
const A3 = { uid: 3, team: 'home', player_number: 7, action: 'A', start_zone: '2', evaluation: '+' };
const A4 = { uid: 4, team: 'away', player_number: 9, action: 'A', start_zone: '4', end_zone: '5', start_x: 80, start_y: 10, end_x: 20, end_y: 70, evaluation: '#' };
const all = [A1, A2, A3, A4];

const t1 = actionTrajectory(A1);
check('trajectoire zone + sous-zone', t1 && t1.precision === 'subzone');
check('home attaque vers la droite', t1.to.x > t1.from.x);
check('sans arrivée : pas de flèche', actionTrajectory(A3) === null);
check('coordonnées xy', actionTrajectory(A4).precision === 'xy');
check('away attaque vers la gauche', actionTrajectory(A4).to.x < actionTrajectory(A4).from.x);
check('filtre équipe', buildShots(all, { team: 'home' }).length === 2);
check('filtre joueur', buildShots(all, { player: 7 }).length === 0);
check('filtre évaluation', buildShots(all, { team: 'home', evals: ['#'] }).length === 1);

const cov = directionCoverage(all, 'A', 'home');
check('couverture 2/3', cov.total === 3 && cov.withDirection === 2 && cov.pct === 67);
const sum = summarizeShots(buildShots(all, { team: 'home' }));
check('efficacité 0%', sum.total === 2 && sum.efficiency === 0 && sum.killPct === 50);
check('zones d’arrivée', endZoneCounts(buildShots(all, { team: 'home' }))['5'].count === 1);

if (failures) { console.log(`${failures} échec(s)`); process.exit(1); }
console.log('Tous les tests passent.');

// --- Export vers les fiches de trajectoires ---
import { actionsToTrajectoryShots, resultFromAction } from '../src/utils/dvTrajectories.js';
let bad2 = 0;
const c2 = (l, ok) => { if (!ok) bad2++; console.log((ok ? '  ok   ' : '  FAIL ') + l); };
const S1 = { uid: 10, team: 'home', player_number: 1, action: 'S', start_zone: '1', end_zone: '5', evaluation: '/' };
const exp = actionsToTrajectoryShots([A1, A2, A3, S1, { uid: 11, team: 'home', action: 'A', start_zone: '4', end_zone: '5', evaluation: '#' }]);
c2('export : 3 flèches valides', exp.shots.length === 3);
c2('export : 2 ignorées (sans arrivée / sans joueur)', exp.skipped === 2);
c2('export : # -> point', exp.shots[0].result === 'point' && exp.shots[0].kind === 'attack');
c2('export : = -> faute', exp.shots[1].result === 'faute');
c2('export : contrée au service -> continuité', exp.shots[2].kind === 'serve' && exp.shots[2].result === 'continuite');
c2('résultat : évaluation / -> contrée', resultFromAction({ evaluation: '/' }) === 'contree');
if (bad2) process.exit(1);

// --- Filtres combinaison / type / contreurs ---
import { distinctValues } from '../src/utils/dvTrajectories.js';
let bad3 = 0;
const c3 = (l, ok) => { if (!ok) bad3++; console.log((ok ? '  ok   ' : '  FAIL ') + l); };
const F = [
  { uid: 21, team: 'home', player_number: 4, action: 'A', start_zone: '4', end_zone: '5', combo: 'X1', type: 'H', num_blockers: '2', evaluation: '#' },
  { uid: 22, team: 'home', player_number: 4, action: 'A', start_zone: '4', end_zone: '1', combo: 'V5', type: 'T', num_blockers: '0', evaluation: '+' },
  { uid: 23, team: 'home', player_number: 5, action: 'A', start_zone: '3', end_zone: '6', combo: 'X1', type: 'H', num_blockers: '2', evaluation: '=' },
];
c3('filtre combinaison', buildShots(F, { team: 'home', combo: 'X1' }).length === 2);
c3('filtre type', buildShots(F, { team: 'home', type: 'T' }).length === 1);
c3('filtre contreurs', buildShots(F, { team: 'home', blockers: '2' }).length === 2);
c3('contreurs 0 pris en compte', buildShots(F, { team: 'home', blockers: '0' }).length === 1);
c3('filtres cumulés', buildShots(F, { team: 'home', combo: 'X1', blockers: '2', player: 5 }).length === 1);
c3('valeurs distinctes combos', distinctValues(F, 'A', 'home', 'combo').join() === 'V5,X1');
if (bad3) process.exit(1);

// --- Saisie clavier -> trajectoires (service avec sous-zone) ---
import { decomposeCode as dc } from '../src/utils/datavolley.js';
let bad4 = 0;
const c4 = (l, ok) => { if (!ok) bad4++; console.log((ok ? '  ok   ' : '  FAIL ') + l); };
const sv = { uid: 90, team: 'home', player_number: 4, action: 'S', ...dc('*04S61B#') };
const svT = actionTrajectory(sv);
c4('service *04S61B# : départ zone 6, arrivée zone 1 sous-zone B', sv.start_zone === '6' && sv.end_zone === '1' && sv.end_subzone === 'B');
c4('service avec sous-zone : précision subzone', svT && svT.precision === 'subzone');
const sv2 = { uid: 91, team: 'home', player_number: 4, action: 'S', ...dc('*04S5#') };
c4('service *04S5# : départ zone 1, arrivée 5', sv2.start_zone === '1' && sv2.end_zone === '5' && actionTrajectory(sv2).precision === 'zone');
if (bad4) process.exit(1);
