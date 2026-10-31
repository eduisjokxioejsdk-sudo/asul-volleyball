import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PancakeLogo from '../components/PancakeLogo';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { liveAPI } from '../services/api';
import { createSocket, estimateClockOffset, syncedTimeMs } from '../services/liveSocket';
import { computeMatchState, rotateSetterPos, emptyLineup, COURT_POSITIONS } from '../utils/rotation';
import { computeSetterDistributionByRotation, attackZoneOf, normalizeAttackZone } from '../utils/distribution';
import { emptyTeamConfig, parseSavedLineup, serializeSavedLineup, serverPrefill } from '../utils/lineup';
import { computeMatchReport, indexActionSets, indexActionLineups, reportToRows } from '../utils/matchReport';
import { computeScouting } from '../utils/scouting';
import { startCameraCapture, cameraSupported, DELAY_CHOICES, DEFAULT_DELAY_S, clampDelay } from '../services/liveCamera';
import { createCameraPlayer, chunkToBytes } from '../services/liveCameraPlayer';
import { downloadTextFile, rowsToCsv } from '../utils/download';
import { buildDvw } from '../utils/dvw';
import { loadCourtCalibration, saveCourtCalibration } from '../utils/homography';
import { applyCompoundAutoCodes, matchMacroShortcut } from '../utils/compoundCodes';
import {
  PANEL_PROFILES_KEY,
  loadPanelProfiles,
  removePanelProfile,
  savePanelProfile,
  storePanelProfiles,
} from '../utils/panelProfiles';
import { PANEL_GAP } from '../utils/panelLayout';
import {
  applyDirection,
  attacksWithoutDirection,
  codeIssues,
  commandToEvent,
} from '../utils/codingTools';
import MatchBoard from '../components/MatchBoard';
import DvRotationWindow from '../components/DvRotationWindow';
import DvCommandWindow from '../components/DvCommandWindow';
import VideoTvOverlay from '../components/VideoTvOverlay';
import AttackDirectionCourt from '../components/AttackDirectionCourt';
import VideoShortcuts from '../components/VideoShortcuts';
import CodingConsole from '../components/CodingConsole';
import DvCodeList from '../components/DvCodeList';
import FloatingPanel from '../components/FloatingPanel';
import PanelsMenu from '../components/PanelsMenu';
import ShortcutSettings from '../components/ShortcutSettings';
import usePanelLayout from '../hooks/usePanelLayout';
import useCodingKeyboard from '../hooks/useCodingKeyboard';
import { matchesShortcut } from '../utils/shortcuts';
import { handleCodeFieldKeyDown, handleRemappedKeyDown } from '../utils/keyboardRemap';
import MatchReportFull from '../components/MatchReportFull';
import LiveCameraPanel from '../components/LiveCameraPanel';
import LiveCoachTablet from '../components/LiveCoachTablet';
import LineupEditor from '../components/LineupEditor';
import { DvKeyPad, DvSyntaxHelp } from '../components/DvKeypad';
import { AttackCourtPicker, DistributionCourt } from '../components/AttackCourt';
import {
  AlertTriangle,
  ArrowDownUp,
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
  Grid3x3,
  House,
  Keyboard,
  ListChecks,
  MonitorPlay,
  Pencil,
  Plane,
  RotateCcw,
  RotateCw,
  Save,
  Settings,
  StopCircle,
  Table,
  Target,
  Trash,
  Trophy,
  Tv,
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
  itemTimecodes,
  learnActionTypes,
  nextBlockTimes,
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

const stripSpaces = (s) => String(s || '').replace(/\s+/g, '');

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

function sortEvents(list) {
  return [...(list || [])].sort(
    (a, b) =>
      (Number(a.set_number) || 1) - (Number(b.set_number) || 1) ||
      (Number(a.point_number) || 0) - (Number(b.point_number) || 0) ||
      (Number(a.id) || 0) - (Number(b.id) || 0)
  );
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

function SetterRow({ label, serving, pos, onChange }) {
  return (
    <div className={`dv-team-row${serving ? ' serving' : ''}`}>
      <div className="dv-team-name">
        {serving ? <Volleyball size={13} /> : null} {label}
      </div>
      <div className="dv-positions" style={{ flexWrap: 'wrap', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Passeur :</span>
        {COURT_POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange?.(p)}
            style={{
              minWidth: 26, padding: '2px 6px', fontSize: 11, fontWeight: 700,
              borderRadius: 6, border: '1px solid var(--border-subtle)', cursor: 'pointer',
              background: pos === p ? 'var(--accent)' : 'var(--bg-secondary)',
              color: pos === p ? '#1b1917' : 'var(--text-secondary)',
              borderColor: pos === p ? 'var(--accent)' : 'var(--border-subtle)',
            }}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}

function RotationBadge({ label, pos, onRotate }) {
  const btn = {
    width: 22, height: 22, padding: 0, fontSize: 12, lineHeight: '20px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)', cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
      <strong style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', minWidth: 28, textAlign: 'center' }}>{pos || '—'}</strong>
      <button type="button" onClick={() => onRotate(-1)} title="Rotation inverse" style={btn}><RotateCcw size={12} /></button>
      <button type="button" onClick={() => onRotate(1)} title="Rotation manuelle (horaire)" style={btn}><RotateCw size={12} /></button>
    </div>
  );
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
  const calibStorageKey = `live.${sessionId}`;

  const socketRef = useRef(null);
  const clockOffsetRef = useRef(0);
  const bufferRef = useRef('');
  // Horodatage par bloc de saisie (chaque code garde l'instant exact où il a été tapé)
  const blockTimesRef = useRef([]);
  const blockTimeBufferRef = useRef('');
  const myAssignmentRef = useRef([]);
  const actionsRef = useRef([]);
  const flashTimer = useRef(null);
  const rotSaveTimer = useRef(null);
  // Set courant du tableau de marque : mémorisé pour être envoyé avec chaque
  // action codée (y compris depuis les callbacks asynchrones).
  const currentSetRef = useRef(1);

  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [actions, setActions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  const [tab, setTab] = useState('codage');
  // Onglet forcé sur « Banc / Coach » pour la consultation (rôle observateur) :
  // l'écran s'ouvre d'office sur les statistiques, sans zone de codage.
  const [tabPinned, setTabPinned] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [flash, setFlash] = useState(null);

  // Fenêtre de commandes DataVolley (Ctrl+Shift+C) & Modale Remplacement
  const [showCommand, setShowCommand] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [subTeam, setSubTeam] = useState('home');
  const [subOut, setSubOut] = useState('');
  const [subIn, setSubIn] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  // Direction d'attaque (action ciblée dans le panneau flottant Directions)
  const [directionId, setDirectionId] = useState(null);

  // TV Overlay & Calibration Homographique 4 coins sur le flux vidéo direct
  const [showTvOverlay, setShowTvOverlay] = useState(true);
  const [calibMode, setCalibMode] = useState(false); // false | 'calibrating' | 'active'
  const [courtCorners, setCourtCorners] = useState(() => loadCourtCalibration(calibStorageKey));

  useEffect(() => {
    const saved = loadCourtCalibration(calibStorageKey);
    setCourtCorners(saved);
    setCalibMode(saved && saved.length === 4 ? 'active' : false);
  }, [calibStorageKey]);

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

  // --- Caméra du match (flux vidéo différé + DVR + capture PC locale) ------
  // Une caméra (téléphone ou webcam/carte d'acquisition sur le PC) filme ;
  // le serveur rediffuse la vidéo à tous les appareils avec `delay` secondes
  // de retard (voir server/src/liveStream.js).
  const [camera, setCamera] = useState({
    active: false,
    delay: DEFAULT_DELAY_S,
    savedDelay: DEFAULT_DELAY_S,
    mimeType: '',
  });
  const [cameraMsg, setCameraMsg] = useState(null);
  const [cameraLatency, setCameraLatency] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [localCapturing, setLocalCapturing] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  // Vidéo de replay issue de la finalisation : elle permet d'ouvrir le match
  // dans Data Volley d'un seul clic.
  const [replayVideoId, setReplayVideoId] = useState(null);
  const cameraCaptureRef = useRef(null); // téléphone ou PC : { stop }
  const cameraPlayerRef = useRef(null); // PCs : lecteur MediaSource DVR
  const localVideoRef = useRef(null); // téléphone : aperçu local

  // Confort de saisie
  const [autoServe, setAutoServe] = useState(true);

  // Raccourcis clavier + profil de Keyboard Remapping partagés avec les autres
  // modes qui codent au clavier (Data Volley, Entraînement, Académie).
  const { shortcuts, setShortcuts, keymapProfile } = useCodingKeyboard({
    legacyKeys: [`dv.shortcuts.live.${sessionId}`],
  });

  // Fenêtres de la page de codage : déplaçables, redimensionnables, fermables.
  // Toutes les fenêtres DataVolley 4 (dont 'video', 'direction', 'positions') sont disponibles.
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [activePanelId, setActivePanelId] = useState(null);
  const {
    layout,
    setRect,
    toggle: togglePanelById,
    open: openPanelById,
    close,
    setMany,
    reset: resetPanels,
    applyProfile: applyPanelsLayout,
    minHeight,
    minWidth,
  } = usePanelLayout(`dv.panels.live.${sessionId}`, canvasSize);
  const rect = useCallback((pid) => layout[pid] || { x: 0, y: 0, w: 300, h: 200 }, [layout]);
  const isOpen = useCallback((pid) => !!layout?.[pid]?.open, [layout]);
  const SECONDARY_PANELS = ['score', 'court', 'positions', 'actions', 'direction', 'shortcuts'];
  const arePanelsVisible = SECONDARY_PANELS.every((pid) => isOpen(pid));
  const canvasHeight = Math.max(minHeight, canvasSize.height || 0);
  const canvasWidth = Math.max(minWidth, canvasSize.width || 0);

  /**
   * Disposition « DataVolley » de l'écran de saisie (identique à DataVolleyDashboard) :
   * vidéo en haut à gauche, score et terrain en dessous, zone de code en bas,
   * direction d'attaque et liste des codes à droite sur toute la hauteur.
   */
  const applyDvLayout = useCallback(() => {
    const W = Math.max(1100, canvasSize.width || 1280);
    const H = Math.max(700, canvasSize.height || 780);
    const rightW = Math.min(400, Math.round(W * 0.28));
    const leftW = Math.max(420, W - rightW - PANEL_GAP * 3);
    const videoH = Math.round(H * 0.44);
    const consoleH = Math.round(H * 0.26);
    const midH = Math.max(160, H - videoH - consoleH - PANEL_GAP * 4);
    setRect('video', { x: PANEL_GAP, y: PANEL_GAP, w: leftW, h: videoH, open: true });
    setRect('score', { x: PANEL_GAP, y: videoH + PANEL_GAP * 2, w: Math.round(leftW * 0.42), h: midH, open: true });
    setRect('court', {
      x: PANEL_GAP * 2 + Math.round(leftW * 0.42),
      y: videoH + PANEL_GAP * 2,
      w: Math.round(leftW * 0.58),
      h: midH,
      open: true,
    });
    setRect('console', { x: PANEL_GAP, y: videoH + midH + PANEL_GAP * 3, w: leftW, h: consoleH, open: true });
    const directionH = Math.min(320, Math.max(200, Math.round(rightW / 2.2)));
    setRect('direction', { x: leftW + PANEL_GAP * 2, y: PANEL_GAP, w: rightW, h: directionH, open: true });
    setRect('actions', {
      x: leftW + PANEL_GAP * 2,
      y: directionH + PANEL_GAP * 2,
      w: rightW,
      h: H - directionH - PANEL_GAP * 3,
      open: true,
    });
    setMany(['positions', 'shortcuts', 'aide', 'keypad'], false);
  }, [canvasSize, setRect, setMany]);

  /** Disposition libre : on rend la main à l'utilisateur (fenêtres réaffichées). */
  const applyFreeLayout = useCallback(() => {
    setMany(['score', 'court', 'positions', 'actions', 'direction', 'shortcuts'], true);
  }, [setMany]);

  // Profils de fenêtres : enregistrés sur le poste, partagés entre DataVolley et le Direct.
  const [panelProfiles, setPanelProfiles] = useState(() => loadPanelProfiles());
  useEffect(() => {
    setPanelProfiles(loadPanelProfiles());
    const onStorage = (e) => {
      if (!e.key || e.key === PANEL_PROFILES_KEY) {
        setPanelProfiles(loadPanelProfiles());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [sessionId, tab]);

  const notifyEvent = useCallback((ok, text) => {
    setFlash({ ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  }, []);

  const saveLayoutProfile = useCallback(
    (name) => {
      const res = savePanelProfile(panelProfiles, name, layout);
      if (!res) {
        notifyEvent(false, 'Donnez un nom au profil de fenêtres.');
        return null;
      }
      setPanelProfiles(res.profiles);
      const stored = storePanelProfiles(res.profiles);
      notifyEvent(
        stored,
        stored
          ? `Disposition « ${res.profile.name} » enregistrée sur ce poste.`
          : `Profil « ${res.profile.name} » conservé pour cette session.`
      );
      return res.profile;
    },
    [panelProfiles, layout, notifyEvent]
  );

  const applyLayoutProfile = useCallback(
    (profileId) => {
      const profile = panelProfiles.find((p) => p.id === profileId);
      if (!profile) return;
      applyPanelsLayout(profile.layout);
      notifyEvent(true, `Disposition « ${profile.name} » appliquée à ce match.`);
    },
    [panelProfiles, applyPanelsLayout, notifyEvent]
  );

  const deleteLayoutProfile = useCallback(
    (profileId) => {
      const profile = panelProfiles.find((p) => p.id === profileId);
      if (!profile) return;
      const next = removePanelProfile(panelProfiles, profileId);
      setPanelProfiles(next);
      storePanelProfiles(next);
      notifyEvent(true, `Profil « ${profile.name} » supprimé.`);
    },
    [panelProfiles, notifyEvent]
  );

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

  // Mesure du canevas : « callback ref » → mesure dès que le canevas est monté
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

  // Horodatage par bloc de saisie : chaque code garde l'instant exact où il a été frappé
  useEffect(() => {
    const normalized = stripSpaces(buffer);
    const now = syncedTimeMs(clockOffsetRef.current) / 1000;
    blockTimesRef.current = nextBlockTimes(blockTimesRef.current, blockTimeBufferRef.current, normalized, now);
    blockTimeBufferRef.current = normalized;
  }, [buffer]);

  const me = useMemo(() => members.find((m) => m.user_id === user?.id) || null, [members, user]);
  const isOwner = session?.owner_user_id === user?.id;
  const isViewer = !!(me && me.role === 'viewer');
  // Le téléphone dédié qui filme : il ne code pas, il n'affiche que sa propre caméra.
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
      if (Array.isArray(res.data.events)) {
        setEvents(sortEvents(res.data.events));
      }
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

  const loadEvents = useCallback(async () => {
    try {
      const eventsRes = await liveAPI.getEvents(sessionId);
      setEvents(sortEvents(eventsRes.data?.events || []));
    } catch (err) {
      // Silencieux
    }
  }, [sessionId]);

  // Chargement initial
  useEffect(() => {
    loadState();
    loadRotation();
    loadEvents();
  }, [loadState, loadRotation, loadEvents]);

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
    socket.on('event:add', ({ event }) => {
      if (!event) return;
      setEvents((prev) => {
        if (prev.some((ev) => Number(ev.id) === Number(event.id))) return prev;
        return sortEvents([...prev, event]);
      });
    });
    socket.on('event:delete', ({ eventId }) => {
      setEvents((prev) => prev.filter((ev) => Number(ev.id) !== Number(eventId)));
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
    socket.on('live:video-ready', ({ seq, data, mimeType } = {}) => {
      const bytes = chunkToBytes(data);
      if (bytes) cameraPlayerRef.current?.push(bytes, mimeType, seq);
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

  /** Quitte l'écran : on coupe la capture si c'était cet appareil. */
  useEffect(() => () => {
    if (cameraCaptureRef.current) {
      cameraCaptureRef.current.stop?.();
      cameraCaptureRef.current = null;
    }
  }, []);

  /** Démarre la capture caméra (sur téléphone dédié OU directement depuis le PC du statisticien). */
  const startCamera = async (deviceId = '') => {
    if (!socketRef.current) return;
    setCameraBusy(true);
    setCameraMsg(null);
    try {
      const capture = await startCameraCapture({
        socket: socketRef.current,
        sessionId,
        delay: camera.delay,
        deviceId: typeof deviceId === 'string' ? deviceId : '',
        onStream: setLocalStream,
        onStatus: (text, ok) => setCameraMsg({ text, ok }),
      });
      cameraCaptureRef.current = capture;
      setLocalCapturing(true);
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
    setLocalCapturing(false);
    setCamera((prev) => ({ ...prev, active: false }));
  };

  /** Contrôles DVR du lecteur vidéo différé (-5s, Pause/Play, +5s, Retour au direct). */
  const handleCameraSeekRelative = useCallback((deltaSeconds) => {
    cameraPlayerRef.current?.seekRelative?.(deltaSeconds);
  }, []);

  const handleCameraJumpToLive = useCallback(() => {
    cameraPlayerRef.current?.jumpToLive?.();
  }, []);

  const handleCameraTogglePause = useCallback(() => {
    return cameraPlayerRef.current?.togglePause?.() ?? false;
  }, []);

  /** Réglage du délai de rediffusion (commun à tous les appareils). */
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

  // --- Dérivés de match (rallies, rotations, six sur le terrain, événements) -
  const rallies = useMemo(() => groupActionsIntoRallies(actions), [actions]);
  const matchState = useMemo(() => computeMatchState(rallies, setups, {}, events), [rallies, setups, events]);

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

  const setterNumbers = useMemo(() => {
    const pickSetter = (config) => {
      const p = (config?.roster || []).find((x) => x.role === 'setter');
      return p ? Number(p.number) : null;
    };
    return { home: pickSetter(homeConfig), away: pickSetter(awayConfig) };
  }, [homeConfig, awayConfig]);

  // Types de service déjà codés par joueur : ils sont proposés d'office ensuite.
  const learnedTypes = useMemo(() => learnActionTypes(actions), [actions]);
  const previousBufferRef = useRef('');
  useEffect(() => {
    const previous = previousBufferRef.current;
    previousBufferRef.current = buffer;
    const completed = completeBufferAfterTyping(buffer, previous, learnedTypes);
    if (completed !== buffer) setBuffer(completed);
  }, [buffer, learnedTypes]);

  const nextServe = useMemo(() => {
    const predicted = predictNextAction(actions[actions.length - 1], { homeSetter: setterNumbers.home, awaySetter: setterNumbers.away });
    if (predicted) return predicted.code;
    return prefillWithLearnedType(serverPrefill(boardState), learnedTypes);
  }, [actions, boardState, learnedTypes, setterNumbers]);

  // --- Fin de point rapide (`[`, `]`, `*p`, `ap`) et annulation (`Ctrl+A`) ---
  const markPointEnd = useCallback(
    async (winner) => {
      if (isViewer) return;
      const list = actionsRef.current;
      const last = list[list.length - 1];
      if (!last) {
        notifyEvent(false, 'Aucune action à clore.');
        return;
      }
      if (isTerminalEvaluation(last.action, last.evaluation)) {
        notifyEvent(false, `Le point est déjà terminé (${last.code}).`);
        return;
      }
      const team = winner === 'away' ? 'away' : 'home';
      const evaluation = last.team === team ? '#' : '=';
      const code = formatCode({
        teamKey: last.team === 'away' ? 'a' : '*',
        player_number: last.player_number,
        action: last.action,
        type: last.type || '',
        evaluation,
        start_zone: last.start_zone || '',
        end_zone: last.end_zone || '',
        end_subzone: last.end_subzone || '',
      });
      try {
        const res = await liveAPI.updateAction(sessionId, last.id, { code });
        setActions((prev) => sortActions(prev.map((a) => (a.id === last.id ? res.data.action : a))));
        const who = team === 'away' ? session?.team2_name || 'Extérieur' : session?.team1_name || 'Domicile';
        notifyEvent(true, `Point pour ${who} : ${last.code} → ${code}`);
      } catch (err) {
        notifyEvent(false, 'Impossible de clore le point.');
      }
    },
    [isViewer, sessionId, session, notifyEvent]
  );

  const undoPointEnd = useCallback(async () => {
    if (isViewer) return;
    const list = actionsRef.current;
    const last = list[list.length - 1];
    if (!last || !isTerminalEvaluation(last.action, last.evaluation)) {
      notifyEvent(false, 'Aucune fin de point à annuler.');
      return;
    }
    const code = formatCode({
      teamKey: last.team === 'away' ? 'a' : '*',
      player_number: last.player_number,
      action: last.action,
      type: last.type || '',
      evaluation: '',
      start_zone: last.start_zone || '',
      end_zone: last.end_zone || '',
      end_subzone: last.end_subzone || '',
    });
    try {
      const res = await liveAPI.updateAction(sessionId, last.id, { code });
      setActions((prev) => sortActions(prev.map((a) => (a.id === last.id ? res.data.action : a))));
      notifyEvent(true, `Fin de point annulée : ${last.code} → ${code}`);
    } catch (err) {
      notifyEvent(false, 'Impossible d’annuler la fin de point.');
    }
  }, [isViewer, sessionId, notifyEvent]);

  // --- Saisie clavier (console) avec horodatage par bloc & codes composés ---
  const submitBuffer = useCallback(async (overrideBuffer = null) => {
    const sourceBuf = typeof overrideBuffer === 'string' ? overrideBuffer : bufferRef.current;
    const raw = stripSpaces(sourceBuf);
    if (!raw) return;
    const items = parseSequence(raw);
    const validItems = items.filter((it) => it.valid);
    if (validItems.length === 0) return;

    // Si l'utilisateur a uniquement saisi un marqueur de fin de point (*p ou ap)
    const onlyPointMarkers = validItems.every((it) => it.pointMarker);
    if (onlyPointMarkers) {
      const lastMarker = validItems[validItems.length - 1];
      bufferRef.current = '';
      setBuffer('');
      await markPointEnd(lastMarker.team || 'home');
      return;
    }

    const fallbackNow = syncedTimeMs(clockOffsetRef.current) / 1000;
    const perItemTimes = itemTimecodes(raw, blockTimesRef.current);

    // Prépare les nouvelles actions avec leur horodatage individuel de frappe
    const draftActions = [];
    items.forEach((it, idx) => {
      if (!it.code || it.pointMarker) return;
      const t = Number.isFinite(perItemTimes[idx]) ? perItemTimes[idx] : fallbackNow;
      draftActions.push({
        code: it.code,
        ...decomposeCode(it.code),
        timecode: t,
        effective_time: t,
        system_time: Math.floor(t),
      });
    });

    // Applique les règles de codes automatiques composés DataVolley 4 (R -> E, A= -> B#, etc.)
    const expandedActions = applyCompoundAutoCodes(actionsRef.current, draftActions, {
      homeSetter: setterNumbers.home,
      awaySetter: setterNumbers.away,
      homeSetterNumber: setterNumbers.home,
      awaySetterNumber: setterNumbers.away,
      rawInput: raw,
    });

    let sent = 0;
    const created = [];
    for (let i = 0; i < expandedActions.length; i += 1) {
      const act = expandedActions[i];
      if (!act?.code) continue;
      const parts = decomposeCode(act.code);
      const assigned = myAssignmentRef.current.includes(parts.action);
      // Légère incrémentation (+1ms) pour préserver l'ordre strict des actions auto-générées
      const effTime = Number(act.effective_time ?? act.timecode ?? fallbackNow) + i * 0.001;
      try {
        const res = await liveAPI.addAction(sessionId, {
          code: act.code,
          effective_time: effTime,
          system_time: Math.floor(effTime),
          assigned,
          set_number: currentSetRef.current,
          is_auto: act.is_auto ? 1 : 0,
        });
        setActions((prev) => sortActions(dedupeAdd(prev, res.data.action)));
        created.push(res.data.action);
        sent += 1;
      } catch (err) {
        setFlash({ ok: false, text: "Erreur d'envoi d'une action" });
      }
    }

    bufferRef.current = '';
    blockTimesRef.current = [];
    blockTimeBufferRef.current = '';
    setBuffer('');
    if (sent) setFlash({ ok: true, text: `${sent} action(s) codée(s)` });

    // Pré-remplit le prochain service attendu (équipe qui mène le point suivant).
    if (autoServe && !isViewer && sent > 0) {
      const full = sortActions([...actionsRef.current, ...created]);
      const nextState = computeMatchState(groupActionsIntoRallies(full), setups, {}, events);
      const prefill = prefillWithLearnedType(serverPrefill(nextState), learnActionTypes(full));
      bufferRef.current = prefill;
      setBuffer(prefill);
    }
  }, [sessionId, isViewer, autoServe, setups, events, setterNumbers, markPointEnd]);

  // Termine le point : envoie les actions puis signale la fin côté statisticien.
  const finishPoint = useCallback(async (overrideBuffer = null) => {
    await submitBuffer(overrideBuffer);
    if (isViewer) return;
    try {
      const res = await liveAPI.completePoint(sessionId);
      setSession((prev) => (prev ? { ...prev, current_point: res.data.current_point, point_completed: res.data.completed } : prev));
    } catch (err) {
      setFlash({ ok: false, text: 'Erreur de synchronisation du point' });
    }
  }, [submitBuffer, isViewer, sessionId]);

  // --- Temps morts, remplacements, fenêtre de commandes & rotations ---------
  const addTimeout = async (team) => {
    if (isViewer) return;
    try {
      const res = await liveAPI.saveEvent(sessionId, {
        kind: 'timeout',
        set_number: matchState.currentSet,
        point_number: matchState.score.team1 + matchState.score.team2,
        team,
      });
      if (res.data?.event) {
        setEvents((prev) => {
          if (prev.some((ev) => Number(ev.id) === Number(res.data.event.id))) return prev;
          return sortEvents([...prev, res.data.event]);
        });
      }
      const who = team === 'away' ? session?.team2_name || 'Extérieur' : session?.team1_name || 'Domicile';
      notifyEvent(
        true,
        `Temps mort ${who} — set ${matchState.currentSet} (${matchState.score.team1}-${matchState.score.team2}).`
      );
    } catch (err) {
      notifyEvent(false, err?.response?.data?.error || 'Enregistrement du temps mort impossible.');
    }
  };

  const confirmSubstitution = async () => {
    const out = Number(subOut);
    const inn = Number(subIn);
    if (!Number.isInteger(out) || out <= 0 || !Number.isInteger(inn) || inn <= 0 || out === inn) {
      notifyEvent(false, 'Choisissez le joueur sortant et le joueur entrant.');
      return;
    }
    setSavingEvent(true);
    try {
      const res = await liveAPI.saveEvent(sessionId, {
        kind: 'substitution',
        set_number: matchState.currentSet,
        point_number: matchState.score.team1 + matchState.score.team2,
        team: subTeam,
        payload: { out, in: inn },
      });
      if (res.data?.event) {
        setEvents((prev) => {
          if (prev.some((ev) => Number(ev.id) === Number(res.data.event.id))) return prev;
          return sortEvents([...prev, res.data.event]);
        });
      }
      setShowSub(false);
      setSubOut('');
      setSubIn('');
      const who = subTeam === 'away' ? session?.team2_name || 'Extérieur' : session?.team1_name || 'Domicile';
      notifyEvent(true, `Remplacement ${who} : n°${out} → n°${inn}.`);
    } catch (err) {
      notifyEvent(false, err?.response?.data?.error || 'Enregistrement du remplacement impossible.');
    } finally {
      setSavingEvent(false);
    }
  };

  const submitCommand = useCallback(
    async (command) => {
      const body = commandToEvent(command, {
        setNumber: matchState.currentSet,
        pointNumber: matchState.score.team1 + matchState.score.team2,
      });
      if (!body) return;
      try {
        const res = await liveAPI.saveEvent(sessionId, body);
        if (res.data?.event) {
          setEvents((prev) => {
            if (prev.some((ev) => Number(ev.id) === Number(res.data.event.id))) return prev;
            return sortEvents([...prev, res.data.event]);
          });
        }
        const who = body.team === 'away' ? session?.team2_name || 'Extérieur' : session?.team1_name || 'Domicile';
        const text =
          command.kind === 'timeout'
            ? `Temps mort ${who} (set ${body.set_number}).`
            : command.kind === 'substitution'
            ? `Remplacement ${who} : n°${command.out} → n°${command.in}.`
            : `Code libre « ${command.text} » enregistré.`;
        notifyEvent(true, text);
      } catch (err) {
        notifyEvent(false, err?.response?.data?.error || 'Commande non enregistrée.');
      }
    },
    [sessionId, matchState.currentSet, matchState.score, session, notifyEvent]
  );

  const onCourtPlayers = (team) => {
    const lineup = team === 'away' ? boardState.awayLineup : boardState.homeLineup;
    const cfg = team === 'away' ? awayConfig : homeConfig;
    return COURT_POSITIONS.map((p) => Number(lineup?.[p]) || 0)
      .filter((n) => n > 0)
      .map((n) => ({ number: n, name: (cfg?.roster || []).find((x) => Number(x.number) === n)?.name || '' }));
  };

  const benchPlayers = (team) => {
    const cfg = team === 'away' ? awayConfig : homeConfig;
    const onCourt = new Set(onCourtPlayers(team).map((p) => p.number));
    return (cfg?.roster || [])
      .map((p) => ({ number: Number(p.number) || 0, name: p.name || '', role: p.role || 'universal' }))
      .filter((p) => p.number > 0 && !onCourt.has(p.number) && p.role !== 'libero');
  };

  const currentSetEvents = useMemo(
    () => events.filter((ev) => Number(ev.set_number) === matchState.currentSet),
    [events, matchState.currentSet]
  );
  const timeoutCount = (team) =>
    currentSetEvents.filter((ev) => ev.kind === 'timeout' && (ev.team || 'home') === team).length;
  const substitutionCount = currentSetEvents.filter((ev) => ev.kind === 'substitution').length;

  // Rotation manuelle rapide (+1 / -1) synchronisée via liveAPI.saveSetups
  const persistSetups = (updated) => {
    setSetups(updated);
    if (rotSaveTimer.current) clearTimeout(rotSaveTimer.current);
    rotSaveTimer.current = setTimeout(() => {
      liveAPI.saveSetups(sessionId, updated).catch(() => {});
    }, 500);
  };

  const rotateTeam = (team, dir) => {
    if (isViewer) return;
    const setNum = String(matchState.currentSet);
    const key = team === 'home' ? 'home_setter_pos' : 'away_setter_pos';
    const s = setups[setNum] || {};
    persistSetups({ ...setups, [setNum]: { ...s, [key]: rotateSetterPos(s[key] || null, dir) } });
  };

  const setSetterPos = (team, pos) => {
    if (isViewer) return;
    const setNum = String(matchState.currentSet);
    const key = team === 'home' ? 'home_setter_pos' : 'away_setter_pos';
    const s = setups[setNum] || {};
    persistSetups({ ...setups, [setNum]: { ...s, [key]: pos } });
  };

  // --- Directions d'attaque & édition rapide des codes ----------------------
  const lastAttack = useMemo(() => {
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      if (actions[i]?.action === 'A') return actions[i];
    }
    return null;
  }, [actions]);

  const attackOptions = useMemo(() => {
    return actions.filter((a) => a?.action === 'A').slice(-12).reverse();
  }, [actions]);

  const directionTarget = useMemo(
    () => (directionId ? actions.find((a) => a.id === Number(directionId)) || lastAttack : lastAttack),
    [actions, directionId, lastAttack]
  );

  const directionHistory = useMemo(() => {
    if (!directionTarget) return [];
    return actions
      .filter(
        (a) =>
          a?.action === 'A' &&
          a.team === directionTarget.team &&
          Number(a.player_number) === Number(directionTarget.player_number) &&
          a.id !== directionTarget.id &&
          a.start_zone &&
          a.end_zone
      )
      .map((a) => ({ start: String(a.start_zone), end: String(a.end_zone) }));
  }, [actions, directionTarget]);

  const setDirection = useCallback(
    async (action, start, end, coords = {}) => {
      if (!action?.id || isViewer) return;
      const withUid = [{ ...action, uid: action.id }];
      const updated = applyDirection(withUid, action.id, start, end, coords)[0];
      if (!updated) return;
      try {
        const res = await liveAPI.updateAction(sessionId, action.id, {
          code: updated.code,
          attack_zone: updated.attack_zone || start || null,
          start_subzone: updated.start_subzone || null,
          end_subzone: updated.end_subzone || null,
          start_x: updated.start_x ?? null,
          start_y: updated.start_y ?? null,
          mid_x: updated.mid_x ?? null,
          mid_y: updated.mid_y ?? null,
          end_x: updated.end_x ?? null,
          end_y: updated.end_y ?? null,
        });
        setActions((prev) => sortActions(prev.map((a) => (a.id === action.id ? res.data.action : a))));
        notifyEvent(true, `Direction ${start || '—'} → ${end || '—'} enregistrée.`);
      } catch (err) {
        notifyEvent(false, "Erreur d'enregistrement de la direction.");
      }
    },
    [sessionId, isViewer, notifyEvent]
  );

  const goToAttackWithoutDirection = useCallback(() => {
    const first = attacksWithoutDirection(actionsRef.current)[0];
    if (first) {
      setDirectionId(first.id);
      openPanelById('direction');
    } else {
      notifyEvent(true, 'Toutes les attaques ont une direction.');
    }
  }, [openPanelById, notifyEvent]);

  /** Double-clic sur une action dans la liste des codes : modifier son code en direct. */
  const editActionCode = useCallback(
    async (action, rawCode) => {
      if (!action?.id || isViewer) return;
      const trimmed = stripSpaces(rawCode);
      if (!trimmed) return;
      const check = validateAction(trimmed);
      if (!check.valid) {
        notifyEvent(false, `Code invalide : ${(check.issues || []).join(', ')}`);
        return;
      }
      try {
        const res = await liveAPI.updateAction(sessionId, action.id, { code: trimmed });
        setActions((prev) => sortActions(prev.map((a) => (a.id === action.id ? res.data.action : a))));
        notifyEvent(true, `Action modifiée : ${action.code} → ${res.data.action?.code || trimmed}`);
      } catch (err) {
        notifyEvent(false, 'Modification impossible.');
      }
    },
    [sessionId, isViewer, notifyEvent]
  );

  // Clic sur la vidéo calibrée (4 coins) → ajoute la zone (et sous-zone) au tampon de codage
  const handleZoneFromVideoClick = useCallback(
    ({ zone, subzone }) => {
      if (!zone || isViewer) return;
      const current = bufferRef.current || '';
      let next = tryAppendChar(current, String(zone));
      if (next != null) {
        if (subzone) {
          const withSub = tryAppendChar(next, String(subzone).toUpperCase());
          if (withSub != null) next = withSub;
        }
        bufferRef.current = next;
        setBuffer(next);
        notifyEvent(true, `Zone ajoutée au code : Z${zone}${subzone || ''} → ${next}`);
      } else {
        notifyEvent(true, `Zone détectée sur vidéo : Z${zone}${subzone || ''}`);
      }
    },
    [isViewer, notifyEvent]
  );

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

  // --- Clavier DataVolley 4 Pro (Remapping + Macros Alt+1..0 + [ / ] / Ctrl+A + DVR)
  const keyboardHandler = useCallback((e) => {
    // Le téléphone qui filme (caméra) ne code pas : aucun raccourci de codage.
    if (tab !== 'codage' || isViewer || isCamera) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.ctrlKey && e.altKey) return;

    // Échap : ferme la fenêtre de commandes ou vide le tampon.
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showCommand) { setShowCommand(false); return; }
      if (showSub) { setShowSub(false); return; }
      bufferRef.current = '';
      setBuffer('');
      return;
    }

    // Ctrl+Shift+C : fenêtre de commandes DataVolley (temps morts, remplacements, sanctions, code libre)
    if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      setShowCommand((v) => !v);
      return;
    }

    // Ctrl+A : annule la dernière fin de point
    if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undoPointEnd();
      return;
    }

    if (e.ctrlKey || e.metaKey) return;

    // 1. Interception Keyboard Remapping (Standard AZERTY Scout & Macros 1-to-Many)
    const remapRes = handleRemappedKeyDown(e, {
      value: bufferRef.current || '',
      profile: keymapProfile,
      onChange: (nextVal) => {
        bufferRef.current = nextVal;
        setBuffer(nextVal);
      },
      onCommit: (finalVal) => {
        finishPoint(finalVal);
      },
    });
    if (remapRes.handled) return;

    // 2. Raccourcis Macros Clavier (Alt+1..0 configurés dans Codes Auto & Macros)
    const matchedMacro = matchMacroShortcut(e);
    if (matchedMacro) {
      e.preventDefault();
      const macroSnippet = matchedMacro.snippet || matchedMacro.code || '';
      const nextBuf = (bufferRef.current || '') + macroSnippet;
      bufferRef.current = nextBuf;
      setBuffer(nextBuf);
      notifyEvent(true, `Macro ${matchedMacro.shortcut || matchedMacro.key} (${matchedMacro.label}) → ${macroSnippet}`);
      return;
    }

    if (e.altKey) return;

    if (matchesShortcut(e, shortcuts.togglePanels)) {
      e.preventDefault();
      setMany(SECONDARY_PANELS, !arePanelsVisible);
      return;
    }

    // Contrôles vidéo DVR au clavier (Pause, Reculer -5s, Avancer +5s)
    if (matchesShortcut(e, shortcuts.pause)) {
      e.preventDefault();
      handleCameraTogglePause();
      return;
    }
    if (matchesShortcut(e, shortcuts.seekBack)) {
      e.preventDefault();
      handleCameraSeekRelative(-5);
      return;
    }
    if (matchesShortcut(e, shortcuts.seekForward)) {
      e.preventDefault();
      handleCameraSeekRelative(5);
      return;
    }

    // Gestes de fin de point DataVolley : [ (domicile) et ] (extérieur)
    if (e.key === '[') {
      e.preventDefault();
      markPointEnd('home');
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      markPointEnd('away');
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
    if (e.key.length === 1 && !matchesShortcut(e, shortcuts.speedDown)
      && !matchesShortcut(e, shortcuts.speedUp)
      && !matchesShortcut(e, shortcuts.speedReset)) {
      setBuffer((b) => b + e.key);
    }
  }, [
    tab,
    isViewer,
    isCamera,
    showCommand,
    showSub,
    finishPoint,
    shortcuts,
    keymapProfile,
    setMany,
    arePanelsVisible,
    markPointEnd,
    undoPointEnd,
    notifyEvent,
    handleCameraTogglePause,
    handleCameraSeekRelative,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    return () => window.removeEventListener('keydown', keyboardHandler);
  }, [keyboardHandler]);

  const sequenceKeyHandler = (e) => {
    handleCodeFieldKeyDown(e, {
      value: editingSequence,
      onChange: setEditingSequence,
      onSubmit: saveRallySequence,
      onCancel: cancelRallyEdit,
      profile: keymapProfile,
      shortcuts,
    });
  };

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
    applySetToEditor(matchState.currentSet || 1);
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
    const raw = editingSequence.replace(/\s+/g, '');
    const items = parseSequence(raw).filter((it) => it.code);
    const oldIds = new Set(editingRally.ids);
    const old = actionsRef.current.filter((a) => oldIds.has(a.id));
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
            effective_time: now + i * 0.001,
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

  // --- Statistiques, cohérence DataVolley & Export .dvw ---------------------
  const setterDist = useMemo(
    () => computeSetterDistributionByRotation(actions, rallies, setups, setterNumbers),
    [actions, rallies, setups, setterNumbers]
  );

  const actionSetMap = useMemo(() => indexActionSets(rallies, matchState), [rallies, matchState]);
  const setOfAction = useCallback(
    (a) => {
      if (!a) return null;
      const key = a.uid ?? a.id ?? a.action_index;
      return actionSetMap.get(key) ?? a.set_number ?? null;
    },
    [actionSetMap]
  );

  // Contrôles de cohérence DataVolley 4 en temps réel (joueurs hors six, double touche, etc.)
  const issues = useMemo(
    () =>
      codeIssues(actions, {
        roster: {
          home: (homeConfig?.roster || []).map((p) => p.number),
          away: (awayConfig?.roster || []).map((p) => p.number),
        },
        requireTimecode: false,
        enriched: true,
        matchState,
        events,
        liberos: { home: homeConfig?.libero, away: awayConfig?.libero },
      }),
    [actions, homeConfig, awayConfig, matchState, events]
  );

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

  // Bilan de match : sets disponibles, filtre, export CSV et export .dvw.
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

  const exportDvwFile = () => {
    const team1 = session?.team1_name || 'Domicile';
    const team2 = session?.team2_name || 'Extérieur';
    const slug = [team1, team2].map((n) => String(n || '').replace(/\s+/g, '_')).filter(Boolean).join('_');
    const rosterOf = (cfg) => (cfg?.roster || []).map((p) => ({ number: p.number, name: p.name }));
    const lineupMap = indexActionLineups(rallies, matchState);
    const firstT = actions.length ? Number(actions[0].effective_time) : 0;
    const dvw = buildDvw({
      match: { date: '', league: '', scout: user?.name || '' },
      teams: { home: team1, away: team2 },
      rosters: { home: rosterOf(homeConfig), away: rosterOf(awayConfig) },
      sets: [],
      actions: actions.map((a, idx) => {
        const key = a.uid ?? a.id ?? idx;
        const relTime = Number.isFinite(Number(a.effective_time))
          ? Math.max(0, Math.round(Number(a.effective_time) - firstT))
          : null;
        return {
          ...a,
          timecode: a.timecode ?? relTime,
          ...(lineupMap.get(key) || {}),
          set_number: actionSetMap.get(key) || a.set_number || 1,
          rally_number: idx + 1,
        };
      }),
    });
    downloadTextFile(`match_live_${slug || 'asul'}.dvw`, dvw, 'text/plain;charset=utf-8');
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

  const team1 = session.team1_name || 'Domicile';
  const team2 = session.team2_name || 'Extérieur';

  // Écran du téléphone dédié : rôle « caméra ». Il filme, il ne code pas.
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
                <House size={12} /> {team1} &nbsp;·&nbsp; <Plane size={12} /> {team2}
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
                  <button className="btn btn-primary" onClick={() => startCamera()} disabled={cameraBusy || !connected}>
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
                  Ce navigateur ne peut pas filmer en direct : il faut une page ouverte en HTTPS (ou sur localhost)
                  et l’autorisation d’utiliser la caméra. Vous pouvez aussi activer la caméra directement depuis le PC
                  du statisticien.
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
            <span className="dv-fullpage-sub">{team1} — {team2}</span>
            <span className="dv-fullpage-meta">
              {reportSets.length === 0 ? 'Tous les sets' : `Set ${reportSets.join(', ')}`} · Sets{' '}
              {matchState.setsWon.team1}–{matchState.setsWon.team2} · {matchReport.actionCount} action(s) codée(s)
            </span>
          </div>
          <div className="dv-fullpage-actions" style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exportDvwFile}
              title="Exporter le match au format DataVolley (.dvw)"
            >
              <FileDown size={13} /> .DVW
            </button>
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
            canStartLocal={!isViewer}
            localActive={localCapturing}
            cameraBusy={cameraBusy}
            onStartLocal={startCamera}
            onStopLocal={stopCamera}
            onSeekRelative={handleCameraSeekRelative}
            onJumpToLive={handleCameraJumpToLive}
            onTogglePause={handleCameraTogglePause}
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
  const activeOverlayAction = actions.length ? actions[actions.length - 1] : null;
  const directionTeam = directionTarget?.team === 'away' ? team2 : team1;
  const directionOpponent = directionTarget?.team === 'away' ? team1 : team2;

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

  const liveVideoOverlay = (
    <VideoTvOverlay
      showScoreboard={showTvOverlay}
      team1={team1}
      team2={team2}
      score={boardState.score}
      setsWon={boardState.setsWon}
      currentSet={boardState.currentSet}
      server={boardState.server}
      homeSetterPos={boardState.homeSetterPos}
      awaySetterPos={boardState.awaySetterPos}
      activeAction={activeOverlayAction}
      calibrationMode={calibMode}
      corners={courtCorners}
      onSaveCorners={(pts) => {
        saveCourtCalibration(calibStorageKey, pts);
        setCourtCorners(pts);
        setCalibMode(pts && pts.length === 4 ? 'active' : false);
      }}
      onZoneDetected={handleZoneFromVideoClick}
      onCloseCalibration={() =>
        setCalibMode(courtCorners && courtCorners.length === 4 ? 'active' : false)
      }
      onStartCalibration={() => setCalibMode('calibrating')}
    />
  );

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
              <House size={12} /> {team1} &nbsp;·&nbsp; <Plane size={12} /> {team2}
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
          {!isViewer && (
            <button
              type="button"
              className={`btn btn-sm ${showCommand ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowCommand((v) => !v)}
              title="Fenêtre de commandes rapides DataVolley : Temps mort, Remplacement, Sanction (Ctrl+Shift+C)"
            >
              <ArrowDownUp size={14} /> Commandes
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={exportDvwFile}
            title="Exporter le match en direct au format DataVolley (.dvw)"
          >
            <FileDown size={14} /> .DVW
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
            onApplyDvLayout={applyDvLayout}
            profiles={panelProfiles}
            onSaveProfile={saveLayoutProfile}
            onApplyProfile={applyLayoutProfile}
            onDeleteProfile={deleteLayoutProfile}
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
          {isOwner && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={finalizeRecording}
                disabled={finalizing}
                title="Finaliser l'enregistrement du direct en une vidéo de replay ancrée (les actions, six et événements seront liés à la vidéo)"
              >
                <Save size={13} /> {finalizing ? 'Finalisation…' : 'Finaliser'}
              </button>
              {replayVideoId && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/datavolley/${replayVideoId}`)}
                  title="Ouvrir la vidéo de replay finalisée dans Data Volley (codage, séquences, rapports)"
                >
                  <ArrowRight size={13} /> Data Volley
                </button>
              )}
            </>
          )}
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
          {tab === 'codage' ? (
            <>
              {flash && (
                <div className={`dv-flash ${flash.ok ? 'ok' : 'err'}`} style={{ margin: '6px 12px 0' }}>
                  {flash.text}
                </div>
              )}
              <div className="dv-canvas" ref={setCanvasEl} style={{ minHeight: canvasHeight, minWidth: canvasWidth ? `${canvasWidth}px` : undefined }}>
                {/* Vidéo — ancre : déplaçable et redimensionnable, jamais fermée (identique à DataVolleyDashboard). */}
                {isOpen('video') && (
                  <FloatingPanel
                    id="video"
                    title="Vidéo"
                    icon={MonitorPlay}
                    className="panel-video"
                    rect={rect('video')}
                    onRectChange={(patch) => setRect('video', patch)}
                    active={activePanelId === 'video'}
                    onFocus={setActivePanelId}
                    size={canvasSize}
                    closable={false}
                    headerExtra={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              className={`btn btn-xs ${showTvOverlay ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowTvOverlay((v) => !v);
                              }}
                              title="Afficher / masquer le bandeau TV Score + Rotations"
                              style={{ padding: '2px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Tv size={11} /> TV
                            </button>
                            <button
                              type="button"
                              className={`btn btn-xs ${calibMode === 'calibrating' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (calibMode === 'calibrating') {
                                  setCalibMode(courtCorners?.length === 4 ? 'active' : false);
                                } else {
                                  setCalibMode('calibrating');
                                }
                              }}
                              title={calibMode === 'calibrating' ? 'Annuler la calibration' : 'Calibrer les 4 coins du terrain sur la vidéo pour cliquer les zones'}
                              style={{ padding: '2px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Crosshair size={11} />
                              {calibMode === 'calibrating' ? 'Annuler coins' : '4 coins'}
                            </button>
                          </div>
                        }
                      >
                        <LiveCameraPanel
                          bindVideo={bindCameraVideo}
                          active={camera.active}
                          delay={camera.delay}
                          canChangeDelay={isOwner}
                          onDelayChange={changeCameraDelay}
                          canStartLocal={!isViewer}
                          localActive={localCapturing}
                          cameraBusy={cameraBusy}
                          onStartLocal={startCamera}
                          onStopLocal={stopCamera}
                          onSeekRelative={handleCameraSeekRelative}
                          onJumpToLive={handleCameraJumpToLive}
                          onTogglePause={handleCameraTogglePause}
                          overlaySlot={liveVideoOverlay}
                          message={cameraMsg}
                          extra={camera.active ? <span className="live-camera-lat">lecture {cameraLatency} s</span> : null}
                        />
                      </FloatingPanel>
                    )}

                    {/* Zone de code — ancre : déplaçable et redimensionnable, jamais fermée. */}
                    {isOpen('console') && (
                      <FloatingPanel
                        id="console"
                        title="Zone de code"
                        icon={Keyboard}
                        rect={rect('console')}
                        onRectChange={(patch) => setRect('console', patch)}
                        active={activePanelId === 'console'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                        closable={false}
                      >
                        {isViewer ? (
                          <p className="dv-hint">Mode consultation : vous n'êtes pas autorisé à coder.</p>
                        ) : (
                          <CodingConsole
                            commitLabel={`Terminer le point ${session?.current_point ?? 1} (${bufferChunks.length} bloc(s))`}
                            buffer={buffer}
                            onChangeBuffer={(nextVal) => {
                              bufferRef.current = nextVal;
                              setBuffer(nextVal);
                            }}
                            hint={
                              <p className="dv-hint">
                                Tapez librement puis Entrée (<code>[</code> point {team1}, <code>]</code> point {team2},{' '}
                                <code>Ctrl+A</code> annuler fin, <code>Ctrl+Shift+C</code> commandes, <code>Alt+1..0</code> macros).
                                Les blocs en <span style={{ color: '#4ea1ff' }}>bleu</span> sont hors assignation, ceux en{' '}
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

                    {/* Fenêtre « Score & rotation » façon DataVolley 4 */}
                    {isOpen('score') && (
                      <FloatingPanel
                        id="score"
                        title="Score &amp; rotation"
                        icon={Trophy}
                        rect={rect('score')}
                        onRectChange={(patch) => setRect('score', patch)}
                        onClose={() => close('score')}
                        active={activePanelId === 'score'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                      >
                        <DvRotationWindow
                          state={{ ...boardState, setNumber: boardState.currentSet }}
                          team1={team1}
                          team2={team2}
                          homeConfig={homeConfig}
                          awayConfig={awayConfig}
                          events={events}
                          setsWon1={boardState.setsWon?.team1 || 0}
                          setsWon2={boardState.setsWon?.team2 || 0}
                        />
                        {!isViewer && (
                          <div className="dv-match-events">
                            {['home', 'away'].map((teamKey) => {
                              const label = teamKey === 'away' ? team2 : team1;
                              const count = timeoutCount(teamKey);
                              return (
                                <button
                                  key={teamKey}
                                  type="button"
                                  className={`btn btn-secondary btn-sm${count >= 2 ? ' over-limit' : ''}`}
                                  onClick={() => addTimeout(teamKey)}
                                  title={`Temps mort ${label} au score en cours (${count}/2 ce set)`}
                                >
                                  <Clock size={13} /> Temps mort · {label} ({count}/2)
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSubTeam('home');
                                setSubOut('');
                                setSubIn('');
                                setShowSub(true);
                              }}
                              title="Enregistrer un remplacement (entrant / sortant)"
                            >
                              <ArrowDownUp size={13} /> Remplacement
                            </button>
                            <span className="dv-hint">
                              Set {matchState.currentSet} : {substitutionCount} remplacement(s)
                            </span>
                          </div>
                        )}
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
                        active={activePanelId === 'court'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                      >
                        <MatchBoard
                          state={boardState}
                          team1={team1}
                          team2={team2}
                          homeConfig={homeConfig}
                          awayConfig={awayConfig}
                          showScore={false}
                          showCourt
                          activeTeam={bufferPlayer.team}
                          activeNumber={bufferPlayer.number}
                        />
                      </FloatingPanel>
                    )}

                    {/* Fenêtre « positions » : rotation rapide (+1 / -1) et position du passeur */}
                    {isOpen('positions') && (
                      <FloatingPanel
                        id="positions"
                        title="Positions"
                        icon={Users}
                        rect={rect('positions')}
                        onRectChange={(patch) => setRect('positions', patch)}
                        onClose={() => close('positions')}
                        active={activePanelId === 'positions'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <RotationBadge label={team1} pos={matchState.homeSetterPos} onRotate={(d) => rotateTeam('home', d)} />
                          <RotationBadge label={team2} pos={matchState.awaySetterPos} onRotate={(d) => rotateTeam('away', d)} />
                        </div>
                        <SetterRow label={team1} serving={matchState.server === 'team1'} pos={matchState.homeSetterPos} onChange={(p) => setSetterPos('home', p)} />
                        <SetterRow label={team2} serving={matchState.server === 'team2'} pos={matchState.awaySetterPos} onChange={(p) => setSetterPos('away', p)} />
                      </FloatingPanel>
                    )}

                    {/* Fenêtre « direction d'attaque » — clic départ, clic arrivée */}
                    {isOpen('direction') && (
                      <FloatingPanel
                        id="direction"
                        title="Direction d’attaque"
                        icon={Target}
                        rect={rect('direction')}
                        onRectChange={(patch) => setRect('direction', patch)}
                        onClose={() => close('direction')}
                        active={activePanelId === 'direction'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                      >
                        {directionTarget ? (
                          <>
                            <div className="dvc-direction-head">
                              <code>{directionTarget.code}</code> · set {setOfAction(directionTarget) ?? '—'} ·{' '}
                              {elapsed(directionTarget)}
                            </div>
                            <label className="adc-picker">
                              <span>Attaque</span>
                              <select
                                value={directionTarget.id || ''}
                                onChange={(e) => setDirectionId(e.target.value ? Number(e.target.value) : null)}
                              >
                                {!attackOptions.some((a) => a.id === directionTarget.id) && (
                                  <option value={directionTarget.id}>{directionTarget.code}</option>
                                )}
                                {attackOptions.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.code} · n°{String(a.player_number || 0).padStart(2, '0')} · {elapsed(a)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <AttackDirectionCourt
                              key={directionTarget.id}
                              side={directionTarget.team === 'away' ? 'away' : 'home'}
                              startZone={directionTarget.start_zone}
                              endZone={directionTarget.end_zone}
                              startSubzone={directionTarget.start_subzone}
                              endSubzone={directionTarget.end_subzone}
                              startX={directionTarget.start_x}
                              startY={directionTarget.start_y}
                              midX={directionTarget.mid_x}
                              midY={directionTarget.mid_y}
                              endX={directionTarget.end_x}
                              endY={directionTarget.end_y}
                              history={directionHistory}
                              playerLabel={`n°${String(directionTarget.player_number || 0).padStart(2, '0')}`}
                              teamName={directionTeam}
                              opponentName={directionOpponent}
                              disabled={isViewer}
                              onChange={(payload) => setDirection(directionTarget, payload.start, payload.end, payload)}
                            />
                          </>
                        ) : (
                          <p className="dv-hint">
                            Codez d’abord une attaque (<code>A</code>) : sa direction se trace ici, d’un clic de départ puis
                            d’un clic d’arrivée.
                          </p>
                        )}
                      </FloatingPanel>
                    )}

                    {/* Fenêtre « actions codées » avec contrôle de cohérence & double-clic d'édition */}
                    {isOpen('actions') && (
                      <FloatingPanel
                        id="actions"
                        title={`Actions codées (${actions.length})`}
                        icon={ListChecks}
                        rect={rect('actions')}
                        onRectChange={(patch) => setRect('actions', patch)}
                        onClose={() => close('actions')}
                        active={activePanelId === 'actions'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                      >
                        <DvCodeList
                          rallies={rallies}
                          mode="saisie"
                          matchState={matchState}
                          issues={issues}
                          actionSet={setOfAction}
                          autoScroll
                          directionMissing={attacksWithoutDirection(actions).length}
                          onDirectionMissing={goToAttackWithoutDirection}
                          onSeek={(a) => setZoneActionId(a.id)}
                          onEditCode={!isViewer ? editActionCode : undefined}
                        />
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
                        active={activePanelId === 'shortcuts'}
                        onFocus={setActivePanelId}
                        size={canvasSize}
                      >
                        <VideoShortcuts coding video />
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
                        active={activePanelId === 'aide'}
                        onFocus={setActivePanelId}
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
                        active={activePanelId === 'keypad'}
                        onFocus={setActivePanelId}
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
            </>
          ) : (
            <div className="dv-live-body">
              {flash && (
                <div className={`dv-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>
              )}
              <AnimatePresence mode="wait">
                {tab === 'banc' && (
                  <motion.div key="banc" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                    <LiveCoachTablet
                      team1={team1}
                      team2={team2}
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
                          canStartLocal={!isViewer}
                          localActive={localCapturing}
                          cameraBusy={cameraBusy}
                          onStartLocal={startCamera}
                          onStopLocal={stopCamera}
                          onSeekRelative={handleCameraSeekRelative}
                          onJumpToLive={handleCameraJumpToLive}
                          onTogglePause={handleCameraTogglePause}
                          message={cameraMsg}
                          extra={camera.active ? <span className="live-camera-lat">lecture {cameraLatency} s</span> : null}
                        />
                      }
                    />
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
                                onKeyDown={sequenceKeyHandler}
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
                            onKeyDown={sequenceKeyHandler}
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
                      <button type="button" className={`btn-choice ${distTeam === 'home' ? 'active team1' : ''}`} onClick={() => setDistTeam('home')}><House size={13} /> {team1}</button>
                      <button type="button" className={`btn-choice ${distTeam === 'away' ? 'active team2' : ''}`} onClick={() => setDistTeam('away')}><Plane size={13} /> {team2}</button>
                    </div>
                  </div>
                  <div className="dv-stat-team">
                    <h5>{distTeam === 'home' ? team1 : team2}{distPos !== 'Total' ? ` — passeur en ${distPos}` : ''}</h5>
                    <DistributionCourt distribution={setterDist[distTeam]?.[distPos]} />
                  </div>
                </motion.div>
              )}
              {tab === 'parametres' && (
                <motion.div key="parametres" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                  <h4><Settings size={14} /> Paramètres</h4>

                  <h5 style={{ marginTop: 12 }}>Disposition de l’écran de saisie</h5>
                  <p className="dv-hint">
                    <strong>Disposition DataVolley</strong> range les fenêtres comme le logiciel de référence :
                    vidéo en haut à gauche, score et terrain en dessous, zone de code en bas, liste des codes à
                    droite. <strong>Disposition libre</strong> laisse tout en place pour organiser l’écran à votre
                    façon (chaque fenêtre se déplace par sa barre de titre et se redimensionne par ses bords). Les
                    profils de disposition enregistrés dans le menu <strong>Fenêtres</strong> sont partagés entre le
                    mode DataVolley et le mode en direct.
                  </p>
                  <div className="dv-panels-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={applyDvLayout}>
                      <Grid3x3 size={13} /> Disposition DataVolley
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={applyFreeLayout}>
                      Disposition libre
                    </button>
                  </div>

                  <h5 style={{ marginTop: 12 }}>Raccourcis clavier</h5>
                  <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts} video />

                  <h5 style={{ marginTop: 20 }}>Fenêtres de codage</h5>
                  <p className="dv-hint">
                    Chaque fenêtre se déplace par sa barre de titre, se redimensionne par ses bords (droit, bas, coin) et
                    se ferme par sa croix — sauf la <strong>vidéo</strong> et la <strong>zone de code</strong>, qui restent
                    toujours affichées. La disposition est mémorisée sur cet appareil.
                  </p>
                  <div className="dv-panels-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMany(['score', 'court', 'positions', 'actions', 'direction', 'shortcuts', 'aide', 'keypad'], true)}>
                      Tout afficher
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMany(['score', 'court', 'positions', 'actions', 'direction', 'shortcuts', 'aide', 'keypad'], false)}>
                      Tout masquer
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={resetPanels}>
                      <RotateCcw size={13} /> Réinitialiser la disposition
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
          )}
        </div>
      </div>

      {/* Fenêtre de commandes DataVolley (Ctrl+Shift+C) : temps morts, remplacements, sanctions, code libre */}
      <AnimatePresence>
        {showCommand && (
          <DvCommandWindow
            open={showCommand}
            onClose={() => setShowCommand(false)}
            onSubmit={submitCommand}
            team1={team1}
            team2={team2}
            disabled={isViewer}
          />
        )}
      </AnimatePresence>

      {/* Modale Remplacement : joueur sortant → joueur entrant */}
      <AnimatePresence>
        {showSub && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowSub(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal dv-sub-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
            >
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowDownUp size={18} /> Remplacement
              </h2>
              <p className="dv-hint">
                Enregistré au point en cours du set {matchState.currentSet} ({matchState.score.team1}-{matchState.score.team2}) :
                le joueur entrant prend le poste du sortant pour la suite du set. Le libéro entre automatiquement à
                l’arrière : aucun remplacement à saisir pour lui.
              </p>

              <div className="form-group">
                <label>Équipe</label>
                <select
                  value={subTeam}
                  onChange={(event) => {
                    setSubTeam(event.target.value);
                    setSubOut('');
                    setSubIn('');
                  }}
                >
                  <option value="home">{team1}</option>
                  <option value="away">{team2}</option>
                </select>
              </div>

              <div className="form-group">
                <label>Joueur sortant (sur le terrain)</label>
                <select value={subOut} onChange={(event) => setSubOut(event.target.value)}>
                  <option value="">— choisir —</option>
                  {onCourtPlayers(subTeam).map((p) => (
                    <option key={p.number} value={p.number}>
                      n°{p.number}
                      {p.name ? ` — ${p.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Joueur entrant (remplaçant)</label>
                <select value={subIn} onChange={(event) => setSubIn(event.target.value)}>
                  <option value="">— choisir —</option>
                  {benchPlayers(subTeam).map((p) => (
                    <option key={p.number} value={p.number}>
                      n°{p.number}
                      {p.name ? ` — ${p.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {benchPlayers(subTeam).length === 0 && (
                <p className="dv-hint">
                  Aucun remplaçant disponible : complétez l’effectif et le six de départ dans « Six &amp; rôles ».
                </p>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                <button className="btn btn-primary" onClick={confirmSubstitution} disabled={savingEvent}>
                  {savingEvent ? 'Enregistrement…' : 'Enregistrer le remplacement'}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSub(false)}>
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <button type="button" className={`btn-choice ${editFirstServer === 'team1' ? 'active team1' : ''}`} onClick={() => setEditFirstServer('team1')}>{team1}</button>
                  <button type="button" className={`btn-choice ${editFirstServer === 'team2' ? 'active team2' : ''}`} onClick={() => setEditFirstServer('team2')}>{team2}</button>
                </div>
              </div>

              <SetterPositionPicker title={team1} value={editHomeSetterPos} onChange={(p) => setEditHomeSetterPos(p)} />
              <SetterPositionPicker title={team2} value={editAwaySetterPos} onChange={(p) => setEditAwaySetterPos(p)} />

              <LineupEditor
                title={team1}
                lineup={editHomeLineup || emptyLineup()}
                config={editHomeConfig}
                onLineupChange={setEditHomeLineup}
                onConfigChange={setEditHomeConfig}
              />
              <LineupEditor
                title={team2}
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
