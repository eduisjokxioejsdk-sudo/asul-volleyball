// Chargement des données Fast Direct : sauvegarde .json officielle ou localStorage.
import { normalizeRow } from './statsEngine.js';

export const STORAGE_SUFFIXES = {
  ROWS: 'pancake_dist_rows_v1',
  MATCHES: 'pancake_dist_matches_v2',
  SETTERS: 'pancake_dist_setters_v1',
  CONFIGS: 'pancake_dist_sheet_configs_v2',
  LINEUP: 'pancake_dist_team_lineup_v1',
};

function getStorage(storage) {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function unique(values = []) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const clean = String(value ?? '').trim();
    if (!clean) return;
    const key = clean.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  });
  return out;
}

/**
 * Liste les sessions Fast Direct présentes dans le localStorage du navigateur.
 * L'app principale préfixe ses clés par `pancake_fd_<sessionId>_`.
 */
export function listLocalSessions(storage) {
  const store = getStorage(storage);
  if (!store) return [];

  const sessions = [];
  const suffix = STORAGE_SUFFIXES.ROWS;

  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key || !key.endsWith(suffix)) continue;

    const prefix = key.slice(0, key.length - suffix.length);
    const storedRows = readJson(store, key, []);
    if (!Array.isArray(storedRows) || storedRows.length === 0) continue;

    const matchList = readJson(store, `${prefix}${STORAGE_SUFFIXES.MATCHES}`, []);
    const isSession = prefix.startsWith('pancake_fd_');
    const sessionId = isSession ? prefix.replace(/^pancake_fd_/, '').replace(/_$/, '') : '';

    sessions.push({
      prefix,
      sessionId: sessionId || 'hors-session',
      label: isSession
        ? `Session ${sessionId || 'Fast Direct'}`
        : 'Données locales (sans session)',
      rowCount: storedRows.length,
      matchCount: Array.isArray(matchList) ? matchList.length : 0,
    });
  }

  return sessions.sort((a, b) => b.rowCount - a.rowCount);
}

/** Charge une session identifiée par son préfixe de stockage. */
export function loadLocalSession(prefix, storage) {
  const store = getStorage(storage);
  if (!store) throw new Error('LocalStorage indisponible dans ce navigateur.');
  if (!prefix) throw new Error('Session locale inconnue.');

  const rows = readJson(store, `${prefix}${STORAGE_SUFFIXES.ROWS}`, []);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Aucune action Fast Direct trouvée pour cette session.');
  }

  return buildDataset(
    {
      rows,
      matchList: readJson(store, `${prefix}${STORAGE_SUFFIXES.MATCHES}`, []),
      setterList: readJson(store, `${prefix}${STORAGE_SUFFIXES.SETTERS}`, []),
      sheetConfigs: readJson(store, `${prefix}${STORAGE_SUFFIXES.CONFIGS}`, []),
      teamLineup: readJson(store, `${prefix}${STORAGE_SUFFIXES.LINEUP}`, {}),
    },
    { sourceKind: 'local', label: prefix, exportedAt: null, deviceName: '' }
  );
}

/** Extrait les données d'une sauvegarde Fast Direct (format exportFullBackupJson). */
export function parseBackupPayload(parsed) {
  const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error(
      'Fichier invalide : aucune liste d’actions Fast Direct (clé « rows ») trouvée.'
    );
  }

  return {
    rows: data.rows,
    matchList: Array.isArray(data.matchList) ? data.matchList : [],
    setterList: Array.isArray(data.setterList) ? data.setterList : [],
    sheetConfigs: Array.isArray(data.sheetConfigs) ? data.sheetConfigs : [],
    teamLineup: data.teamLineup && typeof data.teamLineup === 'object' ? data.teamLineup : {},
    exportedAt: parsed?.exportedAt || null,
    deviceName: parsed?.deviceName || '',
    revision: Number(parsed?.revision) || 0,
    version: parsed?.version ?? null,
    app: parsed?.app || '',
  };
}

/** Lit un fichier .json de sauvegarde et retourne un jeu de données normalisé. */
export async function readBackupFile(file) {
  if (!file) throw new Error('Aucun fichier sélectionné.');
  const text = file.text
    ? await file.text()
    : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
        reader.readAsText(file);
      });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Le fichier n’est pas un JSON valide.');
  }

  const payload = parseBackupPayload(parsed);
  return buildDataset(payload, {
    sourceKind: 'file',
    label: file.name || 'Sauvegarde Fast Direct',
    exportedAt: payload.exportedAt,
    deviceName: payload.deviceName,
    revision: payload.revision,
    app: payload.app,
  });
}

/** Normalise toutes les lignes et complète les listes dérivées (matchs, passeurs). */
export function buildDataset(raw, meta = {}) {
  const rows = (raw.rows || []).map((row, index) => normalizeRow(row, index));
  const matchList = unique([...(raw.matchList || []), ...rows.map((row) => row.match)]);
  const derivedSetters = rows.map((row) => row.setter).filter(Boolean);
  const setterList =
    Array.isArray(raw.setterList) && raw.setterList.length > 0
      ? raw.setterList
      : unique(derivedSetters).map((code) => ({ code, name: '' }));

  return {
    rows,
    matchList,
    setterList,
    sheetConfigs: Array.isArray(raw.sheetConfigs) ? raw.sheetConfigs : [],
    teamLineup: raw.teamLineup && typeof raw.teamLineup === 'object' ? raw.teamLineup : {},
    meta: {
      sourceKind: meta.sourceKind || 'unknown',
      label: meta.label || '',
      exportedAt: meta.exportedAt || null,
      deviceName: meta.deviceName || '',
      revision: Number(meta.revision) || 0,
      app: meta.app || '',
      rowCount: rows.length,
      matchCount: matchList.length,
      loadedAt: new Date().toISOString(),
    },
  };
}
