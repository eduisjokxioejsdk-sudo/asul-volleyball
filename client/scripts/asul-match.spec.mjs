// Vérifications complémentaires : cohérence des codes de la démo, moteur de
// rotation/libéro et bilan de match standardisé.
// Exécution : node client/scripts/asul-match.spec.mjs
import { generateDemoActions } from '../src/utils/demo.js';
import { groupActionsIntoRallies, getPointWinner, validateAction } from '../src/utils/datavolley.js';
import { computeMatchState, rotateLineup, normalizeLineup, substitute } from '../src/utils/rotation.js';
import { resolveOnCourt, normalizeTeamConfig, serverPrefill, validateLineup } from '../src/utils/lineup.js';
import { computeMatchReport, computePlayerRows, indexActionLineups } from '../src/utils/matchReport.js';
import { buildTimelineEvents, buildTimelinePoints, timelineLetter, winMethodToPointType } from '../src/utils/matchTimeline.js';
import { computeSetTimeline } from '../src/utils/volleyball.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Générateur de démo (50 matchs) ==');
let badCodes = 0;
let incomplete = 0;
for (let run = 0; run < 50; run += 1) {
  const actions = generateDemoActions();
  for (const a of actions) {
    if (!validateAction(a.code).valid) {
      badCodes += 1;
      if (badCodes < 4) console.log(`       code invalide : ${a.code}`);
    }
  }
  const rallies = groupActionsIntoRallies(actions);
  incomplete += rallies.filter((r) => !getPointWinner(r)).length;
}
check('tous les codes générés sont conformes', badCodes === 0, `(${badCodes} invalides)`);
check('aucun point inachevé', incomplete === 0, `(${incomplete})`);

console.log('\n== Rotation et libéro ==');
const six = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 };
check(
  'rotation horaire',
  JSON.stringify(rotateLineup(six)) === JSON.stringify({ P1: 2, P2: 3, P3: 4, P4: 5, P5: 6, P6: 1 })
);

const config = normalizeTeamConfig({
  players: [
    { number: 3, name: 'Central', role: 'middle' },
    { number: 7, name: 'Libéro', role: 'libero' },
    { number: 9, name: 'Passeur', role: 'setter' },
  ],
  libero: 7,
  libero_for: 3,
});
const front = resolveOnCourt({ P1: 1, P2: 3, P3: 9, P4: 4, P5: 5, P6: 6 }, config);
check('libéro absent à l’avant', front.P2.number === 3 && !front.P2.isLibero, JSON.stringify(front.P2));
const back = resolveOnCourt({ P1: 3, P2: 2, P3: 9, P4: 4, P5: 5, P6: 6 }, config);
check('libéro présent à l’arrière', back.P1.number === 7 && back.P1.isLibero, JSON.stringify(back.P1));
check('joueur remplacé conservé', back.P1.replaced === 3);
check('rôle du passeur reconnu', back.P3.role === 'setter');

const ms = computeMatchState(
  groupActionsIntoRallies([
    { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 0 },
    { code: '*02S-', action: 'S', evaluation: '-', team: 'home', player_number: 2, action_index: 1 },
    { code: 'a08R#', action: 'R', evaluation: '#', team: 'away', player_number: 8, action_index: 2 },
    { code: 'a09A=', action: 'A', evaluation: '=', team: 'away', player_number: 9, action_index: 3 },
  ]),
  {
    1: {
      first_server: 'team1',
      home_lineup: six,
      away_lineup: { P1: 11, P2: 12, P3: 13, P4: 14, P5: 15, P6: 16 },
    },
  }
);
check('score 2-0', ms.score.team1 === 2 && ms.score.team2 === 0, JSON.stringify(ms.score));
check('service conservé par le domicile', ms.server === 'team1');
check('instantanés par point', ms.states.length === 2);
check('pré-remplissage du serveur', serverPrefill(ms) === '*01S', serverPrefill(ms));
check('aucun avertissement', ms.warnings.length === 0, JSON.stringify(ms.warnings));

const libCheck = validateLineup({ P1: 1, P2: 7, P3: 9, P4: 4, P5: 5, P6: 6 }, config);
check('libéro à l’avant refusé', !libCheck.valid && libCheck.issues.includes('libero_front_row'), JSON.stringify(libCheck));
const libOk = validateLineup({ P1: 7, P2: 2, P3: 9, P4: 4, P5: 5, P6: 6 }, config);
check('libéro à l’arrière accepté', libOk.valid, JSON.stringify(libOk));

console.log('\n== Bilan de match ==');
const actions = [
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, type: 'Q' },
  { code: 'a02S=', action: 'S', evaluation: '=', team: 'away', player_number: 2, type: 'M' },
  { code: '*08R#', action: 'R', evaluation: '#', team: 'home', player_number: 8 },
  { code: '*08R=', action: 'R', evaluation: '=', team: 'home', player_number: 8 },
  { code: '*09A#', action: 'A', evaluation: '#', team: 'home', player_number: 9 },
  { code: '*09A=', action: 'A', evaluation: '=', team: 'home', player_number: 9 },
];
const rows = computePlayerRows(actions, 'home');
const p1 = rows.find((r) => r.number === 1);
const p8 = rows.find((r) => r.number === 8);
const p9 = rows.find((r) => r.number === 9);
check('ace compté', p1.stats.serve.points === 1 && p1.points === 1);
check('réceptions parfaite + erreur', p8.stats.reception.perfect === 1 && p8.stats.reception.errors === 1);
check('attaque point + faute', p9.stats.attack.points === 1 && p9.stats.attack.errors === 1);
const report = computeMatchReport(actions, { homeName: 'ASUL', awayName: 'Visiteurs' });
check('deux équipes dans le bilan', report.home.players.length >= 2 && report.away.players.length === 1);
check('total équipe = somme', report.home.totals.stats.attack.total === 2);

console.log('\n== Normalisation des six ==');
check(
  'six depuis une chaîne',
  JSON.stringify(normalizeLineup('1-2-3-4-5-6')) === JSON.stringify({ P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 })
);
check('six depuis un objet enregistré', normalizeLineup({ start: { P1: 9 } }).P1 === 9);

console.log('\n== Remplacements (temps morts et remplacements) ==');
check('substitute : le remplaçant prend le poste', substitute(six, 2, 12).P2 === 12);
check('substitute : sortant absent : rien ne change', JSON.stringify(substitute(six, 99, 12)) === JSON.stringify(six));

const lineupSix = { 1: { first_server: 'team1', home_lineup: six, away_lineup: six } };
const ralliesFour = groupActionsIntoRallies([
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 0 },
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 1 },
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 2 },
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home', player_number: 1, action_index: 3 },
]);
const matchEvents = [
  { id: 1, kind: 'timeout', set_number: 1, point_number: 2, team: 'home' },
  { id: 2, kind: 'substitution', set_number: 1, point_number: 2, team: 'home', payload: { out: 1, in: 11 } },
  { id: 3, kind: 'substitution', set_number: 1, point_number: 1, team: 'away', payload: { out: 2, in: 12 } },
];
const msSub = computeMatchState(ralliesFour, lineupSix, {}, matchEvents);
check('avant le remplacement : six de départ', msSub.states[0].homeLineup.P1 === 1);
check('le remplacement ne s’applique qu’après le point indiqué', msSub.states[1].homeLineup.P1 === 1);
check('remplacement appliqué pour l’échange suivant', msSub.states[2].homeLineup.P1 === 11);
check('le poste du sortant est conservé', msSub.states[2].homeLineup.P2 === 2 && msSub.states[2].homeLineup.P6 === 6);
check('remplacement de l’équipe adverse pris en compte', msSub.states[0].awayLineup.P2 === 2 && msSub.states[1].awayLineup.P2 === 12);
check('un temps mort ne modifie pas les six', JSON.stringify(msSub.states[3].homeLineup) === JSON.stringify(substitute(six, 1, 11)));

console.log('\n== Six par action (rotation point par point) ==');
const lineupIndex = indexActionLineups(ralliesFour, msSub);
check('index action → six (point 0)', lineupIndex.get(0)?.home_p1 === 1);
check('index action → six (point 2, après remplacement)', lineupIndex.get(2)?.home_p1 === 11);
check('index : six adverse', lineupIndex.get(0)?.visiting_p2 === 2);

const msAbsent = computeMatchState(ralliesFour, lineupSix, {}, [
  { id: 9, kind: 'substitution', set_number: 1, point_number: 1, team: 'home', payload: { out: 99, in: 12 } },
]);
check('sortant hors du terrain : six inchangé', msAbsent.states[3].homeLineup.P1 === 1);
check('sortant hors du terrain : avertissement', msAbsent.warnings.some((w) => w.type === 'substitution_absent'));
check('sans événement : six de départ intact', computeMatchState(ralliesFour, lineupSix).states[3].homeLineup.P1 === 1);

console.log('\n== Frise chronologique DataVolley ==');
check('ace → service (S)', winMethodToPointType('ace') === 'service' && timelineLetter('service') === 'S');
check('attaque gagnante → attaque (A)', winMethodToPointType('kill') === 'attack' && timelineLetter('attack') === 'A');
check('contre gagnant → contre (B)', winMethodToPointType('block') === 'block' && timelineLetter('block') === 'B');
check('attaque contrée → contrée (C)', winMethodToPointType('attack_blocked') === 'contree' && timelineLetter('contree') === 'C');
check('faute de service → F', winMethodToPointType('serve_error') === 'fault_service' && timelineLetter('fault_service') === 'F');
check('faute d’attaque → G', winMethodToPointType('attack_error') === 'fault_attack' && timelineLetter('fault_attack') === 'G');
check('autre faute → D', winMethodToPointType('reception_error') === 'fault_other' && timelineLetter('fault_other') === 'D');
check('issue inconnue → autre faute', winMethodToPointType('zzz') === 'fault_other');
check('lettre inconnue : vide', timelineLetter('inconnu') === '');

const pointsFrise = buildTimelinePoints(ralliesFour, msSub);
check('un point par rallye terminé', pointsFrise.length === ralliesFour.length);
check('gagnant repris', pointsFrise.every((p) => p.winner === 'team1'));
check('issue du point (ace) → lettre S', pointsFrise[0].point_type_letter === 'S');
check('set renseigné', pointsFrise.every((p) => p.setNumber === 1));
check('premier point du set : pas de set_start', pointsFrise[0].set_start === null);
const partial = groupActionsIntoRallies([
  { code: '*01S-', action: 'S', evaluation: '-', team: 'home', player_number: 1, action_index: 0 },
]);
check('point en cours : absent de la frise', buildTimelinePoints(partial, computeMatchState(partial, lineupSix)).length === 0);

const eventsFrise = buildTimelineEvents(matchEvents);
check('événements triés par set puis position', eventsFrise.map((e) => e.pointsPlayed).join(',') === '1,2,2');
check('temps mort conservé', eventsFrise.some((e) => e.kind === 'timeout' && e.team === 'home'));
check('remplacement : sortant et entrant', eventsFrise.some((e) => e.kind === 'substitution' && e.out === 1 && e.in === 11));
check('équipe inconnue ramenée à domicile', buildTimelineEvents([{ id: 1, kind: 'timeout', team: 'x' }])[0].team === 'home');
check('événement d’un autre type écarté', buildTimelineEvents([{ kind: 'autre', set_number: 1, point_number: 1 }]).length === 0);
check('liste absente acceptée', buildTimelineEvents(null).length === 0);

console.log('\n== Frise : fin de set (25 points, 15 au 5e) ==');
const points24 = [];
for (let i = 0; i < 24; i += 1) {
  points24.push({ winner: 'team1' });
  points24.push({ winner: 'team2' });
}
points24.push({ winner: 'team1' });
check('à 25-24 le set continue', computeSetTimeline(points24, { team1: 0, team2: 0 }).sets.length === 0);
points24.push({ winner: 'team1' });
const tlDone = computeSetTimeline(points24, { team1: 0, team2: 0 });
check('à 26-24 le set est gagné', tlDone.sets.length === 1 && tlDone.sets[0].winner === 'team1');
const points5 = [];
for (let i = 0; i < 15; i += 1) points5.push({ winner: 'team1', set_start: i === 0 ? 5 : null });
const tl5 = computeSetTimeline(points5, { team1: 0, team2: 0 });
check('5e set : gagné à 15 points', tl5.sets.length === 1 && tl5.sets[0].setNumber === 5, JSON.stringify(tl5.sets));
check('5e set : score conservé', tl5.sets[0]?.team1 === 15 && tl5.sets[0]?.team2 === 0);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
