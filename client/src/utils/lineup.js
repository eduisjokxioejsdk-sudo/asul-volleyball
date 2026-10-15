// ============================================================================
// Fiches équipe / six de départ / libéro.
// - Rôles : passeur, pointu, réceptionneur, central, libéro.
// - Six de départ par set (P1..P6) mémorisé dans les positions DataVolley.
// - Le libéro remplace automatiquement son joueur quand celui-ci est au poste
//   arrière (P1, P5, P6) et sort dès qu'il repasse à l'avant (P2, P3, P4).
// ============================================================================

import { normalizeLineup, COURT_POSITIONS, FRONT_ROW, BACK_ROW } from './rotation.js';

export const PLAYER_ROLES = [
  { id: 'setter', label: 'Passeur', short: 'PAS' },
  { id: 'opposite', label: 'Pointu', short: 'POI' },
  { id: 'outside', label: 'Réceptionneur', short: 'RÉC' },
  { id: 'middle', label: 'Central', short: 'CEN' },
  { id: 'libero', label: 'Libéro', short: 'LIB' },
  { id: 'universal', label: 'Polyvalent', short: 'POL' },
];

export const ROLE_IDS = PLAYER_ROLES.map((r) => r.id);

/** Couleurs de rôle (badges du terrain et du bilan de match). */
export const ROLE_COLORS = {
  setter: '#4c9be8',
  opposite: '#e8a33d',
  outside: '#5fbf87',
  middle: '#b06fd6',
  libero: '#e8734c',
  universal: '#8b8b8b',
};

export function roleColor(roleId) {
  return ROLE_COLORS[roleId] || ROLE_COLORS.universal;
}

export function roleLabel(roleId) {
  const r = PLAYER_ROLES.find((x) => x.id === roleId);
  return r ? r.label : 'Polyvalent';
}

export function roleShort(roleId) {
  const r = PLAYER_ROLES.find((x) => x.id === roleId);
  return r ? r.short : 'POL';
}

/** Fiche équipe normalisée : { number, name, role }[] + libéro. */
export function normalizeTeamConfig(team) {
  if (!team) return { roster: [], libero: null, liberoFor: null };
  const raw = team.players || team.roster || [];
  const roster = (Array.isArray(raw) ? raw : [])
    .map((p) => {
      const declared = p.role;
      const role = ROLE_IDS.includes(declared)
        ? declared
        : (p.is_libero || p.isLibero ? 'libero' : 'universal');
      return {
        number: Number(p.number ?? p.player_number ?? p.num ?? 0) || 0,
        name: p.name || p.player_name || '',
        serve_type: p.serve_type || '',
        role,
      };
    })
    .filter((p) => p.number > 0);
  const libero =
    Number(team.libero ?? team.libero_number ?? (roster.find((p) => p.role === 'libero') || {}).number) || null;
  const liberoFor = Number(team.libero_for ?? team.liberoFor) || null;
  return { roster, libero, liberoFor };
}

export function playerInfo(config, number) {
  const n = Number(number);
  if (!n) return null;
  const found = (config?.roster || []).find((p) => Number(p.number) === n);
  if (found) return found;
  if (config?.libero && Number(config.libero) === n) {
    return { number: n, name: '', role: 'libero' };
  }
  return null;
}

/**
 * Composition réellement sur le terrain, libéro appliqué.
 * @returns {Object} { P1..P6 } de { position, number, name, role, isLibero, replaced }
 */
export function resolveOnCourt(lineup, config) {
  const l = normalizeLineup(lineup);
  const li = config?.libero ? Number(config.libero) : null;
  const liFor = config?.liberoFor ? Number(config.liberoFor) : null;
  const out = {};

  for (const p of COURT_POSITIONS) {
    const n = l[p];
    const info = playerInfo(config, n);
    out[p] = {
      position: p,
      number: n,
      name: info?.name || '',
      role: info?.role || 'universal',
      isLibero: !!(n && li && n === li),
      replaced: null,
      row: BACK_ROW.includes(p) ? 'back' : 'front',
    };
  }

  // Substitution libéro : uniquement au poste arrière.
  if (li && liFor) {
    const backPos = BACK_ROW.find((p) => l[p] === liFor);
    if (backPos) {
      const info = playerInfo(config, li) || { name: '', role: 'libero' };
      const alreadyLibero = COURT_POSITIONS.some((p) => l[p] === li);
      if (!alreadyLibero) {
        out[backPos] = {
          position: backPos,
          number: li,
          name: info.name || '',
          role: 'libero',
          isLibero: true,
          replaced: liFor,
          row: 'back',
        };
      }
    }
  }
  return out;
}

/** Vrai si le libéro est actuellement sur le terrain (poste arrière). */
export function isLiberoOnCourt(lineup, config) {
  const onCourt = resolveOnCourt(lineup, config);
  return COURT_POSITIONS.some((p) => onCourt[p].isLibero);
}

/** Échange libéro en cours : { in, out, position } ou null. */
export function liberoSwap(lineup, config) {
  const onCourt = resolveOnCourt(lineup, config);
  const pos = COURT_POSITIONS.find((p) => onCourt[p].isLibero);
  if (!pos) return null;
  return { in: onCourt[pos].number, out: onCourt[pos].replaced, position: pos };
}

/**
 * Code de service pré-rempli pour l'équipe qui doit servir.
 * Le serveur est toujours le joueur du poste P1 (arrière droit).
 * @returns {string} ex. 'a04S' (l'évaluation et le type restent à saisir)
 */
export function serverPrefill(matchState) {
  const teamId = matchState?.server === 'team2' ? 'team2' : 'team1';
  const lineup = teamId === 'team1' ? matchState?.homeLineup : matchState?.awayLineup;
  const teamKey = teamId === 'team1' ? '*' : 'a';
  const n = Number(lineup?.P1);
  if (!Number.isInteger(n) || n <= 0) return teamKey;
  return `${teamKey}${String(n).padStart(2, '0')}S`;
}

/** Code de service pré-rempli avec le type habituel du joueur, si connu. */
export function serverPrefillWithType(matchState, config) {
  const base = serverPrefill(matchState);
  const n = Number(base.slice(1));
  const info = playerInfo(config, n);
  const type = info?.serve_type || '';
  return `${base}${type}`;
}

/**
 * Substitution manuelle : sort `outNumber`, entre `inNumber`.
 * (Implémentée dans rotation.js, qui l'applique en rejouant le match.)
 */
export { substitute } from './rotation.js';

/** Six de départ automatique : les 6 premiers joueurs de champ de la fiche. */
export function autoLineup(config, startPos = 'P1') {
  const roster = (config?.roster || []).filter((p) => p.role !== 'libero').slice(0, 6);
  const out = { P1: null, P2: null, P3: null, P4: null, P5: null, P6: null };
  const order = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const start = Math.max(0, order.indexOf(startPos));
  roster.forEach((p, i) => {
    out[order[(start + i) % 6]] = Number(p.number);
  });
  return out;
}

export function rosterByRole(config) {
  const groups = {};
  for (const r of PLAYER_ROLES) groups[r.id] = [];
  for (const p of config?.roster || []) {
    const role = ROLE_IDS.includes(p.role) ? p.role : 'universal';
    groups[role].push(p);
  }
  return groups;
}

/**
 * Contrôle d'un six : 6 joueurs, libéro uniquement au poste arrière.
 * @returns {{valid:boolean, issues:string[]}}
 */
export function validateLineup(lineup, config) {
  const l = normalizeLineup(lineup);
  const issues = [];
  const numbers = COURT_POSITIONS.map((p) => l[p]);
  if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) issues.push('incomplete');
  const filled = numbers.filter((n) => Number.isInteger(n) && n > 0);
  if (new Set(filled).size !== filled.length) issues.push('duplicate');

  const li = config?.libero ? Number(config.libero) : null;
  if (li && filled.includes(li)) {
    const pos = COURT_POSITIONS.find((p) => l[p] === li);
    if (FRONT_ROW.includes(pos)) issues.push('libero_front_row');
  }
  if (li && config?.liberoFor && filled.includes(Number(config.liberoFor)) && filled.includes(li)) {
    issues.push('libero_and_replaced');
  }
  return { valid: issues.length === 0, issues };
}

/** Libellés des contrôles de six. */
export const LINEUP_ISSUE_LABELS = {
  incomplete: 'le six doit contenir 6 joueurs',
  duplicate: 'un même numéro apparaît deux fois',
  libero_front_row: 'le libéro ne peut pas occuper un poste avant (P2, P3, P4)',
  libero_and_replaced: 'le libéro et le joueur qu’il remplace sont tous deux sur le terrain',
};

/**
 * Forme enregistrée d'un six dans `set_setups` :
 *   { start: { P1..P6 }, roster: [{ number, name, role }], libero, liberoFor }
 * On accepte aussi un six simple { P1..P6 } (anciennes données).
 */
export function parseSavedLineup(saved) {
  if (!saved) return { lineup: null, config: { roster: [], libero: null, liberoFor: null } };
  if (saved.start) {
    return {
      lineup: saved.start,
      config: normalizeTeamConfig({
        players: saved.roster || [],
        libero: saved.libero,
        libero_for: saved.liberoFor,
      }),
    };
  }
  return { lineup: saved, config: { roster: [], libero: null, liberoFor: null } };
}

export function serializeSavedLineup(lineup, config) {
  return {
    start: normalizeLineup(lineup),
    roster: (config?.roster || []).map((p) => ({
      number: Number(p.number) || 0,
      name: p.name || '',
      role: p.role || 'universal',
    })),
    libero: config?.libero ? Number(config.libero) : null,
    liberoFor: config?.liberoFor ? Number(config.liberoFor) : null,
  };
}

/** Fiche équipe vide. */
export function emptyTeamConfig() {
  return { roster: [], libero: null, liberoFor: null };
}

