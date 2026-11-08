// ============================================================================
// Analyses « équipe » calculées sur les échanges et leur état :
//   • side-out / break par rotation (2.1)
//   • efficacité de la 1re attaque selon la qualité de réception (2.2)
//   • duel service / réception (2.3)
// Fonctions pures ; `states` vient de computePerRallySetterPositions.
// ============================================================================

import { groupActionsIntoRallies, rallyServerTeam } from './datavolley.js';
import { computePerRallySetterPositions } from './rotation.js';
import { extractRallyAttackPossessions } from './distribution.js';

export const SIDES = ['home', 'away'];
export const other = (s) => (s === 'home' ? 'away' : 'home');
export const sideOfWinner = (w) => (w === 'team2' ? 'away' : w === 'team1' ? 'home' : null);
export const sideOfServer = (s) => (s === 'team2' ? 'away' : s === 'team1' ? 'home' : null);
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/** Prépare échanges + états alignés (un état par échange). */
export function prepareRallies(actions, setups = {}, rallies = null) {
  const list = rallies || groupActionsIntoRallies(actions || []);
  const states = computePerRallySetterPositions(list, setups);
  return { rallies: list, states };
}

/** Dernière action décisive de l'échange (#, faute, attaque contrée). */
export function decidingAction(rally) {
  const acts = (rally?.actions || []).filter((a) => a && a.evaluation);
  for (let i = acts.length - 1; i >= 0; i -= 1) {
    const a = acts[i];
    if (a.evaluation === '#' || a.evaluation === '=' || (a.action === 'A' && a.evaluation === '/')) return a;
  }
  return null;
}

/** Catégorie du point du point de vue de l'équipe gagnante. */
export function pointCategory(rally, winnerSide) {
  const d = decidingAction(rally);
  if (!d) return 'other';
  const dSide = d.team === 'away' ? 'away' : 'home';
  if (d.evaluation === '#') {
    if (d.action === 'S') return 'ace';
    if (d.action === 'A') return 'attack';
    if (d.action === 'B') return 'block';
    return 'other';
  }
  if (dSide !== winnerSide) {
    if (d.action === 'A' && d.evaluation === '/') return 'block';
    return 'opponentError';
  }
  return 'other';
}

const CATS = () => ({ ace: 0, attack: 0, block: 0, opponentError: 0, other: 0 });
const emptyRot = () => ({
  sideOutOpp: 0, sideOutWon: 0, breakOpp: 0, breakWon: 0, wonBy: CATS(), lostBy: CATS(),
});

/**
 * Side-out et break par rotation (position du passeur) et au total.
 * Side-out : l'équipe reçoit et gagne. Break : elle sert et gagne.
 * @returns {{ home: Object, away: Object }} clés Total, P1..P6
 */
export function computeSideOutBreak(actions, setups = {}, prepared = null) {
  const { rallies, states } = prepared || prepareRallies(actions, setups);
  const out = { home: { Total: emptyRot() }, away: { Total: emptyRot() } };
  for (const s of SIDES) for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) out[s][p] = emptyRot();

  rallies.forEach((rally, i) => {
    const winner = sideOfWinner(rally.winner);
    const srv = sideOfServer(rallyServerTeam(rally));
    if (!winner || !srv) return;
    const st = states[i] || {};
    for (const side of SIDES) {
      const rot = (side === 'home' ? st.homeSetterPos : st.awaySetterPos) || null;
      const keys = rot && out[side][rot] ? ['Total', rot] : ['Total'];
      const won = winner === side;
      const cat = pointCategory(rally, won ? side : other(side));
      for (const k of keys) {
        const r = out[side][k];
        if (srv === side) { r.breakOpp += 1; if (won) r.breakWon += 1; }
        else { r.sideOutOpp += 1; if (won) r.sideOutWon += 1; }
        (won ? r.wonBy : r.lostBy)[cat] += 1;
      }
    }
  });

  for (const s of SIDES) {
    for (const r of Object.values(out[s])) {
      r.sideOutPct = pct(r.sideOutWon, r.sideOutOpp);
      r.breakPct = pct(r.breakWon, r.breakOpp);
      r.points = r.sideOutWon + r.breakWon;
      r.rallies = r.sideOutOpp + r.breakOpp;
    }
  }
  return out;
}
