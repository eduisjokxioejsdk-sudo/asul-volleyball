// ============================================================================
// CENTRE VIDÉO — CUMUL MULTI-MATCHS PAR JOUEUR
//
// Même principe que le rapport cumulé des trajectoires : on choisit tous les
// matchs ou seulement quelques-uns, puis une équipe et un joueur. Toutes ses
// actions codées sont réunies, match par match :
//   • compteurs cumulés par type d'action et par évaluation ;
//   • détail par match (actions, points) et liste complète des actions ;
//   • lecteur YouTube qui suit l'action choisie et peut enchaîner la sélection.
// Aucune donnée n'est modifiée : la page ne fait que lire les fiches.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import SmartVideoPlayer from '../components/SmartVideoPlayer';
import MultiMatchPlaylistButton from '../components/MultiMatchPlaylistButton';
import useCollectionChanged from '../hooks/useCollectionChanged';
import { videosAPI, datavolleyAPI, teamsAPI } from '../services/api';
import { prepareMatches, buildMultiContext, playerActionsOf } from '../utils/multiMatch';
import { DV_ACTIONS, formatTimecode, getAdaptiveMargins } from '../utils/datavolley';
import {
  ArrowLeft,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pause,
  Play,
  Users,
} from '../components/icons';

const EVAL_ORDER = ['#', '+', '!', '-', '/', '='];

const EVAL_META = {
  '#': { label: 'Point / Parfait', color: '#10b981' },
  '+': { label: 'Positif', color: '#0ea5e9' },
  '!': { label: 'Neutre', color: '#f59e0b' },
  '-': { label: 'Négatif', color: '#f97316' },
  '/': { label: 'Contrée', color: '#a855f7' },
  '=': { label: 'Faute', color: '#e11d48' },
};

const ACTION_LABEL = new Map(DV_ACTIONS.map((a) => [a.code, a.label]));
const norm = (value) => String(value || '').trim().toLowerCase();
const matchLabelOf = (video) =>
  `${video?.team1_name || 'Domicile'} vs ${video?.team2_name || 'Extérieur'}`;
const playerLabelOf = (player) =>
  player ? `N°${String(player.number).padStart(2, '0')}${player.name ? ` ${player.name}` : ''}` : '';

export default function VideoMultiMatchPage({ user, onLogout }) {
  const navigate = useNavigate();

  const [videos, setVideos] = useState([]);
  const [teams, setTeams] = useState([]);
  // null = pas encore chargé ; ensuite la liste des matchs inclus.
  const [selectedIds, setSelectedIds] = useState(null);
  const [actionsMap, setActionsMap] = useState({});
  const [targetTeam, setTargetTeam] = useState('');
  const [playerNumber, setPlayerNumber] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  // Action isolée : le lecteur s'arrête à la fin du clip choisi (pas d'enchaînement).
  const [singleAction, setSingleAction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingActions, setLoadingActions] = useState(false);
  const [error, setError] = useState(null);

  const playerRef = useRef(null);
  const advanceLockRef = useRef(false);

  // --- Chargement de la bibliothèque ---------------------------------------
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [videosRes, teamsRes] = await Promise.all([
        videosAPI.getAll(),
        teamsAPI.getAll().catch(() => ({ data: { teams: [] } })),
      ]);
      const list = videosRes.data?.videos || [];
      setVideos(list);
      setTeams(teamsRes.data?.teams || []);
      setSelectedIds((prev) => {
        if (prev === null) return list.map((v) => v.id);
        // Conserve la sélection d'origine en retirant les matchs disparus.
        return prev.filter((id) => list.some((v) => Number(v.id) === Number(id)));
      });
      setError(null);
    } catch (err) {
      setError('Impossible de charger les matchs du Centre Vidéo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useCollectionChanged('videos', loadData);
  useCollectionChanged('teams', loadData);

  // --- Actions des matchs sélectionnés (chargées une seule fois) ------------
  useEffect(() => {
    const ids = selectedIds || [];
    const missing = ids.filter((id) => !Object.prototype.hasOwnProperty.call(actionsMap, id));
    if (missing.length === 0) return undefined;

    let cancelled = false;
    setLoadingActions(true);
    Promise.all(
      missing.map(async (vid) => {
        try {
          const res = await datavolleyAPI.getActions(vid);
          return [vid, res.data?.actions || []];
        } catch {
          return [vid, []];
        }
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setActionsMap((prev) => {
          const next = { ...prev };
          for (const [vid, list] of entries) next[vid] = list;
          return next;
        });
      })
      .finally(() => { if (!cancelled) setLoadingActions(false); });

    return () => { cancelled = true; };
  }, [selectedIds, actionsMap]);

  // --- Matchs inclus, équipes et joueurs -----------------------------------
  const includedMatches = useMemo(
    () => videos.filter((v) => (selectedIds || []).some((id) => Number(id) === Number(v.id))),
    [videos, selectedIds]
  );

  const availableTeams = useMemo(() => {
    const names = new Set();
    for (const v of includedMatches) {
      if (v.team1_name) names.add(v.team1_name.trim());
      if (v.team2_name) names.add(v.team2_name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [includedMatches]);

  useEffect(() => {
    if (availableTeams.length === 0) {
      if (targetTeam) setTargetTeam('');
      return;
    }
    if (!availableTeams.includes(targetTeam)) setTargetTeam(availableTeams[0]);
  }, [availableTeams, targetTeam]);

  const prepared = useMemo(
    () =>
      prepareMatches(
        includedMatches.map((video) => ({ video, actions: actionsMap[video.id] || [] })),
        targetTeam
      ),
    [includedMatches, actionsMap, targetTeam]
  );

  const teamRoster = useMemo(() => {
    const team = teams.find((t) => norm(t.name) === norm(targetTeam));
    return [...(team?.players || [])].sort((a, b) => Number(a.number) - Number(b.number));
  }, [teams, targetTeam]);

  const playerOptions = useMemo(() => {
    const map = new Map();
    for (const p of teamRoster) {
      map.set(Number(p.number), { number: Number(p.number), name: p.name || '' });
    }
    for (const m of prepared) {
      for (const a of m.actions) {
        if (a.team !== 'home' || a.player_number == null) continue;
        const num = Number(a.player_number);
        if (!map.has(num)) map.set(num, { number: num, name: '' });
      }
    }
    return [...map.values()].sort((a, b) => a.number - b.number);
  }, [teamRoster, prepared]);

  const preferredPlayer = useMemo(() => {
    const withActions = new Set();
    for (const m of prepared) {
      for (const a of m.actions) {
        if (a.team === 'home' && a.player_number != null) withActions.add(Number(a.player_number));
      }
    }
    return playerOptions.find((p) => withActions.has(p.number)) || playerOptions[0] || null;
  }, [prepared, playerOptions]);

  const player = useMemo(
    () => playerOptions.find((p) => String(p.number) === String(playerNumber)) || preferredPlayer,
    [playerOptions, playerNumber, preferredPlayer]
  );

  useEffect(() => {
    setActiveIndex(-1);
    setPlayingAll(false);
    setSingleAction(false);
  }, [player?.number, targetTeam]);

  const playerActions = useMemo(
    () => (player ? playerActionsOf(prepared, player.number) : []),
    [prepared, player]
  );

  const contexts = useMemo(() => buildMultiContext(prepared), [prepared]);

  const actionCounts = useMemo(() => {
    const counts = {};
    for (const a of playerActions) counts[a.action || '?'] = (counts[a.action || '?'] || 0) + 1;
    return counts;
  }, [playerActions]);

  const evaluationCounts = useMemo(() => {
    const counts = {};
    for (const a of playerActions) {
      if (!a.evaluation) continue;
      counts[a.evaluation] = (counts[a.evaluation] || 0) + 1;
    }
    return counts;
  }, [playerActions]);

  const points = useMemo(
    () => playerActions.filter((a) => a.evaluation === '#').length,
    [playerActions]
  );

  const perMatch = useMemo(
    () =>
      prepared
        .map((m) => {
          const rows = playerActions.filter((a) => Number(a.match_video_id) === Number(m.id));
          return {
            id: m.id,
            video: m.video,
            opponent: m.opponent,
            count: rows.length,
            points: rows.filter((a) => a.evaluation === '#').length,
          };
        })
        .filter((m) => m.count > 0),
    [prepared, playerActions]
  );

  const activeAction = activeIndex >= 0 ? playerActions[activeIndex] || null : null;
  const activeVideo = useMemo(() => {
    if (!activeAction) return null;
    return (
      videos.find((v) => Number(v.id) === Number(activeAction.match_video_id)) ||
      activeAction.matchVideo ||
      null
    );
  }, [activeAction, videos]);


  // --- Navigation dans les actions et lecture ------------------------------
  const seekToAction = useCallback((action, autoplay = true) => {
    const el = playerRef.current;
    if (!el || !action || action.timecode == null) return;
    const { leadIn } = getAdaptiveMargins(action);
    const target = Math.max(0, Number(action.timecode) - leadIn);
    try {
      el.currentTime = target;
    } catch {
      // Lecteur pas encore prêt : onLoadedMetadata repositionnera.
    }
    if (autoplay) el.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeAction) return;
    // Même match : le lecteur ne se remonte pas, on cherche tout de suite.
    // Changement de match : le nouveau lecteur applique la position au chargement.
    seekToAction(activeAction, true);
  }, [activeIndex, activeAction?.match_video_id, seekToAction]);

  const goToAction = useCallback(
    (index) => {
      if (!playerActions[index]) return;
      setPlayingAll(false);
      setSingleAction(true);
      setActiveIndex(index);
    },
    [playerActions]
  );

  const startPlayback = useCallback(() => {
    if (playerActions.length === 0) return;
    setSingleAction(false);
    setPlayingAll(true);
    if (activeIndex === 0) seekToAction(playerActions[0], true);
    else setActiveIndex(0);
  }, [activeIndex, playerActions, seekToAction]);

  const pausePlayback = useCallback(() => {
    setPlayingAll(false);
    setSingleAction(false);
    playerRef.current?.pause();
  }, []);

  const stepAction = useCallback(
    (delta) => {
      if (playerActions.length === 0) return;
      const base = activeIndex < 0 ? 0 : activeIndex;
      const next = Math.min(playerActions.length - 1, Math.max(0, base + delta));
      setPlayingAll(false);
      setSingleAction(true);
      if (next === activeIndex) seekToAction(playerActions[next], true);
      else setActiveIndex(next);
    },
    [activeIndex, playerActions, seekToAction]
  );

  const handleTimeUpdate = useCallback(
    (event) => {
      if (!activeAction) return;
      const { leadOut } = getAdaptiveMargins(activeAction);
      const end = Number(activeAction.timecode) + leadOut;
      if (Number(event.currentTarget.currentTime) < end) return;

      if (singleAction && !playingAll) {
        playerRef.current?.pause();
        setSingleAction(false);
        return;
      }
      if (!playingAll) return;

      if (advanceLockRef.current) return;
      advanceLockRef.current = true;
      setTimeout(() => { advanceLockRef.current = false; }, 500);
      if (activeIndex + 1 < playerActions.length) setActiveIndex(activeIndex + 1);
      else setPlayingAll(false);
    },
    [playingAll, singleAction, activeAction, activeIndex, playerActions.length]
  );

  // --- Sélection des matchs (même logique que le rapport de trajectoires) --
  const toggleMatch = (id) => {
    setSelectedIds((prev) => {
      const list = prev || [];
      return list.some((x) => Number(x) === Number(id))
        ? list.filter((x) => Number(x) !== Number(id))
        : [...list, id];
    });
  };

  const selectAllMatches = () => setSelectedIds(videos.map((v) => v.id));
  const selectNoneMatches = () => setSelectedIds([]);
  const allSelected = videos.length > 0 && (selectedIds || []).length === videos.length;


  // --- Rendu ---------------------------------------------------------------
  return (
    <div className="video-center-page app-shell-dark">
      <AppNavigation user={user} onLogout={onLogout} />

      <main className="video-center-content">
        <div className="pk-mode-home">
          <header className="pk-mode-header" style={{ borderLeftColor: '#38bdf8' }}>
            <div className="pk-mode-header-left">
              <PancakeLogo size={60} />
              <div>
                <h1 className="pk-mode-header-title">Centre Vidéo · Cumul multi-matchs</h1>
                <p className="pk-mode-header-sub">
                  Sélectionnez tous les matchs ou seulement quelques-uns, puis une équipe et un joueur :
                  toutes ses actions codées sont réunies, match par match, et prêtes à être revues dans
                  le lecteur YouTube.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="pk-mono" style={{ fontSize: 13, color: '#a1a1aa' }}>
                {includedMatches.length} / {videos.length} match(s)
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/video-center')}
              >
                <ArrowLeft size={13} /> Centre Vidéo
              </button>
            </div>
          </header>

          {/* Sélection des matchs : mêmes pastilles que le rapport de trajectoires. */}
          <div className="pk-filter-bar" style={{ display: 'block' }}>
            <div className="tj-report-matches">
              <span className="tj-report-bar-label">
                <ChartColumn size={14} /> Matchs inclus :
              </span>
              <div className="tj-report-match-tools">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={selectAllMatches}
                  disabled={allSelected}
                  title="Inclure tous les matchs"
                >
                  Tous
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={selectNoneMatches}
                  disabled={includedMatches.length === 0}
                  title="Retirer tous les matchs"
                >
                  Aucun
                </button>
              </div>
              {videos.map((video) => {
                const included = (selectedIds || []).some((id) => Number(id) === Number(video.id));
                return (
                  <span
                    key={video.id}
                    className={`tj-report-match ${included ? 'included' : 'excluded'}`}
                  >
                    <button
                      type="button"
                      className="tj-report-match-toggle"
                      onClick={() => toggleMatch(video.id)}
                      aria-pressed={included}
                      title={
                        included
                          ? `Retirer « ${matchLabelOf(video)} » du cumul`
                          : `Inclure « ${matchLabelOf(video)} » dans le cumul`
                      }
                    >
                      <Check size={12} style={{ opacity: included ? 1 : 0.22 }} />
                      {video.display_name || matchLabelOf(video)}
                      <span className={`live-status ${included ? 'active' : ''}`}>
                        {actionsMap[video.id] ? actionsMap[video.id].length : '…'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tj-report-match-open"
                      onClick={() => navigate(`/video-center?video=${video.id}`)}
                      title={`Ouvrir « ${matchLabelOf(video)} » dans le Centre Vidéo`}
                      aria-label={`Ouvrir ${matchLabelOf(video)}`}
                    >
                      <Eye size={12} />
                    </button>
                  </span>
                );
              })}
            </div>


            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                  Équipe
                </span>
                <select
                  value={targetTeam}
                  onChange={(event) => { setTargetTeam(event.target.value); setPlayerNumber(''); }}
                  style={{ minWidth: 190, fontWeight: 600 }}
                  disabled={availableTeams.length === 0}
                >
                  {availableTeams.length === 0 && <option value="">Aucune équipe</option>}
                  {availableTeams.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                  Joueur
                </span>
                <select
                  value={player ? String(player.number) : ''}
                  onChange={(event) => setPlayerNumber(event.target.value)}
                  style={{ minWidth: 190, fontWeight: 600 }}
                  disabled={playerOptions.length === 0}
                >
                  {playerOptions.length === 0 && <option value="">Aucun joueur</option>}
                  {playerOptions.map((p) => (
                    <option key={p.number} value={p.number}>{playerLabelOf(p)}</option>
                  ))}
                </select>
              </label>

              <span className="pk-mono" style={{ fontSize: 12.5, color: '#a1a1aa' }}>
                {playerActions.length} action(s) · {points} point(s)
              </span>
              {loadingActions && (
                <span style={{ fontSize: 11, color: '#f59e0b' }}>Chargement des actions…</span>
              )}
            </div>
          </div>

          {error && <div className="live-msg err" style={{ marginTop: 12 }}>{error}</div>}

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px solid #27272a' }}>
              Chargement des matchs…
            </div>
          ) : videos.length === 0 ? (
            <div className="tj-empty" style={{ marginTop: 16 }}>
              <p>Aucun match dans le Centre Vidéo.</p>
              <button className="btn btn-primary" onClick={() => navigate('/datavolley')}>
                Créer un match YouTube
              </button>
            </div>
          ) : includedMatches.length === 0 ? (
            <div className="tj-empty" style={{ marginTop: 16 }}>
              <p>Aucun match sélectionné : cochez au moins un match ci-dessus.</p>
              <button className="btn btn-primary" onClick={selectAllMatches}>
                <Check size={14} /> Tout sélectionner
              </button>
            </div>
          ) : playerOptions.length === 0 ? (
            <div className="tj-empty" style={{ marginTop: 16 }}>
              <p>Aucun joueur trouvé pour <strong>{targetTeam}</strong> dans ces matchs.</p>
              <p className="dv-hint">
                Ajoutez les joueurs dans l’onglet Équipes, ou vérifiez que les actions sont bien codées.
              </p>
              <button className="btn btn-secondary" onClick={() => navigate('/teams')}>
                <Users size={14} /> Ouvrir les équipes
              </button>
            </div>
          ) : (
            <>


              <div className="vc-consult-grid" style={{ marginTop: 16 }}>
                <div className="vc-player-column">
                  <div className="vc-video-frame">
                    {activeVideo ? (
                      <SmartVideoPlayer
                        key={`mm-${activeVideo.id}`}
                        ref={playerRef}
                        youtubeUrl={activeVideo.youtube_url}
                        controls
                        onLoadedMetadata={() => {
                          if (activeAction) seekToAction(activeAction, true);
                        }}
                        onTimeUpdate={handleTimeUpdate}
                      />
                    ) : (
                      <div style={{ padding: 28, textAlign: 'center', color: '#a1a1aa' }}>
                        <Play size={26} style={{ color: '#38bdf8', marginBottom: 8 }} />
                        <p style={{ margin: 0 }}>
                          Choisissez une action dans la liste (ou « Lire la sélection ») pour ouvrir
                          la vidéo du bon match au bon moment.
                        </p>
                      </div>
                    )}
                  </div>

                  <div
                    className="vc-player-controls-strip"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => stepAction(-1)}
                        disabled={playerActions.length === 0}
                        title="Action précédente"
                      >
                        <ChevronLeft size={13} /> Précédente
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={playingAll ? pausePlayback : startPlayback}
                        disabled={playerActions.length === 0}
                        title={playingAll ? 'Mettre la sélection en pause' : 'Lire toutes les actions sélectionnées'}
                      >
                        {playingAll ? <Pause size={13} /> : <Play size={13} />}
                        {playingAll ? ' Pause' : ' Lire la sélection'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => stepAction(1)}
                        disabled={playerActions.length === 0}
                        title="Action suivante"
                      >
                        Suivante <ChevronRight size={13} />
                      </button>
                    </div>
                    <span className="pk-mono" style={{ fontSize: 12, color: '#a1a1aa' }}>
                      {activeIndex >= 0 ? `${activeIndex + 1} / ${playerActions.length}` : `0 / ${playerActions.length}`}
                    </span>
                  </div>

                  {activeAction ? (
                    <div className="tj-recap">
                      <span className="tj-recap-label">
                        {matchLabelOf(activeVideo)} · {formatTimecode(activeAction.timecode)}
                      </span>
                      <span className="tj-chip" style={{ borderColor: '#38bdf8', color: '#38bdf8' }}>
                        {activeAction.code || '—'}
                      </span>
                      <span className="tj-chip" style={{ borderColor: '#71717a', color: '#d4d4d8' }}>
                        Set {contexts.get(activeAction.uid)?.setNumber ?? '?'}
                      </span>
                      {activeAction.evaluation && (
                        <span
                          className="tj-chip"
                          style={{
                            borderColor: EVAL_META[activeAction.evaluation]?.color,
                            color: EVAL_META[activeAction.evaluation]?.color,
                          }}
                        >
                          {activeAction.evaluation} {EVAL_META[activeAction.evaluation]?.label || ''}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="dv-hint">
                      Cliquez sur une action pour la revoir, ou lancez la lecture enchaînée de toute
                      la sélection : le lecteur change de match automatiquement.
                    </p>
                  )}
                </div>


                <div className="vc-filter-column">
                  <div className="tj-recap">
                    <span className="tj-recap-label">
                      {playerLabelOf(player)} · {playerActions.length} action(s)
                    </span>
                    {Object.entries(actionCounts).map(([code, count]) => (
                      <span key={code} className="tj-chip" style={{ borderColor: '#3f3f46', color: '#e4e4e7' }}>
                        {ACTION_LABEL.get(code) || code} {count}
                      </span>
                    ))}
                  </div>

                  <div className="tj-recap">
                    {EVAL_ORDER.filter((sym) => evaluationCounts[sym] > 0).map((sym) => (
                      <span
                        key={sym}
                        className="tj-chip"
                        style={{ borderColor: EVAL_META[sym]?.color, color: EVAL_META[sym]?.color }}
                      >
                        {sym} {evaluationCounts[sym]}
                      </span>
                    ))}
                    <span className="tj-chip" style={{ borderColor: '#10b981', color: '#10b981' }}>
                      Points {points}
                    </span>
                  </div>

                  <div className="report-wrap" style={{ marginTop: 10 }}>
                    <table className="report report-compact">
                      <thead>
                        <tr>
                          <th className="name">Match</th>
                          <th>Actions</th>
                          <th>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perMatch.map((m) => (
                          <tr key={m.id}>
                            <td className="name">
                              {m.video?.created_at
                                ? new Date(m.video.created_at).toLocaleDateString('fr-FR')
                                : '—'}
                              <span style={{ display: 'block', fontSize: 10.5, color: '#71717a' }}>
                                vs {m.opponent || '?'}
                              </span>
                            </td>
                            <td>{m.count}</td>
                            <td>{m.points}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="team-row">
                          <td className="name">Cumul</td>
                          <td>{playerActions.length}</td>
                          <td>{points}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <MultiMatchPlaylistButton
                    actions={playerActions}
                    label={`Cumul ${playerLabelOf(player)} — ${targetTeam}`}
                    matchLabelOf={(a) => (a.matchVideo ? matchLabelOf(a.matchVideo) : '')}
                  />
                  <p className="dv-hint">
                    La playlist créée se retrouve dans « Playlists » du Centre Vidéo et peut être lue
                    enchaînée sur plusieurs matchs.
                  </p>
                </div>
              </div>


              <div className="vc-actions-shelf" style={{ marginTop: 16 }}>
                <div className="shelf-header">
                  <strong>
                    Toutes les actions de {playerLabelOf(player)} · {playerActions.length} sur{' '}
                    {perMatch.length} match(s)
                  </strong>
                </div>
                {playerActions.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                    Aucune action codée pour ce joueur dans les matchs sélectionnés.
                  </div>
                ) : (
                  perMatch.map((m) => {
                    const rows = playerActions.filter(
                      (a) => Number(a.match_video_id) === Number(m.id)
                    );
                    return (
                      <div key={m.id} style={{ marginTop: 12 }}>
                        <div className="shelf-header" style={{ paddingBottom: 6 }}>
                          <strong>{matchLabelOf(m.video)}</strong>
                          <span className="dv-hint">
                            {m.video?.created_at
                              ? new Date(m.video.created_at).toLocaleDateString('fr-FR')
                              : '—'}{' '}
                            · {m.count} action(s) · {m.points} point(s)
                          </span>
                        </div>
                        <div className="shelf-clips-list">
                          {rows.map((action) => {
                            const index = playerActions.indexOf(action);
                            const ctx = contexts.get(action.uid);
                            return (
                              <button
                                key={action.uid}
                                type="button"
                                className={`shelf-clip-card ${index === activeIndex ? 'selected' : ''}`}
                                style={{ textAlign: 'left', color: 'inherit', font: 'inherit' }}
                                onClick={() => goToAction(index)}
                                title={`Revoir cette action (${formatTimecode(action.timecode)})`}
                              >
                                <span className="clip-time">
                                  <Play size={10} /> {formatTimecode(action.timecode)}
                                </span>
                                <span className="clip-code">{action.code || '—'}</span>
                                <span
                                  className="clip-eval-badge"
                                  style={{
                                    background: `${EVAL_META[action.evaluation]?.color || '#71717a'}25`,
                                    color: EVAL_META[action.evaluation]?.color || '#a1a1aa',
                                    border: `1px solid ${EVAL_META[action.evaluation]?.color || '#71717a'}55`,
                                  }}
                                >
                                  {action.evaluation || '•'}
                                </span>
                                <span className="clip-desc">
                                  Set {ctx?.setNumber ?? '?'} ·{' '}
                                  {ACTION_LABEL.get(action.action) || action.action || 'Action'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

