// Vérifie le moteur unique de distribution.
// Exécution : node client/scripts/distributionModel.spec.mjs
import { buildDistributionPossessions, selectDistributionPossessions } from '../src/utils/distributionModel.js';
import { buildDistributionReport } from '../src/utils/distributionReport.js';

let bad = 0;
const check = (label, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` ${detail}`}`);
};
let uid = 0;
const mk = (team, n, action, extra = {}) => ({ uid: ++uid, action_index: uid, team, player_number: n, action, ...extra });
const rally = () => [mk('away', 99, 'S', { evaluation: '+' })];
const homeAttack = (first, set, attack = {}) => [
  ...rally(), first, set, mk('home', 9, 'A', { start_zone: '4', evaluation: '#', combo: 'X1', ...attack }),
];

const actions = [
  ...homeAttack(mk('home', 5, 'R', { evaluation: '#' }), mk('home', 2, 'E', { start_zone: '3', call: 'K1' })),
  ...rally(), mk('home', 5, 'D', { evaluation: '!' }), mk('home', 2, 'E'), mk('home', 9, 'A', { start_zone: '3', evaluation: '/' }),
  ...rally(), mk('home', 5, 'F', { evaluation: '-' }), mk('home', 2, 'E'), mk('home', 9, 'A', { start_zone: '8', evaluation: '+' }),
  ...rally(), mk('home', 2, 'E'), mk('home', 9, 'A', { start_zone: '4', evaluation: '#' }),
  ...rally(), mk('home', 5, 'R', { evaluation: '/' }), mk('home', 2, 'E'), mk('home', 9, 'A', { start_zone: '4', evaluation: '#' }),
  ...rally(), mk('home', 5, 'R', { evaluation: '+' }), mk('home', 2, 'E'), mk('home', 9, 'A', { evaluation: '#' }),
  ...rally(), mk('home', 5, 'R', { evaluation: '+' }), mk('home', 9, 'A', { start_zone: '4', evaluation: '#' }),
  mk('home', 99, 'S', { evaluation: '+' }), mk('away', 15, 'R', { evaluation: '+' }), mk('away', 12, 'E'), mk('away', 14, 'A', { start_zone: '2', evaluation: '=' }),
];

const all = buildDistributionPossessions(actions);
check('une possession par attaque', all.length === 8, `${all.length}`);
check('K1 / K2 / freeball détectés', all[0].phase === 'K1' && all[1].phase === 'K2' && all[2].phase === 'FREEBALL');
check('qualité brute conservée', all[0].rawEvaluation === '#' && all[0].situation === '+');
check('passe réelle et zone réelle', all[0].setterNumber === 2 && all[0].passZone === '3');
check('exclusions explicites', all[3].exclusions.includes('UNKNOWN_PHASE') && all[4].exclusions.includes('UNKNOWN_SITUATION') && all[5].exclusions.includes('UNKNOWN_ATTACK_ZONE'));
check('sans passe : rotation inconnue', all[6].rotation === null);

const selected = selectDistributionPossessions(all, { phase: 'ALL' });
check('4 attaques home éligibles sur 7', selected.eligible.filter((p) => p.team === 'home').length === 4);
check('exclusions home expliquées', selected.excluded.UNKNOWN_PHASE === 1 && selected.excluded.UNKNOWN_SITUATION === 2 && selected.excluded.UNKNOWN_ATTACK_ZONE === 1);

const report = buildDistributionReport(actions, null, {}, {}, { phase: 'ALL' });
check('totaux home : 7 brutes, 4 incluses', report.meta.home.rawAttacks === 7 && report.meta.home.included === 4);
check('sans compositions : les 4 rotations sont inconnues', report.meta.home.unknownRotation === 4);
check('somme des zones = total ALL', ['4','3','2','7','8','9','5','6','1'].reduce((n, z) => n + report.home.Total.ALL[z].count, 0) === report.home.Total.ALL.total);
check('efficacité globale = 25%', report.players.home[0].eff === 25);
check('situations séparées', report.players.home[0].bySituation['+'] === 2 && report.players.home[0].bySituation['0'] === 1 && report.players.home[0].bySituation['-'] === 1);
check('appel K1 agrégé une fois', report.calls.home.K1.total.total === 1 && report.calls.home.K1.total.killPct === 100);
check('combinaison X1 agrégée une fois', report.combos.home.X1.total.total === 1);
check('équipe adverse séparée', report.meta.away.rawAttacks === 1 && report.away.Total.ALL['2'].errors === 1);

const k1 = buildDistributionReport(actions, null, {}, {}, { phase: 'K1' });
check('K1 : deux attaques home incluses', k1.meta.home.included === 2);
check('K1 : zone 4 = 100%', k1.home.Total.ALL['4'].pct === 100);
check('K1 : dénominateur de situation séparé', k1.home.Total['+'].total === 2 && k1.home.Total['+']['4'].pct === 100);

const passZone = buildDistributionReport(actions, null, {}, {}, { phase: 'ALL', passZone: 'Z2_3' });
check('filtre zone de passe : seule la passe en zone 3', passZone.meta.home.included === 1);
check('zones de passe inconnues comptées', report.meta.home.unknownPassZone === 3);

const oneRally = homeAttack(mk('home', 5, 'R', { evaluation: '+' }), mk('home', 2, 'E', { start_zone: '3' }));
const setup = { 1: { first_server: 'team2', home_setter_pos: 'P1', away_setter_pos: 'P4', home_lineup: { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 }, away_lineup: { P1: 11, P2: 12, P3: 13, P4: 14, P5: 15, P6: 16 } } };
const rotated = buildDistributionPossessions(oneRally, { setups: setup });
check('rotation = position du passeur réel', rotated[0].rotation === 'P2', `${rotated[0].rotation}`);

const setterDug = homeAttack(mk('home', 2, 'R', { evaluation: '+' }), mk('home', 2, 'E'));
const dug = buildDistributionPossessions(setterDug);
check('passeur ayant défendu identifié', selectDistributionPossessions(dug, { defenderRole: 'SETTER_DUG' }).included.length === 1);
check('autre joueur ayant défendu exclu', selectDistributionPossessions(dug, { defenderRole: 'OTHER_DUG' }).included.length === 0);

if (bad) { console.log(`${bad} échec(s)`); process.exit(1); }
console.log('TOUT EST OK');

check('cellule zone : actions disponibles pour le détail vidéo', k1.home.Total.ALL['4'].actions.length === 2);
check('appel : actions disponibles pour le détail vidéo', report.calls.home.K1.total.actions.length === 1);
check('combinaison : actions disponibles pour le détail vidéo', report.combos.home.X1.total.actions.length === 1);
if (bad) process.exit(1);
