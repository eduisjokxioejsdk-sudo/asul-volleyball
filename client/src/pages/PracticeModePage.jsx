// ============================================================================
// PRACTICE MODE PAGE — Mode Entraînement / Gestion & Codage des Séances
//
// 1. Écran d'accueil : Liste des séances créées + modale centrée de création
// 2. Poste de travail séance (au clic sur une séance) :
//      • Onglet 1 « Codage » : vidéo (locale ou serveur), console DataVolley et liste des actions codées
//      • Onglet 2 « Consultation » : tableaux et bilans statistiques par joueur
// ============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import { teamsAPI, videosAPI, practiceAPI } from '../services/api';
import { downloadTextFile, rowsToCsv } from '../utils/download';
import { handleRemappedKeyDown } from '../utils/keyboardRemap';
import {
  decomposeCode,
  describeCode,
  formatTimecode,
  DV_ACTIONS,
  DV_EVAL_KEYS,
} from '../utils/datavolley';
import {
  ArrowDownUp,
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  FileDown,
  Keyboard,
  ListChecks,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Target,
  Trash,
  Trophy,
  Users,
  Video,
  Volleyball,
  X,
  Zap,
} from '../components/icons';

const EVALUATIONS_DEF = [
  { key: '#', label: '# Parfait / Point', color: '#10b981', desc: 'Point gagnant, As, récep parfaite' },
  { key: '+', label: '+ Positif', color: '#0ea5e9', desc: 'Bonne qualité, action exploitable' },
  { key: '!', label: '! Neutre', color: '#f59e0b', desc: 'Qualité moyenne, continuité' },
  { key: '-', label: '− Négatif', color: '#f97316', desc: 'Mauvaise qualité, balle difficile' },
  { key: '/', label: '/ Contré', color: '#a855f7', desc: 'Attaque contrée ou amortie' },
  { key: '=', label: '= Faute directe', color: '#ef4444', desc: 'Faute directe, hors-limites, filet' },
];

const SKILLS_DEF = [
  { key: 'S', label: 'Service', icon: Volleyball, color: '#10b981' },
  { key: 'R', label: 'Réception', icon: Users, color: '#0ea5e9' },
  { key: 'A', label: 'Attaque', icon: Target, color: '#f59e0b' },
  { key: 'B', label: 'Contre', icon: Trophy, color: '#a855f7' },
  { key: 'D', label: 'Défense', icon: Keyboard, color: '#ec4899' },
  { key: 'E', label: 'Passe', icon: ArrowDownUp, color: '#06b6d4' },
];

export default function PracticeModePage({ user, onLogout }) {
  // Liste & données globales
  const [sessions, setSessions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [serverVideos, setServerVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Recherche & filtres sur l'accueil
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');

  // Modale création séance (centrée)
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newTeamId, setNewTeamId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');
  const [flashMessage, setFlashMessage] = useState(null);

  // Séance active sélectionnée pour codage / consultation
  const [activeSession, setActiveSession] = useState(null);
  const [activeTab, setActiveTab] = useState('coding'); // 'coding' | 'consultation'
  const [actions, setActions] = useState([]);
  const [loadingSession, setLoadingSession] = useState(false);

  // Vidéo
  const videoRef = useRef(null);
  const [localVideoUrl, setLocalVideoUrl] = useState(null);
  const [localVideoName, setLocalVideoName] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Console de codage
  const [codeInput, setCodeInput] = useState('');
  const [actionsSearch, setActionsSearch] = useState('');
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const codeInputRef = useRef(null);

  // Filtre Consultation
  const [consultSkillFilter, setConsultSkillFilter] = useState('ALL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, sRes, vRes] = await Promise.all([
        teamsAPI.getAll().catch(() => ({ data: { teams: [] } })),
        practiceAPI.getSessions().catch(() => ({ data: { sessions: [] } })),
        videosAPI.getAll().catch(() => ({ data: { videos: [] } })),
      ]);
      setTeams(tRes.data?.teams || []);
      setSessions(sRes.data?.sessions || []);
      setServerVideos(vRes.data?.videos || []);
    } catch (err) {
      console.error('Erreur chargement mode entraînement:', err);
    } finally {
      setLoading(false);
    }
  };

  // Équipe liée à la séance active
  const currentTeam = useMemo(() => {
    if (!activeSession?.team_id) return null;
    return teams.find((t) => Number(t.id) === Number(activeSession.team_id));
  }, [activeSession, teams]);

  const playersList = useMemo(() => {
    if (!currentTeam?.players) return [];
    return [...currentTeam.players].sort((a, b) => Number(a.number) - Number(b.number));
  }, [currentTeam]);

  // Vidéo serveur liée à la séance active
  const currentServerVideo = useMemo(() => {
    if (!activeSession?.video_id) return null;
    return serverVideos.find((v) => Number(v.id) === Number(activeSession.video_id));
  }, [activeSession, serverVideos]);

  // URL effective de lecture vidéo
  const videoPlaybackUrl = useMemo(() => {
    if (localVideoUrl) return localVideoUrl;
    if (currentServerVideo) {
      if (currentServerVideo.filepath_proxy) {
        const proxyFilename = currentServerVideo.filepath_proxy.split(/[\\/]/).pop();
        return videosAPI.getProxyUrl(proxyFilename);
      }
      if (currentServerVideo.filename) {
        return videosAPI.getFileUrl(currentServerVideo.filename);
      }
    }
    return null;
  }, [localVideoUrl, currentServerVideo]);

  // Ouvrir une séance
  const openSession = async (session) => {
    setLoadingSession(true);
    setActiveSession(session);
    setActiveTab('coding');
    setLocalVideoUrl(null);
    setLocalVideoName('');
    setCodeInput('');
    setCurrentTime(0);
    setIsPlaying(false);

    try {
      const res = await practiceAPI.getSession(session.id);
      setActions(res.data?.actions || []);
    } catch (err) {
      console.error('Erreur chargement actions séance:', err);
      setActions([]);
    } finally {
      setLoadingSession(false);
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 100);
    }
  };

  // Fermer la séance et revenir à l'accueil
  const closeSession = () => {
    setActiveSession(null);
    setLocalVideoUrl(null);
    setLocalVideoName('');
    setActions([]);
  };

  // Création d'une nouvelle séance
  const handleCreateSession = async (e) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) {
      setModalError('Veuillez renseigner un titre ou nom pour la séance.');
      return;
    }

    setCreating(true);
    setModalError('');

    try {
      const selectedTeam = teams.find((t) => String(t.id) === String(newTeamId));
      const res = await practiceAPI.createSession({
        name: cleanTitle,
        title: cleanTitle,
        session_date: newDate,
        team_id: newTeamId ? Number(newTeamId) : null,
        team_name: selectedTeam ? selectedTeam.name : null,
        notes: newNotes.trim() || null,
      });

      const created = res.data?.session;
      if (created) {
        setSessions((prev) => [created, ...prev]);
        setShowNewModal(false);
        setNewTitle('');
        setNewNotes('');
        setNewTeamId('');
        setFlashMessage({
          ok: true,
          text: `Séance « ${created.name || created.title} » créée avec succès !`,
        });
        setTimeout(() => setFlashMessage(null), 3000);

        // Ouvrir directement la séance créée
        openSession(created);
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.error || err.message || 'Erreur lors de la création de la séance';
      setModalError(`Erreur : ${errorMsg}`);
    } finally {
      setCreating(false);
    }
  };

  // Suppression d'une séance
  const handleDeleteSession = async (e, sessId, sessName) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer définitivement la séance « ${sessName || 'Séance'} » et ses données ?`)) {
      return;
    }
    try {
      await practiceAPI.deleteSession(sessId);
      setSessions((prev) => prev.filter((s) => s.id !== sessId));
      if (activeSession?.id === sessId) {
        closeSession();
      }
      setFlashMessage({ ok: true, text: 'Séance supprimée avec succès.' });
      setTimeout(() => setFlashMessage(null), 2500);
    } catch (err) {
      alert(`Erreur suppression : ${err.response?.data?.error || err.message}`);
    }
  };

  // Association d'une vidéo serveur à la séance
  const handleSelectServerVideo = async (videoId) => {
    if (!activeSession) return;
    try {
      const res = await practiceAPI.updateSession(activeSession.id, {
        video_id: videoId ? Number(videoId) : null,
      });
      if (res.data?.session) {
        setActiveSession(res.data.session);
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSession.id ? res.data.session : s))
        );
      }
    } catch (err) {
      console.error('Erreur association vidéo serveur:', err);
    }
  };

  // Chargement d'un fichier vidéo local (sans upload serveur)
  const handleLocalVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLocalVideoUrl(url);
      setLocalVideoName(file.name);
    }
  };

  // Contrôles vidéo
  const togglePlayPause = () => {
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

  const seekRelative = (delta) => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + delta));
    }
  };

  const seekTo = (seconds) => {
    const v = videoRef.current;
    if (v && typeof seconds === 'number') {
      v.currentTime = Math.max(0, seconds);
    }
  };

  const changeSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Analyse syntaxique en direct du code saisi
  const liveCodeParsed = useMemo(() => {
    const trimmed = codeInput.trim();
    if (!trimmed) return null;
    try {
      const parts = decomposeCode(trimmed);
      const desc = describeCode(trimmed);
      return { parts, desc };
    } catch {
      return null;
    }
  }, [codeInput]);

  // Validation et enregistrement d'un code d'action
  const handleCommitCode = async (explicitCode = null) => {
    if (!activeSession) return;
    const codeToCommit = String(explicitCode || codeInput).trim();
    if (!codeToCommit) return;

    const parts = decomposeCode(codeToCommit);
    const tc = videoRef.current ? Math.round(videoRef.current.currentTime * 10) / 10 : null;

    const newAction = {
      id: Date.now() + Math.random(),
      session_id: activeSession.id,
      action_index: actions.length,
      code: codeToCommit,
      timecode: tc,
      player_number: parts.player_number ? Number(parts.player_number) : null,
      action: parts.action || null,
      evaluation: parts.evaluation || null,
      type: parts.type || null,
      start_zone: parts.start_zone || null,
      end_zone: parts.end_zone || null,
      end_subzone: parts.end_subzone || null,
      created_at: new Date().toISOString(),
    };

    const nextActions = [...actions, newAction];
    setActions(nextActions);
    setCodeInput('');
    setSaveStatus('saving');

    try {
      await practiceAPI.saveActions(activeSession.id, nextActions);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 1500);
    } catch (err) {
      console.error('Erreur sauvegarde action:', err);
      setSaveStatus('');
    }

    codeInputRef.current?.focus();
  };

  // Suppression d'une action codée
  const handleDeleteAction = async (actionId) => {
    const nextActions = actions.filter((a) => a.id !== actionId);
    setActions(nextActions);
    try {
      await practiceAPI.saveActions(activeSession.id, nextActions);
    } catch (err) {
      console.error('Erreur suppression action:', err);
    }
  };

  // Raccourcis clavier dans la console (avec support Keyboard Remapping & Macros)
  const handleCodeKeyDown = (e) => {
    const remapRes = handleRemappedKeyDown(e, {
      value: codeInput,
      inputElement: codeInputRef.current,
      onChange: (nextVal) => setCodeInput(nextVal),
      onCommit: (finalVal) => handleCommitCode(finalVal),
    });
    if (remapRes.handled) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitCode();
    } else if (e.key === ' ' && !codeInput.trim()) {
      // Espace met en pause / lecture la vidéo si le champ est vide
      e.preventDefault();
      togglePlayPause();
    }
  };

  // Date au format français
  const formatDateFr = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return dt.toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Filtrage des séances sur l'accueil
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedTeamFilter !== 'ALL') {
        if (String(s.team_id) !== String(selectedTeamFilter)) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const titleMatch = (s.name || s.title || '').toLowerCase().includes(q);
        const teamMatch = (s.team_name || '').toLowerCase().includes(q);
        const notesMatch = (s.notes || '').toLowerCase().includes(q);
        const dateMatch = (s.session_date || '').toLowerCase().includes(q);
        return titleMatch || teamMatch || notesMatch || dateMatch;
      }
      return true;
    });
  }, [sessions, selectedTeamFilter, searchTerm]);

  // Filtrage de la liste des actions codées
  const displayedActions = useMemo(() => {
    if (!actionsSearch.trim()) return actions;
    const q = actionsSearch.toLowerCase();
    return actions.filter(
      (a) =>
        (a.code || '').toLowerCase().includes(q) ||
        String(a.player_number || '').includes(q) ||
        (a.action || '').toLowerCase().includes(q)
    );
  }, [actions, actionsSearch]);

  // ==========================================================================
  // CALCUL DES STATISTIQUES POUR L'ONGLET CONSULTATION
  // ==========================================================================
  const statsByPlayer = useMemo(() => {
    const map = new Map();

    for (const a of actions) {
      const num = a.player_number != null ? Number(a.player_number) : 0;
      if (!map.has(num)) {
        const found = playersList.find((p) => Number(p.number) === num);
        map.set(num, {
          number: num,
          name: found?.name || (num ? `Joueur #${num}` : 'Non spécifié'),
          total: 0,
          // Service
          serve_total: 0,
          serve_aces: 0,
          serve_pos: 0,
          serve_err: 0,
          // Réception
          rec_total: 0,
          rec_double_pos: 0,
          rec_pos: 0,
          rec_err: 0,
          // Attaque
          atk_total: 0,
          atk_kills: 0,
          atk_blocked: 0,
          atk_err: 0,
          // Bloc
          blk_total: 0,
          blk_points: 0,
          blk_err: 0,
          // Défense
          def_total: 0,
          def_perf: 0,
          def_pos: 0,
          // Bilan Global
          perfect_count: 0,
          positive_count: 0,
          error_count: 0,
          blocked_count: 0,
        });
      }

      const p = map.get(num);
      p.total += 1;
      const act = (a.action || '').toUpperCase();
      const ev = a.evaluation || '';

      if (ev === '#') p.perfect_count += 1;
      else if (ev === '+') p.positive_count += 1;
      else if (ev === '/') p.blocked_count += 1;
      else if (ev === '=') p.error_count += 1;

      if (act === 'S') {
        p.serve_total += 1;
        if (ev === '#') p.serve_aces += 1;
        else if (ev === '+') p.serve_pos += 1;
        else if (ev === '=') p.serve_err += 1;
      } else if (act === 'R') {
        p.rec_total += 1;
        if (ev === '#') p.rec_double_pos += 1;
        else if (ev === '+') p.rec_pos += 1;
        else if (ev === '=') p.rec_err += 1;
      } else if (act === 'A') {
        p.atk_total += 1;
        if (ev === '#') p.atk_kills += 1;
        else if (ev === '/') p.atk_blocked += 1;
        else if (ev === '=') p.atk_err += 1;
      } else if (act === 'B') {
        p.blk_total += 1;
        if (ev === '#') p.blk_points += 1;
        else if (ev === '=') p.blk_err += 1;
      } else if (act === 'D') {
        p.def_total += 1;
        if (ev === '#') p.def_perf += 1;
        else if (ev === '+') p.def_pos += 1;
      }
    }

    return [...map.values()]
      .map((p) => {
        const successCount = p.perfect_count + p.positive_count;
        const successRate = p.total > 0 ? Math.round((successCount / p.total) * 100) : 0;
        const efficiency =
          p.total > 0
            ? Math.round(((p.perfect_count - p.error_count - p.blocked_count) / p.total) * 100)
            : 0;
        const serveEfficiency =
          p.serve_total > 0
            ? Math.round(((p.serve_aces - p.serve_err) / p.serve_total) * 100)
            : 0;
        const recPositiveRate =
          p.rec_total > 0
            ? Math.round(((p.rec_double_pos + p.rec_pos) / p.rec_total) * 100)
            : 0;
        const atkEfficiency =
          p.atk_total > 0
            ? Math.round(((p.atk_kills - p.atk_err - p.atk_blocked) / p.atk_total) * 100)
            : 0;

        return {
          ...p,
          successCount,
          successRate,
          efficiency,
          serveEfficiency,
          recPositiveRate,
          atkEfficiency,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [actions, playersList]);

  // Totaux de l'équipe
  const teamTotals = useMemo(() => {
    const tot = {
      total: 0,
      serve_total: 0,
      serve_aces: 0,
      serve_pos: 0,
      serve_err: 0,
      rec_total: 0,
      rec_double_pos: 0,
      rec_pos: 0,
      rec_err: 0,
      atk_total: 0,
      atk_kills: 0,
      atk_blocked: 0,
      atk_err: 0,
      blk_total: 0,
      blk_points: 0,
      blk_err: 0,
      def_total: 0,
      def_perf: 0,
      def_pos: 0,
      perfect_count: 0,
      positive_count: 0,
      error_count: 0,
      blocked_count: 0,
    };

    for (const p of statsByPlayer) {
      tot.total += p.total;
      tot.serve_total += p.serve_total;
      tot.serve_aces += p.serve_aces;
      tot.serve_pos += p.serve_pos;
      tot.serve_err += p.serve_err;
      tot.rec_total += p.rec_total;
      tot.rec_double_pos += p.rec_double_pos;
      tot.rec_pos += p.rec_pos;
      tot.rec_err += p.rec_err;
      tot.atk_total += p.atk_total;
      tot.atk_kills += p.atk_kills;
      tot.atk_blocked += p.atk_blocked;
      tot.atk_err += p.atk_err;
      tot.blk_total += p.blk_total;
      tot.blk_points += p.blk_points;
      tot.blk_err += p.blk_err;
      tot.def_total += p.def_total;
      tot.def_perf += p.def_perf;
      tot.def_pos += p.def_pos;
      tot.perfect_count += p.perfect_count;
      tot.positive_count += p.positive_count;
      tot.error_count += p.error_count;
      tot.blocked_count += p.blocked_count;
    }

    const successCount = tot.perfect_count + tot.positive_count;
    const successRate = tot.total > 0 ? Math.round((successCount / tot.total) * 100) : 0;
    const efficiency =
      tot.total > 0
        ? Math.round(((tot.perfect_count - tot.error_count - tot.blocked_count) / tot.total) * 100)
        : 0;
    const serveEfficiency =
      tot.serve_total > 0
        ? Math.round(((tot.serve_aces - tot.serve_err) / tot.serve_total) * 100)
        : 0;
    const recPositiveRate =
      tot.rec_total > 0
        ? Math.round(((tot.rec_double_pos + tot.rec_pos) / tot.rec_total) * 100)
        : 0;
    const atkEfficiency =
      tot.atk_total > 0
        ? Math.round(((tot.atk_kills - tot.atk_err - tot.atk_blocked) / tot.atk_total) * 100)
        : 0;

    return {
      ...tot,
      successCount,
      successRate,
      efficiency,
      serveEfficiency,
      recPositiveRate,
      atkEfficiency,
    };
  }, [statsByPlayer]);

  // Export CSV Consultation
  const exportStatsCsv = () => {
    if (!activeSession) return;
    const header = [
      'Numéro',
      'Nom',
      'Total Actions',
      'Service Total',
      'Service As (#)',
      'Service Positifs (+)',
      'Service Fautes (=)',
      'Service Efficacité %',
      'Réception Total',
      'Réception #',
      'Réception +',
      'Réception Fautes (=)',
      'Réception Positif %',
      'Attaque Total',
      'Attaque Points (#)',
      'Attaque Bloqués (/)',
      'Attaque Fautes (=)',
      'Attaque Efficacité %',
      'Bloc Points (#)',
      'Défense #',
      'Bilan Réussite %',
      'Bilan Efficacité %',
    ];

    const rows = [
      header,
      ...statsByPlayer.map((p) => [
        p.number || '',
        p.name,
        p.total,
        p.serve_total,
        p.serve_aces,
        p.serve_pos,
        p.serve_err,
        `${p.serveEfficiency}%`,
        p.rec_total,
        p.rec_double_pos,
        p.rec_pos,
        p.rec_err,
        `${p.recPositiveRate}%`,
        p.atk_total,
        p.atk_kills,
        p.atk_blocked,
        p.atk_err,
        `${p.atkEfficiency}%`,
        p.blk_points,
        p.def_perf,
        `${p.successRate}%`,
        `${p.efficiency}%`,
      ]),
    ];

    downloadTextFile(
      `stats_seance_${(activeSession.name || activeSession.title || 'entrainement').replace(/\s+/g, '_')}_${activeSession.session_date || 'date'}.csv`,
      rowsToCsv(rows),
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="practice-mode-page app-shell-dark">
      <AppNavigation user={user} onLogout={onLogout} />

      {/* ==================================================================== */}
      {/* VUE 1 : ACCUEIL SÉANCES (SI AUCUNE SÉANCE ACTIVE)                    */}
      {/* ==================================================================== */}
      {!activeSession && (
        <main className="pk-mode-home">
          <header className="pk-mode-header" style={{ borderLeftColor: '#f59e0b' }}>
            <div className="pk-mode-header-left">
              <PancakeLogo size={56} />
              <div>
                <h1 className="pk-mode-header-title">Mode Entraînement</h1>
                <p className="pk-mode-header-sub">
                  Accueil et gestion de vos séances d'entraînement. Cliquez sur une séance pour ouvrir son poste de codage.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setModalError('');
                  setShowNewModal(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Plus size={16} />
                <span>Nouvelle Séance</span>
              </button>
            </div>
          </header>

          {/* Flash message */}
          {flashMessage && (
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                background: flashMessage.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${flashMessage.ok ? '#10b981' : '#ef4444'}`,
                color: flashMessage.ok ? '#34d399' : '#f87171',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {flashMessage.ok && <Check size={16} />}
              <span>{flashMessage.text}</span>
            </div>
          )}

          {/* Filtres & Recherche */}
          <div className="pk-filter-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                Filtrer par équipe :
              </span>
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                style={{ minWidth: 200, fontWeight: 600 }}
              >
                <option value="ALL">Toutes les équipes ({teams.length})</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

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

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="search"
                  placeholder="Rechercher une séance…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ minWidth: 240, paddingLeft: 30 }}
                />
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 9,
                    color: '#71717a',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <span className="pk-mono" style={{ fontSize: 12, color: '#a1a1aa', padding: '0 4px' }}>
                {filteredSessions.length} séance{filteredSessions.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Grille des séances */}
          {loading ? (
            <div
              style={{
                padding: 48,
                textAlign: 'center',
                color: '#a1a1aa',
                background: '#141418',
                border: '1px solid #27272a',
              }}
            >
              Chargement des séances d'entraînement…
            </div>
          ) : filteredSessions.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: 'center',
                color: '#a1a1aa',
                background: '#141418',
                border: '1px dashed #3f3f46',
                borderRadius: 6,
              }}
            >
              <p style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f5', marginBottom: 8 }}>
                {sessions.length === 0
                  ? 'Aucune séance d’entraînement créée pour le moment.'
                  : 'Aucune séance ne correspond à votre recherche.'}
              </p>
              <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 18, maxWidth: 460, margin: '0 auto 18px' }}>
                {sessions.length === 0
                  ? 'Cliquez sur « Nouvelle Séance » pour créer et enregistrer votre première séance.'
                  : 'Modifiez ou effacez vos critères de filtrage pour afficher les autres séances.'}
              </p>
              {sessions.length === 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setModalError('');
                    setShowNewModal(true);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <Plus size={15} />
                  <span>Créer une séance</span>
                </button>
              )}
            </div>
          ) : (
            <div className="pk-cards-list">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className="pk-match-item"
                  onClick={() => openSession(session)}
                  style={{
                    borderLeft: '4px solid #f59e0b',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div className="pk-match-item-head">
                      <div className="pk-match-item-title" style={{ fontSize: 16 }}>
                        {session.name || session.title}
                      </div>
                      <span
                        className="pk-mono"
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          border: '1px solid #f59e0b',
                          borderRadius: 3,
                        }}
                      >
                        {session.action_count ? `${session.action_count} ACT.` : 'OUVRIR'}
                      </span>
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          color: '#e4e4e7',
                        }}
                      >
                        <Calendar size={14} style={{ color: '#f59e0b' }} />
                        <span style={{ fontWeight: 600 }}>{formatDateFr(session.session_date)}</span>
                      </div>

                      {session.team_name && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12.5,
                            color: '#38bdf8',
                          }}
                        >
                          <Users size={14} />
                          <span style={{ fontWeight: 600 }}>{session.team_name}</span>
                        </div>
                      )}

                      {session.notes && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: '#a1a1aa',
                            lineHeight: 1.45,
                            whiteSpace: 'pre-wrap',
                            background: '#0d0d11',
                            padding: '8px 12px',
                            border: '1px solid #222228',
                            borderRadius: 4,
                          }}
                        >
                          {session.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pk-match-item-foot" style={{ marginTop: 12 }}>
                    <span
                      className="pk-mono"
                      style={{
                        fontSize: 11,
                        color: '#71717a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Clock size={12} />
                      <span>
                        {session.created_at
                          ? new Date(session.created_at).toLocaleDateString('fr-FR')
                          : '—'}
                      </span>
                    </span>

                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={(e) => handleDeleteSession(e, session.id, session.name || session.title)}
                      title="Supprimer la séance"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Trash size={12} />
                      <span>Supprimer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ==================================================================== */}
      {/* VUE 2 : WORKSTATION SÉANCE ACTIVE (CODAGE & CONSULTATION)            */}
      {/* ==================================================================== */}
      {activeSession && (
        <main style={{ maxWidth: 1560, margin: '0 auto', padding: '16px 20px' }}>
          {/* Barre d'en-tête de la séance active */}
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              padding: '12px 18px',
              background: '#141418',
              border: '1px solid #27272a',
              borderLeft: '4px solid #f59e0b',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeSession}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ChevronLeft size={16} />
                <span>Séances</span>
              </button>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#f4f4f5', fontWeight: 800 }}>
                    {activeSession.name || activeSession.title}
                  </h2>
                  <span
                    className="pk-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid #f59e0b',
                    }}
                  >
                    {actions.length} action{actions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 3 }}>
                  {formatDateFr(activeSession.session_date)}
                  {activeSession.team_name ? ` · Équipe : ${activeSession.team_name}` : ''}
                </div>
              </div>
            </div>

            {/* Onglets Codage / Consultation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  display: 'inline-flex',
                  background: '#09090b',
                  padding: 3,
                  border: '1px solid #27272a',
                  borderRadius: 6,
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('coding')}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12.5,
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: activeTab === 'coding' ? '#f59e0b' : 'transparent',
                    color: activeTab === 'coding' ? '#000' : '#a1a1aa',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Keyboard size={14} />
                  <span>Codage DataVolley</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('consultation')}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12.5,
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: activeTab === 'consultation' ? '#f59e0b' : 'transparent',
                    color: activeTab === 'consultation' ? '#000' : '#a1a1aa',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <ListChecks size={14} />
                  <span>Consultation &amp; Stats</span>
                </button>
              </div>

              {saveStatus === 'saving' && (
                <span style={{ fontSize: 11.5, color: '#f59e0b', fontWeight: 600 }}>
                  Sauvegarde…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span style={{ fontSize: 11.5, color: '#10b981', fontWeight: 600 }}>
                  ✓ Enregistré
                </span>
              )}
            </div>
          </header>

          {/* ================================================================ */}
          {/* ONGLET 1 : CODAGE DATAVOLLEY + VIDÉO + LISTE ACTIONS            */}
          {/* ================================================================ */}
          {activeTab === 'coding' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.45fr) minmax(380px, 1fr)',
                gap: 16,
                alignItems: 'start',
              }}
            >
              {/* COLONNE GAUCHE : VIDÉO + CONSOLE DE SAISIE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 1. Zone Vidéo */}
                <div
                  style={{
                    background: '#141418',
                    border: '1px solid #27272a',
                    padding: 14,
                    borderRadius: 6,
                  }}
                >
                  {videoPlaybackUrl ? (
                    <div>
                      <div
                        style={{
                          position: 'relative',
                          background: '#000',
                          borderRadius: 4,
                          overflow: 'hidden',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <video
                          ref={videoRef}
                          src={videoPlaybackUrl}
                          style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }}
                          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                          onLoadedMetadata={() =>
                            setVideoDuration(videoRef.current?.duration || 0)
                          }
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                        />
                      </div>

                      {/* Contrôles lecteur vidéo */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          flexWrap: 'wrap',
                          marginTop: 10,
                          paddingTop: 8,
                          borderTop: '1px solid #27272a',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={togglePlayPause}
                            title="Lecture / Pause (Barre Espace)"
                          >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            <span style={{ marginLeft: 4 }}>{isPlaying ? 'Pause' : 'Play'}</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => seekRelative(-5)}
                            title="-5 secondes"
                          >
                            <RotateCcw size={12} /> -5s
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => seekRelative(5)}
                            title="+5 secondes"
                          >
                            <RotateCw size={12} /> +5s
                          </button>

                          <span
                            className="pk-mono"
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: '#fbbf24',
                              marginLeft: 8,
                            }}
                          >
                            {formatTimecode(currentTime)}
                            <span style={{ color: '#71717a', fontWeight: 400 }}>
                              {' '}
                              / {formatTimecode(videoDuration)}
                            </span>
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Sélecteur vitesse */}
                          <div style={{ display: 'flex', gap: 2 }}>
                            {[0.5, 0.75, 1, 1.25, 1.5].map((spd) => (
                              <button
                                key={spd}
                                type="button"
                                onClick={() => changeSpeed(spd)}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  background: playbackSpeed === spd ? '#f59e0b' : '#09090b',
                                  color: playbackSpeed === spd ? '#000' : '#a1a1aa',
                                  border: '1px solid #27272a',
                                  borderRadius: 3,
                                  cursor: 'pointer',
                                }}
                              >
                                {spd}x
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              setLocalVideoUrl(null);
                              setLocalVideoName('');
                              handleSelectServerVideo(null);
                            }}
                            title="Changer de vidéo"
                          >
                            Retirer vidéo
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Sélecteur de vidéo quand aucune vidéo n'est chargée */
                    <div
                      style={{
                        padding: '18px',
                        background: '#0d0d11',
                        border: '1px dashed #3f3f46',
                        borderRadius: 6,
                        textAlign: 'center',
                      }}
                    >
                      <Video size={28} style={{ color: '#f59e0b', margin: '0 auto 8px' }} />
                      <h4 style={{ margin: '0 0 4px', fontSize: 14, color: '#f4f4f5' }}>
                        Vidéo de la séance (optionnelle)
                      </h4>
                      <p style={{ margin: '0 0 14px', fontSize: 12, color: '#a1a1aa' }}>
                        Ajoutez une vidéo pour synchroniser automatiquement le timecode de chaque répétition.
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Option 1: Vidéo locale */}
                        <label
                          className="btn btn-primary btn-sm"
                          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Plus size={13} />
                          <span>Choisir un fichier vidéo local</span>
                          <input
                            type="file"
                            accept="video/*"
                            onChange={handleLocalVideoUpload}
                            style={{ display: 'none' }}
                          />
                        </label>

                        {/* Option 2: Vidéo du serveur */}
                        {serverVideos.length > 0 && (
                          <select
                            style={{ fontSize: 12, maxWidth: 240 }}
                            value={activeSession.video_id || ''}
                            onChange={(e) => handleSelectServerVideo(e.target.value)}
                          >
                            <option value="">— Vidéo du serveur —</option>
                            {serverVideos.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.display_name || v.original_name || v.filename}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Console de codes DataVolley */}
                <div
                  style={{
                    background: '#141418',
                    border: '1px solid #27272a',
                    padding: 16,
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                    }}
                  >
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Keyboard size={14} />
                      <span>Console de Codage DataVolley</span>
                    </label>
                    <span style={{ fontSize: 11, color: '#71717a' }}>
                      Timecode actuel :{' '}
                      <strong style={{ color: '#fbbf24' }}>{formatTimecode(currentTime)}</strong>
                    </span>
                  </div>

                  {/* Champ de saisie principal */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      ref={codeInputRef}
                      type="text"
                      placeholder="Ex: *05S#, a02R+, 07A#, *08B= ... (Entrée pour valider)"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={handleCodeKeyDown}
                      style={{
                        flex: 1,
                        fontSize: 18,
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                        padding: '10px 14px',
                        background: '#09090b',
                        border: '2px solid #3f3f46',
                        color: '#fff',
                        letterSpacing: 1,
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleCommitCode()}
                      disabled={!codeInput.trim()}
                      style={{ padding: '0 20px', fontWeight: 700 }}
                    >
                      <Check size={16} />
                      <span style={{ marginLeft: 6 }}>Valider</span>
                    </button>
                  </div>

                  {/* Feedback syntaxique en temps réel */}
                  <div
                    style={{
                      minHeight: 28,
                      padding: '6px 10px',
                      background: '#09090b',
                      border: '1px solid #27272a',
                      borderRadius: 4,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      color: liveCodeParsed?.parts?.action ? '#38bdf8' : '#71717a',
                      marginBottom: 14,
                    }}
                  >
                    {liveCodeParsed?.parts?.action ? (
                      <span>
                        🎯 Joueur <strong>#{liveCodeParsed.parts.player_number || '?'}</strong> · Geste :{' '}
                        <strong>{liveCodeParsed.parts.action}</strong>
                        {liveCodeParsed.parts.evaluation
                          ? ` · Évaluation : ${liveCodeParsed.parts.evaluation}`
                          : ''}
                        {' · '}
                        <span style={{ color: '#a1a1aa' }}>{liveCodeParsed.desc}</span>
                      </span>
                    ) : (
                      <span>Tapez un code DataVolley complet puis tapez Entrée (Espace = Pause vidéo)</span>
                    )}
                  </div>

                  {/* Clavier rapide : Joueurs */}
                  {playersList.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#a1a1aa',
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Effectif ({currentTeam?.name}) :
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {playersList.map((p) => (
                          <button
                            key={p.id || p.number}
                            type="button"
                            onClick={() => {
                              const numStr = String(p.number).padStart(2, '0');
                              setCodeInput((prev) => `${numStr}`);
                              codeInputRef.current?.focus();
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#09090b',
                              border: '1px solid #3f3f46',
                              color: '#f4f4f5',
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 4,
                              cursor: 'pointer',
                            }}
                            title={p.name}
                          >
                            #{String(p.number).padStart(2, '0')} {p.name ? `· ${p.name.split(' ')[0]}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clavier rapide : Gestes Techniques & Évaluations */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      paddingTop: 10,
                      borderTop: '1px solid #27272a',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#a1a1aa',
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Gestes :
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {SKILLS_DEF.map((sk) => (
                          <button
                            key={sk.key}
                            type="button"
                            onClick={() => {
                              setCodeInput((prev) => `${prev}${sk.key}`);
                              codeInputRef.current?.focus();
                            }}
                            style={{
                              padding: '5px 9px',
                              background: '#09090b',
                              border: `1px solid ${sk.color}40`,
                              color: sk.color,
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 4,
                              cursor: 'pointer',
                            }}
                          >
                            {sk.label} ({sk.key})
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#a1a1aa',
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Évaluations :
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {EVALUATIONS_DEF.map((ev) => (
                          <button
                            key={ev.key}
                            type="button"
                            onClick={() => {
                              const newCode = `${codeInput}${ev.key}`;
                              setCodeInput(newCode);
                              codeInputRef.current?.focus();
                            }}
                            style={{
                              padding: '5px 9px',
                              background: '#09090b',
                              border: `1px solid ${ev.color}40`,
                              color: ev.color,
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 4,
                              cursor: 'pointer',
                            }}
                            title={ev.desc}
                          >
                            {ev.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLONNE DROITE : LISTE DES ACTIONS CODÉES */}
              <div
                style={{
                  background: '#141418',
                  border: '1px solid #27272a',
                  padding: 14,
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 150px)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#a1a1aa' }}>
                    Actions codées ({actions.length})
                  </strong>

                  <div style={{ position: 'relative' }}>
                    <input
                      type="search"
                      placeholder="Filtrer…"
                      value={actionsSearch}
                      onChange={(e) => setActionsSearch(e.target.value)}
                      style={{ fontSize: 11.5, padding: '3px 8px', width: 140 }}
                    />
                  </div>
                </div>

                {/* Flux des actions */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    paddingRight: 4,
                  }}
                >
                  {displayedActions.length === 0 ? (
                    <div
                      style={{
                        padding: 32,
                        textAlign: 'center',
                        color: '#71717a',
                        fontSize: 12.5,
                      }}
                    >
                      {actions.length === 0
                        ? 'Aucune action codée pour le moment. Saisissez votre premier code à gauche.'
                        : 'Aucune action ne correspond au filtre.'}
                    </div>
                  ) : (
                    displayedActions
                      .slice()
                      .reverse()
                      .map((act, idx) => {
                        const evMeta =
                          EVALUATIONS_DEF.find((e) => e.key === act.evaluation) || {
                            color: '#fbbf24',
                          };
                        return (
                          <div
                            key={act.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 10px',
                              background: '#09090b',
                              border: '1px solid #27272a',
                              borderRadius: 4,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Timecode clickable pour caler la vidéo */}
                              {act.timecode != null && (
                                <button
                                  type="button"
                                  onClick={() => seekTo(act.timecode)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#f59e0b',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    padding: '1px 4px',
                                    borderRadius: 3,
                                  }}
                                  title="Cliquer pour caler la vidéo"
                                >
                                  ▶ {formatTimecode(act.timecode)}
                                </button>
                              )}

                              <span
                                className="pk-mono"
                                style={{
                                  fontWeight: 800,
                                  fontSize: 13,
                                  color: '#f4f4f5',
                                  padding: '1px 6px',
                                  background: '#18181b',
                                  border: `1px solid ${evMeta.color}50`,
                                  borderRadius: 3,
                                }}
                              >
                                {act.code}
                              </span>

                              <span style={{ color: '#a1a1aa', fontSize: 11.5 }}>
                                {act.player_number ? `J#${act.player_number}` : ''} {act.action || ''}{' '}
                                <strong style={{ color: evMeta.color }}>{act.evaluation || ''}</strong>
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteAction(act.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#71717a',
                                cursor: 'pointer',
                                padding: 2,
                              }}
                              title="Supprimer cette action"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ONGLET 2 : CONSULTATION & TABLEAUX DE STATS                     */}
          {/* ================================================================ */}
          {activeTab === 'consultation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Synthèse des KPIs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    background: '#141418',
                    border: '1px solid #27272a',
                    borderLeft: '4px solid #f59e0b',
                    padding: '14px 18px',
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#a1a1aa', fontWeight: 700 }}>
                    Total Répétitions
                  </span>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#f4f4f5', marginTop: 4 }}>
                    {actions.length}
                  </div>
                </div>

                <div
                  style={{
                    background: '#141418',
                    border: '1px solid #27272a',
                    borderLeft: '4px solid #10b981',
                    padding: '14px 18px',
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#a1a1aa', fontWeight: 700 }}>
                    Taux de Réussite (# / +)
                  </span>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                    {teamTotals.successRate}%
                  </div>
                </div>

                <div
                  style={{
                    background: '#141418',
                    border: '1px solid #27272a',
                    borderLeft: '4px solid #38bdf8',
                    padding: '14px 18px',
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#a1a1aa', fontWeight: 700 }}>
                    Efficacité Globale
                  </span>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                    {teamTotals.efficiency}%
                  </div>
                </div>

                <div
                  style={{
                    background: '#141418',
                    border: '1px solid #27272a',
                    borderLeft: '4px solid #ef4444',
                    padding: '14px 18px',
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#a1a1aa', fontWeight: 700 }}>
                    Fautes Directes (= /)
                  </span>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>
                    {teamTotals.error_count + teamTotals.blocked_count}
                  </div>
                </div>
              </div>

              {/* Barre d'outils Consultation */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#141418',
                  border: '1px solid #27272a',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                    Filtrer par geste :
                  </span>
                  {['ALL', 'S', 'R', 'A', 'B', 'D'].map((k) => {
                    const label =
                      k === 'ALL'
                        ? 'Tous les gestes'
                        : k === 'S'
                        ? 'Service'
                        : k === 'R'
                        ? 'Réception'
                        : k === 'A'
                        ? 'Attaque'
                        : k === 'B'
                        ? 'Contre'
                        : 'Défense';
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setConsultSkillFilter(k)}
                        className={`btn btn-xs ${consultSkillFilter === k ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={exportStatsCsv}
                  disabled={actions.length === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FileDown size={14} />
                  <span>Exporter Bilan CSV</span>
                </button>
              </div>

              {/* Tableau de statistiques détaillé par joueur */}
              <div
                style={{
                  background: '#141418',
                  border: '1px solid #27272a',
                  padding: 16,
                  borderRadius: 6,
                  overflowX: 'auto',
                }}
              >
                <table className="pk-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Joueur</th>
                      <th style={{ textAlign: 'center' }}>Total Reps</th>
                      {/* Service */}
                      {(consultSkillFilter === 'ALL' || consultSkillFilter === 'S') && (
                        <>
                          <th style={{ textAlign: 'center', color: '#10b981' }}>Serv Tot</th>
                          <th style={{ textAlign: 'center', color: '#10b981' }}>As (#)</th>
                          <th style={{ textAlign: 'center', color: '#10b981' }}>Serv Fautes (=)</th>
                          <th style={{ textAlign: 'center', color: '#10b981' }}>Serv Eff %</th>
                        </>
                      )}
                      {/* Réception */}
                      {(consultSkillFilter === 'ALL' || consultSkillFilter === 'R') && (
                        <>
                          <th style={{ textAlign: 'center', color: '#0ea5e9' }}>Récep Tot</th>
                          <th style={{ textAlign: 'center', color: '#0ea5e9' }}>Double + (#)</th>
                          <th style={{ textAlign: 'center', color: '#0ea5e9' }}>Positif (+)</th>
                          <th style={{ textAlign: 'center', color: '#0ea5e9' }}>Récep Fautes (=)</th>
                          <th style={{ textAlign: 'center', color: '#0ea5e9' }}>Récep Pos %</th>
                        </>
                      )}
                      {/* Attaque */}
                      {(consultSkillFilter === 'ALL' || consultSkillFilter === 'A') && (
                        <>
                          <th style={{ textAlign: 'center', color: '#f59e0b' }}>Attaque Tot</th>
                          <th style={{ textAlign: 'center', color: '#f59e0b' }}>Points (#)</th>
                          <th style={{ textAlign: 'center', color: '#f59e0b' }}>Contrés (/)</th>
                          <th style={{ textAlign: 'center', color: '#f59e0b' }}>Fautes (=)</th>
                          <th style={{ textAlign: 'center', color: '#f59e0b' }}>Attaque Eff %</th>
                        </>
                      )}
                      {/* Contre */}
                      {(consultSkillFilter === 'ALL' || consultSkillFilter === 'B') && (
                        <>
                          <th style={{ textAlign: 'center', color: '#a855f7' }}>Bloc Tot</th>
                          <th style={{ textAlign: 'center', color: '#a855f7' }}>Bloc Pts (#)</th>
                        </>
                      )}
                      {/* Bilan global */}
                      <th style={{ textAlign: 'center', fontWeight: 800 }}>Réussite %</th>
                      <th style={{ textAlign: 'center', fontWeight: 800 }}>Efficacité %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsByPlayer.map((p) => (
                      <tr key={p.number}>
                        <td style={{ fontWeight: 700 }}>
                          {p.number ? `#${String(p.number).padStart(2, '0')}` : '—'} {p.name}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.total}</td>
                        {/* Service */}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'S') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{p.serve_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                              {p.serve_aces}
                            </td>
                            <td style={{ textAlign: 'center', color: '#ef4444' }}>{p.serve_err}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>
                              {p.serve_total > 0 ? `${p.serveEfficiency}%` : '—'}
                            </td>
                          </>
                        )}
                        {/* Réception */}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'R') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{p.rec_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981' }}>{p.rec_double_pos}</td>
                            <td style={{ textAlign: 'center', color: '#0ea5e9' }}>{p.rec_pos}</td>
                            <td style={{ textAlign: 'center', color: '#ef4444' }}>{p.rec_err}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#38bdf8' }}>
                              {p.rec_total > 0 ? `${p.recPositiveRate}%` : '—'}
                            </td>
                          </>
                        )}
                        {/* Attaque */}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'A') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{p.atk_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 700 }}>
                              {p.atk_kills}
                            </td>
                            <td style={{ textAlign: 'center', color: '#a855f7' }}>{p.atk_blocked}</td>
                            <td style={{ textAlign: 'center', color: '#ef4444' }}>{p.atk_err}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#f59e0b' }}>
                              {p.atk_total > 0 ? `${p.atkEfficiency}%` : '—'}
                            </td>
                          </>
                        )}
                        {/* Contre */}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'B') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{p.blk_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 700 }}>
                              {p.blk_points}
                            </td>
                          </>
                        )}
                        {/* Bilan global */}
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 700,
                            color: p.successRate >= 60 ? '#10b981' : undefined,
                          }}
                        >
                          {p.successRate}%
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 800,
                            color: p.efficiency >= 30 ? '#38bdf8' : undefined,
                          }}
                        >
                          {p.efficiency}%
                        </td>
                      </tr>
                    ))}

                    {/* Ligne Total Équipe */}
                    {statsByPlayer.length > 0 && (
                      <tr
                        style={{
                          background: '#09090b',
                          fontWeight: 800,
                          borderTop: '2px solid #3f3f46',
                        }}
                      >
                        <td>TOTAL SÉANCE</td>
                        <td style={{ textAlign: 'center' }}>{teamTotals.total}</td>
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'S') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{teamTotals.serve_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981' }}>
                              {teamTotals.serve_aces}
                            </td>
                            <td style={{ textAlign: 'center', color: '#ef4444' }}>
                              {teamTotals.serve_err}
                            </td>
                            <td style={{ textAlign: 'center' }}>{teamTotals.serveEfficiency}%</td>
                          </>
                        )}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'R') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{teamTotals.rec_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981' }}>
                              {teamTotals.rec_double_pos}
                            </td>
                            <td style={{ textAlign: 'center', color: '#0ea5e9' }}>
                              {teamTotals.rec_pos}
                            </td>
                            <td style={{ textAlign: 'center', color: '#ef4444' }}>
                              {teamTotals.rec_err}
                            </td>
                            <td style={{ textAlign: 'center', color: '#38bdf8' }}>
                              {teamTotals.recPositiveRate}%
                            </td>
                          </>
                        )}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'A') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{teamTotals.atk_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981' }}>
                              {teamTotals.atk_kills}
                            </td>
                            <td style={{ textAlign: 'center', color: '#a855f7' }}>
                              {teamTotals.atk_blocked}
                            </td>
                            <td style={{ textAlign: 'center', color: '#ef4444' }}>
                              {teamTotals.atk_err}
                            </td>
                            <td style={{ textAlign: 'center', color: '#f59e0b' }}>
                              {teamTotals.atkEfficiency}%
                            </td>
                          </>
                        )}
                        {(consultSkillFilter === 'ALL' || consultSkillFilter === 'B') && (
                          <>
                            <td style={{ textAlign: 'center' }}>{teamTotals.blk_total}</td>
                            <td style={{ textAlign: 'center', color: '#10b981' }}>
                              {teamTotals.blk_points}
                            </td>
                          </>
                        )}
                        <td style={{ textAlign: 'center', color: '#10b981' }}>
                          {teamTotals.successRate}%
                        </td>
                        <td style={{ textAlign: 'center', color: '#38bdf8' }}>
                          {teamTotals.efficiency}%
                        </td>
                      </tr>
                    )}

                    {statsByPlayer.length === 0 && (
                      <tr>
                        <td colSpan={15} style={{ textAlign: 'center', color: '#71717a', padding: 24 }}>
                          Aucune donnée codée pour le moment dans cette séance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ==================================================================== */}
      {/* MODALE DE CRÉATION CENTRÉE AU MILIEU DE L'ÉCRAN                     */}
      {/* ==================================================================== */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            overflowY: 'auto',
          }}
          onClick={() => {
            if (!creating) setShowNewModal(false);
          }}
        >
          <div
            style={{
              maxWidth: 520,
              width: '100%',
              margin: 'auto',
              background: '#141418',
              border: '1px solid #2e2e38',
              borderLeft: '4px solid #f59e0b',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#f4f4f5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <PancakeLogo size={24} />
                <span>Créer une séance d’entraînement</span>
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (!creating) setShowNewModal(false);
                }}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleCreateSession} style={{ padding: '20px' }}>
              {modalError && (
                <div
                  style={{
                    padding: '10px 14px',
                    marginBottom: 16,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    color: '#f87171',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {modalError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#d4d4d8',
                    marginBottom: 6,
                  }}
                >
                  Nom / Titre de la séance <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  style={{ width: '100%', padding: '9px 12px' }}
                  placeholder="Ex : Séance Mardi — Spécifique Réception & K2"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  required
                  disabled={creating}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#d4d4d8',
                    marginBottom: 6,
                  }}
                >
                  Date de la séance <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '9px 12px' }}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  disabled={creating}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#d4d4d8',
                    marginBottom: 6,
                  }}
                >
                  Équipe associée (optionnel)
                </label>
                <select
                  style={{ width: '100%', padding: '9px 12px' }}
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  disabled={creating}
                >
                  <option value="">— Sans équipe spécifique —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#d4d4d8',
                    marginBottom: 6,
                  }}
                >
                  Notes &amp; Objectifs (optionnel)
                </label>
                <textarea
                  rows={3}
                  style={{ width: '100%', padding: '9px 12px', resize: 'vertical' }}
                  placeholder="Objectifs de la séance, thématiques travaillées, consignes..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  disabled={creating}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewModal(false)}
                  disabled={creating}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? 'Création en cours…' : 'Créer la séance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
