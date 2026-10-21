// ============================================================================
// ANNOTATIONS VIDÉO — logique pure du calque de dessin.
//
// Les annotations sont stockées en coordonnées normalisées (0..1) relatives au
// rectangle visible de l'image, afin de rester valides quel que soit le
// redimensionnement de la vidéo ou le lecteur.
//
// Outils : trait, flèche, rectangle, ellipse, ligne libre, texte.
// ============================================================================

/** Les outils de dessin disponibles. */
export const DRAW_TOOLS = ['select', 'arrow', 'line', 'rect', 'ellipse', 'freehand', 'text'];

/** Les couleurs proposées. */
export const DRAW_COLORS = ['#e8453c', '#f2c14e', '#4ade80', '#38bdf8', '#ffffff', '#111111'];

/** Les épaisseurs de trait proposées. */
export const DRAW_WIDTHS = [2, 4, 7];

/**
 * Rectangle réellement occupé par l'image dans son élément (letterbox).
 * @param {number} boxW - largeur de l'élément
 * @param {number} boxH - hauteur de l'élément
 * @param {number} mediaW - largeur naturelle du média
 * @param {number} mediaH - hauteur naturelle du média
 * @returns {{x:number,y:number,width:number,height:number}} rectangle en pixels
 */
export function letterboxRect(boxW, boxH, mediaW, mediaH) {
  if (!boxW || !boxH || !mediaW || !mediaH) {
    return { x: 0, y: 0, width: boxW || 0, height: boxH || 0 };
  }
  const scale = Math.min(boxW / mediaW, boxH / mediaH);
  const width = mediaW * scale;
  const height = mediaH * scale;
  // Arrondi à 1/100 de pixel : évite le bruit flottant qui se propage ensuite
  // dans les coordonnées normalisées.
  return {
    x: round2((boxW - width) / 2),
    y: round2((boxH - height) / 2),
    width: round2(width),
    height: round2(height),
  };
}

/** Arrondi à deux décimales. */
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Convertit un point pixel en coordonnées normalisées de l'image.
 * @param {number} px
 * @param {number} py
 * @param {Object} rect - rectangle de l'image en pixels
 * @returns {{x:number,y:number}}
 */
export function toNormalized(px, py, rect) {
  if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: clamp01((px - rect.x) / rect.width),
    y: clamp01((py - rect.y) / rect.height),
  };
}

/**
 * Convertit des coordonnées normalisées en pixels.
 * @param {number} nx
 * @param {number} ny
 * @param {Object} rect
 * @returns {{x:number,y:number}}
 */
export function toPixels(nx, ny, rect) {
  if (!rect) return { x: 0, y: 0 };
  return { x: rect.x + nx * rect.width, y: rect.y + ny * rect.height };
}

/** Borne une valeur dans [0, 1]. */
export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Crée une annotation.
 * @param {string} tool - un des DRAW_TOOLS
 * @param {Object} data - données propres à l'outil
 * @param {Object} style - { color, width }
 * @returns {Object} annotation
 */
export function createAnnotation(tool, data, style = {}) {
  return {
    id: `${tool}-${Math.random().toString(36).slice(2, 10)}`,
    tool,
    color: style.color || DRAW_COLORS[0],
    width: style.width || DRAW_WIDTHS[1],
    ...data,
  };
}

/**
 * Complète une annotation en cours de tracé à partir d'un point normalisé.
 * @param {Object} draft - annotation en cours
 * @param {{x:number,y:number}} point
 * @returns {Object} nouvelle annotation (sans mutation)
 */
export function updateDraft(draft, point) {
  if (!draft) return draft;
  if (draft.tool === 'freehand') {
    const points = Array.isArray(draft.points) ? draft.points : [];
    return { ...draft, points: [...points, point] };
  }
  return { ...draft, x2: point.x, y2: point.y };
}

/**
 * Ajoute une annotation à la liste, en empilant l'historique.
 * @param {Array} annotations
 * @param {Array} history
 * @param {Object} annotation
 * @returns {{annotations:Array, history:Array}}
 */
export function pushAnnotation(annotations, history, annotation) {
  if (!annotation) return { annotations, history };
  return {
    annotations: [...(annotations || []), annotation],
    history: [...(history || []), { type: 'add', annotation }],
  };
}

/**
 * Annule la dernière modification.
 * @param {Array} annotations
 * @param {Array} history
 * @returns {{annotations:Array, history:Array}}
 */
export function undoAnnotation(annotations, history) {
  const list = history || [];
  if (!list.length) return { annotations, history: list };
  const last = list[list.length - 1];
  const nextHistory = list.slice(0, -1);
  if (last.type === 'add') {
    return { annotations: (annotations || []).slice(0, -1), history: nextHistory };
  }
  if (last.type === 'clear') {
    return { annotations: last.previous || [], history: nextHistory };
  }
  return { annotations, history: nextHistory };
}

/**
 * Efface toutes les annotations en gardant la trace pour l'annulation.
 * @param {Array} annotations
 * @param {Array} history
 * @returns {{annotations:Array, history:Array}}
 */
export function clearAnnotations(annotations, history) {
  const current = annotations || [];
  if (!current.length) return { annotations: current, history: history || [] };
  return { annotations: [], history: [...(history || []), { type: 'clear', previous: current }] };
}

/**
 * Sérialise les annotations pour l'export.
 * @param {Array} annotations
 * @returns {Object}
 */
export function serializeAnnotations(annotations) {
  return {
    version: 1,
    annotations: (annotations || []).map((a) => ({ ...a })),
  };
}

/**
 * Restaure des annotations sérialisées, en ignorant les entrées invalides.
 * @param {Object} data
 * @returns {Array}
 */
export function deserializeAnnotations(data) {
  const list = Array.isArray(data?.annotations) ? data.annotations : [];
  return list.filter((a) => a && typeof a.tool === 'string' && DRAW_TOOLS.includes(a.tool));
}
