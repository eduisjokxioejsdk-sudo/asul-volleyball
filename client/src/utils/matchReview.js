// ============================================================================
// Mode « Relecture » — relire un match en enchaînant les points, sans les
// temps morts.
//
// Chaque point du codage devient un segment vidéo : [première action − lead-in ;
// dernière action + lead-out], décalé du sync_offset du match. Le lecteur
// enchaîne ces segments : tout ce qui se trouve entre deux points (temps
// morts, célébrations, changement de service…) est simplement sauté.
// ============================================================================

import { buildPlaylist, groupActionsIntoRallies } from './datavolley.js';

/**
 * Vrai si le codage ne porte AUCUNE évaluation (mode Consultation) : les points
 * ne peuvent pas être déduits d'une issue, on les découpe par service —
 * exactement comme l'onglet Point par point du codage.
 */
export function isLightCoding(actions) {
  const list = actions || [];
  return list.length > 0 && list.every((a) => !a?.evaluation);
}

/**
 * Points d'un match, prêts à être lus : actions, issue et segment vidéo de
 * chaque point (lead-in / lead-out / offset du match).
 * @param {Array} actions actions codées du match
 * @param {Object} [sync] réglages du match ({ sync_offset, lead_in, lead_out })
 */
export function reviewPoints(actions, sync = {}) {
  const rallies = groupActionsIntoRallies(
    actions || [],
    isLightCoding(actions) ? { byService: true } : {}
  );
  return buildPlaylist(rallies, {
    syncOffset: Number(sync?.sync_offset || 0),
    leadIn: Number(sync?.lead_in ?? 4),
    leadOut: Number(sync?.lead_out ?? 3),
  });
}

/**
 * Index du point qui contient ce temps vidéo, ou -1 si l'on est entre deux
 * points (temps mort). Sert à surligner le point en cours pendant la lecture.
 */
export function pointIndexAt(points, time) {
  if (time == null || !Number.isFinite(Number(time))) return -1;
  const t = Number(time);
  const list = points || [];
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    if (t >= p.segmentStart && t < p.segmentEnd) return i;
  }
  return -1;
}

/**
 * Index du point suivant / précédent (le résultat reste dans la liste ;
 * un index négatif démarre au premier point).
 */
export function stepPoint(points, index, delta = 1) {
  const count = (points || []).length;
  if (count === 0) return -1;
  const from = index == null || index < 0 ? -1 : index;
  return Math.min(count - 1, Math.max(0, from + delta));
}

/**
 * Intervalles sautés entre deux points consécutifs (les « temps morts » que la
 * relecture évite). Le début et la fin de la vidéo n'y figurent pas : ils sont
 * couverts par reviewTotals (durée totale − durée couverte).
 */
export function deadTimeGaps(points) {
  const list = [...(points || [])].sort((a, b) => a.segmentStart - b.segmentStart);
  const gaps = [];
  for (let i = 1; i < list.length; i += 1) {
    const start = list[i - 1].segmentEnd;
    const end = list[i].segmentStart;
    if (end > start) gaps.push({ start, end, duration: end - start });
  }
  return gaps;
}

/**
 * Compteurs de la relecture : nombre de points, durée vidéo couverte par les
 * points et temps morts évités (durée du match − durée couverte).
 * @param {Array} points points de relecture (reviewPoints)
 * @param {number|null} [duration] durée de la vidéo, si connue
 */
export function reviewTotals(points, duration = null) {
  const list = points || [];
  let covered = 0;
  for (const p of list) covered += Math.max(0, p.segmentEnd - p.segmentStart);
  const skipped =
    duration != null && Number.isFinite(Number(duration)) ? Math.max(0, Number(duration) - covered) : null;
  return { count: list.length, covered, skipped };
}
