// ============================================================================
// Playlists de séance (mode « Playlists ») — construction, filtres et exports.
//
// Une playlist réunit des actions choisies À LA MAIN, éventuellement issues de
// plusieurs matchs. Chaque entrée (« item ») est autoportante : elle conserve la
// référence du match (video_id local + video_uuid partagé) ET un instantané
// lisible (libellés, code, timecodes du segment), afin qu'une playlist reste
// jouable et lisible même si un codage est retouché ensuite.
//
// « Poste » = poste de DÉPART DE L'ATTAQUE, comme dans les fiches de
// trajectoire : zone 4 (aile gauche), 3 (centre), 2 (aile droite) ou arrière
// (zones 1, 5, 6, 7, 8, 9 — un « pipe » tombe donc dans l'arrière).
// ============================================================================

import { ATTACK_START_ZONES } from './trajectory.js';
import { attackZoneOf } from './distribution.js';
import {
  DV_ACTIONS,
  buildPlaylist,
  effectiveTime,
  formatTimecode,
  groupActionsIntoRallies,
  rallyWinMethod,
} from './datavolley.js';
import { rowsToCsv } from './download.js';

/** Postes proposés au tri (mêmes libellés que la fiche de trajectoire partagée). */
export const PLAYLIST_POSTES = ATTACK_START_ZONES;

export const PLAYLIST_POSTE_IDS = PLAYLIST_POSTES.map((p) => p.id);

/** Portée d'une entrée de playlist : l'action seule ou le point entier. */
export const PLAYLIST_SCOPES = [
  { id: 'rally', label: 'Point entier' },
  { id: 'action', label: 'Action seule' },
];

/** Libellé d'un poste ('4', '3', '2', 'arriere'). */
export function posteLabel(id) {
  return PLAYLIST_POSTES.find((p) => p.id === id)?.label || '';
}

/**
 * Poste de départ d'une action : uniquement pour une attaque (A), à partir de
 * la zone de départ du code (déduite du combo ou saisie). Les autres actions
 * (services, réceptions…) n'ont pas de poste de départ : `null`.
 */
export function posteOfAction(action) {
  if (!action || action.action !== 'A') return null;
  const zone = attackZoneOf(action);
  if (!zone) return null;
  if (zone === '4' || zone === '3' || zone === '2') return zone;
  return 'arriere';
}

/** Poste d'une entrée construite par buildPlayerPlaylists / selectMatches. */
export function posteOfMatch(entry) {
  return entry?.poste || posteOfAction(entry?.action);
}

// ---------------------------------------------------------------------------
// FILTRES (joueur × action × poste × set × équipe)
// ---------------------------------------------------------------------------

/** Filtres neutres : tout est accepté. */
export const EMPTY_PLAYLIST_FILTERS = {
  team: 'all',
  playerNumber: 'all',
  action: 'all',
  poste: 'all',
  setNumber: 'all',
};

/**
 * Vrai si une action satisfait TOUS les filtres. Le tri par poste ne concerne
 * que les attaques : une autre action n'est jamais retenue par ce critère.
 * @param {Object} action action codée
 * @param {Object} [filters] { team, playerNumber, action, poste, setNumber }
 */
export function matchesActionFilters(action, filters = {}) {
  if (!action) return false;
  const {
    team = 'all',
    playerNumber = 'all',
    action: actionCode = 'all',
    poste = 'all',
    setNumber = 'all',
  } = filters;

  if (team !== 'all' && action.team !== team) return false;
  if (playerNumber !== 'all' && Number(action.player_number) !== Number(playerNumber)) return false;
  if (actionCode !== 'all' && action.action !== actionCode) return false;
  if (setNumber !== 'all' && Number(action.set_number) !== Number(setNumber)) return false;
  if (poste !== 'all' && posteOfAction(action) !== poste) return false;
  return true;
}

/** Actions d'un point qui satisfont les filtres (sert aussi au surlignage). */
export function matchingActions(rally, filters = {}) {
  return (rally?.actions || []).filter((a) => matchesActionFilters(a, filters));
}

/** Vrai si le point contient au moins une action qui satisfait les filtres. */
export function rallyMatchesFilters(rally, filters = {}) {
  return matchingActions(rally, filters).length > 0;
}

/** Points d'une playlist dynamique qui satisfont les filtres. */
export function filterRalliesByActions(rallies, filters = {}) {
  return (rallies || []).filter((r) => rallyMatchesFilters(r, filters));
}

/** Index des actions d'un point qui satisfont les filtres (surlignage). */
export function matchedActionIndexes(rally, filters = {}) {
  return new Set(matchingActions(rally, filters).map((a) => a.action_index));
}

/**
 * Filtres de l'onglet « Point par point » du codage (playlist d'un match).
 *
 * Deux familles de critères, volontairement différentes :
 *   • « présents dans le point » — équipe, action, évaluation et conclusion :
 *     le point passe dès qu'IL contient l'élément demandé (comportement
 *     historique du tableau de bord) ;
 *   • « joueur » et « poste de départ » : ils s'appliquent à la MÊME action,
 *     pour répondre à « l'attaque du n°4 partie du poste 4 ». Quand l'un des
 *     deux est actif, l'évaluation demandée est aussi vérifiée sur cette action.
 *
 * @param {Array} points playlist dynamique (buildPlaylist)
 * @param {Object} [filters] { team, action, evaluation, method, playerNumber, poste }
 */
export function filterPlaylistPoints(points, filters = {}) {
  const {
    team = 'all',
    action = 'all',
    evaluation = 'all',
    method = 'all',
    playerNumber = 'all',
    poste = 'all',
  } = filters;
  const scoped = playerNumber !== 'all' || poste !== 'all';

  return (points || []).filter((point) => {
    const acts = point?.actions || [];
    if (team !== 'all' && !acts.some((a) => a.team === team)) return false;
    if (action !== 'all' && !acts.some((a) => a.action === action)) return false;
    if (evaluation !== 'all' && !acts.some((a) => a.evaluation === evaluation)) return false;
    if (method !== 'all' && rallyWinMethod(point).key !== method) return false;
    if (!scoped) return true;

    const scopedActs = matchingActions(point, { team, playerNumber, action, poste });
    if (scopedActs.length === 0) return false;
    if (evaluation !== 'all' && !scopedActs.some((a) => a.evaluation === evaluation)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// MATRICE « UN JOUEUR × UN POSTE » (ce que l'on veut projeter en séance)
// ---------------------------------------------------------------------------

/**
 * Points d'un match avec leurs segments vidéo (lead-in / lead-out du match).
 * @param {Array} actions actions codées du match
 * @param {Object} [sync] réglages du match ({ sync_offset, lead_in, lead_out })
 */
export function rallyPlaylist(actions, sync = {}) {
  const rallies = groupActionsIntoRallies(actions || []);
  return buildPlaylist(rallies, {
    syncOffset: Number(sync?.sync_offset || 0),
    leadIn: Number(sync?.lead_in ?? 4),
    leadOut: Number(sync?.lead_out ?? 3),
  });
}

/**
 * Réunit les actions d'une équipe par joueur, avec le poste de départ de chaque
 * attaque. Chaque joueur reçoit `matches` (action + point + poste) et des
 * compteurs prêts à afficher ; la page en déduit une playlist par joueur et par
 * poste (ex. « n°4 · attaques en poste 4 »).
 * @param {Array} rallies points dérivés (buildPlaylist ou groupActionsIntoRallies)
 * @param {Object} [opts] { team: 'home'|'away', roster: [{number,name,role}] }
 */
export function buildPlayerPlaylists(rallies, opts = {}) {
  const { team = 'home', roster = [] } = opts;
  const map = new Map();

  const ensure = (number) => {
    if (!map.has(number)) {
      const meta = (roster || []).find((p) => Number(p.number) === number);
      map.set(number, {
        number,
        name: meta?.name || '',
        role: meta?.role || 'universal',
        total: 0,
        counts: {}, // { S: 3, A: 8, … }
        postes: {}, // { '4': 5, '3': 1, arriere: 2 }
        matches: [], // [{ rally, action, poste }]
      });
    }
    return map.get(number);
  };

  for (const rally of rallies || []) {
    for (const action of rally?.actions || []) {
      if (action.team !== team) continue;
      const number = Number(action.player_number) || 0;
      if (!number) continue;
      const entry = ensure(number);
      const poste = posteOfAction(action);
      entry.matches.push({ rally, action, poste });
      entry.total += 1;
      if (action.action) entry.counts[action.action] = (entry.counts[action.action] || 0) + 1;
      if (poste) entry.postes[poste] = (entry.postes[poste] || 0) + 1;
    }
  }

  return [...map.values()].sort((a, b) => a.number - b.number);
}

/**
 * Entrées d'un joueur pour un type d'action et/ou un poste donnés.
 * @param {Array} matches entrées d'un joueur (buildPlayerPlaylists)
 * @param {Object} [filters] { action: 'all'|'A'|'S'…, poste: 'all'|'4'|'3'|'2'|'arriere' }
 */
export function selectMatches(matches, filters = {}) {
  const { action = 'all', poste = 'all' } = filters;
  return (matches || []).filter((entry) => {
    if (action !== 'all' && entry.action?.action !== action) return false;
    if (poste !== 'all' && posteOfMatch(entry) !== poste) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// ENTREES DE PLAYLIST (ajout manuel : action seule ou point entier)
// ---------------------------------------------------------------------------

let itemSequence = 0;

/** Identifiant local d'une entrée (stable dans la playlist sauvegardée). */
export function makePlaylistItemId() {
  itemSequence += 1;
  return `pl_${Date.now().toString(36)}_${itemSequence}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Construit une entrée de playlist à partir d'un point et d'une action.
 * @param {Object} rally point dérivé (contient `actions`, `pointNumber`…)
 * @param {Object} action action visée (celle qui a déclenché l'ajout)
 * @param {Object} [ctx] { video, sync, teamLabel, playerName, poste, scope,
 *                         leadIn, leadOut }
 * @returns {Object|null} entrée prête à stocker, ou null si non jouable
 */
export function playlistItemFromRally(rally, action, ctx = {}) {
  const {
    video = null,
    sync = null,
    teamLabel = '',
    playerName = '',
    poste = null,
    scope = 'rally',
    leadIn = null,
    leadOut = null,
  } = ctx;

  const syncOffset = Number(sync?.sync_offset || 0);
  const inLead = leadIn != null ? Number(leadIn) : Number(sync?.lead_in ?? 4);
  const outLead = leadOut != null ? Number(leadOut) : Number(sync?.lead_out ?? 3);

  const acts = rally?.actions || [];
  const first = acts[0] || null;
  const last = acts[acts.length - 1] || null;

  let start = null;
  let end = null;
  if (scope === 'action') {
    const time = effectiveTime(action, syncOffset);
    start = time != null ? Math.max(0, time - inLead) : null;
    end = time != null ? time + outLead : null;
  } else {
    const firstTime = effectiveTime(first, syncOffset);
    const lastTime = effectiveTime(last, syncOffset);
    start = firstTime != null ? Math.max(0, firstTime - inLead) : null;
    end = lastTime != null ? lastTime + outLead : null;
  }
  if (start == null || end == null || end < start) return null;

  const team = action?.team || first?.team || 'home';
  const label = teamLabel || (team === 'away' ? video?.team2_name : video?.team1_name) || '';

  return {
    id: makePlaylistItemId(),
    position: 0, // renumérotée par normalizePlaylistItems à l'enregistrement
    video_id: video?.id != null ? Number(video.id) : null,
    video_uuid: video?.sync_uuid || null,
    video_label: video ? video.display_name || video.original_name || '' : '',
    video_filename: video?.filename || '',
    team1_name: video?.team1_name || '',
    team2_name: video?.team2_name || '',
    team,
    team_label: label,
    player_number: Number(action?.player_number ?? first?.player_number ?? 0) || 0,
    player_name: playerName || '',
    set_number: action?.set_number ?? first?.set_number ?? null,
    point_number: rally?.pointNumber ?? null,
    action_index: action?.action_index ?? null,
    action_code: action?.code || '',
    action: action?.action || '',
    evaluation: action?.evaluation || '',
    type: action?.type || '',
    start_zone: action?.start_zone || null,
    end_zone: action?.end_zone || null,
    poste: poste || posteOfAction(action),
    scope: scope === 'action' ? 'action' : 'rally',
    lead_in: inLead,
    lead_out: outLead,
    segment_start: start,
    segment_end: end,
    note: '',
  };
}

/** Entrées correspondant à une sélection de points/actions (ajout groupé). */
export function itemsFromMatches(matches, ctx = {}) {
  const out = [];
  for (const entry of matches || []) {
    const item = playlistItemFromRally(entry.rally, entry.action, {
      ...ctx,
      poste: entry.poste || ctx.poste || null,
    });
    if (item) out.push(item);
  }
  return out;
}

/** Accepte un tableau ou la chaîne JSON stockée en base, et normalise le tout. */
export function parsePlaylistItems(value) {
  if (Array.isArray(value)) return normalizePlaylistItems(value);
  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizePlaylistItems(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Nettoie des entrées lues (base, import) : identifiants, numéros, positions
 * 1..n, et suppression des entrées non jouables (sans vidéo ou sans segment).
 */
export function normalizePlaylistItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .filter((it) => it && (it.video_id || it.video_uuid))
    .map((it) => ({
      ...it,
      id: it.id || makePlaylistItemId(),
      video_id: it.video_id != null ? Number(it.video_id) : null,
      player_number: Number(it.player_number) || 0,
      point_number: it.point_number != null && it.point_number !== '' ? Number(it.point_number) : null,
      set_number: it.set_number != null && it.set_number !== '' ? Number(it.set_number) : null,
      segment_start: Number(it.segment_start) || 0,
      segment_end: Number(it.segment_end) || 0,
      lead_in: Number(it.lead_in ?? 4),
      lead_out: Number(it.lead_out ?? 3),
      scope: it.scope === 'action' ? 'action' : 'rally',
      poste: it.poste || null,
      note: it.note || '',
    }))
    .filter((it) => it.segment_end >= it.segment_start)
    .map((it, index) => ({ ...it, position: index + 1 }));
}

/** Compteurs d'une playlist : nombre d'entrées, de matchs et durée totale. */
export function playlistStats(items) {
  const list = Array.isArray(items) ? items : [];
  const matches = new Set();
  let duration = 0;
  for (const it of list) {
    matches.add(it.video_uuid || `local:${it.video_id}`);
    duration += Math.max(0, Number(it.segment_end) - Number(it.segment_start));
  }
  return { count: list.length, matches: matches.size, duration };
}

/** Vrai si le fichier vidéo de l'entrée est présent sur ce poste. */
export function playlistItemHasFile(item) {
  return Boolean(item?.video_filename);
}

/** Déplace une entrée dans la playlist et renumérote les positions. */
export function movePlaylistItem(items, from, to) {
  const list = [...(items || [])];
  if (from < 0 || from >= list.length) return list;
  const target = Math.min(Math.max(0, to), list.length - 1);
  const [moved] = list.splice(from, 1);
  list.splice(target, 0, moved);
  return list.map((it, index) => ({ ...it, position: index + 1 }));
}

/** Retire une entrée (par identifiant) et renumérote les positions. */
export function removePlaylistItem(items, id) {
  return (items || [])
    .filter((it) => it.id !== id)
    .map((it, index) => ({ ...it, position: index + 1 }));
}

// ---------------------------------------------------------------------------
// EXPORTS (feuille de séance : timecodes et marqueurs de montage)
// ---------------------------------------------------------------------------

/** Libellé français d'une action codée (S → Service…). */
export function actionLabel(actionCode) {
  return DV_ACTIONS.find((a) => a.code === actionCode)?.label || actionCode || '';
}

/** Lignes CSV d'une playlist (une ligne par entrée, en-tête compris). */
export function playlistToRows(items) {
  const list = normalizePlaylistItems(items);
  const rows = [[
    '#', 'Match', 'Équipe', 'Joueur', 'Poste', 'Set', 'Point', 'Code', 'Action', 'Éval',
    'Début (s)', 'Fin (s)', 'Durée (s)', 'Début', 'Fin', 'Portée', 'Note',
  ]];
  for (const it of list) {
    const duration = Math.max(0, it.segment_end - it.segment_start);
    rows.push([
      it.position,
      it.video_label,
      it.team_label,
      it.player_number ? `n°${String(it.player_number).padStart(2, '0')}${it.player_name ? ` ${it.player_name}` : ''}` : '',
      it.poste ? posteLabel(it.poste) : '',
      it.set_number ?? '',
      it.point_number ?? '',
      it.action_code,
      actionLabel(it.action),
      it.evaluation,
      Number(it.segment_start.toFixed(2)),
      Number(it.segment_end.toFixed(2)),
      Number(duration.toFixed(2)),
      formatTimecode(it.segment_start),
      formatTimecode(it.segment_end),
      it.scope === 'action' ? 'Action seule' : 'Point entier',
      it.note,
    ]);
  }
  return rows;
}

/** Feuille de séance d'une playlist, prête à télécharger en CSV. */
export function playlistToCsv(items) {
  return rowsToCsv(playlistToRows(items));
}

/** Taille maximale d'un nom de bande dans un EDL (8 caractères). */
const EDL_REEL_MAX = 8;

/** Nom de bande (reel) d'une entrée, déduit du nom du match. */
export function edlReelName(item) {
  const base = String(item?.video_label || item?.video_filename || 'MATCH')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (base || 'MATCH').slice(0, EDL_REEL_MAX);
}

/** Timecode HH:MM:SS:FF à partir de secondes (25 i/s par défaut). */
export function secondsToTimecode(seconds, fps = 25) {
  const rate = Number(fps) > 0 ? Number(fps) : 25;
  const total = Math.max(0, Math.round((Number(seconds) || 0) * rate));
  const ff = total % rate;
  const rest = Math.floor(total / rate);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(rest / 3600))}:${pad(Math.floor(rest / 60) % 60)}:${pad(rest % 60)}:${pad(ff)}`;
}

/** Commentaire lisible d'une entrée (reprend code, joueur, poste et point). */
export function edlComment(item) {
  const parts = [];
  if (item.action_code) parts.push(item.action_code);
  if (item.player_number) {
    parts.push(`n°${String(item.player_number).padStart(2, '0')}${item.player_name ? ` ${item.player_name}` : ''}`);
  }
  if (item.poste) parts.push(posteLabel(item.poste));
  if (item.point_number) parts.push(`point ${item.point_number}`);
  if (item.set_number) parts.push(`set ${item.set_number}`);
  return parts.join(' · ');
}

/**
 * EDL (marqueurs de montage) d'une playlist : un événement par entrée, le
 * montage se construisant bout à bout. Utilisable dans un logiciel de montage
 * (Resolve, Premiere) pour reconstruire la séance sans réencodage.
 * @param {Array} items entrées de la playlist
 * @param {Object} [opts] { title, fps }
 */
export function playlistToEdl(items, opts = {}) {
  const { title = 'Playlist ASUL', fps = 25 } = opts;
  const list = normalizePlaylistItems(items);
  const lines = [
    `TITLE: ${String(title).replace(/\s+/g, ' ').trim().slice(0, 60) || 'Playlist ASUL'}`,
    'FCM: NON-DROP FRAME',
    '',
  ];
  let record = 0;
  list.forEach((it, index) => {
    const duration = Math.max(0, it.segment_end - it.segment_start);
    const sourceIn = secondsToTimecode(it.segment_start, fps);
    const sourceOut = secondsToTimecode(it.segment_end, fps);
    const recordIn = secondsToTimecode(record, fps);
    record += duration;
    const recordOut = secondsToTimecode(record, fps);
    const number = String(index + 1).padStart(3, '0');
    const reel = edlReelName(it).padEnd(EDL_REEL_MAX);
    lines.push(`${number}  ${reel} V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`);
    if (it.video_filename) lines.push(`* FROM CLIP NAME: ${it.video_filename}`);
    lines.push(`* COMMENT: ${edlComment(it)}`);
  });
  return `${lines.join('\n')}\n`;
}




