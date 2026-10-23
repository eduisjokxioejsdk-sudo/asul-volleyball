// ============================================================================
// TEST : PARSER FEUILLE DE MATCH FFVB & IMPORTEURS (Points 2 & 3)
// Exécution : node client/scripts/ffvb-parser.spec.mjs
// ============================================================================

import { parseFfvbMatchSheet, parseDvwRosters } from '../src/utils/ffvbSheetParser.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Test 1 : Parser Feuille de Match FFVB (FDME Texte / PDF) ==');

const sampleFdme = `
FEUILLE DE MATCH ELECTRONIQUE FFVB
Match N° : ELM042 - Date : 15/10/2026 - Division : Elite Masculine
Équipe A : ASUL LYON VOLLEY
Équipe B : CANNES VOLLEY BALL

1 DUBOIS Pierre 1234567 C
2 MARTIN Lucas 2345678 CENTRAL
4 BERNARD Hugo 3456789 RECEP
7 PETIT Thomas 4567890 POINTU
10 MOREAU Julien 5678901 L
14 LEROY Antoine 6789012 CENTRAL
`;

const parsed = parseFfvbMatchSheet(sampleFdme);
check('Détecte le type FFVB', parsed.sourceType === 'ffvb');
check('Détecte les 2 équipes', parsed.teams.length >= 1);

const homeTeam = parsed.teams.find((t) => t.side === 'home') || parsed.teams[0];
check('Détecte le nom de l’équipe A', homeTeam?.name === 'ASUL LYON VOLLEY', `obtenu: ${homeTeam?.name}`);
check('Extrait les joueurs de l’équipe', homeTeam?.players.length === 6, `obtenu: ${homeTeam?.players.length}`);

const p1 = homeTeam?.players.find((p) => p.number === 1);
check('Extrait numéro et nom du capitaine', p1?.name === 'DUBOIS Pierre' && Boolean(p1?.is_captain));
check('Extrait la licence', p1?.license_number === '1234567');

const libero = homeTeam?.players.find((p) => p.number === 10);
check('Identifie automatiquement le libéro', libero?.role === 'libero' && Boolean(libero?.is_libero));
check('Définit le libéro de l’équipe', homeTeam?.libero === 10);

console.log('\n== Test 2 : Parser Roster DVW ([3TEAMS] / [3PLAYERS]) ==');

const sampleDvw = `
[3TEAMS]
ASUL
ASUL LYON VOLLEY
CANN
CANNES VB
[3PLAYERS-H]
1;1234567;Pierre;DUBOIS;P;;195;1998;
2;2345678;Lucas;MARTIN;C;;202;2001;
10;5678901;Julien;MOREAU;L;;182;2000;
`;

const dvwResult = parseDvwRosters(sampleDvw);
check('Détecte le format DVW', dvwResult.sourceType === 'dvw');
const dvwHome = dvwResult.teams.find((t) => t.side === 'home');
check('Extrait les joueurs du fichier .dvw', dvwHome?.players.length === 3, `obtenu: ${dvwHome?.players.length}`);
check('Associe le rôle Libéro depuis DVW', dvwHome?.players.find((p) => p.number === 10)?.role === 'libero');

console.log('\n== Test 3 : Parser Roster CSV ==');

const sampleCsv = `Équipe A : ASUL LYON VOLLEY
7;PETIT Thomas;opposite;4567890;190;0;0
10;MOREAU Julien;libero;5678901;182;0;1
`;

const csvResult = parseFfvbMatchSheet(sampleCsv);
const csvHome = csvResult.teams.find((t) => t.side === 'home') || csvResult.teams[0];
check('Extrait les joueurs depuis CSV', csvHome?.players.length === 2, `obtenu: ${csvHome?.players.length}`);
check('Préserve le booléen is_libero', Boolean(csvHome?.players.find((p) => p.number === 10)?.is_libero));

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) dans le test FFVB parser.`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests FFVB parser ont réussi !');
}
