// ============================================================================
// Fiches de trajectoire — catalogue des issues, géométrie des flèches et
// conversions entre la base et l'écran.
//
// Convention : une flèche a un point de départ et un point d'arrivée exprimés
// dans le repère du terrain complet (utils/courtGeometry : 1 unité = 10 cm).
// L'issue est décidée par l'arrivée :
//   • arrivée hors des lignes → 'out' (rouge, aucun choix à saisir) ;
//   • arrivée dans le terrain → popup : point / feinte point / continuité /
//     feinte continuité / faute.
//
// Code couleur : point = vert, continuité = bleu, contrée = orange, faute et
// dehors = rouge. Les feintes gardent le vert ou le bleu de leur famille, mais
// leur flèche est dessinée en arc de cercle pour les distinguer d'un œil.
// ============================================================================

import {
  ATTACK,
  ATTACK_M,
  FREE,
  LEFT_X,
  M,
  NET_X,
  RIGHT_X,
  U,
  insideCourt,
} from './courtGeometry.js';

/** Issues possibles d'une frappe. `arc` = flèche en arc (feinte). */
export const TRAJECTORY_RESULTS = [
  { id: 'point', label: 'Point', short: 'Point', color: '#34a853', arc: false },
  { id: 'feinte_point', label: 'Feinte point', short: 'Feinte pt', color: '#34a853', arc: true },
  { id: 'continuite', label: 'Continuité', short: 'Continuité', color: '#4285f4', arc: false },
  { id: 'feinte_continuite', label: 'Feinte continuité', short: 'Feinte cont', color: '#4285f4', arc: true },
  { id: 'faute', label: 'Faute', short: 'Faute', color: '#ea4335', arc: false },
  // Balle contrée (attaque bloquée par le contre adverse) : orange, bien
  // distinct du vert, du bleu et du rouge.
  { id: 'contree', label: 'Contrée', short: 'Contrée', color: '#ff8f00', arc: false },
  { id: 'out', label: 'Dehors', short: 'Dehors', color: '#ea4335', arc: false, auto: true },
];

/** Issue attribuée automatiquement quand la flèche sort du terrain. */
export const OUT_RESULT = 'out';

/** Choix proposés dans la popup pour une ATTAQUE (les feintes y ont leur place). */
export const POPUP_RESULTS = ['point', 'feinte_point', 'feinte_continuite', 'continuite', 'faute', 'contree'];

/** Choix proposés dans la popup pour un SERVICE : pas de feinte au service. */
export const SERVE_RESULTS = ['point', 'continuite', 'faute'];

/**
 * Issues proposées selon le type de frappe : les feintes n'existent qu'à
 * l'attaque (un service se termine par un point, une continuité ou une faute).
 * Le rapport global ('all', qui réunit services et attaques) propose les mêmes
 * issues que l'attaque : elles contiennent déjà celles du service.
 */
export function popupResultsFor(kind) {
  if (kind === 'all') return POPUP_RESULTS;
  return kind === 'serve' ? SERVE_RESULTS : POPUP_RESULTS;
}

/**
 * Une issue qui n'a pas de sens pour le type de frappe est ramenée à l'issue
 * simple correspondante (données d'une ancienne saisie) : une feinte ou une
 * balle contrée n'existent qu'à l'attaque, on garde donc des fiches cohérentes.
 */
export function normalizeResultForKind(result, kind) {
  if (kind !== 'serve') return result;
  if (result === 'feinte_point') return 'point';
  if (result === 'feinte_continuite') return 'continuite';
  if (result === 'contree') return 'continuite';
  return result;
}

/** Types de frappe marqués dans la fiche. */
export const TRAJECTORY_KINDS = [
  { id: 'serve', label: 'Services' },
  { id: 'attack', label: 'Attaque' },
];

const RESULT_BY_ID = new Map(TRAJECTORY_RESULTS.map((r) => [r.id, r]));
const FALLBACK_RESULT = { id: 'inconnu', label: 'Issue inconnue', short: '—', color: '#8b8b8b', arc: false };

export function resultMeta(id) {
  return RESULT_BY_ID.get(id) || FALLBACK_RESULT;
}

export function resultLabel(id) {
  return resultMeta(id).label;
}

export function resultColor(id) {
  return resultMeta(id).color;
}

export function resultIsArc(id) {
  return !!resultMeta(id).arc;
}

/** Marge (en unités = 10 cm) autour du terrain pour viser hors des lignes. */
export const TRAJECTORY_MARGIN = 22;

/** Repère de dessin : terrain complet + zone libre, service compris. */
export const TRAJECTORY_VIEWBOX = {
  x: LEFT_X - TRAJECTORY_MARGIN,
  y: FREE - TRAJECTORY_MARGIN,
  w: (RIGHT_X - LEFT_X) + TRAJECTORY_MARGIN * 2,
  h: M * U + TRAJECTORY_MARGIN * 2,
};

export const TRAJECTORY_VIEWBOX_STR =
  `${TRAJECTORY_VIEWBOX.x} ${TRAJECTORY_VIEWBOX.y} ${TRAJECTORY_VIEWBOX.w} ${TRAJECTORY_VIEWBOX.h}`;

/** Repères du terrain complet, réexportés pour le rendu. */
export const TRAJECTORY_COURT = {
  x: LEFT_X,
  y: FREE,
  w: RIGHT_X - LEFT_X,
  h: M * U,
  netX: NET_X,
  attack: ATTACK,
  top: FREE,
  bottom: FREE + M * U,
};

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Position dans le repère SVG (unités du terrain) d'un clic sur le terrain.
 * Le SVG est rendu avec `width:100% ; height:auto`, donc son ratio suit celui
 * du viewBox : la conversion est une simple règle de trois.
 */
export function svgPointFromEvent(element, event) {
  if (!element || !event) return null;
  const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
  if (!rect || !rect.width || !rect.height) return null;
  const vb = TRAJECTORY_VIEWBOX;
  const x = vb.x + ((event.clientX - rect.left) / rect.width) * vb.w;
  const y = vb.y + ((event.clientY - rect.top) / rect.height) * vb.h;
  return { x: r1(x), y: r1(y) };
}

/** Issue automatique : 'out' dès que l'arrivée sort des lignes, sinon null. */
export function landingResult(end) {
  if (!end) return null;
  return insideCourt(end) ? null : OUT_RESULT;
}

/** Flèche droite (point, continuité, faute, dehors). */
export function straightPath(from, to) {
  return {
    d: `M ${r1(from.x)} ${r1(from.y)} L ${r1(to.x)} ${r1(to.y)}`,
    control: null,
    arc: false,
  };
}

/**
 * Bombe de l'arc des feintes, en unités (10 cm) : 32 unités = 3,2 m de
 * contrôle, soit environ 1,6 m d'écart maximum avec la corde. Un arc bien
 * marqué, impossible à confondre avec une flèche droite.
 */
export const ARC_BULGE = 32;

/** Ligne médiane du terrain (milieu de la largeur) : partage haut / bas. */
export const COURT_MID_Y = FREE + (M * U) / 2;

/**
 * Flèche en arc de cercle (feintes) : quadratique bombée perpendiculairement.
 * Sens du bombé :
 *   • vers le bas (comportement d'origine : l'arc contourne le filet par le
 *     bas) pour tout tracé qui n'est pas entièrement dans la moitié haute ;
 *   • vers le haut dès que la feinte DÉMARRE et FINIT dans la moitié haute du
 *     terrain : l'arc monte puis redescend sur son point d'arrivée.
 * Le sens ne dépend pas du sens du tracé (gauche → droite ou l'inverse).
 */
export function arcPath(from, to, bulge = ARC_BULGE) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  // Normale au trait : (-dy ; dx) ramenée à la longueur du trait. Sa composante
  // verticale indique de quel côté la formule d'origine bombait l'arc.
  const px = -dy / len;
  const py = dx / len;
  const versLeBasParDefaut = py > 0;
  const feinteDansLaMoitieHaute = from.y <= COURT_MID_Y && to.y <= COURT_MID_Y;
  const bombVersLeBas = feinteDansLaMoitieHaute ? !versLeBasParDefaut : versLeBasParDefaut;
  const dir = bombVersLeBas ? 1 : -1;
  const cx = midX + px * bulge * dir;
  const cy = midY + py * bulge * dir;
  return {
    d: `M ${r1(from.x)} ${r1(from.y)} Q ${r1(cx)} ${r1(cy)} ${r1(to.x)} ${r1(to.y)}`,
    control: { x: r1(cx), y: r1(cy) },
    arc: true,
  };
}

/** Tracé d'une flèche selon l'issue : arc pour les feintes, droite sinon. */
export function shotPath(from, to, resultId) {
  return resultIsArc(resultId) ? arcPath(from, to) : straightPath(from, to);
}

/**
 * Issues proposées pour un type de frappe, « dehors » compris : sert à la
 * légende, au menu de filtre et à la consultation (lecture seule).
 */
export function resultsForKind(kind) {
  return [...popupResultsFor(kind), OUT_RESULT].map(resultMeta);
}

/** Vrai si l'issue est proposée pour ce type de frappe. */
export function isResultForKind(result, kind) {
  return popupResultsFor(kind).includes(result) || result === OUT_RESULT;
}

/**
 * Flèches à afficher en consultation, selon les issues masquées par le filtre.
 * @param {Array} shots flèches de la fiche (déjà filtrées par équipe et frappe)
 * @param {Iterable<string>} hidden ids d'issues masquées (vide = tout afficher)
 */
export function filterShots(shots, hidden) {
  const masked = new Set(hidden || []);
  const list = shots || [];
  if (masked.size === 0) return list;
  return list.filter((shot) => !masked.has(shot.result));
}

/**
 * Postes de départ d'une attaque : les trois zones de l'avant (4, 3, 2) et le
 * regroupement des zones arrière (5, 6, 1, 7, 8, 9). Sert au tri des attaques
 * selon l'endroit d'où part la flèche.
 */
export const ATTACK_START_ZONES = [
  { id: '4', label: '4 — avant gauche' },
  { id: '3', label: '3 — avant centre' },
  { id: '2', label: '2 — avant droit' },
  { id: 'arriere', label: 'Arrière (5, 6, 1, 7, 8, 9)' },
];

/**
 * Poste de départ d'une flèche d'attaque, dans le repère de l'équipe marquée :
 * le camp est partagé en 3 colonnes de 3 m (gauche → 4, centre → 3, droite → 2)
 * et la ligne d'attaque (3 m du filet) sépare l'avant de l'arrière.
 * `side` est le côté occupé par l'équipe marquée ('home' = moitié gauche du
 * terrain, 'away' = moitié droite), comme partout dans les fiches.
 * Renvoie '4', '3', '2' ou 'arriere' ; null si le point est illisible.
 */
export function attackZone(start, side = 'home') {
  if (!start || !Number.isFinite(start.x) || !Number.isFinite(start.y)) return null;
  // Coordonnées d'équipe : profondeur depuis la ligne de fond, largeur depuis
  // la ligne de gauche (voir courtGeometry.xyFrom).
  const depth = side === 'away' ? (RIGHT_X - start.x) / U : (start.x - LEFT_X) / U;
  const width = side === 'away' ? M - (start.y - FREE) / U : (start.y - FREE) / U;
  if (depth >= M - ATTACK_M) {
    if (width < M / 3) return '4';
    if (width < (M / 3) * 2) return '3';
    return '2';
  }
  return 'arriere';
}

/**
 * Flèches d'attaque dont le départ tombe dans les postes demandés. Les autres
 * flèches (services) ne sont pas concernées : elles restent affichées.
 * @param {Array} shots flèches (déjà filtrées par type de frappe)
 * @param {Iterable<string>} zones postes voulus (vide = toutes les attaques)
 * @param {'home'|'away'} side côté de l'équipe marquée
 */
export function filterShotsByZone(shots, zones, side = 'home') {
  const wanted = new Set(zones || []);
  const list = shots || [];
  if (wanted.size === 0) return list;
  return list.filter((shot) => shot.kind !== 'attack' || wanted.has(attackZone(shot.start, side)));
}

/** Compteurs à zéro, une entrée par issue. */
export function emptyCounts() {
  const out = {};
  for (const r of TRAJECTORY_RESULTS) out[r.id] = 0;
  return out;
}

/** Répartition des flèches d'une liste par issue. */
export function countByResult(shots) {
  const out = emptyCounts();
  for (const shot of shots || []) {
    if (out[shot.result] != null) out[shot.result] += 1;
  }
  return out;
}

/** Somme d'un dictionnaire de compteurs (nombre de flèches qu'il décrit). */
export function sumCounts(counts) {
  return Object.values(counts || {}).reduce((total, value) => total + (Number(value) || 0), 0);
}

/**
 * Flèches d'un type de frappe. Le rapport global utilise `'all'` : il réunit
 * alors services et attaques, sans distinction.
 */
export function shotsOfKind(shots, kind) {
  const list = shots || [];
  return kind === 'all' ? list : list.filter((s) => s.kind === kind);
}

/**
 * Rapport d'un ensemble de flèches (déjà réunies, tous matchs confondus) :
 * total par type de frappe, détail par issue, points, continuités et erreurs.
 * Une feinte réussie compte comme un point, une feinte de continuité comme une
 * continuité : le taux de réussite suit l'issue réellement obtenue.
 */
export function shotsReport(shots) {
  const list = shots || [];
  const serve = countByResult(list.filter((s) => s.kind === 'serve'));
  const attack = countByResult(list.filter((s) => s.kind === 'attack'));
  const counts = countByResult(list);
  const total = list.length;
  const points = counts.point + counts.feinte_point;
  const continuity = counts.continuite + counts.feinte_continuite;
  const errors = counts.faute + counts.out;
  return {
    total,
    serveTotal: sumCounts(serve),
    attackTotal: sumCounts(attack),
    counts,
    serve,
    attack,
    points,
    continuity,
    errors,
    contree: counts.contree,
    successRate: total ? points / total : 0,
    errorRate: total ? errors / total : 0,
  };
}

/** Rapport d'un joueur : ses flèches réunies (services + attaque). */
export function playerReport(shots, playerNumber) {
  const list = (shots || []).filter((s) => Number(s.player_number) === Number(playerNumber));
  return { player_number: Number(playerNumber), ...shotsReport(list) };
}

/**
 * Rapport global d'une équipe : un rapport par joueur, calculé à partir des
 * flèches de tous ses matchs. Les joueurs de l'effectif apparaissent même sans
 * flèche ; un numéro présent dans les flèches mais absent de l'effectif est
 * ajouté à la fin (joueur parti de l'équipe).
 */
export function teamReport(shots, roster) {
  const list = shots || [];
  const numbers = [];
  const push = (value) => {
    const number = Number(value);
    if (number > 0 && !numbers.includes(number)) numbers.push(number);
  };
  for (const player of roster || []) push(player.number);
  for (const shot of list) push(shot.player_number);

  const players = numbers.map((number) => {
    const meta = (roster || []).find((p) => Number(p.number) === number);
    return {
      player_number: number,
      name: meta?.name || '',
      role: meta?.role || 'universal',
      ...playerReport(list, number),
    };
  });

  return { players, ...shotsReport(list) };
}

/** Flèches d'un joueur pour un type de frappe et un côté donnés. */
export function shotsFor(shots, teamSide, kind, playerNumber) {
  return (shots || []).filter(
    (s) =>
      s.team_side === teamSide &&
      s.kind === kind &&
      Number(s.player_number) === Number(playerNumber)
  );
}

/** Effectif d'une équipe, trié par numéro (libéro compris). */
export function rosterOf(team) {
  return (team?.players || [])
    .map((p) => ({
      number: Number(p.number) || 0,
      name: p.name || '',
      role: p.role || 'universal',
    }))
    .filter((p) => p.number > 0)
    .sort((a, b) => a.number - b.number);
}

/** Ligne de base `trajectory_shots` → flèche utilisée par l'écran. */
export function shotFromRow(row) {
  return {
    id: row?.id ?? null,
    team_side: row?.team_side || 'home',
    player_number: Number(row?.player_number) || 0,
    kind: row?.kind || 'serve',
    start: { x: Number(row?.start_x) || 0, y: Number(row?.start_y) || 0 },
    end: { x: Number(row?.end_x) || 0, y: Number(row?.end_y) || 0 },
    result: row?.result || OUT_RESULT,
    set_number: row?.set_number ?? null,
  };
}

/** Flèche de l'écran → corps envoyé au serveur. */
export function shotToRow(shot) {
  return {
    team_side: shot.team_side,
    player_number: Number(shot.player_number),
    kind: shot.kind,
    start: { x: r1(shot.start.x), y: r1(shot.start.y) },
    end: { x: r1(shot.end.x), y: r1(shot.end.y) },
    result: shot.result,
    set_number: shot.set_number ?? null,
  };
}
