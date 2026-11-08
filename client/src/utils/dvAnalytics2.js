// ============================================================================
// Analyses (suite) : efficacité de la 1re attaque selon la réception (2.2),
// duel service / réception (2.3).
// ============================================================================

import { groupActionsIntoRallies, rallyServerTeam } from './datavolley.js';
import { extractRallyAttackPossessions } from './distribution.js';
import { SIDES, pct, prepareRallies, sideOfServer } from './dvAnalytics.js';

const blank = () => ({ total: 0, points: 0, errors: 0, blocked: 0 });
function add(cell, ev) {
  cell.total += 1;
  if (ev === '#') cell.points += 1;
  if (ev === '=') cell.errors += 1;
  if (ev === '/') cell.blocked += 1;
}
function fin(c) {
  c.killPct = pct(c.points, c.total);
  c.efficiency = c.total ? Math.round(((c.points - c.errors - c.blocked) / c.total) * 100) : 0;
  return c;
}

/** 1re attaque (K1) selon la qualité de réception, par équipe puis par attaquant. */
export function attackByReception(actions, setups = {}, prepared = null) {
  const { rallies } = prepared || prepareRallies(actions, setups);
  const out = { home: { byQuality: {}, byPlayer: {} }, away: { byQuality: {}, byPlayer: {} } };
  for (const rally of rallies) {
    const srv = sideOfServer(rallyServerTeam(rally));
    const serverSide = srv === 'home' ? 'home' : srv === 'away' ? 'away' : null;
    for (const p of extractRallyAttackPossessions(rally.actions, serverSide)) {
      if (p.phase !== 'K1' || !p.firstContact) continue;
      const side = p.team === 'away' ? 'away' : 'home';
      const q = p.firstContact.evaluation || '';
      add((out[side].byQuality[q] = out[side].byQuality[q] || blank()), p.action.evaluation);
      const n = Number(p.action.player_number) || 0;
      if (!n) continue;
      const pl = (out[side].byPlayer[n] = out[side].byPlayer[n] || {});
      add((pl[q] = pl[q] || blank()), p.action.evaluation);
    }
  }
  for (const s of SIDES) {
    Object.values(out[s].byQuality).forEach(fin);
    Object.values(out[s].byPlayer).forEach((pl) => Object.values(pl).forEach(fin));
  }
  return out;
}

/** Duel service / réception : réception obtenue par serveur, services reçus par réceptionneur. */
export function serveReceptionDuel(actions) {
  const out = { home: { servers: {}, receivers: {} }, away: { servers: {}, receivers: {} } };
  for (const rally of groupActionsIntoRallies(actions || [])) {
    const acts = rally.actions || [];
    const s = acts.find((a) => a.action === 'S');
    if (!s) continue;
    const ss = s.team === 'away' ? 'away' : 'home';
    const sn = Number(s.player_number) || 0;
    const sv = (out[ss].servers[sn] = out[ss].servers[sn] || { total: 0, aces: 0, errors: 0, byRecQuality: {} });
    sv.total += 1;
    if (s.evaluation === '#') sv.aces += 1;
    if (s.evaluation === '=') sv.errors += 1;
    const r = acts.find((a) => a.action === 'R');
    if (!r) continue;
    const rs = r.team === 'away' ? 'away' : 'home';
    const q = r.evaluation || '';
    sv.byRecQuality[q] = (sv.byRecQuality[q] || 0) + 1;
    const rn = Number(r.player_number) || 0;
    const rv = (out[rs].receivers[rn] = out[rs].receivers[rn] || { total: 0, byServeType: {}, byQuality: {} });
    rv.total += 1;
    const t = s.type || '?';
    rv.byServeType[t] = (rv.byServeType[t] || 0) + 1;
    rv.byQuality[q] = (rv.byQuality[q] || 0) + 1;
  }
  return out;
}
