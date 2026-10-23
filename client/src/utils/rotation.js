// ============================================================================
// Moteur de rotation + score + libéro + sanctions / points arbitre.
// À partir des rallyes codés (1re action = service, action terminale = point)
// et des six de départ par set, on rejoue le match pour connaître à tout
// instant : le score, l'équipe au service, les six des deux équipes (P1..P6)
// et la position du passeur.
//
// Postes (repère officiel, vu depuis son propre camp, filet en haut) :
//        filet
//   P4    P3    P2      (avant)
//   P5    P6    P1      (arrière)   P1 = arrière droit = serveur
//
// Rotation à la récupération du service (side-out), sens horaire :
//   P1←P2  P2←P3  P3←P4  P4←P5  P5←P6  P6←P1
// ============================================================================

import { getPointWinner, rallyServerTeam } from './datavolley.js';

export const COURT_POSITIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
export const FRONT_ROW = ['P2', 'P3', 'P4'];
export const BACK_ROW = ['P5', 'P6', 'P1'];

/** Description des postes (repère du joueur, filet en haut). */
export const POSITION_LABELS = {
  P1: 'Arrière droit (service)',
  P2: 'Avant droit',
  P3: 'Avant centre',
  P4: 'Avant gauche',
  P5: 'Arrière gauche',
  P6: 'Arrière centre',
};

export const POSITION_ROLE = {
  P1: 'back-right',
  P2: 'front-right',
  P3: 'front-center',
  P4: 'front-left',
  P5: 'back-left',
  P6: 'back-center',
};

export function emptyLineup() {
  return { P1: null, P2: null, P3: null, P4: null, P5: null, P6: null };
}

/** Normalise un six quelconque en objet { P1..P6 } (nombres ou null). */
export function normalizeLineup(value) {
  const out = emptyLineup();
  if (!value) return out;
  if (typeof value === 'object' && value.start) return normalizeLineup(value.start);
  if (typeof value === 'string') {
    const parts = value.split(/[^0-9]+/).filter(Boolean);
    COURT_POSITIONS.forEach((p, i) => {
      out[p] = parts[i] ? parseInt(parts[i], 10) : null;
    });
    return out;
  }
  for (const p of COURT_POSITIONS) {
    const v = value[p];
    out[p] = v === '' || v == null ? null : Number(v);
  }
  return out;
}

export function lineupComplete(lineup) {
  const l = normalizeLineup(lineup);
  return COURT_POSITIONS.every((p) => Number.isInteger(l[p]) && l[p] > 0);
}

export function lineupNumbers(lineup) {
  const l = normalizeLineup(lineup);
  return COURT_POSITIONS.map((p) => l[p]).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Rotation horaire du six quand une équipe récupère le service (side-out) :
 * P1 ← P2, P2 ← P3, P3 ← P4, P4 ← P5, P5 ← P6, P6 ← P1.
 */
export function rotateLineup(lineup) {
  const l = normalizeLineup(lineup);
  return {
    P1: l.P2 ?? null,
    P2: l.P3 ?? null,
    P3: l.P4 ?? null,
    P4: l.P5 ?? null,
    P5: l.P6 ?? null,
    P6: l.P1 ?? null,
  };
}

/**
 * Rotation de la position du passeur lors d'un side-out :
 * P1 → P6, P2 → P1, P3 → P2, P4 → P3, P5 → P4, P6 → P5.
 * dir = 1 (rotation horaire du six), dir = -1 (inverse).
 */
export function rotateSetterPos(pos, dir = 1) {
  if (!pos) return null;
  const i = COURT_POSITIONS.indexOf(pos);
  if (i === -1) return null;
  const steps = ((dir % 6) + 6) % 6;
  return COURT_POSITIONS[(i - steps + 6) % 6];
}

/**
 * Substitution manuelle : le joueur `outNumber` sort, `inNumber` prend sa place
 * (même poste). Si le sortant n'est pas sur le terrain, le six est inchangé.
 */
export function substitute(lineup, outNumber, inNumber) {
  const l = normalizeLineup(lineup);
  const out = Number(outNumber);
  const inn = Number(inNumber);
  const next = { ...l };
  for (const p of COURT_POSITIONS) {
    if (l[p] === out) next[p] = inn;
  }
  return next;
}

/** Poste occupé par un joueur dans un six, ou null. */
export function positionOfPlayer(lineup, playerNumber) {
  const l = normalizeLineup(lineup);
  const n = Number(playerNumber);
  return COURT_POSITIONS.find((p) => l[p] === n) || null;
}

/** Six ordonné en plaçant le passeur au poste demandé. */
export function lineupFromSetterPosition(setterNumber, setterPos, roster = []) {
  const pos = COURT_POSITIONS.indexOf(setterPos);
  if (pos === -1) return emptyLineup();
  const setter = Number(setterNumber);
  const numbers = roster
    .map((r) => Number(r.number ?? r))
    .filter((n) => Number.isInteger(n) && n > 0 && n !== setter);
  const ordered = [setter, ...numbers].slice(0, 6);
  const out = emptyLineup();
  ordered.forEach((n, i) => {
    out[COURT_POSITIONS[(pos + i) % 6]] = n;
  });
  return out;
}

export function isSetOver(score, setNumber) {
  const target = setNumber >= 5 ? 15 : 25;
  return (
    (score.team1 >= target && score.team1 - score.team2 >= 2) ||
    (score.team2 >= target && score.team2 - score.team1 >= 2)
  );
}

function setupFor(setups, n) {
  return setups?.[String(n)] || {};
}

/** (Ré)initialise l'état d'un set à partir de la configuration enregistrée. */
function initSet(state, setNumber, setups) {
  const st = setupFor(setups, setNumber);
  state.server = st.first_server === 'team2' ? 'team2' : 'team1';
  state.homeLineup = normalizeLineup(st.home_lineup);
  state.awayLineup = normalizeLineup(st.away_lineup);
  state.homePos = st.home_setter_pos || null;
  state.awayPos = st.away_setter_pos || null;
}

/**
 * Remplacements indexés par « set:points joués » : `point_number` est le nombre
 * de points déjà joués dans le set au moment du remplacement (0 = avant le
 * premier point du set).
 */
function groupSubstitutions(events) {
  const map = new Map();
  for (const ev of events || []) {
    if (!ev || ev.kind !== 'substitution') continue;
    const out = Number(ev.payload?.out);
    const inn = Number(ev.payload?.in);
    if (!Number.isInteger(out) || out <= 0 || !Number.isInteger(inn) || inn <= 0) continue;
    if (out === inn) continue;
    const setNumber = Number(ev.set_number) > 0 ? Number(ev.set_number) : 1;
    const position = Math.max(0, Number(ev.point_number) || 0);
    const key = `${setNumber}:${position}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ team: ev.team === 'away' ? 'away' : 'home', out, in: inn, pointNumber: position });
  }
  return map;
}

/**
 * Événements qui attribuent un point hors rallye (carton rouge CR, retard DR,
 * point d'arbitre *P/aP).
 * Pour une sanction/retard rouge sur `team`, le point va à l'équipe ADVERSE.
 * Pour un `point_adjust` sur `team`, le point va à `team`.
 */
function groupPenaltyAndAdjustEvents(events) {
  const map = new Map();
  for (const ev of events || []) {
    if (!ev) continue;
    let awardTo = null;
    if ((ev.kind === 'sanction' || ev.kind === 'delay') && ev.payload?.card === 'R') {
      // Sanction rouge contre home → point pour team2 (away), et inversement
      awardTo = ev.team === 'away' ? 'team1' : 'team2';
    } else if (ev.kind === 'point_adjust') {
      awardTo = ev.team === 'away' ? 'team2' : 'team1';
    }
    if (!awardTo) continue;
    const setNumber = Number(ev.set_number) > 0 ? Number(ev.set_number) : 1;
    const position = Math.max(0, Number(ev.point_number) || 0);
    const key = `${setNumber}:${position}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ awardTo, kind: ev.kind, event: ev });
  }
  return map;
}

/**
 * Rejoue le match complet.
 * @param {Array} rallies - rallyes ordonnés (groupActionsIntoRallies)
 * @param {Object} setups - { [set]: { first_server, home_setter_pos,
 *                          away_setter_pos, home_lineup, away_lineup } }
 * @param {Object} [opts]
 * @param {Object} [opts.homeTeam] - { libero, liberoFor } fiche équipe domicile
 * @param {Object} [opts.awayTeam] - idem extérieur
 * @param {Array} [events] - événements de match ({ kind, set_number, point_number,
 *                          team, payload }) : remplacements, cartons rouges, points arbitre.
 * @returns {Object} état du match + instantané par point
 */
export function computeMatchState(rallies, setups = {}, opts = {}, events = []) {
  const list = rallies || [];
  const state = {
    currentSet: 1,
    score: { team1: 0, team2: 0 },
    server: 'team1',
    homeLineup: emptyLineup(),
    awayLineup: emptyLineup(),
    homePos: null,
    awayPos: null,
  };

  const sets = [];
  const setsWon = { team1: 0, team2: 0 };
  const states = [];
  const warnings = [];
  let matchOver = false;
  let matchWinner = null;

  const substitutions = groupSubstitutions(events);
  const pointEvents = groupPenaltyAndAdjustEvents(events);

  /**
   * Applique les remplacements enregistrés après `position` points joués dans le
   * set : ils prennent effet pour l'échange suivant. Un remplacement dont le
   * joueur sortant n'est pas sur le terrain est signalé et ignoré.
   */
  const applySubstitutions = (setNumber, position) => {
    const pending = substitutions.get(`${setNumber}:${position}`);
    if (!pending) return;
    for (const sub of pending) {
      const key = sub.team === 'away' ? 'awayLineup' : 'homeLineup';
      if (!positionOfPlayer(state[key], sub.out)) {
        warnings.push({
          type: 'substitution_absent',
          setNumber,
          pointNumber: sub.pointNumber,
          team: sub.team,
          out: sub.out,
          in: sub.in,
        });
        continue;
      }
      state[key] = substitute(state[key], sub.out, sub.in);
    }
  };

  /**
   * Applique les points de pénalité (carton rouge CR, retard DR) ou d'ajustement
   * arbitral (*P / aP) enregistrés à ce moment du set.
   */
  const applyPointEvents = (setNumber, position) => {
    const pending = pointEvents.get(`${setNumber}:${position}`);
    if (!pending) return;
    for (const pe of pending) {
      const winner = pe.awardTo;
      const prevServer = state.server;
      if (winner === 'team1') state.score.team1 += 1;
      else state.score.team2 += 1;

      if (winner !== prevServer) {
        if (winner === 'team1') {
          state.homeLineup = rotateLineup(state.homeLineup);
          state.homePos = rotateSetterPos(state.homePos);
        } else {
          state.awayLineup = rotateLineup(state.awayLineup);
          state.awayPos = rotateSetterPos(state.awayPos);
        }
      }
      state.server = winner;
    }
  };

  initSet(state, 1, setups);
  applySubstitutions(1, 0);
  applyPointEvents(1, 0);

  let setPointsPlayed = 0;

  for (const rally of list) {
    const snapshot = {
      pointNumber: rally.pointNumber,
      index: rally.index,
      setNumber: state.currentSet,
      server: state.server,
      scoreBefore: { ...state.score },
      homeLineup: { ...state.homeLineup },
      awayLineup: { ...state.awayLineup },
      homeSetterPos: state.homePos,
      awaySetterPos: state.awayPos,
      winner: null,
      scoreAfter: null,
    };
    states.push(snapshot);

    const winner = getPointWinner(rally);
    if (!winner) continue;

    const serverOfRally = rallyServerTeam(rally);
    if (serverOfRally && serverOfRally !== state.server) {
      warnings.push({
        pointNumber: rally.pointNumber,
        type: 'wrong_server',
        expected: state.server,
        actual: serverOfRally,
      });
    }

    if (winner === 'team1') state.score.team1 += 1;
    else state.score.team2 += 1;

    setPointsPlayed += 1;
    snapshot.winner = winner;
    snapshot.scoreAfter = { ...state.score };

    if (isSetOver(state.score, state.currentSet)) {
      sets.push({ setNumber: state.currentSet, team1: state.score.team1, team2: state.score.team2, winner });
      setsWon[winner] += 1;
      if (setsWon.team1 >= 3 || setsWon.team2 >= 3) {
        matchOver = true;
        matchWinner = winner;
        state.server = winner;
        break;
      }
      state.currentSet += 1;
      state.score = { team1: 0, team2: 0 };
      setPointsPlayed = 0;
      initSet(state, state.currentSet, setups);
      applySubstitutions(state.currentSet, 0);
      applyPointEvents(state.currentSet, 0);
      continue;
    }

    // Side-out : l'équipe qui gagne en réception tourne.
    if (serverOfRally && winner !== serverOfRally) {
      if (winner === 'team1') {
        state.homeLineup = rotateLineup(state.homeLineup);
        state.homePos = rotateSetterPos(state.homePos);
      } else {
        state.awayLineup = rotateLineup(state.awayLineup);
        state.awayPos = rotateSetterPos(state.awayPos);
      }
    }
    state.server = winner;

    // Remplacement et pénalités enregistrés après ce point :
    const totalScorePts = state.score.team1 + state.score.team2;
    applySubstitutions(state.currentSet, totalScorePts);
    applyPointEvents(state.currentSet, totalScorePts);
    if (rally.pointNumber != null && rally.pointNumber !== totalScorePts) {
      applyPointEvents(state.currentSet, rally.pointNumber);
    }
  }

  // Point en cours (dernier rallye non terminé) : on affiche son serveur réel.
  const last = list[list.length - 1];
  if (last && !getPointWinner(last)) {
    const srv = rallyServerTeam(last);
    if (srv) state.server = srv;
  }

  // Applique les pénalités et ajustements de points enregistrés après les échanges joués
  for (const [key] of pointEvents.entries()) {
    const [sNumStr, posStr] = key.split(':');
    const sNum = Number(sNumStr);
    const pos = Number(posStr);
    if (sNum === state.currentSet && pos > setPointsPlayed) {
      applyPointEvents(sNum, pos);
    }
  }

  return {
    currentSet: state.currentSet,
    score: state.score,
    sets,
    setsWon,
    matchOver,
    matchWinner,
    server: state.server,
    homeSetterPos: state.homePos,
    awaySetterPos: state.awayPos,
    homeLineup: state.homeLineup,
    awayLineup: state.awayLineup,
    states,
    warnings,
    homeTeam: opts.homeTeam || null,
    awayTeam: opts.awayTeam || null,
  };
}

/**
 * Instantané du match avant un point donné (1-based) : sert à afficher le
 * terrain tel qu'il était au moment du point.
 */
export function stateBeforePoint(matchState, pointNumber) {
  const list = matchState?.states || [];
  return list.find((s) => s.pointNumber === pointNumber) || list[list.length - 1] || null;
}

/**
 * Position du passeur de chaque équipe au début de chaque rallye.
 * (Compatibilité avec l'analyse de distribution.)
 * @returns {Array<{setNumber, homeSetterPos, awaySetterPos, homeLineup, awayLineup}>}
 */
export function computePerRallySetterPositions(rallies, setups = {}) {
  const ms = computeMatchState(rallies, setups);
  return ms.states.map((s) => ({
    setNumber: s.setNumber,
    homeSetterPos: s.homeSetterPos,
    awaySetterPos: s.awaySetterPos,
    homeLineup: s.homeLineup,
    awayLineup: s.awayLineup,
  }));
}
