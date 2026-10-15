// ============================================================================
// Moteur de scouting : exploite TOUT ce que portent les codes DataVolley
// (action, type, évaluation, zone de départ / d'arrivée, sous-zone) pour
// produire les rapports « façon DataVolley 4 » : ventilations par évaluation,
// par type, par zone, situations de réception, complexe I/II, rotations,
// classements — par joueur, par équipe, par set.
//
// Tout est pur et testable : aucune dépendance React. `computeScouting()` fait
// une seule passe et renvoie une structure prête pour l'affichage et l'export.
// ============================================================================

import {
  DV_ACTION_KEYS,
  DV_EVAL_KEYS,
  DV_TYPES,
  attackComboInfo,
  setterCallInfo,
  decomposeCode,
  groupActionsIntoRallies,
  getPointWinner,
  rallyServerTeam,
  rallyWinMethod,
  typeLabel,
} from './datavolley.js';
import { SITUATIONS, receptionToSituation, attackZoneOf } from './distribution.js';
import { computePerRallySetterPositions, positionOfPlayer } from './rotation.js';
import { roleLabel } from './lineup.js';

// ---------------------------------------------------------------------------
// Libellés des compétences (ordre d'affichage du rapport)
// ---------------------------------------------------------------------------
export const SKILLS = [
  { id: 'serve', action: 'S', label: 'Service' },
  { id: 'reception', action: 'R', label: 'Réception' },
  { id: 'attack', action: 'A', label: 'Attaque' },
  { id: 'block', action: 'B', label: 'Contre' },
  { id: 'dig', action: 'D', label: 'Défense' },
  { id: 'set', action: 'E', label: 'Passe' },
  { id: 'freeball', action: 'F', label: 'Ballon libre' },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);

const ACTION_TO_SKILL = SKILLS.reduce((acc, s) => {
  acc[s.action] = s.id;
  return acc;
}, {});

export function skillLabel(skillId) {
  return SKILLS.find((s) => s.id === skillId)?.label || skillId;
}

export function skillOfAction(action) {
  return ACTION_TO_SKILL[action] || null;
}

/** Libellé d'un type pour une action ('M' → « Smashée »). */
export function typeLabelOf(action, type) {
  return type ? typeLabel(action, type) : '';
}

// ---------------------------------------------------------------------------
// Agrégats élémentaires
// ---------------------------------------------------------------------------

/** Compteurs détaillés d'une combinaison / d'un appel (total, points, fautes…). */
export function emptyTacticStat() {
  return { total: 0, points: 0, errors: 0, blocked: 0, positive: 0 };
}

/** Compteurs vides d'une compétence : totaux par évaluation, type, zone, issue. */
export function emptySkillAgg() {
  const byEval = {};
  for (const sym of DV_EVAL_KEYS) byEval[sym] = 0;
  return {
    total: 0,
    byEval,
    byType: {},
    byCombo: {},      // combinaisons d'attaque (X1, XP, CB…)
    byCall: {},       // appels passeur (K1, K2…)
    comboStats: {},   // détail par combinaison (total, points, fautes…)
    callStats: {},    // détail par appel passeur
    byDirection: {},  // attaque : détail par direction « départ→arrivée »
    byZone: {},        // zone de départ (service : zone cible lue en end_zone)
    byEndZone: {},
    bySubzone: {},
    points: 0,
    errors: 0,
    blocked: 0,
    positive: 0,
    perfect: 0,
    // Issues de l'action (résumé « façon feuille de match »)
    outcomes: { point: 0, error: 0, positive: 0, neutral: 0, poor: 0, continue: 0 },
  };
}

/** Vrai si l'évaluation compte comme « positive » pour cette compétence. */
function isPositiveEval(action, ev) {
  if (ev === '#' || ev === '+') return true;
  if (action === 'A' && ev === '!') return true; // contrée mais rejouable
  if (action === 'R' && ev === '!') return true; // pas de 1er tempo : jouable
  return false;
}

/** Vrai si l'évaluation compte comme « parfaite / excellente ». */
function isPerfectEval(action, ev) {
  if (ev === '#') return true;
  return false;
}

/** Classe l'évaluation dans les issues résumées de la compétence. */
function outcomeOf(action, ev) {
  if (ev === '=') return 'error';
  if (ev === '#' && (action === 'S' || action === 'A' || action === 'B')) return 'point';
  if (action === 'A' && ev === '/') return 'blocked';
  if (ev === '#') return 'point';
  if (ev === '+' || ev === '!') return 'positive';
  if (ev === '-') return 'poor';
  if (ev === '/') return 'continue';
  return 'neutral';
}

/**
 * Ajoute une action à un agrégat de compétence (mutation locale contrôlée).
 * @param {Object} agg résultat d'emptySkillAgg()
 * @param {Object} a action décomposée
 */
export function addSkillAction(agg, a) {
  if (!agg || !a || !a.action) return agg;
  agg.total += 1;
  const ev = a.evaluation || '';
  if (agg.byEval[ev] != null) agg.byEval[ev] += 1;
  if (a.type) agg.byType[a.type] = (agg.byType[a.type] || 0) + 1;

  // Combinaison d'attaque / appel passeur : champ fourni, sinon déduit du code.
  let combo = a.combo || '';
  let call = a.call || '';
  if (!combo && !call && a.code) {
    const d = decomposeCode(a.code);
    combo = d.combo || '';
    call = d.call || '';
  }
  const outcome = outcomeOf(a.action, ev);
  const isPoint = outcome === 'point';
  const isPositive = isPositiveEval(a.action, ev);
  const isBlocked = a.action === 'A' && ev === '/';
  if (combo) {
    agg.byCombo[combo] = (agg.byCombo[combo] || 0) + 1;
    const cs = (agg.comboStats[combo] = agg.comboStats[combo] || emptyTacticStat());
    cs.total += 1;
    if (isPoint) cs.points += 1;
    if (ev === '=') cs.errors += 1;
    if (isBlocked) cs.blocked += 1;
    if (isPositive) cs.positive += 1;
  }
  if (call) {
    agg.byCall[call] = (agg.byCall[call] || 0) + 1;
    const cs = (agg.callStats[call] = agg.callStats[call] || emptyTacticStat());
    cs.total += 1;
    if (isPoint) cs.points += 1;
    if (ev === '=') cs.errors += 1;
    if (isPositive) cs.positive += 1;
  }

  // Zone utile selon la compétence : service → zone cible (end_zone) ;
  // attaque → zone de départ puis cible ; réception/défense → zone lue.
  if (a.action === 'S') {
    if (a.end_zone || a.start_zone) {
      const z = String(a.end_zone || a.start_zone);
      agg.byZone[z] = (agg.byZone[z] || 0) + 1;
    }
  } else if (a.action === 'A') {
    const z = attackZoneOf(a);
    if (z) agg.byZone[z] = (agg.byZone[z] || 0) + 1;
    if (a.end_zone) agg.byEndZone[a.end_zone] = (agg.byEndZone[a.end_zone] || 0) + 1;
  } else {
    if (a.start_zone) agg.byZone[a.start_zone] = (agg.byZone[a.start_zone] || 0) + 1;
    if (a.end_zone) agg.byEndZone[a.end_zone] = (agg.byEndZone[a.end_zone] || 0) + 1;
  }
  if (a.end_subzone) agg.bySubzone[a.end_subzone] = (agg.bySubzone[a.end_subzone] || 0) + 1;

  // Direction d'attaque : zone de départ → zone d'arrivée (analyse DataVolley).
  if (a.action === 'A') {
    const sz = attackZoneOf(a);
    const ez = a.end_zone ? String(a.end_zone) : '';
    if (sz && ez) {
      const key = `${sz}${ez}`;
      const d = (agg.byDirection[key] = agg.byDirection[key] || emptyTacticStat());
      d.total += 1;
      if (isPoint) d.points += 1;
      if (ev === '=') d.errors += 1;
      if (isBlocked) d.blocked += 1;
      if (isPositive) d.positive += 1;
    }
  }

  if (isPoint) agg.points += 1;
  if (ev === '=') agg.errors += 1;
  if (isBlocked) agg.blocked += 1;
  if (isPositive) agg.positive += 1;
  if (isPerfectEval(a.action, ev)) agg.perfect += 1;

  if (agg.outcomes[outcome] != null) agg.outcomes[outcome] += 1;
  return agg;
}

/** Fusionne deux agrégats (utile pour les totaux et les filtres par set). */
export function mergeSkillAgg(target, source) {
  if (!source) return target;
  target.total += source.total || 0;
  for (const sym of DV_EVAL_KEYS) target.byEval[sym] += source.byEval?.[sym] || 0;
  for (const [k, v] of Object.entries(source.byType || {})) target.byType[k] = (target.byType[k] || 0) + v;
  for (const [k, v] of Object.entries(source.byCombo || {})) target.byCombo[k] = (target.byCombo[k] || 0) + v;
  for (const [k, v] of Object.entries(source.byCall || {})) target.byCall[k] = (target.byCall[k] || 0) + v;
  for (const [k, s] of Object.entries(source.comboStats || {})) {
    const t = (target.comboStats[k] = target.comboStats[k] || emptyTacticStat());
    for (const key of Object.keys(t)) t[key] += s[key] || 0;
  }
  for (const [k, s] of Object.entries(source.callStats || {})) {
    const t = (target.callStats[k] = target.callStats[k] || emptyTacticStat());
    for (const key of Object.keys(t)) t[key] += s[key] || 0;
  }
  for (const [k, s] of Object.entries(source.byDirection || {})) {
    const t = (target.byDirection[k] = target.byDirection[k] || emptyTacticStat());
    for (const key of Object.keys(t)) t[key] += s[key] || 0;
  }
  for (const [k, v] of Object.entries(source.byZone || {})) target.byZone[k] = (target.byZone[k] || 0) + v;
  for (const [k, v] of Object.entries(source.byEndZone || {})) target.byEndZone[k] = (target.byEndZone[k] || 0) + v;
  for (const [k, v] of Object.entries(source.bySubzone || {})) target.bySubzone[k] = (target.bySubzone[k] || 0) + v;
  target.points += source.points || 0;
  target.errors += source.errors || 0;
  target.blocked += source.blocked || 0;
  target.positive += source.positive || 0;
  target.perfect += source.perfect || 0;
  for (const k of Object.keys(target.outcomes)) target.outcomes[k] += source.outcomes?.[k] || 0;
  return target;
}

/** Agrégat vide complet pour les 7 compétences. */
export function emptySkills() {
  const out = {};
  for (const s of SKILLS) out[s.id] = emptySkillAgg();
  return out;
}

export function mergeSkills(target, source) {
  for (const s of SKILLS) mergeSkillAgg(target[s.id], source?.[s.id]);
  return target;
}

// ---------------------------------------------------------------------------
// Efficacités (formules officielles DataVolley, en %)
// ---------------------------------------------------------------------------

export function serveEfficiency(agg) {
  if (!agg?.total) return 0;
  return Math.round(((agg.points - agg.errors) / agg.total) * 1000) / 10;
}

export function receptionPositivePct(agg) {
  if (!agg?.total) return 0;
  return Math.round(((agg.byEval['#'] + agg.byEval['+']) / agg.total) * 1000) / 10;
}

export function receptionPerfectPct(agg) {
  if (!agg?.total) return 0;
  return Math.round((agg.byEval['#'] / agg.total) * 1000) / 10;
}

export function attackSuccessPct(agg) {
  if (!agg?.total) return 0;
  return Math.round((agg.points / agg.total) * 1000) / 10;
}

export function attackEfficiency(agg) {
  if (!agg?.total) return 0;
  return Math.round(((agg.points - agg.errors - agg.blocked) / agg.total) * 1000) / 10;
}

export function blockEfficiency(agg) {
  if (!agg?.total) return 0;
  return Math.round(((agg.points - agg.errors) / agg.total) * 1000) / 10;
}

/** Efficacité générique (points − fautes) / total, pour défense / passe / libre. */
export function simpleEfficiency(agg) {
  if (!agg?.total) return 0;
  return Math.round(((agg.points - agg.errors) / agg.total) * 1000) / 10;
}

/** Ligne « métriques » prête pour les tableaux et l'export. */
export function skillMetrics(skillId, agg) {
  const base = { total: agg.total, errors: agg.errors, points: agg.points };
  switch (skillId) {
    case 'serve':
      return { ...base, efficiency: serveEfficiency(agg) };
    case 'reception':
      return {
        ...base,
        positivePct: receptionPositivePct(agg),
        perfectPct: receptionPerfectPct(agg),
        positive: agg.positive,
        perfect: agg.perfect,
      };
    case 'attack':
      return {
        ...base,
        blocked: agg.blocked,
        successPct: attackSuccessPct(agg),
        efficiency: attackEfficiency(agg),
      };
    case 'block':
      return { ...base, efficiency: blockEfficiency(agg) };
    default:
      return { ...base, efficiency: simpleEfficiency(agg) };
  }
}
// ---------------------------------------------------------------------------
// Situations (qualité de réception → issue de la 1re attaque)
// ---------------------------------------------------------------------------

export const SITUATION_LABELS = { '+': 'Réception positive', 0: 'Réception neutre', '-': 'Réception négative' };

export function emptySituationSide() {
  const side = {};
  for (const sit of SITUATIONS) {
    side[sit] = { key: sit, label: SITUATION_LABELS[sit] || sit, total: 0, points: 0, errors: 0, blocked: 0, zones: {} };
  }
  return side;
}

/** Issue d'une attaque classée en (point, faute, contrée). */
function attackOutcomeOf(a) {
  if (a.evaluation === '#') return 'points';
  if (a.evaluation === '=') return 'errors';
  if (a.evaluation === '/') return 'blocked';
  return null;
}

/**
 * Première attaque suivant une réception de la même équipe dans un rallye.
 * @returns {{action:Object, situation:string}|null}
 */
export function firstReceptionAttack(rallyActions, team) {
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

/**
 * Situations par équipe : pour chaque qualité de réception (+ / 0 / −),
 * nombre de 1res attaques, points, fautes, contrées, zones visées.
 */
export function computeSituations(rallies) {
  const result = { home: emptySituationSide(), away: emptySituationSide() };
  for (const rally of rallies || []) {
    for (const side of ['home', 'away']) {
      const pair = firstReceptionAttack(rally.actions, side);
      if (!pair) continue;
      const cell = result[side][pair.situation];
      if (!cell) continue;
      cell.total += 1;
      const outcome = attackOutcomeOf(pair.action);
      if (outcome) cell[outcome] += 1;
      const zone = attackZoneOf(pair.action);
      if (zone) cell.zones[zone] = (cell.zones[zone] || 0) + 1;
    }
  }
  for (const side of ['home', 'away']) {
    for (const sit of SITUATIONS) {
      const cell = result[side][sit];
      cell.successPct = cell.total ? Math.round((cell.points / cell.total) * 1000) / 10 : 0;
      cell.efficiency = cell.total
        ? Math.round(((cell.points - cell.errors - cell.blocked) / cell.total) * 1000) / 10
        : 0;
    }
  }
  return result;
}
// ---------------------------------------------------------------------------
// Complexe I / II : side-out (après réception) vs transition (après service)
// ---------------------------------------------------------------------------

export function emptyComplex() {
  return {
    // Complexe I : l'équipe reçoit le service (elle n'a pas servi).
    sideOut: { total: 0, won: 0, pct: 0 },
    // Complexe II : l'équipe a servi (elle doit défendre puis marquer).
    transition: { total: 0, won: 0, pct: 0 },
  };
}

/** Complexe I / II par équipe, déduits du serveur de chaque échange. */
export function computeComplex(rallies) {
  const result = { home: emptyComplex(), away: emptyComplex() };
  for (const rally of rallies || []) {
    const winner = getPointWinner(rally);
    if (!winner) continue;
    const server = rallyServerTeam(rally);
    if (!server) continue;
    // rallyServerTeam renvoie 'team1' / 'team2' : on ramène au côté du rapport.
    const serverSide = server === 'team1' ? 'home' : 'away';
    const receiverSide = serverSide === 'home' ? 'away' : 'home';
    const winnerSide = winner === 'team1' ? 'home' : 'away';
    result[serverSide].transition.total += 1;
    result[receiverSide].sideOut.total += 1;
    if (winnerSide === serverSide) result[serverSide].transition.won += 1;
    else result[receiverSide].sideOut.won += 1;
  }
  for (const side of ['home', 'away']) {
    const c = result[side];
    c.sideOut.pct = c.sideOut.total ? Math.round((c.sideOut.won / c.sideOut.total) * 1000) / 10 : 0;
    c.transition.pct = c.transition.total ? Math.round((c.transition.won / c.transition.total) * 1000) / 10 : 0;
  }
  return result;
}
// ---------------------------------------------------------------------------
// Rotations : efficacité de chaque rotation (P1..P6)
// ---------------------------------------------------------------------------

export function emptyRotation() {
  return { pos: null, rallies: 0, won: 0, pct: 0, serve: emptySkillAgg(), attack: emptySkillAgg() };
}

/**
 * Bilan par rotation du passeur (repère DataVolley) pour chaque équipe :
 * points joués, gagnés, efficacité service et attaque pendant cette rotation.
 * @param {Array} rallies
 * @param {Object} setups - { [set]: { first_server, home_setter_pos, … } }
 * @param {{home?:number, away?:number}} [setterNumbers]
 */
export function computeRotations(rallies, setups = {}, setterNumbers = {}) {
  const list = rallies || [];
  const perRally = computePerRallySetterPositions(list, setups);
  const result = { home: {}, away: {} };
  for (const side of ['home', 'away']) {
    for (const pos of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      result[side][pos] = { ...emptyRotation(), pos };
    }
  }

  list.forEach((rally, idx) => {
    const state = perRally[idx];
    if (!state) return;
    const winner = getPointWinner(rally);
    // Les actions portent 'home'/'away' ; getPointWinner renvoie 'team1'/'team2'.
    const winnerSide = winner ? (winner === 'team1' ? 'home' : 'away') : null;
    const serverSide = rallyServerTeam(rally) === 'team1' ? 'home' : (rallyServerTeam(rally) === 'team2' ? 'away' : null);

    for (const side of ['home', 'away']) {
      let pos = side === 'home' ? state.homeSetterPos : state.awaySetterPos;
      if (!pos) {
        const setterNumber = Number(side === 'home' ? setterNumbers.home : setterNumbers.away);
        const lineup = side === 'home' ? state.homeLineup : state.awayLineup;
        if (Number.isInteger(setterNumber) && setterNumber > 0) pos = positionOfPlayer(lineup, setterNumber);
      }
      if (!pos || !result[side][pos]) continue;
      const cell = result[side][pos];
      if (winnerSide) {
        cell.rallies += 1;
        if (winnerSide === side) cell.won += 1;
      }
      for (const a of rally.actions || []) {
        if (a.team !== side) continue;
        if (a.action === 'S' && serverSide === side) addSkillAction(cell.serve, a);
        if (a.action === 'A') addSkillAction(cell.attack, a);
      }
    }
  });

  for (const side of ['home', 'away']) {
    for (const pos of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      const cell = result[side][pos];
      cell.pct = cell.rallies ? Math.round((cell.won / cell.rallies) * 1000) / 10 : 0;
      cell.serveEfficiency = serveEfficiency(cell.serve);
      cell.attackEfficiency = attackEfficiency(cell.attack);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Classements (meilleurs joueurs par compétence)
// ---------------------------------------------------------------------------

export const RANKING_LABELS = {
  points: 'Meilleur marqueur',
  serve: 'Meilleur serveur',
  reception: 'Meilleur réceptionneur',
  attack: 'Meilleur attaquant',
  block: 'Meilleur contreur',
};

/**
 * Classements par équipe. Un joueur doit avoir au moins 3 actions dans la
 * compétence concernée pour être classé (évite qu'une seule action domine).
 */
export function computeRankings(team) {
  // Joueur éligible dès qu'il a au moins une action dans une compétence.
  const activity = (p) =>
    (p.total || 0) || SKILLS.reduce((s, sk) => s + (p.skills?.[sk.id]?.total || 0), 0);
  const players = (team?.players || []).filter((p) => activity(p) > 0);
  const pick = (score) => {
    let best = null;
    let bestScore = -Infinity;
    for (const p of players) {
      const v = score(p);
      if (v == null) continue;
      if (v > bestScore) {
        best = p;
        bestScore = v;
      }
    }
    return best ? { player: best, value: bestScore } : null;
  };

  return {
    points: pick((p) => (p.points > 0 ? p.points : null)),
    serve: pick((p) => (p.skills.serve.total >= 3 ? serveEfficiency(p.skills.serve) : null)),
    reception: pick((p) => (p.skills.reception.total >= 3 ? receptionPositivePct(p.skills.reception) : null)),
    attack: pick((p) => (p.skills.attack.total >= 3 ? attackEfficiency(p.skills.attack) : null)),
    block: pick((p) => (p.skills.block.points > 0 ? p.skills.block.points : null)),
  };
}
// ---------------------------------------------------------------------------
// Passe principale : rapport de scouting complet
// ---------------------------------------------------------------------------

/** Joueur vide du rapport (agrégats par compétence). */
export function emptyScoutPlayer(number, name = '', rosterRole = 'universal') {
  const skills = emptySkills();
  return {
    number: Number(number) || 0,
    name: name || '',
    rosterRole,
    roleLabel: roleLabel(rosterRole),
    total: 0,
    points: 0,
    faults: 0,
    skills,
    // Alias `stats` : la table « feuille de match » (MatchReportTable) lit
    // `stats.<compétence>` — on lui donne exactement les mêmes agrégats.
    stats: skills,
  };
}

function addActionToPlayer(player, a) {
  const skill = skillOfAction(a.action);
  if (!skill) return;
  player.total += 1;
  if (a.evaluation === '=') player.faults += 1;
  if (a.evaluation === '#' && (a.action === 'S' || a.action === 'A' || a.action === 'B')) player.points += 1;
  addSkillAction(player.skills[skill], a);
}

/** Totaux d'équipe depuis ses joueurs. */
export function teamTotals(players) {
  const totals = emptyScoutPlayer(0, '');
  for (const p of players) {
    totals.total += p.total;
    totals.points += p.points;
    totals.faults += p.faults;
    mergeSkills(totals.skills, p.skills);
  }
  return totals;
}

function rosterOf(config) {
  return (config?.roster || [])
    .map((p) => ({ number: Number(p.number) || 0, name: p.name || '', role: p.role || 'universal' }))
    .filter((p) => p.number > 0);
}

function buildSide(teamKey, list, config, name) {
  const players = new Map();
  for (const p of rosterOf(config)) {
    players.set(p.number, emptyScoutPlayer(p.number, p.name, p.role));
  }
  for (const a of list) {
    if (a.team !== teamKey) continue;
    const n = Number(a.player_number) || 0;
    if (n <= 0) continue;
    if (!players.has(n)) {
      const info = rosterOf(config).find((p) => p.number === n);
      players.set(n, emptyScoutPlayer(n, info?.name || '', info?.role || 'universal'));
    }
    addActionToPlayer(players.get(n), a);
  }
  const sorted = [...players.values()].sort((x, y) => x.number - y.number);
  return { name, players: sorted, totals: teamTotals(sorted) };
}
/**
 * Rapport de scouting complet, à partir des actions codées.
 *
 * @param {Object} input
 * @param {Array}  input.actions - actions codées (action/type/zones/évaluation)
 * @param {Array}  [input.rallies] - sinon recalculés
 * @param {Object} [input.homeConfig] / input.awayConfig - fiches équipe
 * @param {string} [input.homeName] / input.awayName
 * @param {number[]} [input.sets] - filtre par sets (vide = tous)
 * @param {Map} [input.setMap] - index action → set (voir indexActionSets)
 * @param {Object} [input.setups] - six/rotation par set
 * @param {{home?:number,away?:number}} [input.setterNumbers]
 * @returns {Object} rapport complet par équipe, prêt à afficher / exporter
 */
export function computeScouting(input = {}) {
  const {
    actions = [],
    homeConfig = null,
    awayConfig = null,
    homeName = 'Domicile',
    awayName = 'Extérieur',
    sets = [],
    setMap = null,
    setups = {},
    setterNumbers = {},
  } = input;

  // 1. Filtre par set (le rapport se recalcule set par set comme le bilan P2).
  const wanted = sets && sets.length ? new Set(sets.map(Number)) : null;
  const list = wanted && setMap
    ? actions.filter((a) => wanted.has(Number(setMap.get(a.uid ?? a.id ?? a.action_index) || 1)))
    : actions;

  const rallies = input.rallies || groupActionsIntoRallies(list);

  // 2. Joueurs : effectif des fiches d'équipe (même sans action) + joueurs vus.
  const home = buildSide('home', list, homeConfig, homeName);
  const away = buildSide('away', list, awayConfig, awayName);

  // 3. Données de match : situations, complexe, rotations, classements.
  const situations = computeSituations(rallies);
  const complex = computeComplex(rallies);
  const rotations = computeRotations(rallies, setups, setterNumbers);

  home.situations = situations.home;
  home.complex = complex.home;
  home.rotations = rotations.home;
  home.rankings = computeRankings(home);
  away.situations = situations.away;
  away.complex = complex.away;
  away.rotations = rotations.away;
  away.rankings = computeRankings(away);

  // 4. Par set : mêmes agrégats, pour la vue « Par set ».
  const bySet = {};
  if (setMap) {
    const setNumbers = [...new Set([...setMap.values()].map(Number))].sort((a, b) => a - b);
    for (const sn of setNumbers) {
      const setActions = actions.filter((a) => Number(setMap.get(a.uid ?? a.id ?? a.action_index) || 1) === sn);
      const setRallies = groupActionsIntoRallies(setActions);
      const sideOf = (teamKey, team) => {
        const rows = (team.players || []).map((p) => emptyScoutPlayer(p.number, p.name, p.rosterRole));
        for (const a of setActions) {
          if (a.team !== teamKey) continue;
          const row = rows.find((r) => r.number === Number(a.player_number));
          if (row) addActionToPlayer(row, a);
        }
        const active = rows.filter((r) => r.total > 0);
        return { players: active, totals: teamTotals(active) };
      };
      const setComplex = computeComplex(setRallies);
      const setSituations = computeSituations(setRallies);
      bySet[sn] = {
        setNumber: sn,
        home: { ...sideOf('home', home), complex: setComplex.home, situations: setSituations.home },
        away: { ...sideOf('away', away), complex: setComplex.away, situations: setSituations.away },
      };
    }
  }

  const setList = setMap ? [...new Set([...setMap.values()].map(Number))].sort((a, b) => a - b) : [];

  return {
    actionCount: list.length,
    // `sets` = sets disponibles (sélecteur) ; `activeSets` = sets du rapport affiché.
    sets: setList,
    activeSets: wanted ? [...wanted].sort((a, b) => a - b) : setList,
    home,
    away,
    bySet,
    rallyCount: rallies.filter((r) => getPointWinner(r)).length,
  };
}
// ---------------------------------------------------------------------------
// Aide à l'export : tableaux prêts à imprimer / convertir en CSV
// ---------------------------------------------------------------------------

/** Colonnes de la ventilation par évaluation (une par symbole officiel). */
export const EVAL_COLUMNS = DV_EVAL_KEYS.map((sym) => ({ sym, label: `Éval ${sym}` }));

/** Joueurs ayant des actions dans une compétence donnée (pour un tableau). */
export function playersWithSkill(side, skillId) {
  return (side?.players || []).filter((p) => (p.skills?.[skillId]?.total || 0) > 0);
}

/** Types observés pour une compétence, dans l'ordre de la nomenclature. */
export function observedTypes(actions, actionCode) {
  const seen = [];
  for (const a of actions || []) {
    if (a.action !== actionCode || !a.type) continue;
    if (!seen.includes(a.type)) seen.push(a.type);
  }
  return seen.sort();
}

/** Description d'un type pour l'affichage : { sym, label, desc }. */
export function describeType(actionCode, sym) {
  const info = (DV_TYPES[actionCode] || []).find((t) => t.sym === sym);
  return { sym, label: info?.label || sym, desc: info?.desc || '' };
}

/** Zones d'un agrégat, triées, avec compteur et pourcentage. */
export function zoneCellRows(agg) {
  if (!agg) return { rows: [], total: 0 };
  const total = Object.values(agg.byZone || {}).reduce((s, v) => s + v, 0);
  const rows = Object.entries(agg.byZone || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([zone, count]) => ({ zone, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 }));
  return { rows, total };
}

/**
 * Table des combinaisons d'attaque (kind='combo') ou des appels passeur
 * (kind='call') d'une équipe : une ligne par code (total, points, fautes,
 * contrées, efficacité), triée par volume d'utilisation.
 */
export function tacticTableRows(side, skillId = 'attack', kind = 'combo') {
  const field = kind === 'call' ? 'callStats' : 'comboStats';
  const agg = {};
  const add = (src) => {
    for (const [code, s] of Object.entries(src || {})) {
      const e = (agg[code] = agg[code] || emptyTacticStat());
      for (const k of Object.keys(e)) e[k] += s[k] || 0;
    }
  };
  for (const p of side?.players || []) add(p.skills?.[skillId]?.[field]);
  // `totals` est le cumul des joueurs : on ne l'ajoute que s'il n'y a pas de joueurs.
  if (!(side?.players || []).length) add(side?.totals?.skills?.[skillId]?.[field]);
  return Object.entries(agg)
    .map(([code, s]) => {
      const info = kind === 'call' ? setterCallInfo(code) : attackComboInfo(code);
      const eff = s.total ? Math.round(((s.points - s.errors - s.blocked) / s.total) * 1000) / 10 : 0;
      return { code, label: info?.label || code, desc: info?.desc || '', ...s, efficiency: eff };
    })
    .sort((a, b) => b.total - a.total);
}

/** Lignes CSV des combinaisons d'attaque d'une équipe. */
export function tacticToRows(side, skillId = 'attack', kind = 'combo') {
  const rows = tacticTableRows(side, skillId, kind);
  const head = ['Code', 'Libelle', 'Total', 'Points', 'Fautes', 'Contrees', 'Efficacite %'];
  return [
    head,
    ...rows.map((r) => [r.code, r.label, r.total, r.points, r.errors, r.blocked, r.efficiency]),
  ];
}

/**
 * Directions d'attaque d'une équipe : une ligne par couple « départ→arrivée »
 * (zone de départ + zone d'arrivée), triée par volume.
 */
export function directionTableRows(side, skillId = 'attack') {
  const agg = {};
  const add = (src) => {
    for (const [key, s] of Object.entries(src || {})) {
      const e = (agg[key] = agg[key] || emptyTacticStat());
      for (const k of Object.keys(e)) e[k] += s[k] || 0;
    }
  };
  for (const p of side?.players || []) add(p.skills?.[skillId]?.byDirection);
  if (!(side?.players || []).length) add(side?.totals?.skills?.[skillId]?.byDirection);
  return Object.entries(agg)
    .map(([key, s]) => {
      const eff = s.total ? Math.round(((s.points - s.errors - s.blocked) / s.total) * 1000) / 10 : 0;
      return { key, start: key[0] || '', end: key[1] || '', ...s, efficiency: eff };
    })
    .sort((a, b) => b.total - a.total);
}

/** Métriques d'efficacité clés d'une équipe (pour un total de set). */
function sideEfficiency(totals) {
  const s = totals?.stats || {};
  const serve = s.serve || {};
  const reception = s.reception || {};
  const attack = s.attack || {};
  const block = s.block || {};
  const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);
  return {
    serve: serveEfficiency(serve),
    recPos: pct(reception.positive || 0, reception.total || 0),
    recExc: pct(reception.perfect || 0, reception.total || 0),
    attPct: pct(attack.points || 0, attack.total || 0),
    attEff: attackEfficiency(attack),
    points: (serve.points || 0) + (attack.points || 0) + (block.points || 0),
  };
}

/**
 * Synthèse par set : une ligne par set avec les efficacités clés des DEUX équipes.
 * @returns {Array<{setNumber:number, home:Object, away:Object}>}
 */
export function setEfficiencyRows(report) {
  const sets = Object.values(report?.bySet || {}).sort((a, b) => a.setNumber - b.setNumber);
  return sets.map((s) => ({
    setNumber: s.setNumber,
    home: sideEfficiency(s.home?.totals),
    away: sideEfficiency(s.away?.totals),
  }));
}