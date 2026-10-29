// ============================================================================
// Fiches de Plan de Jeu Tactique (Game Plan & Tendances Joueur DataVolley 4 Pro).
// Analyse des cônes d'attaque (ligne vs diagonale), des tendances de service
// et des profils sous pression (Money-Time).
// ============================================================================

import { attackEfficiency, attackSuccessPct, serveEfficiency } from './scouting.js';

/**
 * Catégorise une direction d'attaque depuis le poste 4 ou 2 :
 * 'line' (le long de la ligne), 'cross' (diagonale), 'cut' (diagonale courte), 'middle' (centre).
 */
export function classifyAttackDirection(startZone, endZone) {
  const sz = String(startZone || '');
  const ez = String(endZone || '');
  if (!sz || !ez) return 'unknown';

  if (sz === '4') {
    if (ez === '1') return 'line';
    if (ez === '5') return 'cross';
    if (ez === '6' || ez === '8') return 'middle';
    if (ez === '4' || ez === '7') return 'cut';
  } else if (sz === '2') {
    if (ez === '5') return 'line';
    if (ez === '1') return 'cross';
    if (ez === '6' || ez === '8') return 'middle';
    if (ez === '2' || ez === '9') return 'cut';
  } else if (sz === '3') {
    if (ez === '1') return 'cross-right';
    if (ez === '5') return 'cross-left';
    if (ez === '6') return 'deep-center';
  }
  return 'other';
}

/**
 * Calcule la fiche de plan de jeu d'un joueur à partir de ses agrégats statistiques.
 * @param {Object} player - élément de report.home.players ou report.away.players
 * @param {Object} [options]
 * @returns {Object} Fiche tactique prête à l'affichage ou à l'export
 */
export function computePlayerGamePlan(player, options = {}) {
  if (!player) return null;
  const attackSkill = player.skills?.attack || {};
  const serveSkill = player.skills?.serve || {};
  const recSkill = player.skills?.reception || {};

  // 1. Analyse du Service
  const serveTotal = serveSkill.total || 0;
  const serveZones = Object.entries(serveSkill.byZone || {})
    .map(([zone, count]) => ({
      zone,
      count,
      pct: serveTotal ? Math.round((count / serveTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const serveTypes = Object.entries(serveSkill.byType || {})
    .map(([type, count]) => ({
      type,
      count,
      pct: serveTotal ? Math.round((count / serveTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const serveAnalysis = {
    total: serveTotal,
    points: serveSkill.points || 0,
    errors: serveSkill.errors || 0,
    efficiency: serveEfficiency(serveSkill),
    preferredZones: serveZones,
    preferredTypes: serveTypes,
  };

  // 2. Cônes d'attaque par poste de départ (Z4, Z2, Z3, Pipe)
  const attackTotal = attackSkill.total || 0;
  const directions = attackSkill.byDirection || {};
  const cones = {
    P4: { line: 0, cross: 0, middle: 0, cut: 0, total: 0 },
    P2: { line: 0, cross: 0, middle: 0, cut: 0, total: 0 },
    P3: { crossRight: 0, crossLeft: 0, center: 0, total: 0 },
    Pipe: { total: 0 },
  };

  for (const [dirKey, stat] of Object.entries(directions)) {
    if (dirKey.length < 2) continue;
    const from = dirKey[0];
    const to = dirKey[1];
    const cnt = stat.total || 0;

    if (from === '4') {
      cones.P4.total += cnt;
      const cat = classifyAttackDirection('4', to);
      if (cat === 'line') cones.P4.line += cnt;
      else if (cat === 'cross') cones.P4.cross += cnt;
      else if (cat === 'middle') cones.P4.middle += cnt;
      else if (cat === 'cut') cones.P4.cut += cnt;
    } else if (from === '2') {
      cones.P2.total += cnt;
      const cat = classifyAttackDirection('2', to);
      if (cat === 'line') cones.P2.line += cnt;
      else if (cat === 'cross') cones.P2.cross += cnt;
      else if (cat === 'middle') cones.P2.middle += cnt;
      else if (cat === 'cut') cones.P2.cut += cnt;
    } else if (from === '3') {
      cones.P3.total += cnt;
      if (to === '1') cones.P3.crossRight += cnt;
      else if (to === '5') cones.P3.crossLeft += cnt;
      else cones.P3.center += cnt;
    } else if (from === '6' || from === '8') {
      cones.Pipe.total += cnt;
    }
  }

  // Tendance dominante pour le poste 4
  let p4Advice = 'Répartition équilibrée';
  if (cones.P4.total >= 3) {
    const crossPct = Math.round((cones.P4.cross / cones.P4.total) * 100);
    const linePct = Math.round((cones.P4.line / cones.P4.total) * 100);
    if (crossPct >= 60) p4Advice = `Forte tendance Diagonale (${crossPct}% en zone 5). Bloquer la diagonale.`;
    else if (linePct >= 50) p4Advice = `Forte tendance Ligne (${linePct}% en zone 1). Fermer la ligne.`;
  }

  // Tendance dominante pour le poste 2
  let p2Advice = 'Répartition équilibrée';
  if (cones.P2.total >= 3) {
    const crossPct = Math.round((cones.P2.cross / cones.P2.total) * 100);
    const linePct = Math.round((cones.P2.line / cones.P2.total) * 100);
    if (crossPct >= 60) p2Advice = `Forte tendance Diagonale (${crossPct}% en zone 1). Bloquer la diagonale.`;
    else if (linePct >= 50) p2Advice = `Forte tendance Ligne (${linePct}% en zone 5). Fermer la ligne.`;
  }

  const attackAnalysis = {
    total: attackTotal,
    points: attackSkill.points || 0,
    errors: attackSkill.errors || 0,
    blocked: attackSkill.blocked || 0,
    killRate: attackSuccessPct(attackSkill),
    efficiency: attackEfficiency(attackSkill),
    cones,
    tacticalAdvice: {
      P4: p4Advice,
      P2: p2Advice,
    },
  };

  // 3. Synthèse de la fiche joueur
  return {
    number: player.number,
    name: player.name || `Joueur ${player.number}`,
    role: player.role || 'universal',
    serve: serveAnalysis,
    attack: attackAnalysis,
  };
}

/**
 * Formate un rapport de plan de jeu tactique complet pour toute l'équipe adverse.
 * @param {Object} teamSide - home ou away issu de computeScouting
 * @returns {Array<Object>} Fiches tactiques pour chaque joueur de champ
 */
export function computeTeamGamePlan(teamSide) {
  if (!teamSide?.players) return [];
  return teamSide.players
    .filter((p) => (p.skills?.attack?.total || 0) > 0 || (p.skills?.serve?.total || 0) > 0)
    .map((p) => computePlayerGamePlan(p));
}
