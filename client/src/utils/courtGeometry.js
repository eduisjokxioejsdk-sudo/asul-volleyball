// ============================================================================
// Géométrie du terrain de volley (18 m × 9 m, filet au centre).
// Unités : 1 unité SVG = 10 cm, 1 mètre = 10 unités.
//
// Repère officiel, vu par chaque équipe (filet en haut pour elle) :
//        filet
//   P4    P3    P2        (avant, à 3 m du filet)
//   P5    P6    P1        (arrière)   P1 = arrière droit = serveur
//
// Chaque équipe est vue depuis son propre côté : le terrain est donc
// symétrique par rapport au filet (comme sur un vrai plan de match).
// En coordonnées d'équipe : [profondeur depuis la ligne de fond, largeur
// depuis la ligne de gauche] — 0 = gauche, 9 = droite.
//   P1 : arrière droit · P2 : avant droit · P3 : avant centre
//   P4 : avant gauche  · P5 : arrière gauche · P6 : arrière centre
// ============================================================================

/** 1 unité SVG = 10 cm. */
export const U = 10;
/** Largeur du terrain (ligne de côté à ligne de côté), en mètres. */
export const M = 9;
/** Zone libre autour du terrain, en unités. */
export const FREE = 5;
/** Profondeur d'un camp, en mètres. */
export const HALF_M = 9;
/** Ligne d'attaque : 3 m du filet. */
export const ATTACK_M = 3;

export const W = M * 2 * U + FREE * 2; // 190
export const H = M * U + FREE * 2; // 100
export const LEFT_X = FREE; // ligne de fond de l'équipe de gauche
export const NET_X = FREE + M * U; // 95
export const RIGHT_X = FREE + M * 2 * U; // 185
export const ATTACK = 3 * U; // 30

/** Postes, dans le repère de l'équipe. */
export const COURT_SPOTS = {
  P1: [1.5, 7.5],
  P2: [7.5, 7.5],
  P3: [7.5, 4.5],
  P4: [7.5, 1.5],
  P5: [1.5, 1.5],
  P6: [1.5, 4.5],
};

/** Les 9 zones de chaque camp, dans le repère de l'équipe. */
export const ZONE_CELLS = {
  4: [7.5, 1.5],
  3: [7.5, 4.5],
  2: [7.5, 7.5],
  7: [4.5, 1.5],
  8: [4.5, 4.5],
  9: [4.5, 7.5],
  5: [1.5, 1.5],
  6: [1.5, 4.5],
  1: [1.5, 7.5],
};

export const SPOT_LABELS = {
  P1: 'Arrière droit (service)',
  P2: 'Avant droit',
  P3: 'Avant centre',
  P4: 'Avant gauche',
  P5: 'Arrière gauche',
  P6: 'Arrière centre',
};

export const SPOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

/** Distance au filet (en unités SVG) d'un poste, pour un côté donné. */
export function distanceToNet(spot, side) {
  const { x } = spotXY(spot, side);
  return Math.abs(NET_X - x);
}

/** Coordonnées SVG (profondeur, largeur → x, y) pour le côté donné. */
export function xyFrom(depth, width, side) {
  if (side === 'left') {
    return { x: LEFT_X + depth * U, y: FREE + width * U };
  }
  return { x: RIGHT_X - depth * U, y: FREE + (M - width) * U };
}

/** Coordonnées SVG d'un poste, pour l'équipe de gauche (côté) ou de droite. */
export function spotXY(spot, side) {
  const [depth, width] = COURT_SPOTS[spot];
  return xyFrom(depth, width, side);
}

/** Vrai si le point est à l'intérieur des lignes du terrain. */
export function insideCourt(p) {
  return p.x >= LEFT_X && p.x <= RIGHT_X && p.y >= FREE && p.y <= FREE + M * U;
}

/**
 * Zone DataVolley (1-9) d'un point du terrain, dans le repère de l'équipe
 * (`side` = 'home' → moitié gauche, 'away' → moitié droite).
 * Grille officielle, du filet vers le fond : 4 3 2 / 7 8 9 / 5 6 1.
 * Un clic hors des lignes est ramené sur la ligne la plus proche.
 */
export function zoneFromPoint(point, side = 'home') {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const depth = side === 'away' ? (RIGHT_X - point.x) / U : (point.x - LEFT_X) / U;
  const width = side === 'away' ? M - (point.y - FREE) / U : (point.y - FREE) / U;
  const d = Math.min(M, Math.max(0, depth));
  const w = Math.min(M, Math.max(0, width));
  const col = w < M / 3 ? 0 : w < (2 * M) / 3 ? 1 : 2;
  if (d >= M - ATTACK_M) return ['4', '3', '2'][col];
  if (d >= ATTACK_M) return ['7', '8', '9'][col];
  return ['5', '6', '1'][col];
}

/**
 * Sous-zone DataVolley (A, B, C, D) d'un point dans sa zone 3x3m.
 * Convention DataVolley :
 *   B (avant-droite) | C (avant-gauche)
 *   A (arrière-droite) | D (arrière-gauche)
 * dans le repère de l'équipe qui défend la moitié où tombe le ballon.
 */
export function subzoneFromPoint(point, side = 'home') {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return '';
  const depth = side === 'away' ? (RIGHT_X - point.x) / U : (point.x - LEFT_X) / U;
  const width = side === 'away' ? M - (point.y - FREE) / U : (point.y - FREE) / U;
  const d = Math.min(M - 0.001, Math.max(0, depth));
  const w = Math.min(M - 0.001, Math.max(0, width));
  const localD = d % 3; // 0 (vers fond) .. 3 (vers filet)
  const localW = w % 3; // 0 (gauche) .. 3 (droite)
  const isFrontHalf = localD >= 1.5;
  const isRightHalf = localW >= 1.5;
  if (isFrontHalf && isRightHalf) return 'B';
  if (isFrontHalf && !isRightHalf) return 'C';
  if (!isFrontHalf && isRightHalf) return 'A';
  return 'D';
}

/**
 * Convertit un point SVG (terrain 18m×9m) en coordonnées DataVolley 4 (0..100).
 * Dans DataVolley 4, le terrain 18m×9m est représenté sur une grille 100×100.
 */
export function toDv100Coords(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { x: null, y: null };
  const nx = Math.round(((point.x - LEFT_X) / (RIGHT_X - LEFT_X)) * 1000) / 10;
  const ny = Math.round(((point.y - FREE) / (M * U)) * 1000) / 10;
  return {
    x: Math.max(0, Math.min(100, nx)),
    y: Math.max(0, Math.min(100, ny)),
  };
}

/** Convertit des coordonnées DataVolley 4 (0..100) en point SVG du terrain. */
export function fromDv100Coords(x100, y100) {
  if (x100 == null || y100 == null || !Number.isFinite(Number(x100)) || !Number.isFinite(Number(y100))) return null;
  return {
    x: LEFT_X + (Number(x100) / 100) * (RIGHT_X - LEFT_X),
    y: FREE + (Number(y100) / 100) * (M * U),
  };
}

/** Centre SVG de la zone 1-9 pour le côté de l'équipe donnée. */
export function zoneCenter(zone, side = 'home') {
  const cell = ZONE_CELLS[String(zone || '')];
  if (!cell) return null;
  return xyFrom(cell[0], cell[1], side === 'away' ? 'right' : 'left');
}
