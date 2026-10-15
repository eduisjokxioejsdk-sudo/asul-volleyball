// ============================================================================
// Barre « Partage à distance » réutilisable : état de la synchronisation cloud
// d'une collection + bouton « Synchroniser maintenant ». La configuration
// (URL/clé Supabase) reste dans l'onglet Équipes ; ici on consulte l'état et on
// force un envoi, sans jamais saisir la clé.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, RefreshCw, Share2 } from './icons';

export default function SyncStatusBar({ api, label = 'Données' }) {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getSyncStatus();
      setStatus(res.data);
    } catch (err) {
      setStatus(null);
    }
  }, [api]);

  useEffect(() => { refresh(); }, [refresh]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await api.sync();
      setStatus(res.data?.status || null);
      const result = res.data?.result;
      if (result && result.ok === false && !result.skipped) {
        setError(result.error || 'Synchronisation impossible.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Synchronisation impossible.');
    } finally {
      setSyncing(false);
    }
  };

  const summary = (() => {
    if (!status) return 'État du partage indisponible (serveur en cours de démarrage ?).';
    if (!status.configured) {
      return `Non configuré : les données restent sur cet appareil (voir l’onglet Équipes).`;
    }
    if (!status.enabled) return 'Désactivé : les données restent sur ce poste.';
    const when = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString('fr-FR') : 'jamais';
    const pending = status.pending ? ` · ${status.pending} en attente` : '';
    const err = status.lastError ? ` · dernière erreur : ${status.lastError}` : '';
    return `Partagé via Supabase · dernier passage : ${when}${pending}${err}`;
  })();

  return (
    <div className="dv-panel" style={{ margin: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status?.lastError ? <CircleAlert size={16} /> : <Share2 size={16} />}
          <div>
            <strong>Partage à distance</strong>
            <p className="dv-hint" style={{ margin: 0 }}>{summary}</p>
          </div>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={syncNow}
          disabled={syncing || !status?.enabled}
          title={status?.enabled ? 'Envoyer et recevoir maintenant' : 'Activez d’abord le partage dans l’onglet Équipes'}
        >
          <RefreshCw size={14} /> {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
      </div>
      {error && <div className="dv-flash err" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
