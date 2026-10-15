// ============================================================================
// Frise chronologique du codage DataVolley.
//
// Elle réutilise la frise du découpage (components/PointTimeline) : on lui
// fournit la même structure de points (gagnant + type de point + set) mais
// construite à partir des rallyes codés, plus les événements à marquer
// (temps morts et remplacements).
//
// Correspondance issue du point → type de point → lettre de la frise :
//   ace             → service       → S   (service gagnant)
//   kill            → attack        → A   (attaque gagnante)
//   block           → block         → B   (contre gagnant)
//   attack_blocked  → contree       → C   (attaque contrée)
//   serve_error     → fault_service → F   (faute de service adverse)
//   attack_error    → fault_attack  → G   (faute d'attaque adverse)
//   autres fautes   → fault_other   → D   (autre faute adverse)
// ============================================================================

import { rallyWinMethod } from './datavolley.js';

/** Issue d'un rallye DataVolley → type de point de la frise. */
const WIN_METHOD_TO_POINT_TYPE = {
  ace: 'service',
  kill: 'attack',
  block: 'block',
  attack_blocked: 'contree',
  serve_error: 'fault_service',
  attack_error: 'fault_attack',
  reception_error: 'fault_other',
  block_error: 'fault_other',
  dig_error: 'fault_other',
  set_error: 'fault_other',
  freeball_error: 'fault_other',
  other: 'fault_other',
};

/**
 * Lettres affichées sur la frise : celles du découpage, plus « C » pour une
 * attaque contrée (issue propre au codage DataVolley).
 */
export const TIMELINE_LETTERS = {
  block: 'B',
  attack: 'A',
  service: 'S',
  fault_service: 'F',
  fault_attack: 'G',
  fault_other: 'D',
  contree: 'C',
};

/** Type de point de la frise pour une méthode de gain de rallye. */
export function winMethodToPointType(winMethodKey) {
  return WIN_METHOD_TO_POINT_TYPE[winMethodKey] || 'fault_other';
}

/** Lettre de la frise pour un type de point ('' si inconnue). */
export function timelineLetter(pointType) {
  return TIMELINE_LETTERS[pointType] || '';
}

/**
 * Points de la frise à partir des rallyes et de l'état du match.
 * @param {Array} rallies - groupActionsIntoRallies(actions)
 * @param {Object} matchState - computeMatchState(rallies, setups, opts, events)
 * @returns {Array} points { point_number, setNumber, winner, point_type,
 *                   point_type_letter, win_method, win_label, timecode, set_start }
 */
export function buildTimelinePoints(rallies, matchState) {
  const states = matchState?.states || [];
  const out = [];
  let seenSet = 0;

  (rallies || []).forEach((rally, i) => {
    if (!rally || !rally.winner) return; // point en cours : aucun gagnant encore
    const st = states.find((s) => s.index === rally.index) || states[i] || {};
    const setNumber = Number(st.setNumber) > 0 ? Number(st.setNumber) : 1;
    const method = rallyWinMethod(rally);
    const pointType = winMethodToPointType(method.key);
    const first = (rally.actions || [])[0] || null;
    // `set_start` (>= 2) marque le 1er point d'un nouveau set : la frise coupe
    // alors les rangées comme l'a fait le moteur du match (utile en 5e set).
    const setStart = setNumber > seenSet ? setNumber : null;
    seenSet = setNumber;

    out.push({
      point_number: rally.pointNumber,
      setNumber,
      winner: rally.winner === 'team2' ? 'team2' : 'team1',
      point_type: pointType,
      point_type_letter: timelineLetter(pointType),
      win_method: method.key,
      win_label: method.label,
      timecode: first && Number.isFinite(first.timecode) ? first.timecode : null,
      set_start: setStart && setStart > 1 ? setStart : null,
    });
  });

  return out;
}

/**
 * Événements à marquer sur la frise (temps morts, remplacements).
 * `pointsPlayed` = nombre de points joués dans le set au moment de l'événement
 * (0 = avant le premier point du set), comme enregistré côté serveur.
 */
export function buildTimelineEvents(events) {
  return (events || [])
    .filter((ev) => ev && (ev.kind === 'timeout' || ev.kind === 'substitution'))
    .map((ev) => ({
      id: ev.id ?? null,
      kind: ev.kind,
      team: ev.team === 'away' ? 'away' : 'home',
      setNumber: Number(ev.set_number) > 0 ? Number(ev.set_number) : 1,
      pointsPlayed: Math.max(0, Number(ev.point_number) || 0),
      out: ev.kind === 'substitution' ? Number(ev.payload?.out) || null : null,
      in: ev.kind === 'substitution' ? Number(ev.payload?.in) || null : null,
    }))
    .sort((a, b) => (a.setNumber - b.setNumber) || (a.pointsPlayed - b.pointsPlayed) || (a.id || 0) - (b.id || 0));
}
