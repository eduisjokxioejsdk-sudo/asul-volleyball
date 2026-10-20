// ============================================================================
// Disposition des fenêtres de la page de codage (façon fenêtres de bureau).
// Chaque « fenêtre » a un rectangle { x, y, w, h } en pixels dans un canevas,
// plus un état `open`. La vidéo et la zone de code sont des ancres : elles
// peuvent être déplacées / redimensionnées mais jamais fermées.
// Logique pure (testable) : disposition par défaut, bornage, ouverture.
// ============================================================================

/** Fenêtres toujours présentes (non fermables). */
export const ANCHOR_PANELS = ['video', 'console'];

/** Toutes les fenêtres de la page codage, dans l'ordre du menu « Fenêtres ». */
export const PANEL_IDS = ['video', 'console', 'score', 'court', 'positions', 'actions', 'direction', 'shortcuts', 'aide', 'keypad'];

/** Titres + icônes (noms d'icônes de components/icons) de chaque fenêtre. */
export const PANEL_META = {
  video: { title: 'Vidéo', icon: 'MonitorPlay' },
  console: { title: 'Zone de code', icon: 'Keyboard' },
  score: { title: 'Score', icon: 'Trophy' },
  court: { title: 'Terrain', icon: 'Crosshair' },
  positions: { title: 'Positions', icon: 'Users' },
  actions: { title: 'Actions codées', icon: 'ListChecks' },
  direction: { title: 'Direction d’attaque', icon: 'Target' },
  shortcuts: { title: 'Raccourcis', icon: 'Keyboard' },
  aide: { title: 'Aide-mémoire', icon: 'CircleHelp' },
  keypad: { title: 'Clavier virtuel', icon: 'Grid3x3' },
};

/** Bornes minimales : { minW, minH } par fenêtre. */
export const PANEL_MIN = {
  video: { minW: 320, minH: 200 },
  console: { minW: 320, minH: 180 },
  score: { minW: 220, minH: 70 },
  court: { minW: 220, minH: 160 },
  positions: { minW: 220, minH: 110 },
  actions: { minW: 220, minH: 120 },
  direction: { minW: 260, minH: 180 },
  shortcuts: { minW: 220, minH: 52 },
  aide: { minW: 240, minH: 160 },
  keypad: { minW: 240, minH: 140 },
};

export const PANEL_GAP = 12;
const HEADER_H = 30;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Ramène un rectangle dans les limites du canevas.
 *  Important : si la taille du canevas est inconnue (0/undefined) ou plus petite
 *  que la fenêtre, on ne tasse JAMAIS la fenêtre (sinon elle se bloque en haut à
 *  gauche et devient impossible à déplacer). On se contente d'empêcher de sortir
 *  par le haut / la gauche ; le canevas grandit pour accueillir le reste. */
export function clampRect(rect, size, min = { minW: 200, minH: 80 }) {
  const minW = min.minW || 200;
  const minH = min.minH || 80;
  const w0 = Math.max(Math.round(Number(rect?.w) || minW), minW);
  const h0 = Math.max(Math.round(Number(rect?.h) || minH), minH);
  const cw = Number(size?.width) || 0;
  const ch = Number(size?.height) || 0;
  // Plafond large mais non infini : 2× le canevas (ou 4000 px si inconnu).
  const maxW = cw > 0 ? Math.max(cw * 2, 1200) : 4000;
  const maxH = ch > 0 ? Math.max(ch * 2, 900) : 4000;
  const w = clamp(w0, minW, maxW);
  const h = clamp(h0, minH, maxH);
  const x = Math.max(0, Math.round(Number(rect?.x) || 0));
  const y = Math.max(0, Math.round(Number(rect?.y) || 0));
  return { x, y, w, h };
}


/** Vrai si la fenêtre peut être fermée (la vidéo et la zone de code non). */
export function isClosable(id) {
  return !ANCHOR_PANELS.includes(id);
}

/**
 * Disposition par défaut, en deux colonnes :
 *   • colonne gauche : vidéo, zone de code, actions codées, clavier virtuel ;
 *   • colonne droite : score, terrain, positions, raccourcis, aide-mémoire.
 * Sur canevas étroit (< 940 px), tout s'empile en une seule colonne.
 * @param {number} width - largeur du canevas
 * @param {number} height - hauteur du canevas
 * @param {string[]} [skip] - fenêtres à ne pas créer (ex. « video » en live)
 */
export function defaultPanelLayout(width = 1200, height = 800, skip = []) {
  const gap = PANEL_GAP;
  const W = Math.max(420, Math.round(width));
  const H = Math.max(400, Math.round(height));
  const singleColumn = W < 940;

  const railW = singleColumn ? W : clamp(Math.round(W * 0.32), 300, 460);
  const leftW = singleColumn ? W : Math.max(360, W - railW - gap);
  const rightX = singleColumn ? 0 : leftW + gap;

  const videoH = clamp(Math.round(((leftW - 2) * 9) / 16) + HEADER_H + 30, 240, Math.max(260, Math.round(H * 0.62)));
  const consoleH = clamp(Math.round(H * 0.34), 240, 380);
  const actionsH = clamp(Math.round(H * 0.28), 200, 340);
  const directionH = clamp(Math.round(leftW / 2.4) + HEADER_H + 40, 220, 360);
  const shortcutsH = 60;
  const courtH = clamp(Math.round(railW / 1.9) + HEADER_H + 40, 200, 420);
  const scoreH = 92;
  const positionsH = 168;
  const aideH = clamp(Math.round(H * 0.32), 200, 380);
  const keypadH = 220;

  const layout = {};

  if (singleColumn) {
    let y = 0;
    const push = (id, h, open = true) => {
      if (skip.includes(id)) return;
      const hh = Math.min(h, H);
      layout[id] = { x: 0, y, w: W, h: hh, open };
      y += hh + gap;
    };
    push('video', videoH);
    push('score', scoreH);
    push('console', consoleH);
    push('court', courtH);
    push('positions', positionsH);
    push('actions', actionsH);
    push('direction', directionH);
    push('shortcuts', shortcutsH);
    if (!skip.includes('aide')) {
      layout.aide = { x: 0, y, w: W, h: Math.min(aideH, H), open: false };
      y += Math.min(aideH, H) + gap;
    }
    if (!skip.includes('keypad')) layout.keypad = { x: 0, y, w: W, h: Math.min(keypadH, H), open: false };
    return layout;
  }

  let ly = 0;
  if (!skip.includes('video')) {
    layout.video = { x: 0, y: ly, w: leftW, h: videoH, open: true };
    ly += videoH + gap;
  }
  layout.console = { x: 0, y: ly, w: leftW, h: consoleH, open: true };
  ly += consoleH + gap;
  layout.actions = { x: 0, y: ly, w: leftW, h: actionsH, open: true };
  ly += actionsH + gap;
  if (!skip.includes('direction')) {
    layout.direction = { x: 0, y: ly, w: leftW, h: directionH, open: true };
    ly += directionH + gap;
  }
  if (!skip.includes('keypad')) layout.keypad = { x: 0, y: ly, w: leftW, h: keypadH, open: false };

  let ry = 0;
  layout.score = { x: rightX, y: ry, w: railW, h: scoreH, open: true };
  ry += scoreH + gap;
  layout.court = { x: rightX, y: ry, w: railW, h: courtH, open: true };
  ry += courtH + gap;
  layout.positions = { x: rightX, y: ry, w: railW, h: positionsH, open: true };
  ry += positionsH + gap;
  layout.shortcuts = { x: rightX, y: ry, w: railW, h: shortcutsH, open: true };
  ry += shortcutsH + gap;
  layout.aide = { x: rightX, y: ry, w: railW, h: aideH, open: false };

  return layout;
}

/** Hauteur minimale du canevas pour que toutes les fenêtres ouvertes tiennent. */
export function canvasMinHeight(layout) {
  let max = 0;
  for (const id of PANEL_IDS) {
    const r = layout?.[id];
    if (!r) continue;
    max = Math.max(max, (Number(r.y) || 0) + (Number(r.h) || 0));
  }
  return Math.max(600, max + PANEL_GAP);
}

/** Largeur minimale du canevas : les fenêtres déplacées vers la droite
 *  agrandissent l'espace de travail au lieu d'être bloquées. */
export function canvasMinWidth(layout) {
  let max = 0;
  for (const id of PANEL_IDS) {
    const r = layout?.[id];
    if (!r || !r.open) continue;
    max = Math.max(max, (Number(r.x) || 0) + (Number(r.w) || 0));
  }
  return Math.max(0, max);
}


/**
 * Applique une mise à jour de rectangle / d'état à la disposition.
 * @param {Object} layout
 * @param {string} id
 * @param {Object} patch - { x, y, w, h, open }
 * @param {Object} size - { width, height } du canevas
 */
export function applyPanelPatch(layout, id, patch, size) {
  if (!layout?.[id]) return layout;
  const min = PANEL_MIN[id] || { minW: 200, minH: 80 };
  const next = { ...layout[id], ...patch };
  if (patch.open === false && !isClosable(id)) next.open = true;
  const clamped = clampRect(next, size, min);
  return { ...layout, [id]: { ...next, ...clamped } };
}

/** Ouvre / ferme une fenêtre (les ancres restent toujours ouvertes). */
export function togglePanel(layout, id) {
  if (!layout?.[id]) return layout;
  if (!isClosable(id)) return layout;
  return { ...layout, [id]: { ...layout[id], open: !layout[id].open } };
}

/** Ouvre une fenêtre (idempotent). */
export function openPanel(layout, id) {
  if (!layout?.[id] || layout[id].open) return layout;
  return { ...layout, [id]: { ...layout[id], open: true } };
}

/** Ouvre ou ferme un ensemble de fenêtres d'un coup. */
export function setPanelsOpen(layout, ids, open) {
  const next = { ...layout };
  for (const id of ids) {
    if (!next[id]) continue;
    if (!open && !isClosable(id)) continue;
    next[id] = { ...next[id], open: !!open };
  }
  return next;
}

/** Vrai si toutes les fenêtres demandées sont ouvertes. */
export function arePanelsOpen(layout, ids) {
  return ids.every((id) => !!layout?.[id]?.open);
}

/** Vérifie qu'aucune position n'est négative (les tailles ne sont jamais
 *  modifiées : c'est ce qui bloquait les fenêtres en haut à gauche). */
export function fitPanelLayout(layout, size) {
  const next = {};
  let changed = false;
  for (const id of PANEL_IDS) {
    const r = layout?.[id];
    if (!r) continue;
    const min = PANEL_MIN[id] || { minW: 200, minH: 80 };
    const clamped = clampRect(r, size, min);
    if (clamped.x !== r.x || clamped.y !== r.y || clamped.w !== r.w || clamped.h !== r.h) changed = true;
    next[id] = { ...r, ...clamped };
  }
  return changed ? next : layout;
}
