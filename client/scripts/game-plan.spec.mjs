// Vérifie les plans de jeu et cônes d'attaque tactiques DataVolley (client/src/utils/gamePlan.js).
// Exécution : node client/scripts/game-plan.spec.mjs
import { classifyAttackDirection, computePlayerGamePlan, computeTeamGamePlan } from '../src/utils/gamePlan.js';
import { emptySkills, addSkillAction } from '../src/utils/scouting.js';

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Classification des Directions d’Attaque ==');
check('Poste 4 → Ligne (1)', classifyAttackDirection('4', '1') === 'line');
check('Poste 4 → Diagonale (5)', classifyAttackDirection('4', '5') === 'cross');
check('Poste 4 → Centre (6)', classifyAttackDirection('4', '6') === 'middle');
check('Poste 4 → Cut (4/7)', classifyAttackDirection('4', '7') === 'cut');
check('Poste 2 → Ligne (5)', classifyAttackDirection('2', '5') === 'line');
check('Poste 2 → Diagonale (1)', classifyAttackDirection('2', '1') === 'cross');
check('Poste 3 → Diagonale droite (1)', classifyAttackDirection('3', '1') === 'cross-right');
check('Poste 3 → Diagonale gauche (5)', classifyAttackDirection('3', '5') === 'cross-left');

console.log('\n== Fiche de Plan de Jeu Joueur ==');
const player = {
  number: 9,
  name: 'Ngapeth Earvin',
  role: 'outside',
  skills: emptySkills(),
};

// Ajout de 10 attaques : 7 en diagonale (4->5), 2 en ligne (4->1), 1 contrée
for (let i = 0; i < 7; i++) {
  addSkillAction(player.skills.attack, { action: 'A', evaluation: '#', start_zone: '4', end_zone: '5' });
}
for (let i = 0; i < 2; i++) {
  addSkillAction(player.skills.attack, { action: 'A', evaluation: '+', start_zone: '4', end_zone: '1' });
}
addSkillAction(player.skills.attack, { action: 'A', evaluation: '/', start_zone: '4', end_zone: '5' });

// Ajout de 5 services vers zone 5 et 1
addSkillAction(player.skills.serve, { action: 'S', evaluation: '#', end_zone: '5', type: 'S' });
addSkillAction(player.skills.serve, { action: 'S', evaluation: '+', end_zone: '5', type: 'S' });
addSkillAction(player.skills.serve, { action: 'S', evaluation: '+', end_zone: '5', type: 'S' });
addSkillAction(player.skills.serve, { action: 'S', evaluation: '-', end_zone: '1', type: 'S' });
addSkillAction(player.skills.serve, { action: 'S', evaluation: '=', end_zone: '1', type: 'S' });

const plan = computePlayerGamePlan(player);

check('Nom et numéro conservés', plan.number === 9 && plan.name === 'Ngapeth Earvin');
check('Volume d’attaques (10)', plan.attack.total === 10);
check('Cône P4 total (10)', plan.attack.cones.P4.total === 10);
check('Attaques en diagonale Z5 (8)', plan.attack.cones.P4.cross === 8);
check('Attaques le long de la ligne Z1 (2)', plan.attack.cones.P4.line === 2);
check('Consigne tactique P4 détectée', plan.attack.tacticalAdvice.P4.includes('Forte tendance Diagonale'));
check('Zone de service préférée (Zone 5)', plan.serve.preferredZones[0].zone === '5' && plan.serve.preferredZones[0].pct === 60);

console.log('\n== Plan de Jeu Équipe Adverse ==');
const teamPlan = computeTeamGamePlan({ players: [player] });
check('Fiche équipe générée', teamPlan.length === 1 && teamPlan[0].number === 9);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
