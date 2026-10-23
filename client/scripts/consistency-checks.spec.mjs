// ============================================================================
// TEST : CONTRÔLES DE COHÉRENCE AVANCÉS EN DIRECT (Point 15)
// Exécution : node client/scripts/consistency-checks.spec.mjs
// ============================================================================

import { codeIssues } from '../src/utils/codingTools.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Test 1 : Détection Joueur Inconnu / Hors Effectif ==');

const actionsUnknown = [
  { uid: 'u1', team: 'home', player_number: 99, action: 'A', evaluation: '#', code: '*99A#' },
];
const issuesUnknown = codeIssues(actionsUnknown, {
  roster: { home: [1, 2, 4, 7, 10], away: [3, 5, 8] },
  enriched: true,
});
check('Signale joueur n°99 absent du roster', issuesUnknown.some((i) => i.kind === 'unknown_player' || i.issue === 'unknown_player'));

console.log('\n== Test 2 : Détection Libéro au Service ==');

const actionsLiberoServe = [
  { uid: 'u2', team: 'home', player_number: 10, action: 'S', evaluation: '+', code: '*10S+' },
];
const issuesLiberoServe = codeIssues(actionsLiberoServe, {
  liberos: { home: 10, away: 5 },
  enriched: true,
});
check('Signale libéro servant', issuesLiberoServe.some((i) => i.kind === 'libero_serve' || i.issue === 'libero_serve'));

console.log('\n== Test 3 : Détection Libéro Attaque / Contre au Filet ==');

const actionsLiberoAttack = [
  { uid: 'u3', team: 'home', player_number: 10, action: 'A', evaluation: '#', code: '*10A#' },
];
const issuesLiberoAttack = codeIssues(actionsLiberoAttack, {
  liberos: { home: 10, away: 5 },
  enriched: true,
});
check('Signale libéro attaquant', issuesLiberoAttack.some((i) => i.kind === 'libero_front_attack' || i.issue === 'libero_front_attack'));

const actionsLiberoBlock = [
  { uid: 'u4', team: 'home', player_number: 10, action: 'B', evaluation: '#', code: '*10B#' },
];
const issuesLiberoBlock = codeIssues(actionsLiberoBlock, {
  liberos: { home: 10, away: 5 },
  enriched: true,
});
check('Signale libéro contrant', issuesLiberoBlock.some((i) => i.kind === 'libero_front_attack' || i.issue === 'libero_front_attack'));

console.log('\n== Test 4 : Détection Double Fin de Point dans le même rally ==');

// Un service suivi de deux actions terminales dans le même échange
const actionsDoublePoint = [
  { uid: 'u5', team: 'home', player_number: 1, action: 'S', evaluation: '+', code: '*01S+' },
  { uid: 'u6', team: 'away', player_number: 4, action: 'A', evaluation: '#', code: 'a04A#' },
  { uid: 'u7', team: 'home', player_number: 7, action: 'B', evaluation: '#', code: '*07B#' },
];
const issuesDoublePoint = codeIssues(actionsDoublePoint, { enriched: true });
check('Signale double point d’affilée dans le même rally', issuesDoublePoint.some((i) => i.kind === 'double_point_ending' || i.issue === 'double_point_ending'));

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) dans le test des contrôles de cohérence.`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests de contrôle de cohérence ont réussi !');
}
