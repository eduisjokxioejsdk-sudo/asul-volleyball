// ============================================================================
// Détection des mises à jour de l'interface.
//
//   • compare la version de l'interface qui tourne (public/version.json) à la
//     version annoncée par le serveur (GET /api/system/version) ;
//   • revérifie au démarrage, toutes les 5 minutes, au retour sur l'onglet et
//     au retour du réseau ;
//   • présente une seule fois par appareil les nouveautés (localStorage) ;
//   • dans l'application Windows, pilote la mise à jour automatique
//     (electron-updater via le pont window.asulDesktop).
//
// Aucun accès réseau ne doit bloquer l'application : en cas d'échec (poste hors
// ligne, serveur absent), l'état reste simplement « à jour ».
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { compareVersions, updateState, whatsNewNotes } from '../utils/version';

const VERSION_API_URL = '/api/system/version';
const CLIENT_VERSION_URL = '/version.json';
const CHECK_INTERVAL = 5 * 60 * 1000;
const SEEN_KEY = 'asul.seenVersion';

const EMPTY_INFO = {
  ready: false,
  outdated: false,
  clientVersion: null,
  serverVersion: null,
  downloadUrl: null,
  latestTitle: null,
  missing: [],
  notes: [],
};

async function fetchJson(url, timeout = 6000) {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readSeenVersion() {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch (err) {
    return null;
  }
}

function storeSeenVersion(value) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch (err) {
    // Stockage indisponible : la modale pourra réapparaître, ce n'est pas bloquant.
  }
}

/** Pont avec l'application Windows (absent dans un navigateur). */
function desktopBridge() {
  return typeof window !== 'undefined' && window.asulDesktop ? window.asulDesktop : null;
}

export default function useAppUpdate() {
  const [info, setInfo] = useState(EMPTY_INFO);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogNotes, setDialogNotes] = useState([]);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [desktop, setDesktop] = useState({ status: 'idle', version: null, percent: 0, error: null });

  const mountedRef = useRef(true);
  const checkingRef = useRef(false);
  const desktopAvailable = !!desktopBridge()?.updates;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Interroge le serveur et le fichier de version livré avec l'interface. */
  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const [clientFile, serverJson] = await Promise.all([
        fetchJson(`${CLIENT_VERSION_URL}?t=${Date.now()}`),
        fetchJson(VERSION_API_URL),
      ]);

      // Dans l'application Windows, la version installée est une information sûre.
      let desktopInfo = null;
      const currentBridge = desktopBridge();
      if (currentBridge?.getInfo) {
        try {
          desktopInfo = await currentBridge.getInfo();
        } catch (err) {
          desktopInfo = null;
        }
      }

      // État d'une mise à jour déjà en cours (récupéré après un rechargement).
      let desktopState = null;
      if (currentBridge?.updates?.state) {
        try {
          desktopState = await currentBridge.updates.state();
        } catch (err) {
          desktopState = null;
        }
      }

      if (!mountedRef.current) return;

      if (desktopState && desktopState.status) {
        setDesktop((prev) => ({
          status: desktopState.status,
          version: desktopState.version || prev.version,
          percent: typeof desktopState.percent === 'number' ? desktopState.percent : prev.percent,
          error: desktopState.error || null,
        }));
      }

      const clientVersion = clientFile?.version || desktopInfo?.version || null;
      const serverVersion = serverJson?.appVersion || serverJson?.serverVersion || null;
      const notes = Array.isArray(serverJson?.notes) ? serverJson.notes : [];

      setInfo({
        ...updateState({
          clientVersion,
          serverVersion,
          downloadUrl: serverJson?.downloadUrl || null,
          notes,
        }),
        notes,
      });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Contrôles périodiques et aux moments utiles (retour d'onglet, réseau).
  useEffect(() => {
    check();
    const timer = setInterval(check, CHECK_INTERVAL);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  // Mise à jour automatique de l'application Windows (electron-updater).
  useEffect(() => {
    const currentBridge = desktopBridge();
    if (!currentBridge?.updates?.onEvent) return undefined;
    const unsubscribe = currentBridge.updates.onEvent((payload) => {
      if (!payload || !mountedRef.current) return;
      if (payload.type === 'checking') {
        setDesktop((prev) => ({ ...prev, status: 'checking', error: null }));
      } else if (payload.type === 'available') {
        setDesktop((prev) => ({ ...prev, status: 'available', version: payload.version || null }));
      } else if (payload.type === 'progress') {
        setDesktop((prev) => ({ ...prev, status: 'downloading', percent: Math.round(payload.percent || 0) }));
      } else if (payload.type === 'downloaded') {
        setDesktop({ status: 'downloaded', version: payload.version || null, percent: 100, error: null });
      } else if (payload.type === 'not-available') {
        setDesktop((prev) => ({ ...prev, status: 'up-to-date' }));
      } else if (payload.type === 'error') {
        setDesktop((prev) => ({
          ...prev,
          status: 'error',
          error: payload.message || 'Échec de la mise à jour',
        }));
      }
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);

  // Modale « Quoi de neuf » : une seule fois par version et par appareil.
  useEffect(() => {
    if (!info.ready || !info.serverVersion) return;
    const seen = readSeenVersion();
    if (seen && compareVersions(info.serverVersion, seen) <= 0) return;

    const notes = info.outdated
      ? info.missing
      : whatsNewNotes({ seenVersion: seen, currentVersion: info.serverVersion, notes: info.notes });

    storeSeenVersion(info.serverVersion);
    if (notes.length === 0) return;
    setDialogNotes(notes);
    setDialogOpen(true);
  }, [info.ready, info.outdated, info.serverVersion, info.missing, info.notes]);

  const openDialog = useCallback(() => {
    const seen = readSeenVersion();
    const notes = info.outdated
      ? info.missing
      : whatsNewNotes({ seenVersion: seen, currentVersion: info.serverVersion, notes: info.notes });
    setDialogNotes(notes.length > 0 ? notes : info.notes.slice(0, 1));
    setDialogOpen(true);
  }, [info]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const hideBanner = useCallback(() => setBannerHidden(true), []);

  /** Navigateur : recharger suffit à récupérer la nouvelle interface. */
  const reload = useCallback(() => {
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  /** Application Windows : lance le téléchargement de l'installeur. */
  const startDesktopUpdate = useCallback(() => {
    const currentBridge = desktopBridge();
    setDesktop((prev) => ({ ...prev, status: 'checking', error: null }));
    if (currentBridge?.updates?.check) currentBridge.updates.check();
  }, []);

  /** Application Windows : ferme puis installe la mise à jour téléchargée. */
  const installNow = useCallback(() => {
    const currentBridge = desktopBridge();
    if (currentBridge?.updates?.install) currentBridge.updates.install();
  }, []);

  /** Ouvre la page de téléchargement de l'installeur Windows. */
  const openDownloadPage = useCallback(() => {
    if (!info.downloadUrl || typeof window === 'undefined') return;
    window.open(info.downloadUrl, '_blank', 'noopener');
  }, [info.downloadUrl]);

  return {
    ...info,
    dialogOpen,
    dialogNotes,
    openDialog,
    closeDialog,
    bannerHidden,
    hideBanner,
    reload,
    desktopAvailable,
    desktop,
    // Mise à jour pilotée par l'application Windows (téléchargement en cours ou
    // prête à installer) : l'interface est livrée avec l'appli, donc le bandeau
    // doit aussi s'afficher sans décalage de version avec le serveur.
    desktopActive: ['available', 'downloading', 'downloaded'].includes(desktop.status),
    startDesktopUpdate,
    installNow,
    openDownloadPage,
    recheck: check,
  };
}
