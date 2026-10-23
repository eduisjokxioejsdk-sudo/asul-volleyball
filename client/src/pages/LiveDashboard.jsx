import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PancakeLogo from '../components/PancakeLogo';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { liveAPI } from '../services/api';
import { createSocket, estimateClockOffset, syncedTimeMs } from '../services/liveSocket';
import { computeMatchState, emptyLineup, COURT_POSITIONS } from '../utils/rotation';
import { computeSetterDistributionByRotation, attackZoneOf, normalizeAttackZone } from '../utils/distribution';
import { emptyTeamConfig, parseSavedLineup, serializeSavedLineup, serverPrefill } from '../utils/lineup';
import { computeMatchReport, indexActionSets, reportToRows } from '../utils/matchReport';
import { computeScouting } from '../utils/scouting';
import { startCameraCapture, cameraSupported, DELAY_CHOICES, DEFAULT_DELAY_S, clampDelay } from '../services/liveCamera';
import { createCameraPlayer, chunkToBytes } from '../services/liveCameraPlayer';
import { downloadTextFile, rowsToCsv } from '../utils/download';
import MatchBoard from '../components/MatchBoard';
import VideoShortcuts from '../components/VideoShortcuts';
import CodingConsole from '../components/CodingConsole';
import DvCodeList from '../components/DvCodeList';
import FloatingPanel from '../components/FloatingPanel';
import PanelsMenu from '../components/PanelsMenu';
import ShortcutSettings from '../components/ShortcutSettings';
import usePanelLayout from '../hooks/usePanelLayout';
import { loadShortcuts, matchesShortcut, saveShortcuts } from '../utils/shortcuts';
import MatchReportFull from '../components/MatchReportFull';
import LiveCameraPanel from '../components/LiveCameraPanel';
import LiveCoachTablet from '../components/LiveCoachTablet';
import LineupEditor from '../components/LineupEditor';
import { DvKeyPad, DvSyntaxHelp } from '../components/DvKeypad';
import { AttackCourtPicker, DistributionCourt } from '../components/AttackCourt';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardList,
  Clock,
  Crosshair,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Grid3x3,
  House,
  Keyboard,
  ListChecks,
  Pencil,
  Plane,
  Save,
  Settings,
  StopCircle,
  Table,
  Target,
  Trash,
  Trophy,
  Users,
  Video,
  Volleyball,
  X,
} from '../components/icons';
import {
  DV_ACTIONS,
  DV_ACTION_KEYS,
  completeBufferAfterTyping,
  decomposeCode,
  describeCode,
  formatCode,
  groupActionsIntoRallies,
  isTerminalEvaluation,
  learnActionTypes,
  parseSequence,
  predictNextAction,
  prefillWithLearnedType,
  rallyWinMethod,
  tryAppendChar,
  validateAction,
} from '../utils/datavolley';

const tabVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15 } },
};

function parseAssignment(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter((k) => DV_ACTION_KEYS.includes(k)) : [];
  } catch {
    return [];
  }
}

function sortActions(list) {
  return [...(list || [])].sort((a, b) => {
    if (a.effective_time !== b.effective_time) return a.effective_time - b.effective_time;
    if (a.seq !== b.seq) return a.seq - b.seq;
    return a.id - b.id;
  });
}

function dedupeAdd(list, action) {
  if (list.some((a) => a.id === action.id)) return list;
  return [...list, action];
}

function formatElapsed(firstTime, t) {
  if (firstTime == null || t == null || Number.isNaN(Number(t))) return '--:--';
  const s = Math.max(0, Number(t) - Number(firstTime));
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function SetterPositionPicker({ title, value, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title} — position du passeur</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {COURT_POSITIONS.map((p) => (
          <button key={p} type="button" className={`btn btn-sm ${value === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onChange(p)}>{p}</button>
        ))}
      </div>
    </div>
  );
}

function LiveDashboard({ user, onLogout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Clé de mémorisation du Mode Aide (par navigateur et par session live).
  const helpStorageKey = `dv.layout.aide.live.${sessionId}`;

  const socketRef = useRef(null);
  const clockOffsetRef = useRef(0);
  const bufferRef = useRef('');
  const myAssignmentRef = useRef([]);
  const actionsRef = useRef([]);
  const flashTimer = useRef(null);
  // Set courant du tableau de marque : mémorisé pour être envoyé avec chaque
  // action codée (y compris depuis les callbacks asynchrones).
  const currentSetRef = useRef(1);

  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  const [tab, setTab] = useState('codage');
  // Onglet forcé sur « Rapport » pour la consultation (rôle observateur) :
  // l'écran s'ouvre d'office sur les statistiques, sans zone de codage.
  const [tabPinned, setTabPinned] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [flash, setFlash] = useState(null);

  // Paramètres (assignation)
  const [myAssignment, setMyAssignment] = useState([]);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  // Correction manuelle d'une zone (action choisie dans la liste)
  const [zoneActionId, setZoneActionId] = useState(null);

  // Positions de départ par set + premier serveur + passeur
  const [setups, setSetups] = useState({});
  const [showTeams, setShowTeams] = useState(false);
  const [editSet, setEditSet] = useState(1);
  const [editFirstServer, setEditFirstServer] = useState('team1');
  const [editHomeSetterPos, setEditHomeSetterPos] = useState(null);
  const [editAwaySetterPos, setEditAwaySetterPos] = useState(null);
  const [editHomeLineup, setEditHomeLineup] = useState(null);
  const [editAwayLineup, setEditAwayLineup] = useState(null);
  const [editHomeConfig, setEditHomeConfig] = useState({ roster: [], libero: null, liberoFor: null });
  const [editAwayConfig, setEditAwayConfig] = useState({ roster: [], libero: null, liberoFor: null });
  const [distPos, setDistPos] = useState('Total');
  const [distTeam, setDistTeam] = useState('home');

  // Bilan de match : sets sélectionnés (vide = tous)
  const [reportSets, setReportSets] = useState([]);

  // --- Caméra du match (flux vidéo différé) --------------------------------
  // Une caméra (téléphone) filme ; le serveur rediffuse la vidéo à tous les
  // appareils avec `delay` secondes de retard (voir server/src/liveStream.js).
  const [camera, setCamera] = useState({
    active: false,
    delay: DEFAULT_DELAY_S,
    savedDelay: DEFAULT_DELAY_S,
    mimeType: '',
  });
  const [cameraMsg, setCameraMsg] = useState(null);
  const [cameraLatency, setCameraLatency] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  // Vidéo de replay issue de la finalisation : elle permet d'ouvrir le match
  // dans Data Volley d'un seul clic.
  const [replayVideoId, setReplayVideoId] = useState(null);
  const cameraCaptureRef = useRef(null); // téléphone : { stop }
  const cameraPlayerRef = useRef(null); // PCs : lecteur MediaSource
  const localVideoRef = useRef(null); // téléphone : aperçu local

  // Confort de saisie
  const [autoServe, setAutoServe] = useState(true);

  // Raccourcis clavier personnalisables (onglet Paramètres).
  const shortcutsKey = `dv.shortcuts.live.${sessionId}`;
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(`dv.shortcuts.live.${sessionId}`));

  // Fenêtres de la page de codage : déplaçables, redimensionnables, fermables.
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const panelSkip = useMemo(() => ['video', 'direction'], []);
  const { layout, setRect, toggle: togglePanelById, close, setMany, reset: resetPanels, minHeight, minWidth } = usePanelLayout(`dv.panels.live.${sessionId}`, canvasSize, panelSkip);
  const rect = useCallback((pid) => layout[pid] || { x: 0, y: 0, w: 300, h: 200 }, [layout]);
  const isOpen = useCallback((pid) => !!layout?.[pid]?.open, [layout]);
  const SECONDARY_PANELS = ['score', 'court', 'actions', 'shortcuts'];
  const arePanelsVisible = SECONDARY_PANELS.every((pid) => isOpen(pid));
  const canvasHeight = Math.max(minHeight, canvasSize.height || 0);
  const canvasWidth = Math.max(minWidth, canvasSize.width || 0);

  // Mode Aide : disposition pédagogique (console et aides côte à côte) — persisté.
  const [modeAide, setModeAide] = useState(() => {
    try {
      return localStorage.getItem(helpStorageKey) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(helpStorageKey, modeAide ? '1' : '0');
    } catch {
      // Stockage indisponible : le mode reste local à la session.
    }
  }, [modeAide, helpStorageKey]);

  // Les raccourcis sont enregistrés sur l'appareil (onglet Paramètres).
  useEffect(() => { saveShortcuts(shortcutsKey, shortcuts); }, [shortcutsKey, shortcuts]);

  // Mesure du canevas : « callback ref » → mesure dès que le canevas est monté
  // (l'écran de chargement est affiché avant, d'où une taille 0x0 qui bloquait
  // les fenêtres en haut à gauche).
  const [canvasEl, setCanvasEl] = useState(null);
  useEffect(() => {
    if (!canvasEl) return undefined;
    const measure = () => {
      const box = canvasEl.getBoundingClientRect();
      const parent = canvasEl.parentElement;
      const width = Math.round(box.width || canvasEl.clientWidth || (parent ? parent.clientWidth : 0) || 0);
      const height = Math.round(box.height || canvasEl.clientHeight || (parent ? parent.clientHeight : 0) || 0);
      setCanvasSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(canvasEl);
    if (canvasEl.parentElement) ro.observe(canvasEl.parentElement);
    return () => ro.disconnect();
  }, [canvasEl]);

  // Les boutons cliqués ne gardent pas le focus (cf. point « auto-focus »).
  useEffect(() => {
    const onPointerUp = () => {
      const el = document.activeElement;
      if (el && el.tagName === 'BUTTON') el.blur();
    };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, []);

  // Mode Aide : ouvre les fenêtres pédagogiques (aide-mémoire + clavier virtuel).
  useEffect(() => { setMany(['aide', 'keypad'], modeAide); }, [modeAide, setMany]);

  // Édition de la séquence complète d'un point (Séquences)
  const [editingRally, setEditingRally] = useState(null); // { ids: number[], isNew: boolean } | null
  const [editingSequence, setEditingSequence] = useState('');

  useEffect(() => { bufferRef.current = buffer; }, [buffer]);
  useEffect(() => { myAssignmentRef.current = myAssignment; }, [myAssignment]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  const me = useMemo(() => members.find((m) => m.user_id === user?.id) || null, [members, user]);
  const isOwner = session?.owner_user_id === user?.id;
  const isViewer = !!(me && me.role === 'viewer');
  // Le téléphone qui filme : il ne code pas, il n'affiche que sa propre caméra.
  const isCamera = !!(me && me.role === 'camera');
  const myActions = me ? parseAssignment(me.assignment) : DV_ACTION_KEYS;
  const pointCompleted = session?.point_completed || [];
  const pointDone = me ? pointCompleted.includes(me.id) : false;

  const loadState = useCallback(async () => {
    try {
      const res = await liveAPI.get(sessionId);
      setSession(res.data.session);
      // Une session déjà finalisée garde le lien vers sa vidéo de replay.
      setReplayVideoId(res.data.session?.video_id ? Number(res.data.session.video_id) : null);
      setMembers(res.data.members);
      setActions(sortActions(res.data.actions));
      const m = res.data.members.find((x) => x.user_id === user?.id) || null;
      setMyAssignment(m ? parseAssignment(m.assignment) : DV_ACTION_KEYS);
      setError(null);
    } catch (err) {
      setError('Session introuvable ou erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, user]);

  const loadRotation = useCallback(async () => {
    try {
      const setupsRes = await liveAPI.getSetups(sessionId);
      setSetups(setupsRes.data.setups || {});
    } catch (err) {
      // Silencieux : la distribution reste sur « Total » sans configuration.
    }
  }, [sessionId]);

  // Chargement initial
  useEffect(() => {
    loadState();
    loadRotation();
  }, [loadState, loadRotation]);

  // Synchronisation d'horloge (NTP-like) : offset estimé puis rafraîchi.
  useEffect(() => {
    estimateClockOffset().then((off) => { clockOffsetRef.current = off; });
    const t = setInterval(() => {
      estimateClockOffset().then((off) => { clockOffsetRef.current = off; });
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // Socket temps réel
  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    // À la connexion : rejoindre la session, et demander l'en-tête du flux si
    // une vidéo est déjà affichée (l'affichage a besoin de ce premier morceau
    // pour décoder, notamment après une reconnexion).
    const enterSession = () => {
      socket.emit('live:join', sessionId);
      if (cameraPlayerRef.current) socket.emit('live:camera-state', sessionId);
    };

    socket.on('connect', () => {
      setConnected(true);
      enterSession();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('action:add', ({ action }) => {
      setActions((prev) => sortActions(dedupeAdd(prev, action)));
    });
    socket.on('action:update', ({ action }) => {
      setActions((prev) => sortActions(prev.map((a) => (a.id === action.id ? action : a))));
    });
    socket.on('action:delete', ({ actionId }) => {
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    });
    socket.on('member:update', () => loadState());
    socket.on('session:update', () => loadState());
    socket.on('session:setups', () => loadRotation());
    socket.on('session:point', (payload) => {
      setSession((prev) => (prev ? { ...prev, current_point: payload.current_point, point_completed: payload.completed } : prev));
    });

    // --- Caméra : état du flux et morceaux vidéo différés -------------------
    socket.on('live:camera-joined', ({ mimeType, delay } = {}) => {
      setCamera((prev) => ({
        ...prev,
        active: true,
        mimeType: mimeType || prev.mimeType,
        delay: Number.isFinite(Number(delay)) ? Number(delay) : prev.delay,
      }));
      // Nouveau flux : le lecteur repart de zéro (nouvelle source MediaSource).
      cameraPlayerRef.current?.reset();
    });
    socket.on('live:camera-left', () => {
      setCamera((prev) => ({ ...prev, active: false }));
      cameraPlayerRef.current?.end();
    });
    socket.on('live:video-ready', ({ data, mimeType }) => {
      const bytes = chunkToBytes(data);
      if (bytes) cameraPlayerRef.current?.push(bytes, mimeType);
    });
    // En-tête du flux (premier morceau) : il permet de décoder la vidéo même si
    // l'appareil a rejoint le match en cours de route.
    socket.on('live:video-init', ({ data, mimeType, delay } = {}) => {
      const bytes = chunkToBytes(data);
      if (bytes) cameraPlayerRef.current?.pushInit(bytes, mimeType);
      if (Number.isFinite(Number(delay))) setCamera((prev) => ({ ...prev, delay: Number(delay) }));
    });
    socket.on('live:video-gap', () => {
      // Le serveur a jeté des morceaux (buffer plein) : on se resynchronise.
      cameraPlayerRef.current?.reset();
    });
    // État du flux renvoyé à la demande (utile après une reconnexion).
    socket.on('live:camera-state', (payload = {}) => {
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      setCamera((prev) => ({
        ...prev,
        active: !!payload.cameraActive,
        mimeType: payload.mimeType || prev.mimeType,
        // Le délai du serveur ne fait foi que lorsqu'une caméra diffuse.
        delay: payload.cameraActive && Number.isFinite(Number(payload.delay))
          ? Number(payload.delay)
          : prev.delay,
      }));
    });
    socket.on('live:video-delay', ({ delay }) => {
      if (Number.isFinite(Number(delay))) {
        setCamera((prev) => ({ ...prev, delay: Number(delay), savedDelay: Number(delay) }));
      }
    });
    socket.on('live:camera-ack', ({ delay, mimeType } = {}) => {
      setCamera((prev) => ({
        ...prev,
        active: true,
        mimeType: mimeType || prev.mimeType,
        delay: Number.isFinite(Number(delay)) ? Number(delay) : prev.delay,
      }));
    });

    if (socket.connected) enterSession();

    return () => {
      socket.emit('live:leave', sessionId);
      socket.disconnect();
    };
  }, [sessionId, loadState, loadRotation]);

  // Flash auto-masqué
  useEffect(() => {
    if (!flash) return;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, [flash]);

  // --- Caméra du match ------------------------------------------------------

  /** Attache (ou détache) le lecteur du flux au <video> affiché. */
  const bindCameraVideo = useCallback((el) => {
    if (cameraPlayerRef.current) {
      cameraPlayerRef.current.destroy();
      cameraPlayerRef.current = null;
    }
    if (!el) return;
    cameraPlayerRef.current = createCameraPlayer(el, (text, ok) => setCameraMsg({ text, ok }));
    // On demande l'en-tête du flux : sans lui, impossible de décoder la vidéo
    // reçue en cours de match (ou après un changement d'onglet).
    socketRef.current?.emit('live:camera-state', sessionId);
  }, [sessionId]);

  /** Délai enregistré pour cette session (et état courant du flux). */
  useEffect(() => {
    if (!sessionId || isCamera) return undefined;
    let cancelled = false;
    liveAPI
      .getVideoState(sessionId)
      .then((res) => {
        if (cancelled) return;
        const saved = Number(res.data?.savedDelay);
        setCamera((prev) => ({
          ...prev,
          active: !!res.data?.cameraActive,
          mimeType: res.data?.mimeType || prev.mimeType,
          savedDelay: clampDelay(Number.isFinite(saved) ? saved : prev.savedDelay),
          delay: clampDelay(Number.isFinite(saved) ? saved : prev.delay),
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, isCamera]);

  /** Aperçu local sur le téléphone (ce que la caméra filme). */
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    const p = el.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, [localStream]);

  /** Retard lu en continu, pour rassurer le statisticien sur le décalage. */
  useEffect(() => {
    if (!camera.active || isCamera) return undefined;
    const t = setInterval(() => {
      setCameraLatency(cameraPlayerRef.current?.latency?.() || 0);
    }, 1000);
    return () => clearInterval(t);
  }, [camera.active, isCamera]);

  /** Quitte l'écran : on coupe la capture si c'était ce téléphone. */
  useEffect(() => () => {
    if (cameraCaptureRef.current) {
      cameraCaptureRef.current.stop?.();
      cameraCaptureRef.current = null;
    }
  }, []);

  /** Démarre la capture sur le téléphone (rôle caméra). */
  const startCamera = async () => {
    if (!socketRef.current) return;
    setCameraBusy(true);
    setCameraMsg(null);
    try {
      const capture = await startCameraCapture({
        socket: socketRef.current,
        sessionId,
        delay: camera.delay,
        onStream: setLocalStream,
        onStatus: (text, ok) => setCameraMsg({ text, ok }),
      });
      cameraCaptureRef.current = capture;
      setCamera((prev) => ({ ...prev, active: true, mimeType: capture.mimeType || prev.mimeType }));
    } catch (err) {
      setCameraMsg({ text: err?.message || 'Caméra indisponible.', ok: false });
    } finally {
      setCameraBusy(false);
    }
  };

  /** Arrête la capture et repasse l'aperçu à l'état initial. */
  const stopCamera = () => {
    cameraCaptureRef.current?.stop?.();
    cameraCaptureRef.current = null;
    setLocalStream(null);
    setCamera((prev) => ({ ...prev, active: false }));
  };

  /** Réglage du délai de rediffusion (commun à tous les appareils).
   *  Il passe par l'API : le serveur vérifie que l'on est bien l'organisateur
   *  du match, puis prévient tous les appareils. */
  const changeCameraDelay = async (seconds) => {
    setCamera((prev) => ({ ...prev, delay: seconds, savedDelay: seconds }));
    try {
      await liveAPI.saveVideoDelay(sessionId, seconds);
      setCameraMsg({ text: `Délai vidéo réglé à ${seconds} s.`, ok: true });
    } catch {
      setCameraMsg({ text: 'Délai non enregistré (réservé à l’organisateur du match).', ok: false });
    }
  };

  /** Finalise l'enregistrement du direct en vidéo de replay ancrée. */
  const finalizeRecording = async () => {
    if (!sessionId || finalizing) return;
    setFinalizing(true);
    try {
      const res = await liveAPI.finalizeRecording(sessionId);
      setReplayVideoId(res.data.videoId ? Number(res.data.videoId) : null);
      setFlash({ ok: true, text: `Vidéo de replay créée (${res.data.actionCount || 0} action(s) ancrée(s)).` });
    } catch (err) {
      setFlash({ ok: false, text: err?.response?.data?.error || 'Échec de la finalisation.' });
    } finally {
      setFinalizing(false);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 5000);
    }
  };

  // --- Saisie clavier (console) -------------------------------------------
  const submitBuffer = useCallback(async () => {
    const raw = bufferRef.current;
    if (!raw.trim()) return;
    const items = parseSequence(raw);
    let sent = 0;
    const created = [];
    for (const it of items) {
      if (!it.code) continue;
      const parts = decomposeCode(it.code);
      const assigned = myAssignmentRef.current.includes(parts.action);
      try {
        const res = await liveAPI.addAction(sessionId, {
          code: it.code,
          effective_time: syncedTimeMs(clockOffsetRef.current) / 1000,
          system_time: Math.floor(Date.now() / 1000),
          assigned,
          // Set courant du tableau de marque : il fait foi dans le replay.
          set_number: currentSetRef.current,
        });
        setActions((prev) => sortActions(dedupeAdd(prev, res.data.action)));
        created.push(res.data.action);
        sent += 1;
      } catch (err) {
        setFlash({ ok: false, text: "Erreur d'envoi d'une action" });
      }
    }
    setBuffer('');
    if (sent) setFlash({ ok: true, text: `${sent} action(s) codée(s)` });

    // Pré-remplit le prochain service attendu (équipe qui mène le point suivant).
    if (autoServe && !isViewer && sent > 0) {
      const full = sortActions([...actionsRef.current, ...created]);
      const nextState = computeMatchState(groupActionsIntoRallies(full), setups);
      const prefill = prefillWithLearnedType(serverPrefill(nextState), learnActionTypes(full));
      bufferRef.current = prefill;
      setBuffer(prefill);
    }
  }, [sessionId, isViewer, autoServe, setups]);

  // Termine le point : envoie les actions puis signale la fin côté statisticien.
  const finishPoint = useCallback(async () => {
    await submitBuffer();
    if (isViewer) return;
    try {
      const res = await liveAPI.completePoint(sessionId);
      setSession((prev) => (prev ? { ...prev, current_point: res.data.current_point, point_completed: res.data.completed } : prev));
    } catch (err) {
      setFlash({ ok: false, text: 'Erreur de synchronisation du point' });
    }
  }, [submitBuffer, isViewer, sessionId]);

  // Corrige la zone d'une action (le code est réécrit, la zone y est intégrée).
  const applyZoneToAction = async (zoneId) => {
    if (zoneActionId == null) return;
    const id = zoneActionId;
    setZoneActionId(null);
    const target = actionsRef.current.find((a) => a.id === id);
    const zone = normalizeAttackZone(zoneId);
    if (!target || !zone) return;
    const code = formatCode({
      teamKey: target.team === 'away' ? 'a' : '*',
      player_number: target.player_number,
      action: target.action,
      type: target.type || '',
      evaluation: target.evaluation,
      start_zone: target.action === 'S' ? '1' : zone,
      end_zone: target.action === 'S' ? zone : target.end_zone || '',
      end_subzone: target.end_subzone || '',
    });
    try {
      const res = await liveAPI.updateAction(sessionId, id, { code, attack_zone: zone });
      setActions((prev) => sortActions(prev.map((a) => (a.id === id ? res.data.action : a))));
      setFlash({ ok: true, text: 'Zone corrigée' });
    } catch (err) {
      setFlash({ ok: false, text: "Erreur d'enregistrement de la zone" });
    }
  };

  const keyboardHandler = useCallback((e) => {
    // Le téléphone qui filme (caméra) ne code pas : aucun raccourci de codage.
    if (tab !== 'codage' || isViewer || isCamera) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (matchesShortcut(e, shortcuts.togglePanels)) {
      e.preventDefault();
      setMany(['score', 'court', 'actions', 'shortcuts'], !arePanelsVisible);
      return;
    }
    if (matchesShortcut(e, shortcuts.validate)) {
      e.preventDefault();
      finishPoint();
      return;
    }
    if (matchesShortcut(e, shortcuts.backspace)) {
      e.preventDefault();
      setBuffer((b) => b.slice(0, -1));
      return;
    }
    if (matchesShortcut(e, shortcuts.clearBuffer)) {
      e.preventDefault();
      setBuffer('');
      return;
    }
    if (e.key.length === 1 && !matchesShortcut(e, shortcuts.pause)
      && !matchesShortcut(e, shortcuts.seekBack) && !matchesShortcut(e, shortcuts.seekForward)
      && !matchesShortcut(e, shortcuts.speedDown) && !matchesShortcut(e, shortcuts.speedUp)
      && !matchesShortcut(e, shortcuts.speedReset)) {
      setBuffer((b) => b + e.key);
    }
  }, [tab, isViewer, isCamera, finishPoint, shortcuts, setMany, arePanelsVisible]);

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    return () => window.removeEventListener('keydown', keyboardHandler);
  }, [keyboardHandler]);

  // --- Assignation ---------------------------------------------------------
  const toggleMyAction = (key) => {
    setMyAssignment((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const saveMyAssignment = async () => {
    if (!me) return;
    setSavingAssignment(true);
    try {
      await liveAPI.updateMember(sessionId, me.id, { assignment: myAssignment });
      setFlash({ ok: true, text: 'Assignation enregistrée' });
      loadState();
    } catch (err) {
      setFlash({ ok: false, text: "Erreur d'enregistrement" });
    } finally {
      setSavingAssignment(false);
    }
  };

  const setMemberRole = async (memberId, role) => {
    try {
      await liveAPI.updateMember(sessionId, memberId, { role });
      loadState();
    } catch (err) {
      setFlash({ ok: false, text: 'Erreur de mise à jour' });
    }
  };

  const setMemberAssignment = async (memberId, assignment) => {
    try {
      await liveAPI.updateMember(sessionId, memberId, { assignment });
      loadState();
    } catch (err) {
      setFlash({ ok: false, text: 'Erreur de mise à jour' });
    }
  };

  const handleInvite = async () => {
    const emails = inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (!emails.length) return;
    try {
      await liveAPI.invite(sessionId, emails);
      setInviteEmails('');
      setFlash({ ok: true, text: 'Invitation(s) envoyée(s)' });
      loadState();
    } catch (err) {
      setFlash({ ok: false, text: "Erreur d'invitation (compte inexistant ?)" });
    }
  };

  // --- Équipes & positions de départ ----------------------------------------
  const applySetToEditor = (setNumber) => {
    const s = setups?.[String(setNumber)] || {};
    setEditSet(setNumber);
    setEditFirstServer(s.first_server === 'team2' ? 'team2' : 'team1');
    setEditHomeSetterPos(s.home_setter_pos || null);
    setEditAwaySetterPos(s.away_setter_pos || null);
    const h = parseSavedLineup(s.home_lineup);
    const a = parseSavedLineup(s.away_lineup);
    setEditHomeLineup(h.lineup || emptyLineup());
    setEditAwayLineup(a.lineup || emptyLineup());
    setEditHomeConfig(h.config || emptyTeamConfig());
    setEditAwayConfig(a.config || emptyTeamConfig());
  };

  const openTeamsModal = () => {
    applySetToEditor(1);
    setShowTeams(true);
  };

  const selectEditSet = (n) => applySetToEditor(n);

  const saveSetup = async () => {
    try {
      const updated = {
        ...setups,
        [String(editSet)]: {
          set_number: editSet,
          first_server: editFirstServer,
          home_setter_pos: editHomeSetterPos,
          away_setter_pos: editAwaySetterPos,
          home_lineup: serializeSavedLineup(editHomeLineup, editHomeConfig),
          away_lineup: serializeSavedLineup(editAwayLineup, editAwayConfig),
        },
      };
      await liveAPI.saveSetups(sessionId, updated);
      setSetups(updated);
      setShowTeams(false);
      setFlash({ ok: true, text: 'Positions, six et rôles enregistrés.' });
    } catch (err) {
      setFlash({ ok: false, text: "Impossible d'enregistrer." });
    }
  };

  // --- Édition / suppression d'une séquence complète (Séquences) ------------
  const startEditRally = (r) => {
    setEditingRally({ ids: r.actions.map((a) => a.id), isNew: false });
    setEditingSequence(r.actions.map((a) => a.code).join(''));
  };

  const startNewPoint = () => {
    setEditingRally({ ids: [], isNew: true });
    setEditingSequence('');
  };

  const cancelRallyEdit = () => {
    setEditingRally(null);
    setEditingSequence('');
  };

  const saveRallySequence = async () => {
    if (!editingRally) return;
    // On ignore les espaces afin que « a02R# a04A# » soit interprété comme « a02R#a04A# ».
    const raw = editingSequence.replace(/\s+/g, '');
    const items = parseSequence(raw).filter((it) => it.code);
    const oldIds = new Set(editingRally.ids);
    const old = actionsRef.current.filter((a) => oldIds.has(a.id));
    // Une séquence éditée garde son set d'origine ; un nouveau point prend le
    // set courant du tableau de marque.
    const rallySetNumber =
      Number(old[0]?.set_number) > 0 ? Math.round(Number(old[0].set_number)) : currentSetRef.current;

    if (items.length === 0) {
      if (old.length === 0) {
        setFlash({ ok: false, text: 'Séquence vide — rien à enregistrer.' });
        return;
      }
      try {
        for (const o of old) await liveAPI.deleteAction(sessionId, o.id);
        setFlash({ ok: true, text: 'Point supprimé' });
      } catch (err) {
        setFlash({ ok: false, text: 'Erreur de suppression' });
      }
      cancelRallyEdit();
      return;
    }

    const now = syncedTimeMs(clockOffsetRef.current) / 1000;
    let updated = 0;
    let added = 0;
    let deleted = 0;

    try {
      const max = Math.max(items.length, old.length);
      for (let i = 0; i < max; i++) {
        const item = items[i];
        const existing = old[i];
        if (item && existing) {
          if (item.code !== existing.code) {
            await liveAPI.updateAction(sessionId, existing.id, { code: item.code });
            updated += 1;
          }
        } else if (item) {
          const parts = decomposeCode(item.code);
          const assigned = myAssignmentRef.current.includes(parts.action);
          await liveAPI.addAction(sessionId, {
            code: item.code,
            effective_time: now,
            system_time: Math.floor(Date.now() / 1000),
            assigned,
            set_number: rallySetNumber,
          });
          added += 1;
        } else if (existing) {
          await liveAPI.deleteAction(sessionId, existing.id);
          deleted += 1;
        }
      }
      setFlash({
        ok: true,
        text: `Séquence enregistrée (${updated} modifiée(s), ${added} ajoutée(s), ${deleted} supprimée(s))`,
      });
    } catch (err) {
      setFlash({ ok: false, text: "Erreur d'enregistrement de la séquence" });
    }
    cancelRallyEdit();
  };

  const deleteRally = async (r) => {
    try {
      for (const a of r.actions) {
        await liveAPI.deleteAction(sessionId, a.id);
      }
      setFlash({ ok: true, text: 'Point supprimé' });
    } catch (err) {
      setFlash({ ok: false, text: 'Erreur de suppression' });
    }
  };

  // --- Dérivés -------------------------------------------------------------
  const rallies = useMemo(() => groupActionsIntoRallies(actions), [actions]);
  const matchState = useMemo(() => computeMatchState(rallies, setups), [rallies, setups]);

  // Le set courant est tenu par le tableau de marque (rotation) : on le garde
  // dans une référence pour l'envoyer avec chaque action codée.
  useEffect(() => {
    currentSetRef.current = matchState.currentSet;
  }, [matchState.currentSet]);

  // Six + fiches équipe du set en cours (rôles, libéro).
  const currentSetup = setups?.[String(matchState.currentSet)] || {};
  const savedHome = useMemo(() => parseSavedLineup(currentSetup.home_lineup), [currentSetup.home_lineup]);
  const savedAway = useMemo(() => parseSavedLineup(currentSetup.away_lineup), [currentSetup.away_lineup]);
  const homeConfig = savedHome.config;
  const awayConfig = savedAway.config;
  const hasAnyPosition = (l) => !!l && Object.values(l).some((v) => Number(v) > 0);
  const boardState = {
    currentSet: matchState.currentSet,
    score: matchState.score,
    setsWon: matchState.setsWon,
    matchOver: matchState.matchOver,
    server: matchState.server,
    homeLineup: hasAnyPosition(matchState.homeLineup) ? matchState.homeLineup : savedHome.lineup,
    awayLineup: hasAnyPosition(matchState.awayLineup) ? matchState.awayLineup : savedAway.lineup,
    homeSetterPos: matchState.homeSetterPos,
    awaySetterPos: matchState.awaySetterPos,
  };
  // Types de service déjà codés par joueur : ils sont proposés d'office ensuite.
  const learnedTypes = useMemo(() => learnActionTypes(actions), [actions]);
  const previousBufferRef = useRef('');
  useEffect(() => {
    const previous = previousBufferRef.current;
    previousBufferRef.current = buffer;
    // Complète à la frappe uniquement (pas après une suppression) : le type
    // proposé reste effaçable, et une autre lettre de type le remplace.
    const completed = completeBufferAfterTyping(buffer, previous, learnedTypes);
    if (completed !== buffer) setBuffer(completed);
  }, [buffer, learnedTypes]);

  const setterNumbers = useMemo(() => {
    const pickSetter = (config) => {
      const p = (config?.roster || []).find((x) => x.role === 'setter');
      return p ? Number(p.number) : null;
    };
    return { home: pickSetter(homeConfig), away: pickSetter(awayConfig) };
  }, [homeConfig, awayConfig]);

  const nextServe = useMemo(() => {
    const predicted = predictNextAction(actions[actions.length - 1], { homeSetter: setterNumbers.home, awaySetter: setterNumbers.away });
    if (predicted) return predicted.code;
    return prefillWithLearnedType(serverPrefill(boardState), learnedTypes);
  }, [actions, boardState, learnedTypes, setterNumbers]);

  const setterDist = useMemo(
    () => computeSetterDistributionByRotation(actions, rallies, setups, setterNumbers),
    [actions, rallies, setups, setterNumbers]
  );

  // Bilan de match standardisé (filtré par set).
  const actionSetMap = useMemo(() => indexActionSets(rallies, matchState), [rallies, matchState]);
  const matchReport = useMemo(
    () =>
      computeMatchReport(actions, {
        homeConfig,
        awayConfig,
        setMap: actionSetMap,
        sets: reportSets,
        homeName: session?.team1_name || 'Domicile',
        awayName: session?.team2_name || 'Extérieur',
      }),
    [actions, homeConfig, awayConfig, actionSetMap, reportSets, session]
  );

  // Rapport complet : ventilations, zones, situations, rotations, classements.
  const scouting = useMemo(
    () =>
      computeScouting({
        actions,
        rallies,
        homeConfig,
        awayConfig,
        homeName: session?.team1_name || 'Domicile',
        awayName: session?.team2_name || 'Extérieur',
        sets: reportSets,
        setMap: actionSetMap,
        setups,
        setterNumbers,
      }),
    [
      actions,
      rallies,
      homeConfig,
      awayConfig,
      session,
      reportSets,
      actionSetMap,
      setups,
      setterNumbers,
    ]
  );
  const errorCount = useMemo(() => actions.filter((a) => !validateAction(a.code).valid).length, [actions]);
  const ralliesWithErrors = useMemo(
    () => rallies.filter((r) => r.actions.some((a) => !validateAction(a.code).valid)),
    [rallies]
  );
  const bufferChunks = parseSequence(buffer);

  // Joueur correspondant au bloc en cours de frappe → mis en avant sur le terrain.
  const bufferPlayer = useMemo(() => {
    const last = bufferChunks[bufferChunks.length - 1];
    if (!last) return { team: null, number: null };
    const parts = decomposeCode(last.code);
    const num = Number(parts.player_number);
    if (!num) return { team: null, number: null };
    const team = parts.team === 'away' ? 'away' : parts.team === 'home' ? 'home' : null;
    return { team, number: num };
  }, [bufferChunks]);

  const blockClass = (a) => {
    const val = validateAction(a.code);
    if (!val.valid) return 'error';
    if (a.assigned === 0) return 'unassigned';
    return '';
  };

  const memberName = (memberId) => {
    const m = members.find((x) => x.id === memberId);
    return m ? m.nickname : '';
  };

  // Bilan de match : sets disponibles, filtre, export CSV et impression.
  const reportSetsAvailable = useMemo(
    () => Array.from({ length: matchState.currentSet }, (_, i) => i + 1),
    [matchState.currentSet]
  );

  const toggleReportSet = (s) => {
    if (s === 0) return setReportSets([]);
    setReportSets((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const exportReportCsv = () => {
    const slug = [session?.team1_name, session?.team2_name]
      .map((n) => String(n || '').replace(/\s+/g, '_'))
      .filter(Boolean)
      .join('_');
    downloadTextFile(`bilan_live_${slug || 'match'}.csv`, rowsToCsv(reportToRows(matchReport)), 'text/csv;charset=utf-8');
  };

  const tabs = [
    { key: 'codage', label: 'Codage', icon: Keyboard },
    { key: 'banc', label: 'Banc / Coach', icon: Crosshair },
    { key: 'sequences', label: 'Séquences', icon: ClipboardList },
    { key: 'bilan', label: 'Rapport', icon: Table },
    { key: 'distribution', label: 'Distribution', icon: Target },
    { key: 'parametres', label: 'Paramètres', icon: Settings },
  ];

  // Mode Banc / Coach : remplace l'ancien mode Consultation pour l'observateur / entraîneur.
  useEffect(() => {
    if (!isViewer || tabPinned) return;
    setTab('banc');
    setTabPinned(true);
  }, [isViewer, tabPinned]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p className="loading-text">Connexion au match en direct…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="app-loading">
        <p>{error || 'Session introuvable'}</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Retour</button>
      </div>
    );
  }

  // Écran du téléphone : rôle « caméra ». Il filme, il ne code pas et ne
  // consulte pas les statistiques.
  if (isCamera) {
    const supported = cameraSupported();
    return (
      <div className="video-dashboard live-camera-page">
        <div className="vd-workspace">
          <nav className="video-tabs dv-nav">
            <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>←</motion.button>
            <div className="dv-title">
              <strong>Caméra du match</strong>
              <span className="dv-teams">
                <House size={12} /> {session.team1_name} &nbsp;·&nbsp; <Plane size={12} /> {session.team2_name}
              </span>
            </div>
            <div className="dv-save-state">
              {connected ? (<><CircleCheck size={12} /> En direct</>) : (<><CircleX size={12} /> Hors ligne</>)}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>Code : {session.join_code}</span>
            </div>
          </nav>

          <div className="vd-main">
            <div className="live-camera-screen">
              <video ref={localVideoRef} className="live-camera-preview" playsInline muted autoPlay />

              <div className="live-camera-controls">
                {camera.active ? (
                  <button className="btn btn-danger" onClick={stopCamera} disabled={cameraBusy}>
                    <StopCircle size={16} /> Arrêter la caméra
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={startCamera} disabled={cameraBusy || !connected}>
                    <Video size={16} /> {cameraBusy ? 'Démarrage…' : 'Démarrer la caméra'}
                  </button>
                )}

                <span className="live-camera-delay">
                  <label htmlFor="camera-page-delay">Délai vidéo</label>
                  <select
                    id="camera-page-delay"
                    value={camera.delay}
                    onChange={(e) => changeCameraDelay(Number(e.target.value))}
                    title="Retard de la vidéo sur la réalité, côté statisticiens"
                  >
                    {DELAY_CHOICES.map((s) => (
                      <option key={s} value={s}>{s} s</option>
                    ))}
                  </select>
                </span>
              </div>

              <p className={`live-camera-state${camera.active ? ' on' : ''}`}>
                {camera.active
                  ? `Diffusion en cours — la vidéo apparaît sur les autres appareils avec ${camera.delay} s de retard.`
                  : 'Caméra arrêtée.'}
              </p>
              {cameraMsg && <p className="dv-hint">{cameraMsg.text}</p>}
              {!supported && (
                <p className="dv-hint live-camera-msg err">
                  Ce navigateur ne peut pas filmer en direct : il faut une page ouverte en HTTPS (ou sur le réseau
                  local) et l’autorisation d’utiliser la caméra.
                </p>
              )}
              <p className="dv-hint">
                Posez le téléphone sur un support stable, caméra vers le terrain. Le délai laisse aux statisticiens le
                temps de coder le point avant de le revoir à l’écran.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page plein écran : rapport complet (synthèse + compétences + zones…).
  if (tab === 'bilan') {
    return (
      <div className="dv-fullpage">
        <div className="dv-fullpage-bar">
          <button className="btn btn-secondary btn-sm" onClick={() => setTab(isViewer ? 'banc' : 'codage')}>
            <ChevronLeft size={14} /> {isViewer ? 'Banc / Coach' : 'Retour au codage'}
          </button>
          <div className="dv-fullpage-title">
            <PancakeLogo size={18} />
            <strong>Rapport de match</strong>
            <span className="dv-fullpage-sub">{session.team1_name} — {session.team2_name}</span>
            <span className="dv-fullpage-meta">
              {reportSets.length === 0 ? 'Tous les sets' : `Set ${reportSets.join(', ')}`} · Sets{' '}
              {matchState.setsWon.team1}–{matchState.setsWon.team2} · {matchReport.actionCount} action(s) codée(s)
            </span>
          </div>
          <div className="dv-fullpage-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exportReportCsv}
              title="Exporter la synthèse au format CSV (ouvrable dans Excel)"
            >
              <FileDown size={13} /> CSV
            </button>
          </div>
        </div>
        <div className="dv-fullpage-body">
          <LiveCameraPanel
            compact
            bindVideo={bindCameraVideo}
            active={camera.active}
            delay={camera.delay}
            canChangeDelay={isOwner}
            onDelayChange={changeCameraDelay}
            message={cameraMsg}
            extra={camera.active ? <span className="live-camera-lat">lecture {cameraLatency} s</span> : null}
          />
          <MatchReportFull
            report={scouting}
            context="live"
            sets={reportSetsAvailable}
            activeSets={reportSets}
            onToggleSet={toggleReportSet}
            rawActions={actions}
          />
        </div>
      </div>
    );
  }

  const firstTime = actions.length ? actions[0].effective_time : null;
  const elapsed = (a) => formatElapsed(firstTime, a.effective_time);

  // Classes et messages partagés par la console de codage (mode normal).
  const liveBlockClass = (it) => {
    if (!it.valid) return 'error';
    return myAssignment.includes(decomposeCode(it.code).action) ? '' : 'unassigned';
  };
  const liveLineAfter = (it) => (
    <>
      {it.combined ? ' — issue de la formule combinée' : ''}
      {it.valid && !myAssignment.includes(decomposeCode(it.code).action) ? ' · hors assignation' : ''}
    </>
  );
  const liveRallyHead = (r) => `Point ${r.pointNumber} · ${rallyWinMethod(r).label}`;
  const liveChipClass = (a) => `${blockClass(a)} ${isTerminalEvaluation(a.action, a.evaluation) ? 'terminal' : ''}`;
  const liveWarnings = matchState.warnings?.length > 0 ? (
    <p className="dv-hint" style={{ marginTop: 8, color: 'var(--danger, #e05252)' }}>
      <AlertTriangle size={13} /> {matchState.warnings.length} point(s) servi(s) par une équipe qui n’avait pas le
      service : P{matchState.warnings.map((w) => w.pointNumber).join(', P')}.
    </p>
  ) : null;
  const livePointDone = pointDone ? (
    <p className="dv-hint" style={{ marginTop: 8, color: 'var(--accent)' }}>
      <Check size={13} /> Point terminé de votre côté — en attente de l'autre statisticien.
    </p>
  ) : null;

  return (
    <div className="video-dashboard dv-page">
      <div className="vd-workspace">
        <nav className="video-tabs dv-nav">
          <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>
            <ChevronLeft size={16} />
          </motion.button>
          <div className="dv-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>{session.name}</strong>
            <span className="dv-teams">
              <House size={12} /> {session.team1_name} &nbsp;·&nbsp; <Plane size={12} /> {session.team2_name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-accent)', borderRadius: 12, padding: '4px 14px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)' }}>POINT</span>
            <strong style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>{session?.current_point ?? 1}</strong>
          </div>
          <div className="video-tabs-group">
            {tabs.map((t) => {
              const TabIcon = t.icon;
              return (
                <button key={t.key} className={`video-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                  <TabIcon size={13} /> {t.label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={openTeamsModal} title="Six de départ, rôles et libéro">
            <Users size={14} /> Six &amp; rôles
          </button>
          <button
            className={`btn btn-sm ${isOpen('aide') ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => togglePanelById('aide')}
            title="Aide-mémoire des formules DataVolley (fenêtre déplaçable)"
            aria-pressed={isOpen('aide')}
          >
            <CircleHelp size={14} /> Formules
          </button>
          <PanelsMenu
            layout={layout}
            onToggle={togglePanelById}
            onSetMany={setMany}
            onReset={resetPanels}
            compactIds={['console', 'score', 'court', 'actions', 'shortcuts', 'aide', 'keypad']}
          />
          <button
            type="button"
            className={`btn btn-sm ${modeAide ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModeAide((v) => !v)}
            title="Mode Aide : ouvre les fenêtres pédagogiques (aide-mémoire, clavier virtuel)"
            aria-pressed={modeAide}
          >
            {modeAide ? <EyeOff size={14} /> : <Eye size={14} />} Mode Aide
          </button>
          <div className="dv-save-state">
            {camera.active && (
              <span className="dv-cam-badge" title={`Caméra du match : vidéo diffusée avec ${camera.delay} s de retard`}>
                <Video size={12} /> Caméra {camera.delay} s
              </span>
            )}
            {connected ? (
              <>
                <CircleCheck size={12} /> En direct
              </>
            ) : (
              <>
                <CircleX size={12} /> Hors ligne
              </>
            )}
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>Code : {session.join_code}</span>
          </div>
        </nav>

        <div className="vd-main">
          <div className="dv-live-body">
            {flash && !flash.ok && (
              <div className={`dv-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>
            )}
            <AnimatePresence mode="wait">
              {tab === 'banc' && (
                <motion.div key="banc" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                  <LiveCoachTablet
                    team1={session.team1_name}
                    team2={session.team2_name}
                    boardState={boardState}
                    scouting={scouting}
                    actions={actions}
                    rallies={rallies}
                    setups={setups}
                    setterNumbers={setterNumbers}
                    homeConfig={homeConfig}
                    awayConfig={awayConfig}
                    videoSlot={
                      <LiveCameraPanel
                        compact
                        bindVideo={bindCameraVideo}
                        active={camera.active}
                        delay={camera.delay}
                        canChangeDelay={isOwner}
                        onDelayChange={changeCameraDelay}
                        message={cameraMsg}
                        extra={camera.active ? <span className="live-camera-lat">lecture {cameraLatency} s</span> : null}
                      />
                    }
                  />
                </motion.div>
              )}
              {tab === 'codage' && (
                <motion.div key="codage" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                  <LiveCameraPanel
                    bindVideo={bindCameraVideo}
                    active={camera.active}
                    delay={camera.delay}
                    canChangeDelay={isOwner}
                    onDelayChange={changeCameraDelay}
                    message={cameraMsg}
                    extra={camera.active ? <span className="live-camera-lat">lecture {cameraLatency} s</span> : null}
                  />
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={finalizeRecording}
                        disabled={finalizing}
                        title="Finaliser l'enregistrement du direct en une vidéo de replay ancrée (les actions codées seront liées à la vidéo)"
                      >
                        <Save size={13} /> {finalizing ? 'Finalisation…' : 'Finaliser l’enregistrement'}
                      </button>
                      {replayVideoId && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => navigate(`/datavolley/${replayVideoId}`)}
                          title="Ouvrir la vidéo de replay finalisée dans Data Volley (codage, séquences, rapports)"
                        >
                          <ArrowRight size={13} /> Ouvrir dans Data Volley
                        </button>
                      )}
                    </div>
                  )}
                  <div className="dv-canvas" ref={setCanvasEl} style={{ minHeight: canvasHeight, minWidth: canvasWidth ? `${canvasWidth}px` : undefined }}>
                    {/* Zone de code — ancre : déplaçable et redimensionnable, jamais fermée. */}
                    {isOpen('console') && (
                      <FloatingPanel
                        id="console"
                        title="Zone de code"
                        icon={Keyboard}
                        rect={rect('console')}
                        onRectChange={(patch) => setRect('console', patch)}
                        size={canvasSize}
                        closable={false}
                      >
                        {isViewer ? (
                          <p className="dv-hint">Mode consultation : vous n'êtes pas autorisé à coder.</p>
                        ) : (
                          <CodingConsole
                            commitLabel={`Terminer le point ${session?.current_point ?? 1} (${bufferChunks.length} bloc(s))`}
                            hint={
                              <p className="dv-hint">
                                Tapez librement puis Entrée (n° joueur sur 1 ou 2 chiffres). Les blocs en{' '}
                                <span style={{ color: '#4ea1ff' }}>bleu</span> sont hors de votre assignation, ceux en{' '}
                                <span style={{ color: 'var(--dv-err, #ff6b6b)' }}>rouge</span> sont invalides.
                              </p>
                            }
                            bufferChunks={bufferChunks}
                            blockClassFor={liveBlockClass}
                            lineClassFor={liveBlockClass}
                            lineAfter={liveLineAfter}
                            autoServe={autoServe}
                            onToggleAutoServe={(e) => setAutoServe(e.target.checked)}
                            nextServe={nextServe}
                            onInsertNextServe={() => { bufferRef.current = nextServe; setBuffer(nextServe); }}
                            onKey={(c) => {
                              const next = tryAppendChar(bufferRef.current, c);
                              if (next == null) {
                                setFlash({ ok: false, text: `« ${c} » n’est pas attendu ici.` });
                                return;
                              }
                              bufferRef.current = next;
                              setBuffer(next);
                            }}
                            onBackspace={() => {
                              const nb = bufferRef.current.slice(0, -1);
                              bufferRef.current = nb;
                              setBuffer(nb);
                            }}
                            onClear={() => { bufferRef.current = ''; setBuffer(''); }}
                            onCommit={finishPoint}
                            warnings={liveWarnings}
                            aftermath={livePointDone}
                          />
                        )}
                      </FloatingPanel>
                    )}
                    {/* Fenêtre « score ». */}
                    {isOpen('score') && (
                      <FloatingPanel
                        id="score"
                        title="Score"
                        icon={Trophy}
                        rect={rect('score')}
                        onRectChange={(patch) => setRect('score', patch)}
                        onClose={() => close('score')}
                        size={canvasSize}
                      >
                        <MatchBoard state={boardState} team1={session.team1_name} team2={session.team2_name} showScore showCourt={false} />
                      </FloatingPanel>
                    )}

                    {/* Fenêtre « terrain » : six, rôles et joueur en cours de saisie. */}
                    {isOpen('court') && (
                      <FloatingPanel
                        id="court"
                        title="Terrain"
                        icon={Crosshair}
                        className="panel-court"
                        rect={rect('court')}
                        onRectChange={(patch) => setRect('court', patch)}
                        onClose={() => close('court')}
                        size={canvasSize}
                      >
                        <MatchBoard
                          state={boardState}
                          team1={session.team1_name}
                          team2={session.team2_name}
                          homeConfig={homeConfig}
                          awayConfig={awayConfig}
                          showScore={false}
                          showCourt
                          activeTeam={bufferPlayer.team}
                          activeNumber={bufferPlayer.number}
                        />
                      </FloatingPanel>
                    )}

                    {/* Fenêtre « actions codées ». */}
                    {isOpen('actions') && (
                      <FloatingPanel
                        id="actions"
                        title={`Actions codées (${actions.length})`}
                        icon={ListChecks}
                        rect={rect('actions')}
                        onRectChange={(patch) => setRect('actions', patch)}
                        onClose={() => close('actions')}
                        size={canvasSize}
                      >
                        <DvCodeList rallies={rallies} mode='saisie' matchState={matchState} onSeek={(a) => setZoneActionId(a.id)} />
                      </FloatingPanel>
                    )}

                    {/* Fenêtre « raccourcis ». */}
                    {isOpen('shortcuts') && (
                      <FloatingPanel
                        id="shortcuts"
                        title="Raccourcis"
                        icon={Keyboard}
                        rect={rect('shortcuts')}
                        onRectChange={(patch) => setRect('shortcuts', patch)}
                        onClose={() => close('shortcuts')}
                        size={canvasSize}
                      >
                        <VideoShortcuts coding video={false} />
                      </FloatingPanel>
                    )}
                    {/* Fenêtres d'aide — Mode Aide : pédagogique uniquement. */}
                    {isOpen('aide') && (
                      <FloatingPanel
                        id="aide"
                        title="Aide-mémoire des formules"
                        icon={CircleHelp}
                        rect={rect('aide')}
                        onRectChange={(patch) => setRect('aide', patch)}
                        onClose={() => close('aide')}
                        size={canvasSize}
                      >
                        <DvSyntaxHelp />
                      </FloatingPanel>
                    )}

                    {isOpen('keypad') && (
                      <FloatingPanel
                        id="keypad"
                        title="Clavier virtuel"
                        icon={Grid3x3}
                        rect={rect('keypad')}
                        onRectChange={(patch) => setRect('keypad', patch)}
                        onClose={() => close('keypad')}
                        size={canvasSize}
                      >
                        <DvKeyPad
                          buffer={buffer}
                          onKey={(c) => {
                            const next = tryAppendChar(bufferRef.current, c);
                            if (next == null) {
                              setFlash({ ok: false, text: `« ${c} » n’est pas attendu ici.` });
                              return;
                            }
                            bufferRef.current = next;
                            setBuffer(next);
                          }}
                          onBackspace={() => {
                            const nb = bufferRef.current.slice(0, -1);
                            bufferRef.current = nb;
                            setBuffer(nb);
                          }}
                          onClear={() => { bufferRef.current = ''; setBuffer(''); }}
                          onCommit={finishPoint}
                        />
                      </FloatingPanel>
                    )}
                  </div>
                </motion.div>
              )}

              {tab === 'sequences' && (
                <motion.div key="sequences" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                  <h4>Séquences (point par point)</h4>
                  <p className="dv-hint">
                    Cliquez sur <Pencil size={11} /> pour modifier librement la suite complète d'un point (corriger, ajouter ou retirer des actions). Les espaces sont ignorés. Un bloc <span style={{ color: '#4ea1ff' }}>bleu</span> est hors assignation, un bloc <span style={{ color: 'var(--dv-err, #ff6b6b)' }}>rouge</span> est invalide.
                  </p>
                  <div className="dv-seq-summary">
                    {rallies.length} point(s) · {ralliesWithErrors.length} en erreur · {errorCount} action(s) défectueuse(s)
                  </div>

                  <div className="dv-seq-list">
                    {rallies.length === 0 && !editingRally?.isNew && (
                      <p className="dv-empty">Aucun point codé.</p>
                    )}
                    {rallies.map((r) => {
                      const rallyId = r.actions[0]?.id;
                      const isEditing = editingRally && !editingRally.isNew && editingRally.ids[0] === rallyId;
                      const hasErr = r.actions.some((a) => !validateAction(a.code).valid);
                      return (
                        <div key={rallyId ?? r.pointNumber} className={`dv-seq-line ${hasErr ? 'error' : ''} ${isEditing ? 'editing' : ''}`}>
                          <span className="dv-seq-num">P{r.pointNumber}</span>
                          <span className="dv-seq-tc">{elapsed(r.actions[0])}</span>
                          {isEditing ? (
                            <div className="dv-seq-edit">
                              <input
                                className="dv-seq-input"
                                value={editingSequence}
                                onChange={(e) => setEditingSequence(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); saveRallySequence(); }
                                  if (e.key === 'Escape') { e.preventDefault(); cancelRallyEdit(); }
                                }}
                                autoFocus
                              />
                              <button className="btn btn-success btn-sm" onClick={saveRallySequence}><Check size={14} /></button>
                              <button className="btn btn-secondary btn-sm" onClick={cancelRallyEdit}><X size={14} /></button>
                            </div>
                          ) : (
                            <>
                              <div className="dv-seq-blocks">
                                {r.actions.map((a) => {
                                  const name = memberName(a.member_id);
                                  const val = validateAction(a.code);
                                  return (
                                    <span
                                      key={a.id}
                                      className={`dv-seq-block ${blockClass(a)}`}
                                      title={`${val.valid ? describeCode(a.code) : `✗ ${val.issues.join(', ')}`}${name ? ` · ${name}` : ''}`}
                                    >
                                      {a.code}
                                    </span>
                                  );
                                })}
                              </div>
                              {!isViewer && (
                                <>
                                  <button className="btn btn-secondary btn-sm" title="Éditer la séquence complète" onClick={() => startEditRally(r)}><Pencil size={14} /></button>
                                  <button className="btn btn-danger btn-sm" title="Supprimer le point" onClick={() => deleteRally(r)}><Trash size={14} /></button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                    {editingRally?.isNew && (
                      <div className="dv-seq-line dv-seq-new">
                        <span className="dv-seq-num">Nouveau</span>
                        <div className="dv-seq-edit">
                          <input
                            className="dv-seq-input"
                            value={editingSequence}
                            onChange={(e) => setEditingSequence(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); saveRallySequence(); }
                              if (e.key === 'Escape') { e.preventDefault(); cancelRallyEdit(); }
                            }}
                            placeholder="*01S#a02R+a04A#"
                            autoFocus
                          />
                          <button className="btn btn-success btn-sm" onClick={saveRallySequence}><Check size={14} /></button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelRallyEdit}><X size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isViewer && editingRally == null && (
                    <button className="btn btn-secondary btn-sm" onClick={startNewPoint}>+ Nouveau point</button>
                  )}

                  {editingRally != null && editingSequence.trim() !== '' && (
                    <div className="dv-buffer-preview">
                      {parseSequence(editingSequence.replace(/\s+/g, '')).map((it, i) => (
                        <div key={i} className={`dv-preview-line ${it.valid ? '' : 'error'}`}>
                          <code>{it.code}</code> {it.valid ? describeCode(it.code) : `✗ ${validateAction(it.code).issues.join(', ')}`}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
              {tab === 'distribution' && (
                <motion.div key="distribution" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                  <h4>Distribution du passeur</h4>
                  <p className="dv-hint">Attaques après réception, par position du passeur dans la rotation.</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div className="dv-stat-tabs" style={{ margin: 0 }}>
                      {['Total', ...COURT_POSITIONS].map((pos) => (
                        <button key={pos} className={`video-tab ${distPos === pos ? 'active' : ''}`} onClick={() => setDistPos(pos)}>{pos}</button>
                      ))}
                    </div>
                    <div className="btn-group-horizontal">
                      <button type="button" className={`btn-choice ${distTeam === 'home' ? 'active team1' : ''}`} onClick={() => setDistTeam('home')}><House size={13} /> {session.team1_name}</button>
                      <button type="button" className={`btn-choice ${distTeam === 'away' ? 'active team2' : ''}`} onClick={() => setDistTeam('away')}><Plane size={13} /> {session.team2_name}</button>
                    </div>
                  </div>
                  <div className="dv-stat-team">
                    <h5>{distTeam === 'home' ? session.team1_name : session.team2_name}{distPos !== 'Total' ? ` — passeur en ${distPos}` : ''}</h5>
                    <DistributionCourt distribution={setterDist[distTeam]?.[distPos]} />
                  </div>
                </motion.div>
              )}
              {tab === 'parametres' && (
                <motion.div key="parametres" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                  <h4><Settings size={14} /> Paramètres</h4>

                  <h5 style={{ marginTop: 12 }}>Raccourcis clavier</h5>
                  <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts} video={false} />

                  <h5 style={{ marginTop: 20 }}>Fenêtres de codage</h5>
                  <p className="dv-hint">
                    Chaque fenêtre se déplace par sa barre de titre, se redimensionne par ses bords et se ferme par sa
                    croix — sauf la <strong>zone de code</strong>, toujours affichée. La disposition est mémorisée sur cet
                    appareil.
                  </p>
                  <div className="dv-panels-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMany(['score', 'court', 'actions', 'shortcuts', 'aide', 'keypad'], true)}>
                      Tout afficher
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMany(['score', 'court', 'actions', 'shortcuts', 'aide', 'keypad'], false)}>
                      Tout masquer
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={resetPanels}>
                      Réinitialiser la disposition
                    </button>
                  </div>

                  <p className="dv-hint">
                    Cochez les actions que vous êtes chargé de coder. Les actions non cochées restent saisissables mais s'affichent en bleu.
                  </p>

                  <h5 style={{ marginTop: 12 }}>Mes actions ({me?.nickname || user?.name})</h5>
                  <div className="dv-assign-list">
                    {DV_ACTION_KEYS.map((code) => {
                      const act = DV_ACTIONS.find((a) => a.code === code);
                      return (
                        <label key={code} className={`dv-assign-chip ${myAssignment.includes(code) ? 'on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={myAssignment.includes(code)}
                            onChange={() => toggleMyAction(code)}
                            disabled={isViewer}
                          />
                          <strong>{code}</strong> — {act?.label}
                        </label>
                      );
                    })}
                  </div>
                  {!isViewer && (
                    <button className="btn btn-primary" onClick={saveMyAssignment} disabled={savingAssignment}>
                      {savingAssignment ? 'Enregistrement…' : 'Enregistrer mon assignation'}
                    </button>
                  )}
                  {isViewer && <p className="dv-hint">Mode consultation : assignation verrouillée.</p>}

                  {isOwner && (
                    <>
                      <h5 style={{ marginTop: 20 }}>Équipe ({members.length} membre(s))</h5>
                      <div className="dv-members-list">
                        {members.map((m) => {
                          const mAssign = parseAssignment(m.assignment);
                          return (
                            <div key={m.id} className="dv-member-row">
                              <div className="dv-member-info">
                                <strong>{m.nickname}</strong>
                                <span className="dv-member-email">{m.email || ''}</span>
                              </div>
                              <div className="dv-member-role">
                                <button
                                  className={`btn btn-sm ${m.role === 'viewer' ? 'btn-primary' : 'btn-secondary'}`}
                                  onClick={() => setMemberRole(m.id, 'viewer')}
                                >
                                  Consultation
                                </button>
                                <button
                                  className={`btn btn-sm ${m.role === 'statistician' ? 'btn-primary' : 'btn-secondary'}`}
                                  onClick={() => setMemberRole(m.id, 'statistician')}
                                >
                                  Statisticien
                                </button>
                                <button
                                  className={`btn btn-sm ${m.role === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
                                  onClick={() => setMemberRole(m.id, 'camera')}
                                  title="Ce téléphone filme le terrain et diffuse la vidéo aux autres appareils"
                                >
                                  Caméra
                                </button>
                              </div>
                              <div className="dv-member-assign">
                                {DV_ACTION_KEYS.map((code) => (
                                  <label key={code} className={`dv-assign-mini ${mAssign.includes(code) ? 'on' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={mAssign.includes(code)}
                                      onChange={() => {
                                        const next = mAssign.includes(code) ? mAssign.filter((k) => k !== code) : [...mAssign, code];
                                        setMemberAssignment(m.id, next);
                                      }}
                                    />
                                    {code}
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <h5 style={{ marginTop: 20 }}>Inviter (par email)</h5>
                      <div className="dv-invite">
                        <input
                          type="text"
                          value={inviteEmails}
                          onChange={(e) => setInviteEmails(e.target.value)}
                          placeholder="joueur1@club.fr, joueur2@club.fr"
                        />
                        <button className="btn btn-primary" onClick={handleInvite}>Inviter</button>
                      </div>
                      <p className="dv-hint">Les comptes doivent déjà exister dans l'application.</p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showTeams && (
          <motion.div className="modal-overlay" onClick={() => setShowTeams(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} style={{ maxWidth: 760 }}>
              <h2><Users size={18} /> Six de départ</h2>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={`btn btn-sm ${editSet === n ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectEditSet(n)}>Set {n}</button>
                ))}
              </div>

              <div className="form-group">
                <label>Premier serveur (set {editSet})</label>
                <div className="btn-group-horizontal">
                  <button type="button" className={`btn-choice ${editFirstServer === 'team1' ? 'active team1' : ''}`} onClick={() => setEditFirstServer('team1')}>{session.team1_name}</button>
                  <button type="button" className={`btn-choice ${editFirstServer === 'team2' ? 'active team2' : ''}`} onClick={() => setEditFirstServer('team2')}>{session.team2_name}</button>
                </div>
              </div>

              <SetterPositionPicker title={session.team1_name} value={editHomeSetterPos} onChange={(p) => setEditHomeSetterPos(p)} />
              <SetterPositionPicker title={session.team2_name} value={editAwaySetterPos} onChange={(p) => setEditAwaySetterPos(p)} />

              <LineupEditor
                title={session.team1_name}
                lineup={editHomeLineup || emptyLineup()}
                config={editHomeConfig}
                onLineupChange={setEditHomeLineup}
                onConfigChange={setEditHomeConfig}
              />
              <LineupEditor
                title={session.team2_name}
                lineup={editAwayLineup || emptyLineup()}
                config={editAwayConfig}
                onLineupChange={setEditAwayLineup}
                onConfigChange={setEditAwayConfig}
              />

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button className="btn btn-primary" onClick={saveSetup}>Enregistrer</button>
                <button className="btn btn-secondary" onClick={() => setShowTeams(false)}>Fermer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zoneActionId != null && (
          <motion.div className="modal-overlay" onClick={() => setZoneActionId(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} style={{ maxWidth: 560 }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Grid3x3 size={18} /> Corriger la zone
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                La zone fait partie du code DataVolley : on la saisit directement (<code>*09A4#</code>). Utilisez ce
                sélecteur de secours pour corriger une action déjà codée.
              </p>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                Action : <strong>{actions.find((a) => a.id === zoneActionId)?.code || '—'}</strong>
              </p>
              <AttackCourtPicker
                onPick={applyZoneToAction}
                selected={attackZoneOf(actions.find((a) => a.id === zoneActionId))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setZoneActionId(null)}>Fermer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LiveDashboard;

