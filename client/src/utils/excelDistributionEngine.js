// ============================================================================
// Moteur de calcul et d'extraction du mode « Distribution » (modèle Excel
// DISTRIBUTION_PASSEUR_.xlsx : saisie, PAUL, MARCUS, J1-3, J4-6, projet).
// ============================================================================

import JSZip from 'jszip';
import { computeMatchState, positionOfPlayer, normalizeLineup } from './rotation.js';
import { sideOfTeamInMatch, normalizeAction } from './multiMatch.js';
import { attackComboInfo, groupActionsIntoRallies, decomposeCode } from './datavolley.js';

/** Ordre officiel des 6 rotations dans le rapport Excel (gauche -> droite). */
export const EXCEL_ROTATION_ORDER = [1, 6, 5, 4, 3, 2];

/** Les 8 boîtes d'attaque d'un demi-terrain de distribution. */
export const EXCEL_BACK_BOXES = ['EN 1', 'PIPE', 'autres'];
export const EXCEL_FRONT_BOXES = ['EN 2', 'FIX ARR', 'FIX AV', 'DECA', 'EN 4'];
export const EXCEL_ALL_BOXES = [...EXCEL_BACK_BOXES, ...EXCEL_FRONT_BOXES];

/** Les 4 bases offensives (annonce du central) dans l'ordre d'affichage. */
export const EXCEL_BASES = [
  { code: '1', key: 'Base 1', title: 'annonce du central en fix avant', watermark: 'Base 1', frontBoxes: ['EN 2', 'FIX AV', 'EN 4'], centralBox: 'FIX AV' },
  { code: '2', key: 'Base 2', title: 'annonce du central en fix arrière', watermark: 'Base 2', frontBoxes: ['EN 2', 'FIX ARR', 'EN 4'], centralBox: 'FIX ARR' },
  { code: '7', key: 'Base 7', title: 'annonce du central en déca', watermark: 'Base 7', frontBoxes: ['EN 2', 'DECA', 'EN 4'], centralBox: 'DECA' },
  { code: '0', key: 'Base 0', title: 'pas de fixation possible', watermark: 'Base 0', frontBoxes: ['EN 2', 'EN 4'], centralBox: null },
];

/** Les 3 couloirs de réception (Section 4 du rapport Excel). */
export const EXCEL_RECEPTION_GROUPS = [
  {
    id: 'LEFT_192',
    title: 'Distribution quand la réception est à gauche du terrain (1 9 2)',
    shortTitle: 'Réception à gauche (1 9 2)',
    zones: ['1', '9', '2'],
    stripPosition: 'left',
  },
  {
    id: 'CENTER_683',
    title: 'Distribution quand la réception est faite au centre 6 8 3',
    shortTitle: 'Réception au centre (6 8 3)',
    zones: ['6', '8', '3'],
    stripPosition: 'center',
  },
  {
    id: 'RIGHT_574',
    title: 'Distribution quand la réception est faite depuis la droite 5 7 4',
    shortTitle: 'Réception à droite (5 7 4)',
    zones: ['5', '7', '4'],
    stripPosition: 'right',
  },
];

/** Les 13 zones / sous-zones de passe classées par situation (Sections 5, 6, 7 et carte Saisie). */
export const EXCEL_PASS_ZONES_MINI = [
  { key: '1', title: 'SITUATION MINI Zone de passe en 1', matchZones: ['1'], setterPos: { x: 18, y: 18 } },
  { key: '6', title: 'SITUATION MINI Zone de passe en 6', matchZones: ['6'], setterPos: { x: 50, y: 18 } },
  { key: '5', title: 'SITUATION MINI Zone de passe en 5', matchZones: ['5'], setterPos: { x: 82, y: 18 } },
];

export const EXCEL_PASS_ZONES_MOYENNE = [
  { key: '9', title: 'SITUATION MOYENNE Zone de passe en 9', matchZones: ['9', '9A', '9C'], setterPos: { x: 10, y: 46 } },
  { key: '8A', title: 'SITUATION MOYENNE Zone de passe en 8 A', matchZones: ['8A'], setterPos: { x: 32, y: 46 } },
  { key: '8', title: 'SITUATION MOYENNE Zone de passe en 8', matchZones: ['8', '8B', '8D'], setterPos: { x: 50, y: 46 } },
  { key: '8C', title: 'SITUATION MOYENNE Zone de passe en 8 C', matchZones: ['8C'], setterPos: { x: 68, y: 46 } },
  { key: '7', title: 'SITUATION MOYENNE Zone de passe en 7', matchZones: ['7', '7A', '7C', '7B', '7D'], setterPos: { x: 88, y: 46 } },
];

export const EXCEL_PASS_ZONES_BONNE = [
  { key: '2', title: 'BONNE SITUATION Zone de passe en 2', matchZones: ['2', '2A', '2C'], setterPos: { x: 12, y: 74 } },
  { key: '3A', title: 'BONNE SITUATION Zone de passe en 3A', matchZones: ['3A'], setterPos: { x: 32, y: 74 } },
  { key: '3', title: 'BONNE SITUATION Zone de passe en 3', matchZones: ['3', '3B', '3D'], setterPos: { x: 50, y: 74 } },
  { key: '3C', title: 'BONNE SITUATION Zone de passe en 3C', matchZones: ['3C'], setterPos: { x: 68, y: 74 } },
  { key: '4', title: 'BONNE SITUATION Zone de passe en 4', matchZones: ['4', '4A', '4C'], setterPos: { x: 88, y: 74 } },
];

export const EXCEL_ALL_13_PASS_ZONES = [
  ...EXCEL_PASS_ZONES_MINI,
  ...EXCEL_PASS_ZONES_MOYENNE,
  ...EXCEL_PASS_ZONES_BONNE,
];

// ----------------------------------------------------------------------------
// Normalisation des valeurs brutes (Excel ou DataVolley)
// ----------------------------------------------------------------------------

export function cleanVal(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (/^-?\d+\.0$/.test(s)) return s.slice(0, -2);
  return s.toUpperCase();
}

/** Normalise la base offensive ('1', '2', '7', '0'). Dans l'Excel, '3' est agrégé dans Base 1. */
export function normalizeBaseOff(rawBase) {
  const b = cleanVal(rawBase);
  if (b === '1' || b === '3' || b === 'B1' || b === 'K1' || b === 'K3') return '1';
  if (b === '2' || b === 'B2' || b === 'K2') return '2';
  if (b === '7' || b === 'B7' || b === 'K7') return '7';
  if (b === '0' || b === 'B0' || b === 'K0' || b === 'KE') return '0';
  return '0';
}

/** Normalise la sous-zone de passe parmi les 13 clés officielles. */
export function normalizePassZone13(rawZoneP) {
  const z = cleanVal(rawZoneP).replace(/\s+/g, '');
  if (!z) return '';
  if (['1', '6', '5', '9', '8A', '8', '8C', '7', '2', '3A', '3', '3C', '4'].includes(z)) {
    return z;
  }
  if (z.startsWith('7')) return '7';
  if (z.startsWith('9')) return '9';
  if (z.startsWith('2')) return '2';
  if (z.startsWith('4')) return '4';
  if (z === '8B' || z === '8D') return '8';
  if (z === '3B' || z === '3D') return '3';
  return z;
}

/**
 * Convertit un code `DISTRIB P` Excel ('1', '1C', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'PM')
 * ou un libellé de boîte vers l'une des 8 boîtes du demi-terrain.
 * @param {string} rawDistrib
 * @param {string|null} baseContext Si '1', '2' ou '7' (terrains Base 1/2/7 de la Section 3),
 *                                  regroupe toute attaque centrale dans la boîte centrale de cette base.
 */
export function mapDistribToCourtBox(rawDistrib, baseContext = null) {
  const d = cleanVal(rawDistrib);
  let box = null;
  if (d === '8' || d === 'EN 1' || d === 'EN1') box = 'EN 1';
  else if (d === '10' || d === 'PIPE') box = 'PIPE';
  else if (d === 'PM' || d === '4' || d === 'AUTRES' || d === 'DIV') box = 'autres';
  else if (d === '6' || d === 'EN 2' || d === 'EN2') box = 'EN 2';
  else if (d === '2' || d === 'FIX ARR') box = 'FIX ARR';
  else if (d === '1' || d === '1C' || d === '3' || d === 'FIX AV') box = 'FIX AV';
  else if (d === '7' || d === 'DECA') box = 'DECA';
  else if (d === '5' || d === '9' || d === 'EN 4' || d === 'EN4') box = 'EN 4';
  else return null;

  if (baseContext && (box === 'FIX AV' || box === 'FIX ARR' || box === 'DECA')) {
    if (baseContext === '1') return 'FIX AV';
    if (baseContext === '2') return 'FIX ARR';
    if (baseContext === '7') return 'DECA';
  }
  return box;
}

/**
 * Convertit un code `DISTRIB P` vers l'une des 5 colonnes du tableau `Organisation offensive` :
 * 'OPPOSITE' (affiché '2' en ZP1/ZP6/ZP5 et '1' en ZP4/ZP3/ZP2), 'C', '4', 'PIPE', 'DIV'.
 */
export function mapDistribToOrgaColumn(rawDistrib) {
  const box = mapDistribToCourtBox(rawDistrib, null);
  if (!box) return null;
  if (box === 'EN 2' || box === 'EN 1') return 'OPPOSITE';
  if (box === 'FIX AV' || box === 'FIX ARR' || box === 'DECA') return 'C';
  if (box === 'EN 4') return '4';
  if (box === 'PIPE') return 'PIPE';
  if (box === 'autres') return 'DIV';
  return null;
}

export function isWinningAttack(rawResAtt) {
  return cleanVal(rawResAtt) === '#';
}

// ----------------------------------------------------------------------------
// Calcul mathématique d'un demi-terrain de distribution (8 boîtes + bandeau)
// ----------------------------------------------------------------------------

export function buildDistributionCourtStats(possessions, options = {}) {
  const {
    id = 'court',
    title = 'Distribution en',
    watermark = '',
    baseContext = null,
    frontBoxes = EXCEL_FRONT_BOXES,
    stripPosition = null,
    setterPos = null,
  } = options;

  const boxes = {};
  for (const key of EXCEL_ALL_BOXES) {
    boxes[key] = {
      key,
      q: 0,
      disPct: 0,
      kills: 0,
      effPct: 0,
      actions: [],
      killActions: [],
    };
  }

  const validPossessions = [];
  let totalKills = 0;

  for (const p of possessions) {
    const boxKey = mapDistribToCourtBox(p.distribCode || p.distribBox, baseContext);
    if (!boxKey || !boxes[boxKey]) continue;
    validPossessions.push(p);
    boxes[boxKey].q += 1;
    boxes[boxKey].actions.push(p);
    if (isWinningAttack(p.attackResult)) {
      boxes[boxKey].kills += 1;
      boxes[boxKey].killActions.push(p);
      totalKills += 1;
    }
  }

  const totalActions = validPossessions.length;

  for (const key of EXCEL_ALL_BOXES) {
    const b = boxes[key];
    b.disPct = totalActions > 0 ? (b.q / totalActions) * 100 : 0;
    b.effPct = b.q > 0 ? (b.kills / b.q) * 100 : 0;
  }

  const totalEffPct = totalActions > 0 ? (totalKills / totalActions) * 100 : 0;

  const stats = {
    id,
    title,
    watermark,
    frontBoxes,
    stripPosition,
    setterPos,
    boxes,
    totalActions,
    totalKills,
    totalEffPct,
    possessions: validPossessions,
    autoNote: '',
  };

  stats.autoNote = generateAutoTacticalNote(stats, { id, watermark });
  return stats;
}

// ----------------------------------------------------------------------------
// Calcul mathématique d'un demi-terrain « Organisation offensive » (Section 2)
// ----------------------------------------------------------------------------

export function buildOffensiveOrgCourtStats(possessions, rotation) {
  const rotNum = Number(rotation);
  const isFrontRowSetter = rotNum === 4 || rotNum === 3 || rotNum === 2;
  const firstColLabel = isFrontRowSetter ? '1' : '2';
  const colKeys = ['OPPOSITE', 'C', '4', 'PIPE', 'DIV'];
  const colLabels = [firstColLabel, 'C', '4', 'PIPE', 'DIV'];

  const baseKeys = ['0', '2', '1', '7'];
  const bases = {};
  for (const bKey of baseKeys) {
    const cols = {};
    for (const cKey of colKeys) {
      cols[cKey] = { q: 0, kills: 0, actions: [], killActions: [] };
    }
    bases[bKey] = {
      baseCode: bKey,
      label: `BASE ${bKey}`,
      q: 0,
      pctOfRotation: 0,
      kills: 0,
      killPct: 0,
      cols,
      actions: [],
    };
  }

  let totalActions = 0;
  let totalKills = 0;

  for (const p of possessions) {
    const bKey = normalizeBaseOff(p.baseOff);
    const cKey = mapDistribToOrgaColumn(p.distribCode || p.distribBox);
    if (!bases[bKey] || !cKey) continue;

    totalActions += 1;
    const baseObj = bases[bKey];
    baseObj.q += 1;
    baseObj.actions.push(p);
    baseObj.cols[cKey].q += 1;
    baseObj.cols[cKey].actions.push(p);

    if (isWinningAttack(p.attackResult)) {
      totalKills += 1;
      baseObj.kills += 1;
      baseObj.cols[cKey].kills += 1;
      baseObj.cols[cKey].killActions.push(p);
    }
  }

  for (const bKey of baseKeys) {
    const baseObj = bases[bKey];
    baseObj.pctOfRotation = totalActions > 0 ? (baseObj.q / totalActions) * 100 : 0;
    baseObj.killPct = baseObj.q > 0 ? (baseObj.kills / baseObj.q) * 100 : 0;
  }

  const totalEffPct = totalActions > 0 ? (totalKills / totalActions) * 100 : 0;

  const stats = {
    id: `orga_ZP${rotNum}`,
    rotation: rotNum,
    title: 'Organisation offensive',
    watermark: `ZP${rotNum}`,
    isFrontRowSetter,
    firstColLabel,
    colKeys,
    colLabels,
    bases,
    totalActions,
    totalKills,
    totalEffPct,
    autoNote: '',
  };

  stats.autoNote = generateAutoOrgaNote(stats);
  return stats;
}

// ----------------------------------------------------------------------------
// Génération automatique des bulles tactiques (style identique à l'Excel)
// ----------------------------------------------------------------------------

export function generateAutoTacticalNote(courtStats, { id = '', watermark = '' } = {}) {
  const { totalActions, boxes } = courtStats;
  if (!totalActions) return 'Aucune action';

  const q2 = boxes['EN 2'].q + boxes['EN 1'].q;
  const qC = boxes['FIX AV'].q + boxes['FIX ARR'].q + boxes['DECA'].q;
  const q4 = boxes['EN 4'].q;
  const qPipe = boxes['PIPE'].q;

  const pct2 = Math.round((q2 / totalActions) * 100);
  const pctC = Math.round((qC / totalActions) * 100);
  const pct4 = Math.round((q4 / totalActions) * 100);
  const pctCPipe = Math.round(((qC + qPipe) / totalActions) * 100);

  if (totalActions <= 6) {
    if (pct4 >= 65) return `peu d'actions\n${pct4}% jeu en 4`;
    if (pct2 >= 65) return `peu d'actions\n${pct2}% jeu en 2/1`;
    return `peu d'actions\njeu équilibré`;
  }

  if (watermark === 'Base 1') {
    return `tendance fix+pipe ${pctCPipe}% et poste 4 (${pct4}%)`;
  }
  if (watermark === 'Base 2') {
    return `Appelle la fix arrière (${pctC}%) ou renverse en 4 (${pct4}%)`;
  }
  if (watermark === 'Base 7') {
    return pct2 >= pct4
      ? `Appelle la déca pour renverser en 2 (${pct2}%)`
      : `Appelle la déca pour jouer en 4 (${pct4}%)`;
  }
  if (watermark === 'Base 0') {
    return Math.abs(pct2 - pct4) <= 15 ? 'équilibré ailes 2/4' : pct4 > pct2 ? `Priorité poste 4 (${pct4}%)` : `Priorité poste 2/1 (${pct2}%)`;
  }
  if (watermark === 'GLOBAL') {
    return `Poste 4: ${pct4}% | Poste 2/1: ${pct2}%\nCentre+Pipe: ${pctCPipe}%`;
  }

  if (id.startsWith('rec_')) {
    if (pct4 >= 40 && pct4 >= pct2) return `tendance ${pct4}% à jouer devant en 4`;
    if (pct2 >= 35) return `légère tendance ${pct2}% à jouer en 2 et 1`;
    return `Distribution équilibrée (4: ${pct4}%, 2/1: ${pct2}%)`;
  }

  if (pct2 >= 45 && pct2 >= pct4 + 12) {
    return pctC >= 22
      ? `Option C et 2\n${pct2}% en poste 2/1\n${pctC}% au centre`
      : `Priorité poste 2\n${pct2}% en poste 2/1`;
  }
  if (pctCPipe >= 45) {
    return `Option C et 4\n${pctCPipe}% au centre/pipe`;
  }
  if (pct4 >= 42) {
    return `Option 4 et C\n${pct4}% en poste 4\n${pctC}% au centre`;
  }
  return `Option C et ailes\n${pct2}% en 2/1 | ${pct4}% en 4\n${pctC}% au centre`;
}

export function generateAutoOrgaNote(orgaStats) {
  const { totalActions, bases, firstColLabel } = orgaStats;
  if (!totalActions) return 'Aucune action';

  const b1 = bases['1'];
  const b2 = bases['2'];
  const b7 = bases['7'];

  // Cherche la base dominante
  const sorted = [b1, b2, b7].sort((a, b) => b.q - a.q);
  const top = sorted[0];
  if (!top || top.q === 0) return 'Jeu hors système (Base 0)';

  const cPct = Math.round((top.cols.C.q / top.q) * 100);
  const pipePct = Math.round(((top.cols.C.q + top.cols.PIPE.q) / top.q) * 100);
  const oppPct = Math.round((top.cols.OPPOSITE.q / top.q) * 100);
  const fourPct = Math.round((top.cols['4'].q / top.q) * 100);

  if (top.baseCode === '7' && oppPct >= 45) {
    return `Base 7 = renverse en ${firstColLabel} (${oppPct}%), peu de C`;
  }
  if (top.baseCode === '1') {
    if (pipePct >= 40) {
      return `Base 1 = fix+pipe à ${pipePct}% ou poste ${fourPct >= oppPct ? '4' : firstColLabel}`;
    }
    return `Base 1 (${Math.round(top.pctOfRotation)}%) = ${oppPct >= fourPct ? `poste ${firstColLabel}` : 'poste 4'} ou fix (${cPct}%)`;
  }
  return `${top.label} (${Math.round(top.pctOfRotation)}%) dominante`;
}

// ----------------------------------------------------------------------------
// Calcul complet des 8 Sections du Rapport Excel
// ----------------------------------------------------------------------------

export function computeExcelDistributionReport(allPossessions, filters = {}) {
  const {
    setterFilter = 'ALL', // 'ALL' ou numéro de passeur ex. '6', '3', 'NP'
    matchFilter = null, // Set ou Array d'identifiants/noms de matchs
    phaseFilter = 'ALL', // 'ALL' (S+F+T+C), 'K1' (S+F+T), 'K2' (C)
    rotationFilter = 'ALL', // 'ALL' ou 1..6
  } = filters;

  const matchSet = matchFilter
    ? new Set(Array.isArray(matchFilter) ? matchFilter.map((m) => cleanVal(m)) : [cleanVal(matchFilter)])
    : null;

  const filtered = allPossessions.filter((p) => {
    // Doit avoir une boîte de distribution valide (comme dans l'Excel où les lignes sans DISTRIB P valide ne sont pas des attaques)
    if (!mapDistribToCourtBox(p.distribCode || p.distribBox, null)) return false;

    if (setterFilter && setterFilter !== 'ALL') {
      if (cleanVal(p.setterNumber) !== cleanVal(setterFilter)) return false;
    }
    if (matchSet && matchSet.size > 0) {
      const mKey = cleanVal(p.matchId || p.matchLabel);
      const mLabel = cleanVal(p.matchLabel);
      if (!matchSet.has(mKey) && !matchSet.has(mLabel)) return false;
    }
    if (phaseFilter === 'K1') {
      if (cleanVal(p.serviceType) === 'C') return false;
    } else if (phaseFilter === 'K2') {
      if (cleanVal(p.serviceType) !== 'C') return false;
    }
    if (rotationFilter && rotationFilter !== 'ALL') {
      if (Number(p.rotation) !== Number(rotationFilter)) return false;
    }
    return true;
  });

  // Section 1 : Distribution par rotation (ZP1, ZP6, ZP5, ZP4, ZP3, ZP2)
  const byRotation = EXCEL_ROTATION_ORDER.map((rot) => {
    const rotPoss = filtered.filter((p) => Number(p.rotation) === rot);
    return buildDistributionCourtStats(rotPoss, {
      id: `rot_ZP${rot}`,
      title: 'Distribution en',
      watermark: `ZP${rot}`,
    });
  });

  // Section 2 : Organisation offensive par rotation (ZP1, ZP6, ZP5, ZP4, ZP3, ZP2)
  const offensiveOrg = EXCEL_ROTATION_ORDER.map((rot) => {
    const rotPoss = filtered.filter((p) => Number(p.rotation) === rot);
    return buildOffensiveOrgCourtStats(rotPoss, rot);
  });

  // Section 3 : Distribution globale + Base 1, Base 2, Base 7, Base 0
  const globalCourt = buildDistributionCourtStats(filtered, {
    id: 'global',
    title: 'Distribution globale',
    watermark: 'GLOBAL',
  });

  const baseCourts = EXCEL_BASES.map((b) => {
    const basePoss = filtered.filter((p) => normalizeBaseOff(p.baseOff) === b.code);
    return buildDistributionCourtStats(basePoss, {
      id: `base_${b.code}`,
      title: b.title,
      watermark: b.watermark,
      baseContext: b.code,
      frontBoxes: b.frontBoxes,
    });
  });

  // Section 4 : Distribution selon la zone de réception (Gauche 1-9-2, Centre 6-8-3, Droite 5-7-4)
  const byReceptionGroup = EXCEL_RECEPTION_GROUPS.map((grp) => {
    const zoneSet = new Set(grp.zones);
    const recPoss = filtered.filter((p) => zoneSet.has(cleanVal(p.receptionZone)));
    return buildDistributionCourtStats(recPoss, {
      id: `rec_${grp.id}`,
      title: grp.title,
      watermark: '',
      stripPosition: grp.stripPosition,
    });
  });

  // Sections 5, 6, 7 : Les 13 zones de passe (Situation Mini, Situation Moyenne, Bonne Situation)
  const buildPassZoneSection = (zoneDefs) =>
    zoneDefs.map((zd) => {
      const zSet = new Set(zd.matchZones.map((z) => z.toUpperCase()));
      const zPoss = filtered.filter((p) => {
        const rawZ = cleanVal(p.passZone).replace(/\s+/g, '');
        const normZ = normalizePassZone13(rawZ);
        return zSet.has(rawZ) || zSet.has(normZ);
      });
      return buildDistributionCourtStats(zPoss, {
        id: `pz_${zd.key}`,
        title: zd.title,
        watermark: '',
        setterPos: zd.setterPos,
      });
    });

  const passZonesMini = buildPassZoneSection(EXCEL_PASS_ZONES_MINI);
  const passZonesMoyenne = buildPassZoneSection(EXCEL_PASS_ZONES_MOYENNE);
  const passZonesBonne = buildPassZoneSection(EXCEL_PASS_ZONES_BONNE);

  // Section 8 : Synthèse type feuille « saisie » (Carte 13 zones de passe + compteurs & graphiques)
  const saisieSummary = computeSaisieSummary(filtered, allPossessions);

  return {
    filteredPossessions: filtered,
    allPossessionsCount: allPossessions.length,
    byRotation,
    offensiveOrg,
    globalCourt,
    baseCourts,
    byReceptionGroup,
    passZonesMini,
    passZonesMoyenne,
    passZonesBonne,
    saisieSummary,
  };
}

// ----------------------------------------------------------------------------
// Synthèse de la feuille « saisie » (Carte 13 zones + 6 graphiques/tableaux)
// ----------------------------------------------------------------------------

export function computeSaisieSummary(filteredPossessions, allTeamPossessions = null) {
  const sourceForSetters = allTeamPossessions || filteredPossessions;

  // Carte des 13 zones de passe
  const passZoneCounts = {};
  for (const zd of EXCEL_ALL_13_PASS_ZONES) {
    passZoneCounts[zd.key] = { key: zd.key, q: 0, pct: 0, kills: 0, actions: [] };
  }
  let totalWithPassZone = 0;
  let totalKillsWithPassZone = 0;

  for (const p of filteredPossessions) {
    const pz = normalizePassZone13(p.passZone);
    if (pz && passZoneCounts[pz]) {
      passZoneCounts[pz].q += 1;
      passZoneCounts[pz].actions.push(p);
      totalWithPassZone += 1;
      if (isWinningAttack(p.attackResult)) {
        passZoneCounts[pz].kills += 1;
        totalKillsWithPassZone += 1;
      }
    }
  }
  for (const zd of EXCEL_ALL_13_PASS_ZONES) {
    const item = passZoneCounts[zd.key];
    item.pct = totalWithPassZone > 0 ? (item.q / totalWithPassZone) * 100 : 0;
  }

  // 1. Temps de jeu des passeurs (calculé sur l'ensemble des possessions de l'équipe sélectionnée)
  const setterCountsMap = {};
  let totalSetterActions = 0;
  for (const p of sourceForSetters) {
    if (!mapDistribToCourtBox(p.distribCode || p.distribBox, null)) continue;
    const sNum = cleanVal(p.setterNumber) || 'NP';
    setterCountsMap[sNum] = (setterCountsMap[sNum] || 0) + 1;
    totalSetterActions += 1;
  }
  const setterBreakdown = Object.entries(setterCountsMap)
    .map(([setter, count]) => ({
      setter,
      label: setter === 'NP' ? 'NP' : `P#${setter}`,
      count,
      pct: totalSetterActions > 0 ? (count / totalSetterActions) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 2. Orga offensive (B1, B2, B7, B0)
  const baseCounts = { '1': 0, '2': 0, '7': 0, '0': 0 };
  for (const p of filteredPossessions) {
    const b = normalizeBaseOff(p.baseOff);
    baseCounts[b] = (baseCounts[b] || 0) + 1;
  }
  const totalFiltered = filteredPossessions.length;
  const orgaBreakdown = [
    { key: 'B1', code: '1', label: 'B1 (Fix Av)', count: baseCounts['1'], pct: totalFiltered > 0 ? (baseCounts['1'] / totalFiltered) * 100 : 0, color: '#3b82f6' },
    { key: 'B2', code: '2', label: 'B2 (Fix Arr)', count: baseCounts['2'], pct: totalFiltered > 0 ? (baseCounts['2'] / totalFiltered) * 100 : 0, color: '#f97316' },
    { key: 'B7', code: '7', label: 'B7 (Déca)', count: baseCounts['7'], pct: totalFiltered > 0 ? (baseCounts['7'] / totalFiltered) * 100 : 0, color: '#94a3b8' },
    { key: 'B0', code: '0', label: 'B0 (Sans fix)', count: baseCounts['0'], pct: totalFiltered > 0 ? (baseCounts['0'] / totalFiltered) * 100 : 0, color: '#eab308' },
  ];

  // 3. Qualité de réception (R#, R+, R0, R!, R-, ERR)
  const recQualMap = { '#': 0, '+': 0, '0': 0, '!': 0, '-': 0, 'ERR': 0 };
  let totalRec = 0;
  for (const p of filteredPossessions) {
    const q = cleanVal(p.receptionQuality);
    if (!q) continue;
    totalRec += 1;
    if (q === '#') recQualMap['#'] += 1;
    else if (q === '+') recQualMap['+'] += 1;
    else if (q === '0') recQualMap['0'] += 1;
    else if (q === '!') recQualMap['!'] += 1;
    else if (q === '-' || q === '/') recQualMap['-'] += 1;
    else if (q === '=' || q === 'ERR') recQualMap['ERR'] += 1;
  }
  const receptionQualityBreakdown = [
    { key: 'R#', label: 'R#', count: recQualMap['#'], pct: totalRec > 0 ? (recQualMap['#'] / totalRec) * 100 : 0, color: '#10b981' },
    { key: 'R+', label: 'R+', count: recQualMap['+'], pct: totalRec > 0 ? (recQualMap['+'] / totalRec) * 100 : 0, color: '#3b82f6' },
    { key: 'R0', label: 'R0', count: recQualMap['0'], pct: totalRec > 0 ? (recQualMap['0'] / totalRec) * 100 : 0, color: '#eab308' },
    { key: 'R!', label: 'R!', count: recQualMap['!'], pct: totalRec > 0 ? (recQualMap['!'] / totalRec) * 100 : 0, color: '#f59e0b' },
    { key: 'R-', label: 'R-', count: recQualMap['-'], pct: totalRec > 0 ? (recQualMap['-'] / totalRec) * 100 : 0, color: '#f97316' },
    { key: 'ERR', label: 'ERR', count: recQualMap['ERR'], pct: totalRec > 0 ? (recQualMap['ERR'] / totalRec) * 100 : 0, color: '#ef4444' },
  ];

  // 4. % de Rotations (ZP1..ZP6)
  const rotColors = { 1: '#3b82f6', 2: '#f97316', 3: '#94a3b8', 4: '#eab308', 5: '#06b6d4', 6: '#10b981' };
  const rotationBreakdown = [1, 2, 3, 4, 5, 6].map((rot) => {
    const count = filteredPossessions.filter((p) => Number(p.rotation) === rot).length;
    return {
      rotation: rot,
      label: `ZP${rot}`,
      count,
      pct: totalFiltered > 0 ? (count / totalFiltered) * 100 : 0,
      color: rotColors[rot],
    };
  });

  // 5. Résultat d'attaque (A#, A+, A0, A/, ERR)
  const attResMap = { '#': 0, '+': 0, '0': 0, '/': 0, 'ERR': 0 };
  for (const p of filteredPossessions) {
    const r = cleanVal(p.attackResult);
    if (r === '#') attResMap['#'] += 1;
    else if (r === '+') attResMap['+'] += 1;
    else if (r === '/') attResMap['/'] += 1;
    else if (r === '=' || r === 'ERR') attResMap['ERR'] += 1;
    else attResMap['0'] += 1;
  }
  const attackResultBreakdown = [
    { key: 'A#', label: 'A# (Point)', count: attResMap['#'], pct: totalFiltered > 0 ? (attResMap['#'] / totalFiltered) * 100 : 0, color: '#10b981' },
    { key: 'A+', label: 'A+', count: attResMap['+'], pct: totalFiltered > 0 ? (attResMap['+'] / totalFiltered) * 100 : 0, color: '#3b82f6' },
    { key: 'A0', label: 'A0 (Rejoué)', count: attResMap['0'], pct: totalFiltered > 0 ? (attResMap['0'] / totalFiltered) * 100 : 0, color: '#eab308' },
    { key: 'A/', label: 'A/ (Bloqué)', count: attResMap['/'], pct: totalFiltered > 0 ? (attResMap['/'] / totalFiltered) * 100 : 0, color: '#f97316' },
    { key: 'ERR', label: 'ERR (Faute)', count: attResMap['ERR'], pct: totalFiltered > 0 ? (attResMap['ERR'] / totalFiltered) * 100 : 0, color: '#ef4444' },
  ];

  // 6. Répartition par joueur (attaquant)
  const playerMap = {};
  for (const p of filteredPossessions) {
    const num = cleanVal(p.attackerNumber);
    if (!num) continue;
    if (!playerMap[num]) {
      playerMap[num] = { number: num, name: p.attackerName || '', q: 0, kills: 0, errors: 0 };
    }
    playerMap[num].q += 1;
    if (isWinningAttack(p.attackResult)) playerMap[num].kills += 1;
    if (cleanVal(p.attackResult) === 'ERR' || cleanVal(p.attackResult) === '=' || cleanVal(p.attackResult) === '/') {
      playerMap[num].errors += 1;
    }
  }
  const attackerBreakdown = Object.values(playerMap)
    .map((item) => ({
      ...item,
      pctOfTeam: totalFiltered > 0 ? (item.q / totalFiltered) * 100 : 0,
      killPct: item.q > 0 ? (item.kills / item.q) * 100 : 0,
    }))
    .sort((a, b) => b.q - a.q);

  // 7. Service / Phase (S, F, T, C)
  const serviceMap = { S: 0, F: 0, T: 0, C: 0 };
  for (const p of filteredPossessions) {
    const st = cleanVal(p.serviceType);
    if (serviceMap[st] !== undefined) serviceMap[st] += 1;
  }

  // 8. Zone R (R1..R9)
  const zoneRMap = {};
  for (let z = 1; z <= 9; z++) zoneRMap[String(z)] = 0;
  for (const p of filteredPossessions) {
    const zr = cleanVal(p.receptionZone);
    if (zoneRMap[zr] !== undefined) zoneRMap[zr] += 1;
  }

  return {
    passZoneCounts,
    totalWithPassZone,
    totalKillsWithPassZone,
    setterBreakdown,
    orgaBreakdown,
    receptionQualityBreakdown,
    rotationBreakdown,
    attackResultBreakdown,
    attackerBreakdown,
    serviceMap,
    zoneRMap,
  };
}

// ----------------------------------------------------------------------------
// Extraction automatique des possessions depuis N matchs DataVolley
// ----------------------------------------------------------------------------

function inferPassSubzoneFromCoords(zone, x, y, teamSide = 'home') {
  const z = String(zone || '');
  if (z !== '3' && z !== '8') return z;
  if (x === null || x === undefined || y === null || y === undefined) return z;
  const numX = Number(x);
  if (!Number.isFinite(numX)) return z;
  // Coordonnées normalisées 0..100 : A = côté droit (vers poste 2), C = côté gauche (vers poste 4)
  // Selon l'orientation du demi-terrain, on découpe en 3 tiers : <38, 38..62, >62
  if (numX < 38) return `${z}C`;
  if (numX > 62) return `${z}A`;
  return z;
}

function extractPassZone13FromContacts(firstContact, setAction) {
  // 1. Si la passe E a une zone de départ (et éventuellement une sous-zone A/B/C/D)
  if (setAction) {
    const z = cleanVal(setAction.start_zone);
    const sub = cleanVal(setAction.end_subzone || setAction.start_subzone);
    if (z) {
      if ((z === '3' || z === '8') && (sub === 'A' || sub === 'C')) {
        return `${z}${sub}`;
      }
      if ((z === '3' || z === '8') && !sub && setAction.start_x != null) {
        return inferPassSubzoneFromCoords(z, setAction.start_x, setAction.start_y);
      }
      return normalizePassZone13(z);
    }
  }

  // 2. Si le 1er contact (R, D, F) a une zone d'arrivée (end_zone) + sous-zone éventuelle
  if (firstContact) {
    const ez = cleanVal(firstContact.end_zone);
    const esub = cleanVal(firstContact.end_subzone);
    if (ez) {
      if ((ez === '3' || ez === '8') && (esub === 'A' || esub === 'C')) {
        return `${ez}${esub}`;
      }
      if ((ez === '3' || ez === '8') && !esub && firstContact.end_x != null) {
        return inferPassSubzoneFromCoords(ez, firstContact.end_x, firstContact.end_y);
      }
      return normalizePassZone13(ez);
    }
    // Sinon déduit de l'évaluation du 1er contact (standard DataVolley)
    const ev = cleanVal(firstContact.evaluation);
    if (ev === '#') return '3';
    if (ev === '+') return '3C';
    if (ev === '!') return '8';
    if (ev === '-' || ev === '/') return '6';
  }

  return '3';
}

function extractBaseOffFromContacts(firstContact, setAction, attackAction, passZone13) {
  // 1. Appel explicite du passeur sur l'action E (K1, K2, K7, KE/K0)
  const call = cleanVal(setAction?.call || attackAction?.call);
  if (call) {
    if (['K1', 'K3', 'KC', 'KP', 'KM'].includes(call)) return '1';
    if (['K2', 'K6', 'K9'].includes(call)) return '2';
    if (['K7', 'K4', 'K5'].includes(call)) return '7';
    if (['KE', 'K0'].includes(call)) return '0';
  }

  // 2. Si l'attaque elle-même est une combinaison de central en 1er tempo, la base est connue !
  const combo = cleanVal(attackAction?.combo);
  if (combo) {
    if (['X1', 'XC', 'XM', 'XG'].includes(combo)) return '1';
    if (['X2', 'CF', 'CB', 'CD', 'XD', 'XS', 'XL'].includes(combo)) return '2';
    if (['X7', 'XZ'].includes(combo)) return '7';
  }

  // 3. Si situation mini (fond de terrain 1, 6, 5) ou réception/défense négative ('-', '/') -> Base 0 (pas de fixation)
  const pz = normalizePassZone13(passZone13);
  const ev = cleanVal(firstContact?.evaluation);
  if (['1', '6', '5'].includes(pz) || ev === '-' || ev === '/') {
    return '0';
  }

  // 4. Si zone de passe en 3A ou 2 -> souvent Fix avant (1) ou arrière (2), par défaut Base 1 en bonne/moyenne situation
  return '1';
}

function extractDistribCodeFromAttack(attackAction, setAction, baseOff, rotation, playerRoleMap) {
  const combo = cleanVal(attackAction?.combo);
  if (combo) {
    if (['X8', 'C8', 'V8', 'V4'].includes(combo)) return '8'; // EN 1
    if (['XP', 'VP', 'XB', 'VB', 'XR', 'VR'].includes(combo)) return '10'; // PIPE
    if (['PP', 'P2', 'PR', 'V3'].includes(combo)) return 'PM'; // autres (2e main / remise)
    if (['X3', 'XT'].includes(combo)) return '4'; // autres (croix)
    if (['X6', 'V6', 'C6', 'JJ'].includes(combo)) return '6'; // EN 2
    if (['X2', 'CF', 'CB', 'CD', 'XD', 'XS', 'XL', 'XO', 'XQ', 'XF'].includes(combo)) return '2'; // FIX ARR
    if (['X1', 'XC', 'XM', 'XG'].includes(combo)) return '1'; // FIX AV
    if (['X7', 'XZ'].includes(combo)) return '7'; // DECA
    if (['X5', 'V5', 'C5', 'II', 'VJ', 'X0', 'C0', 'V0'].includes(combo)) return '5'; // EN 4

    // Combinaison personnalisée éventuelle
    const info = attackComboInfo(combo);
    if (info) {
      if (info.set === 'S' || info.type === 'O') return 'PM';
      if (info.set === 'P' || Number(info.position) === 8 || Number(info.position) === 6) return '10';
      if (Number(info.position) === 9 || Number(info.position) === 1) return '8';
      if (Number(info.position) === 2) return info.tempo === '1st' ? '2' : '6';
      if (Number(info.position) === 3) return '1';
      if (Number(info.position) === 4 || Number(info.position) === 7) return '5';
    }
  }

  // Fallback si aucune combinaison (combo) n'a été codée sur l'attaque A :
  const sz = cleanVal(attackAction?.start_zone);
  const attackerNum = Number(attackAction?.player_number) || 0;
  const setterNum = Number(setAction?.player_number) || 0;
  const attackerRole = String(playerRoleMap?.get(attackerNum)?.role || '').toLowerCase();
  const isMiddle = attackerRole.includes('central') || attackerRole === 'mb' || attackerRole === 'm';
  const isSetter = (setterNum > 0 && attackerNum === setterNum) || attackerRole.includes('passeur') || attackerRole === 's';

  if (isSetter && (!sz || sz === '3' || sz === '2')) {
    return 'PM';
  }
  if (sz === '1' || sz === '9') return '8'; // EN 1
  if (sz === '6' || sz === '8') return '10'; // PIPE
  if (sz === '2') {
    if (isMiddle) return '2'; // FIX ARR
    // Si le passeur est avant (ZP4, ZP3, ZP2), l'opposé attaque depuis l'arrière (EN 1) ou l'avant (EN 2)
    return '6'; // EN 2
  }
  if (sz === '3') {
    if (baseOff === '7') return '7';
    if (baseOff === '2') return '2';
    return '1'; // FIX AV
  }
  if (sz === '4' || sz === '7' || sz === '5') {
    return '5'; // EN 4
  }

  return '5';
}

function normalizeSetupsForSide(setups = {}, side = 'home') {
  if (side !== 'away') return setups || {};
  const out = {};
  for (const [setKey, st] of Object.entries(setups || {})) {
    if (!st || typeof st !== 'object') continue;
    out[setKey] = {
      ...st,
      first_server: st.first_server === 'team2' ? 'team1' : st.first_server === 'team1' ? 'team2' : st.first_server,
      home_lineup: st.away_lineup,
      away_lineup: st.home_lineup,
      home_setter_pos: st.away_setter_pos,
      away_setter_pos: st.home_setter_pos,
    };
  }
  return out;
}

function normalizeEventsForSide(events = [], side = 'home') {
  if (side !== 'away') return events || [];
  return (events || []).map((ev) => {
    if (!ev) return ev;
    return {
      ...ev,
      team: ev.team === 'away' ? 'home' : 'away',
    };
  });
}

function parseRotationNumber(posStr, fallback = 1) {
  if (typeof posStr === 'number' && posStr >= 1 && posStr <= 6) return posStr;
  const m = String(posStr || '').match(/([1-6])/);
  return m ? Number(m[1]) : fallback;
}

/**
 * Extrait toutes les lignes de possessions au format exact de la feuille `saisie`
 * à partir d'une liste de matchs DataVolley complets.
 * Accepte soit `{ video, actions, setups, events }` (format API DataVolley Pancake),
 * soit `{ id, name, actions, setups, events }`.
 */
export function extractPossessionsFromMatches(matchesInput, targetTeamName = null) {
  const possessions = [];
  if (!Array.isArray(matchesInput)) return possessions;

  for (const rawItem of matchesInput) {
    if (!rawItem) continue;

    const video = rawItem.video || rawItem;
    const side = targetTeamName
      ? sideOfTeamInMatch(video, targetTeamName) || rawItem.side || 'home'
      : rawItem.side || 'home';

    // Si une équipe cible est demandée et qu'elle ne joue ni en team1 ni en team2 dans ce match, on ignore ce match
    if (targetTeamName && !sideOfTeamInMatch(video, targetTeamName) && video.team1_name && video.team2_name) {
      continue;
    }

    const matchId = String(video.id ?? rawItem.id ?? video.title ?? '');
    const opponentName =
      side === 'away'
        ? video.team1_name || rawItem.home_team_name || video.title || `Match ${matchId}`
        : video.team2_name || rawItem.away_team_name || video.title || `Match ${matchId}`;
    const matchLabel = cleanVal(opponentName || video.title || `Match ${matchId}`);

    const rawActions = rawItem.actions || [];
    const normalizedActions = rawActions
      .filter((a) => a && (a.evaluation || a.action === 'P' || a.isPointMarker))
      .map((a, idx) => {
        const decomposed = a.code && (!a.action || (!a.combo && !a.call)) ? decomposeCode(a.code) : {};
        const merged = { ...decomposed, ...a };
        const normA = normalizeAction(merged, side);
        return {
          ...normA,
          uid: normA.uid ?? `m${matchId}_${normA.id ?? idx}`,
          action_index: idx,
          match_video_id: matchId,
        };
      });

    const normalizedSetups = normalizeSetupsForSide(rawItem.setups || {}, side);
    const normalizedEvents = normalizeEventsForSide(rawItem.events || [], side);

    const rallies = groupActionsIntoRallies(normalizedActions);
    const matchState = computeMatchState(rallies, normalizedSetups, {}, normalizedEvents);
    const rallyStates = matchState.states || [];

    // Identification des vrais passeurs de l'équipe sur ce match :
    // 1) Joueurs placés au poste `home_setter_pos` dans `home_lineup` au début d'un set
    // 2) Joueurs ayant remplacé un passeur connu (remplacement poste pour poste)
    // 3) Joueurs ayant le rôle 'Passeur' / 'S' dans la liste des joueurs
    // 4) Joueurs ayant effectué au moins 4 passes ET >= 20% des passes du match (ou le joueur ayant fait le plus de passes si aucun lineup n'est défini)
    const knownSetterNumbers = new Set();
    for (const st of Object.values(normalizedSetups)) {
      if (!st) continue;
      const lu = normalizeLineup(st.home_lineup);
      const sPos = st.home_setter_pos;
      if (sPos && lu[sPos]) {
        knownSetterNumbers.add(Number(lu[sPos]));
      }
    }

    for (const p of rawItem.players || []) {
      const pNum = Number(p.number);
      const role = String(p.role || p.position || '').toLowerCase();
      if (pNum > 0 && (role.includes('passeur') || role === 's' || role === 'setter' || p.is_setter)) {
        knownSetterNumbers.add(pNum);
      }
    }

    for (const ev of normalizedEvents) {
      if (ev && ev.kind === 'substitution' && ev.team === 'home') {
        const outNum = Number(ev.payload?.out);
        const inNum = Number(ev.payload?.in);
        if (knownSetterNumbers.has(outNum) && inNum > 0) {
          knownSetterNumbers.add(inNum);
        }
      }
    }

    const setActionCountsByPlayer = {};
    let totalHomeSets = 0;
    for (const a of normalizedActions) {
      if (a.team === 'home' && a.action === 'E' && Number(a.player_number) > 0) {
        const pNum = Number(a.player_number);
        setActionCountsByPlayer[pNum] = (setActionCountsByPlayer[pNum] || 0) + 1;
        totalHomeSets += 1;
      }
    }
    for (const [pStr, cnt] of Object.entries(setActionCountsByPlayer)) {
      if (cnt >= 4 && totalHomeSets > 0 && cnt / totalHomeSets >= 0.2) {
        knownSetterNumbers.add(Number(pStr));
      }
    }
    if (knownSetterNumbers.size === 0 && totalHomeSets > 0) {
      const topSetter = Object.entries(setActionCountsByPlayer).sort((a, b) => b[1] - a[1])[0];
      if (topSetter) knownSetterNumbers.add(Number(topSetter[0]));
    }

    const playerRoleMap = new Map();
    for (const p of rawItem.players || []) {
      const pNum = Number(p.number);
      if (pNum > 0) playerRoleMap.set(pNum, p);
    }

    rallies.forEach((rally, rIdx) => {
      const snap = rallyStates[rIdx] || {};
      const setNumber = snap.setNumber || 1;
      const homeLineup = snap.homeLineup || {};

      // Cherche le passeur actif sur le terrain dans la rotation actuelle
      let activeCourtSetter = null;
      if (snap.homeSetterPos && homeLineup[snap.homeSetterPos]) {
        activeCourtSetter = Number(homeLineup[snap.homeSetterPos]);
      } else {
        for (const pNum of knownSetterNumbers) {
          if (positionOfPlayer(homeLineup, pNum)) {
            activeCourtSetter = pNum;
            break;
          }
        }
      }

      const actions = (rally.actions || []).filter((a) => !a.isPointMarker && a.action !== 'P');
      if (!actions.length) return;

      // Service du rallye (pour déterminer S, F, T en réception K1)
      const serveAction = actions.find((a) => a.action === 'S');
      let rallyServeCode = 'F';
      if (serveAction) {
        const st = cleanVal(serveAction.type);
        if (st === 'M' || st === 'H' || st === 'S') rallyServeCode = 'S';
        else if (st === 'T') rallyServeCode = 'T';
        else rallyServeCode = 'F';
      }

      // Découpe le rallye en séquences de possession de l'équipe 'home'
      let idx = 0;
      let homePossessionCount = 0;
      while (idx < actions.length) {
        while (idx < actions.length && actions[idx].team !== 'home') idx += 1;
        if (idx >= actions.length) break;

        const startIdx = idx;
        while (idx < actions.length && actions[idx].team === 'home') idx += 1;
        const seq = actions.slice(startIdx, idx);

        // Ignore si c'est uniquement le service initial de 'home'
        if (seq.length === 1 && seq[0].action === 'S') continue;

        const attackActions = seq.filter((a) => a.action === 'A');
        if (!attackActions.length) continue;

        homePossessionCount += 1;
        const attackAction = attackActions[attackActions.length - 1];
        const setAction = [...seq].reverse().find((a) => a.action === 'E') || null;
        const recAction = seq.find((a) => a.action === 'R') || null;
        const digAction = seq.find((a) => a.action === 'D' || a.action === 'F') || null;
        const firstContact = recAction || digAction || null;

        const isSideOut = Boolean(recAction) && homePossessionCount === 1;
        const serviceType = isSideOut ? rallyServeCode : 'C';

        // Numéro du passeur (N° P) et rotation (1..6)
        let setterNumber = '';
        let setterForRotation = activeCourtSetter;

        if (setAction && Number(setAction.player_number) > 0) {
          const pNum = Number(setAction.player_number);
          if (knownSetterNumbers.size > 0 && !knownSetterNumbers.has(pNum)) {
            setterNumber = 'NP';
          } else {
            setterNumber = String(pNum);
            setterForRotation = pNum;
          }
        } else if (activeCourtSetter) {
          setterNumber = String(activeCourtSetter);
        } else {
          const firstKnown = [...knownSetterNumbers][0];
          setterNumber = firstKnown ? String(firstKnown) : '1';
        }

        // Détermination de la rotation (1..6) : position du passeur sur le terrain
        let rotationPosStr =
          (setterForRotation ? positionOfPlayer(homeLineup, setterForRotation) : null) ||
          snap.homeSetterPos ||
          'P1';
        const rotation = parseRotationNumber(rotationPosStr, 1);

        // Zone de réception / 1er contact (1..9)
        let receptionZone = '';
        if (firstContact?.start_zone) {
          receptionZone = cleanVal(firstContact.start_zone);
        } else if (isSideOut && serveAction?.end_zone) {
          receptionZone = cleanVal(serveAction.end_zone);
        } else {
          receptionZone = '6';
        }

        // Qualité de réception / 1er contact
        let receptionQuality = cleanVal(firstContact?.evaluation) || '+';
        if (receptionQuality === '=') receptionQuality = 'Err';

        // Zone de passe parmi les 13 sous-zones
        const passZone = extractPassZone13FromContacts(firstContact, setAction);

        // Base offensive (1, 2, 7, 0)
        const baseOff = extractBaseOffFromContacts(firstContact, setAction, attackAction, passZone);

        // Code de distribution (1, 2, 4, 5, 6, 7, 8, 10, PM)
        const distribCode = extractDistribCodeFromAttack(
          attackAction,
          setAction,
          baseOff,
          rotation,
          playerRoleMap
        );
        const distribBox = mapDistribToCourtBox(distribCode, null);

        // Attaquant et résultat d'attaque
        const attackerNum = Number(attackAction.player_number) || 0;
        const attackerPlayer = playerRoleMap.get(attackerNum);
        let attackResult = cleanVal(attackAction.evaluation) || '0';
        if (attackResult === '=') attackResult = 'Err';
        else if (attackResult === '!' || attackResult === '-') attackResult = '0';

        possessions.push({
          id: `${matchId}_s${setNumber}_r${rIdx + 1}_p${homePossessionCount}`,
          source: 'datavolley',
          matchId,
          matchName: video.title || matchLabel,
          matchLabel,
          setNumber,
          rallyIndex: rIdx + 1,
          rotation,
          setterNumber,
          activeCourtSetter: activeCourtSetter ? String(activeCourtSetter) : setterNumber,
          serviceType,
          receptionZone,
          receptionQuality,
          passZone,
          baseOff,
          distribCode,
          distribBox,
          attackerNumber: attackerNum ? String(attackerNum) : '',
          attackerName: attackerPlayer?.name || '',
          attackResult,
          videoTime: attackAction.video_time ?? attackAction.timestamp ?? null,
          videoId: video.id ?? null,
          rawAttackCode: attackAction.code || '',
          rawSetCode: setAction?.code || '',
          actionObj: attackAction,
        });
      }
    });
  }

  return possessions;
}

// ----------------------------------------------------------------------------
// Import / Export de feuilles « saisie » (.xlsx et .csv)
// ----------------------------------------------------------------------------

function colLettersToIndex(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx; // 1-based (A=1..K=11)
}

/**
 * Parse un fichier `.xlsx` (comme `DISTRIBUTION_PASSEUR_.xlsx`) ou `.csv` directement
 * dans le navigateur via JSZip et DOMParser, et retourne les possessions normalisées.
 */
export async function parseSaisieFromFile(file) {
  const fileName = String(file?.name || '').toLowerCase();
  if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
    const text = await file.text();
    return parseSaisieFromCSVText(text, file.name);
  }

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // 1. Lecture de sharedStrings.xml
  const sharedStrings = [];
  const sstFile = zip.file('xl/sharedStrings.xml');
  const parser = new DOMParser();
  if (sstFile) {
    const sstXml = await sstFile.async('string');
    const doc = parser.parseFromString(sstXml, 'application/xml');
    const siNodes = doc.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagName('t');
      let text = '';
      for (let j = 0; j < tNodes.length; j++) {
        text += tNodes[j].textContent || '';
      }
      sharedStrings.push(text);
    }
  }

  // 2. Recherche de la feuille « saisie » (ou sheet1.xml par défaut)
  let targetSheetPath = 'xl/worksheets/sheet1.xml';
  const wbFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (wbFile && relsFile) {
    const wbDoc = parser.parseFromString(await wbFile.async('string'), 'application/xml');
    const relsDoc = parser.parseFromString(await relsFile.async('string'), 'application/xml');
    const relMap = {};
    const relNodes = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relNodes.length; i++) {
      const id = relNodes[i].getAttribute('Id');
      const target = relNodes[i].getAttribute('Target');
      if (id && target) relMap[id] = target.startsWith('xl/') ? target : `xl/${target.replace(/^\/+/, '')}`;
    }
    const sheetNodes = wbDoc.getElementsByTagName('sheet');
    for (let i = 0; i < sheetNodes.length; i++) {
      const name = (sheetNodes[i].getAttribute('name') || '').toLowerCase();
      const rId = sheetNodes[i].getAttribute('r:id') || sheetNodes[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      if (name.includes('saisie') && rId && relMap[rId]) {
        targetSheetPath = relMap[rId];
        break;
      }
    }
  }

  const sheetFile = zip.file(targetSheetPath) || zip.file('xl/worksheets/sheet1.xml');
  if (!sheetFile) {
    throw new Error('Feuille "saisie" introuvable dans le fichier Excel.');
  }

  const sheetDoc = parser.parseFromString(await sheetFile.async('string'), 'application/xml');
  const rowNodes = sheetDoc.getElementsByTagName('row');
  const rawObjects = [];

  for (let i = 0; i < rowNodes.length; i++) {
    const rowNode = rowNodes[i];
    const rowNum = Number(rowNode.getAttribute('r') || i + 1);
    const cNodes = rowNode.getElementsByTagName('c');
    const rowVals = {};
    for (let j = 0; j < cNodes.length; j++) {
      const cNode = cNodes[j];
      const ref = cNode.getAttribute('r') || '';
      const colMatch = ref.match(/^[A-Z]+/);
      if (!colMatch) continue;
      const colLetter = colMatch[0];
      if (colLettersToIndex(colLetter) > 11) continue; // Colonnes A..K uniquement

      const type = cNode.getAttribute('t');
      const vNode = cNode.getElementsByTagName('v')[0];
      const isNode = cNode.getElementsByTagName('is')[0];
      let val = '';
      if (type === 's' && vNode) {
        val = sharedStrings[Number(vNode.textContent)] ?? '';
      } else if (type === 'inlineStr' && isNode) {
        val = isNode.textContent || '';
      } else if (vNode) {
        val = vNode.textContent || '';
      }
      if (val !== '') rowVals[colLetter] = val;
    }

    // Ignore l'en-tête (ligne 1) et la légende (lignes 2..15 qui n'ont pas de nom de MATCH en A)
    if (rowNum === 1) continue;
    if (!rowVals.A || cleanVal(rowVals.A) === 'MATCH') continue;
    if (!rowVals.B && !rowVals.C && !rowVals.I) continue;

    rawObjects.push({ rowNum, ...rowVals });
  }

  return convertRawSaisieRowsToPossessions(rawObjects, file.name);
}

export function convertRawSaisieRowsToPossessions(rawRows, sourceLabel = 'Excel') {
  const possessions = [];
  rawRows.forEach((r, idx) => {
    const matchLabel = cleanVal(r.A ?? r.MATCH ?? sourceLabel);
    const rotation = Number(cleanVal(r.B ?? r.ROTATION)) || 1;
    const setterNumber = cleanVal(r.C ?? r['N° P'] ?? r.PASSEUR);
    const serviceType = cleanVal(r.D ?? r.SERVICE) || 'F';
    const receptionZone = cleanVal(r.E ?? r['ZONE R']);
    const receptionQuality = cleanVal(r.F ?? r['QUALITE R']);
    const passZone = normalizePassZone13(r.G ?? r['ZONE P']);
    const baseOff = normalizeBaseOff(r.H ?? r['BASE OFF']);
    const distribCode = cleanVal(r.I ?? r['DISTRIB P']);
    const distribBox = mapDistribToCourtBox(distribCode, null);
    const attackerNumber = cleanVal(r.J ?? r['N° JOUEUR']);
    const attackResult = cleanVal(r.K ?? r['RES ATT']);

    if (!matchLabel && !setterNumber && !distribCode) return;

    possessions.push({
      id: `xls_${idx + 1}`,
      source: 'excel',
      rowNum: r.rowNum || idx + 16,
      matchId: matchLabel,
      matchName: matchLabel,
      matchLabel,
      setNumber: 1,
      rallyIndex: idx + 1,
      rotation,
      setterNumber,
      serviceType,
      receptionZone,
      receptionQuality,
      passZone,
      baseOff,
      distribCode,
      distribBox,
      attackerNumber,
      attackerName: '',
      attackResult,
      videoTime: null,
      videoUrl: null,
    });
  });
  return possessions;
}

export function parseSaisieFromCSVText(csvText, sourceLabel = 'CSV') {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
    if (i === 0 && cleanVal(cols[0]).includes('MATCH')) continue;
    if (!cols[0] && !cols[2] && !cols[8]) continue;
    rows.push({
      rowNum: i + 1,
      A: cols[0],
      B: cols[1],
      C: cols[2],
      D: cols[3],
      E: cols[4],
      F: cols[5],
      G: cols[6],
      H: cols[7],
      I: cols[8],
      J: cols[9],
      K: cols[10],
    });
  }
  return convertRawSaisieRowsToPossessions(rows, sourceLabel);
}

/** Exporte une liste de possessions au format CSV compatible avec la feuille `saisie` Excel. */
export function exportPossessionsToSaisieCSV(possessions) {
  const headers = [
    'MATCH',
    'ROTATION',
    'N° P',
    'SERVICE',
    'ZONE R',
    'QUALITE R',
    'ZONE P',
    'BASE OFF',
    'DISTRIB P',
    'N° JOUEUR',
    'RES ATT',
  ];
  const lines = [headers.join(';')];
  for (const p of possessions) {
    lines.push(
      [
        p.matchLabel || '',
        p.rotation || '',
        p.setterNumber || '',
        p.serviceType || '',
        p.receptionZone || '',
        p.receptionQuality || '',
        p.passZone || '',
        p.baseOff ?? '',
        p.distribCode || '',
        p.attackerNumber || '',
        p.attackResult || '',
      ].join(';')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}
