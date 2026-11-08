// Analyses (suite) : évolution du score, séries, plus gros écart (2.5) et
// statistiques money-time contre le reste du match (2.6).

import { isMoneyTime } from './distribution.js';
import { SIDES, pct, prepareRallies, sideOfWinner } from './dvAnalytics.js';

/**
 * Évolution du score point par point, par set.
 * @returns {Array<{ set, points, final, longestRun:{side,len}, maxLead:{side,gap}, moneyPoints }>}
 */
export function computeScoreProgress(actions, setups = {}, prepared = null) {
  const { rallies, states } = prepared || prepareRallies(actions, setups);
  const sets = new Map();
  rallies.forEach((rally, i) => {
    const st = states[i];
    const w = sideOfWinner(rally.winner);
    if (!st || !w) return;
    const n = st.setNumber || 1;
    const entry = sets.get(n) || { set: n, points: [], final: null, moneyPoints: 0 };
    const score = st.scoreAfter || st.scoreBefore;
    const money = isMoneyTime(st.scoreBefore, n);
    entry.points.push({
      index: entry.points.length + 1,
      winner: w,
      home: score.team1,
      away: score.team2,
      diff: score.team1 - score.team2,
      moneyTime: money,
    });
    if (money) entry.moneyPoints += 1;
    entry.final = { home: score.team1, away: score.team2 };
    sets.set(n, entry);
  });
  return [...sets.values()].sort((a, b) => a.set - b.set).map((e) => {
    let run = { side: null, len: 0 };
    let cur = { side: null, len: 0 };
    let lead = { side: null, gap: 0 };
    for (const p of e.points) {
      cur = cur.side === p.winner ? { side: cur.side, len: cur.len + 1 } : { side: p.winner, len: 1 };
      if (cur.len > run.len) run = { ...cur };
      if (Math.abs(p.diff) > lead.gap) lead = { side: p.diff > 0 ? 'home' : 'away', gap: Math.abs(p.diff) };
    }
    return { ...e, longestRun: run, maxLead: lead };
  });
}

/** Points gagnés et efficacité d'attaque en money-time, comparés au reste du match. */
export function computeMoneyTimeSplit(actions, setups = {}, prepared = null) {
  const { rallies, states } = prepared || prepareRallies(actions, setups);
  const blank = () => ({ rallies: 0, won: 0, attacks: 0, kills: 0, errors: 0 });
  const out = { home: { money: blank(), rest: blank() }, away: { money: blank(), rest: blank() } };
  rallies.forEach((rally, i) => {
    const st = states[i];
    const w = sideOfWinner(rally.winner);
    if (!st || !w) return;
    const bucket = isMoneyTime(st.scoreBefore, st.setNumber || 1) ? 'money' : 'rest';
    for (const s of SIDES) {
      out[s][bucket].rallies += 1;
      if (w === s) out[s][bucket].won += 1;
    }
    for (const a of rally.actions || []) {
      if (a.action !== 'A') continue;
      const b = out[a.team === 'away' ? 'away' : 'home'][bucket];
      b.attacks += 1;
      if (a.evaluation === '#') b.kills += 1;
      if (a.evaluation === '=' || a.evaluation === '/') b.errors += 1;
    }
  });
  for (const s of SIDES) {
    for (const k of ['money', 'rest']) {
      const b = out[s][k];
      b.winPct = pct(b.won, b.rallies);
      b.efficiency = b.attacks ? Math.round(((b.kills - b.errors) / b.attacks) * 100) : 0;
    }
  }
  return out;
}
