// ============================================================================
// OUTILS DES MODES DE CODAGE — Saisie · Consultation · Correction · Analyse.
//
// Organisation reprise de DataVolley 4 : l'écran de saisie, la relecture, la
// correction des codes et les fenêtres d'analyse partagent les mêmes données
// (actions + remplacements + synchronisation) et donc les mêmes calculs.
//
// Tout ce fichier est PUR (aucun accès réseau ni DOM) : les règles sont
// vérifiées par client/scripts/coding-tools.spec.mjs.
// ============================================================================

import {
  buildPointSegments,
  decomposeCode,
  evaluationAllowed,
  getPointWinner,
  groupActionsIntoRallies,
  isTerminalEvaluation,
  makeAction,
  reindexActions,
  validateAction,
} from './datavolley.js';
import { COURT_POSITIONS, POSITION_LABELS } from './rotation.js';

// ---------------------------------------------------------------------------
// 1. ROTATION AU MOMENT D'UNE ACTION (mode Consultation / Analyse)
// ---------------------------------------------------------------------------

/** Numéro de rotation (1 à 6) à partir du poste occupé par le passeur. */
export function rotationNumber(setterPos) {
  const i = COURT_POSITIONS.indexOf(setterPos);
  return i === -1 ? null : i + 1;
}

/**
 * État du terrain au moment d'une action : set, score, serveur, six des deux
 * équipes et rotation de chacune. Sert au terrain affiché en Consultation et
 * au filtrage par rotation des analyses.
 *
 * @param {Array} rallies - rallyes (groupActionsIntoRallies)
 * @param {Object} matchState - état rejoué (computeMatchState)
 * @param {number} actionIndex - action_index de l'action visée
 * @returns {Object|null}
 */
export function rotationAt(rallies, matchState, actionIndex) {
  const list = rallies || [];
  const states = matchState?.states || [];
  const rally = list.find((r) => (r.actions || []).some((a) => a.action_index === actionIndex));
  if (!rally) return null;
  const snapshot = states.find((s) => s.pointNumber === rally.pointNumber) || null;
  const action = (rally.actions || []).find((a) => a.action_index === actionIndex) || null;

  const homeRotation = rotationNumber(snapshot?.homeSetterPos);
  const awayRotation = rotationNumber(snapshot?.awaySetterPos);

  return {
    pointNumber: rally.pointNumber,
    setNumber: snapshot?.setNumber ?? null,
    score: snapshot?.scoreBefore ? { ...snapshot.scoreBefore } : null,
    server: snapshot?.server ?? null,
    homeLineup: snapshot?.homeLineup ? { ...snapshot.homeLineup } : null,
    awayLineup: snapshot?.awayLineup ? { ...snapshot.awayLineup } : null,
    homeSetterPos: snapshot?.homeSetterPos ?? null,
    awaySetterPos: snapshot?.awaySetterPos ?? null,
    homeRotation,
    awayRotation,
    team: action?.team || null,
    /** Rotation de l'équipe qui joue l'action (celle que montre DataVolley). */
    rotation: action?.team === 'away' ? awayRotation : homeRotation,
    setterPos: action?.team === 'away' ? snapshot?.awaySetterPos ?? null : snapshot?.homeSetterPos ?? null,
  };
}

/** Libellé lisible d'un poste (« P4 — Avant gauche »). */
export function positionLabel(pos) {
  if (!pos) return '—';
  const label = POSITION_LABELS[pos];
  return label ? `${pos} — ${label}` : pos;
}


// ---------------------------------------------------------------------------
// 2. RECHERCHE DANS LES CODES (mode Consultation)
// ---------------------------------------------------------------------------

export const EMPTY_FILTERS = {
  team: 'all',
  player: '',
  action: 'all',
  evaluation: 'all',
  set: 'all',
  zone: 'all',
  combo: 'all',
  type: 'all',
  query: '',
};

/**
 * Comparaison d'un code à un motif. Le motif accepte `*` (n'importe quoi, y
 * compris vide) et `?` (un caractère). Sans joker, c'est une simple recherche
 * de texte — la casse n'a pas d'importance.
 */
export function matchCodePattern(code, pattern) {
  const c = String(code || '');
  const p = String(pattern || '').trim();
  if (!p) return true;
  if (!p.includes('*') && !p.includes('?')) return c.toLowerCase().includes(p.toLowerCase());
  const rx = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${rx}$`, 'i').test(c);
}

/**
 * Filtre une liste d'actions selon les critères des fenêtres de consultation.
 *
 * @param {Array} actions
 * @param {Object} filters - voir EMPTY_FILTERS (chaînes vides = pas de filtre)
 * @param {Object} [opts]
 * @param {Function} [opts.setOf] - (action) => numéro de set (indexActionSets)
 * @param {Function} [opts.comboOf] - (action) => code de combinaison
 * @param {Function} [opts.typeOf] - (action) => symbole de type
 * @returns {Array}
 */
export function searchCodes(actions, filters = {}, opts = {}) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const setOf = opts.setOf || ((a) => a?.set_number ?? null);
  const comboOf = opts.comboOf || ((a) => a?.combo ?? null);
  const typeOf = opts.typeOf || ((a) => a?.type ?? null);

  const wantPlayer = f.player === '' || f.player == null ? null : Number(f.player);
  const wantZone = f.zone === 'all' || f.zone === '' ? null : String(f.zone);

  return (actions || []).filter((a) => {
    if (!a) return false;
    if (f.team !== 'all' && f.team && a.team !== f.team) return false;
    if (wantPlayer != null && Number(a.player_number) !== wantPlayer) return false;
    if (f.action !== 'all' && f.action && a.action !== f.action) return false;
    if (f.evaluation !== 'all' && f.evaluation && a.evaluation !== f.evaluation) return false;
    if (f.set !== 'all' && f.set !== '' && f.set != null) {
      const s = Number(setOf(a));
      if (Number(f.set) !== s) return false;
    }
    if (wantZone != null) {
      const zones = [a.start_zone, a.end_zone].filter(Boolean).map(String);
      if (!zones.includes(wantZone)) return false;
    }
    if (f.combo !== 'all' && f.combo && String(comboOf(a) || '') !== String(f.combo)) return false;
    if (f.type !== 'all' && f.type && String(typeOf(a) || '') !== String(f.type)) return false;
    if (f.query && !matchCodePattern(a.code, f.query)) return false;
    return true;
  });
}

/** Compte les actions retenues par action (S, R, A…) pour le bandeau de filtres. */
export function countByAction(actions) {
  const out = {};
  for (const a of actions || []) {
    if (!a?.action) continue;
    out[a.action] = (out[a.action] || 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. CONTRÔLE DES CODES (mode Correction)
// ---------------------------------------------------------------------------

export const CODE_ISSUE_LABELS = {
  invalid_code: 'code non conforme',
  bad_evaluation: 'évaluation interdite pour cette action',
  no_evaluation: 'aucune évaluation (mode consultation)',
  no_timecode: 'action sans temps vidéo',
  point_open: 'point sans fin de point',
  point_incomplete: 'point interrompu (nouveau service)',
  missing_serve: 'le point ne commence pas par un service',
  reception_without_serve: 'réception qui ne suit pas un service',
  unknown_player: 'numéro de joueur absent de la fiche équipe',
};

/**
 * Relève les incohérences d'un codage, action par action, comme le fait la
 * fenêtre de correction de DataVolley.
 *
 * @param {Array} actions
 * @param {Object} [opts]
 * @param {Object} [opts.roster] - { home: [numéros], away: [numéros] }
 * @param {boolean} [opts.requireTimecode] - signale les actions non calées
 * @param {boolean} [opts.requireEvaluation] - signale les actions non notées
 * @returns {Array<{uid, action_index, code, issue, severity, label}>}
 */
export function codeIssues(actions, opts = {}) {
  const list = actions || [];
  const out = [];
  const push = (action, issue, severity = 'error') => {
    out.push({
      uid: action?.uid ?? null,
      action_index: action?.action_index ?? null,
      code: action?.code ?? '',
      issue,
      severity,
      label: CODE_ISSUE_LABELS[issue] || issue,
    });
  };

  const rosterNumbers = (team) => {
    const r = opts.roster?.[team];
    if (!r || !r.length) return null;
    return new Set(r.map((n) => Number(n)));
  };
  const known = { home: rosterNumbers('home'), away: rosterNumbers('away') };

  for (const a of list) {
    if (!a) continue;
    const check = validateAction(a.code);
    if (!check.valid) {
      push(a, 'invalid_code');
      continue;
    }
    if (a.evaluation && !evaluationAllowed(a.action, a.evaluation)) push(a, 'bad_evaluation');
    if (!a.evaluation && opts.requireEvaluation) push(a, 'no_evaluation', 'warning');
    if (opts.requireTimecode && a.timecode == null) push(a, 'no_timecode', 'warning');
    const set = known[a.team];
    if (set && a.player_number != null && !set.has(Number(a.player_number))) push(a, 'unknown_player', 'warning');
  }

  const rallies = groupActionsIntoRallies(list);
  rallies.forEach((rally, i) => {
    const acts = rally.actions || [];
    if (!acts.length) return;
    const first = acts[0];
    // Si le premier code est illisible, on ne peut rien conclure sur le point.
    if (validateAction(first.code).valid && first.action !== 'S') push(first, 'missing_serve');
    for (let k = 1; k < acts.length; k += 1) {
      if (acts[k].action === 'R' && acts[k - 1].action !== 'S') push(acts[k], 'reception_without_serve', 'warning');
    }
    const last = acts[acts.length - 1];
    const closed = isTerminalEvaluation(last.action, last.evaluation) || !!getPointWinner(rally);
    // Le dernier point en cours n'est pas une anomalie : il est simplement
    // encore ouvert pendant la saisie.
    const isLast = i === rallies.length - 1;
    if (!closed && !isLast) push(last, 'point_open');
  });

  return out;
}

/** Index rapide des anomalies par uid d'action. */
export function issuesByUid(issues) {
  const map = new Map();
  for (const it of issues || []) {
    if (!it?.uid) continue;
    if (!map.has(it.uid)) map.set(it.uid, []);
    map.get(it.uid).push(it);
  }
  return map;
}

/** Prochaine action à corriger après une position donnée (cyclique). */
export function nextIssue(issues, fromIndex = -1) {
  const list = (issues || []).slice().sort((a, b) => (a.action_index ?? 0) - (b.action_index ?? 0));
  if (!list.length) return null;
  return list.find((it) => (it.action_index ?? 0) > fromIndex) || list[0];
}


// ---------------------------------------------------------------------------
// 4. FENÊTRE DE COMMANDES (Échap) — ce qui n'est pas du jeu
// ---------------------------------------------------------------------------

export const COMMAND_HELP = [
  { code: 'T', desc: 'Temps mort de l’équipe à domicile' },
  { code: 'aT', desc: 'Temps mort de l’équipe extérieure' },
  { code: 'C5.12', desc: 'Remplacement domicile : n°5 sort, n°12 entre' },
  { code: 'aC5.12', desc: 'Remplacement extérieur : n°5 sort, n°12 entre' },
  { code: '>texte', desc: 'Code libre (remarque) ajouté au déroulé' },
];

/**
 * Analyse une commande saisie dans la fenêtre de commandes.
 * @param {string} text
 * @returns {{kind:'none'|'timeout'|'substitution'|'note'|'unknown', team?:string,
 *            out?:number, in?:number, text?:string, error?:string}}
 */
export function parseCommand(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { kind: 'none' };

  if (raw.startsWith('>')) {
    const body = raw.slice(1).trim();
    if (!body) return { kind: 'unknown', error: 'Précisez le texte du code libre (ex. >REDCARD).' };
    return { kind: 'note', text: body.slice(0, 5).toUpperCase(), team: 'home' };
  }

  const team = /^a/i.test(raw) && raw.length > 1 ? 'away' : 'home';
  const body = team === 'away' ? raw.slice(1).trim() : raw;

  // Temps mort : T / aT (les espaces et la casse sont tolérés).
  if (/^t$/i.test(body)) return { kind: 'timeout', team };

  // Remplacement : C + sortant + séparateur + entrant (C5.12, C5-12, C5 12).
  const sub = body.match(/^c\s*(\d{1,2})\s*[.\-/:]\s*(\d{1,2})$/i);
  if (sub) {
    const out = Number(sub[1]);
    const inn = Number(sub[2]);
    if (!out || !inn) return { kind: 'unknown', error: 'Numéros de joueur invalides (1 à 99).' };
    if (out === inn) return { kind: 'unknown', error: 'Le joueur entrant doit être différent du sortant.' };
    return { kind: 'substitution', team, out, in: inn };
  }

  return {
    kind: 'unknown',
    error: `Commande inconnue « ${raw} ». Attendu : T, aT, C5.12, aC5.12 ou >texte.`,
  };
}

/**
 * Traduit une commande en événement enregistrable (temps mort, remplacement ou
 * code libre) au point en cours.
 * @returns {Object|null} corps à envoyer à l'API, ou null si la commande est vide
 */
export function commandToEvent(command, ctx = {}) {
  if (!command || command.kind === 'none' || command.kind === 'unknown') return null;
  const base = {
    set_number: Number(ctx.setNumber) > 0 ? Number(ctx.setNumber) : 1,
    point_number: Math.max(0, Number(ctx.pointNumber) || 0),
    team: command.team === 'away' ? 'away' : 'home',
  };
  if (command.kind === 'timeout') return { ...base, kind: 'timeout' };
  if (command.kind === 'substitution') {
    return { ...base, kind: 'substitution', payload: { out: command.out, in: command.in } };
  }
  if (command.kind === 'note') return { ...base, kind: 'note', payload: { text: command.text } };
  return null;
}


// ---------------------------------------------------------------------------
// 5. LECTURE « SANS LES TEMPS MORTS » (mode Consultation)
// ---------------------------------------------------------------------------

/**
 * Index du point en cours de lecture à l'instant `t`, ou -1 si `t` tombe dans
 * un temps mort (entre deux points) : le lecteur saute alors au point suivant.
 */
export function pointIndexAt(segments, t) {
  const list = segments || [];
  if (!Number.isFinite(t)) return -1;
  for (let i = 0; i < list.length; i += 1) {
    const s = list[i];
    if (t >= s.segmentStart - 0.001 && t <= s.segmentEnd + 0.001) return i;
  }
  return -1;
}

/** Point suivant / précédent (dir = 1 ou -1) à partir d'un index (-1 = aucun). */
export function stepPoint(segments, index, dir = 1) {
  const list = segments || [];
  if (!list.length) return -1;
  const next = index < 0 ? (dir > 0 ? 0 : list.length - 1) : index + dir;
  return Math.max(0, Math.min(list.length - 1, next));
}

/** Temps morts entre les points : [{ start, end, duration }]. */
export function deadTimeGaps(segments, duration) {
  const list = segments || [];
  const gaps = [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const start = list[i].segmentEnd;
    const end = list[i + 1].segmentStart;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      gaps.push({ start, end, duration: end - start });
    }
  }
  if (Number.isFinite(duration) && duration > 0 && list.length) {
    const first = list[0].segmentStart;
    if (first > 0) gaps.unshift({ start: 0, end: first, duration: first });
  }
  return gaps;
}

/** Temps mort cumulé évité par la lecture enchaînée, en secondes. */
export function skippedTime(segments, duration) {
  return deadTimeGaps(segments, duration).reduce((sum, g) => sum + g.duration, 0);
}

/** Totaux affichés dans l'en-tête de la consultation. */
export function reviewTotals(segments, duration) {
  const list = segments || [];
  const played = list.reduce((sum, s) => sum + Math.max(0, s.segmentEnd - s.segmentStart), 0);
  return {
    points: list.length,
    played,
    skipped: skippedTime(list, duration),
    full: Number.isFinite(duration) ? duration : played,
  };
}

/** Vérifie qu'une liste de segments est exploitable pour la lecture. */
export function hasUsableSegments(segments) {
  return (segments || []).some((s) => s.segmentStart != null && s.segmentEnd != null);
}

/** Libellé court d'une action (« A » → « Att »). */
export function actionShortLabel(code) {
  const map = { S: 'Srv', R: 'Réc', A: 'Att', B: 'Ctr', D: 'Déf', E: 'Pas', F: 'Lib' };
  return map[code] || code || '—';
}


// ---------------------------------------------------------------------------
// 6. CORRECTION : TEMPS, INSERTION, DÉPLACEMENT
// ---------------------------------------------------------------------------

/** Nouvelle synchronisation calée sur le premier service (« Caler ici »). */
export function firstServeAnchor(actions, videoTime, sync = {}) {
  const serve = (actions || []).find((a) => a?.action === 'S');
  if (!serve) return { error: 'Aucun service codé : impossible de caler la vidéo.' };
  const anchorSystemTime = serve.system_time ?? Math.floor(Date.now() / 1000);
  const offset = Number(videoTime) - anchorSystemTime;
  return {
    sync: {
      ...sync,
      sync_offset: offset,
      anchor_action_id: serve.id ?? serve.action_index ?? null,
      anchor_timecode: Number(videoTime),
      anchor_system_time: anchorSystemTime,
    },
    action: serve,
    offset,
  };
}

/** Action ciblée par son uid (ou null). */
export function findAction(actions, uid) {
  return (actions || []).find((a) => a?.uid === uid) || null;
}

/** Décale le temps vidéo d'une action de `delta` secondes (jamais négatif). */
export function shiftTimecode(actions, uid, delta) {
  return (actions || []).map((a) =>
    a?.uid === uid && a.timecode != null
      ? { ...a, timecode: Math.max(0, Number(a.timecode) + Number(delta || 0)) }
      : a
  );
}

/** Fixe le temps vidéo d'une action (bouton « temps = position vidéo »). */
export function setActionTimecode(actions, uid, timecode) {
  const t = Math.max(0, Number(timecode) || 0);
  return (actions || []).map((a) => (a?.uid === uid ? { ...a, timecode: t } : a));
}

/** Supprime une action (le codage est réindexé). */
export function removeAction(actions, uid) {
  return reindexActions((actions || []).filter((a) => a?.uid !== uid));
}

/** Déplace une action d'un cran (dir = -1 vers le haut, 1 vers le bas). */
export function moveAction(actions, uid, dir = -1) {
  const list = [...(actions || [])];
  const i = list.findIndex((a) => a?.uid === uid);
  if (i === -1) return list;
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return list;
  const tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;
  return reindexActions(list);
}

/**
 * Insère une action à une position donnée (mode Correction : « compléter un
 * match »). Le code est validé avant insertion.
 * @returns {{actions:Array, action?:Object, error?:string}}
 */
export function insertCodeAt(actions, index, code, opts = {}) {
  const check = validateAction(code);
  if (!check.valid) return { actions: actions || [], error: check.labels };
  const list = [...(actions || [])];
  const at = Math.max(0, Math.min(list.length, Number(index)));
  const action = makeAction(code, opts.timecode ?? null, {
    set_number: opts.setNumber ?? null,
    ...decomposeCode(code),
  });
  list.splice(at, 0, action);
  return { actions: reindexActions(list), action };
}


// ---------------------------------------------------------------------------
// 7. ANALYSE : DESCENDRE D'UN CHIFFRE VERS LES ACTIONS
// ---------------------------------------------------------------------------

/** Filtres d'analyse proposés dans la barre commune (DataVolley : filtres + rotation). */
export const ANALYSIS_FILTERS = {
  team: 'all',
  set: 'all',
  player: '',
  action: 'all',
  evaluation: 'all',
  zone: 'all',
  situation: 'all',
  rotation: 'all',
};

/**
 * Actions correspondant à une cellule d'analyse (« Click to Rally »).
 *
 * @param {Array} actions
 * @param {Object} spec - critères de la cellule (team, player, action,
 *        evaluation, zone, set, combo, type, query, situation, rotation,
 *        pointNumbers)
 * @param {Object} [opts]
 * @param {Function} [opts.setOf] - (action) => set
 * @param {Function} [opts.situationOf] - (action) => '+' | 0 | '-'
 * @param {Function} [opts.rotationOf] - (action) => 1..6
 * @param {Function} [opts.pointOf] - (action) => numéro de point
 * @param {Function} [opts.comboOf]
 * @param {Function} [opts.typeOf]
 * @returns {Array}
 */
export function drillDown(actions, spec = {}, opts = {}) {
  const list = searchCodes(
    actions,
    {
      team: spec.team ?? 'all',
      player: spec.player ?? '',
      action: spec.action ?? 'all',
      evaluation: spec.evaluation ?? 'all',
      set: spec.set ?? 'all',
      zone: spec.zone ?? 'all',
      combo: spec.combo ?? 'all',
      type: spec.type ?? 'all',
      query: spec.query ?? '',
    },
    opts
  );

  return list.filter((a) => {
    if (spec.situation != null && spec.situation !== 'all') {
      const s = opts.situationOf ? opts.situationOf(a) : a.situation;
      if (String(s ?? '') !== String(spec.situation)) return false;
    }
    if (spec.rotation != null && spec.rotation !== 'all') {
      const r = opts.rotationOf ? opts.rotationOf(a) : a.rotation;
      if (Number(r) !== Number(spec.rotation)) return false;
    }
    if (Array.isArray(spec.pointNumbers) && spec.pointNumbers.length) {
      const p = opts.pointOf ? opts.pointOf(a) : a.point_number;
      if (!spec.pointNumbers.includes(Number(p))) return false;
    }
    return true;
  });
}

/** Regroupe des actions par point (liste issue d'un chiffre d'analyse). */
export function groupByPoint(actions, opts = {}) {
  const pointOf = opts.pointOf || ((a) => a?.point_number ?? null);
  const map = new Map();
  for (const a of actions || []) {
    const p = pointOf(a);
    if (p == null) continue;
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(a);
  }
  return [...map.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([pointNumber, list]) => ({ pointNumber, actions: list }));
}

// ---------------------------------------------------------------------------
// 8. DIVERS
// ---------------------------------------------------------------------------

/** Évaluations proposées par les touches F1 à F6, dans l'ordre de DataVolley. */
export const FUNCTION_EVALUATIONS = [
  { key: 'F1', sym: '=' },
  { key: 'F2', sym: '/' },
  { key: 'F3', sym: '-' },
  { key: 'F4', sym: '!' },
  { key: 'F5', sym: '+' },
  { key: 'F6', sym: '#' },
];

export { buildPointSegments };

