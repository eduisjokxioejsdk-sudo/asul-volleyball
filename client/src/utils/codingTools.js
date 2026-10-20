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
  formatCode,
  getPointWinner,
  groupActionsIntoRallies,
  isTerminalEvaluation,
  makeAction,
  reindexActions,
  validateAction,
} from './datavolley.js';
import { COURT_POSITIONS, POSITION_LABELS, computeMatchState } from './rotation.js';
import { receptionToSituation } from './distribution.js';

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

/**
 * Rotation (1 à 6) de l'équipe qui joue CHAQUE action du match.
 *
 * C'est le filtre « Rotation » de la Consultation et de l'Analyse : la rotation
 * affichée par DataVolley est celle de l'équipe qui exécute l'action, au moment
 * du point (et non la rotation courante du match).
 *
 * @param {Array} rallies - rallyes (groupActionsIntoRallies)
 * @param {Object} matchState - état rejoué (computeMatchState)
 * @returns {Map<string|number, number|null>} clé d'action (uid) → rotation 1-6
 */
export function rotationByAction(rallies, matchState) {
  const map = new Map();
  const states = matchState?.states || [];
  for (const rally of rallies || []) {
    const snapshot = states.find((s) => Number(s.pointNumber) === Number(rally.pointNumber));
    if (!snapshot) continue;
    const homeRotation = rotationNumber(snapshot.homeSetterPos);
    const awayRotation = rotationNumber(snapshot.awaySetterPos);
    for (const a of rally.actions || []) {
      const key = a?.uid ?? a?.id ?? a?.action_index;
      if (key == null) continue;
      map.set(key, a.team === 'away' ? awayRotation : homeRotation);
    }
  }
  return map;
}

/**
 * Situation (+ / 0 / −) de chaque action, déduite de la réception :
 *   • la réception prend sa propre qualité (`#`/`+` → +, `!` → 0, `-` → −) ;
 *   • l'attaque qui suit une réception de la même équipe prend cette qualité
 *     (une attaque après une réception négative est donc classée « − »).
 *
 * @param {Array} actions
 * @returns {Map<string|number, '+'|0|'-'>} clé d'action (uid) → situation
 */
export function situationByAction(actions) {
  const map = new Map();
  const list = actions || [];
  for (const rally of groupActionsIntoRallies(list)) {
    const acts = rally.actions || [];
    for (let i = 0; i < acts.length; i += 1) {
      const a = acts[i];
      if (!a) continue;
      const key = a.uid ?? a.id ?? a.action_index;
      const prev = i > 0 ? acts[i - 1] : null;
      let situation = null;
      if (a.action === 'R') {
        situation = receptionToSituation(a.evaluation);
      } else if (a.action === 'A' && prev && prev.action === 'R' && prev.team === a.team) {
        situation = receptionToSituation(prev.evaluation);
      }
      if (situation != null && key != null) map.set(key, situation);
    }
  }
  return map;
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
  // Filtres DataVolley ajoutés en 3.1.0 : rotation (1-6) et situation (+ / 0 / −).
  rotation: 'all',
  situation: 'all',
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
 * @param {Function} [opts.rotationOf] - (action) => rotation 1-6 (rotationByAction)
 * @param {Function} [opts.situationOf] - (action) => '+' | 0 | '-'
 * @returns {Array}
 */
export function searchCodes(actions, filters = {}, opts = {}) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const setOf = opts.setOf || ((a) => a?.set_number ?? null);
  const comboOf = opts.comboOf || ((a) => a?.combo ?? null);
  const typeOf = opts.typeOf || ((a) => a?.type ?? null);
  const rotationOf = opts.rotationOf || (() => null);
  const situationOf = opts.situationOf || (() => null);

  const wantPlayer = f.player === '' || f.player == null ? null : Number(f.player);
  const wantZone = f.zone === 'all' || f.zone === '' ? null : String(f.zone);
  const wantRotation =
    f.rotation === 'all' || f.rotation === '' || f.rotation == null ? null : Number(f.rotation);
  const wantSituation =
    f.situation === 'all' || f.situation === '' || f.situation == null ? null : String(f.situation);

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
    if (wantRotation != null && Number(rotationOf(a)) !== wantRotation) return false;
    if (wantSituation != null && String(situationOf(a) ?? '') !== wantSituation) return false;
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
  // Contrôles enrichis de la 3.1.0 — toujours des AVERTISSEMENTS, jamais bloquants.
  player_not_in_six: 'joueur absent du six',
  wrong_server: 'service par une équipe qui n’avait pas le service',
  sub_without_out: 'remplacement sans sortant sur le terrain',
  attack_without_direction: 'attaque sans direction',
  serve_without_direction: 'service sans direction',
  point_not_closed: 'point non clos en fin de set',
  missing_set: 'set manquant',
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
 * @param {boolean} [opts.enriched] - active les sept contrôles enrichis (3.1.0)
 * @param {Object} [opts.matchState] - état rejoué (computeMatchState)
 * @param {Object} [opts.setups] - six de départ (si matchState absent)
 * @param {Array} [opts.events] - temps morts / remplacements enregistrés
 * @param {{home?:number,away?:number}} [opts.liberos] - numéros de libéro
 * @returns {Array<{uid, action_index, code, issue, severity, label}>}
 */
export function codeIssues(actions, opts = {}) {
  const list = actions || [];
  const out = [];
  const push = (action, issue, severity = 'error', extra = {}) => {
    out.push({
      uid: action?.uid ?? null,
      action_index: action?.action_index ?? null,
      code: action?.code ?? '',
      issue,
      severity,
      label: CODE_ISSUE_LABELS[issue] || issue,
      ...extra,
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
  const matchState =
    opts.matchState ||
    (opts.enriched ? computeMatchState(rallies, opts.setups || {}, {}, opts.events || []) : null);
  const states = matchState?.states || [];
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

  // -------------------------------------------------------------------------
  // Contrôles enrichis (3.1.0) — tous des avertissements.
  // -------------------------------------------------------------------------
  if (opts.enriched) {
    const events = opts.events || [];
    const hasAny = (lineup) => !!lineup && Object.values(lineup).some((v) => Number(v) > 0);
    const contains = (lineup, number) => !!lineup && Object.values(lineup).some((v) => Number(v) === Number(number));
    const snapshotAt = (pointNumber) =>
      states.find((s) => Number(s.pointNumber) === Number(pointNumber)) || null;
    const setOfRally = (rally) => {
      const snap = snapshotAt(rally.pointNumber);
      const first = (rally.actions || [])[0];
      return Number(first?.set_number ?? snap?.setNumber ?? 0) || null;
    };
    const firstActionOfPoint = (pointNumber) =>
      (rallies.find((r) => Number(r.pointNumber) === Number(pointNumber))?.actions || [])[0] || null;

    // 1. Joueur absent du six (désactivé si aucun six n'est enregistré).
    for (const rally of rallies) {
      const snap = snapshotAt(rally.pointNumber);
      if (!snap) continue;
      for (const a of rally.actions || []) {
        if (a?.player_number == null) continue;
        const team = a.team === 'away' ? 'away' : 'home';
        const lineup = team === 'away' ? snap.awayLineup : snap.homeLineup;
        if (!hasAny(lineup)) continue;
        if (Number(opts.liberos?.[team]) === Number(a.player_number)) continue;
        if (!contains(lineup, a.player_number)) push(a, 'player_not_in_six', 'warning');
      }
    }

    // 2. Serveur attendu : la rotation désigne l'équipe qui doit servir.
    for (const warning of matchState?.warnings || []) {
      if (warning?.type !== 'wrong_server') continue;
      const first = firstActionOfPoint(warning.pointNumber);
      if (first) push(first, 'wrong_server', 'warning', { detail: `attendu : ${warning.expected || '—'}` });
    }

    // 3. Remplacement sans sortant sur le terrain.
    for (const ev of events) {
      if (ev?.kind !== 'substitution') continue;
      const outNumber = Number(ev.payload?.out);
      if (!outNumber) continue;
      const target = Number(ev.point_number) || 0;
      const snap =
        states.find((s) => Number(s.pointNumber) === target + 1) ||
        [...states].reverse().find((s) => Number(s.pointNumber) <= target + 1) ||
        states[0];
      if (!snap) continue;
      const lineup = ev.team === 'away' ? snap.awayLineup : snap.homeLineup;
      if (!hasAny(lineup)) continue;
      if (!contains(lineup, outNumber)) {
        push(firstActionOfPoint(snap.pointNumber), 'sub_without_out', 'warning', { detail: `n°${outNumber}` });
      }
    }

    // 4 & 5. Directions : une attaque ou un service sans aucune zone.
    for (const a of list) {
      if (!a) continue;
      if (a.action === 'A' && !a.start_zone && !a.end_zone) push(a, 'attack_without_direction', 'warning');
      if (a.action === 'S' && !a.end_zone) push(a, 'serve_without_direction', 'warning');
    }

    // 6. Point non clos au moment où le set change.
    for (let i = 0; i < rallies.length - 1; i += 1) {
      const curSet = setOfRally(rallies[i]);
      const nextSet = setOfRally(rallies[i + 1]);
      if (curSet == null || nextSet == null || curSet === nextSet) continue;
      const acts = rallies[i].actions || [];
      const last = acts[acts.length - 1];
      const closed = last && (isTerminalEvaluation(last.action, last.evaluation) || !!getPointWinner(rallies[i]));
      if (!closed) push(last, 'point_not_closed', 'warning');
    }

    // 7. Set manquant (la numérotation saute un set).
    const setNumbers = [...new Set(rallies.map(setOfRally).filter((n) => n != null))].sort((a, b) => a - b);
    for (let i = 1; i < setNumbers.length; i += 1) {
      const prev = setNumbers[i - 1];
      const cur = setNumbers[i];
      if (cur <= prev + 1) continue;
      const rally = rallies.find((r) => setOfRally(r) === cur);
      const first = (rally?.actions || [])[0] || null;
      for (let missing = prev + 1; missing < cur; missing += 1) {
        push(first, 'missing_set', 'warning', { set: missing });
      }
    }
  }

  return out;
}

/** Compteurs d'anomalies par type (« invalid_code » → nombre). */
export function countIssuesByType(issues) {
  const counts = {};
  for (const it of issues || []) {
    if (!it?.issue) continue;
    counts[it.issue] = (counts[it.issue] || 0) + 1;
  }
  return counts;
}

/** Filtre les anomalies par gravité : 'all' | 'error' | 'warning'. */
export function filterIssues(issues, severity = 'all') {
  const list = issues || [];
  if (severity === 'all') return list;
  return list.filter((it) => it?.severity === severity);
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
// 6 bis. LISTE DES ACTIONS EN ACCORDÉON (3.1.0)
// ---------------------------------------------------------------------------

/** État initial de l'accordéon : aucun point ouvert, pas de « tout déplier ». */
export const ACCORDION_CLOSED = { open: null, all: false };

/** Un point est-il visible (déplié) ? */
export function isPointOpen(state, pointNumber) {
  const s = state || ACCORDION_CLOSED;
  if (s.all) return true;
  return s.open != null && Number(s.open) === Number(pointNumber);
}

/**
 * Point à ouvrir automatiquement selon le mode :
 *   • Consultation / Analyse → le point en cours de lecture ;
 *   • Correction            → le point de l'action sélectionnée ;
 *   • Saisie                → le dernier point codé.
 */
export function autoOpenPoint(mode, opts = {}) {
  if (mode === 'consultation' || mode === 'analyse') return opts.activePointNumber ?? null;
  if (mode === 'correction') return opts.selectedPointNumber ?? null;
  return opts.lastPointNumber ?? null;
}

/**
 * Logique PURE de l'accordéon : un seul point ouvert à la fois, sauf en mode
 * « tout déplier ». Ouvrir un point referme le précédent.
 *
 * @param {{open:number|null, all:boolean}} state
 * @param {{type:string, pointNumber?:number, follow?:boolean}} event
 *        type = 'toggle' | 'collapseAll' | 'expandAll' | 'auto'
 * @returns {{open:number|null, all:boolean}}
 */
export function accordionReduce(state, event = {}) {
  const s = { open: state?.open ?? null, all: !!state?.all };
  switch (event.type) {
    case 'toggle': {
      const n = Number(event.pointNumber);
      if (!Number.isFinite(n)) return s;
      // « Tout déplier » actif : le clic reprend la main et isole ce point.
      if (s.all) return { open: n, all: false };
      if (s.open != null && Number(s.open) === n) return { open: null, all: false };
      return { open: n, all: false };
    }
    case 'collapseAll':
      return { open: null, all: false };
    case 'expandAll':
      return { open: null, all: true };
    case 'auto': {
      if (event.follow === false) return s;
      if (s.all) return s; // « tout déplier » reste prioritaire
      const n = event.pointNumber == null ? null : Number(event.pointNumber);
      if (n == null || !Number.isFinite(n)) return s;
      if (s.open != null && Number(s.open) === n) return s;
      return { open: n, all: false };
    }
    default:
      return s;
  }
}

// ---------------------------------------------------------------------------
// 6 ter. DIRECTIONS D'ATTAQUE (3.1.0)
// ---------------------------------------------------------------------------

/** Direction d'une action : zones de départ et d'arrivée, et clé lisible. */
export function directionOf(action) {
  if (!action) return null;
  const start = String(action.start_zone || action.attack_zone || '');
  const end = String(action.end_zone || '');
  if (!start && !end) return null;
  return { start, end, key: `${start || '?'} → ${end || '?'}` };
}

/** Attaque sans aucune direction (ni départ, ni arrivée). */
export function attacksWithoutDirection(actions) {
  return (actions || []).filter((a) => a?.action === 'A' && !a.start_zone && !a.end_zone);
}

/**
 * Code réécrit avec les deux zones, sans changer de format : les directions
 * restent dans les champs start_zone / end_zone (les matchs déjà codés restent
 * valides et l'export .dvw écrit le code complet).
 */
export function codeWithDirection(action, startZone, endZone) {
  if (!action) return '';
  return formatCode({
    team: action.team,
    player_number: action.player_number,
    action: action.action,
    type: action.type,
    combo: action.combo,
    call: action.call,
    end_subzone: action.end_subzone,
    evaluation: action.evaluation,
    start_zone: String(startZone || ''),
    end_zone: String(endZone || ''),
  });
}

/** Applique une direction à une action (uid) : code + champs start/end zone. */
export function applyDirection(actions, uid, startZone, endZone) {
  return (actions || []).map((a) => {
    if (a?.uid !== uid) return a;
    const code = codeWithDirection(a, startZone, endZone);
    const fields = decomposeCode(code);
    return {
      ...a,
      ...fields,
      code,
      start_zone: fields.start_zone || '',
      end_zone: fields.end_zone || '',
    };
  });
}

/**
 * Agrégat des directions d'attaque : une ligne par couple départ → arrivée.
 * Exemple : les attaques codées « 4 → 5 » sont regroupées sous la clé
 * « 4 → 5 » (total, points, fautes, contrées, efficacité).
 */
export function attackDirectionRows(actions) {
  const map = new Map();
  for (const a of actions || []) {
    if (a?.action !== 'A') continue;
    const d = directionOf(a);
    if (!d) continue;
    const row = map.get(d.key) || { key: d.key, start: d.start, end: d.end, total: 0, points: 0, errors: 0, blocked: 0 };
    row.total += 1;
    if (a.evaluation === '#') row.points += 1;
    if (a.evaluation === '=') row.errors += 1;
    if (a.evaluation === '/') row.blocked += 1;
    map.set(d.key, row);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      efficiency: r.total ? Math.round(((r.points - r.errors - r.blocked) / r.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
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

