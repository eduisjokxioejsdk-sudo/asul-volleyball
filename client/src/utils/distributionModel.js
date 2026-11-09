// Modèle de possession : chaque attaque est rattachée à son premier contact et
// à la passe qui la précède. Les informations inconnues ne sont pas inventées.

import { groupActionsIntoRallies, decomposeCode } from './datavolley.js';
import { computePerRallySetterPositions, positionOfPlayer } from './rotation.js';

export const DISTRIBUTION_ZONE_IDS = ['4', '3', '2', '7', '8', '9', '5', '6', '1'];
export const DISTRIBUTION_SITUATIONS = ['+', '0', '-'];
export const DISTRIBUTION_PHASES = ['K1', 'K2', 'FREEBALL'];

const ZONE_ALIASES = {
  deca: '4', fixe_av: '3', '2nde': '2', fixe_arr: '6', pipe: '6', avant: '3', arriere: '6',
};
const PASS_GROUPS = { Z2_3: ['2', '3'], Z4: ['4'], '3M': ['7', '8', '9'], BACK: ['1', '5', '6'] };
const keyOf = (a) => a?.uid ?? a?.id ?? a?.action_index;
const sideOf = (team) => (team === 'away' ? 'away' : 'home');
const numberOf = (a) => Number(a?.player_number) || 0;

export function distributionAttackZone(action) {
  const raw = String(action?.start_zone || action?.attack_zone || '').toLowerCase();
  const zone = ZONE_ALIASES[raw] || raw;
  return DISTRIBUTION_ZONE_IDS.includes(zone) ? zone : null;
}

export function distributionSituation(evaluation) {
  if (evaluation === '#' || evaluation === '+' || evaluation === '++') return '+';
  if (evaluation === '!') return '0';
  if (evaluation === '-') return '-';
  return null;
}

function phaseOf(firstContact) {
  if (!firstContact) return null;
  if (firstContact.action === 'R') return 'K1';
  if (firstContact.action === 'D') return 'K2';
  if (firstContact.action === 'F') return 'FREEBALL';
  return null;
}

function moneyTimeOf(score, setNumber) {
  if (!score) return false;
  const target = Number(setNumber) >= 5 ? 12 : 20;
  const max = Math.max(Number(score.team1) || 0, Number(score.team2) || 0);
  return max >= target && Math.abs((Number(score.team1) || 0) - (Number(score.team2) || 0)) <= 2;
}

/** Extrait les possessions d'un échange ; une attaque clôt la possession courante. */
export function extractDistributionPossessions(rallyActions) {
  const possessions = [];
  let currentTeam = null;
  let contacts = [];

  const flush = () => {
    const attack = contacts.find((a) => a.action === 'A');
    if (!attack) { contacts = []; return; }
    const before = contacts.slice(0, contacts.indexOf(attack));
    const firstContact = [...before].reverse().find((a) => ['R', 'D', 'F'].includes(a.action)) || null;
    const setAction = [...before].reverse().find((a) => a.action === 'E') || null;
    const remaining = contacts.slice(contacts.indexOf(attack) + 1);
    const rawEvaluation = firstContact?.evaluation || '';
    const combo = attack.combo || (attack.code ? decomposeCode(attack.code).combo : '') || '';
    const call = setAction?.call || (setAction?.code ? decomposeCode(setAction.code).call : '') || '';
    const passZone = String(setAction?.start_zone || '');
    const phase = phaseOf(firstContact);
    const situation = distributionSituation(rawEvaluation);
    const attackZone = distributionAttackZone(attack);
    const exclusions = [];
    if (!phase) exclusions.push('UNKNOWN_PHASE');
    if (!situation) exclusions.push('UNKNOWN_SITUATION');
    if (!attackZone) exclusions.push('UNKNOWN_ATTACK_ZONE');

    possessions.push({
      team: currentTeam,
      action: attack,
      actionKey: keyOf(attack),
      firstContact,
      setAction,
      phase,
      rawEvaluation,
      situation,
      attackZone,
      setterNumber: numberOf(setAction),
      setterCall: String(call || '').toUpperCase(),
      combo: String(combo || '').toUpperCase(),
      blockers: attack.num_blockers == null ? '' : String(attack.num_blockers),
      passZone,
      passZoneKnown: DISTRIBUTION_ZONE_IDS.includes(passZone),
      firstContactPlayer: numberOf(firstContact),
      rotation: null,
      setNumber: 1,
      scoreBefore: null,
      moneyTime: false,
      exclusions,
    });
    contacts = remaining;
  };

  for (const action of rallyActions || []) {
    if (!action || !action.team) continue;
    if (action.action === 'S' || action.action === 'B') continue;
    const team = sideOf(action.team);
    if (currentTeam && team !== currentTeam) flush();
    if (team !== currentTeam) { currentTeam = team; contacts = []; }
    contacts.push(action);
    if (action.action === 'A') flush();
  }
  flush();
  return possessions;
}

/** Ajoute set, score, money-time et rotation du passeur réel. */
export function buildDistributionPossessions(actions, options = {}) {
  const rallies = options.rallies || groupActionsIntoRallies(actions || []);
  const states = computePerRallySetterPositions(rallies, options.setups || {});
  const all = [];
  rallies.forEach((rally, index) => {
    const state = states[index] || {};
    for (const p of extractDistributionPossessions(rally.actions || [])) {
      const side = sideOf(p.team);
      const lineup = side === 'home' ? state.homeLineup : state.awayLineup;
      p.team = side;
      p.rallyIndex = index;
      p.setNumber = state.setNumber || 1;
      p.scoreBefore = state.scoreBefore || null;
      p.moneyTime = moneyTimeOf(state.scoreBefore, state.setNumber || 1);
      p.rotation = p.setterNumber > 0 ? positionOfPlayer(lineup, p.setterNumber) : null;
      all.push(p);
    }
  });
  return all;
}

function active(value) {
  return value != null && value !== '' && value !== 'ALL' && value !== 'all';
}

/** Les filtres changent la sélection, jamais la classification. */
export function matchesPossessionFilters(p, filters = {}) {
  if (active(filters.phase) && p.phase !== filters.phase) return false;
  if (active(filters.situation) && p.situation !== filters.situation) return false;
  if (active(filters.receptionQuality) && p.situation !== filters.receptionQuality) return false;
  if (active(filters.rotation) && p.rotation !== filters.rotation) return false;
  if (active(filters.setterCall) && p.setterCall !== filters.setterCall) return false;
  if (active(filters.combo) && p.combo !== filters.combo) return false;
  if (active(filters.player) && numberOf(p.action) !== Number(filters.player)) return false;
  if (active(filters.set) && Number(p.setNumber) !== Number(filters.set)) return false;
  if (filters.moneyTime && !p.moneyTime) return false;
  if (active(filters.passZone)) {
    const zones = PASS_GROUPS[filters.passZone];
    if (!zones || !p.passZoneKnown || !zones.includes(p.passZone)) return false;
  }
  if (active(filters.defenderRole)) {
    const setterDug = p.setterNumber > 0 && p.firstContactPlayer === p.setterNumber;
    if (filters.defenderRole === 'SETTER_DUG' && !setterDug) return false;
    if (filters.defenderRole === 'OTHER_DUG' && setterDug) return false;
  }
  return true;
}

/** Sépare validité et filtres, avec des compteurs expliquant les totaux. */
export function selectDistributionPossessions(possessions, filters = {}) {
  const eligible = [];
  const excluded = { UNKNOWN_PHASE: 0, UNKNOWN_SITUATION: 0, UNKNOWN_ATTACK_ZONE: 0 };
  for (const p of possessions || []) {
    if (p.exclusions.length) {
      for (const reason of p.exclusions) excluded[reason] = (excluded[reason] || 0) + 1;
    } else {
      eligible.push(p);
    }
  }
  const included = eligible.filter((p) => matchesPossessionFilters(p, filters));
  return { eligible, included, excluded, filteredOut: eligible.length - included.length };
}

