// Client de synchronisation Cloud multi-appareils + Sauvegardes locales & JSON anti-perte

const DEVICE_ID_KEY = 'pancake_dist_device_id_v1';
const DEVICE_NAME_KEY = 'pancake_dist_device_name_v1';
const LOCAL_BACKUPS_KEY = 'pancake_dist_local_backups_v1';
const MAX_LOCAL_BACKUPS = 20;

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
    const raw = localStorage.getItem(LOCAL_BACKUPS_KEY);
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
      localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(candidate));
      return candidate;
    } catch {
      // Si le quota localStorage est atteint, on réduit progressivement l'historique local
      candidate = candidate.slice(0, Math.max(1, candidate.length - 2));
      if (candidate.length === 1) {
        try {
          localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(candidate));
          return candidate;
        } catch {
          return [];
        }
      }
    }
  }
  try {
    localStorage.setItem(LOCAL_BACKUPS_KEY, '[]');
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
  const res = await fetch('/api/state', {
    method: 'GET',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Erreur serveur (${res.status})`);
  }
  return data;
}

export async function pushCloudState({
  state,
  delta,
  lastActionLabel = 'Mise à jour',
  isDestructive = false,
  forceReplace = false,
}) {
  const { deviceId, deviceName } = getDeviceIdentity();
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sync',
      deviceId,
      deviceName,
      lastActionLabel,
      isDestructive,
      forceReplace,
      baseRevision: delta?.baseRevision ?? state?.revision ?? 0,
      delta,
      state,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Erreur synchro (${res.status})`);
  }
  return data;
}

export async function createManualCloudBackup({ label, state }) {
  const { deviceId, deviceName } = getDeviceIdentity();
  const cleanLabel = String(label || '').trim() || `Sauvegarde manuelle`;

  // Toujours créer d'abord une copie locale de secours instantanée
  const localBackups = saveLocalBackupSnapshot(state, cleanLabel, 'manual');

  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_backup',
      deviceId,
      deviceName,
      label: cleanLabel,
      state,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Erreur sauvegarde Cloud (${res.status})`);
  }
  return { ...data, localBackups };
}

export async function restoreCloudBackup(backupId) {
  const { deviceId, deviceName } = getDeviceIdentity();
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'restore_backup',
      deviceId,
      deviceName,
      backupId,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Erreur restauration (${res.status})`);
  }
  return data;
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
