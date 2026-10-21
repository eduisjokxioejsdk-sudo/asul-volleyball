// ============================================================================
// PLAYLIST DE RALLIES — logique pure (mode Consultation / analyse vidéo).
//
// La playlist est la liste ordonnée des points retenus par les filtres. Ce
// module contient les fonctions de manipulation de cette liste : construction,
// tri, statistiques, et calcul du point suivant/précédent.
// ============================================================================

/**
 * Normalise un point (rally) pour la playlist.
 * @param {Object} rally - point issu de groupActionsIntoRallies
 * @returns {Object} point normalisé
 */
export function normalizeRally(rally) {
  const actions = Array.isArray(rally?.actions) ? rally.actions : [];
  return {
    ...rally,
    actions,
    pointNumber: rally?.pointNumber ?? rally?.point_number ?? null,
    code: actions.map((a) => a.code || '').join(''),
    actionCount: actions.length,
    firstTimecode: actions[0]?.timecode ?? null,
    lastTimecode: actions.length ? actions[actions.length - 1].timecode ?? null : null,
  };
}

/**
 * Construit la playlist à partir d'une liste de points.
 * @param {Array} rallies
 * @returns {Array} points normalisés, dans l'ordre d'origine
 */
export function buildPlaylist(rallies) {
  return (Array.isArray(rallies) ? rallies : []).map(normalizeRally);
}

/**
 * Les champs sur lesquels on peut trier une playlist.
 */
export const PLAYLIST_SORTS = ['order', 'time', 'actions', 'code'];

/**
 * Trie une playlist.
 * @param {Array} playlist
 * @param {string} sort - 'order' | 'time' | 'actions' | 'code'
 * @param {string} [dir] - 'asc' | 'desc'
 * @returns {Array} nouvelle liste triée (l'original n'est pas modifié)
 */
export function sortPlaylist(playlist, sort = 'order', dir = 'asc') {
  const list = [...(playlist || [])];
  const sign = dir === 'desc' ? -1 : 1;
  const byTime = (a, b) => (a.firstTimecode ?? 0) - (b.firstTimecode ?? 0);
  const byActions = (a, b) => a.actionCount - b.actionCount;
  const byCode = (a, b) => String(a.code || '').localeCompare(String(b.code || ''));

  if (sort === 'time') list.sort((a, b) => sign * byTime(a, b));
  else if (sort === 'actions') list.sort((a, b) => sign * byActions(a, b));
  else if (sort === 'code') list.sort((a, b) => sign * byCode(a, b));
  else list.sort((a, b) => sign * ((a.pointNumber ?? 0) - (b.pointNumber ?? 0)));

  return list;
}

/**
 * Statistiques simples sur une playlist.
 * @param {Array} playlist
 * @returns {{count:number, actions:number, avgActions:number, totalDuration:number}}
 */
export function playlistStats(playlist) {
  const list = Array.isArray(playlist) ? playlist : [];
  const actions = list.reduce((sum, r) => sum + (r.actionCount || 0), 0);
  return {
    count: list.length,
    actions,
    avgActions: list.length ? actions / list.length : 0,
  };
}

/**
 * Index du point contenant l'action d'index donné.
 * @param {Array} playlist
 * @param {number} actionIndex
 * @returns {number} index dans la playlist (-1 si absent)
 */
export function playlistIndexOfAction(playlist, actionIndex) {
  if (actionIndex == null) return -1;
  const list = Array.isArray(playlist) ? playlist : [];
  return list.findIndex((r) => (r.actions || []).some((a) => a.action_index === actionIndex));
}

/**
 * Point suivant dans la playlist (boucle facultative).
 * @param {Array} playlist
 * @param {number} currentIndex - index du point courant
 * @param {boolean} [loop] - reboucler en fin de liste
 * @returns {number} index suivant (-1 si aucun)
 */
export function nextPlaylistIndex(playlist, currentIndex, loop = false) {
  const list = Array.isArray(playlist) ? playlist : [];
  if (!list.length) return -1;
  const next = (currentIndex ?? -1) + 1;
  if (next < list.length) return next;
  return loop ? 0 : -1;
}

/**
 * Point précédent dans la playlist (boucle facultative).
 * @param {Array} playlist
 * @param {number} currentIndex - index du point courant
 * @param {boolean} [loop] - reboucler en début de liste
 * @returns {number} index précédent (-1 si aucun)
 */
export function prevPlaylistIndex(playlist, currentIndex, loop = false) {
  const list = Array.isArray(playlist) ? playlist : [];
  if (!list.length) return -1;
  const prev = (currentIndex ?? 0) - 1;
  if (prev >= 0) return prev;
  return loop ? list.length - 1 : -1;
}
