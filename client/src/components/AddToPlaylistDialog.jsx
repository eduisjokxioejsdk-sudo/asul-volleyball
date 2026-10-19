// ============================================================================
// Boîte « Ajouter à une playlist » — depuis le codage d'un match.
//
// Reçoit des entrées de playlist déjà construites (utils/playlists.js) et les
// ajoute à la playlist choisie, ou à une playlist créée sur place. C'est le
// seul endroit où l'on écrit dans une playlist depuis le codage : le mode
// « Playlists » (onglet dédié) sert au visionnage et à la préparation.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { playlistAPI } from '../services/api';
import { normalizePlaylistItems, playlistStats } from '../utils/playlists.js';
import { Film, Plus } from './icons';

/**
 * @param {Object} props
 * @param {Array} props.items entrées à ajouter (playlistItemFromRally)
 * @param {() => void} props.onClose
 * @param {(ok:boolean, text:string) => void} [props.onDone]
 */
export default function AddToPlaylistDialog({ items, onClose, onDone }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const selected = Array.isArray(items) ? items : [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await playlistAPI.getAll();
        if (!cancelled) setPlaylists(res.data.playlists || []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Playlists indisponibles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(
    (name) => {
      if (onDone) onDone(true, `${selected.length} action(s) ajoutée(s) à « ${name} ».`);
      onClose?.();
    },
    [onDone, onClose, selected.length]
  );

  /** Ajoute la sélection à une playlist existante (fusion + renommage des positions). */
  const addTo = async (playlist) => {
    setBusy(true);
    setError(null);
    try {
      const merged = normalizePlaylistItems([...(playlist.items || []), ...selected]);
      const res = await playlistAPI.update(playlist.id, { items: merged });
      finish(res.data?.playlist?.name || playlist.name);
    } catch (err) {
      setError(err.response?.data?.error || 'Ajout impossible.');
    } finally {
      setBusy(false);
    }
  };

  /** Crée une playlist contenant directement la sélection. */
  const createAndAdd = async (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError('Donnez un nom à la playlist.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await playlistAPI.create(name, normalizePlaylistItems(selected));
      finish(res.data?.playlist?.name || name);
    } catch (err) {
      setError(err.response?.data?.error || 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const recap = playlistStats(selected);
  const first = selected[0];

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        style={{ maxWidth: 520 }}
      >
        <h2>
          <Film size={18} /> Ajouter à une playlist
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          {recap.count} action(s) ·{' '}
          {first?.scope === 'action' ? 'action seule' : 'point entier'}
          {first?.player_number
            ? ` · n°${String(first.player_number).padStart(2, '0')}${first.player_name ? ` ${first.player_name}` : ''}`
            : ''}
          {first?.poste ? ` · ${first.poste}` : ''}
        </p>

        {error && <div className="dv-flash err">{error}</div>}

        {loading ? (
          <p className="dv-hint">Chargement des playlists…</p>
        ) : playlists.length === 0 ? (
          <p className="dv-hint">
            Aucune playlist pour l’instant : créez-en une, elle recevra directement la sélection.
          </p>
        ) : (
          <div className="plp-pick-list">
            {playlists.map((playlist) => {
              const stats = playlistStats(playlist.items || []);
              return (
                <button
                  key={playlist.id}
                  type="button"
                  className="plp-pick"
                  onClick={() => addTo(playlist)}
                  disabled={busy}
                  title={`Ajouter à « ${playlist.name} »`}
                >
                  <span className="plp-pick-name">{playlist.name}</span>
                  <span className="plp-pick-meta">
                    {stats.count} action(s) · {stats.matches} match(s)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {showCreate ? (
          <form className="live-create-form" onSubmit={createAndAdd} style={{ marginTop: 12 }}>
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nom de la nouvelle playlist"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Créer et ajouter
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(true)}>
              <Plus size={13} /> Nouvelle playlist
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fermer
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
