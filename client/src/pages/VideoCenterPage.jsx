// ============================================================================
// APPLICATION 3 : CENTRE VIDÉO & CONSULTATION STATISTIQUE
//
// 1. Liste de toutes les vidéos de match Data Volley (avec tri par équipe
//    et tri par joueur).
// 2. Mode Consultation Dédié : lecteur vidéo avec filtres interactifs
//    par équipe, par joueur, par type d'action (S, R, A, B, D, E) et par
//    qualité d'évaluation (#, +, !, -, /, =).
// ============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import VideoTvOverlay from '../components/VideoTvOverlay';
import PlaylistManagerModal from '../components/PlaylistManagerModal';
import useDualScreenVideo from '../hooks/useDualScreenVideo';
import { videosAPI, datavolleyAPI, teamsAPI, montageAPI } from '../services/api';
import useCollectionChanged from '../hooks/useCollectionChanged';
import { formatTimecode, groupActionsIntoRallies, buildPointSegments } from '../utils/datavolley';
import { computeMatchState } from '../utils/rotation';
import { Play, Pause, Clock, ArrowLeft, ChevronLeft, ChevronRight, Trash, FileDown, Tv, Camera, MonitorPlay, Upload } from '../components/icons';

const ACTION_TYPES = [
  { key: 'ALL', label: 'Toutes les actions' },
  { key: 'S', label: 'Service (S)' },
  { key: 'R', label: 'Réception (R)' },
  { key: 'A', label: 'Attaque (A)' },
  { key: 'B', label: 'Contre (B)' },
  { key: 'D', label: 'Défense (D)' },
  { key: 'E', label: 'Passe (E)' },
];

const QUALITY_FILTERS = [
  { key: 'ALL', label: 'Toutes qualités', color: '#a1a1aa' },
  { key: '#', label: '# Point / Parfait', color: '#10b981' },
  { key: '+', label: '+ Positif', color: '#0ea5e9' },
  { key: '!', label: '! Neutre', color: '#f59e0b' },
  { key: '-', label: '− Négatif', color: '#f97316' },
  { key: '/', label: '/ Contrée', color: '#a855f7' },
  { key: '=', label: '= Faute directe', color: '#e11d48' },
];

export default function VideoCenterPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialVideoId = searchParams.get('video');

  const [videos, setVideos] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtres dans la bibliothèque (Équipe + Recherche)
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Vidéo en cours de consultation
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [actions, setActions] = useState([]);

  // État du lecteur
  const videoRef = useRef(null);
  const videoAngle2Ref = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showTvOverlay, setShowTvOverlay] = useState(true);
  const [cameraView, setCameraView] = useState('1'); // '1' | '2' | 'split'
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // Commandes reçues du 2e écran : elles pilotent réellement le lecteur
  // principal (et non plus un simple « toggle » ignoré).
  const remoteCmdAtRef = useRef(0);

  const handleRemoteSeek = useCallback((time) => {
    const v = videoRef.current;
    const t = Number(time);
    if (!v || !Number.isFinite(t)) return;
    const next = Math.max(0, t);
    remoteCmdAtRef.current = Date.now();
    try {
      v.currentTime = next;
    } catch {
      // Métadonnées pas encore chargées : la position sera reprise ensuite.
    }
    setCurrentTime(next);
  }, []);

  const handleRemotePlayState = useCallback((playing) => {
    const v = videoRef.current;
    if (!v) return;
    remoteCmdAtRef.current = Date.now();
    if (playing) {
      // La lecture peut être refusée (autoplay) : on ne reflète que l'état réel.
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const { popoutActive, openSecondScreen, broadcastSync } = useDualScreenVideo({
    onRemoteSeek: handleRemoteSeek,
    onRemotePlayState: handleRemotePlayState,
  });

  // Export MP4 de la playlist filtrée (Feature 11)
  const [exportingMp4, setExportingMp4] = useState(false);
  const [exportJob, setExportJob] = useState(null); // { id, status, progress, step }
  const [exportError, setExportError] = useState('');

  // Filtres de consultation
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterQuality, setFilterQuality] = useState('ALL');
  const [filterTeam, setFilterTeam] = useState('ALL');
  const [filterPlayer, setFilterPlayer] = useState('ALL'); // 'ALL' ou 'home:7' / 'away:12'
  const [activeActionIndex, setActiveActionIndex] = useState(-1);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vidsRes, teamsRes] = await Promise.all([
        videosAPI.getAll(),
        teamsAPI.getAll().catch(() => ({ data: { teams: [] } })),
      ]);
      const list = vidsRes.data?.videos || [];
      setVideos(list);
      setTeams(teamsRes.data?.teams || []);

      if (initialVideoId) {
        const found = list.find((v) => String(v.id) === String(initialVideoId));
        if (found) openVideoConsultation(found);
      }
    } catch (err) {
      console.error('Erreur chargement Centre Vidéo:', err);
    } finally {
      setLoading(false);
    }
  };

  useCollectionChanged('videos', loadData);
  useCollectionChanged('teams', loadData);

  const videoHasTeam = (v, teamId) => {
    const targetTeam = teams.find((t) => String(t.id) === String(teamId));
    const matchById =
      String(v.home_team_id) === String(teamId) ||
      String(v.away_team_id) === String(teamId);
    const matchByName =
      targetTeam &&
      ((v.team1_name || '').toLowerCase() === targetTeam.name.toLowerCase() ||
        (v.team2_name || '').toLowerCase() === targetTeam.name.toLowerCase());
    return Boolean(matchById || matchByName);
  };

  const openVideoConsultation = async (video) => {
    setSelectedVideo(video);
    setCurrentTime(0);
    setActiveActionIndex(-1);
    setFilterAction('ALL');
    setFilterQuality('ALL');
    setFilterTeam('ALL');
    setFilterPlayer('ALL');

    try {
      const res = await datavolleyAPI.getActions(video.id);
      setActions(res.data?.actions || []);
    } catch (err) {
      console.warn('Erreur chargement actions Data Volley:', err);
      setActions([]);
    }
  };

  const closeVideoConsultation = () => {
    setSelectedVideo(null);
    setActions([]);
    setIsPlaying(false);
  };

  const handleDeleteVideo = async (e, videoId) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer définitivement cette vidéo de match ?')) return;
    try {
      await videosAPI.delete(videoId);
      if (selectedVideo?.id === videoId) closeVideoConsultation();
      loadData();
    } catch (err) {
      alert(`Erreur suppression: ${err.message}`);
    }
  };

  // Filtrage des vidéos dans la bibliothèque (Équipe + Recherche)
  const displayedVideos = useMemo(() => {
    return videos.filter((v) => {
      if (selectedTeamFilter !== 'ALL' && !videoHasTeam(v, selectedTeamFilter)) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (v.display_name || v.original_name || '').toLowerCase();
      const t1 = (v.team1_name || '').toLowerCase();
      const t2 = (v.team2_name || '').toLowerCase();
      return name.includes(q) || t1.includes(q) || t2.includes(q);
    });
  }, [videos, teams, selectedTeamFilter, searchQuery]);

  // Liste des joueurs du match ouvert en consultation (effectifs des 2 équipes + numéros codés)
  const matchPlayers = useMemo(() => {
    if (!selectedVideo) return [];
    const map = new Map();

    const findTeamObj = (teamId, teamNameStr) =>
      teams.find(
        (t) =>
          (teamId && String(t.id) === String(teamId)) ||
          (teamNameStr && t.name.toLowerCase() === teamNameStr.toLowerCase())
      );

    const homeTeamObj = findTeamObj(selectedVideo.home_team_id, selectedVideo.team1_name);
    const awayTeamObj = findTeamObj(selectedVideo.away_team_id, selectedVideo.team2_name);

    const addPlayer = (side, number, name = '') => {
      const num = Number(number);
      if (!num && num !== 0) return;
      const key = `${side}:${num}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          side,
          number: num,
          name: name || '',
          actionCount: 0,
        });
      } else if (name && !map.get(key).name) {
        map.get(key).name = name;
      }
    };

    for (const p of homeTeamObj?.players || []) addPlayer('home', p.number, p.name);
    for (const p of awayTeamObj?.players || []) addPlayer('away', p.number, p.name);

    for (const act of actions || []) {
      if (!act || act.player_number == null) continue;
      const side = act.team === 'away' ? 'away' : 'home';
      addPlayer(side, act.player_number, '');
      const key = `${side}:${Number(act.player_number)}`;
      if (map.has(key)) map.get(key).actionCount += 1;
    }

    return [...map.values()]
      .filter((p) => filterTeam === 'ALL' || p.side === filterTeam)
      .sort((a, b) => {
        if (a.side !== b.side) return a.side === 'home' ? -1 : 1;
        return a.number - b.number;
      });
  }, [selectedVideo, teams, actions, filterTeam]);

  // Filtrage des actions dans le mode consultation (Équipe + Joueur + Action + Qualité)
  const filteredActions = useMemo(() => {
    return actions.filter((act) => {
      if (!act) return false;
      if (filterAction !== 'ALL' && act.action !== filterAction) return false;
      if (filterQuality !== 'ALL' && act.evaluation !== filterQuality) return false;
      const actSide = act.team === 'away' ? 'away' : 'home';
      if (filterTeam !== 'ALL' && actSide !== filterTeam) return false;
      if (filterPlayer !== 'ALL') {
        const [pSide, pNum] = filterPlayer.split(':');
        if (actSide !== pSide || Number(act.player_number) !== Number(pNum)) return false;
      }
      return true;
    });
  }, [actions, filterAction, filterQuality, filterTeam, filterPlayer]);

  // Points (rallies) et segments vidéo correspondants — alimente le modal
  // de playlists multi-matchs (props `rallies` / `segments` attendues).
  const playlistRallies = useMemo(
    () => groupActionsIntoRallies(filteredActions, { byService: true }),
    [filteredActions]
  );
  const playlistSegments = useMemo(
    () => buildPointSegments(playlistRallies, { leadIn: 4, leadOut: 3 }),
    [playlistRallies]
  );

  const seekToAction = (act, idx) => {
    const v = videoRef.current;
    if (!v || act.timecode == null) return;
    const targetTime = Math.max(0, Number(act.timecode) - 2);
    v.currentTime = targetTime;
    v.play().catch(() => {});
    setIsPlaying(true);
    setActiveActionIndex(idx);
  };

  const nextAction = () => {
    if (filteredActions.length === 0) return;
    const nextIdx = (activeActionIndex + 1) % filteredActions.length;
    seekToAction(filteredActions[nextIdx], nextIdx);
  };

  const prevAction = () => {
    if (filteredActions.length === 0) return;
    const prevIdx = activeActionIndex <= 0 ? filteredActions.length - 1 : activeActionIndex - 1;
    seekToAction(filteredActions[prevIdx], prevIdx);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleSpeedChange = (speed) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  useEffect(() => {
    if (!selectedVideo) return undefined;
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      const v = videoRef.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); if (v.paused) v.play().catch(() => {}); else v.pause(); }
      else if (k === 'j') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5); }
      else if (k === 'l') { e.preventDefault(); v.currentTime += 5; }
      else if (k === 'n') { e.preventDefault(); nextAction(); }
      else if (k === 'p') { e.preventDefault(); prevAction(); }
      else if (e.key === ',') { e.preventDefault(); v.pause(); v.currentTime = Math.max(0, v.currentTime - 0.04); }
      else if (e.key === '.') { e.preventDefault(); v.pause(); v.currentTime += 0.04; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const videoUrl = selectedVideo?.filename ? videosAPI.getFileUrl(selectedVideo.filename) : null;
  const proxyFilename = selectedVideo?.filepath_proxy ? selectedVideo.filepath_proxy.split(/[\\/]/).pop() : null;
  const proxyUrl = proxyFilename ? videosAPI.getProxyUrl(proxyFilename) : null;
  const playbackUrl = proxyUrl || videoUrl;

  const angle2Url = selectedVideo?.filename_angle2 ? videosAPI.getFileUrl(selectedVideo.filename_angle2) : null;
  const angle2Offset = Number(selectedVideo?.angle2_offset || 0);

  const syncAngle2 = (t, shouldPlay = null) => {
    const v2 = videoAngle2Ref.current;
    if (!v2 || !angle2Url) return;
    const target = Math.max(0, (Number(t) || 0) + angle2Offset);
    if (Math.abs((v2.currentTime || 0) - target) > 0.25) {
      try {
        v2.currentTime = target;
      } catch {
        // ignore
      }
    }
    if (shouldPlay === true && v2.paused) v2.play().catch(() => {});
    if (shouldPlay === false && !v2.paused) v2.pause();
  };

  // État live du score et de l'action active au timecode courant (pour VideoTvOverlay)
  const overlayState = useMemo(() => {
    if (!actions.length) {
      return {
        score: { team1: 0, team2: 0 },
        setsWon: { team1: 0, team2: 0 },
        currentSet: 1,
        server: 'team1',
        activeAction: null,
      };
    }
    const upToNow = actions.filter((a) => a.timecode == null || Number(a.timecode) <= currentTime + 0.5);
    const subRallies = groupActionsIntoRallies(upToNow.length ? upToNow : actions);
    const st = computeMatchState(subRallies, {}, {}, []);
    const active =
      filteredActions[activeActionIndex] ||
      upToNow[upToNow.length - 1] ||
      actions[actions.length - 1] ||
      null;
    return {
      score: st.score,
      setsWon: st.setsWon,
      currentSet: st.currentSet,
      server: st.server,
      homeSetterPos: st.homeSetterPos,
      awaySetterPos: st.awaySetterPos,
      activeAction: active,
    };
  }, [actions, currentTime, filteredActions, activeActionIndex]);

  // Synchronisation vers la fenêtre détachée (2e écran) : source, timecode,
  // lecture, vitesse et incrustation score. Juste après une commande venue du
  // 2e écran, on ne renvoie pas la position en écho (le popout y est déjà), ce
  // qui évite les allers-retours de SEEK pendant la lecture.
  useEffect(() => {
    if (!popoutActive || !playbackUrl || !selectedVideo) return;
    const fromRemote = Date.now() - remoteCmdAtRef.current < 150;
    broadcastSync({
      videoId: selectedVideo.id,
      src: playbackUrl,
      currentTime: fromRemote ? undefined : currentTime,
      playing: isPlaying,
      playbackRate: playbackSpeed,
      title: `${selectedVideo.team1_name || 'Domicile'} vs ${selectedVideo.team2_name || 'Extérieur'}`,
      overlay: {
        scoreText: `${overlayState.setsWon.team1}-${overlayState.setsWon.team2} · Set ${overlayState.currentSet} · ${overlayState.score.team1}-${overlayState.score.team2}`,
        lastCode: overlayState.activeAction?.code || '',
      },
    });
  }, [popoutActive, playbackUrl, selectedVideo, currentTime, isPlaying, playbackSpeed, overlayState, broadcastSync]);

  // Export MP4 de la sélection filtrée via FFmpeg (Feature 11)
  const handleExportFilteredMp4 = async () => {
    if (!selectedVideo) return;
    const validClips = filteredActions.filter((a) => a.timecode != null);
    if (validClips.length === 0) {
      setExportError('Aucune action filtrée ne possède de timecode vidéo.');
      return;
    }
    setExportError('');
    setExportingMp4(true);
    try {
      const filterDesc = [
        filterTeam !== 'ALL' ? (filterTeam === 'home' ? team1 : team2) : '2 Équipes',
        filterPlayer !== 'ALL' ? `Joueur ${filterPlayer.split(':')[1]}` : null,
        filterAction !== 'ALL' ? `Action ${filterAction}` : null,
        filterQuality !== 'ALL' ? `Éval ${filterQuality}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const clipsPayload = validClips.map((a, idx) => {
        const tc = Number(a.timecode) || 0;
        return {
          startTime: Math.max(0, tc - 2.5),
          endTime: tc + 3.5,
          title: `${a.code || ''} — ${playerDisplayName(a)}`,
          subtitle: `Clip #${idx + 1} · ${a.team === 'away' ? team2 : team1} · ${formatTimecode(tc)}`,
        };
      });

      const res = await montageAPI.create(selectedVideo.id, {
        title: `Playlist_${team1}_vs_${team2}_${validClips.length}clips`,
        description: filterDesc,
        clips: clipsPayload,
        options: {
          resolution: '720p',
          includeIntro: true,
          includeOverlay: true,
          leadIn: 0,
          leadOut: 0,
        },
      });

      const mId = res.data?.montageId;
      if (mId) {
        setExportJob({ id: mId, status: 'processing', progress: 5, step: 'Démarrage FFmpeg…' });
      }
    } catch (err) {
      setExportError(err?.response?.data?.error || 'Erreur lors du lancement de l’export MP4.');
      setExportingMp4(false);
    }
  };

  useEffect(() => {
    if (!exportJob || !selectedVideo || exportJob.status === 'completed' || exportJob.status === 'error') {
      return undefined;
    }
    const timer = setInterval(async () => {
      try {
        const res = await montageAPI.getOne(selectedVideo.id, exportJob.id);
        const m = res.data?.montage;
        if (!m) return;
        setExportJob({
          id: m.id,
          status: m.status,
          progress: m.progress || 0,
          step: m.progress_step || '',
          error: m.error_message || '',
        });
        if (m.status === 'completed' || m.status === 'error') {
          setExportingMp4(false);
          clearInterval(timer);
        }
      } catch {
        // ignore transient polling error
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [exportJob, selectedVideo]);

  const team1 = selectedVideo?.team1_name || 'Domicile';
  const team2 = selectedVideo?.team2_name || 'Extérieur';

  const playerDisplayName = (act) => {
    const side = act.team === 'away' ? 'away' : 'home';
    const num = Number(act.player_number);
    const found = matchPlayers.find((p) => p.side === side && p.number === num);
    if (found?.name) return `N°${String(num).padStart(2, '0')} ${found.name}`;
    return `N°${act.player_number || '?'}`;
  };

  return (
    <div className="video-center-page app-shell-dark">
      <AppNavigation user={user} onLogout={onLogout} />

      <main className="video-center-content">
        {/* ========================================================= */}
        {/* VUE 1 : BIBLIOTHÈQUE VIDÉO (TRI PAR ÉQUIPE & PAR JOUEUR)  */}
        {/* ========================================================= */}
        {!selectedVideo ? (
          <div className="pk-mode-home">
            <header className="pk-mode-header" style={{ borderLeftColor: '#10b981' }}>
              <div className="pk-mode-header-left">
                <PancakeLogo size={60} />
                <div>
                  <h1 className="pk-mode-header-title">Centre Vidéo · Consultation & Séquençage</h1>
                  <p className="pk-mode-header-sub">
                    Retrouvez toutes les vidéos importées dans Data Volley. Filtrez par équipe, puis ouvrez un match pour filtrer par joueur, action et évaluation.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pk-mono" style={{ fontSize: 13, color: '#a1a1aa' }}>
                  {displayedVideos.length} / {videos.length} vidéo(s)
                </span>
                {/* L'import se fait dans Data Volley : même bibliothèque, même
                    propriétaire, et les actions restent liées à la vidéo. */}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/datavolley')}
                  title="Importer une vidéo de match depuis Data Volley (elle apparaîtra ensuite ici)"
                >
                  <Upload size={13} /> Importer une vidéo
                </button>
              </div>
            </header>

            {/* Barre de filtres : Équipe + Recherche */}
            <div className="pk-filter-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                    Filtrer par équipe :
                  </span>
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    style={{ minWidth: 210, fontWeight: 600 }}
                  >
                    <option value="ALL">Toutes les équipes ({teams.length})</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {selectedTeamFilter !== 'ALL' && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedTeamFilter('ALL')}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Rechercher un match ou une équipe…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ minWidth: 250 }}
              />
            </div>

            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px solid #27272a' }}>
                Chargement des vidéos…
              </div>
            ) : displayedVideos.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px dashed #3f3f46' }}>
                <PancakeLogo size={48} style={{ marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>
                  Aucune vidéo ne correspond aux filtres sélectionnés.
                </p>
                <p>Les vidéos uploadées dans l’onglet Data Volley s’affichent automatiquement ici.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 14 }}
                  onClick={() => navigate('/datavolley')}
                  title="Ouvrir Data Volley pour importer une vidéo de match"
                >
                  <Upload size={13} /> Importer une vidéo dans Data Volley
                </button>
              </div>
            ) : (
              <div className="pk-cards-list">
                {displayedVideos.map((v) => (
                  <div
                    key={v.id}
                    className="pk-match-item"
                    onClick={() => openVideoConsultation(v)}
                  >
                    <div>
                      <div className="pk-match-item-head">
                        <div className="pk-match-item-title">
                          {v.display_name || v.original_name}
                        </div>
                        <span
                          className="pk-mono"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            background: 'rgba(16, 185, 129, 0.14)',
                            color: '#10b981',
                            border: '1px solid #059669',
                          }}
                        >
                          CONSULTATION
                        </span>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <div className="pk-match-versus">
                          <span>{v.team1_name || 'Domicile'}</span>
                          <em>VS</em>
                          <span>{v.team2_name || 'Extérieur'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pk-match-item-foot" onClick={(e) => e.stopPropagation()}>
                      <span className="pk-mono" style={{ fontSize: 11.5, color: '#71717a' }}>
                        {v.created_at ? new Date(v.created_at).toLocaleDateString('fr-FR') : '—'}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openVideoConsultation(v)}
                        >
                          Consulter la vidéo →
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          title="Supprimer cette vidéo"
                          onClick={(e) => handleDeleteVideo(e, v.id)}
                        >
                          <Trash size={13} /> Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* VUE 2 : LECTEUR ET CONSULTATION AVEC FILTRE PAR JOUEUR    */
          /* ========================================================= */
          <div className="vc-consult-workspace">
            <div className="vc-consult-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeVideoConsultation}
                >
                  <ArrowLeft size={14} /> Retour aux vidéos
                </button>
                <PancakeLogo size={22} />
                <strong style={{ fontSize: 15, color: '#f4f4f5' }}>
                  {selectedVideo.display_name || selectedVideo.original_name}
                </strong>
                <span className="pk-match-versus" style={{ padding: '3px 10px', fontSize: 12 }}>
                  <span>{team1}</span>
                  <em>VS</em>
                  <span>{team2}</span>
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate(`/datavolley/${selectedVideo.id}`)}
              >
                Ouvrir en saisie DataVolley →
              </button>
            </div>

            <div className="vc-consult-grid">
              {/* Colonne Gauche : Lecteur Vidéo + Liste Play-by-Play filtrée */}
              <div className="vc-player-column">
                <div
                  className="vc-video-frame"
                  style={{
                    position: 'relative',
                    display: cameraView === 'split' && angle2Url ? 'grid' : 'block',
                    gridTemplateColumns: cameraView === 'split' && angle2Url ? '1fr 1fr' : undefined,
                    gap: cameraView === 'split' && angle2Url ? 4 : 0,
                  }}
                >
                  {cameraView !== '2' && (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <video
                        ref={videoRef}
                        src={playbackUrl}
                        className="vc-active-player"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        controls
                        onTimeUpdate={(e) => {
                          setCurrentTime(e.currentTarget.currentTime);
                          syncAngle2(e.currentTarget.currentTime, null);
                        }}
                        onSeeked={(e) => syncAngle2(e.currentTarget.currentTime, null)}
                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        onPlay={(e) => {
                          setIsPlaying(true);
                          syncAngle2(e.currentTarget.currentTime, true);
                        }}
                        onPause={(e) => {
                          setIsPlaying(false);
                          syncAngle2(e.currentTarget.currentTime, false);
                        }}
                      />
                      <VideoTvOverlay
                        showScoreboard={showTvOverlay}
                        team1={team1}
                        team2={team2}
                        score={overlayState.score}
                        setsWon={overlayState.setsWon}
                        currentSet={overlayState.currentSet}
                        server={overlayState.server}
                        homeSetterPos={overlayState.homeSetterPos}
                        awaySetterPos={overlayState.awaySetterPos}
                        activeAction={overlayState.activeAction}
                      />
                    </div>
                  )}

                  {angle2Url && (cameraView === '2' || cameraView === 'split') && (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <video
                        ref={videoAngle2Ref}
                        src={angle2Url}
                        className="vc-active-player"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        controls={cameraView === '2'}
                        muted={cameraView === 'split'}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          padding: '2px 6px',
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          background: 'rgba(9,9,11,0.85)',
                          border: '1px solid #3f3f46',
                          color: '#38bdf8',
                        }}
                      >
                        CAM 2
                      </span>
                    </div>
                  )}
                </div>

                <div className="vc-player-controls-strip" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                      }}
                    >
                      -5s <kbd>J</kbd>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${isPlaying ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={togglePlay}
                    >
                      {isPlaying ? <Pause size={13} /> : <Play size={13} />} {isPlaying ? 'Pause' : 'Lecture'} <kbd>K</kbd>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime += 5;
                      }}
                    >
                      +5s <kbd>L</kbd>
                    </button>
                  </div>

                  <div className="vc-time-display" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <Clock size={13} />
                    <span>{formatTimecode(currentTime)}</span> / <span>{formatTimecode(duration)}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${showTvOverlay ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setShowTvOverlay((v) => !v)}
                      title="Afficher / masquer le bandeau TV Score + Code actif"
                    >
                      <Tv size={12} /> TV Score
                    </button>
                    {angle2Url && (
                      <div className="btn-group-horizontal">
                        <button
                          type="button"
                          className={`btn btn-sm ${cameraView === '1' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setCameraView('1')}
                        >
                          Cam 1
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${cameraView === '2' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setCameraView('2')}
                        >
                          Cam 2
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${cameraView === 'split' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setCameraView('split')}
                        >
                          2 Angles
                        </button>
                      </div>
                    )}
                    <span style={{ fontSize: 11.5, color: '#a1a1aa', marginLeft: 4 }}>Vitesse :</span>
                    {[0.25, 0.5, 1, 1.5, 2].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={`speed-pill ${playbackSpeed === spd ? 'active' : ''}`}
                        onClick={() => handleSpeedChange(spd)}
                      >
                        {spd}x
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`btn btn-sm ${popoutActive ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() =>
                        openSecondScreen({
                          videoId: selectedVideo.id,
                          src: playbackUrl,
                          currentTime,
                          playing: isPlaying,
                          playbackRate: playbackSpeed,
                          title: `${team1} vs ${team2}`,
                        })
                      }
                      title="Ouvrir le lecteur vidéo détaché sur un 2e écran (optionnel)"
                    >
                      <MonitorPlay size={12} /> {popoutActive ? '2e écran actif' : '2e écran'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPlaylistOpen(true)}
                      title="Gérer les playlists multi-matchs"
                    >
                      🎬 Playlists
                    </button>
                  </div>
                </div>

                <div className="vc-actions-shelf">
                  <div className="shelf-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <strong>Play-by-Play filtré · {filteredActions.length} séquence(s)</strong>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleExportFilteredMp4}
                        disabled={exportingMp4 || filteredActions.length === 0}
                        title="Découper et concaténer automatiquement les séquences filtrées en un fichier MP4 téléchargeable (avec bandeau code & joueur)"
                      >
                        <FileDown size={13} />{' '}
                        {exportingMp4
                          ? `Export MP4 (${exportJob?.progress || 0}%)…`
                          : `Exporter la sélection en MP4 (${filteredActions.length})`}
                      </button>
                      {exportJob?.status === 'completed' && (
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          onClick={() =>
                            montageAPI
                              .download(
                                selectedVideo.id,
                                exportJob.id,
                                `${exportJob.title || 'montage'}.mp4`
                              )
                              .catch(() =>
                                setExportError('Erreur lors du téléchargement du MP4.')
                              )
                          }
                          title="Télécharger le montage (requête authentifiée)"
                        >
                          <FileDown size={13} /> Télécharger le MP4
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={prevAction}
                        disabled={filteredActions.length === 0}
                      >
                        <ChevronLeft size={13} /> Précédente <kbd>P</kbd>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={nextAction}
                        disabled={filteredActions.length === 0}
                      >
                        Suivante <kbd>N</kbd> <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                  {(exportingMp4 || exportError || exportJob?.status === 'error') && (
                    <div
                      style={{
                        padding: '6px 12px',
                        fontSize: 11,
                        fontFamily: 'JetBrains Mono, monospace',
                        background: '#09090b',
                        borderBottom: '1px solid #27272a',
                        color: exportError || exportJob?.status === 'error' ? '#f43f5e' : '#f59e0b',
                      }}
                    >
                      {exportError ||
                        (exportJob?.status === 'error'
                          ? `Échec export MP4 : ${exportJob.error || 'Erreur FFmpeg'}`
                          : `Génération MP4 en cours : ${exportJob?.progress || 0}% — ${exportJob?.step || ''}`)}
                    </div>
                  )}

                  {filteredActions.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                      Aucune action ne correspond aux filtres sélectionnés (Équipe / Joueur / Action / Évaluation).
                    </div>
                  ) : (
                    <div className="shelf-clips-list">
                      {filteredActions.map((act, i) => {
                        const isCurrent = activeActionIndex === i;
                        const qualMeta = QUALITY_FILTERS.find((q) => q.key === act.evaluation) || {
                          color: '#0ea5e9',
                        };
                        return (
                          <div
                            key={act.uid || i}
                            className={`shelf-clip-card ${isCurrent ? 'selected' : ''}`}
                            onClick={() => seekToAction(act, i)}
                          >
                            <span className="clip-time">
                              <Play size={10} /> {formatTimecode(act.timecode || 0)}
                            </span>
                            <span className="clip-code">
                              {act.code || '—'}
                            </span>
                            <span
                              className="clip-eval-badge"
                              style={{ background: `${qualMeta.color}25`, color: qualMeta.color, border: `1px solid ${qualMeta.color}55` }}
                            >
                              {act.evaluation || '•'}
                            </span>
                            <span className="clip-desc">
                              {act.team === 'away' ? team2 : team1} · <strong>{playerDisplayName(act)}</strong>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Colonne Droite : Menu de Filtres Interactif (Équipe, Joueur, Action, Évaluation) */}
              <div className="vc-filter-column">
                <div className="vc-filter-card">
                  <div className="filter-header">
                    <h3>Filtres de Consultation</h3>
                    {(filterAction !== 'ALL' || filterQuality !== 'ALL' || filterTeam !== 'ALL' || filterPlayer !== 'ALL') && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setFilterAction('ALL');
                          setFilterQuality('ALL');
                          setFilterTeam('ALL');
                          setFilterPlayer('ALL');
                        }}
                      >
                        Tout réinitialiser
                      </button>
                    )}
                  </div>

                  {/* 1. Équipe */}
                  <div className="filter-section">
                    <label className="filter-label">1. Équipe</label>
                    <div className="filter-chips-grid">
                      <button
                        type="button"
                        className={`filter-chip ${filterTeam === 'ALL' ? 'active' : ''}`}
                        onClick={() => {
                          setFilterTeam('ALL');
                          setFilterPlayer('ALL');
                        }}
                      >
                        Les deux équipes
                      </button>
                      <button
                        type="button"
                        className={`filter-chip ${filterTeam === 'home' ? 'active' : ''}`}
                        onClick={() => {
                          setFilterTeam('home');
                          setFilterPlayer('ALL');
                        }}
                      >
                        {team1} (*)
                      </button>
                      <button
                        type="button"
                        className={`filter-chip ${filterTeam === 'away' ? 'active' : ''}`}
                        onClick={() => {
                          setFilterTeam('away');
                          setFilterPlayer('ALL');
                        }}
                      >
                        {team2} (a)
                      </button>
                    </div>
                  </div>

                  {/* 2. Joueur */}
                  <div className="filter-section">
                    <label className="filter-label">2. Joueur ({matchPlayers.length})</label>
                    <select
                      value={filterPlayer}
                      onChange={(e) => setFilterPlayer(e.target.value)}
                      style={{ width: '100%', marginBottom: 8, fontWeight: 600 }}
                    >
                      <option value="ALL">Tous les joueurs</option>
                      {matchPlayers.map((p) => (
                        <option key={p.key} value={p.key}>
                          N°{String(p.number).padStart(2, '0')} {p.name || 'Joueur'} ({p.side === 'away' ? team2 : team1}) — {p.actionCount} act.
                        </option>
                      ))}
                    </select>

                    {matchPlayers.length > 0 && (
                      <div className="filter-chips-grid" style={{ maxHeight: 150, overflowY: 'auto' }}>
                        <button
                          type="button"
                          className={`filter-chip ${filterPlayer === 'ALL' ? 'active' : ''}`}
                          onClick={() => setFilterPlayer('ALL')}
                        >
                          Tous
                        </button>
                        {matchPlayers.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            className={`filter-chip ${filterPlayer === p.key ? 'active' : ''}`}
                            onClick={() => setFilterPlayer(p.key)}
                            title={`${p.side === 'away' ? team2 : team1} · ${p.actionCount} action(s)`}
                          >
                            <span className="pk-mono">#{String(p.number).padStart(2, '0')}</span>
                            {p.name ? ` ${p.name}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Types d'actions */}
                  <div className="filter-section">
                    <label className="filter-label">3. Type d'action</label>
                    <div className="filter-chips-grid">
                      {ACTION_TYPES.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          className={`filter-chip ${filterAction === a.key ? 'active' : ''}`}
                          onClick={() => setFilterAction(a.key)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Qualités / Évaluations */}
                  <div className="filter-section">
                    <label className="filter-label">4. Évaluation</label>
                    <div className="filter-chips-grid">
                      {QUALITY_FILTERS.map((q) => (
                        <button
                          key={q.key}
                          type="button"
                          className={`filter-chip ${filterQuality === q.key ? 'active' : ''}`}
                          style={{
                            borderColor: filterQuality === q.key ? q.color : undefined,
                            color: filterQuality === q.key ? '#09090b' : q.color,
                            background: filterQuality === q.key ? q.color : undefined,
                          }}
                          onClick={() => setFilterQuality(q.key)}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="filter-summary-box">
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#a1a1aa', marginBottom: 2 }}>
                      Séquences sélectionnées
                    </div>
                    <strong className="summary-count">{filteredActions.length} action(s)</strong>
                    <span style={{ fontSize: 12, color: '#71717a' }}>
                      sur {actions.length} codée(s)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <PlaylistManagerModal
        open={playlistOpen}
        onClose={() => setPlaylistOpen(false)}
        videoId={selectedVideo?.id}
        videoTitle={selectedVideo?.display_name || selectedVideo?.original_name || ''}
        rallies={playlistRallies}
        segments={playlistSegments}
      />
    </div>
  );
}
