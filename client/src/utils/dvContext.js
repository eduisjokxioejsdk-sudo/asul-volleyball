// ============================================================================
// Contexte d'une action : phase (K1/K2/Freeball), situation (+/0/-), rotation du
// passeur, set, score et money-time. Réutilise les mêmes définitions que la
// distribution (extractRallyAttackPossessions) pour que trajectoires et
// distribution donnent des nombres identiques à filtres égaux.
// ============================================================================

import { groupActionsIntoRallies } from './datavolley.js';
import { computePerRallySetterPositions } from './rotation.js';
import { isMoneyTime } from './distribution.js';
import { buildDistributionPossessions } from './distributionModel.js';

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
    const setNumber = state.setNumber || 1;
    const moneyTime = isMoneyTime(state.scoreBefore, setNumber);
    for (const a of rally.actions || []) {
      map.set(actionKey(a), {
        phase: null,
        situation: null,
        setNumber,
        rotation: null,
        moneyTime,
        passZone: '',
        setterCall: '',
      });
    }
  });

  // Même modèle que la distribution : passeur réel, phase et situation de la
  // possession. `setterNumbers` reste dans la signature pour compatibilité.
  for (const poss of buildDistributionPossessions(actions, { rallies: list, setups })) {
    const ctx = map.get(poss.actionKey);
    if (!ctx) continue;
    ctx.phase = poss.phase;
    ctx.situation = poss.situation;
    ctx.rotation = poss.rotation;
    ctx.passZone = poss.passZone || '';
    ctx.setterCall = poss.setterCall || '';
    ctx.moneyTime = poss.moneyTime;
  }
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
