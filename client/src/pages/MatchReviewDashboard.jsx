// ============================================================================
// Mode « Relecture » : relire un match en enchaînant les points, sans les temps
// morts. À gauche la vidéo (les segments s'enchaînent, tout ce qui est entre
// deux points est sauté) ; à droite, en permanence : filtres action / qualité /
// position, liste des points (le point lu est surligné et suit la lecture) et
// actions du point en cours, prêtes à rejoindre une playlist d'un clic.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog';
import MatchReviewSidebar from '../components/MatchReviewSidebar';
import { datavolleyAPI, videosAPI } from '../services/api';
import { formatTimecode, rallyWinMethod } from '../utils/datavolley.js';
import { parseSavedLineup } from '../utils/lineup.js';
import { filterPlaylistPoints, normalizePlaylistItems, playlistItemFromRally } from '../utils/playlists.js';
import { pointIndexAt, reviewPoints, reviewTotals, stepPoint } from '../utils/matchReview.js';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Keyboard,
  Pause,
  Play,
  Square,
} from '../components/icons';

const EMPTY_FILTERS = {
  team: 'all',
  action: 'all',
  evaluation: 'all',
  method: 'all',
  playerNumber: 'all',
  poste: 'all',
  setNumber: 'all',
};

const LEAD_CHOICES = [2, 3, 4, 6];
const SPEED_CHOICES = [0.5, 1, 1.5, 2];

export default function MatchReviewDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [actions, setActions] = useState([]);
  const [sync, setSync] = useState({ sync_offset: 0, lead_in: 4, lead_out: 3 });
  const [configs, setConfigs] = useState({ home: { roster: [] }, away: { roster: [] } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [skipDeadTime, setSkipDeadTime] = useState(true);
  const [leadIn, setLeadIn] = useState(4);
  const [leadOut, setLeadOut] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(null);
  const [addTarget, setAddTarget] = useState(null);

  const notify = useCallback((ok, text) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg((prev) => (prev?.text === text ? null : prev)), 4000);
  }, []);

  // Chargement : match + codage + synchronisation + six de départ (joueurs).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [videoRes, actRes, syncRes, setupsRes] = await Promise.all([
          videosAPI.getOne(id),
          datavolleyAPI.getActions(id),
          datavolleyAPI.getSync(id).catch(() => ({ data: {} })),
          datavolleyAPI.getSetups(id).catch(() => ({ data: { setups: {} } })),
        ]);
        if (cancelled) return;
        setVideo(videoRes.data?.video || null);
        setActions(actRes.data?.actions || []);
        const loadedSync = syncRes.data?.sync || { sync_offset: 0, lead_in: 4, lead_out: 3 };
        setSync(loadedSync);
        setLeadIn(Number(loadedSync.lead_in ?? 4));
        setLeadOut(Number(loadedSync.lead_out ?? 3));
        const setups = setupsRes.data?.setups || {};
        const firstSet = Object.values(setups)[0] || {};
        setConfigs({
          home: parseSavedLineup(firstSet.home_lineup).config,
          away: parseSavedLineup(firstSet.away_lineup).config,
        });
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Match introuvable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Points de relecture : lead-in / lead-out réglables, offset du match. */
  const points = useMemo(
    () => reviewPoints(actions, { ...sync, lead_in: leadIn, lead_out: leadOut }),
    [actions, sync, leadIn, leadOut]
  );

  /** Points qui satisfont les filtres (le set se filtre à part). */
  const filtered = useMemo(() => {
    let list = filterPlaylistPoints(points, {
      team: filters.team,
      action: filters.action,
      evaluation: filters.evaluation,
      method: filters.method,
      playerNumber: filters.playerNumber,
      poste: filters.poste,
    });
    if (filters.setNumber !== 'all') {
      list = list.filter((p) =>
        (p.actions || []).some((a) => Number(a.set_number) === Number(filters.setNumber))
      );
    }
    return list;
  }, [points, filters]);

  const totals = useMemo(() => reviewTotals(points, duration), [points, duration]);

  /** Point lu (ou null : temps mort / lecture arrêtée). */
  const shownIndex = useMemo(() => pointIndexAt(points, currentTime), [points, currentTime]);
  const currentPoint = shownIndex >= 0 ? points[shownIndex] : null;

  const nameOf = useCallback(
    (team, number) =>
      (configs[team === 'away' ? 'away' : 'home']?.roster || []).find(
        (p) => Number(p.number) === Number(number)
      )?.name || '',
    [configs]
  );

  /** Numéros présents dans le codage (sélecteur « Joueur », comme le parcours de match). */
  const playerNumbers = useMemo(() => {
    const numbers = new Set();
    for (const a of actions) {
      if (filters.team !== 'all' && a.team !== filters.team) continue;
      const n = Number(a.player_number) || 0;
      if (n) numbers.add(n);
    }
    return [...numbers].sort((a, b) => a - b);
  }, [actions, filters.team]);

  /** Adresse de lecture : version proxy si disponible (plus fluide). */
  const playbackUrl = useMemo(() => {
    if (!video || !video.filename) return null;
    const proxy = video.filepath_proxy ? String(video.filepath_proxy).split(/[\\/]/).pop() : null;
    return proxy ? videosAPI.getProxyUrl(proxy) : videosAPI.getFileUrl(video.filename);
  }, [video]);

  const onFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // --- Lecture enchaînée -----------------------------------------------------

  /** Lance la lecture (reprend là où la vidéo en est). */
  const play = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPlaying(true);
    el.play().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    const el = videoRef.current;
    if (el) el.pause();
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) stop();
    else play();
  }, [playing, play, stop]);

  /** Lit un point précis (clic dans la liste, ou Précédent / Suivant). */
  const playPoint = useCallback((point) => {
    const el = videoRef.current;
    if (!el || !point) return;
    el.currentTime = point.segmentStart;
    setCurrentTime(point.segmentStart);
    setPlaying(true);
    el.play().catch(() => {});
  }, []);

  const step = useCallback(
    (delta) => {
      const idx = stepPoint(points, shownIndex, delta);
      if (idx >= 0) playPoint(points[idx]);
    },
    [points, shownIndex, playPoint]
  );

  /**
   * En « Points seulement », tout ce qui n'est pas dans un point est sauté :
   * dès que la sortie du point est franchie, on se place au point suivant.
   */
  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (!playing || !skipDeadTime || points.length === 0) return;
    const idx = pointIndexAt(points, el.currentTime);
    if (idx >= 0) return; // encore dans un point
    const next = points.findIndex((p) => p.segmentEnd > el.currentTime);
    if (next >= 0) el.currentTime = points[next].segmentStart;
    else {
      el.pause();
      setPlaying(false);
    }
  };

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (el) setDuration(Number.isFinite(el.duration) ? el.duration : null);
  };

  const handleEnded = () => setPlaying(false);

  // Vitesse de lecture.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed, playbackUrl]);

  // Raccourcis : Espace (lecture/pause), ← → (point), + − (vitesse), Échap.
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
        step(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setSpeed((prev) => {
          const i = SPEED_CHOICES.indexOf(prev);
          return SPEED_CHOICES[Math.min(SPEED_CHOICES.length - 1, i + 1)] || prev;
        });
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        setSpeed((prev) => {
          const i = SPEED_CHOICES.indexOf(prev);
          return SPEED_CHOICES[Math.max(0, i - 1)] || prev;
        });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, step, stop]);

  // --- Ajout à une playlist (boîte « Ajouter à une playlist ») ---------------

  /** Fabrique l'entrée (action seule ou point entier) et ouvre la boîte. */
  const addToPlaylist = useCallback(
    (rally, action, scope) => {
      if (!video || !rally) return;
      const target = action || rally.actions?.[0];
      const team = target?.team || 'home';
      const item = playlistItemFromRally(rally, target, {
        video,
        sync: { ...sync, lead_in: leadIn, lead_out: leadOut },
        scope,
        teamLabel: team === 'away' ? video.team2_name : video.team1_name,
        playerName: nameOf(team, target?.player_number),
      });
      if (!item) {
        notify(false, 'Action sans timecode : synchronisez la vidéo dans le codage.');
        return;
      }
      setAddTarget({ items: normalizePlaylistItems([item]) });
    },
    [video, sync, leadIn, leadOut, nameOf, notify]
  );

  const addPoint = useCallback((rally) => addToPlaylist(rally, null, 'rally'), [addToPlaylist]);
  const addAction = useCallback(
    (rally, action) => addToPlaylist(rally, action, 'action'),
    [addToPlaylist]
  );

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p className="loading-text">Chargement de la relecture…</p>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="app-loading">
        <p>
          <CircleAlert size={14} /> {error || 'Match introuvable'}
        </p>
        <button className="btn btn-primary" onClick={() => navigate(-1)}>
          Retour
        </button>
      </div>
    );
  }

  /** Progression (0-100 %) dans le segment du point en cours. */
  const segmentProgress = currentPoint
    ? Math.min(
        100,
        Math.max(
          0,
          ((currentTime - currentPoint.segmentStart) /
            Math.max(0.1, currentPoint.segmentEnd - currentPoint.segmentStart)) *
            100
        )
      )
    : 0;

  return (
    <div className="video-dashboard dv-page">
      <div className="vd-workspace">
        <nav className="video-tabs dv-nav">
          <button
            type="button"
            className="back-btn"
            onClick={() => navigate(-1)}
            title="Retour"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="plp-title">
            <strong className="mrv-title-name">{video.display_name || video.original_name}</strong>
            <span className="plp-title-meta">
              {points.length} point(s)
              {totals && totals.skipped != null
                ? ` · temps morts évités ${Math.round(totals.skipped)} s`
                : ''}
            </span>
          </div>
          <div className="plp-nav-actions">
            {playing ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={stop}>
                <Square size={13} /> Arrêter
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={play}
                disabled={points.length === 0}
                title="Relire le match : les points s’enchaînent, sans les temps morts"
              >
                <Play size={13} /> Lecture
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(`/datavolley/${id}`)}
              title="Ouvrir ce match dans le codage DataVolley"
            >
              <Keyboard size={13} /> Codage
            </button>
          </div>
        </nav>

        <div className="vd-main">
          {msg && <div className={`dv-flash ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

          <div className="plp-layout mrv-layout">
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
                    onEnded={handleEnded}
                  />
                ) : (
                  <div className="plp-player-empty">
                    <p>Fichier vidéo absent sur ce poste : la relecture est impossible ici.</p>
                  </div>
                )}
              </div>

              <div className="plp-controls">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={togglePlay}
                  disabled={points.length === 0}
                  title={playing ? 'Mettre en pause (Espace)' : 'Lire (Espace)'}
                >
                  {playing ? (
                    <>
                      <Pause size={13} /> Pause
                    </>
                  ) : (
                    <>
                      <Play size={13} /> {shownIndex >= 0 ? 'Reprendre' : 'Lire'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => step(-1)}
                  disabled={points.length === 0}
                  title="Point précédent (←)"
                >
                  <ChevronLeft size={13} /> Précédent
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => step(1)}
                  disabled={points.length === 0}
                  title="Point suivant (→)"
                >
                  Suivant <ChevronRight size={13} />
                </button>
                <span className="plp-keys">
                  Espace : lecture/pause · ← → : point · + − : vitesse · Échap : arrêter
                </span>
              </div>

              <div className="mrv-settings">
                <div className="plp-mode-tabs mrv-skip" title="Les points s’enchaînent-ils sans les temps morts ?">
                  <button
                    type="button"
                    className={skipDeadTime ? 'active' : ''}
                    onClick={() => setSkipDeadTime(true)}
                  >
                    Points seulement
                  </button>
                  <button
                    type="button"
                    className={!skipDeadTime ? 'active' : ''}
                    onClick={() => setSkipDeadTime(false)}
                  >
                    Match complet
                  </button>
                </div>
                <label className="pl-filter mrv-setting" title="Marge lue avant la première action du point">
                  Avance
                  <select value={leadIn} onChange={(e) => setLeadIn(Number(e.target.value))}>
                    {LEAD_CHOICES.map((v) => (
                      <option key={v} value={v}>{v} s</option>
                    ))}
                  </select>
                </label>
                <label className="pl-filter mrv-setting" title="Marge lue après la dernière action du point">
                  Sortie
                  <select value={leadOut} onChange={(e) => setLeadOut(Number(e.target.value))}>
                    {LEAD_CHOICES.map((v) => (
                      <option key={v} value={v}>{v} s</option>
                    ))}
                  </select>
                </label>
                <label className="pl-filter mrv-setting" title="Vitesse de lecture (touches + et −)">
                  Vitesse
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    {SPEED_CHOICES.map((v) => (
                      <option key={v} value={v}>{v}×</option>
                    ))}
                  </select>
                </label>
              </div>

              {currentPoint ? (
                <div className="plp-now mrv-now">
                  <span className="plp-now-head">
                    <strong>Point {currentPoint.pointNumber}</strong>
                    <span>
                      {shownIndex + 1}/{points.length} · {rallyWinMethod(currentPoint).label}
                    </span>
                    <span>
                      {formatTimecode(currentPoint.segmentStart)} → {formatTimecode(currentPoint.segmentEnd)}
                    </span>
                  </span>
                  <div className="mrv-progress" title="Progression dans le point en cours">
                    <div className="mrv-progress-bar" style={{ width: `${segmentProgress}%` }} />
                  </div>
                </div>
              ) : (
                <p className="dv-hint">
                  {points.length === 0
                    ? 'Aucun point lisible : le codage de ce match n’a pas de timecode — synchronisez la vidéo dans le codage.'
                    : skipDeadTime
                      ? 'La lecture saute les temps morts : dès la fin d’un point, on passe directement au suivant.'
                      : 'Lecture du match complet : le point en cours s’affiche à droite et suit la vidéo.'}
                </p>
              )}

            </div>

            <div className="plp-side-col">
              <MatchReviewSidebar
                video={video}
                points={points}
                filtered={filtered}
                filters={filters}
                onFilter={onFilter}
                playerNumbers={playerNumbers}
                nameOf={nameOf}
                currentIndex={shownIndex}
                currentPoint={currentPoint}
                totals={totals}
                onPlayPoint={playPoint}
                onAddPoint={addPoint}
                onAddAction={addAction}
              />
            </div>

          </div>
        </div>
      </div>

      {/* Ajout à une playlist : même boîte que depuis le codage. */}
      <AnimatePresence>
        {addTarget && (
          <AddToPlaylistDialog
            items={addTarget.items}
            onClose={() => setAddTarget(null)}
            onDone={(ok, text) => {
              setAddTarget(null);
              notify(ok, text);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
