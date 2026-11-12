// Vérifications de l'onglet « Six & rôles » : rôles repris de la fiche
// équipe, et alternance automatique du premier serveur.
// Exécution : node client/scripts/lineup-setup.spec.mjs
import { mergeKnownPlayers, normalizeTeamConfig } from '../src/utils/lineup.js';
import { firstServerForSet } from '../src/utils/rotation.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Rôles repris de la fiche équipe ==');
const team = normalizeTeamConfig({
  players: [
    { number: 4, name: 'Passeur', role: 'setter' },
    { number: 7, name: 'Central', role: 'middle' },
    { number: 9, name: 'Pointu', role: 'opposite' },
    { number: 12, name: 'Libéro', role: 'libero' },
  ],
  libero: 12,
  libero_for: 7,
});

const empty = { roster: [], libero: null, liberoFor: null };
const filled = mergeKnownPlayers(empty, team.roster, { libero: team.libero, liberoFor: team.liberoFor });
check('rôle passeur appliqué au n°4', filled.roster.find((p) => p.number === 4)?.role === 'setter');
check('rôle central appliqué au n°7', filled.roster.find((p) => p.number === 7)?.role === 'middle');
check('rôle pointu appliqué au n°9', filled.roster.find((p) => p.number === 9)?.role === 'opposite');
check('nom du joueur repris', filled.roster.find((p) => p.number === 7)?.name === 'Central');
check('libéro repris de l’équipe', filled.libero === 12);
check('joueur remplacé par le libéro repris', filled.liberoFor === 7);

const custom = mergeKnownPlayers(
  { roster: [{ number: 7, name: 'Central', role: 'outside' }], libero: null, liberoFor: null },
  team.roster
);
check('rôle déjà choisi dans le match conservé', custom.roster.find((p) => p.number === 7)?.role === 'outside');
check('un joueur du six absent de la fiche reste polyvalent', mergeKnownPlayers(empty, []).roster.length === 0);

console.log('\n== Alternance du premier serveur ==');
const setupsA = { 1: { first_server: 'team1' } };
check('set 1 : équipe A', firstServerForSet(setupsA, 1) === 'team1');
check('set 2 : équipe B', firstServerForSet(setupsA, 2) === 'team2');
check('set 3 : équipe A', firstServerForSet(setupsA, 3) === 'team1');
check('set 4 : équipe B', firstServerForSet(setupsA, 4) === 'team2');
check('set 5 : équipe A', firstServerForSet(setupsA, 5) === 'team1');

const setupsB = { 1: { first_server: 'team2' } };
check('set 2 inversé quand B sert au set 1', firstServerForSet(setupsB, 2) === 'team1');
check('set 3 inversé quand B sert au set 1', firstServerForSet(setupsB, 3) === 'team2');
check('valeur enregistrée pour un ancien set ignorée au profit de l’alternance', firstServerForSet(
  { 1: { first_server: 'team2' }, 2: { first_server: 'team2' } },
  2
) === 'team1');

console.log(failures === 0 ? '\nTOUT EST OK' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
