// ============================================================================
// Trajectoires DataVolley : une flèche par action (service / attaque) à partir
// des coordonnées enregistrées (start_x/y, end_x/y sur 0..100), sinon de la
// zone 1-9 (+ sous-zone A-D). Fournit aussi filtres et agrégats (façon
// planches de trajectoires DataVolley 4).
// ============================================================================

import { ZONE_CELLS, fromDv100Coords, xyFrom, zoneCenter } from './courtGeometry.js';
import { actionKey, matchesContext } from './dvContext.js';

/** Couleur de la flèche selon l'évaluation. */
export const EVAL_COLORS = {
  '#': '#34a853',
  '+': '#8bc34a',
  '!': '#fbc02d',
  '-': '#fb8c00',
  '/': '#9c27b0',
  '=': '#ea4335',
};
export const EVAL_ORDER = ['#', '+', '!', '-', '/', '='];
export const NO_EVAL_COLOR = '#9aa0a6';

export const TRAJECTORY_SKILLS = [
  { id: 'A', label: 'Attaque' },
  { id: 'S', label: 'Service' },
];

// Décalage (en mètres, repère de l'équipe qui défend) de chaque sous-zone.
const SUBZONE_OFFSET = {
  A: [-0.75, 0.75],
  B: [0.75, 0.75],
  C: [0.75, -0.75],
  D: [-0.75, -0.75],
};

export const sideOfTeam = (team) => (team === 'away' ? 'away' : 'home');
export const opponentOf = (team) => (team === 'away' ? 'home' : 'away');

/** Centre SVG d'une zone d'arrivée, affiné par la sous-zone si elle existe. */
export function endPointFromZone(zone, subzone, defendingSide) {
  const cell = ZONE_CELLS[String(zone || '')];
  if (!cell) return null;
  const off = SUBZONE_OFFSET[String(subzone || '').toUpperCase()];
  const depth = cell[0] + (off ? off[0] : 0);
  const width = cell[1] + (off ? off[1] : 0);
  return xyFrom(depth, width, defendingSide === 'away' ? 'right' : 'left');
}

/**
 * Points d'une action : { from, to, precision } (coordonnées SVG du terrain
 * complet) ou null si aucune direction exploitable.
 * precision : 'xy' (clics) | 'subzone' | 'zone'.
 */
export function actionTrajectory(action) {
  if (!action) return null;
  const team = sideOfTeam(action.team);
  const foe = opponentOf(team);

  const fromXY = fromDv100Coords(action.start_x, action.start_y);
  const toXY = fromDv100Coords(action.end_x, action.end_y);
  const from = fromXY || zoneCenter(action.start_zone || action.attack_zone, team);
  const to = toXY || endPointFromZone(action.end_zone, action.end_subzone, foe);
  if (!from || !to) return null;

  let precision = 'zone';
  if (fromXY && toXY) precision = 'xy';
  else if (toXY || (action.end_subzone && action.end_zone)) precision = 'subzone';
  const mid = fromDv100Coords(action.mid_x, action.mid_y);
  return { from, to, precision, mid: mid || null };
}

/** Actions de trajectoire (avec points) correspondant aux filtres. */
export function buildShots(actions, filters = {}) {
  const {
    team = null,
    skill = 'A',
    player = null,
    startZone = null,
    evals = null,
    combo = null,
    type = null,
    blockers = null,
    context = null,
  } = filters;
  const out = [];
  for (const a of actions || []) {
    if (!a || a.action !== skill) continue;
    if (context && !matchesContext(context.get(actionKey(a)), filters)) continue;
    if (team && sideOfTeam(a.team) !== team) continue;
    if (player != null && Number(a.player_number) !== Number(player)) continue;
    if (startZone && String(a.start_zone || a.attack_zone || '') !== String(startZone)) continue;
    if (evals && evals.length && !evals.includes(a.evaluation || '')) continue;
    if (combo && String(a.combo || '') !== combo) continue;
    if (type && String(a.type || '') !== type) continue;
    if (blockers != null && blockers !== '' && String(a.num_blockers ?? '') !== String(blockers)) continue;
    const t = actionTrajectory(a);
    if (!t) continue;
    out.push({ action: a, ...t });
  }
  return out;
}

/** Taux de directions codées : { total, withDirection, pct }. */
export function directionCoverage(actions, skill = 'A', team = null) {
  const list = (actions || []).filter(
    (a) => a?.action === skill && (!team || sideOfTeam(a.team) === team)
  );
  const withDirection = list.filter((a) => actionTrajectory(a)).length;
  return {
    total: list.length,
    withDirection,
    pct: list.length ? Math.round((withDirection / list.length) * 100) : 0,
  };
}

/** Totaux par évaluation et ratios d'un lot de flèches. */
export function summarizeShots(shots) {
  const counts = {};
  for (const e of EVAL_ORDER) counts[e] = 0;
  for (const s of shots || []) {
    const e = s.action.evaluation;
    if (counts[e] != null) counts[e] += 1;
  }
  const total = (shots || []).length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total,
    counts,
    killPct: pct(counts['#']),
    errorPct: pct(counts['=']),
    blockedPct: pct(counts['/']),
    efficiency: total ? Math.round(((counts['#'] - counts['='] - counts['/']) / total) * 100) : 0,
  };
}

/** Nombre de flèches par zone d'arrivée (pour la carte de chaleur). */
export function endZoneCounts(shots) {
  const map = {};
  for (const s of shots || []) {
    const z = String(s.action.end_zone || '');
    if (!ZONE_CELLS[z]) continue;
    const cell = map[z] || (map[z] = { count: 0, points: 0, errors: 0 });
    cell.count += 1;
    if (s.action.evaluation === '#') cell.points += 1;
    if (s.action.evaluation === '=' || s.action.evaluation === '/') cell.errors += 1;
  }
  return map;
}

/** Valeurs distinctes (triées) d'un champ d'action, pour les flèches d'une compétence et d'une équipe. */
export function distinctValues(actions, skill, team, field) {
  const set = new Set();
  for (const s of buildShots(actions, { team, skill })) {
    const v = s.action[field];
    if (v != null && String(v) !== '') set.add(String(v));
  }
  return [...set].sort();
}

/** Joueurs ayant au moins une flèche, triés par numéro. */
export function playersWithShots(actions, skill, team) {
  const set = new Set();
  for (const s of buildShots(actions, { skill, team })) set.add(Number(s.action.player_number) || 0);
  return [...set].filter((n) => n > 0).sort((a, b) => a - b);
}

/** Zones de départ présentes (triées) pour un lot d'actions. */
export function startZonesOf(shots) {
  const order = ['4', '3', '2', '7', '8', '9', '5', '6', '1'];
  const set = new Set(shots.map((s) => String(s.action.start_zone || s.action.attack_zone || '')));
  return order.filter((z) => set.has(z));
}

// ---------------------------------------------------------------------------
// Export vers les fiches de trajectoires (module Trajectoires).
// ---------------------------------------------------------------------------

/** Issue d'une fiche déduite de l'évaluation DataVolley. */
export function resultFromAction(action, insideCourtEnd = true) {
  const ev = action?.evaluation;
  if (ev === '#') return 'point';
  if (ev === '=') return insideCourtEnd ? 'faute' : 'out';
  if (ev === '/') return 'contree';
  return 'continuite';
}

/**
 * Flèches de fiche (corps attendu par POST /trajectories/:id/shots) pour les
 * services et attaques ayant une direction. Les services n'ont pas de contrée :
 * elle devient une continuité. Les flèches sans numéro de joueur sont ignorées.
 * @returns {{ shots: Array, skipped: number }}
 */
export function actionsToTrajectoryShots(actions, setMap = null) {
  const shots = [];
  let skipped = 0;
  for (const a of actions || []) {
    if (!a || (a.action !== 'S' && a.action !== 'A')) continue;
    const t = actionTrajectory(a);
    const number = Number(a.player_number);
    if (!t || !(number > 0)) { skipped += 1; continue; }
    const kind = a.action === 'S' ? 'serve' : 'attack';
    let result = resultFromAction(a);
    if (kind === 'serve' && result === 'contree') result = 'continuite';
    const key = a.uid ?? a.id ?? a.action_index;
    const setNumber = setMap && key != null ? Number(setMap.get(key)) || null : null;
    shots.push({
      team_side: sideOfTeam(a.team),
      player_number: number,
      kind,
      start: { x: Math.round(t.from.x * 10) / 10, y: Math.round(t.from.y * 10) / 10 },
      end: { x: Math.round(t.to.x * 10) / 10, y: Math.round(t.to.y * 10) / 10 },
      result,
      set_number: setNumber,
    });
  }
  return { shots, skipped };
}

/**
 * Qualité du codage d'une compétence : part des actions avec direction, sous-zone
 * d'arrivée, type et coordonnées précises (clics).
 * @returns {{ total:number, direction:number, subzone:number, type:number, xy:number }} pourcentages
 */
export function codingQuality(actions, skill = 'A', team = null) {
  const list = (actions || []).filter((a) => a?.action === skill && (!team || sideOfTeam(a.team) === team));
  const pct = (n) => (list.length ? Math.round((n / list.length) * 100) : 0);
  return {
    total: list.length,
    direction: pct(list.filter((a) => actionTrajectory(a)).length),
    subzone: pct(list.filter((a) => a.end_zone && a.end_subzone).length),
    type: pct(list.filter((a) => a.type).length),
    xy: pct(list.filter((a) => a.start_x != null && a.end_x != null).length),
  };
}

/**
 * Motifs de trait par évaluation : ils complètent les couleurs pour que les
 * flèches restent distinguables en noir et blanc. `dash` = stroke-dasharray,
 * `hatch` = angle des hachures des barres empilées (null = plein).
 */
export const EVAL_PATTERNS = {
  '#': { dash: null, hatch: null, label: 'plein' },
  '+': { dash: '6 1.5', hatch: 45, label: 'tirets longs' },
  '!': { dash: '2 2', hatch: 135, label: 'pointillés' },
  '-': { dash: '5 2 1 2', hatch: 0, label: 'tiret-point' },
  '/': { dash: '1 1.5', hatch: 90, label: 'points serrés' },
  '=': { dash: '8 3', hatch: -45, label: 'tirets espacés' },
};
