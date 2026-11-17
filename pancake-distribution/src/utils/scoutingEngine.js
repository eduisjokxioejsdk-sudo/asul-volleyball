// Moteur de calcul et règles métier exactes calquées sur le classeur Excel original

export const J123_MATCHES_DEFAULT = [
  'SUC',
  'AUC',
  'GVUC',
  'SENNECEY',
  'CALUIRE 1',
  'CROIX ROUSSE 1',
  'MANDELIEU 1',
];

export const J456_MATCHES_DEFAULT = [
  'ST EGREVE 1',
  'LE PONTET 1',
  'LE PRADET 1',
];

export const ROTATIONS_ORDER = ['1', '6', '5', '4', '3', '2'];

export const SETTER_PRESETS = [
  { code: '6', label: 'PAUL', fullLabel: 'N° 6 — PAUL', color: 'emerald' },
  { code: '3', label: 'MARCUS', fullLabel: 'N° 3 — MARCUS', color: 'sky' },
  { code: '8', label: 'N° 8', fullLabel: 'N° 8 — Autre P', color: 'amber' },
  { code: 'NP', label: 'NP', fullLabel: 'NP — Non passeur', color: 'slate' },
];

export const DEFAULT_SETTER_LIST = [
  { code: '6', name: 'PAUL' },
  { code: '3', name: 'MARCUS' },
  { code: '8', name: '' },
];

export function formatSetterLabel(setterObj) {
  if (!setterObj) return '';
  const code = String(setterObj.code || '').trim().toUpperCase();
  const name = String(setterObj.name || '').trim().toUpperCase();
  if (!code) return '';
  if (code === 'NP') return 'NP (Non passeur)';
  return name ? `N° ${code} (${name})` : `N° ${code}`;
}

export const SERVICE_OPTIONS = [
  { code: 'F', label: 'Flottant', short: 'F' },
  { code: 'S', label: 'Smashé', short: 'S' },
  { code: 'C', label: 'Relance / Freeball', short: 'C' },
  { code: 'T', label: 'Tennis', short: 'T' },
];

// Terrain de réception vu depuis notre camp face au filet (haut = filet, bas = fond)
// Conforme au schéma : Avant = 4 | 3 | 2, Ligne 3m = 7 | 8 | 9, Fond = 5 | 6 | 1
export const ZONE_R_GRID = [
  [
    { code: '4', lane: 'Aile Gauche (Av)', hint: 'Av. Gauche (P4)' },
    { code: '3', lane: 'Centre (Av)', hint: 'Av. Centre (P3)' },
    { code: '2', lane: 'Aile Droite (Av)', hint: 'Av. Droite (P2)' },
  ],
  [
    { code: '7', lane: 'Aile Gauche (3m)', hint: '3m Gauche' },
    { code: '8', lane: 'Centre (3m)', hint: '3m Centre' },
    { code: '9', lane: 'Aile Droite (3m)', hint: '3m Droite' },
  ],
  [
    { code: '5', lane: 'Aile Gauche (Fond)', hint: 'Fond Gauche (P5)' },
    { code: '6', lane: 'Centre (Fond)', hint: 'Fond Centre (P6)' },
    { code: '1', lane: 'Aile Droite (Fond)', hint: 'Fond Droite (P1)' },
  ],
];

export const QUALITE_R_OPTIONS = [
  { code: '#', label: 'Parfaite', desc: 'Toutes options', style: 'emerald' },
  { code: '+', label: 'Positive', desc: 'Bonne', style: 'teal' },
  { code: '0', label: 'Moyenne', desc: 'Jouable', style: 'amber' },
  { code: '!', label: '3 mètres', desc: 'Sur ligne 3m', style: 'orange' },
  { code: '-', label: 'Négative', desc: 'Hors système', style: 'rose' },
  { code: 'Err', label: 'Erreur', desc: 'Ace / Faute', style: 'red' },
];

// Zones de passe sur notre demi-terrain (haut = filet, gauche = poste 4, droite = poste 2)
export const ZONE_P_ROWS = [
  {
    situation: 'BONNE SITUATION (Filet)',
    color: 'emerald',
    zones: [
      { code: '4', label: '4' },
      { code: '3C', label: '3C' },
      { code: '3', label: '3' },
      { code: '3A', label: '3A' },
      { code: '2', label: '2' },
    ],
  },
  {
    situation: 'SITUATION MOYENNE (Ligne 3m)',
    color: 'amber',
    zones: [
      { code: '7', label: '7' },
      { code: '8C', label: '8C' },
      { code: '8', label: '8' },
      { code: '8A', label: '8A' },
      { code: '9', label: '9' },
    ],
  },
  {
    situation: 'SITUATION MINI (Fond)',
    color: 'rose',
    zones: [
      { code: '5', label: '5' },
      { code: '6', label: '6' },
      { code: '1', label: '1' },
    ],
  },
];

export const ZONE_P_EXTRA = ['7C', '7A'];

// Coordonnées 2D (% sur notre demi-terrain : x=0 gauche [P4]..100 droite [P2], y=0 filet..100 fond)
export const ZONE_2D_COORDS = {
  '4': { x: 16.6, y: 16.6 },
  '3C': { x: 35, y: 16.6 },
  '3': { x: 50, y: 16.6 },
  '3A': { x: 65, y: 16.6 },
  '2': { x: 83.3, y: 16.6 },
  '7': { x: 16.6, y: 50 },
  '7C': { x: 24, y: 50 },
  '7A': { x: 12, y: 50 },
  '8C': { x: 35, y: 50 },
  '8': { x: 50, y: 50 },
  '8A': { x: 65, y: 50 },
  '9': { x: 83.3, y: 50 },
  '5': { x: 16.6, y: 83.3 },
  '6': { x: 50, y: 83.3 },
  '1': { x: 83.3, y: 83.3 },
};

// Coordonnées 2D des cibles d'attaque pour DISTRIB P (sur notre demi-terrain)
export const DISTRIB_2D_COORDS = {
  '5': { x: 10, y: 14 },
  '9': { x: 16, y: 34 },
  '4': { x: 24, y: 20 },
  '7': { x: 36, y: 15 },
  '1': { x: 50, y: 12 },
  '1C': { x: 43, y: 22 },
  '3': { x: 58, y: 22 },
  'PM': { x: 62, y: 10 },
  '2': { x: 70, y: 15 },
  '6': { x: 88, y: 14 },
  '10': { x: 50, y: 56 },
  '8': { x: 85, y: 56 },
};

export const TEAM_ROLES = [
  { id: 'Passeur', label: 'Passeur', short: 'P', color: 'emerald' },
  { id: 'Pointu', label: 'Pointu', short: 'Pt', color: 'amber' },
  { id: 'R4', label: 'R4 (Récep-Att)', short: 'R4', color: 'sky' },
  { id: 'Central', label: 'Central', short: 'C', color: 'purple' },
];

export const DEFAULT_TEAM_LINEUP = {
  1: { num: '6', role: 'Passeur' },
  2: { num: '33', role: 'R4' },
  3: { num: '16', role: 'Central' },
  4: { num: '1', role: 'Pointu' },
  5: { num: '69', role: 'R4' },
  6: { num: '4', role: 'Central' },
};

// Calcule la position des 6 joueurs pour une rotation donnée (rotation = zone du passeur : '1','6','5','4','3','2')
export function computeLineupAtRotation(baseLineup, targetRotation) {
  const targetZone = Number(targetRotation);
  const zonesClock = [1, 6, 5, 4, 3, 2];
  const frontZones = [4, 3, 2];
  const backZones = [5, 6, 1];

  const setterStartZone =
    zonesClock.find((z) => baseLineup?.[z]?.role === 'Passeur') || 1;
  const startIdx = zonesClock.indexOf(setterStartZone);
  const targetIdx = zonesClock.indexOf(targetZone);
  const steps = targetIdx >= 0 ? (targetIdx - startIdx + 6) % 6 : 0;

  const byZone = {};
  zonesClock.forEach((origZ, i) => {
    const curZ = zonesClock[(i + steps) % 6];
    const slot = baseLineup?.[origZ] || DEFAULT_TEAM_LINEUP[origZ];
    byZone[curZ] = {
      zone: curZ,
      origZone: origZ,
      num: String(slot?.num ?? '').trim(),
      role: slot?.role || 'R4',
      isFront: frontZones.includes(curZ),
      starterNum: slot?.starterNum ? String(slot.starterNum).trim() : null,
      subRot: slot?.subRot || null,
    };
  });

  const all = Object.values(byZone);
  const front = frontZones.map((z) => byZone[z]);
  const back = backZones.map((z) => byZone[z]);

  const r4Front = front.find((s) => s.role === 'R4') || all.find((s) => s.role === 'R4');
  const r4Back =
    back.find((s) => s.role === 'R4') ||
    all.filter((s) => s.role === 'R4')[1] ||
    r4Front;
  const centralFront =
    front.find((s) => s.role === 'Central') || all.find((s) => s.role === 'Central');
  const pointu = all.find((s) => s.role === 'Pointu');
  const passeur = all.find((s) => s.role === 'Passeur');

  return {
    byZone,
    setterZone: targetZone,
    r4Front,
    r4Back,
    centralFront,
    pointu,
    passeur,
  };
}

// Détermine automatiquement le N° du joueur qui attaque selon DISTRIB P et la rotation actuelle
export function resolveAttackerForDistrib(distribP, lineupInfo) {
  if (!lineupInfo) return '';
  const d = normalizeCode(distribP, 'distribP');
  if (d === '6' || d === '8') return lineupInfo.pointu?.num || '';
  if (d === '5' || d === '9' || d === '4') return lineupInfo.r4Front?.num || '';
  if (d === '10') return lineupInfo.r4Back?.num || '';
  if (d === '1' || d === '1C' || d === '2' || d === '3' || d === '7') {
    return lineupInfo.centralFront?.num || '';
  }
  if (d === 'PM') return lineupInfo.passeur?.num || '';
  return '';
}

export const BASE_OFF_OPTIONS = [
  { code: '1', label: 'BASE 1', sub: 'Fix Avant', short: 'B1' },
  { code: '2', label: 'BASE 2', sub: 'Fix Arrière', short: 'B2' },
  { code: '7', label: 'BASE 7', sub: 'Décalée', short: 'B7' },
  { code: '0', label: 'BASE 0', sub: 'Pas de fix', short: 'B0' },
  { code: '3', label: 'BASE 3', sub: 'Fix 3', short: 'B3' },
];

export const DISTRIB_P_NET = [
  { code: '5', label: '5', sub: 'EN 4', target: 'EN 4' },
  { code: '7', label: '7', sub: 'DECA', target: 'DECA' },
  { code: '1', label: '1', sub: 'FIX AV', target: 'FIX AV' },
  { code: '1C', label: '1C', sub: 'FIX AV C', target: 'FIX AV' },
  { code: '3', label: '3', sub: 'TENDUE', target: 'FIX AV' },
  { code: '2', label: '2', sub: 'FIX ARR', target: 'FIX ARR' },
  { code: '4', label: '4', sub: 'CROIX / 4', target: 'autres' },
  { code: '6', label: '6', sub: 'EN 2', target: 'EN 2' },
];

export const DISTRIB_P_BACK = [
  { code: '9', label: '9', sub: 'EN 4 Arr.', target: 'EN 4' },
  { code: '10', label: '10', sub: 'PIPE', target: 'PIPE' },
  { code: '8', label: '8', sub: 'EN 1', target: 'EN 1' },
  { code: 'PM', label: 'PM', sub: '2e Main', target: 'autres' },
];

export const DEFAULT_PLAYERS = [
  { num: '1', role: 'Pointu / R4', hint: 'Attaquant' },
  { num: '2', role: 'Pointu / R4', hint: 'Attaquant' },
  { num: '3', role: 'Passeur / C', hint: 'Marcus' },
  { num: '4', role: 'Central', hint: 'Centre' },
  { num: '6', role: 'Passeur', hint: 'Paul' },
  { num: '7', role: 'Central', hint: 'Centre' },
  { num: '8', role: 'Passeur / Pt', hint: 'Passeur' },
  { num: '10', role: 'R4', hint: 'Aile' },
  { num: '11', role: 'Central', hint: 'Centre' },
  { num: '16', role: 'Central', hint: 'Centre' },
  { num: '21', role: 'R4', hint: 'Aile' },
  { num: '29', role: 'Central', hint: 'Centre' },
  { num: '33', role: 'R4', hint: 'Aile' },
  { num: '69', role: 'R4', hint: 'Aile' },
];

export const RES_ATT_OPTIONS = [
  { code: '#', label: '#', sub: 'Point !', style: 'emerald' },
  { code: '+', label: '+', sub: 'Positif', style: 'teal' },
  { code: '0', label: '0', sub: 'Rejoué', style: 'slate' },
  { code: '/', label: '/', sub: 'Block-out / Couv.', style: 'amber' },
  { code: '-', label: '-', sub: 'Négatif', style: 'orange' },
  { code: '!', label: '!', sub: 'Relance', style: 'yellow' },
  { code: 'Err', label: 'Err', sub: 'Faute / Contré', style: 'rose' },
];

// Normalise une valeur texte en gardant les codes canoniques Excel
export function normalizeCode(val, type) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  const up = s.toUpperCase();
  if (type === 'qualiteR' || type === 'resAtt') {
    if (up === 'ERR') return 'Err';
    return up;
  }
  if (type === 'zoneP') {
    if (up === '8A' || up === '8C' || up === '3A' || up === '3C' || up === '7A' || up === '7C') {
      return up;
    }
    return up;
  }
  if (type === 'distribP') {
    if (up === '1C' || up === 'PM') return up;
    return up;
  }
  if (type === 'setter') {
    if (up === 'NP') return 'NP';
    return up;
  }
  if (type === 'match') {
    return up;
  }
  return up;
}

export function normalizeRow(raw, idx = 0) {
  const idVal = raw.id ?? idx + 1;
  const uidVal = raw.uid
    ? String(raw.uid)
    : idVal !== undefined && idVal !== null && idVal !== ''
      ? `legacy_${idVal}`
      : `row_${idx}`;
  return {
    id: idVal,
    uid: uidVal,
    match: String(raw.match ?? '').trim(),
    rotation: String(raw.rotation ?? '').trim(),
    setter: normalizeCode(raw.setter, 'setter'),
    service: normalizeCode(raw.service, 'service'),
    zoneR: String(raw.zoneR ?? '').trim(),
    qualiteR: normalizeCode(raw.qualiteR, 'qualiteR'),
    zoneP: normalizeCode(raw.zoneP, 'zoneP'),
    baseOff: String(raw.baseOff ?? '').trim(),
    distribP: normalizeCode(raw.distribP, 'distribP'),
    joueur: String(raw.joueur ?? '').trim(),
    resAtt: normalizeCode(raw.resAtt, 'resAtt'),
  };
}

// Mapping exact des 8 zones des tableaux terrains de Distribution (Bandes 1, 3, 4, 5, 6, 7)
export function mapDistribToZoneKey(distribP) {
  const d = normalizeCode(distribP, 'distribP');
  if (d === '8') return 'EN1';
  if (d === '10') return 'PIPE';
  if (d === 'PM' || d === '4') return 'autres';
  if (d === '6') return 'EN2';
  if (d === '2') return 'FIX_ARR';
  if (d === '1' || d === '1C' || d === '3') return 'FIX_AV';
  if (d === '7') return 'DECA';
  if (d === '5' || d === '9') return 'EN4';
  return null;
}

// Mapping exact des 5 colonnes d'Organisation offensive (Bande 2)
export function mapDistribToOrgaCol(distribP, baseOff) {
  const d = normalizeCode(distribP, 'distribP');
  const b = String(baseOff ?? '').trim();
  if (d === '6' || d === '8') return 'col0'; // '2' (P1,P6,P5) ou '1' (P4,P3,P2)
  if (d === '1' || d === '1C' || d === '2' || d === '3' || d === '7' || (b === '2' && d === '4')) {
    return 'C';
  }
  if (d === '5' || d === '9') return '4';
  if (d === '10') return 'PIPE';
  if (d === 'PM' || (d === '4' && b !== '2')) return 'DIV';
  return null;
}

export function computeDistributionGrid(rows) {
  const keys = ['EN1', 'PIPE', 'autres', 'EN2', 'FIX_ARR', 'FIX_AV', 'DECA', 'EN4'];
  const counts = {};
  const hashes = {};
  keys.forEach((k) => {
    counts[k] = 0;
    hashes[k] = 0;
  });

  rows.forEach((row) => {
    const k = mapDistribToZoneKey(row.distribP);
    if (!k) return;
    counts[k] += 1;
    if (normalizeCode(row.resAtt, 'resAtt') === '#') {
      hashes[k] += 1;
    }
  });

  const totalActions = keys.reduce((acc, k) => acc + counts[k], 0);
  const actionsHash = keys.reduce((acc, k) => acc + hashes[k], 0);

  const zones = {};
  keys.forEach((k) => {
    const q = counts[k];
    const effCount = hashes[k];
    zones[k] = {
      q,
      hash: effCount,
      dis: totalActions > 0 ? q / totalActions : null,
      eff: q > 0 ? effCount / q : null,
    };
  });

  return {
    zones,
    totalActions,
    actionsHash,
    effGlobal: totalActions > 0 ? actionsHash / totalActions : null,
  };
}

export function computeOrgaGrid(rows, isFrontRow) {
  const firstColLabel = isFrontRow ? '1' : '2';
  const colKeys = ['col0', 'C', '4', 'PIPE', 'DIV'];
  const colLabels = [firstColLabel, 'C', '4', 'PIPE', 'DIV'];

  const makeBase = () => ({
    q: 0,
    hash: 0,
    pctBase: null,
    pctHash: null,
    cols: colKeys.map((k, idx) => ({ key: k, label: colLabels[idx], q: 0, hash: 0 })),
  });

  const base0 = makeBase();
  const base2 = makeBase();
  const base1 = makeBase();
  const base7 = makeBase();

  rows.forEach((row) => {
    const b = String(row.baseOff ?? '').trim();
    const colKey = mapDistribToOrgaCol(row.distribP, b);
    if (!colKey) return;
    const isHash = normalizeCode(row.resAtt, 'resAtt') === '#';

    let targetBase = null;
    if (b === '0') targetBase = base0;
    else if (b === '2') targetBase = base2;
    else if (b === '1' || b === '3') targetBase = base1;
    else if (b === '7') targetBase = base7;

    if (!targetBase) return;
    const colObj = targetBase.cols.find((c) => c.key === colKey);
    if (colObj) {
      colObj.q += 1;
      if (isHash) colObj.hash += 1;
    }
  });

  const bases = [base0, base2, base1, base7];
  bases.forEach((bObj) => {
    bObj.q = bObj.cols.reduce((s, c) => s + c.q, 0);
    bObj.hash = bObj.cols.reduce((s, c) => s + c.hash, 0);
  });

  const totalActions = bases.reduce((s, b) => s + b.q, 0);
  const actionsHash = bases.reduce((s, b) => s + b.hash, 0);

  bases.forEach((bObj) => {
    bObj.pctBase = totalActions > 0 ? bObj.q / totalActions : null;
    bObj.pctHash = bObj.q > 0 ? bObj.hash / bObj.q : null;
  });

  return {
    base0,
    base2,
    base1,
    base7,
    colLabels,
    totalActions,
    actionsHash,
    effGlobal: totalActions > 0 ? actionsHash / totalActions : null,
  };
}

export function computeSetterSheetStats(rows) {
  const normRows = rows.map((r, i) => normalizeRow(r, i));

  // Bande 1 : Distribution par rotation (P1, P6, P5, P4, P3, P2)
  const band1 = {};
  const band2 = {};
  ROTATIONS_ORDER.forEach((rot) => {
    const rotRows = normRows.filter((r) => r.rotation === rot);
    const key = `P${rot}`;
    band1[key] = computeDistributionGrid(rotRows);
    band2[key] = computeOrgaGrid(rotRows, ['4', '3', '2'].includes(rot));
  });

  // Bande 3 : Globale + Annonces du central (BASE 1, BASE 2, BASE 7, BASE 0)
  const band3 = {
    GLOBAL: computeDistributionGrid(normRows),
    BASE_1: computeDistributionGrid(normRows.filter((r) => r.baseOff === '1' || r.baseOff === '3')),
    BASE_2: computeDistributionGrid(normRows.filter((r) => r.baseOff === '2')),
    BASE_7: computeDistributionGrid(normRows.filter((r) => r.baseOff === '7')),
    BASE_0: computeDistributionGrid(normRows.filter((r) => r.baseOff === '0')),
  };

  // Bande 4 : Zone de réception (1 9 2 / 6 8 3 / 5 7 4)
  const band4 = {
    GAUCHE: computeDistributionGrid(normRows.filter((r) => ['1', '9', '2'].includes(r.zoneR))),
    CENTRE: computeDistributionGrid(normRows.filter((r) => ['6', '8', '3'].includes(r.zoneR))),
    DROITE: computeDistributionGrid(normRows.filter((r) => ['5', '7', '4'].includes(r.zoneR))),
  };

  // Bande 5 : Situation mini (Zone de passe en 1, 6, 5)
  const band5 = {
    Z1: computeDistributionGrid(normRows.filter((r) => r.zoneP === '1')),
    Z6: computeDistributionGrid(normRows.filter((r) => r.zoneP === '6')),
    Z5: computeDistributionGrid(normRows.filter((r) => r.zoneP === '5')),
  };

  // Bande 6 : Situation moyenne (9, 8A, 8, 8C, 7 — incluant 7A/7C dans Z7 comme Excel)
  const band6 = {
    Z9: computeDistributionGrid(normRows.filter((r) => r.zoneP === '9')),
    Z8A: computeDistributionGrid(normRows.filter((r) => r.zoneP === '8A')),
    Z8: computeDistributionGrid(normRows.filter((r) => r.zoneP === '8')),
    Z8C: computeDistributionGrid(normRows.filter((r) => r.zoneP === '8C')),
    Z7: computeDistributionGrid(normRows.filter((r) => ['7', '7A', '7C'].includes(r.zoneP))),
  };

  // Bande 7 : Bonne situation (2, 3A, 3, 3C, 4)
  const band7 = {
    Z2: computeDistributionGrid(normRows.filter((r) => r.zoneP === '2')),
    Z3A: computeDistributionGrid(normRows.filter((r) => r.zoneP === '3A')),
    Z3: computeDistributionGrid(normRows.filter((r) => r.zoneP === '3')),
    Z3C: computeDistributionGrid(normRows.filter((r) => r.zoneP === '3C')),
    Z4: computeDistributionGrid(normRows.filter((r) => r.zoneP === '4')),
  };

  return {
    totalRows: normRows.length,
    band1,
    band2,
    band3,
    band4,
    band5,
    band6,
    band7,
  };
}

// Calcule tous les compteurs et graphiques de la feuille `saisie` (O15:CJ32)
export function computeSaisieSummary(rows, setterList = null) {
  const norm = rows.map((r, i) => normalizeRow(r, i));

  const countBy = (key, candidates) => {
    const map = {};
    candidates.forEach((c) => {
      map[c] = 0;
    });
    norm.forEach((r) => {
      const val = String(r[key] ?? '').toUpperCase();
      const matchKey = candidates.find((c) => c.toUpperCase() === val);
      if (matchKey !== undefined) {
        map[matchKey] += 1;
      }
    });
    return map;
  };

  const rotCounts = countBy('rotation', ['1', '2', '3', '4', '5', '6']);
  const baseSetterCodes = Array.isArray(setterList)
    ? setterList.map((s) => String(s?.code || '').trim().toUpperCase()).filter(Boolean)
    : ['3', '6', '8'];
  const dynamicSetterCodes = [...baseSetterCodes];
  norm.forEach((r) => {
    const sc = String(r.setter || '').trim().toUpperCase();
    if (sc && sc !== 'NP' && !dynamicSetterCodes.includes(sc)) {
      dynamicSetterCodes.push(sc);
    }
  });
  if (!dynamicSetterCodes.includes('NP')) {
    dynamicSetterCodes.push('NP');
  }
  const setterCounts = countBy('setter', dynamicSetterCodes);
  const serviceCounts = countBy('service', ['S', 'F', 'T', 'C']);
  const zoneRCounts = countBy('zoneR', ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const qualiteRCounts = countBy('qualiteR', ['#', '+', '0', '!', '-', 'Err']);
  const zonePCounts = countBy('zoneP', ['1', '6', '5', '7', '8', '8A', '8C', '9', '2', '3', '3A', '3C', '4']);
  const baseOffCounts = countBy('baseOff', ['1', '2', '7', '0']);
  const distribPCounts = countBy('distribP', ['1', '1C', '2', '7', '3', '4', '5', '6', '10', '8', '9', 'PM']);
  const resAttCounts = countBy('resAtt', ['#', '+', '0', '/', 'Err']);

  // Joueurs dynamiques (garder les 13 clés Excel en premier + tout autre numéro saisi)
  const basePlayers = ['1', '2', '3', '4', '6', '7', '8', '10', '16', '21', '29', '33', '69'];
  const allPlayerNums = [...basePlayers];
  norm.forEach((r) => {
    if (r.joueur && !allPlayerNums.includes(r.joueur)) {
      allPlayerNums.push(r.joueur);
    }
  });
  const joueurCounts = countBy('joueur', allPlayerNums);

  // Total Zone de Passe dans Excel (BH32 = somme Z15..Z27)
  const totalZoneP = Object.values(zonePCounts).reduce((a, b) => a + b, 0);

  // Mini-terrain Distribution en (BV15:CJ32) dans la feuille saisie :
  // Excel utilise AD15..AD26 : EN1=AD24('8'), PIPE=AD23('10'), autres=AD26('PM'),
  // EN2=AD22+AD20+AD19('6','4','3'), FIX ARR=AD17('2'), FIX AV=AD15+AD16('1','1C'),
  // DECA=AD18('7'), EN4=AD21+AD25('5','9')
  const miniDistQ = {
    EN1: distribPCounts['8'],
    PIPE: distribPCounts['10'],
    autres: distribPCounts['PM'],
    EN2: distribPCounts['6'] + distribPCounts['4'] + distribPCounts['3'],
    FIX_ARR: distribPCounts['2'],
    FIX_AV: distribPCounts['1'] + distribPCounts['1C'],
    DECA: distribPCounts['7'],
    EN4: distribPCounts['5'] + distribPCounts['9'],
  };
  const totalMiniDist = Object.values(miniDistQ).reduce((a, b) => a + b, 0);

  return {
    totalRows: norm.length,
    rotCounts,
    setterCounts,
    serviceCounts,
    zoneRCounts,
    qualiteRCounts,
    zonePCounts,
    totalZoneP,
    baseOffCounts,
    distribPCounts,
    resAttCounts,
    joueurCounts,
    miniDistQ,
    totalMiniDist,
  };
}

export function filterRowsForPreset(rows, sheetConfig) {
  if (!sheetConfig) return [];
  const norm = rows.map((r, i) => normalizeRow(r, i));
  let filtered = norm;
  if (sheetConfig.setter && sheetConfig.setter !== 'ALL') {
    filtered = filtered.filter((r) => r.setter === String(sheetConfig.setter).toUpperCase());
  }
  if (!sheetConfig.includeAllMatches && Array.isArray(sheetConfig.matches)) {
    const allowed = new Set(sheetConfig.matches.map((m) => m.toUpperCase()));
    filtered = filtered.filter((r) => allowed.has(r.match.toUpperCase()));
  }
  return filtered;
}

export function formatExcelNumber(val, asPercent = false, decimals = 1) {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '#DIV/0!';
  }
  if (asPercent) {
    const pct = val * 100;
    return decimals === 0 ? `${Math.round(pct)}%` : `${pct.toFixed(decimals)}%`;
  }
  if (val === 0) return '0';
  if (val === 1) return '1';
  return Number(val.toFixed(4)).toString();
}

// Formats exacts des cellules Excel : Dis et EFF global en "0.0%", Eff zone et %# en "0%"
export function formatDisValue(val, decimalMode = false) {
  return formatExcelNumber(val, !decimalMode, 1);
}

export function formatEffValue(val, decimalMode = false) {
  return formatExcelNumber(val, !decimalMode, 0);
}
