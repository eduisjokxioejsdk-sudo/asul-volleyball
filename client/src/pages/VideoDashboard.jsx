import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { videosAPI, cuttingAPI, pointsAPI } from '../services/api';
import { autoFillNextPoint, getRotationOrder } from '../utils/volleyball';

const ROTATION_ORDER = getRotationOrder();

function VideoDashboard({ user, onLogout }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const videoRef = useRef(null);
  const trimmedVideoRef = useRef(null);
  const viewVideoRef = useRef(null);
  const nextPointRef = useRef(null);
  const prevPointRef = useRef(null);
  const viewNextRef = useRef(null);
  const viewPrevRef = useRef(null);
  const viewCurrentIndexRef = useRef(0);
  const viewAutoplayRef = useRef(true);

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cut');
  const [shouldAutoOpenView, setShouldAutoOpenView] = useState(false);

  // Tab A: Cutting
  const [segments, setSegments] = useState([]);
  const [isCutting, setIsCutting] = useState(false);
  const [cutStart, setCutStart] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [cutMessage, setCutMessage] = useState('');

  // Tab B: Annotation
  const [points, setPoints] = useState([]);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hasTrimmedVideo, setHasTrimmedVideo] = useState(false);

  // Tab C: View
  const [filterWinner, setFilterWinner] = useState('all');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterPhase, setFilterPhase] = useState('all');
  const [filterServiceTeam, setFilterServiceTeam] = useState('all');
  const [filterReceptionTeam, setFilterReceptionTeam] = useState('all');
  const [viewCurrentIndex, setViewCurrentIndex] = useState(0);
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);

  const team1 = video?.team1_name || 'Équipe 1';
  const team2 = video?.team2_name || 'Équipe 2';

  useEffect(() => {
    loadVideo();
    loadSegments();
    loadPoints();
  }, [id]);

  // Auto-open view tab if video has points
  useEffect(() => {
    if (points.length > 0 && !loading) {
      setShouldAutoOpenView(true);
    }
  }, [points, loading]);

  useEffect(() => {
    if (shouldAutoOpenView && points.length > 0) {
      setActiveTab('view');
      setShouldAutoOpenView(false);
    }
  }, [shouldAutoOpenView, points.length]);

  const loadVideo = async () => {
    try {
      const response = await videosAPI.getOne(id);
      setVideo(response.data.video);
      setHasTrimmedVideo(!!response.data.video.filepath_trimmed);
    } catch (err) {
      console.error('Failed to load video:', err);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadSegments = async () => {
    try {
      const response = await cuttingAPI.getSegments(id);
      setSegments(response.data.segments || []);
    } catch (err) {
      console.error('Failed to load segments:', err);
    }
  };

  const loadPoints = async () => {
    try {
      const response = await pointsAPI.getPoints(id);
      const loadedPoints = response.data.points || [];
      setPoints(loadedPoints);
    } catch (err) {
      console.error('Failed to load points:', err);
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed);
    document.querySelectorAll('video').forEach(v => { v.playbackRate = speed; });
  };

  const handleRemoveSegment = async (index) => {
    const newSegments = segments.filter((_, i) => i !== index);
    setSegments(newSegments);
    
    // Auto-save after removal
    if (newSegments.length > 0) {
      try {
        await cuttingAPI.saveSegments(id, newSegments);
      } catch (err) {
        console.error('Failed to auto-save:', err);
      }
    }
  };

  // Auto-save segments whenever they change
  useEffect(() => {
    if (segments.length > 0) {
      const timeoutId = setTimeout(async () => {
        try {
          await cuttingAPI.saveSegments(id, segments);
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1000); // Save 1 second after last change
      
      return () => clearTimeout(timeoutId);
    }
  }, [segments, id]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const jumpToPointInVideo = (index) => {
    const point = points[index];
    if (!point) return;
    if (hasTrimmedVideo) {
      let offset = 0;
      for (let i = 0; i < index; i++) {
        if (points[i]) {
          offset += (points[i].end_time - points[i].start_time);
        }
      }
      const player = document.querySelector('.video-left video');
      if (player) {
        player.currentTime = offset;
      }
    } else if (videoRef.current) {
      videoRef.current.currentTime = point.start_time;
    }
  };

  const handleWinnerChange = (pointIndex, winner) => {
    setPoints(prev => {
      const updated = [...prev];
      const currentPoint = { ...updated[pointIndex] };
      currentPoint.winner = winner;
      if (pointIndex + 1 < updated.length) {
        const nextPoint = { ...updated[pointIndex + 1] };
        const autoFill = autoFillNextPoint(currentPoint, winner);
        if (autoFill) {
          nextPoint.serving_team = autoFill.serving_team;
          nextPoint.receiving_team = autoFill.receiving_team;
          nextPoint.team1_position = autoFill.team1_position;
          nextPoint.team2_position = autoFill.team2_position;
        }
        updated[pointIndex + 1] = nextPoint;
      }
      updated[pointIndex] = currentPoint;
      return updated;
    });
  };

  const handleServingTeamChange = (pointIndex, team) => {
    setPoints(prev => {
      const updated = [...prev];
      const point = { ...updated[pointIndex] };
      point.serving_team = team;
      point.receiving_team = team === 'team1' ? 'team2' : 'team1';
      updated[pointIndex] = point;
      return updated;
    });
  };

  const handlePositionChange = (pointIndex, team, position) => {
    setPoints(prev => {
      const updated = [...prev];
      const point = { ...updated[pointIndex] };
      if (team === 'team1') point.team1_position = position;
      else point.team2_position = position;
      updated[pointIndex] = point;
      return updated;
    });
  };

  const handleSavePoints = async () => {
    setSaving(true);
    try {
      await pointsAPI.savePoints(id, points);
      alert('✅ Annotations sauvegardées !');
    } catch (err) {
      alert('Erreur : ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const initializePointsFromSegments = () => {
    if (segments.length === 0) return;
    const newPoints = segments.map((seg, index) => ({
      point_number: index + 1,
      start_time: seg.start_time,
      end_time: seg.end_time,
      winner: '',
      serving_team: index === 0 ? 'team1' : '',
      receiving_team: index === 0 ? 'team2' : '',
      team1_position: index === 0 ? 'P1' : '',
      team2_position: index === 0 ? 'P4' : '',
    }));
    setPoints(newPoints);
    setCurrentPointIndex(0);
  };

  const goToNextPoint = useCallback(() => {
    if (currentPointIndex < points.length - 1) {
      const nextIndex = currentPointIndex + 1;
      setCurrentPointIndex(nextIndex);
      setTimeout(() => jumpToPointInVideo(nextIndex), 100);
    }
  }, [currentPointIndex, points.length]);

  const goToPrevPoint = useCallback(() => {
    if (currentPointIndex > 0) {
      const prevIndex = currentPointIndex - 1;
      setCurrentPointIndex(prevIndex);
      setTimeout(() => jumpToPointInVideo(prevIndex), 100);
    }
  }, [currentPointIndex]);

  nextPointRef.current = goToNextPoint;
  prevPointRef.current = goToPrevPoint;

  useEffect(() => {
    if (activeTab === 'annotate' && points.length > 0) {
      jumpToPointInVideo(currentPointIndex);
    }
  }, [currentPointIndex, activeTab]);

  const getFilteredPoints = () => {
    return points.filter(point => {
      if (filterWinner !== 'all' && point.winner !== filterWinner) return false;
      if (filterPosition !== 'all') {
        if (point.team1_position !== filterPosition && point.team2_position !== filterPosition) return false;
      }
      if (filterServiceTeam !== 'all' && point.serving_team !== filterServiceTeam) return false;
      if (filterReceptionTeam !== 'all' && point.receiving_team !== filterReceptionTeam) return false;
      return true;
    });
  };

  const filteredPoints = getFilteredPoints();
  const filteredPointsRef = useRef(filteredPoints);
  filteredPointsRef.current = filteredPoints;

  // View tab: continuous autoplay ("skip the middle") state
  const [viewAutoplay, setViewAutoplay] = useState(true);
  const [viewIsPlaying, setViewIsPlaying] = useState(false);
  viewCurrentIndexRef.current = viewCurrentIndex;
  viewAutoplayRef.current = viewAutoplay;

  // Play a filtered point directly on the ORIGINAL video using its saved timecodes.
  // The gaps between points ("the middle") are automatically skipped.
  const goToViewPoint = useCallback((index, autoPlay = true) => {
    const fp = filteredPointsRef.current;
    if (!fp[index]) return;
    setViewCurrentIndex(index);
    viewCurrentIndexRef.current = index;
    const player = viewVideoRef.current;
    if (player) {
      player.currentTime = fp[index].start_time;
      player.playbackRate = playbackRate;
      if (autoPlay) {
        const p = player.play();
        if (p && p.catch) p.catch(() => {});
        setViewIsPlaying(true);
      }
    }
  }, [playbackRate]);

  // On each frame, stop at the point's end_time. If autoplay is on, jump straight
  // to the next filtered point (skipping everything in between).
  const handleViewTimeUpdate = useCallback(() => {
    const player = viewVideoRef.current;
    const fp = filteredPointsRef.current;
    const idx = viewCurrentIndexRef.current;
    if (!player || !fp[idx]) return;
    if (player.currentTime >= fp[idx].end_time - 0.1) {
      if (viewAutoplayRef.current && idx < fp.length - 1) {
        goToViewPoint(idx + 1, true);
      } else {
        player.pause();
        setViewIsPlaying(false);
      }
    }
  }, [goToViewPoint]);

  const handleViewPlayPause = useCallback(() => {
    const player = viewVideoRef.current;
    const fp = filteredPointsRef.current;
    if (!player || fp.length === 0) return;
    if (player.paused) {
      // Resume from the current point if we are outside its bounds
      const idx = viewCurrentIndexRef.current;
      const pt = fp[idx];
      if (pt && (player.currentTime < pt.start_time || player.currentTime >= pt.end_time - 0.1)) {
        player.currentTime = pt.start_time;
      }
      const p = player.play();
      if (p && p.catch) p.catch(() => {});
      setViewIsPlaying(true);
    } else {
      player.pause();
      setViewIsPlaying(false);
    }
  }, []);

  viewNextRef.current = useCallback(() => {
    const fp = filteredPointsRef.current;
    const idx = viewCurrentIndexRef.current;
    if (idx < fp.length - 1) goToViewPoint(idx + 1, true);
  }, [goToViewPoint]);

  viewPrevRef.current = useCallback(() => {
    const idx = viewCurrentIndexRef.current;
    if (idx > 0) goToViewPoint(idx - 1, true);
  }, [goToViewPoint]);

  // Reset to first point whenever filters change while viewing
  useEffect(() => {
    if (activeTab === 'view') {
      setViewCurrentIndex(0);
      viewCurrentIndexRef.current = 0;
    }
  }, [filterWinner, filterPosition, filterPhase, activeTab]);


  const getTeamLabel = (team) => {
    if (team === 'team1') return team1;
    if (team === 'team2') return team2;
    return team;
  };

  const SpeedControls = () => (
    <div className="video-controls" style={{ marginTop: -8, marginBottom: 12 }}>
      <div className="speed-controls">
        <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>Vitesse :</span>
        {[1, 2, 3, 4, 6].map(speed => (
          <button key={speed} className={`speed-btn ${playbackRate === speed ? 'active' : ''}`} onClick={() => handleSpeedChange(speed)}>x{speed}</button>
        ))}
      </div>
      {activeTab === 'view' && (
        <button 
          className="btn btn-secondary btn-sm" 
          onClick={() => setIsVideoExpanded(!isVideoExpanded)}
          style={{ marginLeft: 'auto' }}
        >
          {isVideoExpanded ? '◀ Réduire' : 'Agrandir ▶'}
        </button>
      )}
    </div>
  );

  const handleKeyPress = useCallback((e) => {
    if (activeTab === 'cut' && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      if (!isCutting) {
        if (videoRef.current) {
          setCutStart(videoRef.current.currentTime);
          setIsCutting(true);
          setCutMessage('🔴 Début du point marqué ! Appuyez sur M pour marquer la fin.');
        }
      } else {
        const endTime = videoRef.current ? videoRef.current.currentTime : 0;
        if (cutStart !== null && endTime > cutStart) {
          setSegments(prev => [...prev, { start_time: cutStart, end_time: endTime, point_index: prev.length }]);
          setCutMessage(`✅ Point ${segments.length + 1} enregistré (${formatTime(cutStart)} - ${formatTime(endTime)})`);
        }
        setIsCutting(false);
        setCutStart(null);
      }
      return;
    }
    if (activeTab === 'annotate') {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (nextPointRef.current) nextPointRef.current(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (prevPointRef.current) prevPointRef.current(); return; }
    }
    if (activeTab === 'view') {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (viewNextRef.current) viewNextRef.current(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (viewPrevRef.current) viewPrevRef.current(); return; }
    }
  }, [activeTab, isCutting, cutStart, segments.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Chargement de la vidéo...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="app-loading">
        <p>Vidéo introuvable</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Retour</button>
      </div>
    );
  }

  const videoUrl = videosAPI.getFileUrl(video.filename);
  const trimmedVideoUrl = hasTrimmedVideo
    ? videosAPI.getTrimmedUrl(video.filename.replace(/\.\w+$/, '') + '.mp4')
    : null;

  const currentPoint = points[currentPointIndex] || null;

  return (
    <div className="video-dashboard">
      <nav className="navbar">
        <div className="navbar-brand">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>← Retour</button>
          ASUL <span>• {video.original_name}</span>
        </div>
        <div className="navbar-user">
          <span className="user-info"><span className="user-name">{user.name}</span></span>
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            title={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>Déconnexion</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="video-tabs">
          <button className={`video-tab ${activeTab === 'cut' ? 'active' : ''}`} onClick={() => setActiveTab('cut')}>✂️ Découper</button>
          <button className={`video-tab ${activeTab === 'annotate' ? 'active' : ''}`} onClick={() => { if (points.length === 0) initializePointsFromSegments(); setCurrentPointIndex(0); setActiveTab('annotate'); }} disabled={segments.length === 0 && points.length === 0}>🏷️ Annoter <span className="tab-badge">← →</span></button>
          <button className={`video-tab ${activeTab === 'view' ? 'active' : ''}`} onClick={() => { setViewCurrentIndex(0); setActiveTab('view'); }} disabled={points.length === 0}>👁️ Consulter <span className="tab-badge">← →</span></button>
          <button className="video-tab" disabled title="Fonctionnalité à venir">📊 Stats</button>
        </div>

        {/* TAB A: CUTTING */}
        {activeTab === 'cut' && (
          <div className="tab-layout">
            <div className="video-left">
              <div className="video-player-wrapper">
                <video ref={videoRef} src={videoUrl} controls playbackRate={playbackRate} />
              </div>
              <SpeedControls />
              <div className="cut-instructions">
                {isCutting ? '🔴 Appuyez sur M pour marquer la FIN du point' : '▶️ Appuyez sur M pour marquer le DÉBUT d\'un point'}
              </div>
            </div>
            <div className="info-right">
              {cutMessage && <div className="success-message">{cutMessage}</div>}
              {segments.length > 0 && (
                <div className="right-card">
                  <h4>Points ({segments.length})</h4>
                  <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
                    {segments.map((seg, index) => (
                      <div key={index} className="segment-item" style={{ marginBottom: 4 }}>
                        <span className="segment-number">Point {index + 1}</span>
                        <span style={{ fontSize: 12 }}>{formatTime(seg.start_time)} → {formatTime(seg.end_time)}</span>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemoveSegment(index)} style={{ padding: '2px 6px', fontSize: 11 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB B: ANNOTATION */}
        {activeTab === 'annotate' && (
          <div className="tab-layout">
            <div className="video-left">
              <div className="annotation-progress">
                <span className="annotation-progress-text">Point {currentPointIndex + 1}/{points.length}</span>
                <div className="annotation-progress-bar">
                  <div className="annotation-progress-fill" style={{ width: `${((currentPointIndex + 1) / points.length) * 100}%` }} />
                </div>
              </div>
              <div className="video-player-wrapper">
                <video ref={videoRef} key={`annotate-${currentPointIndex}`} src={hasTrimmedVideo && trimmedVideoUrl ? trimmedVideoUrl : videoUrl} controls className="trimmed-player" playbackRate={playbackRate} />
              </div>
              <SpeedControls />
              <div className="point-navigation">
                <button className="btn btn-secondary btn-sm" onClick={goToPrevPoint} disabled={currentPointIndex === 0}>⬅️ Précédent</button>
                <span className="point-nav-time">
                  {currentPoint ? `${formatTime(currentPoint.start_time)} - ${formatTime(currentPoint.end_time)}` : ''}
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)' }}>flèches ← →</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={goToNextPoint} disabled={currentPointIndex >= points.length - 1}>Suivant ➡️</button>
              </div>
            </div>
            <div className="info-right">
              {currentPoint && (
                <div className="right-card">
                  <h4>🏆 Vainqueur</h4>
                  <div className="btn-group-horizontal" style={{ marginTop: 8 }}>
                    <button className={`btn-choice ${currentPoint.winner === 'team1' ? 'active team1' : ''}`} onClick={() => handleWinnerChange(currentPointIndex, 'team1')}>{team1}</button>
                    <button className={`btn-choice ${currentPoint.winner === 'team2' ? 'active team2' : ''}`} onClick={() => handleWinnerChange(currentPointIndex, 'team2')}>{team2}</button>
                  </div>
                </div>
              )}
              {currentPoint && (
                <div className="right-card">
                  <h4>🏐 Au service</h4>
                  <div className="btn-group-horizontal" style={{ marginTop: 8 }}>
                    <button className={`btn-choice ${currentPoint.serving_team === 'team1' ? 'active team1' : ''}`} onClick={() => handleServingTeamChange(currentPointIndex, 'team1')}>{team1}</button>
                    <button className={`btn-choice ${currentPoint.serving_team === 'team2' ? 'active team2' : ''}`} onClick={() => handleServingTeamChange(currentPointIndex, 'team2')}>{team2}</button>
                  </div>
                </div>
              )}
              {currentPoint && (
                <div className="right-card">
                  <h4>🙌 En réception</h4>
                  <div className="btn-group-horizontal" style={{ marginTop: 8 }}>
                    <button className={`btn-choice ${currentPoint.receiving_team === 'team1' ? 'active team1' : ''}`} disabled style={{ opacity: currentPoint.receiving_team === 'team1' ? 1 : 0.4, cursor: 'default' }}>{team1}</button>
                    <button className={`btn-choice ${currentPoint.receiving_team === 'team2' ? 'active team2' : ''}`} disabled style={{ opacity: currentPoint.receiving_team === 'team2' ? 1 : 0.4, cursor: 'default' }}>{team2}</button>
                  </div>
                </div>
              )}
              {currentPoint && (
                <div className="right-card">
                  <h4>📍 Positions</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{team1}</strong>
                      <div className="position-btn-group" style={{ marginTop: 6 }}>
                        {ROTATION_ORDER.map(pos => (
                          <button key={`t1-${pos}`} className={`btn-pos ${currentPoint.team1_position === pos ? 'active' : ''}`} onClick={() => handlePositionChange(currentPointIndex, 'team1', pos)}>{pos}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <strong style={{ fontSize: 13 }}>{team2}</strong>
                      <div className="position-btn-group" style={{ marginTop: 6 }}>
                        {ROTATION_ORDER.map(pos => (
                          <button key={`t2-${pos}`} className={`btn-pos ${currentPoint.team2_position === pos ? 'active' : ''}`} onClick={() => handlePositionChange(currentPointIndex, 'team2', pos)}>{pos}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="save-points-bar" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary btn-block" onClick={handleSavePoints} disabled={saving}>
                  {saving ? 'Sauvegarde...' : '💾 Sauvegarder toutes les annotations'}
                </button>
                <button className="btn btn-secondary btn-block" onClick={() => { if (window.confirm('Réinitialiser ?')) initializePointsFromSegments(); }}>Réinitialiser</button>
              </div>
            </div>
          </div>
        )}

        {/* TAB C: VIEW - Vidéo à gauche (grande) + filtres & menu déroulant à droite */}
        {activeTab === 'view' && (
          <div className="tab-layout">
            {/* ==== VIDÉO (grande, à gauche) ==== */}
            <div className={`video-left ${isVideoExpanded ? 'expanded' : ''}`}>
              <div className="video-player-wrapper">
                <video
                  ref={viewVideoRef}
                  src={videoUrl}
                  controls
                  playbackRate={playbackRate}
                  onTimeUpdate={handleViewTimeUpdate}
                  onPlay={() => setViewIsPlaying(true)}
                  onPause={() => setViewIsPlaying(false)}
                />
              </div>

              <SpeedControls />

              {/* Barre de lecture point par point */}
              <div className="point-navigation">
                <button className="btn btn-secondary btn-sm" onClick={() => viewPrevRef.current && viewPrevRef.current()} disabled={filteredPoints.length === 0 || viewCurrentIndex === 0}>⬅️ Point précédent</button>
                <button className="btn btn-primary btn-sm" onClick={handleViewPlayPause} disabled={filteredPoints.length === 0}>
                  {viewIsPlaying ? '⏸️ Pause' : '▶️ Lecture'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => viewNextRef.current && viewNextRef.current()} disabled={filteredPoints.length === 0 || viewCurrentIndex >= filteredPoints.length - 1}>Point suivant ➡️</button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 6, fontSize: 13, color: 'var(--gray-600)' }}>
                {filteredPoints.length > 0 && filteredPoints[viewCurrentIndex] ? (
                  <>
                    Point {viewCurrentIndex + 1}/{filteredPoints.length}
                    {' • '}P{filteredPoints[viewCurrentIndex].point_number}
                    {' • '}{formatTime(filteredPoints[viewCurrentIndex].start_time)} → {formatTime(filteredPoints[viewCurrentIndex].end_time)}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)' }}>flèches ← →</span>
                  </>
                ) : 'Aucun point à lire'}
              </div>
            </div>

            {/* ==== FILTRES + MENU DÉROULANT (petit, à droite) ==== */}
            <div className={`info-right ${isVideoExpanded ? 'hidden' : ''}`}>
              {/* FILTRES */}
              <div className="right-card">
                <h4>Filtres</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>🏐 Au service</label>
                    <div className="btn-group-horizontal">
                      <button className={`btn-choice ${filterServiceTeam === 'all' ? 'active' : ''}`} onClick={() => { setFilterServiceTeam('all'); setFilterReceptionTeam('all'); }} style={{ fontSize: 12, padding: '6px 10px' }}>Tous</button>
                      <button className={`btn-choice ${filterServiceTeam === 'team1' ? 'active team1' : ''}`} onClick={() => { setFilterServiceTeam('team1'); setFilterReceptionTeam('team2'); }} style={{ fontSize: 12, padding: '6px 10px' }}>{team1}</button>
                      <button className={`btn-choice ${filterServiceTeam === 'team2' ? 'active team2' : ''}`} onClick={() => { setFilterServiceTeam('team2'); setFilterReceptionTeam('team1'); }} style={{ fontSize: 12, padding: '6px 10px' }}>{team2}</button>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>🙌 En réception</label>
                    <div className="btn-group-horizontal">
                      <button className={`btn-choice ${filterReceptionTeam === 'all' ? 'active' : ''}`} onClick={() => { setFilterReceptionTeam('all'); setFilterServiceTeam('all'); }} style={{ fontSize: 12, padding: '6px 10px' }}>Tous</button>
                      <button className={`btn-choice ${filterReceptionTeam === 'team1' ? 'active team1' : ''}`} onClick={() => { setFilterReceptionTeam('team1'); setFilterServiceTeam('team2'); }} style={{ fontSize: 12, padding: '6px 10px' }}>{team1}</button>
                      <button className={`btn-choice ${filterReceptionTeam === 'team2' ? 'active team2' : ''}`} onClick={() => { setFilterReceptionTeam('team2'); setFilterServiceTeam('team1'); }} style={{ fontSize: 12, padding: '6px 10px' }}>{team2}</button>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>🏆 Vainqueur</label>
                    <div className="btn-group-horizontal">
                      <button className={`btn-choice ${filterWinner === 'all' ? 'active' : ''}`} onClick={() => setFilterWinner('all')} style={{ fontSize: 12, padding: '6px 10px' }}>Tous</button>
                      <button className={`btn-choice ${filterWinner === 'team1' ? 'active team1' : ''}`} onClick={() => setFilterWinner('team1')} style={{ fontSize: 12, padding: '6px 10px' }}>{team1}</button>
                      <button className={`btn-choice ${filterWinner === 'team2' ? 'active team2' : ''}`} onClick={() => setFilterWinner('team2')} style={{ fontSize: 12, padding: '6px 10px' }}>{team2}</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>📍 {team1}</label>
                      <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--gray-300)', fontSize: 12 }}>
                        <option value="all">Toutes</option>
                        {ROTATION_ORDER.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>📍 {team2}</label>
                      <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--gray-300)', fontSize: 12 }}>
                        <option value="all">Toutes</option>
                        {ROTATION_ORDER.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setFilterWinner('all'); setFilterPosition('all'); setFilterServiceTeam('all'); setFilterReceptionTeam('all'); }}>♻️ Réinitialiser les filtres</button>
                </div>
              </div>

              {/* MENU DÉROULANT DES POINTS + LECTURE AUTO */}
              <div className="right-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h4 style={{ marginBottom: 8 }}>Points ({filteredPoints.length})</h4>

                {/* Menu déroulant listant tous les points filtrés */}
                <select
                  value={filteredPoints.length > 0 ? viewCurrentIndex : ''}
                  onChange={(e) => goToViewPoint(Number(e.target.value))}
                  disabled={filteredPoints.length === 0}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--gray-300)', fontSize: 13, marginBottom: 10 }}
                >
                  {filteredPoints.length === 0 ? (
                    <option value="">Aucun point</option>
                  ) : (
                    filteredPoints.map((pt, idx) => (
                      <option key={pt.point_number} value={idx}>
                        Point {pt.point_number} — Gagnant: {getTeamLabel(pt.winner) || '?'} — Service: {getTeamLabel(pt.serving_team) || '?'} ({formatTime(pt.start_time)} → {formatTime(pt.end_time)})
                      </option>
                    ))
                  )}
                </select>

                {/* Option lecture automatique enchaînée */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-700)', marginBottom: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={viewAutoplay} onChange={(e) => setViewAutoplay(e.target.checked)} />
                  Lecture automatique (enchaîner les points en sautant le milieu)
                </label>

                {/* Liste cliquable des points */}
                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 460px)', minHeight: 160 }}>
                  {filteredPoints.length === 0 ? (
                    <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: 20 }}>Aucun point ne correspond aux filtres.</p>
                  ) : (
                    filteredPoints.map((pt, idx) => (
                      <div key={pt.point_number} className={`point-queue-item ${viewCurrentIndex === idx ? 'active' : ''}`} onClick={() => goToViewPoint(idx)}>
                        <div className="point-queue-header">
                          <span className="point-queue-number">P{pt.point_number}</span>
                          <span className={`point-queue-badge ${pt.winner === 'team1' ? 'team1' : 'team2'}`}>{getTeamLabel(pt.winner)}</span>
                          <span className="point-queue-service">Service: {getTeamLabel(pt.serving_team)}</span>
                        </div>
                        <div className="point-queue-positions">
                          <span>{team1}: {pt.team1_position || '?'}</span>
                          <span>{team2}: {pt.team2_position || '?'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default VideoDashboard;