// Analyses (suite) : contre (2.4) et passe (2.8).

import { rallyServerTeam } from './datavolley.js';
import { extractRallyAttackPossessions } from './distribution.js';
import { SIDES, pct, prepareRallies, sideOfServer } from './dvAnalytics.js';

/** Contre : par équipe, contres gagnants / touchés / fautes, et par nombre de contreurs. */
export function computeBlockAnalysis(actions, prepared = null) {
  const { rallies } = prepared || prepareRallies(actions);
  const out = {};
  for (const s of SIDES) out[s] = { byPlayer: {}, byBlockers: {}, total: 0, points: 0, touches: 0, errors: 0 };
  for (const rally of rallies) {
    const acts = rally.actions || [];
    acts.forEach((a, i) => {
      if (a.action !== 'B') return;
      const side = a.team === 'away' ? 'away' : 'home';
      const o = out[side];
      const n = Number(a.player_number) || 0;
      const row = (o.byPlayer[n] = o.byPlayer[n] || { total: 0, points: 0, touches: 0, errors: 0 });
      row.total += 1;
      o.total += 1;
      if (a.evaluation === '#') { row.points += 1; o.points += 1; }
      else if (a.evaluation === '+' || a.evaluation === '!') { row.touches += 1; o.touches += 1; }
      else if (a.evaluation === '=' || a.evaluation === '/') { row.errors += 1; o.errors += 1; }
      const att = [...acts.slice(0, i)].reverse().find((x) => x.action === 'A' && x.team !== a.team);
      const nb = String(att?.num_blockers ?? '');
      if (nb !== '') {
        const b = (o.byBlockers[nb] = o.byBlockers[nb] || { attacks: 0, blocked: 0 });
        b.attacks += 1;
        if (a.evaluation === '#') b.blocked += 1;
      }
    });
  }
  for (const s of SIDES) {
    out[s].pointsPct = pct(out[s].points, out[s].total);
    Object.values(out[s].byPlayer).forEach((r) => { r.pointsPct = pct(r.points, r.total); });
    Object.values(out[s].byBlockers).forEach((b) => { b.blockedPct = pct(b.blocked, b.attacks); });
  }
  return out;
}

/** Passe : qualité (évaluation E), appels et passeur, avec l'efficacité de l'attaque qui suit. */
export function computeSetAnalysis(actions, prepared = null) {
  const { rallies } = prepared || prepareRallies(actions);
  const out = { home: { byPlayer: {}, byCall: {}, byQuality: {} }, away: { byPlayer: {}, byCall: {}, byQuality: {} } };
  const cell = () => ({ total: 0, kills: 0, errors: 0 });
  for (const rally of rallies) {
    const srv = sideOfServer(rallyServerTeam(rally));
    for (const p of extractRallyAttackPossessions(rally.actions, srv)) {
      if (!p.setAction) continue;
      const side = p.team === 'away' ? 'away' : 'home';
      const o = out[side];
      const q = p.setAction.evaluation || '';
      const n = Number(p.setAction.player_number) || 0;
      const add = (map, key) => {
        const c = (map[key] = map[key] || cell());
        c.total += 1;
        if (p.action.evaluation === '#') c.kills += 1;
        if (p.action.evaluation === '=' || p.action.evaluation === '/') c.errors += 1;
      };
      add(o.byQuality, q);
      if (p.setterCall) add(o.byCall, p.setterCall);
      if (n) add(o.byPlayer, n);
    }
  }
  const fin = (c) => {
    c.killPct = pct(c.kills, c.total);
    c.efficiency = c.total ? Math.round(((c.kills - c.errors) / c.total) * 100) : 0;
  };
  for (const s of SIDES) for (const m of ['byPlayer', 'byCall', 'byQuality']) Object.values(out[s][m]).forEach(fin);
  return out;
}
