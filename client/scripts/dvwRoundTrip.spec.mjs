// Aller-retour .dvw : les rapports recalculés après export puis relecture doivent
// être identiques. Exécution : node client/scripts/dvwRoundTrip.spec.mjs
import { buildDvw, parseDvw } from '../src/utils/dvw.js';
import { decomposeCode, formatCode } from '../src/utils/datavolley.js';
import { computeMatchReport } from '../src/utils/matchReport.js';
import { computeScouting } from '../src/utils/scouting.js';
import { buildShots } from '../src/utils/dvTrajectories.js';
import { attackCrossMatrix } from '../src/utils/dvMatrices.js';
import { computeSideOutBreak } from '../src/utils/dvAnalytics.js';
import { buildDistributionReport } from '../src/utils/distributionReport.js';

let bad = 0;
const check = (l, ok, d = '') => { if (!ok) bad += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l + (ok ? '' : ' ' + d)); };

let seed = 99;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const Z = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const actions = []; let uid = 0;
const add = (team, n, action, e = {}) => { uid += 1; actions.push({ uid, action_index: uid, team, player_number: n, action, ...e }); };
for (let p = 0; p < 36; p += 1) {
  const srv = p % 2 === 0 ? 'home' : 'away'; const rec = srv === 'home' ? 'away' : 'home';
  const sp = srv === 'home' ? [1, 2, 3] : [11, 12, 13]; const rp = rec === 'home' ? [4, 5, 6] : [14, 15, 16];
  const ev = pick(['#', '=', '+', '!', '-']);
  add(srv, pick(sp), 'S', { evaluation: ev, type: pick(['M', 'Q']), start_zone: '1', end_zone: pick(Z), end_subzone: pick(['', 'A', 'B', 'C', 'D']) });
  if (ev === '#' || ev === '=') continue;
  add(rec, pick(rp), 'R', { evaluation: pick(['#', '+', '!', '-']) });
  add(rec, rp[0], 'E', { evaluation: '+' });
  add(rec, pick(rp), 'A', { evaluation: pick(['#', '=', '/', '+', '!']), type: pick(['H', 'T']), start_zone: pick(['4', '3', '2']), end_zone: pick(Z), end_subzone: pick(['', 'A', 'B', 'C', 'D']) });
}
for (const a of actions) a.code = formatCode(a);

const dvw = buildDvw({
  match: { date: '2026-01-01' },
  teams: { home: 'ASUL', away: 'Adv' },
  rosters: { home: [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, name: 'J' + n })), away: [11, 12, 13, 14, 15, 16].map((n) => ({ number: n, name: 'K' + n })) },
  sets: [],
  actions: actions.map((a) => ({ code: a.code, set_number: 1, rally_number: 1 })),
});
const parsed = parseDvw(dvw);
check('même nombre d actions après relecture', parsed.actions.length === actions.length, `${parsed.actions.length} vs ${actions.length}`);

const back = parsed.actions.map((p, i) => {
  const f = decomposeCode(p.code);
  const team = f.team === 'a' || f.team === 'away' ? 'away' : 'home';
  return { uid: i + 1, action_index: i + 1, ...f, team };
});
const codesEqual = back.every((b, i) => parsed.actions[i].code === actions[i].code);
check('codes identiques après relecture', codesEqual);

const fieldsEqual = actions.every((a, i) => {
  const b = back[i];
  return b.action === a.action && b.evaluation === a.evaluation && String(b.end_zone || '') === String(a.end_zone || '') && String(b.end_subzone || '') === String(a.end_subzone || '') && Number(b.player_number) === Number(a.player_number);
});
check('champs d action identiques (action, évaluation, zones, sous-zone, joueur)', fieldsEqual);

const r1 = computeMatchReport(actions, {}); const r2 = computeMatchReport(back, {});
for (const side of ['home', 'away']) {
  check(`bilan ${side} identique`, JSON.stringify(r1[side].totals.stats) === JSON.stringify(r2[side].totals.stats));
}
const s1 = computeScouting({ actions }); const s2 = computeScouting({ actions: back });
check('scouting identique', JSON.stringify(s1.home.totals.skills) === JSON.stringify(s2.home.totals.skills) && JSON.stringify(s1.away.totals.skills) === JSON.stringify(s2.away.totals.skills));
for (const t of ['home', 'away']) {
  check(`trajectoires ${t} identiques`, buildShots(actions, { team: t, skill: 'A' }).length === buildShots(back, { team: t, skill: 'A' }).length);
  check(`tableau croisé ${t} identique`, JSON.stringify(attackCrossMatrix(actions, t).cells) === JSON.stringify(attackCrossMatrix(back, t).cells));
}
check('side-out / break identiques', JSON.stringify(computeSideOutBreak(actions, {}).home.Total) === JSON.stringify(computeSideOutBreak(back, {}).home.Total));
const dist1 = buildDistributionReport(actions, null, {}, {}, { phase: 'ALL' });
const dist2 = buildDistributionReport(back, null, {}, {}, { phase: 'ALL' });
const withoutActionRefs = (value) => JSON.stringify(value, (key, item) => (key === 'actions' ? undefined : item));
check('distribution identique après aller-retour (rotations, appels, combinaisons, exclusions)', withoutActionRefs(dist1) === withoutActionRefs(dist2));
if (bad) process.exit(1);
console.log('TOUT EST OK');
