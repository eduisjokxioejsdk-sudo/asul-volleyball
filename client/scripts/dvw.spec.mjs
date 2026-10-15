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
check('section [3TEAMS]', dvw.includes('[3TEAMS]'));
check('section [3PLAYERS]', dvw.includes('[3PLAYERS]*') && dvw.includes('[3PLAYERS]a'));
check('section [3SET]', dvw.includes('[3SET]'));
check('section [3SCOUT]', dvw.includes('[3SCOUT]'));
check('code présent', dvw.includes('*09AX1#'));

console.log('\n== Relecture (aller-retour) ==');
const p = parseDvw(dvw);
check('équipes relues', p.teams.home === 'ASUL' && p.teams.away === 'Visiteurs');
check('effectif home relu', p.rosters.home.length === 2 && p.rosters.home[0].number === 9);
check('nom reconstruit', p.rosters.home[0].name === 'Jean Dupont' || p.rosters.home[0].name.includes('Dupont'));
check('effectif away relu', p.rosters.away.length === 1 && p.rosters.away[0].number === 12);
check('3 actions relues', p.actions.length === 3);
check('codes conservés', p.actions.map((a) => a.code).join(',') === '*09AX1#,a12B#,*11SM5+');
check('set conservé', p.actions[2].set_number === 2);
check('tous les codes restent valides', p.actions.every((a) => isValidCode(a.code)));
check('six du point exporté/relu (rotation point par point)', p.actions[0].home_p1 === '9' && p.actions[0].visiting_p1 === '12');

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
