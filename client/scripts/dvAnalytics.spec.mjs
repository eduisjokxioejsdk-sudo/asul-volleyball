import { computeSideOutBreak, prepareRallies } from '../src/utils/dvAnalytics.js';
import { attackByReception, serveReceptionDuel } from '../src/utils/dvAnalytics2.js';
import { computeBlockAnalysis, computeSetAnalysis } from '../src/utils/dvAnalytics3.js';
import { computeScoreProgress, computeMoneyTimeSplit } from '../src/utils/dvAnalytics4.js';

let bad = 0;
const check = (l, ok) => { if (!ok) bad += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };
let uid = 0;
const A = [];
const add = (team, n, action, extra = {}) => { uid += 1; A.push({ uid, action_index: uid, team, player_number: n, action, ...extra }); };

// Point 1 : home sert, away reçoit (+), attaque away # => away gagne (side-out away)
add('home', 1, 'S', { evaluation: '+', type: 'M' });
add('away', 5, 'R', { evaluation: '+' });
add('away', 2, 'E', { evaluation: '+', call: 'K1' });
add('away', 9, 'A', { evaluation: '#', start_zone: '4', num_blockers: '2' });
// Point 2 : away sert (ace) => break away
add('away', 7, 'S', { evaluation: '#', type: 'Q' });
// Point 3 : away sert, home reçoit (-), attaque home contrée par away (B #)
add('away', 7, 'S', { evaluation: '+' });
add('home', 3, 'R', { evaluation: '-' });
add('home', 4, 'A', { evaluation: '/', start_zone: '4', num_blockers: '1' });
add('away', 8, 'B', { evaluation: '#' });

const prep = prepareRallies(A);
check('3 échanges', prep.rallies.length === 3);

const sb = computeSideOutBreak(A, {}, prep);
check('away : side-out 1/1', sb.away.Total.sideOutOpp === 1 && sb.away.Total.sideOutWon === 1);
check('away : break 2/2', sb.away.Total.breakOpp === 2 && sb.away.Total.breakWon === 2);
check('home : side-out 0/2 (reçoit aux points 2 et 3)', sb.home.Total.sideOutOpp === 2 && sb.home.Total.sideOutWon === 0);
check('home : break 0/1', sb.home.Total.breakOpp === 1 && sb.home.Total.breakWon === 0);
check('away : ace compté', sb.away.Total.wonBy.ace === 1);
check('away : point par attaque', sb.away.Total.wonBy.attack === 1);
check('away : point par contre', sb.away.Total.wonBy.block === 1);
check('somme des points = rallies gagnées', sb.away.Total.points === 3 && sb.home.Total.points === 0);

const ar = attackByReception(A, {}, prep);
check('1re attaque away après réception + ', ar.away.byQuality['+'].total === 1 && ar.away.byQuality['+'].points === 1);
check('1re attaque home après réception - contrée', ar.home.byQuality['-'].blocked === 1 && ar.home.byQuality['-'].efficiency === -100);

const duel = serveReceptionDuel(A);
check('duel : serveur 1 a reçu une réception +', duel.home.servers[1].byRecQuality['+'] === 1);
check('duel : réceptionneur 5 a reçu un service M', duel.away.receivers[5].byServeType.M === 1);
check('duel : ace compté', duel.away.servers[7].aces === 1);

const bl = computeBlockAnalysis(A, prep);
check('contre : 1 contre gagnant away', bl.away.total === 1 && bl.away.points === 1);
check('contre : face à 1 contreur', bl.away.byBlockers['1'].blocked === 1);

const sa = computeSetAnalysis(A, prep);
check('passe : appel K1 suivi d un point', sa.away.byCall.K1.kills === 1);
check('passe : passeur 2', sa.away.byPlayer[2].total === 1);

const sp = computeScoreProgress(A, {}, prep);
check('score : 1 set de 3 points', sp.length === 1 && sp[0].points.length === 3);
check('score : série away de 3', sp[0].longestRun.side === 'away' && sp[0].longestRun.len === 3);
check('score : écart max 3 pour away', sp[0].maxLead.side === 'away' && sp[0].maxLead.gap === 3);

const mt = computeMoneyTimeSplit(A, {}, prep);
check('money-time : rien en début de set', mt.away.money.rallies === 0 && mt.away.rest.rallies === 3);
if (bad) process.exit(1);
console.log('TOUT EST OK');
