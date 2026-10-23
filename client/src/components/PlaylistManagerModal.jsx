// ============================================================================
// PLAYLISTS VIDÉO MULTI-MATCHS PERSISTANTES (Point 19).
//
// Remplace l'ancien composant mono-match `RallyPlaylist.jsx` :
//   • Mode intégré (inline dans Consultation) : affiche les séquences du match
//     filtré + un bouton « + Enregistrer dans une Playlist Multi-Matchs » et un
//     sélecteur de playlists sauvegardées en base (`dv_playlists`).
//   • Mode modal / lecteur multi-matchs : permet de créer, renommer, supprimer
//     des playlists persistantes regroupant des clips de N matchs différents
//     et de les lire enchaînés ou de les exporter en montage FFmpeg.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Clock, Pause, Play, Repeat, Trash } from './icons';
import { playlistsAPI, videosAPI } from '../services/api';
import { formatTimecode } from '../utils/datavolley';

export default function PlaylistManagerModal({
  open = true,
  inline = false,
  onClose,
  videoId = null,
  videoTitle = '',
  rallies = [],
  segments = [],
  activeIndex = null,
  onSeekPoint,
  playing = false,
  onTogglePlay,
  loop = false,
  onToggleLoop,
  onStep,
  leadIn = 4,
  leadOut = 3,
}) {
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [activeClipIndex, setActiveClipIndex] = useState(0);

  const notify = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const loadPlaylists = useCallback(async () => {
    try {
      const res = await playlistsAPI.getAll();
      const list = res.data?.playlists || [];
      setPlaylists(list);
      if (list.length > 0 && !selectedPlaylistId) {
        setSelectedPlaylistId(String(list[0].id));
      }
    } catch {
      // ignore offline or initial state
    }
  }, [selectedPlaylistId]);

  const loadPlaylistDetail = useCallback(async (pid) => {
    if (!pid) {
      setSelectedPlaylist(null);
      return;
    }
    try {
      // La liste renvoie déjà les items de chaque playlist : on recharge la
      // liste complète puis on isole la playlist demandée (pas de GET /:id).
      const res = await playlistsAPI.getAll();
      const list = res.data?.playlists || [];
      setPlaylists(list);
      const found = list.find((p) => String(p.id) === String(pid)) || null;
      setSelectedPlaylist(found);
      setActiveClipIndex(0);
    } catch {
      setSelectedPlaylist(null);
    }
  }, []);

  useEffect(() => {
    if (open || inline) {
      loadPlaylists();
    }
  }, [open, inline, loadPlaylists]);

  useEffect(() => {
    if (selectedPlaylistId) {
      loadPlaylistDetail(selectedPlaylistId);
    } else {
      setSelectedPlaylist(null);
    }
  }, [selectedPlaylistId, loadPlaylistDetail]);

  const activePointNumber = useMemo(() => {
    if (activeIndex == null) return null;
    const r = (rallies || []).find((x) => (x.actions || []).some((a) => a.action_index === activeIndex));
    return r ? r.pointNumber : null;
  }, [rallies, activeIndex]);

  const handleCreatePlaylist = async (e) => {
    e?.preventDefault?.();
    if (!newPlaylistName.trim()) return;
    setCreating(true);
    try {
      const res = await playlistsAPI.create({ name: newPlaylistName.trim(), description: videoTitle || '' });
      const created = res.data?.playlist;
      setNewPlaylistName('');
      await loadPlaylists();
      if (created?.id) {
        setSelectedPlaylistId(String(created.id));
        notify(`Playlist « ${created.name} » créée`);
      }
    } catch {
      notify('Erreur lors de la création de la playlist');
    } finally {
      setCreating(false);
    }
  };

  const handleAddFilteredPointsToPlaylist = async () => {
    if (!selectedPlaylistId || !videoId) {
      notify('Sélectionnez ou créez d’abord une playlist');
      return;
    }
    const itemsToAdd = (rallies || []).map((r) => {
      const acts = r.actions || [];
      const first = acts[0];
      const last = acts[acts.length - 1];
      const seg = (segments || []).find((s) => s.pointNumber === r.pointNumber);
      return {
        video_id: Number(videoId),
        action_code: acts.map((a) => a.code).join(' '),
        timecode: first?.timecode ?? seg?.startTime ?? 0,
        lead_in: leadIn,
        lead_out: leadOut,
        note: `${videoTitle ? videoTitle + ' · ' : ''}Point ${r.pointNumber}`,
      };
    });
    if (!itemsToAdd.length) {
      notify('Aucun point filtré à ajouter');
      return;
    }
    try {
      await playlistsAPI.addItems(selectedPlaylistId, itemsToAdd);
      await loadPlaylistDetail(selectedPlaylistId);
      await loadPlaylists();
      notify(`${itemsToAdd.length} séquence(s) ajoutée(s) à la playlist !`);
    } catch {
      notify('Erreur lors de l’ajout à la playlist');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!selectedPlaylistId) return;
    try {
      await playlistsAPI.removeItem(selectedPlaylistId, itemId);
      await loadPlaylistDetail(selectedPlaylistId);
      await loadPlaylists();
    } catch { /* ignore */ }
  };

  const handleDeletePlaylist = async (pid) => {
    try {
      await playlistsAPI.delete(pid);
      setSelectedPlaylistId('');
      setSelectedPlaylist(null);
      await loadPlaylists();
      notify('Playlist supprimée');
    } catch { /* ignore */ }
  };

  // Mode intégré dans la colonne de droite de Consultation (remplace RallyPlaylist)
  if (inline) {
    return (
      <div className="rally-playlist">
        <div className="rally-playlist-head">
          <span className="rally-playlist-title">
            <Clock size={12} /> Playlist & Séquences ({rallies.length})
          </span>
          <div className="rally-playlist-controls">
            <button
              type="button"
              className={`btn btn-secondary btn-sm ${loop ? 'active' : ''}`}
              onClick={() => onToggleLoop?.()}
              title="Lecture en boucle des points"
            >
              <Repeat size={11} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(-1)} title="Point précédent">
              <ChevronsLeft size={11} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onTogglePlay} title={playing ? 'Pause' : 'Lecture'}>
              {playing ? <Pause size={11} /> : <Play size={11} />}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(1)} title="Point suivant">
              <ChevronsRight size={11} />
            </button>
          </div>
        </div>

        {/* Barre de sauvegarde dans une playlist multi-matchs persistante */}
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              style={{ flex: 1, fontSize: 11, padding: '4px 6px', borderRadius: 6 }}
              aria-label="Choisir une playlist multi-matchs"
            >
              <option value="">— Playlist multi-matchs —</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.item_count || 0} clips)
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ fontSize: 11, whiteSpace: 'nowrap' }}
              onClick={handleAddFilteredPointsToPlaylist}
              disabled={!selectedPlaylistId || rallies.length === 0}
              title="Enregistrer tous les points filtrés dans cette playlist persistante"
            >
              + Sauver ({rallies.length})
            </button>
          </div>

          <form onSubmit={handleCreatePlaylist} style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              placeholder="Nouvelle playlist multi-matchs…"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              style={{ flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 6 }}
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={creating || !newPlaylistName.trim()} style={{ fontSize: 11 }}>
              Créer
            </button>
          </form>
          {statusMsg && <div style={{ fontSize: 11, color: '#4ade80' }}>✓ {statusMsg}</div>}
        </div>

        <div className="rally-playlist-list">
          {rallies.length === 0 && <p className="dv-empty">Aucun point dans la sélection.</p>}
          {rallies.map((r) => {
            const actions = r.actions || [];
            const first = actions[0];
            const seg = (segments || []).find((s) => s.pointNumber === r.pointNumber);
            const selected = activePointNumber === r.pointNumber;
            const codeSummary = actions.map((a) => a.code).join(' ');
            return (
              <button
                key={r.pointNumber}
                type="button"
                className={`rally-item ${selected ? 'active' : ''}`}
                onClick={() => onSeekPoint?.(r)}
              >
                <span className="rally-item-num">P{r.pointNumber}</span>
                <span className="rally-item-code">{codeSummary}</span>
                <span className="rally-item-tc">
                  {seg ? `${formatTimecode(seg.segmentStart)} → ${formatTimecode(seg.segmentEnd)}` : formatTimecode(first?.timecode)}
                </span>
                <span className="rally-item-count">{actions.length}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!open) return null;

  const items = selectedPlaylist?.items || [];
  const activeClip = items[activeClipIndex] || null;
  const activeClipUrl = activeClip?.filename ? videosAPI.getFileUrl(activeClip.filename) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 980, width: '96%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>🎬 Playlists Vidéo Multi-Matchs (DataVolley 4)</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Colonne gauche : liste des playlists */}
          <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 10 }}>
            <h4 style={{ marginTop: 0, marginBottom: 10 }}>Mes Playlists ({playlists.length})</h4>
            <form onSubmit={handleCreatePlaylist} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Nom de la playlist…"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12 }}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !newPlaylistName.trim()}>
                +
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: String(pl.id) === String(selectedPlaylistId) ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.03)',
                    border: String(pl.id) === String(selectedPlaylistId) ? '1px solid #f97316' : '1px solid transparent',
                  }}
                  onClick={() => setSelectedPlaylistId(String(pl.id))}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{pl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pl.item_count || 0} séquence(s)</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlaylist(pl.id);
                    }}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne droite : lecteur séquentiel + clips de la playlist */}
          <div>
            {activeClip && activeClipUrl ? (
              <div style={{ marginBottom: 14 }}>
                <video
                  key={`${activeClip.id}-${activeClip.video_id}`}
                  src={activeClipUrl}
                  controls
                  autoPlay
                  style={{ width: '100%', maxHeight: 340, background: '#000', borderRadius: 8 }}
                  onLoadedMetadata={(e) => {
                    const start = Math.max(0, (Number(activeClip.timecode) || 0) - (Number(activeClip.lead_in) || 3));
                    e.currentTarget.currentTime = start;
                  }}
                  onTimeUpdate={(e) => {
                    const end = (Number(activeClip.timecode) || 0) + (Number(activeClip.lead_out) || 4);
                    if (end > 0 && e.currentTarget.currentTime >= end) {
                      if (activeClipIndex + 1 < items.length) {
                        setActiveClipIndex((i) => i + 1);
                      } else {
                        e.currentTarget.pause();
                      }
                    }
                  }}
                />
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
                  Clip {activeClipIndex + 1}/{items.length} · <strong>{activeClip.video_title || 'Match'}</strong> ·{' '}
                  <code>{activeClip.action_code}</code> ({activeClip.note})
                </div>
              </div>
            ) : (
              <p className="dv-hint">Sélectionnez une playlist contenant des clips pour lancer la lecture enchaînée multi-matchs.</p>
            )}

            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table className="dv-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Match</th>
                    <th>Note / Point</th>
                    <th>Codes</th>
                    <th>Timecode</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr
                      key={it.id}
                      style={{
                        cursor: 'pointer',
                        background: idx === activeClipIndex ? 'rgba(56,189,248,0.16)' : undefined,
                      }}
                      onClick={() => setActiveClipIndex(idx)}
                    >
                      <td>{idx + 1}</td>
                      <td>{it.video_title || `Match #${it.video_id}`}</td>
                      <td>{it.note || '—'}</td>
                      <td>
                        <code>{it.action_code || '—'}</code>
                      </td>
                      <td>{formatTimecode(it.timecode)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(it.id);
                          }}
                        >
                          <Trash size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
