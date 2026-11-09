// ============================================================================
// Analyses cumulées sur plusieurs matchs. Chaque match est calculé avec son
// propre état (sets, rotations), puis les compteurs sont additionnés et les
// pourcentages recalculés : la somme de N matchs égale le cumul.
// ============================================================================

import { computeSideOutBreak, prepareRallies, pct } from './dvAnalytics.js';
import { computeMoneyTimeSplit } from './dvAnalytics4.js';
import { sumCounters } from './multiMatch.js';
import { attackByReception, serveReceptionDuel } from './dvAnalytics2.js';
import { computeBlockAnalysis, computeSetAnalysis } from './dvAnalytics3.js';
import { buildDistributionPossessions } from './distributionModel.js';
import { buildDistributionReportFromPossessions } from './distributionReport.js';

const SIDES = ['home', 'away'];

function finalizeSideOut(data) {
  for (const s of SIDES) {
    for (const r of Object.values(data[s])) {
      r.sideOutPct = pct(r.sideOutWon, r.sideOutOpp);
      r.breakPct = pct(r.breakWon, r.breakOpp);
      r.points = r.sideOutWon + r.breakWon;
      r.rallies = r.sideOutOpp + r.breakOpp;
    }
  }
  return data;
}

/** Side-out / break par rotation cumulés sur tous les matchs préparés. */
export function cumulativeSideOutBreak(prepared) {
  let acc = null;
  for (const m of prepared || []) {
    const part = computeSideOutBreak(m.actions, m.setups, { rallies: m.rallies, states: prepareRallies(m.actions, m.setups, m.rallies).states });
    acc = sumCounters(acc, part);
  }
  if (!acc) return null;
  // sumCounters additionne aussi les pourcentages : ils sont recalculés ici.
  return finalizeSideOut(acc);
}

/** Money-time cumulé : compteurs additionnés, pourcentages recalculés. */
export function cumulativeMoneyTime(prepared) {
  let acc = null;
  for (const m of prepared || []) {
    const prep = prepareRallies(m.actions, m.setups, m.rallies);
    acc = sumCounters(acc, computeMoneyTimeSplit(m.actions, m.setups, prep));
  }
  if (!acc) return null;
  for (const s of SIDES) {
    for (const k of ['money', 'rest']) {
      const b = acc[s][k];
      b.winPct = pct(b.won, b.rallies);
      b.efficiency = b.attacks ? Math.round(((b.kills - b.errors) / b.attacks) * 100) : 0;
    }
  }
  return acc;
}
function reFinishAttackCells(cells) {
  for (const c of Object.values(cells || {})) {
    c.killPct = pct(c.points, c.total);
    c.efficiency = c.total ? Math.round(((c.points - c.errors - c.blocked) / c.total) * 100) : 0;
  }
}

/** 1re attaque selon la réception, cumulée (compteurs additionnés, ratios recalculés). */
export function cumulativeAttackByReception(prepared) {
  let acc = null;
  for (const m of prepared || []) {
    acc = sumCounters(acc, attackByReception(m.actions, m.setups, { rallies: m.rallies, states: prepareRallies(m.actions, m.setups, m.rallies).states }));
  }
  if (!acc) return null;
  for (const s of SIDES) {
    reFinishAttackCells(acc[s].byQuality);
    Object.values(acc[s].byPlayer).forEach(reFinishAttackCells);
  }
  return acc;
}

/** Duel service / réception cumulé (compteurs uniquement : aucun ratio à recalculer). */
export function cumulativeServeReceptionDuel(prepared) {
  let acc = null;
  for (const m of prepared || []) acc = sumCounters(acc, serveReceptionDuel(m.actions));
  return acc;
}

/** Contre et passe cumulés, pourcentages recalculés. */
export function cumulativeBlockAndSet(prepared) {
  let block = null;
  let set = null;
  for (const m of prepared || []) {
    const prep = { rallies: m.rallies, states: [] };
    block = sumCounters(block, computeBlockAnalysis(m.actions, prep));
    set = sumCounters(set, computeSetAnalysis(m.actions, prep));
  }
  if (!block) return null;
  for (const s of SIDES) {
    block[s].pointsPct = pct(block[s].points, block[s].total);
    Object.values(block[s].byPlayer).forEach((r) => { r.pointsPct = pct(r.points, r.total); });
    Object.values(block[s].byBlockers).forEach((b) => { b.blockedPct = pct(b.blocked, b.attacks); });
    for (const k of ['byPlayer', 'byCall', 'byQuality']) {
      for (const c of Object.values(set[s][k])) {
        c.killPct = pct(c.kills, c.total);
        c.efficiency = c.total ? Math.round(((c.kills - c.errors) / c.total) * 100) : 0;
      }
    }
  }
  return { block, set };
}

/** Distribution cumulée : possessions contextuelles par match, agrégation unique ensuite. */
export function cumulativeDistributionReport(prepared, filters = {}) {
  const possessions = (prepared || []).flatMap((m) =>
    buildDistributionPossessions(m.actions, { rallies: m.rallies, setups: m.setups })
  );
  return buildDistributionReportFromPossessions(possessions, filters);
}
