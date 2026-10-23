// ============================================================================
// TEST : SANCTIONS, PÉNALITÉS ET AJUSTEMENTS ARBITRE (Point 4)
// Exécution : node client/scripts/sanctions.spec.mjs
// ============================================================================

import { computeMatchState } from '../src/utils/rotation.js';
import { parseCommand, commandToEvent } from '../src/utils/codingTools.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Test 1 : Parsing des commandes d’arbitrage (parseCommand) ==');

const cmdCY = parseCommand('*CY07');
check('Parse Carton Jaune *CY07', cmdCY.kind === 'sanction' && cmdCY.card === 'Y' && cmdCY.player === 7 && cmdCY.team === 'home');

const cmdCR = parseCommand('aCR04');
check('Parse Carton Rouge aCR04', cmdCR.kind === 'sanction' && cmdCR.card === 'R' && cmdCR.player === 4 && cmdCR.team === 'away');

const cmdDelay = parseCommand('*DY');
check('Parse Avertissement Retard *DY', cmdDelay.kind === 'delay' && cmdDelay.card === 'Y');

const cmdVC = parseCommand('*VC+');
check('Parse Video Check *VC+', cmdVC.kind === 'challenge' && cmdVC.outcome === 'won');

const cmdPoint = parseCommand('*P');
check('Parse Point Arbitre *P', cmdPoint.kind === 'point_adjust' && cmdPoint.team === 'home');

console.log('\n== Test 2 : Conversion en Événement Match (commandToEvent) ==');

const evCY = commandToEvent(cmdCY, { setNumber: 1, pointNumber: 10 });
check('Génère événement Carton Jaune', evCY.kind === 'sanction' && evCY.payload.card === 'Y' && evCY.payload.player === 7);

const evCR = commandToEvent(cmdCR, { setNumber: 1, pointNumber: 12 });
check('Génère événement Carton Rouge', evCR.kind === 'sanction' && evCR.payload.card === 'R');

console.log('\n== Test 3 : Impact Carton Rouge sur le Score et le Service ==');

// Un carton rouge contre l'équipe 'away' donne +1 point et le service à 'home'
const eventsWithRed = [
  {
    id: 1,
    kind: 'sanction',
    team: 'away',
    set_number: 1,
    point_number: 5,
    payload: { card: 'R', player: 4 },
  },
];

const stateWithRed = computeMatchState([], {}, {}, eventsWithRed);
check('Carton Rouge contre Extérieur accorde +1 pt à Domicile', stateWithRed.score.team1 === 1 && stateWithRed.score.team2 === 0, `score: ${JSON.stringify(stateWithRed.score)}`);
check('Carton Rouge donne la priorité de service à l’équipe bénéficiaire', stateWithRed.server === 'team1');

console.log('\n== Test 4 : Ajustement Arbitral Manuel de Point (*P / aP) ==');

const eventsAdjustment = [
  {
    id: 2,
    kind: 'point_adjust',
    team: 'home',
    set_number: 1,
    point_number: 1,
    payload: { delta: 1 },
  },
  {
    id: 3,
    kind: 'point_adjust',
    team: 'home',
    set_number: 1,
    point_number: 2,
    payload: { delta: 1 },
  },
];

const stateAdj = computeMatchState([], {}, {}, eventsAdjustment);
check('Ajustement manuel ajoute les points au set en cours', stateAdj.score.team1 === 2, `obtenu: ${stateAdj.score.team1}`);

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) dans le test des sanctions et arbitrage.`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests sanctions et arbitrage ont réussi !');
}
