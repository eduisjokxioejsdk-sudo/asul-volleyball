// ============================================================================
// Analyse de la distribution des passeurs (Side-Out K1, Contre-attaque K2,
// Freeball, Zone de réception/passe, Appel passeur K1/K2/K7 et Défense du passeur).
// ============================================================================

import { computePerRallySetterPositions, positionOfPlayer } from './rotation.js';
import { groupActionsIntoRallies, decomposeCode, rallyServerTeam } from './datavolley.js';

// Zones d'attaque officielles DataVolley (grille 3 × 3, filet en haut).
//   4  3  2
//   7  8  9
//   5  6  1
export const ATTACK_ZONES = [
  { id: '4', label: '4', row: 'net' },
  { id: '3', label: '3', row: 'net' },
  { id: '2', label: '2', row: 'net' },
  { id: '7', label: '7', row: 'mid' },
  { id: '8', label: '8', row: 'mid' },
  { id: '9', label: '9', row: 'mid' },
  { id: '5', label: '5', row: 'back' },
  { id: '6', label: '6', row: 'back' },
  { id: '1', label: '1', row: 'back' },
];

export const DISTRIBUTION_PHASES = [
  { id: 'K1', label: 'Side-Out (Après Réception)' },
  { id: 'K2', label: 'Transition (Après Défense)' },
  { id: 'FREEBALL', label: 'Après Freeball (Ballon Libre)' },
  { id: 'ALL', label: 'Toutes les phases (K1 + K2 + Freeball)' },
];

export const PASS_ZONE_FILTERS = [
  { id: 'ALL', label: 'Toutes zones de 1er contact' },
  { id: 'Z2_3', label: 'Filet Z2 / Z3 (Passeur idéal)', zones: ['2', '3'] },
  { id: 'Z4', label: 'Filet gauche Z4', zones: ['4'] },
  { id: '3M', label: 'Ligne des 3m (Z7 / Z8 / Z9)', zones: ['7', '8', '9'] },
  { id: 'BACK', label: 'Fond de court (Z1 / Z5 / Z6)', zones: ['1', '5', '6'] },
];

export const DEFENDER_ROLE_FILTERS = [
  { id: 'ALL', label: 'Tous 1ers contacts' },
  { id: 'OTHER_DUG', label: 'Passeur disponible (1er ballon par autre joueur)' },
  { id: 'SETTER_DUG', label: 'Passeur a défendu (Passe de secours / Out-of-System)' },
];

/**
 * Alias historiques (appellations d'école) → zone officielle 1-9.
 */
export const ATTACK_ZONE_ALIASES = {
  '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  deca: '4',
  fixe_av: '3',
  '2nde': '2',
  fixe_arr: '6',
  pipe: '6',
  avant: '3',
  arriere: '6',
};

export function normalizeAttackZone(zone) {
  const z = String(zone ?? '').trim().toLowerCase();
  return ATTACK_ZONE_ALIASES[z] || null;
}

/** Zone d'attaque d'une action : zone du code, sinon champ historique. */
export function attackZoneOf(action) {
  if (!action) return null;
  return normalizeAttackZone(action.start_zone || action.attack_zone);
}

export const SITUATIONS = ['+', '0', '-'];

/**
 * Vrai si le score se situe en « Money-Time » (fin de set serrée / clutch) :
 * - Au moins 20 points en sets 1-4 (ou au moins 12 points au tie-break / 5e set).
 * - Écart de 2 points ou moins entre les deux équipes.
 */
export function isMoneyTime(score, setNumber = 1) {
  if (!score) return false;
  const target = Number(setNumber) >= 5 ? 12 : 20;
  const s1 = Number(score.team1) || 0;
  const s2 = Number(score.team2) || 0;
  const maxScore = Math.max(s1, s2);
  const gap = Math.abs(s1 - s2);
  return maxScore >= target && gap <= 2;
}

export function receptionToSituation(evaluation) {
  // '#' et '+' sont équivalents : 1er contact parfait/positif.
  if (evaluation === '#' || evaluation === '+' || evaluation === '++') return '+';
  if (evaluation === '!') return '0';
  if (evaluation === '-') return '-';
  return null; // '/' ou '=' → non applicable
}

// Attaques (A) d'un lot de nouvelles actions qui suivent une réception (R)
// de la même équipe, avec une situation applicable.
export function findNewAttackAfterReception(allActions, newKeys) {
  const keys = new Set(newKeys || []);
  const list = allActions || [];
  const hits = [];
  for (let i = 0; i < list.length; i++) {
    const cur = list[i];
    const key = cur.uid ?? cur.id;
    if (!keys.has(key)) continue;
    if (cur.action !== 'A') continue;
    const prev = list[i - 1];
    const prev2 = list[i - 2];
    const rec =
      prev && prev.action === 'R' && prev.team === cur.team
        ? prev
        : prev && prev.action === 'E' && prev.team === cur.team && prev2 && prev2.action === 'R' && prev2.team === cur.team
          ? prev2
          : null;
    if (rec && receptionToSituation(rec.evaluation)) {
      hits.push(cur);
    }
  }
  return hits;
}

/**
 * Extrait toutes les possessions offensives terminées par une attaque (A) dans un rallye.
 * Pour chaque attaque, identifie :
 *   - phase : 'K1' (après R), 'K2' (après D), 'FREEBALL' (après F)
 *   - situation : '+' | '0' | '-' (selon la qualité du 1er contact R/D/F, sinon '+' par défaut si non codé)
 *   - passZone : zone où arrive le 1er contact (ou d'où part la passe)
 *   - setterCall : code d'appel passeur sur l'action E (ex: 'K1', 'K2', 'K7', 'KE'…)
 *   - firstContactPlayer : n° du joueur ayant fait le 1er contact (R/D/F)
 *   - setPlayer : n° du joueur ayant fait la passe (E)
 */
export function extractRallyAttackPossessions(rallyActions, serverSide = null) {
  const acts = rallyActions || [];
  const possessions = [];
  let currentTeam = null;
  let contacts = [];

  const flushPossession = () => {
    if (!contacts.length) return;
    const attackAct = contacts.find((c) => c.action === 'A');
    if (!attackAct) {
      contacts = [];
      return;
    }
    const firstContact = contacts.find((c) => c.action === 'R' || c.action === 'D' || c.action === 'F') || null;
    const setAct = contacts.find((c) => c.action === 'E') || null;

    let phase = 'K2';
    if (firstContact) {
      if (firstContact.action === 'R') phase = 'K1';
      else if (firstContact.action === 'F') phase = 'FREEBALL';
      else phase = 'K2';
    } else if (serverSide && currentTeam && currentTeam !== serverSide && possessions.filter((p) => p.team === currentTeam).length === 0) {
      phase = 'K1';
    }

    const situation = firstContact
      ? receptionToSituation(firstContact.evaluation)
      : setAct
        ? receptionToSituation(setAct.evaluation) || '+'
        : '+';

    if (!situation) {
      contacts = [];
      return;
    }

    const passZone = String(
      (firstContact && (firstContact.end_zone || firstContact.start_zone)) ||
      (setAct && setAct.start_zone) ||
      ''
    );

    let setterCall = '';
    if (setAct) {
      setterCall = setAct.call || (setAct.code ? decomposeCode(setAct.code).call : '') || '';
    }

    possessions.push({
      team: currentTeam,
      action: attackAct,
      firstContact,
      setAction: setAct,
      phase,
      situation,
      passZone,
      setterCall: setterCall.toUpperCase(),
      firstContactPlayer: firstContact ? Number(firstContact.player_number) || 0 : 0,
      setPlayer: setAct ? Number(setAct.player_number) || 0 : 0,
    });
    contacts = [];
  };

  for (let i = 0; i < acts.length; i += 1) {
    const a = acts[i];
    if (!a || !a.team) continue;
    if (a.action === 'S') continue; // Le service précède la possession adverse
    if (a.action === 'B') continue; // Le contre ne interrompt pas la lecture ou est géré séparément
    if (currentTeam && a.team !== currentTeam) {
      flushPossession();
    }
    currentTeam = a.team;
    contacts.push(a);
    if (a.action === 'A') {
      flushPossession();
    }
  }
  flushPossession();
  return possessions;
}

// Toutes les paires R→A (ou R→E→A) pour compatibilité descendante.
export function findReceptionAttackPairs(actions) {
  const rallies = groupActionsIntoRallies(actions || []);
  const pairs = [];
  for (const r of rallies) {
    const srv = rallyServerTeam(r);
    const serverSide = srv === 'team1' ? 'home' : srv === 'team2' ? 'away' : null;
    for (const p of extractRallyAttackPossessions(r.actions, serverSide)) {
      if (p.phase === 'K1') pairs.push({ action: p.action, situation: p.situation });
    }
  }
  return pairs;
}

function emptyCell() {
  return { count: 0, pct: 0, points: 0, errors: 0, blocked: 0, eff: 0, combos: {} };
}

function emptySide() {
  const side = {};
  for (const sit of SITUATIONS) {
    side[sit] = {};
    for (const z of ATTACK_ZONES) side[sit][z.id] = emptyCell();
  }
  return side;
}

function addAttackToCell(side, situation, zone, attackAction) {
  if (!zone || !side[situation] || !side[situation][zone]) return;
  const cell = side[situation][zone];
  cell.count += 1;
  const ev = attackAction?.evaluation || '';
  if (ev === '#') cell.points += 1;
  if (ev === '=') cell.errors += 1;
  if (ev === '/') cell.blocked += 1;
  const combo = attackAction?.combo || (attackAction?.code ? decomposeCode(attackAction.code).combo : '');
  if (combo) {
    cell.combos[combo] = (cell.combos[combo] || 0) + 1;
  }
}

function finalizeSide(side) {
  for (const sit of SITUATIONS) {
    const total = ATTACK_ZONES.reduce((s, z) => s + side[sit][z.id].count, 0);
    for (const z of ATTACK_ZONES) {
      const cell = side[sit][z.id];
      cell.pct = total ? Math.round((cell.count / total) * 100) : 0;
      cell.eff = cell.count
        ? Math.round(((cell.points - cell.errors - cell.blocked) / cell.count) * 100)
        : 0;
      // Top combo de la cellule
      const topComboEntry = Object.entries(cell.combos || {}).sort((a, b) => b[1] - a[1])[0];
      cell.topCombo = topComboEntry ? topComboEntry[0] : null;
    }
  }
  return side;
}

// { home: { '+': { zone: {count,pct,eff,topCombo} } }, away: { ... } }
export function computeSetterDistribution(actions) {
  const result = { home: emptySide(), away: emptySide() };
  for (const { action, situation } of findReceptionAttackPairs(actions)) {
    const side = action.team === 'away' ? 'away' : 'home';
    const zone = attackZoneOf(action);
    addAttackToCell(result[side], situation, zone, action);
  }
  for (const side of ['home', 'away']) finalizeSide(result[side]);
  return result;
}

function emptyByPosition() {
  const byPos = { Total: emptySide() };
  for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) byPos[p] = emptySide();
  return byPos;
}

function matchesDistributionFilters(possession, filters = {}, setterNumber = 0) {
  const phaseFilter = filters.phase || 'K1';
  if (phaseFilter !== 'ALL' && possession.phase !== phaseFilter) return false;

  const passZoneFilter = filters.passZone || 'ALL';
  if (passZoneFilter !== 'ALL') {
    const zDef = PASS_ZONE_FILTERS.find((f) => f.id === passZoneFilter);
    if (zDef && zDef.zones && !zDef.zones.includes(String(possession.passZone || ''))) {
      return false;
    }
  }

  const callFilter = filters.setterCall || 'ALL';
  if (callFilter !== 'ALL') {
    if (possession.setterCall !== callFilter) return false;
  }

  const defRole = filters.defenderRole || 'ALL';
  if (defRole !== 'ALL') {
    const isSetterFirstContact =
      setterNumber > 0 && possession.firstContactPlayer > 0 && possession.firstContactPlayer === setterNumber;
    if (defRole === 'SETTER_DUG' && !isSetterFirstContact) return false;
    if (defRole === 'OTHER_DUG' && isSetterFirstContact) return false;
  }

  if (filters.moneyTime) {
    if (!isMoneyTime(possession.scoreBefore, possession.setNumber)) return false;
  }

  if (filters.receptionQuality && filters.receptionQuality !== 'ALL') {
    if (possession.situation !== filters.receptionQuality) return false;
  }

  return true;
}

/**
 * Répartition des attaques par position du passeur (P1..P6) avec filtres tactiques DataVolley 4 :
 *   - filters.phase : 'K1' (défaut, après réception) | 'K2' (après défense) | 'FREEBALL' | 'ALL'
 *   - filters.passZone : 'ALL' | 'Z2_3' | 'Z4' | '3M' | 'BACK'
 *   - filters.setterCall : 'ALL' | 'K1' | 'K2' | 'K7' | 'KE' | ...
 *   - filters.defenderRole : 'ALL' | 'SETTER_DUG' (passe de secours) | 'OTHER_DUG'
 */
export function computeSetterDistributionByRotation(
  actions,
  rallies,
  setups = {},
  setterNumbers = {},
  filters = {}
) {
  const list = rallies || groupActionsIntoRallies(actions || []);
  const perRally = computePerRallySetterPositions(list, setups);

  const result = {
    home: emptyByPosition(),
    away: emptyByPosition(),
    meta: {
      home: { setterDugCount: 0, totalPossessions: 0, byCall: {}, byPassZone: {}, byPhase: { K1: 0, K2: 0, FREEBALL: 0 } },
      away: { setterDugCount: 0, totalPossessions: 0, byCall: {}, byPassZone: {}, byPhase: { K1: 0, K2: 0, FREEBALL: 0 } },
    },
  };

  list.forEach((rally, idx) => {
    const state = perRally[idx];
    const srv = rallyServerTeam(rally);
    const serverSide = srv === 'team1' ? 'home' : srv === 'team2' ? 'away' : null;
    const possessions = extractRallyAttackPossessions(rally.actions, serverSide);
    for (const p of possessions) {
      p.scoreBefore = state?.scoreBefore || { team1: 0, team2: 0 };
      p.setNumber = state?.setNumber || 1;
    }

    for (const side of ['home', 'away']) {
      const setterNumber = Number(side === 'home' ? setterNumbers.home : setterNumbers.away) || 0;
      let pos = state ? (side === 'home' ? state.homeSetterPos : state.awaySetterPos) : null;
      if (!pos && state) {
        const lineup = side === 'home' ? state.homeLineup : state.awayLineup;
        if (setterNumber > 0) {
          pos = positionOfPlayer(lineup, setterNumber);
        }
      }

      const sidePossessions = possessions.filter((p) => p.team === side);
      for (const poss of sidePossessions) {
        result.meta[side].totalPossessions += 1;
        if (result.meta[side].byPhase[poss.phase] != null) {
          result.meta[side].byPhase[poss.phase] += 1;
        }
        if (poss.passZone) {
          result.meta[side].byPassZone[poss.passZone] = (result.meta[side].byPassZone[poss.passZone] || 0) + 1;
        }
        if (poss.setterCall) {
          result.meta[side].byCall[poss.setterCall] = (result.meta[side].byCall[poss.setterCall] || 0) + 1;
        }
        if (setterNumber > 0 && poss.firstContactPlayer === setterNumber) {
          result.meta[side].setterDugCount += 1;
        }

        if (!matchesDistributionFilters(poss, filters, setterNumber)) continue;

        const zone = attackZoneOf(poss.action);
        addAttackToCell(result[side].Total, poss.situation, zone, poss.action);
        if (pos && result[side][pos]) {
          addAttackToCell(result[side][pos], poss.situation, zone, poss.action);
        }
      }
    }
  });

  for (const side of ['home', 'away']) {
    for (const key of Object.keys(result[side])) finalizeSide(result[side][key]);
  }
  return result;
}

/**
 * Distribution par attaquant : pour chaque joueur, nombre de ballons reçus, part
 * du total de l'équipe, et résultat. Mêmes filtres que la distribution par zone.
 * @returns {{ home: Array, away: Array }} lignes triées par volume décroissant.
 */
export function computeDistributionByPlayer(actions, rallies, setterNumbers = {}, filters = {}) {
  const list = rallies || groupActionsIntoRallies(actions || []);
  const maps = { home: new Map(), away: new Map() };
  for (const rally of list) {
    const srv = rallyServerTeam(rally);
    const serverSide = srv === 'team1' ? 'home' : srv === 'team2' ? 'away' : null;
    for (const poss of extractRallyAttackPossessions(rally.actions, serverSide)) {
      const side = poss.team === 'away' ? 'away' : 'home';
      const setterNumber = Number(setterNumbers[side]) || 0;
      if (!matchesDistributionFilters(poss, filters, setterNumber)) continue;
      const number = Number(poss.action?.player_number) || 0;
      if (!number) continue;
      const row = maps[side].get(number) || { number, count: 0, points: 0, errors: 0, blocked: 0, bySituation: { '+': 0, '0': 0, '-': 0 } };
      row.count += 1;
      const ev = poss.action.evaluation;
      if (ev === '#') row.points += 1;
      if (ev === '=') row.errors += 1;
      if (ev === '/') row.blocked += 1;
      if (row.bySituation[poss.situation] != null) row.bySituation[poss.situation] += 1;
      maps[side].set(number, row);
    }
  }
  const out = { home: [], away: [] };
  for (const side of ['home', 'away']) {
    const rows = [...maps[side].values()];
    const total = rows.reduce((s, r) => s + r.count, 0);
    out[side] = rows
      .map((r) => ({
        ...r,
        pct: total ? Math.round((r.count / total) * 100) : 0,
        killPct: r.count ? Math.round((r.points / r.count) * 100) : 0,
        eff: r.count ? Math.round(((r.points - r.errors - r.blocked) / r.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.number - b.number);
  }
  return out;
}

/**
 * Tendances du passeur : répartition des ballons selon le résultat du point
 * précédent de l'équipe (point gagné / perdu) et taux de resollicitation d'un
 * attaquant juste après son échec (attaque en faute ou contrée).
 * @returns {{ home: Object, away: Object }}
 *   chaque côté : { afterWin, afterLoss: { total, rows:[{number,count,pct}] },
 *                     afterFail: { total, same, samePct } }
 */
export function computeSetterTendencies(actions, rallies, filters = {}) {
  const list = rallies || groupActionsIntoRallies(actions || []);
  const blank = () => ({
    afterWin: { total: 0, byPlayer: new Map() },
    afterLoss: { total: 0, byPlayer: new Map() },
    afterFail: { total: 0, same: 0, samePct: 0 },
    lastAttack: null,
    lastResult: null,
  });
  const st = { home: blank(), away: blank() };
  const phaseFilter = filters.phase || 'ALL';

  for (const rally of list) {
    const srv = rallyServerTeam(rally);
    const serverSide = srv === 'team1' ? 'home' : srv === 'team2' ? 'away' : null;
    for (const poss of extractRallyAttackPossessions(rally.actions, serverSide)) {
      const side = poss.team === 'away' ? 'away' : 'home';
      const s = st[side];
      const number = Number(poss.action?.player_number) || 0;
      if (!number) continue;
      if (phaseFilter === 'ALL' || poss.phase === phaseFilter) {
        const bucket = s.lastResult === 'win' ? s.afterWin : s.lastResult === 'loss' ? s.afterLoss : null;
        if (bucket) {
          bucket.total += 1;
          bucket.byPlayer.set(number, (bucket.byPlayer.get(number) || 0) + 1);
        }
      }
      if (s.lastAttack && (s.lastAttack.ev === '=' || s.lastAttack.ev === '/')) {
        s.afterFail.total += 1;
        if (s.lastAttack.number === number) s.afterFail.same += 1;
      }
      s.lastAttack = { number, ev: poss.action.evaluation };
    }
    if (rally.winner) {
      const winSide = rally.winner === 'team2' ? 'away' : 'home';
      st[winSide].lastResult = 'win';
      st[winSide === 'home' ? 'away' : 'home'].lastResult = 'loss';
    }
  }

  const rowsOf = (b) => ({
    total: b.total,
    rows: [...b.byPlayer.entries()]
      .map(([number, count]) => ({ number, count, pct: b.total ? Math.round((count / b.total) * 100) : 0 }))
      .sort((a, b2) => b2.count - a.count || a.number - b2.number),
  });
  const out = {};
  for (const side of ['home', 'away']) {
    const f = st[side].afterFail;
    out[side] = {
      afterWin: rowsOf(st[side].afterWin),
      afterLoss: rowsOf(st[side].afterLoss),
      afterFail: { ...f, samePct: f.total ? Math.round((f.same / f.total) * 100) : 0 },
    };
  }
  return out;
}
