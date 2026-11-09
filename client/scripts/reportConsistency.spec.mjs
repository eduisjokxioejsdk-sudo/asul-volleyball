// ============================================================================
// Cohérence entre les modules de rapport sur un match synthétique : bilan
// (matchReport), scouting, trajectoires et distribution doivent donner les mêmes
// totaux. Exécution : node client/scripts/reportConsistency.spec.mjs
// ============================================================================
import { computeMatchReport } from '../src/utils/matchReport.js';
import { computeScouting } from '../src/utils/scouting.js';
import { buildShots } from '../src/utils/dvTrajectories.js';
import { computeDistributionByPlayer } from '../src/utils/distribution.js';
import { groupActionsIntoRallies } from '../src/utils/datavolley.js';

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} ${ok ? '' : detail}`);
};

// --- Générateur déterministe de match ---------------------------------------
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const HOME = [1, 2, 3, 4, 5, 6];
const AWAY = [11, 12, 13, 14, 15, 16];

let uid = 0;
const actions = [];
const add = (team, n, action, extra = {}) => {
  uid += 1;
  actions.push({ uid, action_index: uid, team, player_number: n, action, ...extra });
};

for (let point = 0; point < 40; point += 1) {
  const srv = point % 2 === 0 ? 'home' : 'away';
  const rec = srv === 'home' ? 'away' : 'home';
  const sp = srv === 'home' ? HOME : AWAY;
  const rp = rec === 'home' ? HOME : AWAY;
  const serveEv = pick(['#', '=', '+', '!', '-']);
  add(srv, pick(sp), 'S', { evaluation: serveEv, start_zone: '1', end_zone: pick(ZONES), type: pick(['M', 'Q']) });
  if (serveEv === '#' || serveEv === '=') continue;
  const recEv = pick(['#', '+', '!', '-']);
  add(rec, pick(rp), 'R', { evaluation: recEv, end_zone: pick(ZONES) });
  add(rec, rp[1], 'E', { evaluation: '+' });
  const atkEv = pick(['#', '=', '/', '+', '!']);
  const hasDir = rnd() > 0.2;
  add(rec, pick(rp), 'A', {
    evaluation: atkEv,
    start_zone: pick(['4', '3', '2', '8']),
    ...(hasDir ? { end_zone: pick(ZONES) } : {}),
    type: pick(['H', 'T']),
  });
}

const rallies = groupActionsIntoRallies(actions);
const report = computeMatchReport(actions, {});
const scout = computeScouting({ actions });

const countBy = (team, action, ev) =>
  actions.filter((a) => a.team === team && a.action === action && (ev == null || a.evaluation === ev)).length;

for (const team of ['home', 'away']) {
  console.log(`\n== Équipe ${team} ==`);
  const r = report[team].totals.stats;
  const s = scout[team].totals.skills;

  check('service : total bilan = brut', r.serve.total === countBy(team, 'S'), `${r.serve.total} vs ${countBy(team, 'S')}`);
  check('service : total scouting = brut', s.serve.total === countBy(team, 'S'));
  check('aces bilan = scouting = brut', r.serve.points === countBy(team, 'S', '#') && s.serve.points === countBy(team, 'S', '#'));
  check('fautes de service cohérentes', r.serve.errors === countBy(team, 'S', '=') && s.serve.errors === countBy(team, 'S', '='));
  check('réception : total bilan = scouting = brut', r.reception.total === countBy(team, 'R') && s.reception.total === countBy(team, 'R'));
  check('attaque : total bilan = scouting = brut', r.attack.total === countBy(team, 'A') && s.attack.total === countBy(team, 'A'));
  check('attaques gagnantes bilan = scouting', r.attack.points === s.attack.points && r.attack.points === countBy(team, 'A', '#'));
  check('attaques contrées bilan = brut', r.attack.blocked === countBy(team, 'A', '/'));

  const withDir = buildShots(actions, { team, skill: 'A' }).length;
  const rawWithDir = actions.filter((a) => a.team === team && a.action === 'A' && a.end_zone).length;
  check('trajectoires d\'attaque = actions avec arrivée', withDir === rawWithDir, `${withDir} vs ${rawWithDir}`);
  const serveShots = buildShots(actions, { team, skill: 'S' }).length;
  check('trajectoires de service = services avec arrivée', serveShots === actions.filter((a) => a.team === team && a.action === 'S' && a.end_zone).length);

  const dist = computeDistributionByPlayer(actions, rallies, {}, { phase: 'ALL' })[team];
  const distTotal = dist.reduce((sum, p) => sum + p.count, 0);
  check('distribution : jamais plus que les attaques', distTotal <= countBy(team, 'A'), `${distTotal} > ${countBy(team, 'A')}`);
  check('distribution : parts = 100%', dist.length === 0 || Math.abs(dist.reduce((sum, p) => sum + p.pct, 0) - 100) <= dist.length);
}

console.log('\n== Cumul des joueurs = total équipe ==');
for (const team of ['home', 'away']) {
  const sumPlayers = report[team].players.reduce((t, p) => t + p.stats.attack.total, 0);
  check(`attaque ${team} : somme des joueurs = total`, sumPlayers === report[team].totals.stats.attack.total);
}

if (failures) { console.log(`\n${failures} échec(s)`); process.exit(1); }
console.log('\nTOUT EST OK');

// --- Filtres de contexte : trajectoires = distribution ---
import { buildActionContext } from '../src/utils/dvContext.js';
import { computeSetterDistributionByRotation } from '../src/utils/distribution.js';
let bad2 = 0;
const c2 = (l, ok, d = '') => { if (!ok) bad2++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l + (ok ? '' : ' ' + d)); };
console.log('\n== Contexte (phase / situation) ==');
const ctx = buildActionContext(actions, {}, {}, rallies);
for (const team of ['home', 'away']) {
  for (const phase of ['K1', 'K2']) {
    const viaCtx = buildShots(actions, { team, skill: 'A', phase, context: ctx }).length;
    const dist = computeSetterDistributionByRotation(actions, rallies, {}, {}, { phase })[team].Total;
    let viaDist = 0;
    for (const sit of ['+', '0', '-']) viaDist += dist[sit].total;
    const withEnd = actions.filter((a) => a.team === team && a.action === 'A' && a.end_zone && ctx.get(a.uid ?? a.id ?? a.action_index)?.phase === phase).length;
    c2(`${team} ${phase} : trajectoires = actions avec arrivée`, viaCtx === withEnd, `${viaCtx} vs ${withEnd}`);
    c2(`${team} ${phase} : distribution <= attaques de la phase`, viaDist <= actions.filter((a) => a.team === team && a.action === 'A' && ctx.get(a.uid ?? a.id ?? a.action_index)?.phase === phase).length);
  }
}
const sitCount = ['+', '0', '-'].reduce((s, x) => s + buildShots(actions, { team: 'home', skill: 'A', situation: x, context: ctx }).length, 0);
const k1Home = buildShots(actions, { team: 'home', skill: 'A', phase: 'K1', context: ctx }).length;
c2('situations +/0/- couvrent la phase K1 (home)', sitCount >= k1Home, `${sitCount} vs ${k1Home}`);
c2('set 1 = tout (match à 1 set)', buildShots(actions, { team: 'home', skill: 'A', set: 1, context: ctx }).length === buildShots(actions, { team: 'home', skill: 'A' }).length);
if (bad2) process.exit(1);
