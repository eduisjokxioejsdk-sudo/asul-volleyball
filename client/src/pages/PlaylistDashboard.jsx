// ============================================================================
// Lecteur d'une playlist de séance (mode « Playlists »).
//
// À gauche la vidéo, à droite deux onglets : « Playlist » (les actions ajoutées,
// dans l'ordre, cliquables) et « Ajouter » (parcours d'un match codé, point par
// point ou par joueur et poste de départ). La playlist enchaîne les actions,
// y compris d'un match à l'autre : la source vidéo change toute seule.
// Les modifications sont enregistrées automatiquement (base locale).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import MatchBrowser from '../components/MatchBrowser';
import PlaylistSidebar from '../components/PlaylistSidebar';
import ExportClipsDialog from '../components/ExportClipsDialog';
import { playlistAPI, videosAPI } from '../services/api';
import { downloadTextFile } from '../utils/download';
import { formatTimecode } from '../utils/datavolley.js';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Film,
  Keyboard,
  Loader,
  Pause,
  Play,
  Save,
  Square,
} from '../components/icons';
import {
  movePlaylistItem,
  normalizePlaylistItems,
  parsePlaylistItems,
  playlistStats,
  playlistToCsv,
  playlistToEdl,
  posteLabel,
  removePlaylistItem,
} from '../utils/playlists.js';

export default function PlaylistDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const saveTimer = useRef(null);

  const [playlist, setPlaylist] = useState(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);
  const [videos, setVideos] = useState([]);
  const [sources, setSources] = useState([]);
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('playlist');
  const [showExport, setShowExport] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const pendingSeek = useRef(null);

  const notify = useCallback((ok, text) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg((prev) => (prev?.text === text ? null : prev)), 4000);
  }, []);

  // --- Chargement : playlist, vidéos du poste, matchs codés -----------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [plRes, videoRes, sourceRes] = await Promise.all([
          playlistAPI.getOne(id),
          videosAPI.getAll().catch(() => ({ data: { videos: [] } })),
          playlistAPI.sources().catch(() => ({ data: { sources: [] } })),
        ]);
        if (cancelled) return;
        const loaded = plRes.data?.playlist;
        setPlaylist(loaded || null);
        setName(loaded?.name || '');
        setItems(parsePlaylistItems(loaded?.items || []));
        setVideos(videoRes.data?.videos || []);
        setSources(sourceRes.data?.sources || []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Playlist introuvable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // --- Enregistrement automatique (débouncé) --------------------------------
  useEffect(() => {
    if (!dirty) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await playlistAPI.update(id, { name, items });
        if (res.data?.playlist) setPlaylist(res.data.playlist);
        setDirty(false);
      } catch (err) {
        notify(false, err.response?.data?.error || 'Enregistrement impossible.');
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, id, name, items, notify]);

  const videoById = useMemo(() => new Map((videos || []).map((v) => [Number(v.id), v])), [videos]);
  const stats = useMemo(() => playlistStats(items), [items]);

  /** Matchs dont le fichier vidéo n'est pas présent sur ce poste. */
  const missingVideoIds = useMemo(() => {
    const missing = new Set();
    for (const item of items) {
      const video = videoById.get(Number(item.video_id));
      if (!video || !video.filename) missing.add(Number(item.video_id));
    }
    return missing;
  }, [items, videoById]);

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;
  const currentVideo = currentItem ? videoById.get(Number(currentItem.video_id)) : null;

  /** Adresse de lecture d'une entrée (version proxy si disponible). */
  const urlForItem = useCallback(
    (item) => {
      const video = videoById.get(Number(item?.video_id));
      if (!video || !video.filename) return null;
      const proxy = video.filepath_proxy ? String(video.filepath_proxy).split(/[\\/]/).pop() : null;
      return proxy ? videosAPI.getProxyUrl(proxy) : videosAPI.getFileUrl(video.filename);
    },
    [videoById]
  );

  /** Source de lecture de l'entrée en cours. */
  const playbackUrl = useMemo(() => urlForItem(currentItem), [urlForItem, currentItem]);

  // --- Lecture enchaînée ----------------------------------------------------

  /** Place la vidéo sur l'entrée voulue et lance la lecture. */
  const playItem = useCallback(
    (index) => {
      const item = items[index];
      if (!item) return;
      const url = urlForItem(item);
      if (!url) {
        setCurrentIndex(index);
        notify(false, 'Fichier vidéo absent sur ce poste : cette action ne peut pas être lue ici.');
        return;
      }
      setCurrentIndex(index);
      setPlaying(true);
      const el = videoRef.current;
      if (el && el.dataset.plsrc === url && el.readyState >= 1) {
        // Même match que la vidéo déjà chargée : on se place directement.
        el.currentTime = item.segment_start;
        el.play().catch(() => {});
        return;
      }
      pendingSeek.current = item.segment_start;
      setLoadingSource(true);
    },
    [items, urlForItem, notify]
  );

  const stopPlaylist = useCallback(() => {
    setPlaying(false);
    const el = videoRef.current;
    if (el) el.pause();
  }, []);

  /** Source chargée : on se place au début du segment et on relance si besoin. */
  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    el.dataset.plsrc = String(playbackUrl || '');
    setLoadingSource(false);
    const target = pendingSeek.current;
    if (target != null) {
      el.currentTime = target;
      pendingSeek.current = null;
    }
    if (playing) el.play().catch(() => {});
  };

  /** Fin du segment : on enchaîne l'entrée suivante (tous matchs confondus). */
  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !playing) return;
    const item = items[currentIndex];
    if (!item) return;
    if (el.currentTime < Number(item.segment_end)) return;
    if (currentIndex + 1 < items.length) playItem(currentIndex + 1);
    else stopPlaylist();
  };

  /** Reprend là où la lecture s'est arrêtée, ou lance la première action. */
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (playing) {
      stopPlaylist();
      return;
    }
    if (currentIndex >= 0 && el && el.dataset.plsrc === String(playbackUrl || '') && el.readyState >= 1) {
      setPlaying(true);
      el.play().catch(() => {});
      return;
    }
    if (items.length > 0) playItem(currentIndex >= 0 ? currentIndex : 0);
  }, [playing, currentIndex, items, playItem, stopPlaylist, playbackUrl]);

  // Raccourcis du lecteur : Espace (lecture/pause), ← / → (action précédente /
  // suivante), Échap (arrêter). Ignorés dès qu'un champ de saisie a le focus.
  useEffect(() => {
    const onKey = (event) => {
      const tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (items.length > 0) playItem(currentIndex < 0 ? 0 : currentIndex + 1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (currentIndex > 0) playItem(currentIndex - 1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        stopPlaylist();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, playItem, stopPlaylist, items.length, currentIndex]);

  // --- Modification de la playlist -----------------------------------------
  const addItems = useCallback(
    (added) => {
      if (!added || added.length === 0) return;
      setItems((prev) => normalizePlaylistItems([...prev, ...added]));
      setDirty(true);
      notify(true, `${added.length} action(s) ajoutée(s) à la playlist.`);
    },
    [notify]
  );

  const removeItem = useCallback((itemId) => {
    setItems((prev) => removePlaylistItem(prev, itemId));
    setDirty(true);
  }, []);

  const moveItem = useCallback((from, to) => {
    setItems((prev) => movePlaylistItem(prev, from, to));
    setDirty(true);
  }, []);

  const renamePlaylist = useCallback((value) => {
    setName(value);
    setDirty(true);
  }, []);

  /** Nom de fichier sûr pour les exports. */
  const exportSlug = () => (name || 'seance').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'seance';

  const exportCsv = () => {
    downloadTextFile(`playlist_${exportSlug()}.csv`, playlistToCsv(items), 'text/csv;charset=utf-8');
    notify(true, 'Feuille de séance exportée (CSV).');
  };

  const exportEdl = () => {
    downloadTextFile(
      `playlist_${exportSlug()}.edl`,
      playlistToEdl(items, { title: name || 'Playlist ASUL' }),
      'text/plain;charset=utf-8'
    );
    notify(true, 'Marqueurs de montage exportés (EDL).');
  };

  // Sauvegarde de sécurité : si l'on quitte la page avant la fin de la
  // temporisation, l'enregistrement en attente est déclenché immédiatement.
  const pendingSave = useRef(null);
  pendingSave.current = dirty ? { name, items } : null;
  useEffect(
    () => () => {
      const pending = pendingSave.current;
      if (pending) playlistAPI.update(id, pending).catch(() => {});
    },
    [id]
  );

  /** Enregistrement immédiat (sans attendre la temporisation). */
  const saveNow = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    try {
      const res = await playlistAPI.update(id, { name, items });
      if (res.data?.playlist) setPlaylist(res.data.playlist);
      setDirty(false);
      notify(true, 'Playlist enregistrée.');
    } catch (err) {
      notify(false, err.response?.data?.error || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p className="loading-text">Chargement de la playlist…</p>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="app-loading">
        <p>
          <CircleAlert size={14} /> {error || 'Playlist introuvable'}
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="video-dashboard dv-page">
      <div className="vd-workspace">
        <nav className="video-tabs dv-nav">
          <button
            type="button"
            className="back-btn"
            onClick={() => navigate('/dashboard')}
            title="Retour aux playlists"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="plp-title">
            <input
              type="text"
              className="plp-name-input"
              value={name}
              onChange={(event) => renamePlaylist(event.target.value)}
              title="Nom de la playlist"
            />
            <span className="plp-title-meta">
              {stats.count} action(s) · {stats.matches} match(s) ·{' '}
              {saving ? 'enregistrement…' : dirty ? 'modifications en attente' : 'enregistré'}
            </span>
          </div>
          <div className="plp-nav-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={saveNow}
              disabled={!dirty || saving}
              title="Enregistrer maintenant"
            >
              <Save size={13} /> Enregistrer
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => playItem(0)}
              disabled={items.length === 0}
              title="Lire la playlist depuis la première action"
            >
              <Play size={13} /> Lecture continue
            </button>
            {playing && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={stopPlaylist}>
                <Square size={13} /> Arrêter
              </button>
            )}
          </div>
        </nav>

        <div className="vd-main">
          {msg && <div className={`dv-flash ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

          <div className="plp-layout">
            <div className="plp-player-col">
              <div className="video-player-wrapper">
                {playbackUrl ? (
                  <video
                    ref={videoRef}
                    src={playbackUrl}
                    controls
                    playsInline
                    preload="auto"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={stopPlaylist}
                  />
                ) : (
                  <div className="plp-player-empty">
                    <Film size={26} />
                    <p>
                      {currentItem
                        ? 'Fichier vidéo absent sur ce poste : la playlist reste modifiable.'
                        : 'Choisissez une action dans la playlist, ou ajoutez-en depuis l’onglet « Ajouter des actions ».'}
                    </p>
                  </div>
                )}
              </div>

              <div className="plp-controls">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={togglePlay}
                  disabled={items.length === 0}
                  title={playing ? 'Mettre en pause (Espace)' : 'Lire (Espace)'}
                >
                  {playing ? (
                    <>
                      <Pause size={13} /> Pause
                    </>
                  ) : (
                    <>
                      <Play size={13} /> {currentIndex >= 0 ? 'Reprendre' : 'Lire'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => playItem(currentIndex - 1)}
                  disabled={currentIndex <= 0}
                  title="Action précédente (←)"
                >
                  <ChevronLeft size={13} /> Précédent
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => playItem(currentIndex < 0 ? 0 : currentIndex + 1)}
                  disabled={items.length === 0 || currentIndex >= items.length - 1}
                  title="Action suivante (→)"
                >
                  Suivant <ChevronRight size={13} />
                </button>
                {loadingSource && (
                  <span className="plp-loading">
                    <Loader size={13} /> Chargement du match…
                  </span>
                )}
                <span className="plp-keys">Espace : lecture/pause · ← → : action · Échap : arrêter</span>
              </div>

              {currentItem ? (
                <div className="plp-now">
                  <span className="plp-now-head">
                    <strong>
                      Action {currentItem.position}/{items.length} · {currentItem.action_code || '—'}
                    </strong>
                    <span>
                      {formatTimecode(currentItem.segment_start)} → {formatTimecode(currentItem.segment_end)}
                    </span>
                  </span>
                  <span className="plp-now-meta">
                    {currentItem.video_label || 'Match'}
                    {currentItem.player_number
                      ? ` · n°${String(currentItem.player_number).padStart(2, '0')}${
                          currentItem.player_name ? ` ${currentItem.player_name}` : ''
                        }`
                      : ''}
                    {currentItem.poste ? ` · ${posteLabel(currentItem.poste)}` : ''}
                    {currentItem.point_number ? ` · point ${currentItem.point_number}` : ''}
                  </span>
                  {currentVideo && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/datavolley/${currentVideo.id}`)}
                      title="Ouvrir ce match dans le codage DataVolley"
                    >
                      <Keyboard size={13} /> Ouvrir dans le codage
                    </button>
                  )}
                </div>
              ) : (
                <p className="dv-hint">
                  La vidéo suit la playlist : chaque action est jouée avec son avance et sa sortie, puis on
                  passe à la suivante — même si elle vient d’un autre match.
                </p>
              )}
            </div>

            <div className="plp-side-col">
              <div className="plp-side-tabs">
                <button
                  type="button"
                  className={tab === 'playlist' ? 'active' : ''}
                  onClick={() => setTab('playlist')}
                >
                  Playlist ({items.length})
                </button>
                <button
                  type="button"
                  className={tab === 'ajouter' ? 'active' : ''}
                  onClick={() => setTab('ajouter')}
                >
                  Ajouter des actions
                </button>
              </div>

              {tab === 'playlist' ? (
                <PlaylistSidebar
                  items={items}
                  currentIndex={currentIndex}
                  missingVideoIds={missingVideoIds}
                  onPlay={playItem}
                  onRemove={removeItem}
                  onMove={moveItem}
                  onExportCsv={exportCsv}
                  onExportEdl={exportEdl}
                  onExportClips={() => setShowExport(true)}
                />
              ) : (
                <MatchBrowser
                  sources={sources}
                  activeSourceId={activeSourceId}
                  onSelectSource={setActiveSourceId}
                  onAddItems={addItems}
                  onNotify={notify}
                />
              )}
            </div>

          </div>
        </div>{/* /.vd-main */}
      </div>{/* /.vd-workspace */}

      {/* Export de clips MP4 : découpe ffmpeg côté serveur (tâche de fond). */}
      <AnimatePresence>
        {showExport && (
          <ExportClipsDialog
            playlist={playlist}
            items={items}
            onClose={() => setShowExport(false)}
            onNotify={notify}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
