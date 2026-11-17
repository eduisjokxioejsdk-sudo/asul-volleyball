// Client de synchronisation Cloud multi-appareils + Sauvegardes locales & JSON anti-perte
import { liveAPI } from '../../../services/api';

const DEVICE_ID_KEY = 'pancake_dist_device_id_v1';
const DEVICE_NAME_KEY = 'pancake_dist_device_name_v1';
const LOCAL_BACKUPS_KEY = 'pancake_dist_local_backups_v1';
const MAX_LOCAL_BACKUPS = 20;

let fastDirectSessionId = '';
let fastDirectLastRevision = 0;

/** Lie ce module à la session Fast Direct actuellement ouverte. */
export function configureFastDirectSync({ sessionId }) {
  fastDirectSessionId = String(sessionId || '');
  fastDirectLastRevision = 0;
}

function localBackupsStorageKey() {
  return fastDirectSessionId ? `${LOCAL_BACKUPS_KEY}_${fastDirectSessionId}` : LOCAL_BACKUPS_KEY;
}

export function getDeviceIdentity() {
  let deviceId = '';
  let deviceName = '';
  try {
    deviceId = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!deviceId) {
      deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    deviceName = localStorage.getItem(DEVICE_NAME_KEY) || '';
    if (!deviceName) {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isTabletOrMobile = /iPad|Android|Tablet|Mobile/i.test(ua);
      deviceName = isTabletOrMobile
        ? `Tablette (${deviceId.slice(-4).toUpperCase()})`
        : `Poste (${deviceId.slice(-4).toUpperCase()})`;
      localStorage.setItem(DEVICE_NAME_KEY, deviceName);
    }
  } catch {
    deviceId = deviceId || `dev_${Math.random().toString(36).slice(2, 7)}`;
    deviceName = deviceName || 'Appareil';
  }
  return { deviceId, deviceName };
}

export function setDeviceName(newName) {
  const clean = String(newName || '').trim().slice(0, 40);
  if (!clean) return getDeviceIdentity().deviceName;
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    // ignore
  }
  return clean;
}

export function getLocalBackups() {
  try {
    const raw = localStorage.getItem(localBackupsStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalBackupsSafely(list) {
  let candidate = list.slice(0, MAX_LOCAL_BACKUPS);
  while (candidate.length > 0) {
    try {
      localStorage.setItem(localBackupsStorageKey(), JSON.stringify(candidate));
      return candidate;
    } catch {
      // Si le quota localStorage est atteint, on réduit progressivement l'historique local
      candidate = candidate.slice(0, Math.max(1, candidate.length - 2));
      if (candidate.length === 1) {
        try {
          localStorage.setItem(localBackupsStorageKey(), JSON.stringify(candidate));
          return candidate;
        } catch {
          return [];
        }
      }
    }
  }
  try {
    localStorage.setItem(localBackupsStorageKey(), '[]');
  } catch {
    // ignore
  }
  return [];
}

export function saveLocalBackupSnapshot(state, label = 'Sauvegarde locale', reason = 'auto') {
  if (!state || typeof state !== 'object') return getLocalBackups();
  const { deviceName } = getDeviceIdentity();
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const matchList = Array.isArray(state.matchList) ? state.matchList : [];
  const setterList = Array.isArray(state.setterList) ? state.setterList : [];
  const sheetConfigs = Array.isArray(state.sheetConfigs) ? state.sheetConfigs : [];
  const teamLineup = state.teamLineup && typeof state.teamLineup === 'object' ? state.teamLineup : {};

  const existing = getLocalBackups();
  const entry = {
    id: `lbkp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    reason,
    createdAt: new Date().toISOString(),
    createdBy: deviceName,
    revision: Number(state.revision) || 0,
    actionCount: rows.length,
    matchCount: matchList.length,
    setterCount: setterList.length,
    sheetCount: sheetConfigs.length,
    isLocal: true,
    data: {
      rows,
      matchList,
      setterList,
      sheetConfigs,
      teamLineup,
    },
  };

  return persistLocalBackupsSafely([entry, ...existing]);
}

export function createEmptyDelta(baseRevision = 0) {
  return {
    baseRevision,
    addedRowUids: [],
    updatedRowUids: [],
    deletedRowUids: [],
    addedMatches: [],
    deletedMatches: [],
    renamedMatches: [],
    addedSetters: [],
    deletedSetters: [],
    updatedSheetIds: [],
    deletedSheetIds: [],
    lineupChanged: false,
  };
}

export async function fetchCloudState() {
  if (!fastDirectSessionId) throw new Error('Session Fast Direct non configurée.');
  const res = await liveAPI.getFastDirectState(fastDirectSessionId);
  fastDirectLastRevision = Number(res.data?.revision) || 0;
  return {
    ok: true,
    state: res.data?.state || null,
    revision: fastDirectLastRevision,
    backupsMeta: [],
  };
}

export function mergeFastDirectStates(remote, local, delta = {}, forceReplace = false) {
  const remoteState = remote && typeof remote === 'object' ? remote : {};
  const localState = local && typeof local === 'object' ? local : {};
  const arrays = (value) => (Array.isArray(value) ? value : []);
  const rowKey = (row) => String(row?.uid || row?.id || '');
  const hasAny = (value) => Array.isArray(value) && value.length > 0;

  if (forceReplace) return localState;

  const renamed = arrays(delta.renamedMatches);
  const renamedTargets = new Set(
    renamed.flatMap((item) => [item?.from, item?.to].filter(Boolean).map(String))
  );
  const touchedRows = new Set([
    ...arrays(delta.addedRowUids).map(String),
    ...arrays(delta.updatedRowUids).map(String),
  ]);
  const deletedRows = new Set(arrays(delta.deletedRowUids).map(String));

  const rowsByUid = new Map(
    arrays(remoteState.rows).map((row, index) => [rowKey(row) || `remote_${index}`, row])
  );
  const localRowsByUid = new Map(
    arrays(localState.rows).map((row, index) => [rowKey(row) || `local_${index}`, row])
  );
  localRowsByUid.forEach((row, uid) => {
    const renamedMatch =
      renamedTargets.size > 0 &&
      [...renamedTargets].some((name) => String(row.match || '').toUpperCase() === name);
    if (touchedRows.has(uid) || renamedMatch) rowsByUid.set(uid, row);
  });
  deletedRows.forEach((uid) => rowsByUid.delete(uid));

  // Matchs : retirer les suppressions, puis ajouter/renommer depuis la version locale.
  const matchMap = new Map(arrays(remoteState.matchList).map((m) => [String(m).toUpperCase(), m]));
  arrays(delta.deletedMatches).forEach((m) => matchMap.delete(String(m).toUpperCase()));
  arrays(delta.addedMatches).forEach((m) => matchMap.set(String(m).toUpperCase(), m));
  renamed.forEach((item) => {
    if (!item?.from || !item?.to) return;
    matchMap.delete(String(item.from).toUpperCase());
    matchMap.set(String(item.to).toUpperCase(), item.to);
  });

  const setterMap = new Map(
    arrays(remoteState.setterList).map((s) => [String(s?.code || '').toUpperCase(), s])
  );
  arrays(delta.deletedSetters).forEach((code) =>
    setterMap.delete(String(code).toUpperCase())
  );
  const localSetters = new Map(
    arrays(localState.setterList).map((s) => [String(s?.code || '').toUpperCase(), s])
  );
  arrays(delta.addedSetters).forEach((code) => {
    const item = localSetters.get(String(code).toUpperCase());
    if (item) setterMap.set(String(code).toUpperCase(), item);
  });

  const sheetMap = new Map(
    arrays(remoteState.sheetConfigs).map((sheet) => [String(sheet?.id || ''), sheet])
  );
  const localSheets = new Map(
    arrays(localState.sheetConfigs).map((sheet) => [String(sheet?.id || ''), sheet])
  );
  arrays(delta.deletedSheetIds).forEach((id) => sheetMap.delete(String(id)));
  arrays(delta.updatedSheetIds).forEach((id) => {
    const sheet = localSheets.get(String(id));
    if (sheet) sheetMap.set(String(id), sheet);
  });

  const hasDelta = Boolean(
    hasAny(delta.addedRowUids) ||
      hasAny(delta.updatedRowUids) ||
      hasAny(delta.deletedRowUids) ||
      hasAny(delta.addedMatches) ||
      hasAny(delta.deletedMatches) ||
      renamed.length > 0 ||
      hasAny(delta.addedSetters) ||
      hasAny(delta.deletedSetters) ||
      hasAny(delta.updatedSheetIds) ||
      hasAny(delta.deletedSheetIds) ||
      delta.lineupChanged
  );

  return {
    rows: hasDelta || arrays(remoteState.rows).length === 0 ? [...rowsByUid.values()] : arrays(remoteState.rows),
    matchList: hasDelta ? [...matchMap.values()] : arrays(remoteState.matchList),
    setterList: hasDelta ? [...setterMap.values()] : arrays(remoteState.setterList),
    sheetConfigs: hasDelta ? [...sheetMap.values()] : arrays(remoteState.sheetConfigs),
    teamLineup:
      forceReplace || delta.lineupChanged
        ? localState.teamLineup || {}
        : remoteState.teamLineup || localState.teamLineup || {},
  };
}

export async function pushCloudState({
  state,
  delta,
  lastActionLabel = 'Mise à jour',
  isDestructive = false,
  forceReplace = false,
}) {
  if (!fastDirectSessionId) throw new Error('Session Fast Direct non configurée.');
  const baseRevision = Number(delta?.baseRevision ?? state?.revision ?? fastDirectLastRevision) || 0;
  try {
    const res = await liveAPI.saveFastDirectState(fastDirectSessionId, {
      state,
      baseRevision,
      lastActionLabel,
      isDestructive,
      forceReplace,
    });
    fastDirectLastRevision = Number(res.data?.revision) || baseRevision + 1;
    return { ok: true, ...(res.data || {}), backupsMeta: [] };
  } catch (err) {
    // Conflit : fusionner uniquement les changements locaux identifiés par le
    // delta, puis réessayer sur la révision renvoyée par l'hôte.
    if (err?.response?.status === 409 && err.response.data?.state) {
      const remote = err.response.data.state;
      const remoteRevision = Number(err.response.data.revision) || Number(remote.revision) || 0;
      const merged = mergeFastDirectStates(remote, state, delta, forceReplace);
      const retry = await liveAPI.saveFastDirectState(fastDirectSessionId, {
        state: merged,
        baseRevision: remoteRevision,
        lastActionLabel,
        isDestructive,
        forceReplace,
      });
      fastDirectLastRevision = Number(retry.data?.revision) || remoteRevision + 1;
      return { ok: true, merged: true, ...(retry.data || {}), backupsMeta: [] };
    }
    throw new Error(err?.response?.data?.error || err?.message || 'Erreur de synchronisation Fast Direct.');
  }
}

export async function createManualCloudBackup({ label, state }) {
  const cleanLabel = String(label || '').trim() || 'Sauvegarde manuelle';
  // Toute sauvegarde Fast Direct est conservée localement, par session.
  const localBackups = saveLocalBackupSnapshot(state, cleanLabel, 'manual');
  return { ok: true, localBackups, backupsMeta: [] };
}

export async function restoreCloudBackup() {
  throw new Error('Utilisez une sauvegarde locale Fast Direct.');
}

export function exportFullBackupJson(state) {
  const { deviceName } = getDeviceIdentity();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours()
  )}h${pad(now.getMinutes())}`;

  const payload = {
    app: 'pancake-distribution',
    version: 1,
    exportedAt: now.toISOString(),
    deviceName,
    revision: state.revision || 0,
    data: {
      rows: state.rows || [],
      matchList: state.matchList || [],
      setterList: state.setterList || [],
      sheetConfigs: state.sheetConfigs || [],
      teamLineup: state.teamLineup || {},
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sauvegarde_volley_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importFullBackupJson(file) {
  const text = file.text
    ? await file.text()
    : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Erreur lecture fichier'));
        reader.readAsText(file);
      });
  const parsed = JSON.parse(text);
  const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error('Fichier de sauvegarde .json invalide (liste actions manquante).');
  }
  return {
    rows: data.rows,
    matchList: Array.isArray(data.matchList) ? data.matchList : [],
    setterList: Array.isArray(data.setterList) ? data.setterList : [],
    sheetConfigs: Array.isArray(data.sheetConfigs) ? data.sheetConfigs : [],
    teamLineup: data.teamLineup && typeof data.teamLineup === 'object' ? data.teamLineup : {},
    exportedAt: parsed.exportedAt || null,
  };
}
