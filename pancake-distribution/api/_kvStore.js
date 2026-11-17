// Backend Cloud Vercel KV / Upstash Redis + Fusion collaborative + Sauvegardes automatiques
import fs from 'node:fs';
import path from 'node:path';

const STATE_KEY = 'pancake:state:v1';
const BACKUPS_META_KEY = 'pancake:backups_meta:v1';
const BACKUP_KEY_PREFIX = 'pancake:backup:';
const MAX_CLOUD_BACKUPS = 30;
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_BACKUP_ACTION_DELTA = 10;

let localKvQueue = Promise.resolve();

function cleanEnvVal(v) {
  return String(v || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

export function getKvCredentials(env = process.env) {
  const url = cleanEnvVal(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
  const token = cleanEnvVal(env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN);
  const valid =
    Boolean(url) &&
    url.startsWith('https://') &&
    !url.includes('[SENSITIVE]') &&
    Boolean(token) &&
    !token.includes('[SENSITIVE]');
  return { url: valid ? url : '', token: valid ? token : '', valid };
}

function runLocalKvCommand(commandArray) {
  const exec = async () => {
    const storeFile = path.resolve(process.cwd(), '.vercel', 'local-cloud-kv.json');
    let db = {};
    try {
      if (fs.existsSync(storeFile)) {
        db = JSON.parse(fs.readFileSync(storeFile, 'utf8') || '{}');
      }
    } catch {
      db = {};
    }

    const [cmd, key, val] = commandArray;
    const upper = String(cmd || '').toUpperCase();
    if (upper === 'PING') return 'PONG';
    if (upper === 'GET') return db[key] ?? null;
    if (upper === 'SET') {
      db[key] = val;
      fs.mkdirSync(path.dirname(storeFile), { recursive: true });
      fs.writeFileSync(storeFile, JSON.stringify(db), 'utf8');
      return 'OK';
    }
    if (upper === 'DEL') {
      const existed = key in db ? 1 : 0;
      delete db[key];
      fs.mkdirSync(path.dirname(storeFile), { recursive: true });
      fs.writeFileSync(storeFile, JSON.stringify(db), 'utf8');
      return existed;
    }
    return null;
  };

  localKvQueue = localKvQueue.then(exec, exec);
  return localKvQueue;
}

export async function kvCommand(env, commandArray) {
  const { url, token, valid } = getKvCredentials(env);
  if (!valid) {
    return runLocalKvCommand(commandArray);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commandArray),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Erreur Vercel KV (${res.status}): ${txt || res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Erreur Redis: ${data.error}`);
  }
  return data.result;
}

async function kvGetJson(env, key) {
  const raw = await kvCommand(env, ['GET', key]);
  if (!raw) return null;
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  return raw;
}

async function kvSetJson(env, key, value) {
  return kvCommand(env, ['SET', key, JSON.stringify(value)]);
}

function getRowUid(row, idx = 0) {
  if (row?.uid) return String(row.uid);
  if (row?.id !== undefined && row?.id !== null && row?.id !== '') {
    return `legacy_${row.id}`;
  }
  return `idx_${idx}`;
}

function normalizeServerState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    revision: Number(raw.revision) || 1,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: raw.updatedBy || 'server',
    updatedByName: raw.updatedByName || 'Appareil',
    lastActionLabel: raw.lastActionLabel || 'Mise à jour',
    rows: Array.isArray(raw.rows)
      ? raw.rows.map((r, i) => ({ ...r, uid: getRowUid(r, i) }))
      : [],
    matchList: Array.isArray(raw.matchList) ? raw.matchList : [],
    setterList: Array.isArray(raw.setterList) ? raw.setterList : [],
    sheetConfigs: Array.isArray(raw.sheetConfigs) ? raw.sheetConfigs : [],
    teamLineup: raw.teamLineup && typeof raw.teamLineup === 'object' ? raw.teamLineup : {},
    recentDeletedUids: Array.isArray(raw.recentDeletedUids) ? raw.recentDeletedUids : [],
    recentDeletedMatches: Array.isArray(raw.recentDeletedMatches) ? raw.recentDeletedMatches : [],
    recentDeletedSetters: Array.isArray(raw.recentDeletedSetters) ? raw.recentDeletedSetters : [],
    recentDeletedSheetIds: Array.isArray(raw.recentDeletedSheetIds)
      ? raw.recentDeletedSheetIds
      : [],
  };
}

function toSnapshotPayload(state) {
  return {
    rows: state.rows || [],
    matchList: state.matchList || [],
    setterList: state.setterList || [],
    sheetConfigs: state.sheetConfigs || [],
    teamLineup: state.teamLineup || {},
  };
}

async function appendCloudBackup(env, state, { label, reason = 'auto', deviceName = 'Appareil' }) {
  if (!state) return null;
  const now = new Date().toISOString();
  const backupId = `bkp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const snapshot = {
    id: backupId,
    label: label || 'Sauvegarde automatique',
    reason, // 'manual' | 'safety' | 'auto' | 'init'
    createdAt: now,
    createdBy: deviceName || state.updatedByName || 'Appareil',
    revision: Number(state.revision) || 1,
    actionCount: (state.rows || []).length,
    matchCount: (state.matchList || []).length,
    setterCount: (state.setterList || []).length,
    sheetCount: (state.sheetConfigs || []).length,
    data: toSnapshotPayload(state),
  };

  await kvSetJson(env, `${BACKUP_KEY_PREFIX}${backupId}`, snapshot);

  const metaEntry = {
    id: snapshot.id,
    label: snapshot.label,
    reason: snapshot.reason,
    createdAt: snapshot.createdAt,
    createdBy: snapshot.createdBy,
    revision: snapshot.revision,
    actionCount: snapshot.actionCount,
    matchCount: snapshot.matchCount,
    setterCount: snapshot.setterCount,
    sheetCount: snapshot.sheetCount,
  };

  const existingMeta = (await kvGetJson(env, BACKUPS_META_KEY)) || [];
  const nextMeta = [metaEntry, ...existingMeta];
  const kept = nextMeta.slice(0, MAX_CLOUD_BACKUPS);
  const dropped = nextMeta.slice(MAX_CLOUD_BACKUPS);

  await kvSetJson(env, BACKUPS_META_KEY, kept);

  // Nettoyage des très anciens snapshots au-delà de MAX_CLOUD_BACKUPS
  for (const old of dropped) {
    if (old?.id) {
      await kvCommand(env, ['DEL', `${BACKUP_KEY_PREFIX}${old.id}`]).catch(() => {});
    }
  }

  return { backupMeta: kept, createdEntry: metaEntry };
}

function trimTombstones(list) {
  return Array.isArray(list) ? list.slice(-500) : [];
}

function mergeStates(serverState, clientState, delta = {}) {
  const baseRev = Number(delta.baseRevision) || 0;
  const deletedRowSet = new Set(delta.deletedRowUids || []);
  const addedRowSet = new Set(delta.addedRowUids || []);
  const updatedRowSet = new Set(delta.updatedRowUids || []);

  // Lignes supprimées côté serveur depuis que le client a lu l'état
  const serverDeletedSinceBase = new Set(
    (serverState.recentDeletedUids || [])
      .filter((t) => Number(t.rev) > baseRev)
      .map((t) => t.uid)
  );

  const clientRowsMap = new Map();
  (clientState.rows || []).forEach((r, idx) => {
    const uid = getRowUid(r, idx);
    clientRowsMap.set(uid, { ...r, uid });
  });

  const mergedRows = [];
  const seenUids = new Set();

  // 1. Parcourir les lignes serveur existantes
  (serverState.rows || []).forEach((sRow, idx) => {
    const uid = getRowUid(sRow, idx);
    if (deletedRowSet.has(uid)) {
      return; // Supprimée par ce client
    }
    if (updatedRowSet.has(uid) && clientRowsMap.has(uid)) {
      mergedRows.push(clientRowsMap.get(uid));
    } else {
      mergedRows.push({ ...sRow, uid });
    }
    seenUids.add(uid);
  });

  // 2. Ajouter les lignes créées sur ce client et pas encore sur le serveur
  (clientState.rows || []).forEach((cRow, idx) => {
    const uid = getRowUid(cRow, idx);
    if (seenUids.has(uid)) return;
    if (deletedRowSet.has(uid)) return;
    if (serverDeletedSinceBase.has(uid) && !addedRowSet.has(uid)) return;
    mergedRows.push({ ...cRow, uid });
    seenUids.add(uid);
  });

  // 3. Appliquer d'éventuels renommages de matchs du client sur les lignes serveur ajoutées en parallèle
  const renamedMatches = Array.isArray(delta.renamedMatches) ? delta.renamedMatches : [];
  const deletedMatchSet = new Set(
    (delta.deletedMatches || []).map((m) => String(m).trim().toUpperCase())
  );
  const deletedSetterSet = new Set(
    (delta.deletedSetters || []).map((s) => String(s).trim().toUpperCase())
  );

  let finalRows = mergedRows;
  if (renamedMatches.length > 0 || deletedMatchSet.size > 0 || deletedSetterSet.size > 0) {
    finalRows = mergedRows
      .filter((r) => {
        const mUp = String(r.match || '').trim().toUpperCase();
        const sUp = String(r.setter || '').trim().toUpperCase();
        if (deletedMatchSet.has(mUp)) return false;
        if (deletedSetterSet.has(sUp)) return false;
        return true;
      })
      .map((r) => {
        let nextMatch = r.match;
        renamedMatches.forEach(({ from, to }) => {
          if (String(nextMatch || '').trim().toUpperCase() === String(from).trim().toUpperCase()) {
            nextMatch = String(to).trim().toUpperCase();
          }
        });
        return nextMatch !== r.match ? { ...r, match: nextMatch } : r;
      });
  }

  // 4. Fusionner matchList
  const serverDeletedMatchesSinceBase = new Set(
    (serverState.recentDeletedMatches || [])
      .filter((t) => Number(t.rev) > baseRev)
      .map((t) => String(t.name).toUpperCase())
  );
  const addedMatchSet = new Set(
    (delta.addedMatches || []).map((m) => String(m).trim().toUpperCase())
  );

  const mergedMatchList = [];
  const seenMatches = new Set();
  const pushMatch = (m) => {
    let val = String(m || '').trim().toUpperCase();
    renamedMatches.forEach(({ from, to }) => {
      if (val === String(from).trim().toUpperCase()) {
        val = String(to).trim().toUpperCase();
      }
    });
    if (!val || deletedMatchSet.has(val) || seenMatches.has(val)) return;
    seenMatches.add(val);
    mergedMatchList.push(val);
  };
  (serverState.matchList || []).forEach(pushMatch);
  (clientState.matchList || []).forEach((m) => {
    const up = String(m || '').trim().toUpperCase();
    if (serverDeletedMatchesSinceBase.has(up) && !addedMatchSet.has(up)) return;
    pushMatch(m);
  });

  // 5. Fusionner setterList
  const serverDeletedSettersSinceBase = new Set(
    (serverState.recentDeletedSetters || [])
      .filter((t) => Number(t.rev) > baseRev)
      .map((t) => String(t.code).toUpperCase())
  );
  const addedSetterSet = new Set(
    (delta.addedSetters || []).map((s) => String(s).trim().toUpperCase())
  );
  const mergedSetters = [];
  const seenSetters = new Set();
  (serverState.setterList || []).forEach((s) => {
    const code = String(s?.code || '').trim().toUpperCase();
    if (!code || code === 'NP' || deletedSetterSet.has(code) || seenSetters.has(code)) return;
    seenSetters.add(code);
    mergedSetters.push({ code, name: String(s?.name || '').trim().toUpperCase() });
  });
  (clientState.setterList || []).forEach((s) => {
    const code = String(s?.code || '').trim().toUpperCase();
    if (!code || code === 'NP' || deletedSetterSet.has(code)) return;
    if (serverDeletedSettersSinceBase.has(code) && !addedSetterSet.has(code)) return;
    if (seenSetters.has(code)) {
      const idx = mergedSetters.findIndex((x) => x.code === code);
      if (idx >= 0 && s?.name && !mergedSetters[idx].name) {
        mergedSetters[idx].name = String(s.name).trim().toUpperCase();
      }
      return;
    }
    seenSetters.add(code);
    mergedSetters.push({ code, name: String(s?.name || '').trim().toUpperCase() });
  });

  // 6. Fusionner sheetConfigs
  const deletedSheetSet = new Set(delta.deletedSheetIds || []);
  const serverDeletedSheetsSinceBase = new Set(
    (serverState.recentDeletedSheetIds || [])
      .filter((t) => Number(t.rev) > baseRev)
      .map((t) => t.id)
  );
  const updatedSheetSet = new Set(delta.updatedSheetIds || []);
  const clientSheetMap = new Map((clientState.sheetConfigs || []).map((c) => [c.id, c]));

  const mergedSheets = [];
  const seenSheets = new Set();
  (serverState.sheetConfigs || []).forEach((sCfg) => {
    if (!sCfg?.id || deletedSheetSet.has(sCfg.id)) return;
    const baseCfg =
      updatedSheetSet.has(sCfg.id) && clientSheetMap.has(sCfg.id)
        ? clientSheetMap.get(sCfg.id)
        : sCfg;
    const cleanedMatches = [];
    const seenM = new Set();
    (baseCfg.matches || []).forEach((m) => {
      let val = String(m || '').trim().toUpperCase();
      renamedMatches.forEach(({ from, to }) => {
        if (val === String(from).trim().toUpperCase()) val = String(to).trim().toUpperCase();
      });
      if (val && !deletedMatchSet.has(val) && !seenM.has(val)) {
        seenM.add(val);
        cleanedMatches.push(val);
      }
    });
    seenSheets.add(baseCfg.id);
    mergedSheets.push({ ...baseCfg, matches: cleanedMatches });
  });
  (clientState.sheetConfigs || []).forEach((cCfg) => {
    if (!cCfg?.id || seenSheets.has(cCfg.id) || deletedSheetSet.has(cCfg.id)) return;
    if (serverDeletedSheetsSinceBase.has(cCfg.id)) return;
    seenSheets.add(cCfg.id);
    mergedSheets.push(cCfg);
  });

  // 7. teamLineup
  const mergedLineup = delta.lineupChanged
    ? clientState.teamLineup || serverState.teamLineup
    : serverState.teamLineup || clientState.teamLineup;

  return {
    rows: finalRows,
    matchList: mergedMatchList,
    setterList: mergedSetters,
    sheetConfigs: mergedSheets,
    teamLineup: mergedLineup,
  };
}

export async function handleApiGet(env, query = {}) {
  if (query.backupId) {
    const backup = await kvGetJson(env, `${BACKUP_KEY_PREFIX}${query.backupId}`);
    if (!backup) {
      return { status: 404, body: { ok: false, error: 'Sauvegarde introuvable.' } };
    }
    return { status: 200, body: { ok: true, backup } };
  }

  const [rawState, rawMeta] = await Promise.all([
    kvGetJson(env, STATE_KEY),
    kvGetJson(env, BACKUPS_META_KEY),
  ]);

  return {
    status: 200,
    body: {
      ok: true,
      state: normalizeServerState(rawState),
      backupsMeta: Array.isArray(rawMeta) ? rawMeta : [],
    },
  };
}

export async function handleApiPost(env, payload = {}) {
  const action = payload.action || 'sync';

  if (action === 'create_backup') {
    let targetState = normalizeServerState(await kvGetJson(env, STATE_KEY));
    if (!targetState && payload.state) {
      targetState = normalizeServerState({
        ...payload.state,
        revision: 1,
        updatedBy: payload.deviceId || 'client',
        updatedByName: payload.deviceName || 'Appareil',
        lastActionLabel: payload.label || 'Sauvegarde manuelle',
      });
      await kvSetJson(env, STATE_KEY, targetState);
    }
    if (!targetState) {
      return { status: 400, body: { ok: false, error: 'Aucune donnée à sauvegarder.' } };
    }
    const { backupMeta, createdEntry } = await appendCloudBackup(env, targetState, {
      label: payload.label || `Sauvegarde manuelle`,
      reason: 'manual',
      deviceName: payload.deviceName || 'Appareil',
    });
    return { status: 200, body: { ok: true, state: targetState, backupsMeta: backupMeta, createdEntry } };
  }

  if (action === 'restore_backup') {
    const backupId = payload.backupId;
    if (!backupId) {
      return { status: 400, body: { ok: false, error: 'Identifiant de sauvegarde manquant.' } };
    }
    const backup = await kvGetJson(env, `${BACKUP_KEY_PREFIX}${backupId}`);
    if (!backup || !backup.data) {
      return { status: 404, body: { ok: false, error: 'Sauvegarde introuvable dans le Cloud.' } };
    }

    const currentServer = normalizeServerState(await kvGetJson(env, STATE_KEY));
    if (currentServer) {
      await appendCloudBackup(env, currentServer, {
        label: `Avant restauration ("${backup.label}")`,
        reason: 'safety',
        deviceName: payload.deviceName || 'Appareil',
      });
    }

    const nextRev = (currentServer?.revision || 0) + 1;
    const restoredState = normalizeServerState({
      ...backup.data,
      revision: nextRev,
      updatedAt: new Date().toISOString(),
      updatedBy: payload.deviceId || 'client',
      updatedByName: payload.deviceName || 'Appareil',
      lastActionLabel: `Restauration : ${backup.label}`,
      recentDeletedUids: [],
      recentDeletedMatches: [],
      recentDeletedSetters: [],
      recentDeletedSheetIds: [],
    });

    await kvSetJson(env, STATE_KEY, restoredState);
    const backupsMeta = (await kvGetJson(env, BACKUPS_META_KEY)) || [];

    return { status: 200, body: { ok: true, state: restoredState, backupsMeta } };
  }

  // Action par défaut : 'sync'
  const clientState = payload.state || {};
  const delta = payload.delta || {};
  const deviceId = payload.deviceId || 'device';
  const deviceName = payload.deviceName || 'Appareil';
  const lastActionLabel = payload.lastActionLabel || 'Mise à jour';
  const isDestructive = Boolean(payload.isDestructive);
  const forceReplace = Boolean(payload.forceReplace);

  const serverState = normalizeServerState(await kvGetJson(env, STATE_KEY));
  let backupsMeta = (await kvGetJson(env, BACKUPS_META_KEY)) || [];

  if (!serverState) {
    // Première initialisation du Cloud
    const initState = normalizeServerState({
      ...clientState,
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: deviceId,
      updatedByName: deviceName,
      lastActionLabel: lastActionLabel || 'Initialisation Cloud',
    });
    await kvSetJson(env, STATE_KEY, initState);
    const bkp = await appendCloudBackup(env, initState, {
      label: 'Initialisation Cloud',
      reason: 'init',
      deviceName,
    });
    return {
      status: 200,
      body: { ok: true, state: initState, backupsMeta: bkp.backupMeta, merged: false },
    };
  }

  // Sauvegarde automatique pré-modification si opération sensible ou périodique
  if (isDestructive || forceReplace) {
    const bkp = await appendCloudBackup(env, serverState, {
      label: `Sécurité avant : ${lastActionLabel}`,
      reason: 'safety',
      deviceName,
    });
    backupsMeta = bkp.backupMeta;
  } else {
    const latestMeta = backupsMeta[0];
    const ageMs = latestMeta?.createdAt ? Date.now() - Date.parse(latestMeta.createdAt) : Infinity;
    const countDiff = Math.abs(
      (clientState.rows?.length || 0) - (latestMeta?.actionCount ?? -999)
    );
    if (!latestMeta || countDiff >= AUTO_BACKUP_ACTION_DELTA || ageMs >= AUTO_BACKUP_INTERVAL_MS) {
      const bkp = await appendCloudBackup(env, serverState, {
        label: `Sauvegarde auto (${serverState.rows.length} act.)`,
        reason: 'auto',
        deviceName: serverState.updatedByName || deviceName,
      });
      backupsMeta = bkp.backupMeta;
    }
  }

  const baseRevision = Number(delta.baseRevision ?? payload.baseRevision) || 0;
  const needsMerge = !forceReplace && baseRevision < serverState.revision;

  let nextData;
  if (needsMerge) {
    nextData = mergeStates(serverState, clientState, { ...delta, baseRevision });
  } else {
    nextData = {
      rows: (clientState.rows || []).map((r, i) => ({ ...r, uid: getRowUid(r, i) })),
      matchList: clientState.matchList || [],
      setterList: clientState.setterList || [],
      sheetConfigs: clientState.sheetConfigs || [],
      teamLineup: clientState.teamLineup || {},
    };
  }

  const nextRev = serverState.revision + 1;

  // Enregistrement des suppressions récentes pour éviter résurrections lors d'un merge concurrent
  const nextDeletedUids = trimTombstones([
    ...(forceReplace ? [] : serverState.recentDeletedUids || []),
    ...(delta.deletedRowUids || []).map((uid) => ({ uid, rev: nextRev })),
  ]);
  const nextDeletedMatches = trimTombstones([
    ...(forceReplace ? [] : serverState.recentDeletedMatches || []),
    ...(delta.deletedMatches || []).map((name) => ({ name, rev: nextRev })),
  ]);
  const nextDeletedSetters = trimTombstones([
    ...(forceReplace ? [] : serverState.recentDeletedSetters || []),
    ...(delta.deletedSetters || []).map((code) => ({ code, rev: nextRev })),
  ]);
  const nextDeletedSheetIds = trimTombstones([
    ...(forceReplace ? [] : serverState.recentDeletedSheetIds || []),
    ...(delta.deletedSheetIds || []).map((id) => ({ id, rev: nextRev })),
  ]);

  const nextState = normalizeServerState({
    ...nextData,
    revision: nextRev,
    updatedAt: new Date().toISOString(),
    updatedBy: deviceId,
    updatedByName: deviceName,
    lastActionLabel,
    recentDeletedUids: nextDeletedUids,
    recentDeletedMatches: nextDeletedMatches,
    recentDeletedSetters: nextDeletedSetters,
    recentDeletedSheetIds: nextDeletedSheetIds,
  });

  await kvSetJson(env, STATE_KEY, nextState);

  return {
    status: 200,
    body: {
      ok: true,
      state: nextState,
      backupsMeta,
      merged: needsMerge,
    },
  };
}
