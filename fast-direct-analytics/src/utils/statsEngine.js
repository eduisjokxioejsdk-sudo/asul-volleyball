// Moteur de statistiques Fast Direct.
// Les définitions (zones de distribution, Q / hash / dis / eff) sont identiques
// à celles de la feuille d'analyse passeur du mode Fast Direct.

export const ROTATIONS_ORDER = ['1', '6', '5', '4', '3', '2'];

export const QUALITE_R_OPTIONS = [
  { code: '#', label: 'Parfaite', tone: 'emerald' },
  { code: '+', label: 'Positive', tone: 'teal' },
  { code: '0', label: 'Moyenne', tone: 'amber' },
  { code: '!', label: '3 mètres', tone: 'orange' },
  { code: '-', label: 'Négative', tone: 'rose' },
  { code: 'Err', label: 'Erreur', tone: 'red' },
];

export const QUALITE_R_ORDER = QUALITE_R_OPTIONS.map((q) => q.code);

export const DISTRIB_ZONE_KEYS = [
  'EN1',
  'PIPE',
  'autres',
  'EN2',
  'FIX_ARR',
  'FIX_AV',
  'DECA',
  'EN4',
];

export const DISTRIB_ZONE_LABELS = {
  EN1: 'EN 1',
  PIPE: 'PIPE',
  autres: 'Autres',
  EN2: 'EN 2',
  FIX_ARR: 'FIX ARR',
  FIX_AV: 'FIX AV',
  DECA: 'DÉCALÉE',
  EN4: 'EN 4',
};

export const DISTRIB_CODE_LABELS = {
  '5': 'EN 4',
  '9': 'EN 4 Arr.',
  '4': 'CROIX / 4',
  '7': 'DECA',
  '1': 'FIX AV',
  '1C': 'FIX AV C',
  '3': 'TENDUE',
  '2': 'FIX ARR',
  '6': 'EN 2',
  '8': 'EN 1',
  '10': 'PIPE',
  PM: '2e Main',
};

export const BASE_OFF_LABELS = {
  '0': 'BASE 0 — pas de fix',
  '1': 'BASE 1 — fix avant',
  '2': 'BASE 2 — fix arrière',
  '3': 'BASE 3',
  '7': 'BASE 7 — décalée',
};

// Terrain de réception vu depuis notre camp (haut = filet).
export const ZONE_R_LAYOUT = [
  ['4', '3', '2'],
  ['7', '8', '9'],
  ['5', '6', '1'],
];

export const ZONE_R_ORDER = ZONE_R_LAYOUT.flat();

export const ZONE_P_ORDER = [
  '4',
  '3C',
  '3',
  '3A',
  '2',
  '7',
  '8C',
  '8',
  '8A',
  '9',
  '5',
  '6',
  '1',
];

export function normalizeCode(val, type) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  const up = s.toUpperCase();
  if (type === 'qualiteR' || type === 'resAtt') {
    if (up === 'ERR') return 'Err';
    return up;
  }
  if (type === 'zoneP') {
    return up;
  }
  if (type === 'setter' && up === 'NP') return 'NP';
  return up;
}

/** Normalise une ligne d'action Fast Direct (mêmes clés que le reste de l'app). */
export function normalizeRow(raw, idx = 0) {
  const idVal = raw?.id ?? idx + 1;
  const uidVal = raw?.uid
    ? String(raw.uid)
    : idVal !== undefined && idVal !== null && idVal !== ''
      ? `legacy_${idVal}`
      : `row_${idx}`;
  return {
    id: idVal,
    uid: uidVal,
    match: String(raw?.match ?? '').trim(),
    rotation: String(raw?.rotation ?? '').trim(),
    setter: normalizeCode(raw?.setter, 'setter'),
    service: normalizeCode(raw?.service, 'service'),
    zoneR: String(raw?.zoneR ?? '').trim(),
    qualiteR: normalizeCode(raw?.qualiteR, 'qualiteR'),
    zoneP: normalizeCode(raw?.zoneP, 'zoneP'),
    baseOff: String(raw?.baseOff ?? '').trim(),
    distribP: normalizeCode(raw?.distribP, 'distribP'),
    joueur: String(raw?.joueur ?? '').trim(),
    resAtt: normalizeCode(raw?.resAtt, 'resAtt'),
  };
}

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

export function describeDistrib(distribP) {
  const d = normalizeCode(distribP, 'distribP');
  if (!d) return '—';
  return DISTRIB_CODE_LABELS[d] || d;
}

export function pct(part, total) {
  return total > 0 ? part / total : null;
}

export function formatPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)} %`;
}

export function formatInt(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('fr-FR');
}

/** Filtres : listes vides = pas de filtre. */
export function filterRows(rows, filters = {}) {
  const matches = Array.isArray(filters.matches) && filters.matches.length > 0
    ? new Set(filters.matches.map((m) => String(m).toUpperCase()))
    : null;
  const setters = Array.isArray(filters.setters) && filters.setters.length > 0
    ? new Set(filters.setters.map((s) => String(s)))
    : null;
  const rotations = Array.isArray(filters.rotations) && filters.rotations.length > 0
    ? new Set(filters.rotations.map((r) => String(r)))
    : null;
  const players = Array.isArray(filters.players) && filters.players.length > 0
    ? new Set(filters.players.map((p) => String(p)))
    : null;

  return rows.filter((row) => {
    if (matches && !matches.has(String(row.match || '').toUpperCase())) return false;
    if (setters && !setters.has(String(row.setter || ''))) return false;
    if (rotations && !rotations.has(String(row.rotation || ''))) return false;
    if (players && !players.has(String(row.joueur || ''))) return false;
    return true;
  });
}

/** Construit un objet de compteurs initialisé à 0 pour chaque clé fournie. */
export function emptyCounts(keys = []) {
  const out = {};
  keys.forEach((key) => {
    out[key] = 0;
  });
  return out;
}

export function countBy(items, keyFn) {
  const out = {};
  items.forEach((item) => {
    const key = keyFn(item);
    if (key === null || key === undefined || key === '') return;
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

/** Trie un dictionnaire de compteurs par valeur décroissante. */
export function sortedEntries(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/** Statistiques de réception (qualité, zones, zone de passe, par passeur). */
export function computeReception(rows) {
  const receptionRows = rows.filter((row) => row.qualiteR || row.zoneR);
  const total = receptionRows.length;

  const quality = QUALITE_R_OPTIONS.map((opt) => {
    const count = receptionRows.filter((row) => row.qualiteR === opt.code).length;
    return {
      code: opt.code,
      label: opt.label,
      tone: opt.tone,
      count,
      share: pct(count, total),
    };
  });

  const perfectCount = receptionRows.filter((row) => row.qualiteR === '#').length;
  const goodCount = receptionRows.filter(
    (row) => row.qualiteR === '#' || row.qualiteR === '+'
  ).length;
  const errorCount = receptionRows.filter((row) => row.qualiteR === 'Err').length;

  const matrix = {};
  ZONE_R_ORDER.forEach((zone) => {
    matrix[zone] = emptyCounts(QUALITE_R_ORDER);
  });
  receptionRows.forEach((row) => {
    if (!matrix[row.zoneR]) return;
    if (row.qualiteR) matrix[row.zoneR][row.qualiteR] += 1;
  });

  const zones = ZONE_R_ORDER.map((zone) => {
    const count = receptionRows.filter((row) => row.zoneR === zone).length;
    const good = receptionRows.filter(
      (row) => row.zoneR === zone && (row.qualiteR === '#' || row.qualiteR === '+')
    ).length;
    return {
      code: zone,
      count,
      share: pct(count, total),
      good,
      goodRate: pct(good, count),
      quality: matrix[zone],
    };
  });

  const passeCounts = countBy(receptionRows, (row) => row.zoneP);
  const passeZones = ZONE_P_ORDER.map((code) => ({
    code,
    count: passeCounts[code] || 0,
    share: pct(passeCounts[code] || 0, total),
  })).filter((item) => item.count > 0);

  const bySetter = [...new Set(receptionRows.map((row) => row.setter).filter(Boolean))]
    .map((setter) => {
      const list = receptionRows.filter((row) => row.setter === setter);
      const good = list.filter(
        (row) => row.qualiteR === '#' || row.qualiteR === '+'
      ).length;
      const perfect = list.filter((row) => row.qualiteR === '#').length;
      return {
        setter,
        receptions: list.length,
        positiveRate: pct(good, list.length),
        perfectRate: pct(perfect, list.length),
      };
    })
    .sort((a, b) => b.receptions - a.receptions);

  return {
    total,
    quality,
    matrix,
    zones,
    passeZones,
    bySetter,
    perfectRate: pct(perfectCount, total),
    positiveRate: pct(goodCount, total),
    errorRate: pct(errorCount, total),
  };
}


/** Statistiques de distribution (Q / hash / dis / eff) par zone cible. */
export function computeDistribution(rows) {
  const validRows = rows.filter((row) => mapDistribToZoneKey(row.distribP) !== null);
  const total = validRows.length;

  const zones = DISTRIB_ZONE_KEYS.map((key) => {
    const list = validRows.filter((row) => mapDistribToZoneKey(row.distribP) === key);
    const points = list.filter((row) => row.resAtt === '#').length;
    return {
      key,
      label: DISTRIB_ZONE_LABELS[key],
      count: list.length,
      share: pct(list.length, total),
      points,
      efficiency: pct(points, list.length),
    };
  });

  const codeCounts = countBy(validRows, (row) => row.distribP);
  const codes = sortedEntries(codeCounts).map(([code, count]) => ({
    code,
    label: describeDistrib(code),
    count,
    share: pct(count, total),
    points: validRows.filter((row) => row.distribP === code && row.resAtt === '#').length,
  }));

  const baseOffCounts = countBy(rows, (row) => row.baseOff);
  const baseOff = Object.keys(baseOffCounts)
    .sort((a, b) => baseOffCounts[b] - baseOffCounts[a])
    .map((code) => ({
      code,
      label: BASE_OFF_LABELS[code] || `BASE ${code}`,
      count: baseOffCounts[code],
      share: pct(baseOffCounts[code], rows.length),
    }));

  const rotations = ROTATIONS_ORDER.map((rotation) => {
    const list = rows.filter((row) => row.rotation === rotation);
    const zoneCounts = countBy(list, (row) => mapDistribToZoneKey(row.distribP));
    const [topKey, topCount] = sortedEntries(zoneCounts)[0] || [null, 0];
    return {
      rotation,
      actions: list.length,
      topZone: topKey,
      topZoneLabel: topKey ? DISTRIB_ZONE_LABELS[topKey] : '—',
      topShare: pct(topCount, list.length),
    };
  });

  const bySetter = [...new Set(rows.map((row) => row.setter).filter(Boolean))]
    .map((setter) => {
      const list = rows.filter((row) => row.setter === setter);
      const zoneCounts = countBy(list, (row) => mapDistribToZoneKey(row.distribP));
      const [topKey, topCount] = sortedEntries(zoneCounts)[0] || [null, 0];
      return {
        setter,
        actions: list.length,
        topZone: topKey,
        topZoneLabel: topKey ? DISTRIB_ZONE_LABELS[topKey] : '—',
        topShare: pct(topCount, list.length),
      };
    })
    .sort((a, b) => b.actions - a.actions);

  return { total, zones, codes, baseOff, rotations, bySetter };
}


/** Statistiques par attaquant (numéro de joueur). */
export function computePlayers(rows) {
  const validRows = rows.filter((row) => mapDistribToZoneKey(row.distribP) !== null);
  const total = validRows.length;
  const map = new Map();

  validRows.forEach((row) => {
    const key = row.joueur || '—';
    if (!map.has(key)) {
      map.set(key, {
        player: key,
        actions: 0,
        points: 0,
        byZone: emptyCounts(DISTRIB_ZONE_KEYS),
      });
    }
    const entry = map.get(key);
    entry.actions += 1;
    if (row.resAtt === '#') entry.points += 1;
    const zoneKey = mapDistribToZoneKey(row.distribP);
    if (zoneKey) entry.byZone[zoneKey] += 1;
  });

  return [...map.values()]
    .map((entry) => {
      const [topKey, topCount] = sortedEntries(entry.byZone)[0] || [null, 0];
      return {
        ...entry,
        share: pct(entry.actions, total),
        efficiency: pct(entry.points, entry.actions),
        topZone: topKey,
        topZoneLabel: topKey ? DISTRIB_ZONE_LABELS[topKey] : '—',
        topShare: pct(topCount, entry.actions),
      };
    })
    .sort((a, b) => b.actions - a.actions);
}

/** Statistiques par match. */
export function computeMatches(rows) {
  const matches = [...new Set(rows.map((row) => row.match).filter(Boolean))];
  return matches
    .map((match) => {
      const list = rows.filter((row) => row.match === match);
      const receptionList = list.filter((row) => row.qualiteR);
      const good = receptionList.filter(
        (row) => row.qualiteR === '#' || row.qualiteR === '+'
      ).length;
      const zoneCounts = countBy(list, (row) => mapDistribToZoneKey(row.distribP));
      const [topKey, topCount] = sortedEntries(zoneCounts)[0] || [null, 0];
      return {
        match,
        actions: list.length,
        rotations: new Set(list.map((row) => row.rotation).filter(Boolean)).size,
        setters: [...new Set(list.map((row) => row.setter).filter(Boolean))].join(' • '),
        positiveRate: pct(good, receptionList.length),
        topZoneLabel: topKey ? DISTRIB_ZONE_LABELS[topKey] : '—',
        topShare: pct(topCount, list.length),
      };
    })
    .sort((a, b) => a.match.localeCompare(b.match, 'fr'));
}

/** Combinaisons réception → passe → distribution les plus fréquentes. */
export function computeCombos(rows, limit = 15) {
  const validRows = rows.filter((row) => row.distribP || row.zoneR);
  const total = validRows.length;
  const counts = countBy(validRows, (row) => {
    const reception = `${row.zoneR || '?'}${row.qualiteR || '?'}`;
    const passe = row.zoneP || '?';
    return `${reception} → ${passe} → ${describeDistrib(row.distribP)}`;
  });

  return sortedEntries(counts)
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, share: pct(count, total) }));
}

/** Répartition des résultats d'attaque enregistrés (compatibilité anciennes données). */
export function computeAttackResults(rows) {
  const counts = countBy(rows, (row) => row.resAtt);
  const total = rows.length;
  return sortedEntries(counts).map(([code, count]) => ({
    code,
    count,
    share: pct(count, total),
  }));
}


/** Indicateurs synthétiques affichés en haut de l'application. */
export function computeOverview(rows) {
  const distribution = computeDistribution(rows);
  const reception = computeReception(rows);
  const players = computePlayers(rows);

  const topZone = distribution.zones.slice().sort((a, b) => b.count - a.count)[0];
  const topPlayer = players[0] || null;
  const points = rows.filter((row) => row.resAtt === '#').length;

  return {
    totalActions: rows.length,
    matchCount: new Set(rows.map((row) => row.match).filter(Boolean)).size,
    setterCount: new Set(rows.map((row) => row.setter).filter(Boolean)).size,
    rotationCount: new Set(rows.map((row) => row.rotation).filter(Boolean)).size,
    playerCount: players.length,
    receptionPositiveRate: reception.positiveRate,
    receptionPerfectRate: reception.perfectRate,
    receptionErrorRate: reception.errorRate,
    topZone: topZone && topZone.count > 0 ? topZone : null,
    topPlayer,
    points,
    attackRate: pct(points, rows.length),
  };
}

/** Calcule l'ensemble des statistiques en une passe (utilisé par l'interface). */
export function computeStats(rows) {
  return {
    overview: computeOverview(rows),
    reception: computeReception(rows),
    distribution: computeDistribution(rows),
    players: computePlayers(rows),
    matches: computeMatches(rows),
    combos: computeCombos(rows),
    attackResults: computeAttackResults(rows),
  };
}

/** Options de filtres déduites des données chargées. */
export function filterOptions(rows) {
  const matches = [...new Set(rows.map((row) => row.match).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr')
  );
  const setters = [...new Set(rows.map((row) => row.setter).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true })
  );
  const rotations = ROTATIONS_ORDER.filter((rot) =>
    rows.some((row) => row.rotation === rot)
  );
  const players = [...new Set(rows.map((row) => row.joueur).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true })
  );
  return { matches, setters, rotations, players };
}



const CSV_COLUMNS = [
  ['match', 'Match'],
  ['rotation', 'Rotation'],
  ['setter', 'Passeur'],
  ['service', 'Service'],
  ['zoneR', 'Zone récep.'],
  ['qualiteR', 'Qualité récep.'],
  ['zoneP', 'Zone passe'],
  ['baseOff', 'Base'],
  ['distribP', 'Distribution'],
  ['joueur', 'Attaquant'],
  ['resAtt', 'Résultat attaque'],
];

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Export CSV (séparateur « ; » pour Excel FR). */
export function rowsToCsv(rows) {
  const header = CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(';');
  const lines = rows.map((row) =>
    CSV_COLUMNS.map(([key]) => csvEscape(row[key])).join(';')
  );
  return [header, ...lines].join('\r\n');
}

/** Déclenche le téléchargement d'un fichier texte dans le navigateur. */
export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
