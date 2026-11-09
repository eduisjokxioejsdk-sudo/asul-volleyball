// Agrégation du modèle de distribution : toutes les valeurs affichées sont
// calculées ici, depuis les compteurs bruts. Aucun composant ne refait les ratios.

import {
  DISTRIBUTION_ZONE_IDS,
  buildDistributionPossessions,
  selectDistributionPossessions,
} from './distributionModel.js';

const SIDES = ['home', 'away'];
const ROTATIONS = ['Total', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const SITUATION_KEYS = ['+', '0', '-', 'ALL'];
const numberOf = (action) => Number(action?.player_number) || 0;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function emptyCell() {
  return { count: 0, points: 0, errors: 0, blocked: 0, other: 0, combos: {}, actions: [], pct: 0, killPct: 0, eff: 0 };
}

function addCell(cell, p) {
  cell.count += 1;
  cell.actions.push(p.action);
  const ev = p.action.evaluation;
  if (ev === '#') cell.points += 1;
  else if (ev === '=') cell.errors += 1;
  else if (ev === '/') cell.blocked += 1;
  else cell.other += 1;
  if (p.combo) cell.combos[p.combo] = (cell.combos[p.combo] || 0) + 1;
}

function finishCell(cell) {
  cell.killPct = pct(cell.points, cell.count);
  cell.eff = cell.count ? Math.round(((cell.points - cell.errors - cell.blocked) / cell.count) * 100) : 0;
  const top = Object.entries(cell.combos).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  cell.topCombo = top ? top[0] : null;
  return cell;
}

function emptyRotation() {
  const out = {};
  for (const sit of SITUATION_KEYS) {
    out[sit] = { total: 0 };
    for (const z of DISTRIBUTION_ZONE_IDS) out[sit][z] = emptyCell();
  }
  return out;
}

function emptySide() {
  const out = {};
  for (const rotation of ROTATIONS) out[rotation] = emptyRotation();
  return out;
}

function addToRotation(rotation, p) {
  for (const sit of [p.situation, 'ALL']) {
    addCell(rotation[sit][p.attackZone], p);
    rotation[sit].total += 1;
  }
}

function finalizeSide(side) {
  for (const rotation of ROTATIONS) {
    for (const sit of SITUATION_KEYS) {
      const data = side[rotation][sit];
      for (const z of DISTRIBUTION_ZONE_IDS) {
        const cell = finishCell(data[z]);
        cell.pct = pct(cell.count, data.total);
      }
    }
  }
}

function newStats() {
  return { total: 0, points: 0, errors: 0, blocked: 0, other: 0, actions: [] };
}

function addStats(row, p) {
  row.total += 1;
  row.actions.push(p.action);
  const ev = p.action.evaluation;
  if (ev === '#') row.points += 1;
  else if (ev === '=') row.errors += 1;
  else if (ev === '/') row.blocked += 1;
  else row.other += 1;
}

function finishStats(row) {
  row.killPct = pct(row.points, row.total);
  row.eff = row.total ? Math.round(((row.points - row.errors - row.blocked) / row.total) * 100) : 0;
  return row;
}

function aggregateBy(possessions, keyOf) {
  const out = { home: {}, away: {} };
  for (const side of SIDES) {
    const map = new Map();
    for (const p of possessions.filter((x) => x.team === side)) {
      const key = keyOf(p);
      if (!key) continue;
      const row = map.get(key) || { total: newStats(), byRotation: {}, bySituation: {} };
      addStats(row.total, p);
      const rotation = p.rotation || 'UNKNOWN';
      const situation = p.situation;
      addStats((row.byRotation[rotation] = row.byRotation[rotation] || newStats()), p);
      addStats((row.bySituation[situation] = row.bySituation[situation] || newStats()), p);
      map.set(key, row);
    }
    const grandTotal = [...map.values()].reduce((sum, row) => sum + row.total.total, 0);
    for (const [key, row] of map) {
      finishStats(row.total);
      row.total.pct = pct(row.total.total, grandTotal);
      Object.values(row.byRotation).forEach(finishStats);
      Object.values(row.bySituation).forEach(finishStats);
      out[side][key] = row;
    }
  }
  return out;
}

function aggregatePlayers(possessions) {
  const out = { home: [], away: [] };
  for (const side of SIDES) {
    const own = possessions.filter((p) => p.team === side);
    const map = new Map();
    for (const p of own) {
      const number = numberOf(p.action);
      if (!number) continue;
      const row = map.get(number) || {
        number, count: 0, points: 0, errors: 0, blocked: 0, other: 0,
        bySituation: { '+': 0, '0': 0, '-': 0 }, byZone: {},
      };
      row.count += 1;
      const ev = p.action.evaluation;
      if (ev === '#') row.points += 1;
      else if (ev === '=') row.errors += 1;
      else if (ev === '/') row.blocked += 1;
      else row.other += 1;
      row.bySituation[p.situation] += 1;
      row.byZone[p.attackZone] = (row.byZone[p.attackZone] || 0) + 1;
      map.set(number, row);
    }
    out[side] = [...map.values()].map((row) => ({
      ...row,
      pct: pct(row.count, own.length),
      killPct: pct(row.points, row.count),
      eff: row.count ? Math.round(((row.points - row.errors - row.blocked) / row.count) * 100) : 0,
    })).sort((a, b) => b.count - a.count || a.number - b.number);
  }
  return out;
}

function emptyMeta() {
  return {
    rawAttacks: 0, eligible: 0, included: 0, filteredOut: 0,
    excluded: { UNKNOWN_PHASE: 0, UNKNOWN_SITUATION: 0, UNKNOWN_ATTACK_ZONE: 0 },
    unknownRotation: 0, unknownPassZone: 0, setterDugCount: 0,
    totalPossessions: 0,
    byPhase: { K1: 0, K2: 0, FREEBALL: 0 },
    byCall: {}, byPassZone: {},
  };
}

/**
 * Rapport unique de distribution. La signature est compatible avec l'ancienne
 * fonction ; `setterNumbers` est conservé pour les appelants mais la rotation
 * vient désormais du passeur réellement associé à chaque attaque.
 */
export function buildDistributionReportFromPossessions(possessions, filters = {}) {
  const selection = selectDistributionPossessions(possessions, { phase: 'K1', ...filters });
  const result = {
    home: emptySide(), away: emptySide(),
    meta: { home: emptyMeta(), away: emptyMeta() },
  };

  for (const side of SIDES) {
    const meta = result.meta[side];
    const ownAll = possessions.filter((p) => p.team === side);
    const ownEligible = selection.eligible.filter((p) => p.team === side);
    const ownIncluded = selection.included.filter((p) => p.team === side);
    meta.rawAttacks = ownAll.length;
    meta.totalPossessions = ownAll.length;
    meta.eligible = ownEligible.length;
    meta.included = ownIncluded.length;
    meta.filteredOut = ownEligible.length - ownIncluded.length;
    for (const reason of Object.keys(meta.excluded)) {
      meta.excluded[reason] = ownAll.reduce((n, p) => n + (p.exclusions.includes(reason) ? 1 : 0), 0);
    }
    for (const p of ownEligible) if (meta.byPhase[p.phase] != null) meta.byPhase[p.phase] += 1;
    for (const p of ownIncluded) {
      addToRotation(result[side].Total, p);
      if (p.rotation) addToRotation(result[side][p.rotation], p);
      else meta.unknownRotation += 1;
      if (!p.passZoneKnown) meta.unknownPassZone += 1;
      else meta.byPassZone[p.passZone] = (meta.byPassZone[p.passZone] || 0) + 1;
      if (p.setterCall) meta.byCall[p.setterCall] = (meta.byCall[p.setterCall] || 0) + 1;
      if (p.setterNumber > 0 && p.firstContactPlayer === p.setterNumber) meta.setterDugCount += 1;
    }
    finalizeSide(result[side]);
  }

  result.calls = aggregateBy(selection.included, (p) => p.setterCall);
  result.combos = aggregateBy(selection.included, (p) => p.combo);
  result.players = aggregatePlayers(selection.included);
  return result;
}

/** Calcule d'abord les possessions du match, puis le rapport (API existante). */
export function buildDistributionReport(actions, rallies = null, setups = {}, setterNumbers = {}, filters = {}) {
  return buildDistributionReportFromPossessions(
    buildDistributionPossessions(actions, { rallies, setups }),
    filters
  );
}

