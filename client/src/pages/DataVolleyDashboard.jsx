import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { videosAPI, datavolleyAPI } from '../services/api';
import useCollectionChanged from '../hooks/useCollectionChanged';
import { computeMatchState, rotateSetterPos, emptyLineup, COURT_POSITIONS } from '../utils/rotation';
import { computeSetterDistributionByRotation, attackZoneOf, normalizeAttackZone } from '../utils/distribution';
import { emptyTeamConfig, parseSavedLineup, serializeSavedLineup, serverPrefill } from '../utils/lineup';
import { computeMatchReport, indexActionSets, indexActionLineups, reportToRows } from '../utils/matchReport';
import { computeScouting, tacticToRows } from '../utils/scouting';
import { downloadTextFile, rowsToCsv } from '../utils/download';
import { buildDvw, parseDvw } from '../utils/dvw';
import { generateDemoActions } from '../utils/demo';
import MatchBoard from '../components/MatchBoard';
import VideoShortcuts from '../components/VideoShortcuts';
import CodingConsole from '../components/CodingConsole';
import DvModeBar from '../components/DvModeBar';
import DvCodeList from '../components/DvCodeList';
import DvFilterPanel from '../components/DvFilterPanel';
import DvConsultationPane from '../components/DvConsultationPane';
import DvCorrectionPane from '../components/DvCorrectionPane';
import { DvAnalysisMenu, DvDrillDown } from '../components/DvAnalysisPane';
import DvCommandWindow from '../components/DvCommandWindow';
import DvRotationWindow from '../components/DvRotationWindow';
import FloatingPanel from '../components/FloatingPanel';
import PanelsMenu from '../components/PanelsMenu';
import ShortcutSettings from '../components/ShortcutSettings';
import SetClaimsBar from '../components/SetClaimsBar';
import usePanelLayout from '../hooks/usePanelLayout';
import { PANEL_GAP } from '../utils/panelLayout';
import {
  loadPanelProfiles,
  removePanelProfile,
  savePanelProfile,
  storePanelProfiles,
} from '../utils/panelProfiles';
import { loadShortcuts, matchesShortcut, saveShortcuts, stepSpeed } from '../utils/shortcuts';
import MatchReportFull, { REPORT_TABS } from '../components/MatchReportFull';
import AttackDirectionCourt from '../components/AttackDirectionCourt';
import LineupEditor from '../components/LineupEditor';
import PointTimeline from '../components/PointTimeline';
import { DvKeyPad, DvSyntaxHelp } from '../components/DvKeypad';
import { AttackCourtPicker, DistributionCourt } from '../components/AttackCourt';
import { buildTimelineEvents, buildTimelinePoints } from '../utils/matchTimeline';
import {
  AlertTriangle,
  ArrowDownUp,
  ChartColumn,
  Check,
  ChevronLeft,
  CircleHelp,
  Clock,
  Crosshair,
  Dices,
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
  Table,
  Target,
  Trash,
  Trophy,
  Upload,
  Users,
  Volleyball,
  X,
} from '../components/icons';
import {
  EMPTY_FILTERS,
  applyDirection,
  attacksWithoutDirection,
  codeIssues,
  firstServeAnchor,
  hasUsableSegments,
  moveAction,
  commandToEvent,
  pointIndexAt,
  removeAction,
  rotationAt,
  rotationByAction,
  searchCodes,
  setActionTimecode,
  shiftTimecode,
  situationByAction,
  stepPoint,
  updateActionCode,
} from '../utils/codingTools';
import {
  DV_ACTIONS,
  DV_EVAL_KEYS,
  DV_ZONE_KEYS,
  appendSequence,
  buildPointSegments,
  completeBufferAfterTyping,
  decomposeCode,
  describeCode,
  ensureUids,
  formatCode,
  formatTimecode,
  groupActionsIntoRallies,
  isTerminalEvaluation,
  itemTimecodes,
  learnActionTypes,
  makeActions,
  nextBlockTimes,
  parseSequence,
  predictNextAction,
  prefillWithLearnedType,
  reindexActions,
  replaceRallySequence,
  tryAppendChar,
  validateAction,
} from '../utils/datavolley';

const tabVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15 } },
};

/** Retire les espaces d'une saisie libre de codes DataVolley (« *02S a10A » ≡ « *02Sa10A »). */
const stripSpaces = (s) => String(s || '').replace(/\s+/g, '');

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

function DataVolleyDashboard({ user, onLogout }) {
  const { id } = useParams();
  const navigate = useNavigate();

  // Clé de mémorisation du Mode Aide (par navigateur et par vidéo).
  const helpStorageKey = `dv.layout.aide.video.${id}`;
  // Clé du Mode Consultation (sans évaluation), persistée par navigateur et par vidéo.
  const lightStorageKey = `dv.light.video.${id}`;

  const videoRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actions, setActions] = useState([]);
  const [sync, setSync] = useState({
    sync_offset: 0,
    anchor_action_id: null,
    anchor_timecode: null,
    anchor_system_time: null,
    lead_in: 4,
    lead_out: 3,
  });

  // Modes de travail (organisation DataVolley) : Saisie, Consultation,
  // Correction, Analyse — plus les Paramètres, ouverts à part.
  const [mode, setMode] = useState('saisie');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Fenêtre d'analyse affichée dans le mode Analyse, et son affichage plein écran.
  const [tab, setTab] = useState('synthese');
  const [reportFullScreen, setReportFullScreen] = useState(false);
  // Consultation : filtres du déroulé, point lu et état de lecture.
  const [consultFilters, setConsultFilters] = useState(EMPTY_FILTERS);
  const [consultIndex, setConsultIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  // Correction : action sélectionnée dans la liste (outils de temps).
  const [correctUid, setCorrectUid] = useState(null);
  // Attaque choisie dans la fenêtre « Direction d'attaque » (null = la dernière).
  const [directionUid, setDirectionUid] = useState(null);
  const [showCommand, setShowCommand] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Édition de la séquence complète d'un point
  const [editingRallyUid, setEditingRallyUid] = useState(null); // uid de la 1re action du point, ou 'NEW'
  const [editingSequence, setEditingSequence] = useState('');

  // Synchronisation (ancrage / offset)
  const [showSync, setShowSync] = useState(false);

  // État du match (en cours / terminé)
  const [match, setMatch] = useState({ status: 'coding', finished_at: null });

  // Positions de départ par set + premier serveur + passeur
  const [setups, setSetups] = useState({});
  // Événements de match : temps morts et remplacements (frise chronologique)
  const [events, setEvents] = useState([]);
  const [showSub, setShowSub] = useState(false);
  const [subTeam, setSubTeam] = useState('home');
  const [subOut, setSubOut] = useState('');
  const [subIn, setSubIn] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
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

  // Correction manuelle d'une zone (action choisie dans la liste des séquences)
  const [zoneActionUid, setZoneActionUid] = useState(null);

  // Mode Aide : disposition pédagogique (barre latérale avec les aides du statisticien)
  // persisté par navigateur et par vidéo.
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

  // Mode Consultation : annotation sans évaluation (qualité) — sert à découper le
  // match (services + dernières actions) pour préparer un plan de jeu adverse.
  const [lightMode, setLightMode] = useState(() => {
    try {
      return localStorage.getItem(lightStorageKey) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(lightStorageKey, lightMode ? '1' : '0');
    } catch {
      // Stockage indisponible : le mode reste local à la session.
    }
  }, [lightMode, lightStorageKey]);

  // Options de parsing selon le mode : en consultation, l'évaluation est
  // facultative et les points se découpent uniquement par service.
  const codeOpts = useMemo(() => ({ evaluationOptional: lightMode }), [lightMode]);
  const rallyOpts = useMemo(() => ({ byService: lightMode }), [lightMode]);

  // Bilan de match : sets sélectionnés (liste vide = tous les sets)
  const [reportSets, setReportSets] = useState([]);

  // Attribution de sets (codage collaboratif, partagée via Supabase).
  const [claims, setClaims] = useState([]);
  const showFlash = useCallback((ok, text) => {
    setFlash({ ok, text });
    window.setTimeout(() => setFlash((f) => (f && f.text === text ? null : f)), 4000);
  }, []);
  const loadClaims = useCallback(async () => {
    try {
      const res = await datavolleyAPI.getClaims(id);
      setClaims(res.data?.claims || []);
    } catch (err) {
      console.warn('Impossible de charger les attributions de sets :', err?.message);
    }
  }, [id]);

  // Une revendication/libération faite sur un autre poste recharge la barre.
  useCollectionChanged('claims', loadClaims);
  const handleClaim = useCallback(
    async (setNumber) => {
      try {
        const res = await datavolleyAPI.claimSet(id, setNumber);
        setClaims((prev) => [...prev.filter((c) => Number(c.set_number) !== setNumber), res.data.claim]);
      } catch (err) {
        showFlash(false, err.response?.data?.error || 'Impossible de revendiquer ce set');
      }
    },
    [id, showFlash]
  );
  const handleRelease = useCallback(
    async (setNumber) => {
      try {
        await datavolleyAPI.releaseSet(id, setNumber);
        setClaims((prev) => prev.filter((c) => Number(c.set_number) !== setNumber));
      } catch (err) {
        showFlash(false, err.response?.data?.error || 'Impossible de libérer ce set');
      }
    },
    [id, showFlash]
  );
  // Set revendiqué par le statisticien courant (null = pas de revendication,
  // codage classique sur tout le match).
  const myClaimedSet = useMemo(() => {
    const mine = claims.find((c) => !c.deleted && c.claimed_by_email === user?.email);
    return mine ? Number(mine.set_number) : null;
  }, [claims, user]);

  // Confort de saisie : pré-remplissage du serveur
  const [autoServe, setAutoServe] = useState(true);
  const bufferRef = useRef('');
  // Timecodes par bloc de saisie : chaque code garde le temps vidéo de l'instant
  // où il a été terminé (comme DataVolley 4), même si la suite est validée d'un coup.
  const blockTimesRef = useRef([]);
  const blockTimeBufferRef = useRef('');

  // Raccourcis clavier personnalisables (onglet Paramètres) + vitesse de lecture.
  const shortcutsKey = useMemo(() => `dv.shortcuts.video.${id}`, [id]);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(`dv.shortcuts.video.${id}`));
  const [playbackRate, setPlaybackRate] = useState(1);

  // Fenêtres de la page de codage : déplaçables, redimensionnables, fermables.
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const panelsKey = useMemo(() => `dv.panels.video.${id}`, [id]);
  const { layout, setRect, toggle: togglePanelById, open: openPanelById, close, setMany, reset: resetPanels, applyProfile: applyPanelsLayout, minHeight, minWidth } = usePanelLayout(panelsKey, canvasSize);
  const rect = useCallback((pid) => layout[pid] || { x: 0, y: 0, w: 300, h: 200 }, [layout]);
  const isOpen = useCallback((pid) => !!layout?.[pid]?.open, [layout]);

  // Profils de fenêtres : enregistrés sur le poste, réutilisables sur tous les matchs.
  const [panelProfiles, setPanelProfiles] = useState(() => loadPanelProfiles());
  useEffect(() => {
    setPanelProfiles(loadPanelProfiles());
  }, [id]);

  const actionsRef = useRef([]);
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);
  const flashTimer = useRef(null);
  const rotSaveTimer = useRef(null);

  // Position de lecture mémorisée : le <video> est démonté quand on change
  // d'onglet (Séquences, Rapport…). En revenant sur « Codage », on reprend au
  // même timecode au lieu de repartir de zéro (voir onLoadedMetadata plus bas).
  const resumeTimeRef = useRef(0);
  const wasPlayingRef = useRef(false);

  useEffect(() => { bufferRef.current = buffer; }, [buffer]);

  // Horodatage par code : on relève la position vidéo à chaque fois qu'un bloc
  // du tampon est terminé (ou modifié), pas seulement à la validation.
  useEffect(() => {
    const normalized = stripSpaces(buffer);
    const now = videoRef.current ? videoRef.current.currentTime : null;
    blockTimesRef.current = nextBlockTimes(blockTimesRef.current, blockTimeBufferRef.current, normalized, now);
    blockTimeBufferRef.current = normalized;
  }, [buffer]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  // Les raccourcis sont enregistrés sur l'appareil (onglet Paramètres).
  useEffect(() => { saveShortcuts(shortcutsKey, shortcuts); }, [shortcutsKey, shortcuts]);

  // Mesure du canevas : la ref est un « callback ref », donc la mesure se
  // déclenche dès que le canevas est monté (et non au premier rendu, qui affiche
  // encore l'écran de chargement : c'est ce qui laissait une taille 0x0 et
  // bloquait les fenêtres en haut à gauche).
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

  // La vitesse choisie est appliquée à la vidéo dès qu'elle est disponible.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try { v.playbackRate = playbackRate; } catch { /* vitesse non supportée */ }
  }, [playbackRate, video, tab]);

  // Les boutons cliqués ne gardent pas le focus : l'espace et les flèches
  // restent au lecteur vidéo (cf. point « auto-focus »).
  useEffect(() => {
    const onPointerUp = () => {
      const el = document.activeElement;
      if (el && el.tagName === 'BUTTON') el.blur();
    };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, []);

  const team1 = video?.team1_name || 'Domicile';
  const team2 = video?.team2_name || 'Extérieur';
  const teamLabel = (t) => (t === 'home' ? team1 : team2);

  const matchFinished = match?.status === 'finished';

  const videoUrl = video ? videosAPI.getFileUrl(video.filename) : null;
  const proxyFilename = video?.filepath_proxy ? video.filepath_proxy.split(/[\\/]/).pop() : null;
  const proxyUrl = proxyFilename ? videosAPI.getProxyUrl(proxyFilename) : null;
  const playbackUrl = proxyUrl || videoUrl;

  // Nouvelle vidéo (premier chargement ou changement de match) : la position
  // mémorisée ne vaut que pour la vidéo en cours, on repart donc du début.
  // Un simple changement d'onglet ne touche pas `playbackUrl` : la position est
  // conservée.
  useEffect(() => {
    resumeTimeRef.current = 0;
    wasPlayingRef.current = false;
    setCurrentTime(0);
  }, [playbackUrl]);

  // --- Actions vidéo (raccourcis ou boutons) -------------------------------
  const videoAction = useCallback((action) => {
    const v = videoRef.current;
    if (!v) return;
    if (action === 'pause') {
      if (v.paused) v.play().catch(() => {}); else v.pause();
      return;
    }
    if (action === 'seekBack') {
      const target = Math.max(0, v.currentTime - 5);
      v.currentTime = target;
      resumeTimeRef.current = target;
      return;
    }
    if (action === 'seekForward') {
      const target = v.currentTime + 5;
      const clamped = Number.isFinite(v.duration) ? Math.min(v.duration, target) : target;
      v.currentTime = clamped;
      resumeTimeRef.current = clamped;
      return;
    }
    if (action === 'speedDown') { setPlaybackRate((r) => stepSpeed(r, -1)); return; }
    if (action === 'speedUp') { setPlaybackRate((r) => stepSpeed(r, 1)); return; }
    if (action === 'speedReset') setPlaybackRate(1);
  }, []);

  // Joueur correspondant au bloc en cours de frappe → mis en avant sur le terrain.
  const bufferPlayer = useMemo(() => {
    const chunks = parseSequence(stripSpaces(buffer), codeOpts);
    const last = chunks[chunks.length - 1];
    if (!last) return { team: null, number: null };
    const parts = decomposeCode(last.code);
    const num = Number(parts.player_number);
    if (!num) return { team: null, number: null };
    const team = parts.team === 'away' ? 'away' : parts.team === 'home' ? 'home' : null;
    return { team, number: num };
  }, [buffer, codeOpts]);

  // Hauteur du canevas : au moins la place nécessaire aux fenêtres ouvertes.
  const canvasHeight = Math.max(minHeight, canvasSize.height || 0);
  // Largeur : les fenêtres poussées à droite agrandissent l'espace de travail.
  const canvasWidth = Math.max(minWidth, canvasSize.width || 0);

  // Persiste les positions après correction manuelle (débounce 600 ms).
  const persistSetups = (updated) => {
    setSetups(updated);
    if (rotSaveTimer.current) clearTimeout(rotSaveTimer.current);
    rotSaveTimer.current = setTimeout(() => {
      datavolleyAPI.saveSetups(id, updated).catch(() => {});
    }, 600);
  };

  // Rotation manuelle : tourne la position de départ du passeur du set en cours.
  const rotateTeam = (team, dir) => {
    const setNum = String(matchState.currentSet);
    const key = team === 'home' ? 'home_setter_pos' : 'away_setter_pos';
    const s = setups[setNum] || {};
    persistSetups({ ...setups, [setNum]: { ...s, [key]: rotateSetterPos(s[key] || null, dir) } });
  };

  // Fixe directement la position de départ du passeur du set en cours.
  const setSetterPos = (team, pos) => {
    const setNum = String(matchState.currentSet);
    const key = team === 'home' ? 'home_setter_pos' : 'away_setter_pos';
    const s = setups[setNum] || {};
    persistSetups({ ...setups, [setNum]: { ...s, [key]: pos } });
  };

  // Fenêtres secondaires (score, terrain, positions, actions, raccourcis) :
  // toutes ouvertes ? sert au raccourci « afficher / masquer les fenêtres ».
  const SECONDARY_PANELS = ['score', 'court', 'positions', 'actions', 'shortcuts'];
  const arePanelsVisible = SECONDARY_PANELS.every((pid) => isOpen(pid));

  /**
   * Disposition « DataVolley » de l'écran de saisie : vidéo en haut à gauche,
   * score et terrain en dessous, zone de code en bas, liste des codes à droite
   * sur toute la hauteur.
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

  // Mode Aide : ouvre les fenêtres pédagogiques (aide-mémoire + clavier virtuel).
  useEffect(() => { setMany(['aide', 'keypad'], modeAide); }, [modeAide, setMany]);

  const rallies = useMemo(() => groupActionsIntoRallies(actions, rallyOpts), [actions, rallyOpts]);
  // Segments des points (sans les temps morts) : sert à placer la vidéo au début
  // d'un point depuis la frise chronologique.
  const pointSegments = useMemo(
    () => buildPointSegments(rallies, { syncOffset: sync.sync_offset || 0, leadIn: sync.lead_in ?? 4, leadOut: sync.lead_out ?? 3 }),
    [rallies, sync]
  );

  // Les remplacements enregistrés modifient les six pendant le rejeu du match.
  const matchState = useMemo(() => computeMatchState(rallies, setups, {}, events), [rallies, setups, events]);

  // ---------------------------------------------------------------------------
  // MODES CONSULTATION / CORRECTION / ANALYSE
  // ---------------------------------------------------------------------------
  // Numéro de set de chaque action (toutes actions, notées ou non).
  const allSetMap = useMemo(() => indexActionSets(rallies, matchState), [rallies, matchState]);
  const setOfAction = useCallback(
    (a) => {
      if (!a) return null;
      const key = a.uid ?? a.id ?? a.action_index;
      return allSetMap.get(key) ?? a.set_number ?? null;
    },
    [allSetMap]
  );

  // Consultation : actions retenues par les filtres, puis points complets qui
  // les contiennent (on relit le point entier, pas seulement l'action filtrée).
  // Rotation au moment de l'action et situation de réception (3.1.0).
  const rotationMap = useMemo(() => rotationByAction(rallies, matchState), [rallies, matchState]);
  const situationMap = useMemo(() => situationByAction(actions), [actions]);

  // Fenêtre « Direction d'attaque » : elle trace la direction de l'attaque
  // choisie (par défaut la dernière codée) et rappelle en transparence les
  // attaques du même joueur.
  const lastAttack = useMemo(() => {
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      if (actions[i]?.action === 'A') return actions[i];
    }
    return null;
  }, [actions]);
  const attackOptions = useMemo(() => {
    const list = actions.filter((a) => a?.action === 'A').slice(-12).reverse();
    return list;
  }, [actions]);
  const directionTarget = useMemo(
    () => (directionUid ? actions.find((a) => a.uid === directionUid) || lastAttack : lastAttack),
    [actions, directionUid, lastAttack]
  );
  const directionHistory = useMemo(() => {
    if (!directionTarget) return [];
    return actions
      .filter(
        (a) =>
          a?.action === 'A' &&
          a.team === directionTarget.team &&
          Number(a.player_number) === Number(directionTarget.player_number) &&
          a.uid !== directionTarget.uid &&
          a.start_zone &&
          a.end_zone
      )
      .map((a) => ({ start: String(a.start_zone), end: String(a.end_zone) }));
  }, [actions, directionTarget]);
  const directionTeam = directionTarget?.team === 'away' ? team2 : team1;
  const directionOpponent = directionTarget?.team === 'away' ? team1 : team2;
  const consultMatched = useMemo(
    () =>
      searchCodes(actions, consultFilters, {
        setOf: setOfAction,
        rotationOf: (a) => rotationMap.get(a?.uid ?? a?.id ?? a?.action_index) ?? null,
        situationOf: (a) => situationMap.get(a?.uid ?? a?.id ?? a?.action_index) ?? null,
      }),
    [actions, consultFilters, setOfAction, rotationMap, situationMap]
  );
  const consultMatchedUids = useMemo(() => new Set(consultMatched.map((a) => a.uid)), [consultMatched]);
  const consultFiltered = useMemo(() => {
    const active = Object.keys(EMPTY_FILTERS).some(
      (k) => String(consultFilters[k] ?? '') !== String(EMPTY_FILTERS[k])
    );
    if (!active) return rallies;
    return rallies.filter((r) => (r.actions || []).some((a) => consultMatchedUids.has(a.uid)));
  }, [rallies, consultFilters, consultMatchedUids]);
  const consultSegments = useMemo(
    () =>
      buildPointSegments(consultFiltered, {
        syncOffset: sync.sync_offset || 0,
        leadIn: sync.lead_in ?? 4,
        leadOut: sync.lead_out ?? 3,
      }),
    [consultFiltered, sync]
  );
  const consultReady = hasUsableSegments(consultSegments);

  // Terrains affichés : état courant (Saisie) et état au point lu (Consultation).
  const liveRotation = useMemo(
    () => ({
      setNumber: matchState.currentSet,
      score: matchState.score,
      server: matchState.server,
      homeLineup: matchState.homeLineup,
      awayLineup: matchState.awayLineup,
      homeSetterPos: matchState.homeSetterPos,
      awaySetterPos: matchState.awaySetterPos,
    }),
    [matchState]
  );
  const consultRotation = useMemo(() => {
    if (consultIndex < 0) return liveRotation;
    return rotationAt(consultFiltered, matchState, consultIndex) || liveRotation;
  }, [consultIndex, consultFiltered, matchState, liveRotation]);

  // Choix proposés par les filtres (Consultation et Analyse).
  const filterOptions = useMemo(() => {
    const players = new Map();
    for (const a of actions) {
      if (a?.player_number == null) continue;
      const team = a.team === 'away' ? team2 : team1;
      const key = `${a.team}-${a.player_number}`;
      if (!players.has(key)) players.set(key, { value: String(a.player_number), label: `n°${a.player_number} — ${team}` });
    }
    const sets = [...new Set(actions.map((a) => setOfAction(a)).filter((s) => s != null))].sort((x, y) => x - y);
    return {
      players: [...players.values()],
      sets,
      zones: DV_ZONE_KEYS.map((z) => ({ value: z, label: `Zone ${z}` })),
      actions: DV_ACTIONS,
      evaluations: DV_EVAL_KEYS,
      rotation: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Rotation ${n}` })),
      situations: [
        { value: '+', label: '+ réception positive' },
        { value: '0', label: '0 réception neutre' },
        { value: '-', label: '− réception négative' },
      ],
    };
  }, [actions, setOfAction, team1, team2]);

  const hasConsultFilters = useMemo(
    () => Object.keys(EMPTY_FILTERS).some((k) => String(consultFilters[k] ?? '') !== String(EMPTY_FILTERS[k])),
    [consultFilters]
  );

  const patchConsultFilters = useCallback((patch) => setConsultFilters((prev) => ({ ...prev, ...patch })), []);

  // Actions « notées » (avec évaluation) : seules elles alimentent les stats,
  // le rapport et la distribution. Les actions sans notation (mode consultation)
  // restent visibles dans les séquences, mais sont exclues des
  // tableaux de statistiques.
  const statsActions = useMemo(() => actions.filter((a) => a && a.evaluation), [actions]);
  const statsRallies = useMemo(() => groupActionsIntoRallies(statsActions), [statsActions]);
  const statsMatchState = useMemo(() => computeMatchState(statsRallies, setups, {}, events), [statsRallies, setups, events]);

  // Frise chronologique : points joués (issue + set) et événements à marquer.
  const timelinePoints = useMemo(() => buildTimelinePoints(rallies, matchState), [rallies, matchState]);
  const timelineEvents = useMemo(() => buildTimelineEvents(events), [events]);

  // Six + fiches équipe du set en cours (rôles, libéro).
  const currentSetup = setups?.[String(matchState.currentSet)] || {};
  const savedHome = useMemo(() => parseSavedLineup(currentSetup.home_lineup), [currentSetup.home_lineup]);
  const savedAway = useMemo(() => parseSavedLineup(currentSetup.away_lineup), [currentSetup.away_lineup]);
  const homeConfig = savedHome.config;
  const awayConfig = savedAway.config;

  // Anomalies du codage (mode Correction) : le match doit être synchronisé pour
  // que l'absence de temps vidéo soit signalée. Calculé après les fiches équipe
  // (elles servent au contrôle des numéros de joueur).
  const issues = useMemo(
    () =>
      codeIssues(actions, {
        roster: {
          home: (homeConfig?.roster || []).map((p) => p.number),
          away: (awayConfig?.roster || []).map((p) => p.number),
        },
        requireTimecode: Number(sync.anchor_timecode || 0) > 0 || Number(sync.sync_offset || 0) !== 0,
        // Contrôles enrichis 3.1.0 : six, serveur attendu, remplacements,
        // directions, fin de set — tous des avertissements.
        enriched: true,
        matchState,
        events,
        liberos: { home: homeConfig?.libero, away: awayConfig?.libero },
      }),
    [actions, homeConfig, awayConfig, sync.anchor_timecode, sync.sync_offset, matchState, events]
  );

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

  // --- Temps morts et remplacements ----------------------------------------
  const sortEvents = (list) =>
    [...list].sort(
      (a, b) =>
        (Number(a.set_number) || 1) - (Number(b.set_number) || 1) ||
        (Number(a.point_number) || 0) - (Number(b.point_number) || 0) ||
        (Number(a.id) || 0) - (Number(b.id) || 0)
    );

  const notifyEvent = useCallback((ok, text) => {
    setFlash({ ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  // --- Profils de fenêtres : enregistrer / appliquer / supprimer -------------
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
          : `Profil « ${res.profile.name} » conservé pour cette session (stockage indisponible).`
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

  /** Temps mort de l'équipe demandée, au point en cours du set en cours. */
  const addTimeout = async (team) => {
    if (matchFinished) return;
    try {
      const res = await datavolleyAPI.saveEvent(id, {
        kind: 'timeout',
        set_number: matchState.currentSet,
        point_number: matchState.score.team1 + matchState.score.team2,
        team,
      });
      setEvents((prev) => sortEvents([...prev, res.data.event]));
      notifyEvent(
        true,
        `Temps mort ${team === 'away' ? team2 : team1} — set ${matchState.currentSet} (${matchState.score.team1}-${matchState.score.team2}).`
      );
    } catch (err) {
      notifyEvent(false, err?.response?.data?.error || 'Enregistrement du temps mort impossible.');
    }
  };

  /** Remplacement enregistré à la position en cours : il vaut pour la suite. */
  const confirmSubstitution = async () => {
    const out = Number(subOut);
    const inn = Number(subIn);
    if (!Number.isInteger(out) || out <= 0 || !Number.isInteger(inn) || inn <= 0 || out === inn) {
      notifyEvent(false, 'Choisissez le joueur sortant et le joueur entrant.');
      return;
    }
    setSavingEvent(true);
    try {
      const res = await datavolleyAPI.saveEvent(id, {
        kind: 'substitution',
        set_number: matchState.currentSet,
        point_number: matchState.score.team1 + matchState.score.team2,
        team: subTeam,
        payload: { out, in: inn },
      });
      setEvents((prev) => sortEvents([...prev, res.data.event]));
      setShowSub(false);
      setSubOut('');
      setSubIn('');
      notifyEvent(true, `Remplacement ${subTeam === 'away' ? team2 : team1} : n°${out} → n°${inn}.`);
    } catch (err) {
      notifyEvent(false, err?.response?.data?.error || 'Enregistrement du remplacement impossible.');
    } finally {
      setSavingEvent(false);
    }
  };

  const removeEvent = async (eventId) => {
    try {
      await datavolleyAPI.deleteEvent(id, eventId);
      setEvents((prev) => prev.filter((ev) => Number(ev.id) !== Number(eventId)));
    } catch (err) {
      notifyEvent(false, err?.response?.data?.error || 'Suppression impossible.');
    }
  };

  /** Joueurs sur le terrain (six rejoué), avec leur nom de fiche équipe. */
  const onCourtPlayers = (team) => {
    const lineup = team === 'away' ? matchState.awayLineup : matchState.homeLineup;
    const cfg = team === 'away' ? awayConfig : homeConfig;
    return COURT_POSITIONS.map((p) => Number(lineup?.[p]) || 0)
      .filter((n) => n > 0)
      .map((n) => ({ number: n, name: (cfg?.roster || []).find((x) => Number(x.number) === n)?.name || '' }));
  };

  /** Remplaçants disponibles (effectif hors terrain, libéro exclu : automatique). */
  const benchPlayers = (team) => {
    const cfg = team === 'away' ? awayConfig : homeConfig;
    const onCourt = new Set(onCourtPlayers(team).map((p) => p.number));
    return (cfg?.roster || [])
      .map((p) => ({ number: Number(p.number) || 0, name: p.name || '', role: p.role || 'universal' }))
      .filter((p) => p.number > 0 && !onCourt.has(p.number) && p.role !== 'libero');
  };

  // Compteurs du set en cours (2 temps morts par équipe et par set en FIVB).
  const currentSetEvents = useMemo(
    () => events.filter((ev) => Number(ev.set_number) === matchState.currentSet),
    [events, matchState.currentSet]
  );
  const timeoutCount = (team) =>
    currentSetEvents.filter((ev) => ev.kind === 'timeout' && (ev.team || 'home') === team).length;
  const substitutionCount = currentSetEvents.filter((ev) => ev.kind === 'substitution').length;

  // Numéros de passeur déduits des rôles (pour l'analyse de distribution).
  const setterNumbers = useMemo(() => {
    const pick = (config) => {
      const p = (config?.roster || []).find((x) => x.role === 'setter');
      return p ? Number(p.number) : null;
    };
    return { home: pick(homeConfig), away: pick(awayConfig) };
  }, [homeConfig, awayConfig]);

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

  // Code attendu : l'action suivante si un point est en cours, sinon le service.
  const nextServe = useMemo(() => {
    const last = actions[actions.length - 1];
    const predicted = predictNextAction(last, { homeSetter: setterNumbers.home, awaySetter: setterNumbers.away });
    if (predicted) return predicted.code;
    return prefillWithLearnedType(serverPrefill({ ...matchState, ...boardState }), learnedTypes);
  }, [actions, matchState, boardState, learnedTypes, setterNumbers]);

  // Bilan de match standardisé (filtré par set) + rapport de scouting complet.
  const actionSetMap = useMemo(() => indexActionSets(statsRallies, statsMatchState), [statsRallies, statsMatchState]);
  const matchReport = useMemo(
    () =>
      computeMatchReport(statsActions, {
        homeConfig,
        awayConfig,
        setMap: actionSetMap,
        sets: reportSets,
        homeName: team1,
        awayName: team2,
      }),
    [statsActions, homeConfig, awayConfig, actionSetMap, reportSets, team1, team2]
  );

  // Rapport complet : ventilations, zones, situations, rotations, classements.
  const scouting = useMemo(
    () =>
      computeScouting({
        actions: statsActions,
        rallies: statsRallies,
        homeConfig,
        awayConfig,
        homeName: team1,
        awayName: team2,
        sets: reportSets,
        setMap: actionSetMap,
        setups,
        setterNumbers,
      }),
    [statsActions, statsRallies, homeConfig, awayConfig, team1, team2, reportSets, actionSetMap, setups, setterNumbers]
  );

  // Distribution du passeur par rotation (onglet Distribution).
  const setterDist = useMemo(
    () => computeSetterDistributionByRotation(statsActions, statsRallies, setups, setterNumbers),
    [statsActions, statsRallies, setups, setterNumbers]
  );

  /** Nom d'un joueur d'après les fiches d'équipe (roster du set en cours). */
  const playerNameOf = useCallback(
    (team, number) =>
      ((team === 'away' ? awayConfig : homeConfig)?.roster || []).find(
        (p) => Number(p.number) === Number(number)
      )?.name || '',
    [awayConfig, homeConfig]
  );

  // Chargement initial : vidéo + actions + synchronisation + état du match + positions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const videoRes = await videosAPI.getOne(id);
        if (cancelled) return;
        setVideo(videoRes.data.video);

        try {
          const actRes = await datavolleyAPI.getActions(id);
          if (!cancelled) {
            const loadedActions = ensureUids(actRes.data.actions || []);
            actionsRef.current = loadedActions;
            setActions(loadedActions);
            loadedRef.current = true;
          }
        } catch (err) {
          console.warn('Impossible de charger les actions DataVolley :', err?.response?.status, err?.message);
          if (!cancelled) {
            setFlash({ ok: false, text: 'API DataVolley indisponible — redémarrez le serveur pour activer le codage.' });
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setFlash(null), 8000);
          }
        }

        try {
          const syncRes = await datavolleyAPI.getSync(id);
          if (!cancelled && syncRes.data && syncRes.data.sync) setSync(syncRes.data.sync);
        } catch (err) {
          console.warn('Impossible de charger la synchronisation DataVolley :', err?.response?.status, err?.message);
        }

        try {
          const matchRes = await datavolleyAPI.getMatch(id);
          if (!cancelled && matchRes.data && matchRes.data.match) setMatch(matchRes.data.match);
        } catch (err) {
          console.warn("Impossible de charger l'état du match DataVolley :", err?.response?.status, err?.message);
        }

        try {
          const setupsRes = await datavolleyAPI.getSetups(id);
          if (!cancelled) setSetups(setupsRes.data.setups || {});
        } catch (err) {
          console.warn('Impossible de charger les positions DataVolley :', err?.message);
        }

        try {
          const eventsRes = await datavolleyAPI.getEvents(id);
          if (!cancelled) setEvents(eventsRes.data.events || []);
        } catch (err) {
          console.warn('Impossible de charger les événements DataVolley :', err?.message);
        }

        loadClaims();
      } catch (err) {
        console.error('Failed to load DataVolley video:', err);
        if (!cancelled) setError('Vidéo introuvable ou erreur de chargement.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Auto-save débouncé des actions
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        if (myClaimedSet) {
          const setActions = actionsRef.current.filter((a) => Number(a.set_number) === myClaimedSet);
          await datavolleyAPI.saveSetActions(id, myClaimedSet, setActions);
        } else {
          await datavolleyAPI.saveActions(id, actionsRef.current);
        }
      } catch (err) {
        console.error('Failed to save actions:', err);
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [actions, id, myClaimedSet]);

  const commitBuffer = useCallback(() => {
    if (matchFinished) return;
    const raw = stripSpaces(bufferRef.current);
    if (!raw) return;
    const items = parseSequence(raw, codeOpts);
    const validItems = items.filter((it) => it.valid);
    if (validItems.length === 0) return;
    const v = videoRef.current;
    const timecode = v ? v.currentTime : null;
    // Chaque action garde le temps vidéo de l'instant où SON code a été terminé.
    // Une formule combinée (un seul bloc) donne le même temps à ses deux actions.
    const timecodes = itemTimecodes(raw, blockTimesRef.current);
    const newActions = makeActions(items, {
      currentTimecode: timecode,
      timecodes,
      startIndex: actionsRef.current.length,
      setNumber: myClaimedSet ?? matchState.currentSet,
    });
    const next = reindexActions([...actionsRef.current, ...newActions]);
    actionsRef.current = next;
    setActions(next);
    bufferRef.current = '';
    setBuffer('');
    const badCount = items.length - validItems.length;
    setFlash({
      ok: badCount === 0,
      text: badCount === 0
        ? `${validItems.length} action(s) codée(s)`
        : `${validItems.length} action(s) codée(s) — ${badCount} bloc(s) à corriger`,
    });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2000);

    // Pré-remplit le prochain service (l'équipe qui mène le point suivant).
    // En consultation, sans évaluation on ne sait pas qui a gagné : on ne
    // pré-remplit pas (l'utilisateur tape '*' ou 'a' lui-même).
    if (autoServe && !lightMode) {
      const nextRallies = groupActionsIntoRallies(next, rallyOpts);
      const nextState = computeMatchState(nextRallies, setups, {}, events);
      const prefill = prefillWithLearnedType(serverPrefill(nextState), learnActionTypes(next));
      bufferRef.current = prefill;
      setBuffer(prefill);
    }
  }, [matchFinished, autoServe, lightMode, setups, codeOpts, rallyOpts, myClaimedSet, matchState.currentSet]);

  const seekTo = useCallback((t) => {
    const v = videoRef.current;
    if (v && typeof t === 'number') {
      const target = Math.max(0, t);
      v.currentTime = target;
      resumeTimeRef.current = target;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // MODES CONSULTATION · CORRECTION · ANALYSE : actions et lecture
  // ---------------------------------------------------------------------------

  /** Applique une nouvelle liste d'actions (état + référence + sauvegarde auto). */
  const applyActions = useCallback((next) => {
    actionsRef.current = next;
    setActions(next);
  }, []);

  /** Double-clic sur une action dans la liste de Saisie : modifier son code. */
  const editActionCode = useCallback(
    (action, rawCode) => {
      if (!action) return;
      const res = updateActionCode(actionsRef.current, action.uid, rawCode);
      if (res.error) {
        notifyEvent(false, res.error);
        return;
      }
      applyActions(res.actions);
      notifyEvent(true, `Action modifiée : ${action.code} → ${res.action?.code || rawCode}`);
    },
    [applyActions, notifyEvent]
  );

  /** Temps vidéo effectif d'une action (timecode + décalage de synchronisation). */
  const videoTimeOf = useCallback(
    (a) => (a?.timecode == null ? null : Number(a.timecode) + Number(sync.sync_offset || 0)),
    [sync.sync_offset]
  );

  /** Va sur une action (Consultation, Correction, Analyse). */
  const seekToAction = useCallback(
    (a) => {
      const t = videoTimeOf(a);
      if (t == null) {
        setFlash({ ok: false, text: 'Cette action n’a pas de temps vidéo : calez d’abord la vidéo (mode Correction).' });
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 4000);
        return;
      }
      seekTo(t);
      if (mode === 'consultation') setConsultIndex(a.action_index);
      if (mode === 'correction') setCorrectUid(a.uid);
    },
    [videoTimeOf, seekTo, mode]
  );

  /** Va au début d'un point (en-tête déplié de la liste des codes). */
  const seekToRally = useCallback(
    (rally) => {
      const seg = consultSegments.find((s) => Number(s.pointNumber) === Number(rally?.pointNumber));
      if (seg && seg.segmentStart != null) {
        seekTo(seg.segmentStart);
        return;
      }
      const first = (rally?.actions || [])[0];
      if (first) seekToAction(first);
    },
    [consultSegments, seekTo, seekToAction]
  );

  /** Écrit une direction (2 zones) dans l'action visée, sans changer de format. */
  const setDirection = useCallback(
    (action, start, end) => {
      if (!action?.uid) return;
      applyActions(applyDirection(actionsRef.current, action.uid, start, end));
      notifyEvent(true, `Direction ${start || '—'} → ${end || '—'} enregistrée.`);
    },
    [applyActions, notifyEvent]
  );

  /** Compteur « attaques sans direction » : ouvre la fenêtre sur la première. */
  const goToAttackWithoutDirection = useCallback(() => {
    const first = attacksWithoutDirection(actionsRef.current)[0];
    if (first) {
      setDirectionUid(first.uid);
      openPanelById('direction');
      seekToAction(first);
    } else {
      notifyEvent(true, 'Toutes les attaques ont une direction.');
    }
  }, [seekToAction, notifyEvent, openPanelById]);

  /** Clic sur une cellule de la fenêtre « Directions » : filtre la liste. */
  const filterByDirection = useCallback((row) => {
    if (!row?.start || !row?.end) return;
    setConsultFilters((prev) => ({ ...prev, action: 'A', query: `*${row.start}${row.end}*` }));
  }, []);

  /** Point suivant / précédent en Consultation (le lecteur saute les temps morts). */
  const goToPoint = useCallback(
    (dir) => {
      const idx = stepPoint(consultSegments, consultIndex, dir);
      if (idx < 0) return;
      const seg = consultSegments[idx];
      setConsultIndex((seg.actions || [])[0]?.action_index ?? -1);
      seekTo(seg.segmentStart);
    },
    [consultSegments, consultIndex, seekTo]
  );

  /** Changement de mode : on reprend la lecture au point lu, sans perdre le temps. */
  const changeMode = useCallback(
    (next) => {
      setMode(next);
      if (next !== 'parametres') setSettingsOpen(false);
      const v = videoRef.current;
      if (next === 'consultation' && v) {
        // On se place sur le premier point (ou celui en cours) pour démarrer proprement.
        const idx = consultIndex >= 0 ? consultIndex : 0;
        const seg = consultSegments.find((s) => (s.actions || []).some((a) => a.action_index === idx)) || consultSegments[0];
        if (seg) {
          setConsultIndex((seg.actions || [])[0]?.action_index ?? -1);
          seekTo(seg.segmentStart);
        }
      }
    },
    [consultIndex, consultSegments, seekTo]
  );

  /** Calage sur le premier service (mode Correction). */
  const anchorFirstServe = useCallback(async () => {
    const v = videoRef.current;
    const res = firstServeAnchor(actionsRef.current, v ? v.currentTime : 0, sync);
    if (res.error) {
      setFlash({ ok: false, text: res.error });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 4000);
      return;
    }
    setSync(res.sync);
    try {
      await datavolleyAPI.saveSync(id, res.sync);
      setFlash({ ok: true, text: `Vidéo calée sur le premier service — décalage ${res.offset.toFixed(2)} s.` });
    } catch (err) {
      setFlash({ ok: false, text: 'Calage enregistré localement, mais non sauvegardé.' });
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 4000);
  }, [sync, id]);

  const patchSync = useCallback(
    (patch) => {
      if (patch.open) {
        setShowSync(true);
        return;
      }
      const next = { ...sync, ...patch };
      setSync(next);
      datavolleyAPI.saveSync(id, next).catch(() => {});
    },
    [sync, id]
  );

  // Numéro de point de chaque action (Consultation, Analyse, Correction).
  const actionPointMap = useMemo(() => {
    const map = new Map();
    for (const r of rallies) {
      for (const a of r.actions || []) {
        const key = a.uid ?? a.id ?? a.action_index;
        map.set(key, r.pointNumber);
      }
    }
    return map;
  }, [rallies]);
  const pointOfAction = useCallback(
    (a) => {
      if (!a) return null;
      const key = a.uid ?? a.id ?? a.action_index;
      return actionPointMap.get(key) ?? null;
    },
    [actionPointMap]
  );

  /** Correction : décale le temps vidéo d'une action. */
  const shiftActionTime = useCallback(
    (a, delta) => {
      applyActions(shiftTimecode(actionsRef.current, a.uid, delta));
    },
    [applyActions]
  );

  /** Correction : prend la position actuelle de la vidéo comme temps de l'action. */
  const setActionTimeToVideo = useCallback(
    (a) => {
      const v = videoRef.current;
      const videoTime = v ? v.currentTime : 0;
      const sourceTime = Math.max(0, videoTime - Number(sync.sync_offset || 0));
      applyActions(setActionTimecode(actionsRef.current, a.uid, sourceTime));
      setFlash({ ok: true, text: `${a.code} : temps fixé à ${formatTimecode(videoTime)}.` });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 3000);
    },
    [applyActions, sync.sync_offset]
  );

  /** Correction : supprime une action (avec confirmation). */
  const removeActionByUid = useCallback(
    (a) => {
      if (!window.confirm(`Supprimer l’action ${a.code} ?`)) return;
      applyActions(removeAction(actionsRef.current, a.uid));
      setCorrectUid(null);
    },
    [applyActions]
  );

  /** Correction : déplace une action d'un cran. */
  const moveActionByUid = useCallback(
    (a, dir) => {
      applyActions(moveAction(actionsRef.current, a.uid, dir));
    },
    [applyActions]
  );

  /** Fenêtre de commandes (Échap) : temps mort, remplacement, code libre. */
  const submitCommand = useCallback(
    async (command) => {
      const body = commandToEvent(command, {
        setNumber: matchState.currentSet,
        pointNumber: matchState.score.team1 + matchState.score.team2,
      });
      if (!body) return;
      try {
        const res = await datavolleyAPI.saveEvent(id, body);
        setEvents((prev) => sortEvents([...prev, res.data.event]));
        const who = body.team === 'away' ? team2 : team1;
        const text =
          command.kind === 'timeout'
            ? `Temps mort ${who} (set ${body.set_number}).`
            : command.kind === 'substitution'
            ? `Remplacement ${who} : n°${command.out} → n°${command.in}.`
            : `Code libre « ${command.text} » enregistré.`;
        setFlash({ ok: true, text });
      } catch (err) {
        setFlash({ ok: false, text: err?.response?.data?.error || 'Commande non enregistrée.' });
      }
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 3500);
    },
    [id, matchState.currentSet, matchState.score, team1, team2]
  );


  /** Lecture / pause de la vidéo (mode Consultation, touche Espace). */
  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  /**
   * Fin de point à la DataVolley : `[` pour l'équipe à domicile, `]` pour
   * l'extérieure. Si la dernière action ne clôt pas le point, on lui donne
   * l'évaluation qui convient (# pour l'équipe qui marque, = pour la faute de
   * l'autre) — geste réversible par Ctrl+A.
   */
  const markPointEnd = useCallback(
    (winner) => {
      const notify = (ok, text) => {
        setFlash({ ok, text });
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 3500);
      };
      if (matchFinished) return;
      const list = actionsRef.current;
      const last = list[list.length - 1];
      if (!last) {
        notify(false, 'Aucune action à clore.');
        return;
      }
      if (isTerminalEvaluation(last.action, last.evaluation)) {
        notify(false, `Le point est déjà terminé (${last.code}).`);
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
      applyActions(list.map((a) => (a.uid === last.uid ? { ...a, code, ...decomposeCode(code) } : a)));
      notify(true, `Point pour ${team === 'away' ? team2 : team1} : ${last.code} → ${code}`);
    },
    [matchFinished, applyActions, team1, team2]
  );

  /** Ctrl+A : annule la dernière fin de point (le point reste ouvert). */
  const undoPointEnd = useCallback(() => {
    const notify = (ok, text) => {
      setFlash({ ok, text });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 3500);
    };
    if (matchFinished) return;
    const list = actionsRef.current;
    const last = list[list.length - 1];
    if (!last || !isTerminalEvaluation(last.action, last.evaluation)) {
      notify(false, 'Aucune fin de point à annuler.');
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
    applyActions(list.map((a) => (a.uid === last.uid ? { ...a, code, ...decomposeCode(code) } : a)));
    notify(true, `Fin de point annulée : ${last.code} → ${code}`);
  }, [matchFinished, applyActions]);

  // Capture clavier : les raccourcis (modifiables) pilotent la vidéo et la console ;
  // tout autre caractère imprimable alimente le tampon de codage.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.altKey) return;

      // Échap : fenêtre de commandes (temps morts, remplacements, code libre).
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showSync) { setShowSync(false); return; }
        setShowCommand((v) => !v);
        return;
      }

      // En Consultation : Espace et flèches pour relire les points.
      if (mode === 'consultation') {
        if (e.key === ' ') { e.preventDefault(); togglePlayback(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); goToPoint(1); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); goToPoint(-1); return; }
        return;
      }

      // En Analyse et en Correction, on laisse la main aux boutons de l'écran.
      if (mode !== 'saisie') return;
      if (e.ctrlKey || e.metaKey) return;

      // Raccourcis vidéo (désactivés si le match est terminé pour la saisie).
      if (matchesShortcut(e, shortcuts.pause)) { e.preventDefault(); videoAction('pause'); return; }
      if (matchesShortcut(e, shortcuts.seekBack)) { e.preventDefault(); videoAction('seekBack'); return; }
      if (matchesShortcut(e, shortcuts.seekForward)) { e.preventDefault(); videoAction('seekForward'); return; }
      if (matchesShortcut(e, shortcuts.speedDown)) { e.preventDefault(); videoAction('speedDown'); return; }
      if (matchesShortcut(e, shortcuts.speedUp)) { e.preventDefault(); videoAction('speedUp'); return; }
      if (matchesShortcut(e, shortcuts.speedReset)) { e.preventDefault(); videoAction('speedReset'); return; }
      if (matchesShortcut(e, shortcuts.togglePanels)) { e.preventDefault(); setMany(['score', 'court', 'positions', 'actions', 'shortcuts'], !arePanelsVisible); return; }

      if (matchFinished) return;

      // Gestes de saisie de DataVolley : [ et ] terminent le point, Ctrl+A l'annule.
      if (e.key === '[') { e.preventDefault(); markPointEnd('home'); return; }
      if (e.key === ']') { e.preventDefault(); markPointEnd('away'); return; }
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undoPointEnd(); return; }

      if (matchesShortcut(e, shortcuts.validate)) { e.preventDefault(); commitBuffer(); return; }
      if (matchesShortcut(e, shortcuts.backspace)) { e.preventDefault(); setBuffer((b) => b.slice(0, -1)); return; }
      if (matchesShortcut(e, shortcuts.clearBuffer)) { e.preventDefault(); setBuffer(''); return; }

      // Caractère imprimable non utilisé par un raccourci : on l'ajoute au tampon.
      if (e.key && e.key.length === 1) {
        e.preventDefault();
        if (bufferRef.current.length < 60) setBuffer((b) => b + e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    mode,
    commitBuffer,
    matchFinished,
    shortcuts,
    videoAction,
    setMany,
    arePanelsVisible,
    showSync,
    togglePlayback,
    goToPoint,
    markPointEnd,
    undoPointEnd,
  ]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    resumeTimeRef.current = v.currentTime;
    setCurrentTime(v.currentTime);

    // Mode Consultation : la lecture enchaîne les points et saute les temps
    // morts. Dès qu'on sort du segment du point courant, on va au point suivant.
    if (mode !== 'consultation' || !consultSegments.length) return;
    const t = v.currentTime;
    const idx = pointIndexAt(consultSegments, t);
    if (idx >= 0) {
      const first = (consultSegments[idx].actions || [])[0];
      if (first && first.action_index !== consultIndex) setConsultIndex(first.action_index);
      return;
    }
    // Hors segment : on reprend au point suivant (ou on s'arrête à la fin).
    const next = consultSegments.find((s) => s.segmentStart > t);
    if (next) {
      v.currentTime = next.segmentStart;
      resumeTimeRef.current = next.segmentStart;
      const first = (next.actions || [])[0];
      if (first) setConsultIndex(first.action_index);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  /** Clic sur un point de la frise : on se place au début du point dans la vidéo. */
  const seekToPoint = useCallback(
    (pt) => {
      const item = pointSegments.find((p) => p.pointNumber === pt?.point_number);
      if (item && item.segmentStart != null) {
        seekTo(item.segmentStart);
        return;
      }
      if (pt && Number.isFinite(pt.timecode)) seekTo(pt.timecode + (sync.sync_offset || 0));
    },
    [pointSegments, seekTo, sync.sync_offset]
  );

  const deleteRally = (rally) => {
    if (matchFinished) return;
    const uids = new Set(rally.actions.map((a) => a.uid));
    const next = reindexActions(actionsRef.current.filter((a) => !uids.has(a.uid)));
    actionsRef.current = next;
    setActions(next);
  };

  const startEditRally = (rally) => {
    if (matchFinished) return;
    setEditingRallyUid(rally.actions[0]?.uid || null);
    setEditingSequence(rally.sequence || rally.actions.map((a) => a.code).join(''));
  };

  const startNewPoint = () => {
    if (matchFinished) return;
    setEditingRallyUid('NEW');
    setEditingSequence('');
  };

  const cancelRallyEdit = () => {
    setEditingRallyUid(null);
    setEditingSequence('');
  };

  const saveRallySequence = () => {
    if (matchFinished) return;
    const raw = stripSpaces(editingSequence);
    const items = parseSequence(raw, codeOpts);
    const validCount = items.filter((it) => it.valid).length;
    if (validCount === 0) {
      setFlash({ ok: false, text: 'Séquence vide ou invalide — rien à enregistrer.' });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 2500);
      return;
    }

    const v = videoRef.current;
    const currentTimecode = v ? v.currentTime : null;
    let next;

    if (editingRallyUid === 'NEW') {
      next = appendSequence(actionsRef.current, raw, { currentTimecode, evaluationOptional: lightMode });
    } else {
      const rally = rallies.find((r) => r.actions[0]?.uid === editingRallyUid);
      if (!rally) { cancelRallyEdit(); return; }
      next = replaceRallySequence(actionsRef.current, rally, raw, { currentTimecode, evaluationOptional: lightMode });
    }

    actionsRef.current = next;
    setActions(next);
    cancelRallyEdit();

    const badCount = items.length - validCount;
    setFlash({
      ok: badCount === 0,
      text: badCount === 0
        ? `Séquence enregistrée (${validCount} action(s))`
        : `Séquence enregistrée — ${badCount} action(s) mal formée(s)`,
    });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  };

  // Correction manuelle de la zone d'une action : le code est réécrit en clair.
  const applyZoneToAction = (zoneId) => {
    if (!zoneActionUid) return;
    const z = normalizeAttackZone(zoneId);
    if (!z) return;
    const next = actionsRef.current.map((a) => {
      if (a.uid !== zoneActionUid) return a;
      const code = formatCode({
        teamKey: a.team === 'away' ? 'a' : '*',
        player_number: a.player_number,
        action: a.action,
        type: a.type || '',
        evaluation: a.evaluation,
        start_zone: a.action === 'S' ? '1' : z,
        end_zone: a.action === 'S' ? z : a.end_zone || '',
        end_subzone: a.end_subzone || '',
      });
      return { ...a, code, ...decomposeCode(code), attack_zone: z };
    });
    actionsRef.current = next;
    setActions(next);
    setZoneActionUid(null);
  };

  const generateDemo = async () => {
    if (!window.confirm('Remplacer les actions actuelles par un match de démo ?')) return;
    const demo = generateDemoActions();
    actionsRef.current = demo;
    setActions(demo);
    loadedRef.current = true;
    changeMode('analyse');
    setTab('synthese');
    setFlash({ ok: true, text: `Match de démo généré (${demo.length} actions).` });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
    try {
      await datavolleyAPI.saveActions(id, demo);
    } catch (err) {
      console.error('Failed to save demo actions:', err);
    }
  };

  const anchorHere = async () => {
    // Le premier code Service est utilisé comme ancre par défaut.
    const anchorAction = actions.find((a) => a.action === 'S');
    if (!anchorAction) {
      setFlash({ ok: false, text: 'Aucun service codé : impossible d’ancrer.' });
      return;
    }
    const v = videoRef.current;
    const anchorTimecode = v ? v.currentTime : 0;
    const anchorSystemTime = anchorAction.system_time ?? Math.floor(Date.now() / 1000);
    const offset = anchorTimecode - anchorSystemTime;
    const newSync = {
      ...sync,
      sync_offset: offset,
      anchor_action_id: anchorAction.id ?? anchorAction.action_index,
      anchor_timecode: anchorTimecode,
      anchor_system_time: anchorSystemTime,
    };
    setSync(newSync);
    try {
      await datavolleyAPI.saveSync(id, newSync);
      setFlash({ ok: true, text: `Ancre posée : offset ${offset.toFixed(2)} s` });
    } catch (err) {
      console.error('Failed to save sync:', err);
    }
  };

  const saveLead = async () => {
    try {
      await datavolleyAPI.saveSync(id, sync);
      setFlash({ ok: true, text: 'Réglages enregistrés' });
    } catch (err) {
      console.error('Failed to save lead settings:', err);
    }
  };

  const finishMatch = async () => {
    if (!window.confirm('Terminer le match ? Il sera conservé en mémoire et verrouillé en lecture seule. Vous pourrez le rouvrir ensuite.')) return;
    try {
      // Force la sauvegarde des actions avant de clôturer.
      await datavolleyAPI.saveActions(id, actionsRef.current);
      const res = await datavolleyAPI.finish(id);
      setMatch(res.data.match);
      setFlash({ ok: true, text: 'Match terminé et conservé en mémoire.' });
    } catch (err) {
      console.error('Failed to finish match:', err);
      setFlash({ ok: false, text: 'Impossible de terminer le match.' });
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  };

  const reopenMatch = async () => {
    try {
      const res = await datavolleyAPI.reopen(id);
      setMatch(res.data.match);
      setFlash({ ok: true, text: 'Match rouvert — codage réactivé.' });
    } catch (err) {
      console.error('Failed to reopen match:', err);
      setFlash({ ok: false, text: 'Impossible de rouvrir le match.' });
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  };

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
      await datavolleyAPI.saveSetups(id, updated);
      setSetups(updated);
      setShowTeams(false);
      setFlash({ ok: true, text: 'Positions, six et rôles enregistrés.' });
    } catch (err) {
      console.error('Failed to save teams/setup:', err);
      setFlash({ ok: false, text: 'Impossible d’enregistrer.' });
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  };

  const errorCount = useMemo(() => actions.filter((a) => !validateAction(a.code, codeOpts).valid).length, [actions, codeOpts]);
  const ralliesWithErrors = useMemo(
    () => rallies.filter((r) => r.actions.some((a) => !validateAction(a.code, codeOpts).valid)),
    [rallies, codeOpts]
  );
  // Rapport complet : sets disponibles, filtre, export CSV et impression.
  const reportSetsAvailable = useMemo(
    () => Array.from({ length: matchState.currentSet }, (_, i) => i + 1),
    [matchState.currentSet]
  );

  const toggleReportSet = (s) => {
    if (s === 0) return setReportSets([]);
    setReportSets((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const exportReportCsv = () => {
    const slug = [team1, team2]
      .map((n) => String(n || '').replace(/\s+/g, '_'))
      .filter(Boolean)
      .join('_');
    downloadTextFile(`bilan_${slug || 'match'}.csv`, rowsToCsv(reportToRows(matchReport)), 'text/csv;charset=utf-8');
  };

  // Combinaisons d'attaque des deux équipes (une ligne par équipe/combinaison).
  const exportCombosCsv = () => {
    const slug = [team1, team2]
      .map((n) => String(n || '').replace(/\s+/g, '_'))
      .filter(Boolean)
      .join('_');
    const head = ['Equipe', 'Code', 'Libelle', 'Total', 'Points', 'Fautes', 'Contrees', 'Efficacite %'];
    const withTeam = (rows, team) => rows.slice(1).map((r) => [team, ...r]);
    const rows = [
      head,
      ...withTeam(tacticToRows(scouting.home, 'attack', 'combo'), team1),
      ...withTeam(tacticToRows(scouting.away, 'attack', 'combo'), team2),
    ];
    downloadTextFile(`combinaisons_${slug || 'match'}.csv`, rowsToCsv(rows), 'text/csv;charset=utf-8');
  };

  // Export .dvw (format DataVolley) de la sélection courante.
  const exportDvwFile = () => {
    const slug = [team1, team2].map((n) => String(n || '').replace(/\s+/g, '_')).filter(Boolean).join('_');
    const rosterOf = (cfg) => (cfg?.roster || []).map((p) => ({ number: p.number, name: p.name }));
    const lineupMap = indexActionLineups(rallies, matchState);
    const dvw = buildDvw({
      match: { date: '', league: '', scout: user?.name || '' },
      teams: { home: team1, away: team2 },
      rosters: { home: rosterOf(homeConfig), away: rosterOf(awayConfig) },
      sets: [],
      actions: actions.map((a) => {
        const key = a.uid ?? a.id ?? a.action_index;
        return {
          ...a,
          ...(lineupMap.get(key) || {}),
          set_number: actionSetMap.get(key) || 1,
          rally_number: a.action_index,
        };
      }),
    });
    downloadTextFile(`match_${slug || 'asul'}.dvw`, dvw, 'text/plain;charset=utf-8');
  };

  const importInputRef = useRef(null);

  // Import .dvw : remplace les actions du match par celles du fichier.
  const onImportDvwFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseDvw(text);
      if (!parsed.actions.length) {
        setFlash({ ok: false, text: 'Aucun code trouvé dans le fichier .dvw.' });
        return;
      }
      if (!window.confirm(`Importer ${parsed.actions.length} action(s) depuis « ${file.name} » ?\nLes actions actuelles seront remplacées.`)) {
        return;
      }
      const next = parsed.actions.map((a, i) => ({ uid: `imp-${i}`, action_index: i, set_number: a.set_number, code: a.code, ...decomposeCode(a.code) }));
      actionsRef.current = next;
      setActions(next);
      loadedRef.current = true;
      await datavolleyAPI.saveActions(id, next);
      setFlash({ ok: true, text: `${next.length} action(s) importée(s) depuis ${file.name}.` });
    } catch (err) {
      setFlash({ ok: false, text: "Échec de l'import .dvw : " + (err?.message || '') });
    }
  };

  // Fenêtres d'analyse (mode Analyse) : TOUTES les feuilles du rapport
  // (synthèse, compétences, combinaisons, zones, situations, rotations,
  // classements, par set, joueurs, directions) + points + distribution.
  const reportIcons = {
    synthese: Table,
    service: Volleyball,
    reception: Users,
    attaque: Target,
    combinaisons: Grid3x3,
    contre: Trophy,
    defense: Keyboard,
    zones: Grid3x3,
    situations: ChartColumn,
    rotations: RotateCcw,
    classements: Trophy,
    parette: ListChecks,
    joueurs: Users,
    directions: Target,
  };
  const analysisWindows = [
    ...REPORT_TABS.map((t) => ({
      key: t.key,
      label: t.label,
      icon: reportIcons[t.key] || ChartColumn,
      hint: `Fenêtre ${t.label}`,
    })),
    { key: 'frise', label: 'Points', icon: ChartColumn, hint: 'Frise chronologique des points et des événements' },
    { key: 'distribution', label: 'Distribution', icon: Target, hint: 'Distribution du passeur par rotation' },
  ];

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p className="loading-text">Chargement du codage…</p>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="app-loading">
        <p>{error || 'Vidéo introuvable'}</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Retour</button>
      </div>
    );
  }

  // Page plein écran : rapport complet (synthèse + compétences + zones…).
  if (reportFullScreen) {
    return (
      <div className="dv-fullpage">
        <div className="dv-fullpage-bar">
          <button className="btn btn-secondary btn-sm" onClick={() => setReportFullScreen(false)}>
            <ChevronLeft size={14} /> Retour à l’analyse
          </button>
          <div className="dv-fullpage-title">
            <Table size={16} />
            <strong>Rapport de match</strong>
            <span className="dv-fullpage-sub">{team1} — {team2}</span>
            <span className="dv-fullpage-meta">
              {reportSets.length === 0 ? 'Tous les sets' : `Set ${reportSets.join(', ')}`} · Sets{' '}
              {matchState.setsWon.team1}–{matchState.setsWon.team2} · {matchReport.actionCount} action(s) codée(s)
            </span>
          </div>
          <div className="dv-fullpage-actions">
            <button
              type="button"
              className={`btn btn-sm ${reportSets.length === 0 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleReportSet(0)}
            >
              Tous les sets
            </button>
            {reportSetsAvailable.map((s) => (
              <button
                key={s}
                type="button"
                className={`btn btn-sm ${reportSets.includes(s) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleReportSet(s)}
              >
                Set {s}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exportReportCsv}
              title="Exporter la synthèse au format CSV (ouvrable dans Excel)"
            >
              <FileDown size={13} /> CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exportCombosCsv}
              title="Exporter les combinaisons d'attaque au format CSV"
            >
              <FileDown size={13} /> Combinaisons CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exportDvwFile}
              title="Exporter le match au format DataVolley (.dvw)"
            >
              <FileDown size={13} /> .dvw
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => importInputRef.current?.click()}
              title="Importer un fichier DataVolley (.dvw)"
            >
              <Upload size={13} /> Importer .dvw
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".dvw,.txt"
              style={{ display: 'none' }}
              onChange={onImportDvwFile}
            />
          </div>
        </div>
        <div className="dv-fullpage-body">
          <MatchReportFull
            report={scouting}
            context="coding"
            sets={reportSetsAvailable}
            activeSets={reportSets}
            onToggleSet={toggleReportSet}
            rawActions={actions}
            events={events}
          />
        </div>
      </div>
    );
  }

  const bufferChunks = parseSequence(stripSpaces(buffer), codeOpts);

  // Le lecteur vidéo est rendu une seule fois : dans la fenêtre « Vidéo » du mode
  // Saisie, ou dans la scène du mode affiché (Consultation, Correction, Analyse).
  const videoNode = (
    <>
      <div className="video-player-wrapper">
        <video
          ref={videoRef}
          src={playbackUrl}
          controls
          preload="auto"
          className="trimmed-player"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => { wasPlayingRef.current = true; setPlaying(true); }}
          onPause={() => { wasPlayingRef.current = false; setPlaying(false); }}
          onLoadedMetadata={(e) => {
            // Changement de mode : on reprend au timecode quitté (et on relance
            // la lecture si la vidéo jouait avant).
            const el = e.currentTarget;
            setVideoDuration(Number.isFinite(el.duration) ? el.duration : 0);
            const t = resumeTimeRef.current;
            if (t > 0) {
              try { el.currentTime = t; } catch { /* média pas encore accessible */ }
            }
            if (wasPlayingRef.current) el.play().catch(() => {});
          }}
          onError={(e) => { const el = e.currentTarget; if (el.dataset.fb !== '1' && videoUrl) { el.dataset.fb = '1'; el.src = videoUrl; } }}
        />
      </div>
      <div className="dv-timecode">
        <Clock size={12} /> {formatTimecode(currentTime)}
      </div>
    </>
  );

  return (
    <div className="video-dashboard dv-page">
      <div className="vd-workspace">
        <nav className="video-tabs dv-nav">
          <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>←</motion.button>
          {matchFinished ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={reopenMatch}>
                <RotateCcw size={14} /> Rouvrir
              </button>
              <span className="dv-match-badge finished">
                <Trophy size={13} /> Terminé
              </span>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={finishMatch}>
              <Trophy size={14} /> Fin de match
            </button>
          )}
          <div className="dv-title">
            <strong>{video.display_name || video.original_name}</strong>
            <span className="dv-teams">
              <House size={12} /> {team1} &nbsp;·&nbsp; <Plane size={12} /> {team2}
            </span>
          </div>
          <DvModeBar
            mode={mode === 'parametres' ? 'saisie' : mode}
            onMode={changeMode}
            onSettings={() => setMode((m) => (m === 'parametres' ? 'saisie' : 'parametres'))}
            settingsOpen={mode === 'parametres'}
            issuesBadge={issues.filter((i) => i.severity === 'error').length}
          />
          <button className="btn btn-secondary btn-sm" onClick={generateDemo} title="Générer un match de démonstration">
            <Dices size={14} /> Démo
          </button>
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
          <button
            type="button"
            className={`btn btn-sm ${lightMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setLightMode((v) => !v)}
            title="Coder sans évaluation (ex. *02S a10A) — les points se découpent par service"
            aria-pressed={lightMode}
          >
            {lightMode ? <ListChecks size={14} /> : <Volleyball size={14} />} Sans évaluation
          </button>
          <div className="dv-save-state">
            {saving ? (
              <>
                <Save size={12} /> Sauvegarde…
              </>
            ) : (
              <>
                <Check size={12} /> Enregistré
              </>
            )}
          </div>
        </nav>

        <div className="vd-main">
          {mode === 'saisie' ? (
            <div className="dv-canvas" ref={setCanvasEl} style={{ minHeight: canvasHeight, minWidth: canvasWidth ? `${canvasWidth}px` : undefined }}>
              {/* Vidéo — ancre : déplaçable et redimensionnable, jamais fermée. */}
              {isOpen('video') && (
                <FloatingPanel
                  id="video"
                  title="Vidéo"
                  icon={MonitorPlay}
                  className="panel-video"
                  rect={rect('video')}
                  onRectChange={(patch) => setRect('video', patch)}
                  size={canvasSize}
                  closable={false}
                  headerExtra={
                    <span className="dv-speed-badge" title="Vitesse de lecture (touches Ralentir / Accélérer)">
                      {playbackRate}×
                    </span>
                  }
                >
                  {videoNode}
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
                  size={canvasSize}
                  closable={false}
                >
                  <CodingConsole
                    commitLabel={`Valider (${bufferChunks.length} bloc(s) à ${formatTimecode(currentTime)})`}
                    hint={
                      <p className="dv-hint">
                        {lightMode ? (
                          <>
                            Mode consultation — saisissez <strong>[équipe][n° joueur][action]</strong> sans évaluation, ex.{' '}
                            <code>*02S</code> <code>a10A</code> <code>*30A</code>. Les points se découpent à chaque service{' '}
                            <code>S</code> (un service seul = ace ou faute). Tapez librement puis Entrée.
                          </>
                        ) : (
                          <>
                            Formule <strong>[équipe][n° joueur][action][type?][zones?][évaluation]</strong> — ex. <code>*09A4#</code>{' '}
                            <code>a04SM7-</code> — combinaison service + réception <code>a04SM.06#</code>. Tapez librement puis
                            Entrée (espace et flèches contrôlent la vidéo). Les blocs non compris s’affichent en rouge.
                          </>
                        )}
                      </p>
                    }
                    bufferChunks={bufferChunks}
                    blockClassFor={(it) => (it.valid ? '' : 'error')}
                    lineClassFor={(it) => (it.valid ? '' : 'error')}
                    lineAfter={(it) => (it.combined ? <small> — issue de la formule combinée</small> : null)}
                    autoServe={lightMode ? false : autoServe}
                    onToggleAutoServe={(e) => setAutoServe(e.target.checked)}
                    nextServe={lightMode ? '—' : nextServe}
                    onInsertNextServe={() => { bufferRef.current = nextServe; setBuffer(nextServe); }}
                    onKey={(c) => {
                      const next = tryAppendChar(bufferRef.current, c);
                      if (next == null) {
                        setFlash({ ok: false, text: `« ${c} » n’est pas attendu ici.` });
                        if (flashTimer.current) clearTimeout(flashTimer.current);
                        flashTimer.current = setTimeout(() => setFlash(null), 1500);
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
                    onCommit={commitBuffer}
                    disabled={matchFinished}
                    warnings={matchState.warnings?.length > 0 ? (
                      <p className="dv-hint" style={{ marginTop: 8, color: 'var(--danger, #e05252)' }}>
                        <AlertTriangle size={13} /> {matchState.warnings.length} point(s) servi(s) par une équipe qui n’avait
                        pas le service (rotation) : P{matchState.warnings.map((w) => w.pointNumber).join(', P')}.
                      </p>
                    ) : null}
                    aftermath={matchFinished ? (
                      <p className="dv-hint" style={{ marginTop: 12, textAlign: 'center' }}>
                        <Trophy size={13} /> Match terminé — codage en lecture seule. Cliquez « Rouvrir » pour reprendre.
                      </p>
                    ) : null}
                  />
                </FloatingPanel>
              )}

              {/* Fenêtre « actions codées » — fermable et réouvrable. */}
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
                  <DvCodeList
                    rallies={rallies}
                    mode="saisie"
                    activeIndex={rallies.flatMap((r) => r.actions || []).slice(-1)[0]?.action_index ?? null}
                    onSeek={seekToAction}
                    issues={issues}
                    actionSet={setOfAction}
                    autoScroll
                    directionMissing={attacksWithoutDirection(actions).length}
                    onDirectionMissing={goToAttackWithoutDirection}
                    onEditCode={editActionCode}
                  />
                </FloatingPanel>
              )}

              {/* Fenêtre « direction d'attaque » — terrain complet façon
                  Trajectoires : clic de départ, clic d'arrivée, et les attaques
                  précédentes du joueur en transparence. */}
              {isOpen('direction') && (
                <FloatingPanel
                  id="direction"
                  title="Direction d’attaque"
                  icon={Target}
                  rect={rect('direction')}
                  onRectChange={(patch) => setRect('direction', patch)}
                  onClose={() => close('direction')}
                  size={canvasSize}
                >
                  {directionTarget ? (
                    <>
                      <div className="dvc-direction-head">
                        <code>{directionTarget.code}</code> · set {setOfAction(directionTarget) ?? '—'} ·{' '}
                        {formatTimecode(directionTarget.timecode)}
                      </div>
                      <label className="adc-picker">
                        <span>Attaque</span>
                        <select
                          value={directionTarget.uid || ''}
                          onChange={(e) => setDirectionUid(e.target.value || null)}
                        >
                          {!attackOptions.some((a) => a.uid === directionTarget.uid) && (
                            <option value={directionTarget.uid}>{directionTarget.code}</option>
                          )}
                          {attackOptions.map((a) => (
                            <option key={a.uid} value={a.uid}>
                              {a.code} · n°{String(a.player_number || 0).padStart(2, '0')} ·{' '}
                              {formatTimecode(a.timecode)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <AttackDirectionCourt
                        key={directionTarget.uid}
                        side={directionTarget.team === 'away' ? 'away' : 'home'}
                        startZone={directionTarget.start_zone}
                        endZone={directionTarget.end_zone}
                        history={directionHistory}
                        playerLabel={`n°${String(directionTarget.player_number || 0).padStart(2, '0')}`}
                        teamName={directionTeam}
                        opponentName={directionOpponent}
                        disabled={matchFinished}
                        onChange={({ start, end }) => setDirection(directionTarget, start, end)}
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

              {/* Fenêtre « score » : le terrain de rotation façon DataVolley
                  (6 + 6, score, set, ballon de service) puis les réglages. */}
              {isOpen('score') && (
                <FloatingPanel
                  id="score"
                  title="Score &amp; rotation"
                  icon={Trophy}
                  rect={rect('score')}
                  onRectChange={(patch) => setRect('score', patch)}
                  onClose={() => close('score')}
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

                  <SetClaimsBar
                    claims={claims}
                    currentSet={matchState.currentSet}
                    userEmail={user?.email || ''}
                    disabled={matchFinished}
                    onClaim={handleClaim}
                    onRelease={handleRelease}
                  />

                  {/* Temps morts et remplacements : marqués dans la frise. */}
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
                          disabled={matchFinished}
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
                      disabled={matchFinished}
                      title="Enregistrer un remplacement (entrant / sortant)"
                    >
                      <ArrowDownUp size={13} /> Remplacement
                    </button>
                    <span className="dv-hint">
                      Set {matchState.currentSet} : {substitutionCount} remplacement(s)
                    </span>
                  </div>
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

              {/* Fenêtre « positions » : rotation du passeur et six de départ. */}
              {isOpen('positions') && (
                <FloatingPanel
                  id="positions"
                  title="Positions"
                  icon={Users}
                  rect={rect('positions')}
                  onRectChange={(patch) => setRect('positions', patch)}
                  onClose={() => close('positions')}
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

              {/* Fenêtre « raccourcis » : rappel des touches (modifiables en Paramètres). */}
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
                  <VideoShortcuts coding />
                </FloatingPanel>
              )}

              {/* Fenêtres d'aide — Mode Aide : uniquement du pédagogique, sans
                  dupliquer les outils de saisie déjà présents à l'écran. */}
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
                    disabled={matchFinished}
                    onKey={(c) => {
                      const next = tryAppendChar(bufferRef.current, c);
                      if (next == null) {
                        setFlash({ ok: false, text: `« ${c} » n’est pas attendu ici.` });
                        if (flashTimer.current) clearTimeout(flashTimer.current);
                        flashTimer.current = setTimeout(() => setFlash(null), 1500);
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
                    onCommit={commitBuffer}
                  />
                </FloatingPanel>
              )}
            </div>
          ) : (
            <div className={`dv-main-col ${mode === 'analyse' ? 'dv-main-analyse' : ''} ${mode === 'consultation' || mode === 'correction' ? 'dv-main-wide' : ''}`}>
              {flash && (
                <div className={`dv-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>
              )}

              {/* Mode Consultation : relire les points, sans les temps morts. */}
              {mode === 'consultation' && (
                <DvConsultationPane
                  videoNode={videoNode}
                  points={consultFiltered}
                  segments={consultSegments}
                  duration={videoDuration}
                  activeIndex={consultIndex}
                  playing={playing}
                  rate={playbackRate}
                  matchedUids={consultMatchedUids}
                  filters={consultFilters}
                  onFilters={patchConsultFilters}
                  onResetFilters={() => setConsultFilters(EMPTY_FILTERS)}
                  options={filterOptions}
                  resultCount={consultMatched.length}
                  onSeekAction={seekToAction}
                  onSeekPoint={seekToRally}
                  onTogglePlay={togglePlayback}
                  onRate={setPlaybackRate}
                  onStep={goToPoint}
                  rotationView={consultRotation}
                  team1={team1}
                  team2={team2}
                  homeConfig={homeConfig}
                  awayConfig={awayConfig}
                  events={events}
                  setsWon1={matchState.setsWon.team1}
                  setsWon2={matchState.setsWon.team2}
                  issues={issues}
                  actionSet={setOfAction}
                />
              )}

              {/* Mode Correction : calage de la vidéo, contrôle des codes. */}
              {mode === 'correction' && (
                <DvCorrectionPane
                  videoNode={videoNode}
                  actions={actions}
                  rallies={rallies}
                  issues={issues}
                  sync={sync}
                  videoTime={currentTime}
                  onAnchorHere={anchorFirstServe}
                  onSyncPatch={patchSync}
                  onSeekAction={seekToAction}
                  onPickZone={(a) => setZoneActionUid(a.uid)}
                  onDirection={setDirection}
                  directionMissing={attacksWithoutDirection(actions).length}
                  onDirectionMissing={goToAttackWithoutDirection}
                  onTimeShift={shiftActionTime}
                  onSetTime={setActionTimeToVideo}
                  onRemove={removeActionByUid}
                  onMove={moveActionByUid}
                  selectedUid={correctUid}
                  onSelect={(a) => setCorrectUid(a.uid)}
                  actionSet={setOfAction}
                  team1={team1}
                  team2={team2}
                  disabled={matchFinished}
                />
              )}

              {/* Mode Analyse : menu des fenêtres, filtres et descente vers les
                  actions (« Click to Rally »), autour des fenêtres elles-mêmes. */}
              {mode === 'analyse' && (
                <>
                  <DvAnalysisMenu
                    windows={analysisWindows}
                    windowKey={tab}
                    onWindow={setTab}
                    onFullScreen={() => setReportFullScreen(true)}
                  />
                  <div className="dvx-analysis-head">
                    <DvFilterPanel
                      filters={consultFilters}
                      onFilters={patchConsultFilters}
                      onResetFilters={() => setConsultFilters(EMPTY_FILTERS)}
                      options={filterOptions}
                      team1={team1}
                      team2={team2}
                      resultCount={consultMatched.length}
                      hasFilters={hasConsultFilters}
                    />
                  </div>
                  <DvDrillDown matches={consultMatched} onSeekAction={seekToAction} pointOf={pointOfAction} />
                </>
              )}

              <AnimatePresence mode="wait">

{mode === 'analyse' && REPORT_TABS.some((t) => t.key === tab) && (
                  <motion.div key="report" className="dv-panel dv-analysis-window" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                    <MatchReportFull
                      report={scouting}
                      context="coding"
                      sets={reportSetsAvailable}
                      activeSets={reportSets}
                      onToggleSet={toggleReportSet}
                      rawActions={actions}
                      events={events}
                      tab={tab}
                      onTab={setTab}
                      hideTabs
                      onDirectionCell={filterByDirection}
                    />
                  </motion.div>
                )}

{mode === 'analyse' && tab === 'frise' && (
                  <motion.div key="frise" className="dv-panel dv-analysis-window" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ChartColumn size={15} /> Frise chronologique
                    </h4>
                    <p className="dv-hint">
                      Une rangée par set : le gros chiffre est le score après le point, la lettre l’issue
                      (S ace, A attaque, B contre, C contrée, F / G / D fautes adverses). Les pastilles <strong>T1 / T2</strong> marquent
                      les temps morts, <strong>R1 / R2</strong> les remplacements. Cliquez un point pour aller à la vidéo.
                    </p>
                    {timelinePoints.length === 0 ? (
                      <p className="dv-hint">
                        Aucun point terminé pour l’instant : la frise se remplit au fil du codage.
                      </p>
                    ) : (
                      <PointTimeline
                        points={timelinePoints}
                        team1={team1}
                        team2={team2}
                        events={timelineEvents}
                        onPointClick={seekToPoint}
                        readOnly
                      />
                    )}

                    {events.length > 0 && (
                      <>
                        <h5 style={{ marginTop: 12 }}>Temps morts et remplacements enregistrés</h5>
                        <ul className="dv-event-list">
                          {events.map((ev) => (
                            <li key={ev.id}>
                              <span>
                                {ev.kind === 'timeout'
                                  ? 'Temps mort'
                                  : ev.kind === 'note'
                                  ? 'Code libre'
                                  : 'Remplacement'}{' '}
                                · set {ev.set_number || 1} · après{' '}
                                {Number(ev.point_number) || 0} point(s) · {ev.team === 'away' ? team2 : team1}
                                {ev.kind === 'substitution' ? ` (n°${ev.payload?.out} → n°${ev.payload?.in})` : ''}
                                {ev.kind === 'note' ? ` (${ev.payload?.text || ''})` : ''}
                              </span>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => removeEvent(ev.id)}
                                title="Supprimer cet événement"
                              >
                                <Trash size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </motion.div>
                )}
                {mode === 'correction' && (
                  <motion.div key="sequences" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                    <h4>Séquences (point par point)</h4>
                    <p className="dv-hint">Cliquez sur <Pencil size={11} /> pour éditer la séquence complète d'un point (ajouter, modifier ou retirer des actions). Le n° de joueur peut être sur 1 ou 2 chiffres.</p>
                    <div className="dv-seq-summary">
                      {rallies.length} point(s) · {ralliesWithErrors.length} en erreur · {errorCount} action(s) défectueuse(s)
                    </div>
                    <div className="dv-seq-list">
                      {rallies.length === 0 && editingRallyUid !== 'NEW' && (
                        <p className="dv-empty">Aucun point codé.</p>
                      )}
                      {rallies.map((r) => {
                        const rallyUid = r.actions[0]?.uid;
                        const isEditing = editingRallyUid === rallyUid;
                        const hasErr = r.actions.some((a) => !validateAction(a.code, codeOpts).valid);
                        return (
                          <div key={rallyUid || r.pointNumber} className={`dv-seq-line ${hasErr ? 'error' : ''} ${isEditing ? 'editing' : ''}`}>
                            <span className="dv-seq-num">P{r.pointNumber}</span>
                            <span className="dv-seq-tc" onClick={() => seekTo(r.actions[0]?.timecode)}>{formatTimecode(r.actions[0]?.timecode)}</span>
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
                                <button className="btn btn-success btn-sm" onClick={saveRallySequence} title="Enregistrer">
                                  <Check size={14} />
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={cancelRallyEdit} title="Annuler">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="dv-seq-blocks">
                                  {r.actions.map((a) => {
                                    const val = validateAction(a.code, codeOpts);
                                    return (
                                      <span
                                        key={a.uid}
                                        className={`dv-seq-block ${val.valid ? '' : 'error'}`}
                                        title={val.valid ? describeCode(a.code, codeOpts) : `✗ ${val.issues.join(', ')}`}
                                        onClick={() => seekTo(a.timecode)}
                                      >
                                        {a.code}
                                      </span>
                                    );
                                  })}
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={() => startEditRally(r)} disabled={matchFinished}><Pencil size={14} /></button>
                                <button className="btn btn-secondary btn-sm" onClick={() => deleteRally(r)} disabled={matchFinished}><Trash size={14} /></button>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {editingRallyUid === 'NEW' && (
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
                              placeholder={lightMode ? '*02S a10A *30A' : '*01S+*02R#*09A#'}
                              autoFocus
                            />
                            <button className="btn btn-success btn-sm" onClick={saveRallySequence}><Check size={14} /></button>
                            <button className="btn btn-secondary btn-sm" onClick={cancelRallyEdit}><X size={14} /></button>
                          </div>
                        </div>
                      )}
                    </div>

                    {editingRallyUid === null && (
                      <button className="btn btn-secondary btn-sm" onClick={startNewPoint} disabled={matchFinished}>+ Nouveau point</button>
                    )}

                    {editingRallyUid !== null && editingSequence.trim() !== '' && (
                      <div className="dv-buffer-preview">
                        {parseSequence(stripSpaces(editingSequence), codeOpts).map((it, i) => (
                          <div key={i} className={`dv-preview-line ${it.valid ? '' : 'error'}`}>
                            <code>{it.code}</code> {it.valid ? describeCode(it.code, codeOpts) : `✗ ${validateAction(it.code, codeOpts).issues.join(', ')}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
                {mode === 'analyse' && tab === 'distribution' && (
                  <motion.div key="distribution" className="dv-panel dv-analysis-window" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                    <h4>Distribution du passeur</h4>
                    <p className="dv-hint">Attaques après réception, par position du passeur dans la rotation. Cliquez la zone de l'attaquant après chaque attaque pour alimenter l'analyse.</p>
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
                      <h5>{teamLabel(distTeam)}{distPos !== 'Total' ? ` — passeur en ${distPos}` : ''}</h5>
                      <DistributionCourt distribution={setterDist[distTeam]?.[distPos]} />
                    </div>
                  </motion.div>
                )}

                {mode === 'parametres' && (
                  <motion.div key="parametres" className="dv-panel" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
                    <h4><Settings size={14} /> Paramètres</h4>

                    <h5 style={{ marginTop: 12 }}>Disposition de l’écran de saisie</h5>
                    <p className="dv-hint">
                      <strong>Disposition DataVolley</strong> range les fenêtres comme le logiciel de référence :
                      vidéo en haut à gauche, score et terrain en dessous, zone de code en bas, liste des codes à
                      droite. <strong>Disposition libre</strong> laisse tout en place pour organiser l’écran à votre
                      façon (chaque fenêtre se déplace par sa barre de titre et se redimensionne par ses bords).
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
                    <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts} />

                    <h5 style={{ marginTop: 20 }}>Fenêtres de codage</h5>
                    <p className="dv-hint">
                      Chaque fenêtre se déplace par sa barre de titre, se redimensionne par ses bords (droit, bas, coin) et
                      se ferme par sa croix — sauf la <strong>vidéo</strong> et la <strong>zone de code</strong>, qui restent
                      toujours affichées. La disposition est mémorisée sur cet appareil.
                    </p>
                    <div className="dv-panels-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMany(['score', 'court', 'positions', 'actions', 'shortcuts', 'aide', 'keypad'], true)}>
                        Tout afficher
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMany(['score', 'court', 'positions', 'actions', 'shortcuts', 'aide', 'keypad'], false)}>
                        Tout masquer
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={resetPanels}>
                        <RotateCcw size={13} /> Réinitialiser la disposition
                      </button>
                    </div>

                    <h5 style={{ marginTop: 20 }}>Codage</h5>
                    <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={autoServe} onChange={(e) => setAutoServe(e.target.checked)} />
                      Pré-remplir le serveur à chaque point validé
                    </label>
                    <p className="dv-hint" style={{ marginTop: 8 }}>
                      Vitesse de lecture actuelle : <strong>{playbackRate}×</strong> (raccourcis « Ralentir », « Accélérer »,
                      « Vitesse normale » ci-dessus).
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>{/* /.vd-main */}
      </div>{/* /.vd-workspace */}

      {/* Fenêtre de commandes (Échap) : temps morts, remplacements, code libre. */}
      <AnimatePresence>
        {showCommand && (
          <DvCommandWindow
            open={showCommand}
            onClose={() => setShowCommand(false)}
            onSubmit={submitCommand}
            team1={team1}
            team2={team2}
            disabled={matchFinished}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSync && (
          <motion.div className="modal-overlay" onClick={() => setShowSync(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}>
              <h2>Synchronisation</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Positionnez la vidéo sur le tout premier service du match, puis cliquez « Ancrer ici ». L’offset est appliqué aux actions codées en direct (system_time).
              </p>
              <div className="dv-sync-info">Offset actuel : {Number(sync.sync_offset || 0).toFixed(2)} s</div>
              <button className="btn btn-primary btn-block" onClick={anchorHere} style={{ marginBottom: 14 }}><Crosshair size={14} /> Ancrer ici (timecode courant)</button>
              <div className="form-group">
                <label>Lead-in (s)</label>
                <input type="number" step="0.5" value={sync.lead_in ?? 4} onChange={(e) => setSync({ ...sync, lead_in: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Lead-out (s)</label>
                <input type="number" step="0.5" value={sync.lead_out ?? 3} onChange={(e) => setSync({ ...sync, lead_out: Number(e.target.value) })} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={saveLead}>Enregistrer</button>
                <button className="btn btn-secondary" onClick={() => setShowSync(false)}>Fermer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTeams && (
          <motion.div className="modal-overlay" onClick={() => setShowTeams(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} style={{ maxWidth: 760 }}>
              <h2><Users size={18} /> Six de départ, rôles et libéro</h2>

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
        {zoneActionUid && (
          <motion.div className="modal-overlay" onClick={() => setZoneActionUid(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} style={{ maxWidth: 560 }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Grid3x3 size={18} /> Corriger la zone
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                La zone fait partie du code DataVolley : on la saisit directement (<code>*09A4#</code>). Utilisez ce
                sélecteur de secours pour corriger une action déjà codée.
              </p>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                Action : <strong>{actions.find((a) => a.uid === zoneActionUid)?.code || '—'}</strong>
              </p>
              <AttackCourtPicker
                onPick={applyZoneToAction}
                selected={attackZoneOf(actions.find((a) => a.uid === zoneActionUid))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setZoneActionUid(null)}>Fermer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remplacement : joueur sortant → joueur entrant (poste conservé). */}
      <AnimatePresence>
        {showSub && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowSub(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal dv-sub-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
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
                  Aucun remplaçant disponible : complétez l’effectif et le six de départ dans l’onglet Paramètres (Équipes).
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
    </div>
  );

}

export default DataVolleyDashboard;





