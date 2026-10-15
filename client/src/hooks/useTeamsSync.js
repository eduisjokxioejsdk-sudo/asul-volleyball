// ============================================================================
// Hook de synchronisation cloud des équipes.
//
// Il donne à une page :
//   • l'état du partage à distance (configuré ou non, dernier passage, erreur) ;
//   • le déclenchement manuel (« Synchroniser maintenant ») ;
//   • l'enregistrement de la configuration Supabase (URL + clé) ;
//   • le rechargement automatique de la liste dès qu'un autre appareil (réseau
//     local) ou un autre poste (cloud) modifie une équipe.
//
// Le serveur émet `teams:changed` (voir server/src/socket.js) ; l'événement est
// écouté ici, une seule fois pour toute la page.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { teamsAPI } from '../services/api';
import { createSocket } from '../services/liveSocket';

/**
 * @param {() => void} onTeamsChanged  appelé quand la liste des équipes a changé.
 * @returns {{status, syncing, error, syncNow, saveConfig, refreshStatus}}
 */
export default function useTeamsSync(onTeamsChanged) {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const reloadRef = useRef(onTeamsChanged);
  reloadRef.current = onTeamsChanged;

  const refreshStatus = useCallback(async () => {
    try {
      const res = await teamsAPI.getSyncStatus();
      setStatus(res.data);
      return res.data;
    } catch (err) {
      // Serveur injoignable : on n'affiche pas d'erreur bloquante.
      return null;
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await teamsAPI.sync();
      setStatus(res.data?.status || null);
      const result = res.data?.result;
      if (result && result.ok === false && !result.skipped) {
        setError(result.error || 'Synchronisation impossible.');
      }
      if (reloadRef.current) reloadRef.current();
      return result || null;
    } catch (err) {
      setError(err.response?.data?.error || 'Synchronisation impossible.');
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  const saveConfig = useCallback(
    async (payload) => {
      setError(null);
      try {
        const res = await teamsAPI.saveSyncConfig(payload);
        setStatus(res.data?.status || null);
        return res.data;
      } catch (err) {
        setError(err.response?.data?.error || 'Enregistrement impossible.');
        return null;
      }
    },
    []
  );

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const socket = createSocket();
    const handleChanged = () => {
      if (reloadRef.current) reloadRef.current();
      refreshStatus();
    };
    socket.on('teams:changed', handleChanged);
    return () => {
      socket.off('teams:changed', handleChanged);
      socket.disconnect();
    };
  }, [refreshStatus]);

  return { status, syncing, error, syncNow, saveConfig, refreshStatus };
}
