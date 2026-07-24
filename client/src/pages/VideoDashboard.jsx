import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { videosAPI, cuttingAPI, pointsAPI } from '../services/api';
import { autoFillNextPoint, getRotationOrder, computeMatchTimeline } from '../utils/volleyball';
import ScoreDisplay from '../components/ScoreDisplay';
import PointTimeline from '../components/PointTimeline';

const ROTATION_ORDER = getRotationOrder();

const tabContentVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }
};

function VideoDashboard({ user, onLogout }) {
  const { id } = useParams();
  const navigate = useNavigate();
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

  // Tab D: Points (timeline)
  const [initialScore, setInitialScore] = useState({ team1: 0, team2: 0 });
  const [activePointsTab, setActivePointsTab] = useState('view');

  const team1 = video?.team1_name || 'Équipe 1';
  const team2 = video?.team2_name || 'Équipe 2';

  useEffect(() => {
    loadVideo();
    loadSegments();
    loadPoints();
  }, [id]);

  // No auto-switching between tabs — user controls navigation manually

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
    if (newSegments.length > 0) {
      try {
        await cuttingAPI.saveSegments(id, newSegments);
      } catch (err) {
        console.error('Failed to auto-save:', err);
      }
    }
  };

  useEffect(() => {
    if (segments.length > 0) {
      const timeoutId = setTimeout(async () => {
        try {
          await cuttingAPI.saveSegments(id, segments);
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1000);
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

  const [viewAutoplay, setViewAutoplay] = useState(true);
  const [viewIsPlaying, setViewIsPlaying] = useState(false);
  viewCurrentIndexRef.current = viewCurrentIndex;
  viewAutoplayRef.current = viewAutoplay;

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
        <span>Vitesse :</span>
        {[1, 2, 3, 4, 6].map(speed => (
          <motion.button
            key={speed}
            className={`speed-btn ${playbackRate === speed ? 'active' : ''}`}
            onClick={() => handleSpeedChange(speed)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            x{speed}
          </motion.button>
        ))}
      </div>
      {activeTab === 'view' && (
        <motion.button
          className="btn btn-secondary btn-sm"
          onClick={() => setIsVideoExpanded(!isVideoExpanded)}
          style={{ marginLeft: 'auto' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isVideoExpanded ? '◀ Réduire' : 'Agrandir ▶'}
        </motion.button>
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
        <p className="loading-text">Chargement de la vidéo</p>
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
    <motion.div
      className="video-dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <nav className="navbar">
        <div className="navbar-brand">
          <motion.button
            className="back-btn"
            onClick={() => navigate('/dashboard')}
            whileHover={{ x: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            ← Retour
          </motion.button>
          <img src="/logo.png" alt="ASUL" style={{ height: 28, marginRight: 4 }} />
          ASUL <span>• {video.original_name}</span>
        </div>
        <div className="navbar-user">
          <span className="user-info"><span className="user-name">{user.name}</span></span>
          <motion.button
            className="btn btn-secondary btn-sm"
            onClick={onLogout}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Déconnexion
          </motion.button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="video-tabs">
          {[
            { key: 'cut', icon: '✂️', label: 'Découper' },
            { key: 'annotate', icon: '🏷️', label: 'Annoter', badge: '← →' },
            { key: 'view', icon: '👁️', label: 'Consulter', badge: '← →' },
            { key: 'points', icon: '📊', label: 'Points' },
          ].map(tab => (
            <motion.button
              key={tab.key}
              className={`video-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => {
                if (tab.key === 'annotate') {
                  if (points.length === 0) initializePointsFromSegments();
                  setCurrentPointIndex(0);
                }
                if (tab.key === 'view') {
                  setViewCurrentIndex(0);
                }
                setActiveTab(tab.key);
              }}
              disabled={
                (tab.key === 'annotate' && segments.length === 0 && points.length === 0) ||
                (tab.key === 'view' && points.length === 0)
              }
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              layout
            >
              {tab.icon} {tab.label}
              {tab.badge && <span className="tab-badge">{tab.badge}</span>}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* TAB A: CUTTING */}
          {activeTab === 'cut' && (
            <motion.div
              key="cut"
              className="tab-layout"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="video-left">
                <div className="video-player-wrapper">
                  <video ref={videoRef} src={videoUrl} controls playbackRate={playbackRate} />
                </div>
                <SpeedControls />
                <motion.div
                  className="cut-instructions"
                  animate={{ borderColor: isCutting ? 'rgba(255,26,94,0.4)' : 'rgba(14,165,233,0.1)' }}
                >
                  {isCutting ? '🔴 Appuyez sur M pour marquer la FIN du point' : '▶️ Appuyez sur M pour marquer le DÉBUT d\'un point'}
                </motion.div>
              </div>
              <div className="info-right">
                <AnimatePresence>
                  {cutMessage && (
                    <motion.div
                      className="success-message"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {cutMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
                {segments.length > 0 && (
                  <div className="right-card">
                    <h4>Points ({segments.length})</h4>
                    <div className="segments-list">
                      <AnimatePresence>
                        {segments.map((seg, index) => (
                          <motion.div
                            key={index}
                            className="segment-item"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            layout
                          >
                            <span className="segment-number">Point {index + 1}</span>
                            <span className="segment-info">{formatTime(seg.start_time)} → {formatTime(seg.end_time)}</span>
                            <motion.button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRemoveSegment(index)}
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              ✕
                            </motion.button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB B: ANNOTATION */}
          {activeTab === 'annotate' && (
            <motion.div
              key="annotate"
              className="tab-layout"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="video-left">
                <div className="annotation-progress">
                  <span className="annotation-progress-text">Point {currentPointIndex + 1}/{points.length}</span>
                  <div className="annotation-progress-bar">
                    <motion.div
                      className="annotation-progress-fill"
                      initial={false}
                      animate={{ width: `${((currentPointIndex + 1) / points.length) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
                <div className="video-player-wrapper">
                  <video ref={videoRef} key={`annotate-${currentPointIndex}`} src={hasTrimmedVideo && trimmedVideoUrl ? trimmedVideoUrl : videoUrl} controls className="trimmed-player" playbackRate={playbackRate} />
                </div>
                <SpeedControls />
                <div className="point-navigation">
                  <motion.button
                    className="btn btn-secondary btn-sm"
                    onClick={goToPrevPoint}
                    disabled={currentPointIndex === 0}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    ⬅️ Précédent
                  </motion.button>
                  <span className="point-nav-time">
                    {currentPoint ? `${formatTime(currentPoint.start_time)} - ${formatTime(currentPoint.end_time)}` : ''}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>flèches ← →</span>
                  </span>
                  <motion.button
                    className="btn btn-secondary btn-sm"
                    onClick={goToNextPoint}
                    disabled={currentPointIndex >= points.length - 1}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Suivant ➡️
                  </motion.button>
                </div>
              </div>
              <div className="info-right">
                <ScoreDisplay points={points} team1={team1} team2={team2} />
                {currentPoint && (
                  <motion.div
                    className="right-card"
                    key={currentPointIndex}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h4>🏆 Vainqueur</h4>
                    <div className="btn-group-horizontal" style={{ marginTop: 8 }}>
                      <motion.button
                        className={`btn-choice ${currentPoint.winner === 'team1' ? 'active team1' : ''}`}
                        onClick={() => handleWinnerChange(currentPointIndex, 'team1')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {team1}
                      </motion.button>
                      <motion.button
                        className={`btn-choice ${currentPoint.winner === 'team2' ? 'active team2' : ''}`}
                        onClick={() => handleWinnerChange(currentPointIndex, 'team2')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {team2}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
                {currentPoint && (
                  <motion.div
                    className="right-card"
                    key={`service-${currentPointIndex}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.05 }}
                  >
                    <h4>🏐 Au service</h4>
                    <div className="btn-group-horizontal" style={{ marginTop: 8 }}>
                      <motion.button
                        className={`btn-choice ${currentPoint.serving_team === 'team1' ? 'active team1' : ''}`}
                        onClick={() => handleServingTeamChange(currentPointIndex, 'team1')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {team1}
                      </motion.button>
                      <motion.button
                        className={`btn-choice ${currentPoint.serving_team === 'team2' ? 'active team2' : ''}`}
                        onClick={() => handleServingTeamChange(currentPointIndex, 'team2')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {team2}
                      </motion.button>
                    </div>
                  </motion.div>
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
                  <motion.div
                    className="right-card"
                    key={`pos-${currentPointIndex}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                  >
                    <h4>📍 Positions</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{team1}</strong>
                        <div className="position-btn-group" style={{ marginTop: 6 }}>
                          {ROTATION_ORDER.map(pos => (
                            <motion.button
                              key={`t1-${pos}`}
                              className={`btn-pos ${currentPoint.team1_position === pos ? 'active' : ''}`}
                              onClick={() => handlePositionChange(currentPointIndex, 'team1', pos)}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {pos}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <strong style={{ fontSize: 13 }}>{team2}</strong>
                        <div className="position-btn-group" style={{ marginTop: 6 }}>
                          {ROTATION_ORDER.map(pos => (
                            <motion.button
                              key={`t2-${pos}`}
                              className={`btn-pos ${currentPoint.team2_position === pos ? 'active' : ''}`}
                              onClick={() => handlePositionChange(currentPointIndex, 'team2', pos)}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {pos}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div className="save-points-bar" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none', flexDirection: 'column', gap: 8 }}>
                  <motion.button
                    className="btn btn-primary btn-block"
                    onClick={handleSavePoints}
                    disabled={saving}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {saving ? 'Sauvegarde...' : '💾 Sauvegarder toutes les annotations'}
                  </motion.button>
                  <motion.button
                    className="btn btn-secondary btn-block"
                    onClick={() => { if (window.confirm('Réinitialiser ?')) initializePointsFromSegments(); }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Réinitialiser
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB C: VIEW — full width video, compact sidebar */}
          {activeTab === 'view' && (
            <motion.div
              key="view"
              className="tab-layout"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ gap: 0 }}
            >
              <div className={`video-left ${isVideoExpanded ? 'expanded' : ''}`} style={{ maxWidth: isVideoExpanded ? '100%' : 'calc(100% - 260px)', paddingRight: isVideoExpanded ? 0 : 16 }}>
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
                <div className="point-navigation">
                  <motion.button
                    className="btn btn-secondary btn-sm"
                    onClick={() => viewPrevRef.current && viewPrevRef.current()}
                    disabled={filteredPoints.length === 0 || viewCurrentIndex === 0}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    ⬅️ Précédent
                  </motion.button>
                  <motion.button
                    className="btn btn-primary btn-sm"
                    onClick={handleViewPlayPause}
                    disabled={filteredPoints.length === 0}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {viewIsPlaying ? '⏸️' : '▶️'}
                  </motion.button>
                  <motion.button
                    className="btn btn-secondary btn-sm"
                    onClick={() => viewNextRef.current && viewNextRef.current()}
                    disabled={filteredPoints.length === 0 || viewCurrentIndex >= filteredPoints.length - 1}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Suivant ➡️
                  </motion.button>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    {filteredPoints.length > 0 && filteredPoints[viewCurrentIndex] ? (
                      <>P{filteredPoints[viewCurrentIndex].point_number} • {formatTime(filteredPoints[viewCurrentIndex].start_time)} → {formatTime(filteredPoints[viewCurrentIndex].end_time)}</>
                    ) : ''}
                  </span>
                </div>
              </div>

              <div className={`info-right ${isVideoExpanded ? 'hidden' : ''}`} style={{ width: 260, minWidth: 260 }}>
                <ScoreDisplay points={points} team1={team1} team2={team2} />
                
                {/* Filters — nice dropdowns */}
                <div className="right-card" style={{ padding: '12px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 11, letterSpacing: '0.5px' }}>🔍 Filtres</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <select
                      value={filterServiceTeam}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilterServiceTeam(v);
                        setFilterReceptionTeam(v === 'all' ? 'all' : (v === 'team1' ? 'team2' : 'team1'));
                      }}
                      className="filter-select"
                    >
                      <option value="all">🏐 Service : Toutes</option>
                      <option value="team1">🏐 Service : {team1}</option>
                      <option value="team2">🏐 Service : {team2}</option>
                    </select>
                    <select
                      value={filterWinner}
                      onChange={(e) => setFilterWinner(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">🏆 Gagnant : Tous</option>
                      <option value="team1">🏆 Gagnant : {team1}</option>
                      <option value="team2">🏆 Gagnant : {team2}</option>
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <select
                        value={filterPosition}
                        onChange={(e) => setFilterPosition(e.target.value)}
                        className="filter-select"
                        style={{ fontSize: 11 }}
                      >
                        <option value="all">{team1}: Toutes</option>
                        {ROTATION_ORDER.map(pos => (
                          <option key={`t1-${pos}`} value={pos}>{team1}: {pos}</option>
                        ))}
                      </select>
                      <select
                        value={filterPosition}
                        onChange={(e) => setFilterPosition(e.target.value)}
                        className="filter-select"
                        style={{ fontSize: 11 }}
                      >
                        <option value="all">{team2}: Toutes</option>
                        {ROTATION_ORDER.map(pos => (
                          <option key={`t2-${pos}`} value={pos}>{team2}: {pos}</option>
                        ))}
                      </select>
                    </div>
                    <motion.button
                      className="btn btn-secondary"
                      onClick={() => { setFilterWinner('all'); setFilterPosition('all'); setFilterServiceTeam('all'); setFilterReceptionTeam('all'); }}
                      style={{ fontSize: 11, padding: '4px 10px', width: '100%' }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      ♻️ Réinitialiser
                    </motion.button>
                  </div>
                </div>

                {/* Points list — big score + colored positions */}
                <div className="right-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 11, letterSpacing: '0.5px' }}>📋 Points ({filteredPoints.length})</h4>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={viewAutoplay} onChange={(e) => setViewAutoplay(e.target.checked)} style={{ margin: 0 }} />
                      Auto
                    </label>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 100 }}>
                    <AnimatePresence>
                      {filteredPoints.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16, fontSize: 11 }}>Aucun point</p>
                      ) : (
                        filteredPoints.map((pt, idx) => {
                          const timeline = computeMatchTimeline(points, initialScore);
                          const tlPt = timeline.find(t => t.point_number === pt.point_number);
                          const scoreStr = tlPt ? `${tlPt.scoreBefore.team1} - ${tlPt.scoreBefore.team2}` : '';
                          const isActive = viewCurrentIndex === idx;
                          return (
                            <motion.div
                              key={pt.point_number}
                              onClick={() => goToViewPoint(idx)}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.12, delay: idx * 0.008 }}
                              whileHover={{ x: 3 }}
                              style={{
                                padding: '8px 10px',
                                marginBottom: 4,
                                borderRadius: 8,
                                cursor: 'pointer',
                                background: isActive ? 'rgba(255,26,94,0.08)' : 'rgba(255,255,255,0.02)',
                                border: isActive ? '1px solid rgba(255,26,94,0.2)' : '1px solid rgba(255,255,255,0.04)',
                                transition: 'all 0.2s'
                              }}
                            >
                              {/* Big score */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--neon-blue)', textShadow: '0 0 8px rgba(14,165,233,0.3)' }}>
                                  {tlPt ? tlPt.scoreBefore.team1 : '?'}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 300, color: 'var(--text-muted)' }}>-</span>
                                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--neon-red)', textShadow: '0 0 8px rgba(255,26,94,0.3)' }}>
                                  {tlPt ? tlPt.scoreBefore.team2 : '?'}
                                </span>
                              </div>
                              {/* Positions colored */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 13, fontWeight: 700 }}>
                                <span style={{ color: 'var(--neon-blue)' }}>
                                  {pt.team1_position || '?'}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>|</span>
                                <span style={{ color: 'var(--neon-red)' }}>
                                  {pt.team2_position || '?'}
                                </span>
                              </div>
                              {/* Small meta */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                                <span>P{pt.point_number}</span>
                                <span>•</span>
                                <span style={{ color: pt.winner === 'team1' ? 'var(--neon-blue)' : 'var(--neon-red)' }}>
                                  {getTeamLabel(pt.winner)}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB D: POINTS (Timeline) */}
          {activeTab === 'points' && (
            <motion.div
              key="points"
              className="tab-layout tab-layout-full"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="timeline-full">
                <PointTimeline
                  points={points}
                  team1={team1}
                  team2={team2}
                  initialScore={initialScore}
                  onScoreEdit={(newScore) => setInitialScore(newScore)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default VideoDashboard;
