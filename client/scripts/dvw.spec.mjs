// Vérifie l'export / import .dvw (client/src/utils/dvw.js).
// Exécution : node client/scripts/dvw.spec.mjs
import { buildDvw, parseDvw } from '../src/utils/dvw.js';
import { isValidCode } from '../src/utils/datavolley.js';

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

const data = {
  match: { date: '2026-10-06', league: 'Amical', scout: 'Coach' },
  teams: { home: 'ASUL', away: 'Visiteurs' },
  rosters: {
    home: [{ number: 9, name: 'Dupont Jean' }, { number: 11, name: 'Bernard' }],
    away: [{ number: 12, name: 'Martin Paul' }],
  },
  sets: [],
  actions: [
    { code: '*09AX1#', set_number: 1, rally_number: 1, home_p1: 9, visiting_p1: 12 },
    { code: 'a12B#', set_number: 1, rally_number: 1 },
    { code: '*11SM5+', set_number: 2, rally_number: 4 },
  ],
};

console.log('\n== Construction du .dvw ==');
const dvw = buildDvw(data);
check('section [3DATAVOLLEY]', dvw.includes('[3DATAVOLLEY]'));
check('section [3MATCH]', dvw.includes('[3MATCH]'));
check('section [3MORE]', dvw.includes('[3MORE]'));
check('section [3TEAMS]', dvw.includes('[3TEAMS]'));
check('section [3PLAYERS]', dvw.includes('[3PLAYERS]*') && dvw.includes('[3PLAYERS]a'));
check('section [3SET]', dvw.includes('[3SET]'));
check('section [3ATTACKCOMBINATION]', dvw.includes('[3ATTACKCOMBINATION]'));
check('section [3SETTERCALL]', dvw.includes('[3SETTERCALL]'));
check('section [3SCOUT]', dvw.includes('[3SCOUT]'));
check('code présent', dvw.includes('*09AX1#'));

console.log('\n== Relecture (aller-retour format compact) ==');
const p = parseDvw(dvw);
check('équipes relues', p.teams.home === 'ASUL' && p.teams.away === 'Visiteurs');
check('effectif home relu', p.rosters.home.length === 2 && p.rosters.home[0].number === 9);
check('nom reconstruit', p.rosters.home[0].name === 'Jean Dupont' || p.rosters.home[0].name.includes('Dupont'));
check('effectif away relu', p.rosters.away.length === 1 && p.rosters.away[0].number === 12);
check('combinaisons relues', p.combinations.length > 0 && p.combinations[0].code === 'X1');
check('appels passeur relus', p.setterCalls.length > 0 && p.setterCalls[0].code === 'K1');
check('3 actions relues', p.actions.length === 3);
check('codes conservés', p.actions.map((a) => a.code).join(',') === '*09AX1#,a12B#,*11SM5+');
check('set conservé', p.actions[2].set_number === 2);
check('tous les codes restent valides', p.actions.every((a) => isValidCode(a.code)));
check('six du point exporté/relu (rotation point par point)', p.actions[0].home_p1 === '9' && p.actions[0].visiting_p1 === '12');

console.log('\n== Relecture format DataVolley 4 Officiel étendu (24 colonnes) ==');
const dv4Text = [
  '[3DATAVOLLEY]',
  'version=2.0',
  '[3MATCH]',
  'date=2026-10-06',
  '[3TEAMS]',
  '*;Tours VB;0;',
  'a;Montpellier;0;',
  '[3PLAYERS-H]',
  '*;09;1;;Grebennikov;Jenia;;;;Grebennikov;Jenia;',
  '[3PLAYERS-V]',
  'a;14;1;;Le Goff;Nicolas;;;;Le Goff;Nicolas;',
  '[3SCOUT]',
  '*09AH1#;p;p;;;;12:30:15;3;4;2;09;07;03;01;05;06;14;08;04;02;06;10;18;15;0;0;0;0;',
].join('\r\n');

const p4 = parseDvw(dv4Text);
check('DV4 équipes', p4.teams.home === 'Tours VB' && p4.teams.away === 'Montpellier');
check('DV4 effectif H', p4.rosters.home.length === 1 && p4.rosters.home[0].number === 9);
check('DV4 effectif V', p4.rosters.away.length === 1 && p4.rosters.away[0].number === 14);
check('DV4 action relue', p4.actions.length === 1 && p4.actions[0].code === '*09AH1#');
check('DV4 set lu depuis champ 7', p4.actions[0].set_number === 3);
check('DV4 score/rallye calculé (18+15=33)', p4.actions[0].rally_number === 33);
check('DV4 rotation P1-P6 home (P1=09)', p4.actions[0].home_p1 === '09');
check('DV4 rotation P1-P6 away (P1=14)', p4.actions[0].visiting_p1 === '14');

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
