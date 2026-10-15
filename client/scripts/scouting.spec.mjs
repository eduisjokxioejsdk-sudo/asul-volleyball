// ============================================================================
// Vérifie le moteur de scouting : ventilations par évaluation / type / zone,
// situations, complexe I/II, rotations, classements, filtres par set.
// Exécution : node client/scripts/scouting.spec.mjs
// ============================================================================
import {
  SKILLS,
  addSkillAction,
  attackEfficiency,
  attackSuccessPct,
  blockEfficiency,
  computeComplex,
  computeRankings,
  computeRotations,
  computeScouting,
  computeSituations,
  describeType,
  directionTableRows,
  emptySkillAgg,
  emptySkills,
  firstReceptionAttack,
  mergeSkillAgg,
  playersWithSkill,
  receptionPerfectPct,
  receptionPositivePct,
  serveEfficiency,
  setEfficiencyRows,
  skillLabel,
  skillMetrics,
  skillOfAction,
  tacticTableRows,
  teamTotals,
  zoneCellRows,
} from '../src/utils/scouting.js';
import { groupActionsIntoRallies } from '../src/utils/datavolley.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
const near = (a, b, eps = 0.05) => Math.abs(a - b) < eps;

console.log('\n== Catalogue des compétences ==');
check('7 compétences', SKILLS.length === 7, `${SKILLS.length}`);
check('libellés', SKILLS.map((s) => s.label).join(',') === 'Service,Réception,Attaque,Contre,Défense,Passe,Ballon libre');
check('action → compétence', skillOfAction('A') === 'attack' && skillOfAction('F') === 'freeball');
check('action inconnue : null', skillOfAction('Z') === null);
check('libellé par id', skillLabel('dig') === 'Défense');

console.log('\n== Agrégat d’une compétence ==');
const agg = emptySkillAgg();
addSkillAction(agg, { action: 'S', evaluation: '#', type: 'M', end_zone: '5' });
addSkillAction(agg, { action: 'S', evaluation: '=', type: 'M', end_zone: '1' });
addSkillAction(agg, { action: 'S', evaluation: '+', end_zone: '5' });
check('total', agg.total === 3);
check('par évaluation', agg.byEval['#'] === 1 && agg.byEval['='] === 1 && agg.byEval['+'] === 1);
check('par type', agg.byType.M === 2);
check('zone cible du service (end_zone)', agg.byZone['5'] === 2 && agg.byZone['1'] === 1);
check('points / fautes', agg.points === 1 && agg.errors === 1);
check('positives', agg.positive === 2 && agg.perfect === 1);
check('issues classées', agg.outcomes.point === 1 && agg.outcomes.error === 1 && agg.outcomes.positive === 1);
check('efficacité service', near(serveEfficiency(agg), 0), `${serveEfficiency(agg)}`);
const agg2 = emptySkillAgg();
addSkillAction(agg2, { action: 'A', evaluation: '#', start_zone: '4', end_zone: '5' });
addSkillAction(agg2, { action: 'A', evaluation: '/', start_zone: '4', end_zone: '1' });
addSkillAction(agg2, { action: 'A', evaluation: '=', start_zone: '6' });
addSkillAction(agg2, { action: 'A', evaluation: '!', start_zone: '2' });
check('attaque : zone de départ', agg2.byZone['4'] === 2 && agg2.byZone['6'] === 1 && agg2.byZone['2'] === 1);
check('attaque : zone visée', agg2.byEndZone['5'] === 1 && agg2.byEndZone['1'] === 1);
check('attaque : points / fautes / contrées', agg2.points === 1 && agg2.errors === 1 && agg2.blocked === 1);
check('attaque : « ! » comptée positive', agg2.positive === 2);
check('réussite à l’attaque', near(attackSuccessPct(agg2), 25), `${attackSuccessPct(agg2)}`);
check('efficacité à l’attaque', near(attackEfficiency(agg2), -25), `${attackEfficiency(agg2)}`);

const aggR = emptySkillAgg();
addSkillAction(aggR, { action: 'R', evaluation: '#', start_zone: '5' });
addSkillAction(aggR, { action: 'R', evaluation: '+', start_zone: '6' });
addSkillAction(aggR, { action: 'R', evaluation: '-', start_zone: '1' });
addSkillAction(aggR, { action: 'R', evaluation: '=', start_zone: '1' });
check('réception : positive %', near(receptionPositivePct(aggR), 50), `${receptionPositivePct(aggR)}`);
check('réception : parfaite %', near(receptionPerfectPct(aggR), 25), `${receptionPerfectPct(aggR)}`);
check('réception : zone lue (start_zone)', aggR.byZone['1'] === 2);

const aggB = emptySkillAgg();
addSkillAction(aggB, { action: 'B', evaluation: '#' });
addSkillAction(aggB, { action: 'B', evaluation: '=' });
check('contre : points et fautes', aggB.points === 1 && aggB.errors === 1);
check('contre : efficacité', near(blockEfficiency(aggB), 0), `${blockEfficiency(aggB)}`);
const aggSub = emptySkillAgg();
addSkillAction(aggSub, { action: 'A', evaluation: '#', start_zone: '4', end_zone: '1', end_subzone: 'A' });
check('sous-zone relevée', aggSub.bySubzone.A === 1);

const aggCombo = emptySkillAgg();
addSkillAction(aggCombo, { action: 'A', evaluation: '#', code: '*09AX1#' });
addSkillAction(aggCombo, { action: 'A', evaluation: '+', code: '*11AXP#' });
check('attaque : comptage par combinaison', aggCombo.byCombo['X1'] === 1 && aggCombo.byCombo['XP'] === 1);
const aggCall = emptySkillAgg();
addSkillAction(aggCall, { action: 'E', evaluation: '#', code: '*07EK1#' });
check('passe : comptage par appel', aggCall.byCall['K1'] === 1);

console.log('\n== Table par combinaison ==');
const sideCombo = {
  players: [
    { number: 9, skills: { attack: emptySkillAgg() } },
    { number: 11, skills: { attack: emptySkillAgg() } },
  ],
  totals: { skills: { attack: emptySkillAgg() } },
};
addSkillAction(sideCombo.players[0].skills.attack, { action: 'A', evaluation: '#', code: '*09AX1#' });
addSkillAction(sideCombo.players[0].skills.attack, { action: 'A', evaluation: '=', code: '*09AX1#' });
addSkillAction(sideCombo.players[1].skills.attack, { action: 'A', evaluation: '/', code: '*11AXP#' });
const combos = tacticTableRows(sideCombo, 'attack', 'combo');
check('combinaisons triées (X1 en tête)', combos[0].code === 'X1' && combos[0].total === 2);
check('X1 : 1 point / 1 faute', combos[0].points === 1 && combos[0].errors === 1);
check('XP : 1 contrée', combos.find((c) => c.code === 'XP').blocked === 1);
check('libellé de combinaison', combos[0].label === 'A Quick');

console.log('\n== Fusion et sous-totaux ==');
const merged = mergeSkillAgg(emptySkillAgg(), agg);
check('fusion : totaux additionnés', merged.total === agg.total && merged.byEval['#'] === 1);
check('fusion : types fusionnés', merged.byType.M === 2);
check('skills vides : 7 compétences', Object.keys(emptySkills()).length === 7);

console.log('\n== Efficacité par set ==');
const reportParSet = {
  bySet: {
    1: {
      setNumber: 1,
      home: { totals: { stats: { serve: { total: 4, points: 1, errors: 1 }, attack: { total: 4, points: 2, errors: 1, blocked: 0 }, block: { points: 1 }, reception: { total: 4, positive: 2, perfect: 1 } } } },
      away: { totals: { stats: { serve: { total: 3, points: 0, errors: 2 }, attack: { total: 3, points: 1, errors: 1, blocked: 1 }, block: { points: 0 }, reception: { total: 3, positive: 1, perfect: 0 } } } },
    },
  },
};
const serRows = setEfficiencyRows(reportParSet);
check('une ligne par set', serRows.length === 1 && serRows[0].setNumber === 1);
check('eff. service domicile = 0', serRows[0].home.serve === 0);
check('points domicile = service + attaque + contre', serRows[0].home.points === 4);
check('eff. attaque extérieur négative', serRows[0].away.attEff === -33.3);

console.log('\n== Directions d’attaque ==');
const aggDir = emptySkillAgg();
addSkillAction(aggDir, { action: 'A', evaluation: '#', start_zone: '4', end_zone: '1' });
addSkillAction(aggDir, { action: 'A', evaluation: '=', start_zone: '4', end_zone: '1' });
addSkillAction(aggDir, { action: 'A', evaluation: '#', start_zone: '2', end_zone: '5' });
const dirs = directionTableRows({ players: [{ number: 9, skills: { attack: aggDir } }] }, 'attack');
check('direction la plus fréquente 4→1', dirs[0].key === '41' && dirs[0].total === 2);
check('direction 4→1 : 1 point / 1 faute', dirs[0].points === 1 && dirs[0].errors === 1);
check('direction 2→5 présente', dirs.some((d) => d.key === '25' && d.total === 1));

console.log('\n== Métriques par compétence ==');
check('métriques service', skillMetrics('serve', agg).efficiency !== undefined);
check('métriques réception', skillMetrics('reception', aggR).positivePct === 50 && skillMetrics('reception', aggR).perfectPct === 25);
check('métriques attaque', skillMetrics('attack', agg2).blocked === 1 && skillMetrics('attack', agg2).successPct === 25);
check('métriques défense (générique)', skillMetrics('dig', emptySkillAgg()).efficiency === 0);
console.log('\n== Situations (réception → 1re attaque) ==');
const rallySit = groupActionsIntoRallies([
  { code: 'a05S-', action: 'S', evaluation: '-', team: 'away', player_number: 5, action_index: 0 },
  { code: '*03R#', action: 'R', evaluation: '#', team: 'home', player_number: 3, action_index: 1 },
  { code: '*09A4#', action: 'A', evaluation: '#', team: 'home', player_number: 9, start_zone: '4', action_index: 2 },
]);
check('paire détectée', firstReceptionAttack(rallySit[0].actions, 'home')?.situation === '+');
check('aucune paire pour l’adversaire', firstReceptionAttack(rallySit[0].actions, 'away') === null);
const sit = computeSituations(rallySit);
check('total situation +', sit.home['+'].total === 1);
check('point compté', sit.home['+'].points === 1 && sit.home['+'].successPct === 100);
check('zone mémorisée', sit.home['+'].zones['4'] === 1);
check('situation 0 vide', sit.home['0'].total === 0 && sit.home['0'].successPct === 0);
check('adversaire sans situation', sit.away['+'].total === 0);

console.log('\n== Complexe I / II ==');
const rallyCX = groupActionsIntoRallies([
  // Échange 1 : home sert et marque d'un ace (transition gagnée).
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 0 },
  // Échange 2 : away sert, faute de réception de home (transition gagnée par away).
  { code: 'a05S-', action: 'S', evaluation: '-', team: 'away', player_number: 5, action_index: 1 },
  { code: '*02R=', action: 'R', evaluation: '=', team: 'home', player_number: 2, action_index: 2 },
]);
const cx = computeComplex(rallyCX);
check('complexe II (au service) : 1 point joué', cx.home.transition.total === 1, `${cx.home.transition.total}`);
check('complexe II gagné', cx.home.transition.won === 1 && cx.home.transition.pct === 100);
check('complexe I (en réception) : 1 point joué', cx.home.sideOut.total === 1);
check('complexe I perdu (R= encaissé)', cx.home.sideOut.won === 0 && cx.home.sideOut.pct === 0);
check('adversaire : complexe I perdu (receveur battu)', cx.away.sideOut.total === 1 && cx.away.sideOut.won === 0, `${cx.away.sideOut.won}`);
check('adversaire : complexe II gagné', cx.away.transition.total === 1 && cx.away.transition.won === 1 && cx.away.transition.pct === 100);

console.log('\n== Rotations ==');
const rallyRot = groupActionsIntoRallies([
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 0 },
  { code: '*01S-', action: 'S', evaluation: '-', team: 'home', player_number: 1, action_index: 1 },
  { code: 'a05R=', action: 'R', evaluation: '=', team: 'away', player_number: 5, action_index: 2 },
  { code: '*03S+', action: 'S', evaluation: '+', team: 'home', player_number: 3, action_index: 3 },
  { code: 'a05R!', action: 'R', evaluation: '!', team: 'away', player_number: 5, action_index: 4 },
  { code: 'a09A4=', action: 'A', evaluation: '=', team: 'away', player_number: 9, start_zone: '4', action_index: 5 },
]);
const rot = computeRotations(rallyRot, { 1: { first_server: 'team1', home_setter_pos: 'P1', away_setter_pos: 'P4' } });
check('rotation home P1 : points joués', rot.home.P1.rallies === 3, `${rot.home.P1.rallies}`);
check('rotation home P1 : gagnés', rot.home.P1.won === 3 && rot.home.P1.pct === 100, `${rot.home.P1.pct}`);
check('rotation home P1 : service compté', rot.home.P1.serve.total === 3, `${rot.home.P1.serve.total}`);
check('rotation home P1 : efficacité service', near(rot.home.P1.serveEfficiency, 33.3, 0.1), `${rot.home.P1.serveEfficiency}`);
check('rotation away P4 : attaque comptée', rot.away.P4.attack.total === 1);
check('rotation away P4 : efficacité attaque', near(rot.away.P4.attackEfficiency, -100), `${rot.away.P4.attackEfficiency}`);
check('rotations vides par défaut', rot.home.P3.rallies === 0 && rot.home.P3.pct === 0);
console.log('\n== Classements ==');
const side = {
  players: [
    { number: 1, points: 2, skills: { serve: { total: 5, points: 2, errors: 1 }, reception: { total: 0, byEval: {} }, attack: { total: 0, points: 0, errors: 0, blocked: 0 }, block: { points: 0, total: 0 } } },
    { number: 2, points: 8, skills: { serve: { total: 1, points: 0, errors: 0 }, reception: { total: 6, byEval: { '#': 4, '+': 1 } }, attack: { total: 10, points: 6, errors: 2, blocked: 1 }, block: { points: 0, total: 0 } } },
    { number: 3, points: 3, skills: { serve: { total: 0, points: 0, errors: 0 }, reception: { total: 0, byEval: {} }, attack: { total: 0, points: 0, errors: 0, blocked: 0 }, block: { points: 3, total: 5 } } },
  ],
};
const rk = computeRankings(side);
check('meilleur marqueur', rk.points?.player.number === 2);
check('meilleur serveur (min 3 services)', rk.serve?.player.number === 1, `${rk.serve?.player?.number}`);
check('meilleur réceptionneur', rk.reception?.player.number === 2);
check('meilleur attaquant', rk.attack?.player.number === 2);
check('meilleur contreur', rk.block?.player.number === 3);
const noAction = { players: [{ number: 9, points: 0, skills: { serve: { total: 0 }, reception: { total: 0 }, attack: { total: 0 }, block: { points: 0 } } }] };
check('joueur sans action exclu', computeRankings(noAction).points === null);

console.log('\n== Rapport complet ==');
const actions = [
  { uid: 'a1', code: '*01SM5#', action: 'S', evaluation: '#', team: 'home', player_number: 1, type: 'M', end_zone: '5', action_index: 0 },
  { uid: 'a2', code: 'a05R=', action: 'R', evaluation: '=', team: 'away', player_number: 5, start_zone: '5', action_index: 1 },
  { uid: 'a3', code: 'a04S-', action: 'S', evaluation: '-', team: 'away', player_number: 4, action_index: 2 },
  { uid: 'a4', code: '*07R!', action: 'R', evaluation: '!', team: 'home', player_number: 7, start_zone: '6', action_index: 3 },
  { uid: 'a5', code: '*09A4#', action: 'A', evaluation: '#', team: 'home', player_number: 9, start_zone: '4', end_zone: '1', action_index: 4 },
  { uid: 'a6', code: 'a02S+', action: 'S', evaluation: '+', team: 'away', player_number: 2, action_index: 5 },
  { uid: 'a7', code: '*03R#', action: 'R', evaluation: '#', team: 'home', player_number: 3, start_zone: '1', action_index: 6 },
  { uid: 'a8', code: '*11AP4=', action: 'A', evaluation: '=', team: 'home', player_number: 11, type: 'P', start_zone: '4', action_index: 7 },
];
const setMap = new Map(actions.map((a) => [a.uid, a.action_index < 5 ? 1 : 2]));
const report = computeScouting({
  actions,
  homeName: 'ASUL',
  awayName: 'Visiteurs',
  setMap,
  homeConfig: { roster: [{ number: 1, name: 'Un', role: 'setter' }, { number: 9, name: 'Neuf', role: 'outside' }, { number: 7, name: 'Sept', role: 'middle' }] },
  awayConfig: { roster: [{ number: 5, name: 'Cinq', role: 'libero' }] },
  setups: { 1: { first_server: 'team1', home_setter_pos: 'P1', away_setter_pos: 'P4' }, 2: { first_server: 'team2', home_setter_pos: 'P2', away_setter_pos: 'P5' } },
  setterNumbers: { home: 1 },
});
check('actionCount', report.actionCount === 8, `${report.actionCount}`);
check('sets listés', report.sets.join(',') === '1,2');
check('effectif conservé même sans action', report.home.players.some((p) => p.number === 7));
check('joueur hors effectif ajouté', report.home.players.some((p) => p.number === 11));
check('points du joueur 1', report.home.players.find((p) => p.number === 1).points === 1);
check('totaux d’équipe = somme des joueurs', report.home.totals.points === report.home.players.reduce((s, p) => s + p.points, 0));
check('rôle labellisé', report.home.players.find((p) => p.number === 9).roleLabel === 'Réceptionneur');
check('situations / complexe / rotations présents', !!report.home.situations && !!report.home.complex && !!report.home.rotations);
check('classements calculés', !!report.home.rankings);
check('aide : joueurs avec la compétence service', playersWithSkill(report.home, 'serve').length >= 1);
const zc = zoneCellRows(report.home.players.find((p) => p.number === 1).skills.serve);
check('aide : zones triées avec %', zc.rows[0].zone === '5' && zc.rows[0].pct === 100, JSON.stringify(zc.rows));
check('aide : description de type', describeType('S', 'M').label === 'Smashée');
const r1 = computeScouting({ actions, setMap, sets: [1] });
check('filtre par set : 5 actions du set 1', r1.actionCount === 5, `${r1.actionCount}`);
check('filtre par set : sets disponibles conservés', r1.sets.join(',') === '1,2');
check('filtre par set : sets actifs = 1', r1.activeSets.join(',') === '1');
const bySet2 = report.bySet[2];
check('vue par set : joueurs actifs seulement', bySet2.home.players.every((p) => p.total > 0));
check('vue par set : totaux cohérents (2 actions home)', bySet2.home.totals.total === 2, `${bySet2.home.totals.total}`);
check('vue par set : complexe recalculé', !!bySet2.home.complex);
check('rapport vide sans action', computeScouting({ actions: [] }).home.totals.total === 0);
check('effectif seul : aucune action comptée', computeScouting({ actions: [], homeConfig: { roster: [{ number: 4, name: 'X' }] } }).home.totals.total === 0);

console.log('\n== Totaux d’équipe (fonction dédiée) ==');
const p1 = { number: 1, total: 2, points: 1, faults: 1, skills: emptySkills() };
addSkillAction(p1.skills.serve, { action: 'S', evaluation: '#' });
addSkillAction(p1.skills.serve, { action: 'S', evaluation: '=' });
const p2 = { number: 2, total: 1, points: 1, faults: 0, skills: emptySkills() };
addSkillAction(p2.skills.attack, { action: 'A', evaluation: '#' });
const totals = teamTotals([p1, p2]);
check('total actions', totals.total === 3);
check('total points / fautes', totals.points === 2 && totals.faults === 1);
check('agrégats fusionnés', totals.skills.serve.total === 2 && totals.skills.attack.total === 1);
check('numéro du total neutralisé', totals.number === 0);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);