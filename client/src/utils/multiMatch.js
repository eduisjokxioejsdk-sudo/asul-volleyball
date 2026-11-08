// ============================================================================
// Cumul de plusieurs matchs. Chaque match garde son propre flux d'actions, ses
// échanges, ses sets et ses compositions : on ne concatène JAMAIS les actions de
// deux matchs avant de former les échanges (sinon scores, sets et rotations
// seraient faux). L'équipe analysée est ramenée à « home » dans chaque match.
// ============================================================================

import { groupActionsIntoRallies } from './datavolley.js';
import { buildActionContext } from './dvContext.js';
import { computeMatchState } from './rotation.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** Côté de l'équipe cible dans un match : 'home' | 'away' | null. */
export function sideOfTeamInMatch(video, targetTeam) {
  const t = norm(targetTeam);
  if (!t) return null;
  if (norm(video?.team1_name) === t) return 'home';
  if (norm(video?.team2_name) === t) return 'away';
  return null;
}

/** Retourne l'action avec l'équipe cible côté « home ». */
export function normalizeAction(action, targetSide) {
  if (!action) return action;
  if (targetSide !== 'away') return { ...action, team: action.team === 'away' ? 'away' : 'home' };
  return { ...action, team: action.team === 'away' ? 'home' : 'away' };
}

/**
 * Prépare chaque match : actions normalisées, échanges, états (sets, rotations).
 * @param {Array<{video:Object, actions:Array, setups?:Object, events?:Array}>} matches
 * @param {string} targetTeam
 * @returns {Array<Object>} un élément par match où l'équipe cible joue
 */
export function prepareMatches(matches, targetTeam) {
  const out = [];
  for (const m of matches || []) {
    const side = sideOfTeamInMatch(m.video, targetTeam);
    if (!side) continue;
    const id = m.video?.id;
    const actions = (m.actions || [])
      .filter((a) => a && a.evaluation)
      .map((a, i) => ({
        ...normalizeAction(a, side),
        uid: `m${id}-${a.uid ?? a.id ?? a.action_index ?? i}`,
        action_index: i,
        match_video_id: id,
      }));
    const rallies = groupActionsIntoRallies(actions);
    const state = computeMatchState(rallies, m.setups || {}, {}, m.events || []);
    out.push({
      id,
      video: m.video,
      side,
      opponent: side === 'home' ? m.video?.team2_name : m.video?.team1_name,
      actions,
      rallies,
      state,
      setups: m.setups || {},
      events: m.events || [],
    });
  }
  return out;
}

/**
 * Index action -> contexte (set, rotation, phase, money-time) calculé MATCH PAR
 * MATCH. Les uid étant uniques entre matchs, les index se fusionnent sans
 * collision. Chaque contexte reçoit aussi `matchId` pour filtrer par match.
 */
export function buildMultiContext(prepared) {
  const merged = new Map();
  for (const m of prepared || []) {
    const local = buildActionContext(m.actions, m.setups, {}, m.rallies);
    for (const [key, ctx] of local) merged.set(key, { ...ctx, matchId: m.id });
  }
  return merged;
}

/** Toutes les actions normalisées de tous les matchs (pour les calculs sans état). */
export function allActions(prepared) {
  return (prepared || []).flatMap((m) => m.actions);
}

/**
 * Applique une analyse « par match » puis fusionne les résultats.
 * @param {Array} prepared sortie de prepareMatches
 * @param {(match:Object) => any} fn analyse d'un match
 * @param {(acc:any, part:any) => any} merge fusion de deux résultats
 * @param {any} initial valeur de départ
 */
export function reduceMatches(prepared, fn, merge, initial) {
  return (prepared || []).reduce((acc, m) => merge(acc, fn(m)), initial);
}

/** Additionne récursivement deux objets de compteurs (nombres sommés, objets fusionnés). */
export function sumCounters(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = sumCounters(a[k], b[k]);
    return out;
  }
  return b;
}

/** Résumé de chaque match pour l'en-tête : adversaire, score en sets, points. */
export function matchSummaries(prepared) {
  return (prepared || []).map((m) => {
    const sets = m.state?.sets || [];
    const mine = sets.filter((s) => (m.side === 'home' ? s.winner === 'team1' : s.winner === 'team2')).length;
    return {
      id: m.id,
      opponent: m.opponent || '?',
      date: m.video?.created_at || '',
      setsFor: mine,
      setsAgainst: sets.length - mine,
      rallies: m.rallies.length,
      actions: m.actions.length,
    };
  });
}

/**
 * Éléments de playlist pour des actions issues de plusieurs matchs (montage vidéo).
 * Les marges dépendent de la compétence ; une action sans timecode est ignorée.
 * @returns {{ items: Array, skipped: number }}
 */
export function playlistItemsFromActions(actions, getMargins, matchLabelOf = null) {
  const items = [];
  let skipped = 0;
  for (const a of actions || []) {
    const t = Number(a?.timecode);
    const videoId = Number(a?.match_video_id);
    if (!Number.isFinite(t) || !(videoId > 0)) { skipped += 1; continue; }
    const m = getMargins ? getMargins(a) : { leadIn: 3, leadOut: 3 };
    items.push({
      video_id: videoId,
      action_code: a.code || '',
      timecode: t,
      lead_in: m.leadIn,
      lead_out: m.leadOut,
      note: `${matchLabelOf ? matchLabelOf(a) + ' · ' : ''}${a.code || ''} n°${a.player_number || '?'}`,
    });
  }
  return { items, skipped };
}
