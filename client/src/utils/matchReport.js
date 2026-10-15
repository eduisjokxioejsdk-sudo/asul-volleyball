// ============================================================================
// Bilan de match standardisé (présentation type feuille de match FIVB / LNV).
// Toutes les colonnes sont calculées à partir des codes DataVolley :
//   Service   : total, fautes, aces, efficacité (aces − fautes)/total
//   Réception : total, fautes, % positif (# +), % excellent (#)
//   Attaque   : total, fautes, contrées, points, % de réussite, efficacité
//   Contre    : points, fautes
//   Défense / Passe : total, fautes
//   Points    : aces + attaques gagnantes + contres gagnants
// ============================================================================

import { roleLabel } from './lineup.js';

export const REPORT_SKILLS = ['serve', 'reception', 'attack', 'block', 'dig', 'set', 'freeball'];

export const SKILL_LABELS = {
  serve: 'Service',
  reception: 'Réception',
  attack: 'Attaque',
  block: 'Contre',
  dig: 'Défense',
  set: 'Passe',
  freeball: 'Ballon libre',
};

function emptySkill() {
  return { total: 0, errors: 0, points: 0, positive: 0, perfect: 0, blocked: 0 };
}

export function emptyPlayerStat(number, name = '') {
  const stats = {};
  for (const s of REPORT_SKILLS) stats[s] = emptySkill();
  return { number: Number(number) || 0, name, rosterRole: 'universal', stats, faults: 0, points: 0 };
}

function addAction(row, a) {
  const ev = a.evaluation;
  const st = row.stats;
  const done = (s) => {
    if (st[s]) st[s].total += 1;
  };

  switch (a.action) {
    case 'S':
      done('serve');
      if (ev === '=') st.serve.errors += 1;
      if (ev === '#') { st.serve.points += 1; row.points += 1; }
      break;
    case 'R':
      done('reception');
      if (ev === '=') st.reception.errors += 1;
      if (ev === '#' || ev === '+') st.reception.positive += 1;
      if (ev === '#') st.reception.perfect += 1;
      break;
    case 'A':
      done('attack');
      if (ev === '=') st.attack.errors += 1;
      if (ev === '/') st.attack.blocked += 1;
      if (ev === '#' || ev === '+') st.attack.positive += 1;
      if (ev === '#') { st.attack.points += 1; row.points += 1; }
      break;
    case 'B':
      done('block');
      if (ev === '=' || ev === '/') st.block.errors += 1;
      if (ev === '#') { st.block.points += 1; row.points += 1; }
      else if (ev === '+') st.block.positive += 1;
      break;
    case 'D':
      done('dig');
      if (ev === '=') st.dig.errors += 1;
      if (ev === '#' || ev === '+') st.dig.positive += 1;
      break;
    case 'E':
      done('set');
      if (ev === '=') st.set.errors += 1;
      if (ev === '#' || ev === '+') st.set.positive += 1;
      break;
    case 'F':
      done('freeball');
      if (ev === '=') st.freeball.errors += 1;
      break;
    default:
      break;
  }
  if (ev === '=') row.faults += 1;
}

export function mergePlayerStat(target, source) {
  for (const s of REPORT_SKILLS) {
    for (const k of Object.keys(target.stats[s])) target.stats[s][k] += source.stats[s][k] || 0;
  }
  target.points += source.points;
  target.faults += source.faults;
  return target;
}

/** Lignes par joueur pour une équipe ('home' | 'away'). */
export function computePlayerRows(actions, team, teamConfig = null) {
  const rows = new Map();
  for (const a of actions || []) {
    if (!a || a.team !== team) continue;
    if (!a.action) continue;
    const key = Number(a.player_number) || 0;
    if (!rows.has(key)) {
      const info = (teamConfig?.roster || []).find((p) => Number(p.number) === key);
      const row = emptyPlayerStat(key, info?.name || '');
      row.rosterRole = info?.role || 'universal';
      rows.set(key, row);
    }
    addAction(rows.get(key), a);
  }
  return [...rows.values()].sort((x, y) => x.number - y.number);
}

export function computeTeamTotals(actions, team) {
  const total = emptyPlayerStat(0, '');
  for (const row of computePlayerRows(actions, team)) mergePlayerStat(total, row);
  return total;
}

// --- Formules ---------------------------------------------------------------

export function ratio(numerator, denominator, digits = 0) {
  if (!denominator) return 0;
  const v = (numerator / denominator) * 100;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function serveEfficiency(s) {
  if (!s || !s.total) return 0;
  return Math.round(((s.points - s.errors) / s.total) * 1000) / 10;
}

export function receptionPositive(s) {
  return ratio(s ? s.positive : 0, s ? s.total : 0, 1);
}

export function receptionPerfect(s) {
  return ratio(s ? s.perfect : 0, s ? s.total : 0, 1);
}

export function attackSuccess(s) {
  return ratio(s ? s.points : 0, s ? s.total : 0, 1);
}

export function attackEfficiency(s) {
  if (!s || !s.total) return 0;
  return Math.round((((s.points - s.errors - s.blocked) / s.total) * 100) * 10) / 10;
}

/**
 * Définition des colonnes du tableau standardisé.
 * Chaque colonne : { key, group, short, label, get(row) }
 */
export const REPORT_COLUMNS = [
  { key: 'srv_tot', group: 'Service', short: 'Tot', label: 'Services', get: (r) => r.stats.serve.total },
  { key: 'srv_err', group: 'Service', short: 'Err', label: 'Fautes de service', get: (r) => r.stats.serve.errors },
  { key: 'srv_ace', group: 'Service', short: 'Ace', label: 'Aces', get: (r) => r.stats.serve.points },
  { key: 'srv_eff', group: 'Service', short: 'Eff', label: 'Efficacité au service', get: (r) => serveEfficiency(r.stats.serve) },
  { key: 'rec_tot', group: 'Réception', short: 'Tot', label: 'Réceptions', get: (r) => r.stats.reception.total },
  { key: 'rec_err', group: 'Réception', short: 'Err', label: 'Fautes de réception', get: (r) => r.stats.reception.errors },
  { key: 'rec_pos', group: 'Réception', short: 'Pos%', label: 'Réceptions positives', get: (r) => receptionPositive(r.stats.reception) },
  { key: 'rec_exc', group: 'Réception', short: 'Exc%', label: 'Réceptions parfaites', get: (r) => receptionPerfect(r.stats.reception) },
  { key: 'att_tot', group: 'Attaque', short: 'Tot', label: 'Attaques', get: (r) => r.stats.attack.total },
  { key: 'att_err', group: 'Attaque', short: 'Err', label: "Fautes d'attaque", get: (r) => r.stats.attack.errors },
  { key: 'att_blo', group: 'Attaque', short: 'Blo', label: 'Attaques contrées', get: (r) => r.stats.attack.blocked },
  { key: 'att_pts', group: 'Attaque', short: 'Pts', label: 'Attaques gagnantes', get: (r) => r.stats.attack.points },
  { key: 'att_pct', group: 'Attaque', short: '%', label: "Pourcentage de réussite à l'attaque", get: (r) => attackSuccess(r.stats.attack) },
  { key: 'att_eff', group: 'Attaque', short: 'Eff', label: "Efficacité à l'attaque", get: (r) => attackEfficiency(r.stats.attack) },
  { key: 'blk_pts', group: 'Contre', short: 'Pts', label: 'Contres gagnants', get: (r) => r.stats.block.points },
  { key: 'blk_err', group: 'Contre', short: 'Err', label: 'Fautes de contre', get: (r) => r.stats.block.errors },
  { key: 'dig_tot', group: 'Défense', short: 'Tot', label: 'Défenses', get: (r) => r.stats.dig.total },
  { key: 'dig_err', group: 'Défense', short: 'Err', label: 'Fautes de défense', get: (r) => r.stats.dig.errors },
  { key: 'set_tot', group: 'Passe', short: 'Tot', label: 'Passes', get: (r) => r.stats.set.total },
  { key: 'set_err', group: 'Passe', short: 'Err', label: 'Fautes de passe', get: (r) => r.stats.set.errors },
  { key: 'pts', group: 'Points', short: 'Pts', label: 'Points marqués', get: (r) => r.points },
  { key: 'flt', group: 'Points', short: 'Flt', label: 'Fautes directes', get: (r) => r.faults },
];

/** En-têtes regroupés pour l'affichage (colspan). */
export function reportHeaderGroups() {
  const groups = [];
  for (const col of REPORT_COLUMNS) {
    const last = groups[groups.length - 1];
    if (last && last.group === col.group) last.cols.push(col);
    else groups.push({ group: col.group, cols: [col] });
  }
  return groups;
}

/** Colonnes qui sont des pourcentages / efficacités (affichage + décimale). */
export const REPORT_PCT_KEYS = ['srv_eff', 'rec_pos', 'rec_exc', 'att_pct', 'att_eff'];

/**
 * Index action → numéro de set, déduit des rallyes et de l'état du match.
 * Permet de filtrer le bilan par set.
 */
export function indexActionSets(rallies, matchState) {
  const map = new Map();
  (rallies || []).forEach((r, i) => {
    const setNumber = matchState?.states?.[i]?.setNumber || 1;
    for (const a of r.actions || []) {
      const key = a.uid ?? a.id ?? a.action_index;
      if (key != null) map.set(key, setNumber);
    }
  });
  return map;
}

/**
 * Index action → six en jeu (positions P1..P6) au moment du point, sous la forme
 * attendue par le format .dvw : { home_p1..home_p6, visiting_p1..visiting_p6 }.
 * Permet d'exporter la rotation point par point (façon DataVolley).
 */
export function indexActionLineups(rallies, matchState) {
  const map = new Map();
  (rallies || []).forEach((r, i) => {
    const st = matchState?.states?.[i];
    if (!st) return;
    const home = st.homeLineup || {};
    const away = st.awayLineup || {};
    const info = {};
    for (let p = 1; p <= 6; p += 1) {
      info[`home_p${p}`] = home[`P${p}`] ?? '';
      info[`visiting_p${p}`] = away[`P${p}`] ?? '';
    }
    for (const a of r.actions || []) {
      const key = a.uid ?? a.id ?? a.action_index;
      if (key != null) map.set(key, info);
    }
  });
  return map;
}

/** Filtre les actions d'un ou plusieurs sets. */
export function filterActionsBySets(actions, setMap, sets) {
  if (!sets || sets.length === 0) return actions || [];
  const wanted = new Set(sets.map(Number));
  return (actions || []).filter((a) => {
    const key = a.uid ?? a.id ?? a.action_index;
    return wanted.has(Number(setMap.get(key) || 1));
  });
}

/**
 * Bilan complet d'un match (les deux équipes) pour une sélection de sets.
 * @param {Array} actions
 * @param {Object} opts - { homeConfig, awayConfig, sets, setMap, homeName, awayName }
 */
export function computeMatchReport(actions, opts = {}) {
  const { homeConfig, awayConfig, sets, setMap, homeName = 'Domicile', awayName = 'Extérieur' } = opts;
  const list = setMap ? filterActionsBySets(actions, setMap, sets) : (actions || []);
  const homePlayers = computePlayerRows(list, 'home', homeConfig);
  const awayPlayers = computePlayerRows(list, 'away', awayConfig);

  const teamTotals = (players) => {
    const t = emptyPlayerStat(0, '');
    for (const p of players) mergePlayerStat(t, p);
    return t;
  };

  return {
    home: { name: homeName, players: homePlayers, totals: teamTotals(homePlayers) },
    away: { name: awayName, players: awayPlayers, totals: teamTotals(awayPlayers) },
    actionCount: list.length,
  };
}

/** Cellule formatée pour l'affichage (1 décimale pour les %, entier sinon). */
export function formatReportCell(value, key) {
  if (value == null || value === '') return '—';
  if (REPORT_PCT_KEYS.includes(key)) return `${value}%`;
  return String(value);
}

/** Libellé d'en-tête de colonne, prêt à afficher dans un tableau ou un CSV. */
export function reportColumnLabel(col) {
  return `${col.group} ${col.short}`;
}

/**
 * Transforme un bilan en lignes CSV (séparateur `;`, convention Excel FR) :
 * une ligne par joueur, puis une ligne de total par équipe.
 * @param {Object} report - sortie de computeMatchReport()
 * @returns {string[][]}
 */
export function reportToRows(report) {
  const header = ['Equipe', 'Joueur', 'Role', ...REPORT_COLUMNS.map(reportColumnLabel)];
  const rows = [header];

  const push = (sideKey) => {
    const side = report[sideKey];
    const teamName = side?.name || (sideKey === 'home' ? 'Domicile' : 'Extérieur');
    for (const p of side?.players || []) {
      rows.push([
        teamName,
        `n°${String(p.number).padStart(2, '0')}${p.name ? ` ${p.name}` : ''}`,
        roleLabel(p.rosterRole),
        ...REPORT_COLUMNS.map((c) => formatReportCell(c.get(p), c.key)),
      ]);
    }
    if (side?.totals) {
      rows.push([
        teamName,
        'TOTAL',
        '',
        ...REPORT_COLUMNS.map((c) => formatReportCell(c.get(side.totals), c.key)),
      ]);
    }
  };

  push('home');
  push('away');
  return rows;
}

