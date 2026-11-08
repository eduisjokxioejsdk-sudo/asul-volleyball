// ============================================================================
// Matrices de rapport calculées depuis les actions brutes :
//   • départ × arrivée (attaque), par zone ou par sous-zone d'arrivée ;
//   • planche Réception : zone de réception × qualité, par réceptionneur.
// Les efficacités suivent la formule d'attaque DataVolley : (# − = − /) / total.
// ============================================================================

import { sideOfTeam } from './dvTrajectories.js';

export const GRID_ZONES = ['4', '3', '2', '7', '8', '9', '5', '6', '1'];
export const SUBZONES = ['A', 'B', 'C', 'D'];
export const REC_QUALITIES = ['#', '+', '!', '-', '/', '='];

const emptyCell = () => ({ total: 0, points: 0, errors: 0, blocked: 0 });

function addToCell(cell, ev) {
  cell.total += 1;
  if (ev === '#') cell.points += 1;
  if (ev === '=') cell.errors += 1;
  if (ev === '/') cell.blocked += 1;
}

function finishCell(cell) {
  cell.efficiency = cell.total
    ? Math.round(((cell.points - cell.errors - cell.blocked) / cell.total) * 100)
    : 0;
  cell.killPct = cell.total ? Math.round((cell.points / cell.total) * 100) : 0;
  return cell;
}

/**
 * Matrice départ × arrivée pour les attaques d'une équipe.
 * @param {Array} actions
 * @param {string} team 'home' | 'away'
 * @param {{ bySubzone?: boolean, player?: number|null }} [opts]
 * @returns {{ rows: string[], cols: string[], cells: Object, rowTotals: Object,
 *             colTotals: Object, total: number }}
 */
export function attackCrossMatrix(actions, team, opts = {}) {
  const { bySubzone = false, player = null } = opts;
  const cols = bySubzone
    ? GRID_ZONES.flatMap((z) => SUBZONES.map((s) => `${z}${s}`))
    : GRID_ZONES;
  const cells = {};
  const rowTotals = {};
  const colTotals = {};
  let total = 0;

  for (const a of actions || []) {
    if (!a || a.action !== 'A' || sideOfTeam(a.team) !== team) continue;
    if (player != null && Number(a.player_number) !== Number(player)) continue;
    const start = String(a.start_zone || a.attack_zone || '');
    const endZone = String(a.end_zone || '');
    if (!GRID_ZONES.includes(start) || !GRID_ZONES.includes(endZone)) continue;
    const sub = String(a.end_subzone || '').toUpperCase();
    const end = bySubzone ? (SUBZONES.includes(sub) ? `${endZone}${sub}` : null) : endZone;
    if (!end) continue;

    const key = `${start}|${end}`;
    addToCell((cells[key] = cells[key] || emptyCell()), a.evaluation);
    addToCell((rowTotals[start] = rowTotals[start] || emptyCell()), a.evaluation);
    addToCell((colTotals[end] = colTotals[end] || emptyCell()), a.evaluation);
    total += 1;
  }

  Object.values(cells).forEach(finishCell);
  Object.values(rowTotals).forEach(finishCell);
  Object.values(colTotals).forEach(finishCell);
  return { rows: GRID_ZONES, cols, cells, rowTotals, colTotals, total };
}

/**
 * Planche Réception d'une équipe : pour chaque réceptionneur, répartition par
 * qualité, et pour chaque zone de réception, qualité moyenne.
 * @returns {{ players: Array, zones: Object, total: number }}
 */
export function receptionBoard(actions, team) {
  const players = new Map();
  const zones = {};
  let total = 0;

  for (const a of actions || []) {
    if (!a || a.action !== 'R' || sideOfTeam(a.team) !== team) continue;
    const number = Number(a.player_number) || 0;
    if (!number) continue;
    const ev = a.evaluation || '';
    const row = players.get(number) || { number, total: 0, byEval: {}, byZone: {} };
    row.total += 1;
    row.byEval[ev] = (row.byEval[ev] || 0) + 1;
    const zone = String(a.end_zone || a.start_zone || '');
    if (GRID_ZONES.includes(zone)) {
      row.byZone[zone] = (row.byZone[zone] || 0) + 1;
      const z = (zones[zone] = zones[zone] || { total: 0, byEval: {} });
      z.total += 1;
      z.byEval[ev] = (z.byEval[ev] || 0) + 1;
    }
    players.set(number, row);
    total += 1;
  }

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const rows = [...players.values()]
    .map((p) => ({
      ...p,
      positivePct: pct((p.byEval['#'] || 0) + (p.byEval['+'] || 0), p.total),
      perfectPct: pct(p.byEval['#'] || 0, p.total),
      errorPct: pct(p.byEval['='] || 0, p.total),
    }))
    .sort((x, y) => y.total - x.total || x.number - y.number);
  for (const z of Object.values(zones)) {
    z.positivePct = pct((z.byEval['#'] || 0) + (z.byEval['+'] || 0), z.total);
  }
  return { players: rows, zones, total };
}
