// ============================================================================
// Contexte d'une action : phase (K1/K2/Freeball), situation (+/0/-), rotation du
// passeur, set, score et money-time. Réutilise les mêmes définitions que la
// distribution (extractRallyAttackPossessions) pour que trajectoires et
// distribution donnent des nombres identiques à filtres égaux.
// ============================================================================

import { groupActionsIntoRallies, rallyServerTeam } from './datavolley.js';
import { computePerRallySetterPositions, positionOfPlayer } from './rotation.js';
import { extractRallyAttackPossessions, isMoneyTime } from './distribution.js';

export const actionKey = (a) => a?.uid ?? a?.id ?? a?.action_index;

/**
 * Index action -> contexte, pour toutes les attaques rattachées à une
 * possession. Les autres actions (service...) reçoivent set, score et rotation.
 * @returns {Map<any, {phase, situation, setNumber, rotation, moneyTime, passZone, setterCall}>}
 */
export function buildActionContext(actions, setups = {}, setterNumbers = {}, rallies = null) {
  const list = rallies || groupActionsIntoRallies(actions || []);
  const perRally = computePerRallySetterPositions(list, setups);
  const map = new Map();

  list.forEach((rally, idx) => {
    const state = perRally[idx] || {};
    const srv = rallyServerTeam(rally);
    const serverSide = srv === 'team1' ? 'home' : srv === 'team2' ? 'away' : null;
    const setNumber = state.setNumber || 1;
    const rotationOf = (side) => {
      let pos = side === 'home' ? state.homeSetterPos : state.awaySetterPos;
      const setter = Number(setterNumbers?.[side]) || 0;
      if (!pos && setter > 0) {
        pos = positionOfPlayer(side === 'home' ? state.homeLineup : state.awayLineup, setter);
      }
      return pos || null;
    };
    const moneyTime = isMoneyTime(state.scoreBefore, setNumber);

    for (const a of rally.actions || []) {
      const side = a.team === 'away' ? 'away' : 'home';
      map.set(actionKey(a), {
        phase: null,
        situation: null,
        setNumber,
        rotation: rotationOf(side),
        moneyTime,
        passZone: '',
        setterCall: '',
      });
    }
    for (const poss of extractRallyAttackPossessions(rally.actions, serverSide)) {
      const ctx = map.get(actionKey(poss.action));
      if (!ctx) continue;
      ctx.phase = poss.phase;
      ctx.situation = poss.situation;
      ctx.passZone = poss.passZone || '';
      ctx.setterCall = poss.setterCall || '';
    }
  });
  return map;
}

/** Vrai si le contexte d'une action respecte les filtres (clé absente = ignorée). */
export function matchesContext(ctx, f = {}) {
  const active = (v) => v != null && v !== '' && v !== 'ALL' && v !== 'all';
  if (!ctx) return !(active(f.phase) || active(f.situation) || active(f.rotation) || active(f.set) || active(f.match) || f.moneyTime);
  if (active(f.match) && String(ctx.matchId) !== String(f.match)) return false;
  if (active(f.phase) && ctx.phase !== f.phase) return false;
  if (active(f.situation) && ctx.situation !== f.situation) return false;
  if (active(f.rotation) && ctx.rotation !== f.rotation) return false;
  if (active(f.set) && Number(ctx.setNumber) !== Number(f.set)) return false;
  if (f.moneyTime && !ctx.moneyTime) return false;
  return true;
}
