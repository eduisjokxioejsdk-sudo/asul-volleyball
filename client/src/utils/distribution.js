// ============================================================================
// Analyse de la distribution des passeurs (attaques après réception).
// La qualité de réception détermine la situation du passeur :
//   R '#', '+'  -> situation '+'
//   R '!'       -> situation '0'
//   R '-'       -> situation '-'
//   R '/', '='  -> non applicable (l'attaque n'est pas analysée)
// ============================================================================

import { computePerRallySetterPositions, positionOfPlayer } from './rotation.js';
import { groupActionsIntoRallies } from './datavolley.js';

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

/**
 * Alias historiques (appellations d'école) → zone officielle 1-9.
 * « déca » et « 4 » désignent l'aile gauche, « pipe » la zone 6, etc.
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

export function receptionToSituation(evaluation) {
  // '#' et '++' sont équivalents : réception parfaite.
  if (evaluation === '#' || evaluation === '+' || evaluation === '++') return '+';
  if (evaluation === '!') return '0';
  if (evaluation === '-') return '-';
  return null; // '/' ou '=' → non applicable
}

// Attaques (A) d'un lot de nouvelles actions qui suivent une réception (R)
// de la même équipe, avec une situation applicable.
// newKeys : uids (mode vidéo) ou ids (mode live).
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
    if (!prev) continue;
    if (prev.action === 'R' && prev.team === cur.team && receptionToSituation(prev.evaluation)) {
      hits.push(cur);
    }
  }
  return hits;
}

// Toutes les paires R→A (pour l'analyse), avec la situation déduite.
export function findReceptionAttackPairs(actions) {
  const list = actions || [];
  const pairs = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1];
    const cur = list[i];
    if (prev.action === 'R' && cur.action === 'A' && prev.team === cur.team) {
      const situation = receptionToSituation(prev.evaluation);
      if (situation) pairs.push({ action: cur, situation });
    }
  }
  return pairs;
}

function emptySide() {
  const side = {};
  for (const sit of SITUATIONS) {
    side[sit] = {};
    for (const z of ATTACK_ZONES) side[sit][z.id] = { count: 0, pct: 0 };
  }
  return side;
}

// { home: { '+': { zone: {count,pct} } }, away: { ... } }
export function computeSetterDistribution(actions) {
  const result = { home: emptySide(), away: emptySide() };
  for (const { action, situation } of findReceptionAttackPairs(actions)) {
    const side = action.team === 'away' ? 'away' : 'home';
    const zone = attackZoneOf(action);
    if (!zone || !result[side][situation][zone]) continue;
    result[side][situation][zone].count += 1;
  }
  for (const side of ['home', 'away']) {
    for (const sit of SITUATIONS) {
      const total = ATTACK_ZONES.reduce((s, z) => s + result[side][sit][z.id].count, 0);
      for (const z of ATTACK_ZONES) {
        const cell = result[side][sit][z.id];
        cell.pct = total ? Math.round((cell.count / total) * 100) : 0;
      }
    }
  }
  return result;
}

// --- Distribution par position du passeur dans la rotation (P1..P6) -----------

function finalizeSide(side) {
  for (const sit of SITUATIONS) {
    const total = ATTACK_ZONES.reduce((s, z) => s + side[sit][z.id].count, 0);
    for (const z of ATTACK_ZONES) {
      const cell = side[sit][z.id];
      cell.pct = total ? Math.round((cell.count / total) * 100) : 0;
    }
  }
  return side;
}

function emptyByPosition() {
  const byPos = { Total: emptySide() };
  for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) byPos[p] = emptySide();
  return byPos;
}

// Première attaque (A) suivant une réception (R) de la même équipe dans un rallye.
function firstReceptionAttackOfTeam(rallyActions, team) {
  const acts = rallyActions || [];
  for (let i = 1; i < acts.length; i += 1) {
    const prev = acts[i - 1];
    const cur = acts[i];
    if (cur.action !== 'A' || cur.team !== team) continue;
    if (prev.action === 'R' && prev.team === team) {
      const situation = receptionToSituation(prev.evaluation);
      if (situation) return { action: cur, situation };
    }
  }
  return null;
}

function addAttack(side, situation, zone) {
  if (!zone || !side[situation] || !side[situation][zone]) return;
  side[situation][zone].count += 1;
}

/**
 * Répartition des attaques après réception par position du passeur (P1..P6).
 * La position du passeur provient, dans l'ordre : du six enregistré du set
 * (via `setterNumbers`), puis du réglage manuel `home_setter_pos` /
 * `away_setter_pos`. Chaque position + un « Total » contiennent la ventilation
 * par situation (+ / 0 / -) et par zone d'attaque.
 * @param {Array} actions
 * @param {Array} [rallies]
 * @param {Object} [setups] - { [set]: { first_server, home_setter_pos, … } }
 * @param {{home?:number, away?:number}} [setterNumbers] - n° du passeur par équipe
 * @returns { home: {Total, P1..P6}, away: {Total, P1..P6} }
 */
export function computeSetterDistributionByRotation(actions, rallies, setups = {}, setterNumbers = {}) {
  const list = rallies || groupActionsIntoRallies(actions || []);
  const perRally = computePerRallySetterPositions(list, setups);

  const result = { home: emptyByPosition(), away: emptyByPosition() };

  list.forEach((rally, idx) => {
    const state = perRally[idx];
    if (!state) return;

    for (const side of ['home', 'away']) {
      let pos = side === 'home' ? state.homeSetterPos : state.awaySetterPos;
      if (!pos) {
        const setterNumber = Number(side === 'home' ? setterNumbers.home : setterNumbers.away);
        const lineup = side === 'home' ? state.homeLineup : state.awayLineup;
        if (Number.isInteger(setterNumber) && setterNumber > 0) {
          pos = positionOfPlayer(lineup, setterNumber);
        }
      }
      const pair = firstReceptionAttackOfTeam(rally.actions, side);
      if (!pair) continue;

      const zone = attackZoneOf(pair.action);
      addAttack(result[side].Total, pair.situation, zone);
      if (pos) addAttack(result[side][pos], pair.situation, zone);
    }
  });

  for (const side of ['home', 'away']) {
    for (const key of Object.keys(result[side])) finalizeSide(result[side][key]);
  }
  return result;
}
