// ============================================================================
// Accueil du mode « Playlists » : liste des playlists de séance et création.
//
// Une playlist réunit des actions choisies à la main, éventuellement issues de
// plusieurs matchs. Elle s'ouvre dans un lecteur dédié où l'on ajoute les
// actions au fil du visionnage (voir PlaylistDashboard).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playlistAPI } from '../services/api';
import useCollectionChanged from '../hooks/useCollectionChanged';
import { Check, Copy, Film, Pencil, Play, Plus, Trash, X } from '../components/icons';
import { playlistStats } from '../utils/playlists.js';

/** Durée lisible (12 min 30 s). */
function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes === 0 ? `${rest} s` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlaylistHome() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await playlistAPI.getAll();
      setPlaylists(res.data.playlists || []);
    } catch (err) {
      console.error('Failed to load playlists:', err);
      setMsg({ ok: false, text: err.response?.data?.error || 'Playlists indisponibles.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Une playlist créée/modifiée/supprimée sur un autre poste du réseau recharge la liste.
  useCollectionChanged('playlists', load);

  const create = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setMsg({ ok: false, text: 'Donnez un nom à la playlist (ex. « N°4 — attaques poste 4 »).' });
      return;
    }
    setCreating(true);
    try {
      const res = await playlistAPI.create(name, [], form.description.trim() || null);
      setShowCreate(false);
      setForm({ name: '', description: '' });
      navigate(`/playlists/${res.data.playlist.id}`);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Création impossible.' });
    } finally {
      setCreating(false);
    }
  };

  const rename = async (playlist) => {
    const name = (renaming?.name || '').trim();
    if (!name) {
      setRenaming(null);
      return;
    }
    try {
      const res = await playlistAPI.update(playlist.id, { name });
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? res.data.playlist : p)));
      setRenaming(null);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Renommage impossible.' });
    }
  };

  const duplicate = async (playlist) => {
    try {
      const res = await playlistAPI.create(`${playlist.name} (copie)`, playlist.items || []);
      setPlaylists((prev) => [res.data.playlist, ...prev]);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Copie impossible.' });
    }
  };

  const remove = async (playlist) => {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer la playlist « ${playlist.name} » ?`)) return;
    try {
      await playlistAPI.delete(playlist.id);
      setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Suppression impossible.' });
    }
  };

  return (
    <div className="plp-home">
      <div className="live-section-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Film size={18} /> Playlists de séance
        </h3>
        <div className="live-section-actions">
          {!showCreate && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowCreate(true);
                setMsg(null);
              }}
            >
              <Plus size={14} /> Nouvelle playlist
            </button>
          )}
        </div>
      </div>

      <p className="dv-hint">
        Réunissez des actions de plusieurs matchs : ouvrez un match, relisez-le point par point ou triez par
        poste de départ (4, 3, 2, arrière), puis ajoutez ce qui vous intéresse. La playlist se relit ensuite
        en continu, avec la liste des actions à côté du lecteur.
      </p>

      {msg && <div className={`live-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {showCreate && (
        <form className="live-create-form plp-create" onSubmit={create}>
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Nom (ex. N°4 — attaques poste 4)"
            autoFocus
          />
          <input
            type="text"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Description (facultatif)"
          />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Création…' : 'Créer'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
            Annuler
          </button>
        </form>
      )}

      {loading ? (
        <p className="dv-hint">Chargement…</p>
      ) : playlists.length === 0 ? (
        <div className="tj-empty">
          <p>Aucune playlist pour l’instant.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Créer la première playlist
          </button>
        </div>
      ) : (
        <div className="tj-home-list">
          {playlists.map((playlist) => {
            const stats = playlistStats(playlist.items || []);
            const isRenaming = renaming?.id === playlist.id;
            return (
              <div key={playlist.id} className="live-card tj-home-card">
                <button
                  type="button"
                  className="tj-home-open"
                  onClick={() => navigate(`/playlists/${playlist.id}`)}
                  title="Ouvrir la playlist dans le lecteur"
                >
                  <span className="live-card-name">{playlist.name}</span>
                  {playlist.description && <span className="live-card-teams">{playlist.description}</span>}
                  <span className="tj-home-meta">
                    <span>{formatDate(playlist.created_at)}</span>
                    <span className="live-status active">{stats.count} action(s)</span>
                    {stats.matches > 0 && (
                      <span className="live-status finished">{stats.matches} match(s)</span>
                    )}
                    {stats.duration > 0 && <span>{formatDuration(stats.duration)}</span>}
                  </span>
                </button>

                <div className="tj-home-actions">
                  {isRenaming ? (
                    <>
                      <input
                        type="text"
                        className="plp-rename-input"
                        value={renaming.name}
                        onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') rename(playlist);
                          if (event.key === 'Escape') setRenaming(null);
                        }}
                        autoFocus
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => rename(playlist)}>
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setRenaming(null)}
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/playlists/${playlist.id}`)}
                      >
                        <Play size={13} /> Ouvrir
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setRenaming({ id: playlist.id, name: playlist.name })}
                      >
                        <Pencil size={13} /> Renommer
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => duplicate(playlist)}
                        title="Créer une copie de cette playlist"
                      >
                        <Copy size={13} /> Dupliquer
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm tj-home-trash"
                        onClick={() => remove(playlist)}
                        title="Supprimer cette playlist"
                      >
                        <Trash size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
