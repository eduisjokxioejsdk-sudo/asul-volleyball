// Outils de diff, fusion optimiste (409) et préremplissage pour « Stats Fast Direct » (Volley Stats).

function indexById(list = []) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    if (item && item.id != null) {
      map.set(String(item.id), item);
    }
  });
  return map;
}

function stableJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

function diffActionList(prevList = [], nextList = []) {
  const prevMap = indexById(prevList);
  const nextMap = indexById(nextList);
  const added = [];
  const updated = [];
  const deleted = [];

  nextMap.forEach((item, id) => {
    const prev = prevMap.get(id);
    if (!prev) added.push(id);
    else if (stableJson(prev) !== stableJson(item)) updated.push(id);
  });

  prevMap.forEach((_, id) => {
    if (!nextMap.has(id)) deleted.push(id);
  });

  return { added, updated, deleted };
}

/** Calcule le delta entre deux snapshots Volley Stats (prevState -> nextState). */
export function computeVolleyStatsDelta(prevState, nextState) {
  const prev = prevState && typeof prevState === 'object' ? prevState : {};
  const next = nextState && typeof nextState === 'object' ? nextState : {};

  const actDiff = diffActionList(prev.actions, next.actions);
  const oactDiff = diffActionList(prev.oact, next.oact);

  return {
    addedActionIds: actDiff.added,
    updatedActionIds: actDiff.updated,
    deletedActionIds: actDiff.deleted,
    addedOactIds: oactDiff.added,
    updatedOactIds: oactDiff.updated,
    deletedOactIds: oactDiff.deleted,
    matchChanged: stableJson(prev.match) !== stableJson(next.match),
    playersChanged: stableJson(prev.players) !== stableJson(next.players),
    oppChanged: stableJson(prev.opp) !== stableJson(next.opp),
  };
}

function mergeActionArrays(remoteList = [], localList = [], addedIds = [], updatedIds = [], deletedIds = []) {
  const deletedSet = new Set((deletedIds || []).map(String));
  const localTouchSet = new Set([
    ...(addedIds || []).map(String),
    ...(updatedIds || []).map(String),
  ]);
  const map = new Map();

  (Array.isArray(remoteList) ? remoteList : []).forEach((item) => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    if (!deletedSet.has(id)) map.set(id, item);
  });

  (Array.isArray(localList) ? localList : []).forEach((item) => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    if (deletedSet.has(id)) return;
    if (!map.has(id) || localTouchSet.has(id)) {
      map.set(id, item);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const ta = String(a?.ts || '');
    const tb = String(b?.ts || '');
    if (ta && tb && ta !== tb) return ta.localeCompare(tb);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function mergeScoresFromConcurrentActions(remoteMatch, localMatch, remoteActions, remoteOact, localActions, localOact, delta) {
  const remoteScores = Array.isArray(remoteMatch?.scores) && remoteMatch.scores.length
    ? remoteMatch.scores.map((s) => ({ ...s, u: Number(s?.u) || 0, o: Number(s?.o) || 0 }))
    : [{ u: 0, o: 0 }];
  const localScores = Array.isArray(localMatch?.scores) && localMatch.scores.length
    ? localMatch.scores
    : [{ u: 0, o: 0 }];

  const setCount = Math.max(remoteScores.length, localScores.length);
  const scores = Array.from({ length: setCount }, (_, idx) => ({
    ...(remoteScores[idx] || { u: 0, o: 0 }),
    ...(localScores[idx]?.end && !remoteScores[idx]?.end ? { end: localScores[idx].end } : {}),
  }));

  const remoteById = new Map([
    ...indexById(remoteActions),
    ...indexById(remoteOact),
  ]);
  const localById = new Map([
    ...indexById(localActions),
    ...indexById(localOact),
  ]);

  let appliedActionScoreDelta = false;

  const addedAll = [...(delta.addedActionIds || []), ...(delta.addedOactIds || [])];
  addedAll.forEach((id) => {
    const key = String(id);
    if (remoteById.has(key)) return;
    const act = localById.get(key);
    if (act?.sc && (act.sc === 'u' || act.sc === 'o')) {
      const idx = Math.max(0, (Number(act.set) || 1) - 1);
      while (scores.length <= idx) scores.push({ u: 0, o: 0 });
      scores[idx][act.sc] = Math.max(0, (Number(scores[idx][act.sc]) || 0) + 1);
      appliedActionScoreDelta = true;
    }
  });

  const deletedAll = [...(delta.deletedActionIds || []), ...(delta.deletedOactIds || [])];
  deletedAll.forEach((id) => {
    const act = remoteById.get(String(id));
    if (act?.sc && (act.sc === 'u' || act.sc === 'o')) {
      const idx = Math.max(0, (Number(act.set) || 1) - 1);
      if (scores[idx]) {
        scores[idx][act.sc] = Math.max(0, (Number(scores[idx][act.sc]) || 0) - 1);
        appliedActionScoreDelta = true;
      }
    }
  });

  if (delta.matchChanged && !appliedActionScoreDelta) {
    return localScores.map((s) => ({ ...s, u: Number(s?.u) || 0, o: Number(s?.o) || 0 }));
  }

  return scores;
}

/**
 * Fusionne l'état distant et l'état local Volley Stats lors d'un conflit 409.
 * Si `forceReplace` est vrai (ex. remise à zéro, import JSON, archivage), l'état local gagne.
 */
export function mergeVolleyStatsStates(remote, local, delta = {}, forceReplace = false) {
  const localState = local && typeof local === 'object' ? local : {};
  if (forceReplace) return localState;

  const remoteState = remote && typeof remote === 'object' ? remote : {};
  const mergedActions = mergeActionArrays(
    remoteState.actions,
    localState.actions,
    delta.addedActionIds,
    delta.updatedActionIds,
    delta.deletedActionIds
  );
  const mergedOact = mergeActionArrays(
    remoteState.oact,
    localState.oact,
    delta.addedOactIds,
    delta.updatedOactIds,
    delta.deletedOactIds
  );

  const baseMatch =
    delta.matchChanged && localState.match
      ? { ...(remoteState.match || {}), ...localState.match }
      : { ...(localState.match || {}), ...(remoteState.match || {}) };

  const scores = mergeScoresFromConcurrentActions(
    remoteState.match,
    localState.match,
    remoteState.actions,
    remoteState.oact,
    localState.actions,
    localState.oact,
    delta
  );

  const archiveMap = new Map();
  (Array.isArray(remoteState.archive) ? remoteState.archive : []).forEach((item) => {
    const id = item?.match?.id;
    if (id) archiveMap.set(String(id), item);
  });
  (Array.isArray(localState.archive) ? localState.archive : []).forEach((item) => {
    const id = item?.match?.id;
    if (id) archiveMap.set(String(id), item);
  });

  const out = {
    v: Number(localState.v || remoteState.v) || 2,
    players:
      delta.playersChanged || !Array.isArray(remoteState.players) || !remoteState.players.length
        ? (localState.players || remoteState.players || [])
        : remoteState.players,
    match: {
      ...baseMatch,
      scores,
    },
    actions: mergedActions,
    archive: Array.from(archiveMap.values()),
    opp:
      delta.oppChanged || !Array.isArray(remoteState.opp) || !remoteState.opp.length
        ? (localState.opp || remoteState.opp || [])
        : remoteState.opp,
    oact: mergedOact,
  };

  const logo = localState.logo || remoteState.logo;
  if (logo) out.logo = logo;
  if (localState.rows !== undefined || remoteState.rows !== undefined) {
    out.rows = localState.rows ?? remoteState.rows;
  }

  return out;
}

function splitPlayerName(fullName) {
  const clean = String(fullName || '').trim();
  if (!clean) return { first: 'Joueur', name: '' };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], name: '' };
  return { first: parts[0], name: parts.slice(1).join(' ') };
}

function mapTeamRoster(team, prefix = 'p') {
  const roster = Array.isArray(team?.players) ? team.players : [];
  if (!roster.length) return null;
  return roster.map((player, index) => {
    const { first, name } = splitPlayerName(player?.name);
    const numVal = player?.number !== undefined && player?.number !== null ? player.number : index + 1;
    return {
      id: `${prefix}_${player?.id ?? numVal}_${index}`,
      num: Number.isFinite(Number(numVal)) && String(numVal).trim() !== '' ? Number(numVal) : String(numVal),
      first,
      name,
      starter: index < 6,
    };
  });
}

/** Construit les noms d'équipes et effectifs initiaux pour préremplir Volley Stats. */
export function buildInitialVolleyStatsSeed(session, homeTeam = null, awayTeam = null) {
  return {
    us: String(session?.team1_name || homeTeam?.name || 'Notre équipe').trim() || 'Notre équipe',
    opp: String(session?.team2_name || awayTeam?.name || 'Adversaire').trim() || 'Adversaire',
    players: mapTeamRoster(homeTeam, 'us'),
    oppPlayers: mapTeamRoster(awayTeam, 'opp'),
  };
}
