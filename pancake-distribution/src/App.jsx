import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Tablet,
  Table2,
  FileSpreadsheet,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Cloud,
  CloudOff,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import initialSaisieRows from './data/initialSaisieRows.json';
import {
  J123_MATCHES_DEFAULT,
  J456_MATCHES_DEFAULT,
  DEFAULT_SETTER_LIST,
  DEFAULT_TEAM_LINEUP,
  formatSetterLabel,
  filterRowsForPreset,
  normalizeRow,
} from './utils/scoutingEngine';
import {
  exportWorkbookIdenticalToOriginal,
  importSaisieFromExcelFile,
} from './utils/excelExporter';
import {
  getDeviceIdentity,
  setDeviceName as persistDeviceName,
  getLocalBackups,
  saveLocalBackupSnapshot,
  createEmptyDelta,
  fetchCloudState,
  pushCloudState,
  createManualCloudBackup,
  restoreCloudBackup,
  exportFullBackupJson,
  importFullBackupJson,
} from './utils/cloudSync';
import TabletSaisieView from './components/TabletSaisieView';
import SaisieSheetView from './components/SaisieSheetView';
import SetterAnalysisSheetView from './components/SetterAnalysisSheetView';
import CloudBackupModal from './components/CloudBackupModal';

const STORAGE_KEYS = {
  ROWS: 'pancake_dist_rows_v1',
  MATCHES: 'pancake_dist_matches_v2',
  CONFIGS: 'pancake_dist_sheet_configs_v2',
  SETTERS: 'pancake_dist_setters_v1',
  LINEUP: 'pancake_dist_team_lineup_v1',
  CLOUD_META: 'pancake_dist_cloud_meta_v1',
  PENDING_OPS: 'pancake_dist_pending_ops_v1',
};

const DEFAULT_MATCH_LIST = [...J123_MATCHES_DEFAULT, ...J456_MATCHES_DEFAULT];

const DEFAULT_SHEET_CONFIGS = [
  { id: 'PAUL', title: 'PAUL', setter: '6', matches: [...J123_MATCHES_DEFAULT] },
  { id: 'MARCUS', title: 'MARCUS', setter: '3', matches: [...J123_MATCHES_DEFAULT] },
  { id: 'PAUL_J123', title: 'PAUL J1,2,3', setter: '6', matches: [...J123_MATCHES_DEFAULT] },
  { id: 'PAUL_J456', title: 'PAUL J4,5,6', setter: '6', matches: [...J456_MATCHES_DEFAULT] },
  { id: 'MARCUS_J123', title: 'MARCUS J1,2,3', setter: '3', matches: [...J123_MATCHES_DEFAULT] },
  { id: 'MARCUS_J456', title: 'MARCUS J4,5,6', setter: '3', matches: [...J456_MATCHES_DEFAULT] },
];

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore storage errors
  }
  return fallback;
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function uniquePush(base = [], extras = []) {
  if (!extras || extras.length === 0) return base;
  const seen = new Set(base);
  const out = [...base];
  extras.forEach((v) => {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  });
  return out;
}

export default function App() {
  const initialRows = useMemo(() => {
    const saved = readJsonStorage(STORAGE_KEYS.ROWS, null);
    if (Array.isArray(saved)) return saved.map((r, i) => normalizeRow(r, i));
    return initialSaisieRows.map((r, i) => normalizeRow(r, i));
  }, []);

  const initialMatches = useMemo(() => {
    const saved = readJsonStorage(STORAGE_KEYS.MATCHES, null);
    return Array.isArray(saved) ? saved : [...DEFAULT_MATCH_LIST];
  }, []);

  const initialConfigs = useMemo(() => {
    const saved = readJsonStorage(STORAGE_KEYS.CONFIGS, null);
    if (Array.isArray(saved)) return saved;
    return DEFAULT_SHEET_CONFIGS.map((c) => ({ ...c, matches: [...c.matches] }));
  }, []);

  const initialSetters = useMemo(() => {
    const saved = readJsonStorage(STORAGE_KEYS.SETTERS, null);
    if (Array.isArray(saved)) return saved;
    return DEFAULT_SETTER_LIST.map((s) => ({ ...s }));
  }, []);

  const initialLineup = useMemo(() => {
    const saved = readJsonStorage(STORAGE_KEYS.LINEUP, null);
    if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) return saved;
    return DEFAULT_TEAM_LINEUP;
  }, []);

  const initialCloudMeta = useMemo(
    () =>
      readJsonStorage(STORAGE_KEYS.CLOUD_META, {
        revision: 0,
        updatedAt: null,
        updatedByName: '',
        lastActionLabel: '',
      }),
    []
  );

  const [rows, setRows] = useState(initialRows);
  const [matchList, setMatchList] = useState(initialMatches);
  const [sheetConfigs, setSheetConfigs] = useState(initialConfigs);
  const [setterList, setSetterList] = useState(initialSetters);
  const [teamLineup, setTeamLineup] = useState(initialLineup);

  const [cloudStatus, setCloudStatus] = useState(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing'
  );
  const [cloudMeta, setCloudMeta] = useState(() => ({
    ...initialCloudMeta,
    errorMsg: '',
    hasPending: Boolean(readJsonStorage(STORAGE_KEYS.PENDING_OPS, null)?.hasPending),
  }));
  const [cloudBackups, setCloudBackups] = useState([]);
  const [localBackups, setLocalBackups] = useState(() => getLocalBackups());
  const [deviceName, setDeviceNameState] = useState(() => getDeviceIdentity().deviceName);
  const [showCloudModal, setShowCloudModal] = useState(false);

  const [activeTab, setActiveTab] = useState('tablet');
  const [customFilter, setCustomFilter] = useState({
    setter: '6',
    selectedMatches: [],
  });
  const [isExporting, setIsExporting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);
  const [resetModal, setResetModal] = useState(null); // null | 'blank' | 'original'
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState('');
  const [newSheetSetter, setNewSheetSetter] = useState('6');
  const fileInputRef = useRef(null);

  // Refs synchrones pour garantir cohérence stricte entre mutations rapides, file hors-ligne et Cloud
  const stateRef = useRef({
    rows: initialRows,
    matchList: initialMatches,
    setterList: initialSetters,
    sheetConfigs: initialConfigs,
    teamLineup: initialLineup,
    revision: Number(initialCloudMeta?.revision) || 0,
  });

  const pendingOpsRef = useRef(
    readJsonStorage(STORAGE_KEYS.PENDING_OPS, null) || {
      hasPending: false,
      delta: createEmptyDelta(Number(initialCloudMeta?.revision) || 0),
      lastActionLabel: '',
      isDestructive: false,
      forceReplace: false,
    }
  );
  const syncInFlightRef = useRef(false);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.ROWS, rows);
  }, [rows]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.MATCHES, matchList);
  }, [matchList]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.CONFIGS, sheetConfigs);
  }, [sheetConfigs]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.SETTERS, setterList);
  }, [setterList]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.LINEUP, teamLineup);
  }, [teamLineup]);

  const showBanner = useCallback((text, tone = 'emerald') => {
    setBannerMsg({ text, tone });
    window.clearTimeout(window.__pancakeBannerTimer);
    window.__pancakeBannerTimer = window.setTimeout(() => setBannerMsg(null), 3500);
  }, []);

  const applyServerSnapshot = useCallback((remoteState, remoteBackupsMeta) => {
    if (!remoteState) return;
    const normRows = Array.isArray(remoteState.rows)
      ? remoteState.rows.map((r, i) => normalizeRow(r, i))
      : [];
    const nextMatches = Array.isArray(remoteState.matchList) ? remoteState.matchList : [];
    const nextSetters = Array.isArray(remoteState.setterList) ? remoteState.setterList : [];
    const nextConfigs = Array.isArray(remoteState.sheetConfigs) ? remoteState.sheetConfigs : [];
    const nextLineup =
      remoteState.teamLineup &&
      typeof remoteState.teamLineup === 'object' &&
      Object.keys(remoteState.teamLineup).length > 0
        ? remoteState.teamLineup
        : DEFAULT_TEAM_LINEUP;
    const nextRev = Number(remoteState.revision) || 1;

    stateRef.current = {
      rows: normRows,
      matchList: nextMatches,
      setterList: nextSetters,
      sheetConfigs: nextConfigs,
      teamLineup: nextLineup,
      revision: nextRev,
    };

    setRows(normRows);
    setMatchList(nextMatches);
    setSetterList(nextSetters);
    setSheetConfigs(nextConfigs);
    setTeamLineup(nextLineup);

    // Si l'onglet ouvert a été supprimé sur un autre appareil, revenir sur Saisie Tablette
    setActiveTab((prevTab) => {
      if (['tablet', 'saisie', 'custom'].includes(prevTab)) return prevTab;
      return nextConfigs.some((c) => c.id === prevTab) ? prevTab : 'tablet';
    });

    const metaObj = {
      revision: nextRev,
      updatedAt: remoteState.updatedAt || new Date().toISOString(),
      updatedByName: remoteState.updatedByName || 'Cloud',
      lastActionLabel: remoteState.lastActionLabel || 'Synchronisé',
    };
    writeJsonStorage(STORAGE_KEYS.CLOUD_META, metaObj);
    setCloudMeta((prev) => ({
      ...prev,
      ...metaObj,
      errorMsg: '',
      hasPending: pendingOpsRef.current.hasPending,
    }));

    if (Array.isArray(remoteBackupsMeta)) {
      setCloudBackups(remoteBackupsMeta);
    }
  }, []);

  const flushSyncQueue = useCallback(async () => {
    if (syncInFlightRef.current) return;
    if (!pendingOpsRef.current.hasPending) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCloudStatus('offline');
      return;
    }

    syncInFlightRef.current = true;
    setCloudStatus('syncing');

    try {
      while (pendingOpsRef.current.hasPending) {
        const snapshotOp = {
          delta: { ...pendingOpsRef.current.delta },
          lastActionLabel: pendingOpsRef.current.lastActionLabel || 'Mise à jour',
          isDestructive: Boolean(pendingOpsRef.current.isDestructive),
          forceReplace: Boolean(pendingOpsRef.current.forceReplace),
        };
        const sentState = { ...stateRef.current };

        // Réinitialiser la file avant l'envoi pour capturer d'éventuels nouveaux clics pendant la requête
        const revDuringSend = stateRef.current.revision;
        pendingOpsRef.current = {
          hasPending: false,
          delta: createEmptyDelta(revDuringSend),
          lastActionLabel: '',
          isDestructive: false,
          forceReplace: false,
        };
        writeJsonStorage(STORAGE_KEYS.PENDING_OPS, pendingOpsRef.current);

        try {
          const res = await pushCloudState({
            state: sentState,
            delta: snapshotOp.delta,
            lastActionLabel: snapshotOp.lastActionLabel,
            isDestructive: snapshotOp.isDestructive,
            forceReplace: snapshotOp.forceReplace,
          });

          if (pendingOpsRef.current.hasPending) {
            // De nouveaux changements locaux ont eu lieu pendant l'envoi HTTP : mettre à jour la baseRevision
            pendingOpsRef.current.delta.baseRevision = Number(res.state?.revision) || revDuringSend;
            stateRef.current.revision = Number(res.state?.revision) || stateRef.current.revision;
            writeJsonStorage(STORAGE_KEYS.PENDING_OPS, pendingOpsRef.current);
            if (Array.isArray(res.backupsMeta)) setCloudBackups(res.backupsMeta);
          } else {
            applyServerSnapshot(res.state, res.backupsMeta);
          }
        } catch (err) {
          // Rétablir le delta en cas d'erreur réseau pour ne rien perdre
          const curDelta = pendingOpsRef.current.delta;
          pendingOpsRef.current = {
            hasPending: true,
            lastActionLabel: pendingOpsRef.current.lastActionLabel || snapshotOp.lastActionLabel,
            isDestructive: pendingOpsRef.current.isDestructive || snapshotOp.isDestructive,
            forceReplace: pendingOpsRef.current.forceReplace || snapshotOp.forceReplace,
            delta: {
              baseRevision: snapshotOp.delta.baseRevision,
              addedRowUids: uniquePush(snapshotOp.delta.addedRowUids, curDelta.addedRowUids),
              updatedRowUids: uniquePush(snapshotOp.delta.updatedRowUids, curDelta.updatedRowUids),
              deletedRowUids: uniquePush(snapshotOp.delta.deletedRowUids, curDelta.deletedRowUids),
              addedMatches: uniquePush(snapshotOp.delta.addedMatches, curDelta.addedMatches),
              deletedMatches: uniquePush(snapshotOp.delta.deletedMatches, curDelta.deletedMatches),
              renamedMatches: [
                ...(snapshotOp.delta.renamedMatches || []),
                ...(curDelta.renamedMatches || []),
              ],
              addedSetters: uniquePush(snapshotOp.delta.addedSetters, curDelta.addedSetters),
              deletedSetters: uniquePush(snapshotOp.delta.deletedSetters, curDelta.deletedSetters),
              updatedSheetIds: uniquePush(
                snapshotOp.delta.updatedSheetIds,
                curDelta.updatedSheetIds
              ),
              deletedSheetIds: uniquePush(
                snapshotOp.delta.deletedSheetIds,
                curDelta.deletedSheetIds
              ),
              lineupChanged: Boolean(snapshotOp.delta.lineupChanged || curDelta.lineupChanged),
            },
          };
          writeJsonStorage(STORAGE_KEYS.PENDING_OPS, pendingOpsRef.current);
          throw err;
        }
      }

      setCloudStatus('synced');
      setCloudMeta((prev) => ({ ...prev, errorMsg: '', hasPending: false }));
    } catch (err) {
      setCloudStatus(
        typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'
      );
      setCloudMeta((prev) => ({
        ...prev,
        hasPending: pendingOpsRef.current.hasPending,
        errorMsg: err?.message || 'Erreur de synchronisation Cloud',
      }));
    } finally {
      syncInFlightRef.current = false;
    }
  }, [applyServerSnapshot]);

  const scheduleSyncFlush = useCallback(
    (delayMs = 80) => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        flushSyncQueue();
      }, delayMs);
    },
    [flushSyncQueue]
  );

  // Fonction centrale pour modifier l'état local + sauvegarder avant suppression + pousser au Cloud
  const applyStateUpdate = useCallback(
    (mutator, { label = 'Mise à jour', isDestructive = false, forceReplace = false, deltaPatch = {} } = {}) => {
      const prev = stateRef.current;

      // Avant toute action destructrice ou remplacement massif, sauvegarder une copie de sécurité locale instantanée
      if (isDestructive || forceReplace) {
        const updatedLocal = saveLocalBackupSnapshot(prev, `Avant : ${label}`, 'safety');
        setLocalBackups(updatedLocal);
      }

      const next = mutator(prev);
      const nextRows = next.rows ?? prev.rows;
      const nextMatches = next.matchList ?? prev.matchList;
      const nextSetters = next.setterList ?? prev.setterList;
      const nextConfigs = next.sheetConfigs ?? prev.sheetConfigs;
      const nextLineup = next.teamLineup ?? prev.teamLineup;

      stateRef.current = {
        ...prev,
        rows: nextRows,
        matchList: nextMatches,
        setterList: nextSetters,
        sheetConfigs: nextConfigs,
        teamLineup: nextLineup,
      };

      if (next.rows !== undefined) setRows(nextRows);
      if (next.matchList !== undefined) setMatchList(nextMatches);
      if (next.setterList !== undefined) setSetterList(nextSetters);
      if (next.sheetConfigs !== undefined) setSheetConfigs(nextConfigs);
      if (next.teamLineup !== undefined) setTeamLineup(nextLineup);

      // Accumuler le delta pour fusion collaborative multi-appareils
      const curOp = pendingOpsRef.current;
      const prevDelta = curOp.hasPending
        ? curOp.delta
        : createEmptyDelta(stateRef.current.revision);

      const deletedRowSet = new Set(deltaPatch.deletedRowUids || []);
      const filteredPrevAdded = (prevDelta.addedRowUids || []).filter(
        (u) => !deletedRowSet.has(u)
      );

      pendingOpsRef.current = {
        hasPending: true,
        lastActionLabel: label,
        isDestructive: curOp.isDestructive || isDestructive,
        forceReplace: curOp.forceReplace || forceReplace,
        delta: {
          baseRevision: prevDelta.baseRevision,
          addedRowUids: uniquePush(filteredPrevAdded, deltaPatch.addedRowUids),
          updatedRowUids: uniquePush(prevDelta.updatedRowUids, deltaPatch.updatedRowUids),
          deletedRowUids: uniquePush(prevDelta.deletedRowUids, deltaPatch.deletedRowUids),
          addedMatches: uniquePush(prevDelta.addedMatches, deltaPatch.addedMatches),
          deletedMatches: uniquePush(prevDelta.deletedMatches, deltaPatch.deletedMatches),
          renamedMatches: [
            ...(prevDelta.renamedMatches || []),
            ...(deltaPatch.renamedMatches || []),
          ],
          addedSetters: uniquePush(prevDelta.addedSetters, deltaPatch.addedSetters),
          deletedSetters: uniquePush(prevDelta.deletedSetters, deltaPatch.deletedSetters),
          updatedSheetIds: uniquePush(prevDelta.updatedSheetIds, deltaPatch.updatedSheetIds),
          deletedSheetIds: uniquePush(prevDelta.deletedSheetIds, deltaPatch.deletedSheetIds),
          lineupChanged: Boolean(prevDelta.lineupChanged || deltaPatch.lineupChanged),
        },
      };
      writeJsonStorage(STORAGE_KEYS.PENDING_OPS, pendingOpsRef.current);
      setCloudMeta((m) => ({ ...m, hasPending: true }));

      scheduleSyncFlush(forceReplace ? 10 : 80);
    },
    [scheduleSyncFlush]
  );

  // Pull / réconciliation Cloud (démarrage, polling 3s, focus onglet, reconnexion)
  const syncFromCloud = useCallback(
    async ({ silent = true } = {}) => {
      if (syncInFlightRef.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setCloudStatus('offline');
        return;
      }
      if (pendingOpsRef.current.hasPending) {
        await flushSyncQueue();
        return;
      }

      if (!silent) setCloudStatus('syncing');
      try {
        const res = await fetchCloudState();
        if (Array.isArray(res.backupsMeta)) {
          setCloudBackups(res.backupsMeta);
        }

        if (res.state) {
          if (Number(res.state.revision) !== Number(stateRef.current.revision)) {
            applyServerSnapshot(res.state, res.backupsMeta);
          } else {
            setCloudMeta((prev) => ({
              ...prev,
              revision: Number(res.state.revision),
              updatedAt: res.state.updatedAt,
              updatedByName: res.state.updatedByName,
              lastActionLabel: res.state.lastActionLabel,
              errorMsg: '',
              hasPending: false,
            }));
          }
          setCloudStatus('synced');
        } else {
          // Base Cloud vierge : pousser l'état local initial vers le Cloud sans perte
          const localInitial = { ...stateRef.current };
          const pushed = await pushCloudState({
            state: localInitial,
            delta: createEmptyDelta(0),
            lastActionLabel: 'Initialisation Cloud',
            forceReplace: true,
          });
          applyServerSnapshot(pushed.state, pushed.backupsMeta);
          setCloudStatus('synced');
        }
      } catch (err) {
        setCloudStatus(
          typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'
        );
        setCloudMeta((prev) => ({
          ...prev,
          errorMsg: err?.message || 'Connexion Cloud temporairement indisponible',
        }));
      }
    },
    [applyServerSnapshot, flushSyncQueue]
  );

  // Initialisation au montage + polling temps réel multi-appareils + écoute focus/online
  useEffect(() => {
    syncFromCloud({ silent: false });

    const intervalId = window.setInterval(() => {
      syncFromCloud({ silent: true });
    }, 3000);

    const handleFocusOrVisible = () => {
      if (!document.hidden) {
        syncFromCloud({ silent: true });
      }
    };
    const handleOnline = () => {
      syncFromCloud({ silent: false });
    };
    const handleOffline = () => {
      setCloudStatus('offline');
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncFromCloud]);

  const allMatches = useMemo(() => {
    const seen = new Set();
    const list = [];
    matchList.forEach((m) => {
      const up = String(m || '').trim().toUpperCase();
      if (up && !seen.has(up)) {
        seen.add(up);
        list.push(m.trim());
      }
    });
    rows.forEach((r) => {
      const m = String(r.match || '').trim();
      if (m && !seen.has(m.toUpperCase())) {
        seen.add(m.toUpperCase());
        list.push(m);
      }
    });
    return list;
  }, [rows, matchList]);

  const allSetters = useMemo(() => {
    const seen = new Set();
    const list = [];
    setterList.forEach((s) => {
      const code = String(s?.code || '').trim().toUpperCase();
      const name = String(s?.name || '').trim().toUpperCase();
      if (code && code !== 'NP' && !seen.has(code)) {
        seen.add(code);
        list.push({ code, name });
      }
    });
    rows.forEach((r) => {
      const code = String(r.setter || '').trim().toUpperCase();
      if (code && code !== 'NP' && !seen.has(code)) {
        seen.add(code);
        list.push({ code, name: '' });
      }
    });
    return list;
  }, [setterList, rows]);

  const handleChangeTeamLineup = useCallback(
    (updater) => {
      const prevLineup = stateRef.current.teamLineup;
      const nextLineup = typeof updater === 'function' ? updater(prevLineup) : updater;
      if (nextLineup === prevLineup || JSON.stringify(nextLineup) === JSON.stringify(prevLineup)) {
        return;
      }
      applyStateUpdate(
        () => ({ teamLineup: nextLineup }),
        {
          label: 'Composition 6 de départ',
          deltaPatch: { lineupChanged: true },
        }
      );
    },
    [applyStateUpdate]
  );

  const handleAddRow = (newRowData) => {
    const uid = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mName = String(newRowData.match || '').trim().toUpperCase();
    const sCode = String(newRowData.setter || '').trim().toUpperCase();

    applyStateUpdate(
      (prev) => {
        const nextId =
          prev.rows.length > 0 ? Math.max(...prev.rows.map((r) => Number(r.id) || 0)) + 1 : 1;
        const addedRow = normalizeRow({ ...newRowData, id: nextId, uid }, prev.rows.length);
        const nextMatches =
          mName && !prev.matchList.some((m) => m.toUpperCase() === mName)
            ? [...prev.matchList, mName]
            : prev.matchList;
        const nextSetters =
          sCode &&
          sCode !== 'NP' &&
          !prev.setterList.some((s) => String(s?.code || '').trim().toUpperCase() === sCode)
            ? [...prev.setterList, { code: sCode, name: '' }]
            : prev.setterList;
        return {
          rows: [...prev.rows, addedRow],
          matchList: nextMatches,
          setterList: nextSetters,
        };
      },
      {
        label: `Saisie ${mName || 'action'} (#${sCode || 'P'})`,
        deltaPatch: {
          addedRowUids: [uid],
          addedMatches: mName ? [mName] : [],
          addedSetters: sCode && sCode !== 'NP' ? [sCode] : [],
        },
      }
    );
  };

  const handleUpdateRow = (id, patch) => {
    const targetRow = stateRef.current.rows.find((r) => r.id === id);
    const targetUid = targetRow?.uid || `legacy_${id}`;
    applyStateUpdate(
      (prev) => ({
        rows: prev.rows.map((r, idx) =>
          r.id === id ? normalizeRow({ ...r, ...patch, id, uid: r.uid || targetUid }, idx) : r
        ),
      }),
      {
        label: `Modification ligne #${id}`,
        deltaPatch: { updatedRowUids: [targetUid] },
      }
    );
  };

  const handleDeleteRow = (id) => {
    const targetRow = stateRef.current.rows.find((r) => r.id === id);
    const targetUid = targetRow?.uid || `legacy_${id}`;
    applyStateUpdate(
      (prev) => ({
        rows: prev.rows.filter((r) => r.id !== id),
      }),
      {
        label: `Suppression ligne #${id}`,
        deltaPatch: { deletedRowUids: [targetUid] },
      }
    );
  };

  const handleUndoLast = () => {
    const prevRows = stateRef.current.rows;
    if (prevRows.length === 0) return null;
    const removed = prevRows[prevRows.length - 1];
    const targetUid = removed?.uid || `legacy_${removed.id}`;
    applyStateUpdate(
      (prev) => ({
        rows: prev.rows.slice(0, -1),
      }),
      {
        label: `Annulation dernière action`,
        deltaPatch: { deletedRowUids: [targetUid] },
      }
    );
    return removed;
  };

  const handleCreateSheet = ({ title, setter }) => {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return null;
    const id = `SHEET_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newCfg = {
      id,
      title: cleanTitle,
      setter: setter || 'ALL',
      matches: [],
      includeAllMatches: false,
    };
    applyStateUpdate(
      (prev) => ({
        sheetConfigs: [...prev.sheetConfigs, newCfg],
      }),
      {
        label: `Création feuille "${cleanTitle}"`,
        deltaPatch: { updatedSheetIds: [id] },
      }
    );
    return id;
  };

  const handleDeleteSheet = (sheetId) => {
    const target = stateRef.current.sheetConfigs.find((c) => c.id === sheetId);
    applyStateUpdate(
      (prev) => ({
        sheetConfigs: prev.sheetConfigs.filter((c) => c.id !== sheetId),
      }),
      {
        label: `Suppression feuille "${target?.title || sheetId}"`,
        isDestructive: true,
        deltaPatch: { deletedSheetIds: [sheetId] },
      }
    );
    if (activeTab === sheetId) {
      setActiveTab('tablet');
    }
    showBanner('Feuille supprimée (sauvegarde de sécurité effectuée).', 'amber');
  };

  const handleAddMatch = (matchName, targetSheetIds = []) => {
    const clean = String(matchName || '').trim().toUpperCase();
    if (!clean) return;
    applyStateUpdate(
      (prev) => {
        const nextMatches = prev.matchList.some((m) => m.toUpperCase() === clean)
          ? prev.matchList
          : [...prev.matchList, clean];
        let nextConfigs = prev.sheetConfigs;
        if (Array.isArray(targetSheetIds) && targetSheetIds.length > 0) {
          nextConfigs = prev.sheetConfigs.map((cfg) => {
            if (!targetSheetIds.includes(cfg.id)) return cfg;
            const existing = cfg.matches || [];
            if (existing.some((m) => m.toUpperCase() === clean)) return cfg;
            return {
              ...cfg,
              includeAllMatches: false,
              matches: [...existing, clean],
            };
          });
        }
        return { matchList: nextMatches, sheetConfigs: nextConfigs };
      },
      {
        label: `Création match "${clean}"`,
        deltaPatch: {
          addedMatches: [clean],
          updatedSheetIds: Array.isArray(targetSheetIds) ? targetSheetIds : [],
        },
      }
    );
  };

  const handleDeleteMatch = (matchName) => {
    const clean = String(matchName || '').trim().toUpperCase();
    if (!clean) return;
    const removedRows = stateRef.current.rows.filter(
      (r) => String(r.match || '').trim().toUpperCase() === clean
    );
    const removedCount = removedRows.length;
    const deletedRowUids = removedRows.map((r) => r.uid || `legacy_${r.id}`);

    applyStateUpdate(
      (prev) => ({
        matchList: prev.matchList.filter((m) => m.toUpperCase() !== clean),
        rows: prev.rows.filter((r) => String(r.match || '').trim().toUpperCase() !== clean),
        sheetConfigs: prev.sheetConfigs.map((cfg) => ({
          ...cfg,
          matches: (cfg.matches || []).filter((m) => m.toUpperCase() !== clean),
        })),
      }),
      {
        label: `Suppression match "${clean}" (${removedCount} act.)`,
        isDestructive: true,
        deltaPatch: {
          deletedMatches: [clean],
          deletedRowUids,
        },
      }
    );

    setCustomFilter((prev) => ({
      ...prev,
      selectedMatches: (prev.selectedMatches || []).filter(
        (m) => m.toUpperCase() !== clean
      ),
    }));
    showBanner(
      `Match "${clean}" supprimé (${removedCount} action${removedCount > 1 ? 's' : ''} retirée${removedCount > 1 ? 's' : ''}) — sauvegarde de sécurité enregistrée.`,
      'amber'
    );
  };

  const handleRenameMatch = (oldName, newName) => {
    const cleanOld = String(oldName || '').trim().toUpperCase();
    const cleanNew = String(newName || '').trim().toUpperCase();
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return null;

    const affectedSheetIds = stateRef.current.sheetConfigs
      .filter((cfg) => (cfg.matches || []).some((m) => m.toUpperCase() === cleanOld))
      .map((cfg) => cfg.id);

    applyStateUpdate(
      (prev) => {
        const nextMatches = [];
        const seenM = new Set();
        let replaced = false;
        prev.matchList.forEach((m) => {
          const up = String(m || '').trim().toUpperCase();
          const targetVal = up === cleanOld ? cleanNew : up;
          if (up === cleanOld) replaced = true;
          if (targetVal && !seenM.has(targetVal)) {
            seenM.add(targetVal);
            nextMatches.push(targetVal);
          }
        });
        if (!replaced && !seenM.has(cleanNew)) nextMatches.push(cleanNew);

        const nextRows = prev.rows.map((r) =>
          String(r.match || '').trim().toUpperCase() === cleanOld ? { ...r, match: cleanNew } : r
        );

        const nextConfigs = prev.sheetConfigs.map((cfg) => {
          const nextCfgMatches = [];
          const seenCfg = new Set();
          (cfg.matches || []).forEach((m) => {
            const up = String(m || '').trim().toUpperCase();
            const targetVal = up === cleanOld ? cleanNew : up;
            if (targetVal && !seenCfg.has(targetVal)) {
              seenCfg.add(targetVal);
              nextCfgMatches.push(targetVal);
            }
          });
          return { ...cfg, matches: nextCfgMatches };
        });

        return { matchList: nextMatches, rows: nextRows, sheetConfigs: nextConfigs };
      },
      {
        label: `Renommage "${cleanOld}" → "${cleanNew}"`,
        deltaPatch: {
          renamedMatches: [{ from: cleanOld, to: cleanNew }],
          updatedSheetIds: affectedSheetIds,
        },
      }
    );

    setCustomFilter((prev) => {
      const nextSel = [];
      const seen = new Set();
      (prev.selectedMatches || []).forEach((m) => {
        const up = String(m || '').trim().toUpperCase();
        const targetVal = up === cleanOld ? cleanNew : up;
        if (targetVal && !seen.has(targetVal)) {
          seen.add(targetVal);
          nextSel.push(targetVal);
        }
      });
      return { ...prev, selectedMatches: nextSel };
    });

    showBanner(`Match "${cleanOld}" renommé en "${cleanNew}".`, 'emerald');
    return cleanNew;
  };

  const handleAddSetter = ({ code, name = '', createSheet = false }) => {
    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanName = String(name || '').trim().toUpperCase();
    if (!cleanCode || cleanCode === 'NP') return null;

    let createdSheetId = null;
    if (createSheet) {
      createdSheetId = `SHEET_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }

    applyStateUpdate(
      (prev) => {
        const existsIdx = prev.setterList.findIndex(
          (s) => String(s?.code || '').trim().toUpperCase() === cleanCode
        );
        const nextSetters =
          existsIdx >= 0
            ? prev.setterList.map((s, idx) =>
                idx === existsIdx ? { code: cleanCode, name: cleanName || s.name || '' } : s
              )
            : [...prev.setterList, { code: cleanCode, name: cleanName }];

        let nextConfigs = prev.sheetConfigs;
        if (createdSheetId) {
          nextConfigs = [
            ...prev.sheetConfigs,
            {
              id: createdSheetId,
              title: cleanName || `PASSEUR ${cleanCode}`,
              setter: cleanCode,
              matches: [],
              includeAllMatches: false,
            },
          ];
        }
        return { setterList: nextSetters, sheetConfigs: nextConfigs };
      },
      {
        label: `Ajout passeur N° ${cleanCode}`,
        deltaPatch: {
          addedSetters: [cleanCode],
          updatedSheetIds: createdSheetId ? [createdSheetId] : [],
        },
      }
    );

    showBanner(
      `Passeur N° ${cleanCode}${cleanName ? ` (${cleanName})` : ''} enregistré${
        createdSheetId ? ' + feuille créée' : ''
      }.`,
      'emerald'
    );
    return cleanCode;
  };

  const handleDeleteSetter = (setterCode) => {
    const cleanCode = String(setterCode || '').trim().toUpperCase();
    if (!cleanCode || cleanCode === 'NP') return;
    const removedRows = stateRef.current.rows.filter(
      (r) => String(r.setter || '').trim().toUpperCase() === cleanCode
    );
    const removedCount = removedRows.length;
    const deletedRowUids = removedRows.map((r) => r.uid || `legacy_${r.id}`);

    applyStateUpdate(
      (prev) => ({
        setterList: prev.setterList.filter(
          (s) => String(s?.code || '').trim().toUpperCase() !== cleanCode
        ),
        rows: prev.rows.filter(
          (r) => String(r.setter || '').trim().toUpperCase() !== cleanCode
        ),
      }),
      {
        label: `Suppression passeur N° ${cleanCode} (${removedCount} act.)`,
        isDestructive: true,
        deltaPatch: {
          deletedSetters: [cleanCode],
          deletedRowUids,
        },
      }
    );

    setCustomFilter((prev) =>
      String(prev.setter || '').trim().toUpperCase() === cleanCode
        ? { ...prev, setter: 'ALL' }
        : prev
    );

    showBanner(
      `Passeur N° ${cleanCode} supprimé (${removedCount} action${removedCount > 1 ? 's' : ''} retirée${removedCount > 1 ? 's' : ''}) — sauvegarde de sécurité enregistrée.`,
      'amber'
    );
  };

  const handleChangeSheetFilter = (sheetId, patch) => {
    applyStateUpdate(
      (prev) => ({
        sheetConfigs: prev.sheetConfigs.map((cfg) =>
          cfg.id === sheetId ? { ...cfg, ...patch } : cfg
        ),
      }),
      {
        label: `Filtre feuille modifié`,
        deltaPatch: { updatedSheetIds: [sheetId] },
      }
    );
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      await exportWorkbookIdenticalToOriginal(rows, sheetConfigs);
      showBanner(
        'Classeur Excel (.xlsx) exporté avec mise en forme identique à l’original !',
        'emerald'
      );
    } catch (err) {
      showBanner(`Erreur export Excel : ${err.message}`, 'rose');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importSaisieFromExcelFile(file);
      if (imported.length === 0) {
        showBanner('Aucune donnée trouvée à partir de la ligne 15 dans la feuille saisie.', 'amber');
      } else {
        const importedMatches = Array.from(
          new Set(imported.map((r) => r.match.trim().toUpperCase()).filter(Boolean))
        );
        const importedSetters = Array.from(
          new Set(
            imported
              .map((r) => String(r.setter || '').trim().toUpperCase())
              .filter((c) => c && c !== 'NP')
          )
        );
        applyStateUpdate(
          (prev) => {
            const nextSetters = [...prev.setterList];
            importedSetters.forEach((code) => {
              if (!nextSetters.some((s) => String(s?.code || '').trim().toUpperCase() === code)) {
                nextSetters.push({ code, name: '' });
              }
            });
            return {
              rows: imported,
              matchList: importedMatches,
              setterList: nextSetters,
            };
          },
          {
            label: `Import Excel "${file.name}" (${imported.length} act.)`,
            isDestructive: true,
            forceReplace: true,
          }
        );
        showBanner(`${imported.length} actions importées depuis "${file.name}".`, 'emerald');
      }
    } catch (err) {
      showBanner(`Erreur import Excel : ${err.message}`, 'rose');
    } finally {
      e.target.value = '';
    }
  };

  const confirmResetToOriginal = () => {
    applyStateUpdate(
      () => ({
        rows: initialSaisieRows.map((r, i) => normalizeRow(r, i)),
        matchList: [...DEFAULT_MATCH_LIST],
        sheetConfigs: DEFAULT_SHEET_CONFIGS.map((c) => ({ ...c, matches: [...c.matches] })),
        setterList: DEFAULT_SETTER_LIST.map((s) => ({ ...s })),
        teamLineup: DEFAULT_TEAM_LINEUP,
      }),
      {
        label: 'Restauration Original (680)',
        isDestructive: true,
        forceReplace: true,
      }
    );
    setCustomFilter((f) => ({ ...f, selectedMatches: [] }));
    setResetModal(null);
    showBanner("Données et feuilles d'origine restaurées (680 actions).", 'sky');
  };

  const confirmBlankReset = () => {
    applyStateUpdate(
      () => ({
        rows: [],
        matchList: [],
        sheetConfigs: [],
        setterList: [],
        teamLineup: DEFAULT_TEAM_LINEUP,
      }),
      {
        label: 'Repartir à zéro',
        isDestructive: true,
        forceReplace: true,
      }
    );
    setCustomFilter({ setter: 'ALL', selectedMatches: [] });
    if (activeTab !== 'tablet' && activeTab !== 'saisie' && activeTab !== 'custom') {
      setActiveTab('tablet');
    }
    setResetModal(null);
    showBanner(
      'Application remise à zéro (une sauvegarde de sécurité vient d’être enregistrée).',
      'amber'
    );
  };

  const handleCreateSheetFromModal = (e) => {
    e.preventDefault();
    const id = handleCreateSheet({ title: newSheetTitle, setter: newSheetSetter });
    if (id) {
      setActiveTab(id);
      setNewSheetTitle('');
      setShowNewSheetModal(false);
      showBanner(`Feuille "${newSheetTitle.trim()}" créée.`, 'emerald');
    }
  };

  // --- ACTIONS SAUVEGARDES CLOUD & LOCALES ---
  const handleCreateManualBackupAction = async (label) => {
    const cleanLabel = label || `Sauvegarde manuelle`;
    try {
      const res = await createManualCloudBackup({
        label: cleanLabel,
        state: stateRef.current,
      });
      if (Array.isArray(res.backupsMeta)) setCloudBackups(res.backupsMeta);
      if (Array.isArray(res.localBackups)) setLocalBackups(res.localBackups);
      showBanner(`Sauvegarde "${cleanLabel}" créée dans le Cloud et sur l'appareil.`, 'emerald');
    } catch (err) {
      setLocalBackups(getLocalBackups());
      showBanner(
        `Sauvegardé localement sur l'appareil (Cloud indisponible : ${err.message}).`,
        'amber'
      );
    }
  };

  const handleRestoreBackupAction = async (bkp) => {
    if (!bkp) return;
    if (bkp.isLocal && bkp.data) {
      applyStateUpdate(
        () => ({
          rows: (bkp.data.rows || []).map((r, i) => normalizeRow(r, i)),
          matchList: bkp.data.matchList || [],
          setterList: bkp.data.setterList || [],
          sheetConfigs: bkp.data.sheetConfigs || [],
          teamLineup: bkp.data.teamLineup || DEFAULT_TEAM_LINEUP,
        }),
        {
          label: `Restauration locale "${bkp.label}"`,
          isDestructive: true,
          forceReplace: true,
        }
      );
      setShowCloudModal(false);
      showBanner(`Sauvegarde locale "${bkp.label}" restaurée !`, 'sky');
      return;
    }

    try {
      // Toujours archiver l'état local avant restauration Cloud
      setLocalBackups(
        saveLocalBackupSnapshot(stateRef.current, `Avant restauration "${bkp.label}"`, 'safety')
      );
      setCloudStatus('syncing');
      pendingOpsRef.current = {
        hasPending: false,
        delta: createEmptyDelta(stateRef.current.revision),
        lastActionLabel: '',
        isDestructive: false,
        forceReplace: false,
      };
      writeJsonStorage(STORAGE_KEYS.PENDING_OPS, pendingOpsRef.current);

      const res = await restoreCloudBackup(bkp.id);
      applyServerSnapshot(res.state, res.backupsMeta);
      setCloudStatus('synced');
      setShowCloudModal(false);
      showBanner(
        `Sauvegarde Cloud "${bkp.label}" restaurée (${res.state?.rows?.length || 0} actions) !`,
        'emerald'
      );
    } catch (err) {
      setCloudStatus('error');
      showBanner(`Erreur restauration Cloud : ${err.message}`, 'rose');
    }
  };

  const handleImportJsonBackup = async (file) => {
    try {
      const parsed = await importFullBackupJson(file);
      applyStateUpdate(
        () => ({
          rows: (parsed.rows || []).map((r, i) => normalizeRow(r, i)),
          matchList: parsed.matchList,
          setterList: parsed.setterList,
          sheetConfigs: parsed.sheetConfigs,
          teamLineup:
            parsed.teamLineup && Object.keys(parsed.teamLineup).length > 0
              ? parsed.teamLineup
              : DEFAULT_TEAM_LINEUP,
        }),
        {
          label: `Import sauvegarde "${file.name}"`,
          isDestructive: true,
          forceReplace: true,
        }
      );
      setShowCloudModal(false);
      showBanner(
        `Sauvegarde "${file.name}" restaurée (${parsed.rows.length} actions) !`,
        'emerald'
      );
    } catch (err) {
      showBanner(`Erreur lecture fichier JSON : ${err.message}`, 'rose');
    }
  };

  const activeSheetConfig = sheetConfigs.find((c) => c.id === activeTab);
  const activeSheetRows = useMemo(() => {
    if (!activeSheetConfig) return [];
    return filterRowsForPreset(rows, activeSheetConfig);
  }, [rows, activeSheetConfig]);

  const customFilteredRows = useMemo(() => {
    if (activeTab !== 'custom') return [];
    return filterRowsForPreset(rows, {
      setter: customFilter.setter,
      includeAllMatches: customFilter.selectedMatches.length === 0,
      matches: customFilter.selectedMatches,
    });
  }, [rows, activeTab, customFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* HEADER PRINCIPAL */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1680px] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black">
              🏐
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-tight">
                VolleyDistrib • Analyse Passeur
              </h1>
              <p className="text-[11px] text-slate-400">
                Cloud multi-appareils • Sauvegardes automatiques & Export Excel
              </p>
            </div>
          </div>

          {/* Boutons Cloud / Import / Export / Reset */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Pilule d'état Cloud & Sauvegardes */}
            <button
              type="button"
              onClick={() => {
                setLocalBackups(getLocalBackups());
                setShowCloudModal(true);
              }}
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black transition active:scale-95 ${
                cloudStatus === 'offline' || cloudStatus === 'error'
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  : cloudStatus === 'syncing'
                    ? 'border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                    : 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              }`}
              title="Ouvrir le panneau Cloud, Collaboration multi-appareils & Sauvegardes"
            >
              {cloudStatus === 'offline' || cloudStatus === 'error' ? (
                <CloudOff className="h-4 w-4 text-amber-300" />
              ) : cloudStatus === 'syncing' ? (
                <RefreshCw className="h-4 w-4 animate-spin text-sky-300" />
              ) : (
                <Cloud className="h-4 w-4 text-emerald-300" />
              )}
              <span>
                {cloudStatus === 'offline'
                  ? 'Hors-ligne (Sauvé)'
                  : cloudStatus === 'error'
                    ? 'Cloud (Reconnexion...)'
                    : cloudStatus === 'syncing'
                      ? 'Synchro...'
                      : `Cloud v${cloudMeta.revision || 1}`}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                <ShieldCheck className="h-3 w-3 text-emerald-300" />
                Sauvegardes ({cloudBackups.length})
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700 active:scale-95"
            >
              <Upload className="h-4 w-4 text-sky-400" />
              Importer .xlsx
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-400/60 bg-emerald-500 px-3.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50 active:scale-95"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Export...' : 'Exporter Excel (.xlsx)'}
            </button>

            <button
              type="button"
              onClick={() => setResetModal('original')}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 active:scale-95"
              title="Recharger les 680 lignes et les 6 feuilles d'origine"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Original (680)</span>
            </button>

            <button
              type="button"
              onClick={() => setResetModal('blank')}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-500/15 px-3 text-xs font-extrabold text-rose-200 hover:bg-rose-500/25 active:scale-95"
              title="Tout effacer (saisie, matchs et toutes les feuilles) pour repartir à zéro"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Repartir à zéro</span>
            </button>
          </div>
        </div>

        {/* BARRE D'ONGLETS (Tablette + saisie + Feuilles dynamiques + + Feuille) */}
        <div className="mx-auto max-w-[1680px] px-3 pb-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tablet')}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-black transition ${
              activeTab === 'tablet'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Tablet className="h-4 w-4" />
            Saisie Tablette
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1 shrink-0" />

          <button
            type="button"
            onClick={() => setActiveTab('saisie')}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
              activeTab === 'saisie'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            saisie ({rows.length})
          </button>

          {sheetConfigs.map((cfg) => (
            <button
              key={cfg.id}
              type="button"
              onClick={() => setActiveTab(cfg.id)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
                activeTab === cfg.id
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {cfg.title}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              setNewSheetSetter(allSetters[0]?.code || 'ALL');
              setShowNewSheetModal(true);
            }}
            className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-dashed border-amber-400/50 bg-amber-500/10 px-2.5 text-xs font-bold text-amber-200 hover:bg-amber-500/20"
            title="Créer une nouvelle page d'analyse"
          >
            <Plus className="h-3.5 w-3.5" />
            Feuille
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
              activeTab === 'custom'
                ? 'bg-purple-400 text-slate-950 shadow-md shadow-purple-400/20'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtre Libre
          </button>
        </div>
      </header>

      {/* BANNIÈRE STATUT */}
      {bannerMsg && (
        <div className="mx-auto mt-2 w-full max-w-[1680px] px-3">
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold ${
              bannerMsg.tone === 'emerald'
                ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                : bannerMsg.tone === 'rose'
                  ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                  : bannerMsg.tone === 'sky'
                    ? 'border-sky-500/40 bg-sky-950/60 text-sky-200'
                    : 'border-amber-500/40 bg-amber-950/60 text-amber-200'
            }`}
          >
            {bannerMsg.tone === 'rose' ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
        </div>
      )}

      {/* CONTENU PRINCIPAL */}
      <main className="mx-auto w-full max-w-[1680px] flex-1 px-3 pt-3">
        {activeTab === 'tablet' && (
          <TabletSaisieView
            rows={rows}
            allMatches={allMatches}
            allSetters={allSetters}
            sheetConfigs={sheetConfigs}
            teamLineup={teamLineup}
            onChangeTeamLineup={handleChangeTeamLineup}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onUndoLast={handleUndoLast}
            onAddMatch={handleAddMatch}
            onDeleteMatch={handleDeleteMatch}
            onRenameMatch={handleRenameMatch}
            onAddSetter={handleAddSetter}
            onDeleteSetter={handleDeleteSetter}
            onCreateSheet={handleCreateSheet}
            onRequestBlankReset={() => setResetModal('blank')}
          />
        )}

        {activeTab === 'saisie' && (
          <SaisieSheetView
            rows={rows}
            allMatches={allMatches}
            allSetters={allSetters}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onDeleteMatch={handleDeleteMatch}
            onRenameMatch={handleRenameMatch}
            onDeleteSetter={handleDeleteSetter}
          />
        )}

        {activeSheetConfig && (
          <SetterAnalysisSheetView
            sheetConfig={activeSheetConfig}
            filteredRows={activeSheetRows}
            allMatches={allMatches}
            allSetters={allSetters}
            onChangeSheetFilter={(patch) => handleChangeSheetFilter(activeSheetConfig.id, patch)}
            onDeleteSheet={handleDeleteSheet}
          />
        )}

        {activeTab === 'custom' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-3">
              <span className="text-xs font-black text-purple-300">Filtre personnalisé :</span>
              <select
                value={customFilter.setter}
                onChange={(e) => setCustomFilter((f) => ({ ...f, setter: e.target.value }))}
                className="h-9 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-white"
              >
                <option value="ALL">Tous passeurs</option>
                {allSetters.map((s) => (
                  <option key={s.code} value={s.code}>
                    {formatSetterLabel(s)}
                  </option>
                ))}
                <option value="NP">NP</option>
              </select>

              <div className="flex flex-wrap gap-1.5">
                {allMatches.map((m) => {
                  const selected = customFilter.selectedMatches.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setCustomFilter((f) => ({
                          ...f,
                          selectedMatches: selected
                            ? f.selectedMatches.filter((x) => x !== m)
                            : [...f.selectedMatches, m],
                        }))
                      }
                      className={`h-8 rounded-lg border px-2.5 text-[11px] font-bold transition ${
                        selected
                          ? 'border-purple-300 bg-purple-400 text-slate-950'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
                {customFilter.selectedMatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomFilter((f) => ({ ...f, selectedMatches: [] }))}
                    className="h-8 rounded-lg bg-slate-800 px-2.5 text-[11px] font-bold text-rose-300"
                  >
                    Tous les matchs
                  </button>
                )}
              </div>
            </div>

            <SetterAnalysisSheetView
              sheetConfig={{
                id: 'custom',
                title: `Vue Libre (N° ${customFilter.setter})`,
              }}
              filteredRows={customFilteredRows}
              allMatches={allMatches}
              allSetters={allSetters}
            />
          </div>
        )}
      </main>

      {/* MODALE CLOUD, COLLABORATION & SAUVEGARDES */}
      <CloudBackupModal
        isOpen={showCloudModal}
        onClose={() => setShowCloudModal(false)}
        cloudStatus={cloudStatus}
        cloudMeta={cloudMeta}
        stats={{
          actions: rows.length,
          matches: allMatches.length,
          setters: allSetters.length,
          sheets: sheetConfigs.length,
        }}
        deviceName={deviceName}
        onRenameDevice={(newName) => {
          const updated = persistDeviceName(newName);
          setDeviceNameState(updated);
          showBanner(`Nom de l'appareil mis à jour : "${updated}".`, 'emerald');
        }}
        onSyncNow={() => syncFromCloud({ silent: false })}
        onCreateBackup={handleCreateManualBackupAction}
        onRestoreBackup={handleRestoreBackupAction}
        onExportJson={() => {
          exportFullBackupJson(stateRef.current);
          showBanner('Sauvegarde complète .json téléchargée sur cet appareil.', 'emerald');
        }}
        onImportJsonFile={handleImportJsonBackup}
        cloudBackups={cloudBackups}
        localBackups={localBackups}
      />

      {/* MODALE CONFIRMATION : REPARTIR À ZÉRO (DONNÉES VIERGES) */}
      {resetModal === 'blank' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-base font-black text-white">
                Repartir à zéro (Données vierges)
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Une sauvegarde de sécurité automatique sera créée dans le Cloud et sur cet appareil juste avant de vider :
            </p>
            <ul className="mt-2 space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
              <li>• Efface les <strong>{rows.length}</strong> actions de la feuille saisie</li>
              <li>• Efface tous les matchs/équipes existants ({allMatches.length})</li>
              <li>• Supprime les passeurs enregistrés ({allSetters.length})</li>
              <li>• Supprime toutes les feuilles d'analyse ({sheetConfigs.length} page(s) : PAUL, MARCUS, etc.)</li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">
              Vous pourrez revenir à cet état à tout moment depuis « Cloud & Sauvegardes » ou « Original (680) ».
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetModal(null)}
                className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmBlankReset}
                className="h-10 rounded-xl bg-rose-500 px-4 text-xs font-black text-white hover:bg-rose-400"
              >
                Tout vider et repartir à zéro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE CONFIRMATION : RESTAURER ORIGINAL (680) */}
      {resetModal === 'original' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-base font-black text-white">
              Restaurer les données d'origine ?
            </h3>
            <p className="mt-2 text-xs text-slate-300">
              Une sauvegarde de sécurité de votre travail actuel sera d'abord créée, puis les 680 actions et les 6 feuilles d'origine (PAUL, MARCUS, etc.) seront rechargées.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetModal(null)}
                className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmResetToOriginal}
                className="h-10 rounded-xl bg-sky-500 px-4 text-xs font-black text-slate-950 hover:bg-sky-400"
              >
                Restaurer l'original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE CRÉATION DE NOUVELLE FEUILLE */}
      {showNewSheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSheetFromModal}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
          >
            <h3 className="text-base font-black text-white">Créer une nouvelle feuille</h3>
            <p className="mt-1 text-xs text-slate-400">
              Chaque feuille génère automatiquement ses 7 bandes de tableaux et sera exportée comme onglet Excel.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">Nom de la feuille</label>
                <input
                  type="text"
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  placeholder="ex: PAUL, MARCUS, TOURNOI..."
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none focus:border-amber-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  Passeur filtré (N° P)
                </label>
                <select
                  value={newSheetSetter}
                  onChange={(e) => setNewSheetSetter(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white"
                >
                  {allSetters.map((s) => (
                    <option key={s.code} value={s.code}>
                      {formatSetterLabel(s)}
                    </option>
                  ))}
                  <option value="ALL">Tous les passeurs</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewSheetModal(false)}
                className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="h-10 rounded-xl bg-amber-400 px-4 text-xs font-black text-slate-950"
              >
                Créer la feuille
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
