import React, { useState, useEffect, useMemo } from 'react';
import {
  RotateCw,
  Undo2,
  CheckCircle2,
  Plus,
  Trash2,
  Users,
  ArrowLeft,
  Edit3,
  Check,
  X,
  ChevronRight,
  Sparkles,
  ArrowLeftRight,
} from 'lucide-react';
import {
  ROTATIONS_ORDER,
  SERVICE_OPTIONS,
  ZONE_R_GRID,
  QUALITE_R_OPTIONS,
  ZONE_P_ROWS,
  ZONE_P_EXTRA,
  ZONE_2D_COORDS,
  DISTRIB_2D_COORDS,
  BASE_OFF_OPTIONS,
  DEFAULT_PLAYERS,
  RES_ATT_OPTIONS,
  TEAM_ROLES,
  DEFAULT_TEAM_LINEUP,
  formatSetterLabel,
  computeLineupAtRotation,
  resolveAttackerForDistrib,
} from '../utils/scoutingEngine';

const LINEUP_STORAGE_KEY = 'pancake_dist_team_lineup_v1';

const STEP_LABELS = [
  { num: 1, title: 'Service' },
  { num: 2, title: 'Récep & Passe (2D)' },
  { num: 3, title: 'Annonce Central' },
  { num: 4, title: 'Distribution (2D)' },
  { num: 5, title: 'Résultat' },
];

const BTN_TONES = {
  emerald: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/30',
  teal: 'border-teal-400/50 bg-teal-500/15 text-teal-100 hover:bg-teal-500/30',
  amber: 'border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/30',
  orange: 'border-orange-400/50 bg-orange-500/15 text-orange-100 hover:bg-orange-500/30',
  rose: 'border-rose-400/50 bg-rose-500/15 text-rose-100 hover:bg-rose-500/30',
  red: 'border-red-500/60 bg-red-600/20 text-red-100 hover:bg-red-600/35',
  slate: 'border-slate-500/50 bg-slate-700/40 text-slate-100 hover:bg-slate-700/60',
  yellow: 'border-yellow-400/50 bg-yellow-500/15 text-yellow-100 hover:bg-yellow-500/30',
};

const BTN_TONES_ACTIVE = {
  emerald: 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/30',
  teal: 'border-teal-300 bg-teal-400 text-slate-950 shadow-xl shadow-teal-400/30',
  amber: 'border-amber-200 bg-amber-400 text-slate-950 shadow-xl shadow-amber-400/30',
  orange: 'border-orange-200 bg-orange-500 text-slate-950 shadow-xl shadow-orange-500/30',
  rose: 'border-rose-200 bg-rose-500 text-white shadow-xl shadow-rose-500/30',
  red: 'border-red-200 bg-red-600 text-white shadow-xl shadow-red-600/30',
  slate: 'border-white bg-slate-200 text-slate-950 shadow-xl shadow-slate-200/20',
  yellow: 'border-yellow-200 bg-yellow-400 text-slate-950 shadow-xl shadow-yellow-400/30',
};

const ROLE_BADGE_STYLE = {
  Passeur: 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200',
  Pointu: 'border-amber-400/60 bg-amber-500/20 text-amber-200',
  R4: 'border-sky-400/60 bg-sky-500/20 text-sky-200',
  Central: 'border-purple-400/60 bg-purple-500/20 text-purple-200',
};

export default function TabletSaisieView({
  rows,
  allMatches,
  allSetters = [],
  sheetConfigs,
  teamLineup: externalTeamLineup,
  onChangeTeamLineup,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onUndoLast,
  onAddMatch,
  onDeleteMatch,
  onRenameMatch,
  onAddSetter,
  onDeleteSetter,
  onCreateSheet,
  onRequestBlankReset,
}) {
  const defaultMatch = allMatches[allMatches.length - 1] || '';
  const [selectedMatch, setSelectedMatch] = useState(defaultMatch);
  const [selectedRotation, setSelectedRotation] = useState('1');

  useEffect(() => {
    if (allMatches.length === 0) {
      if (selectedMatch !== '') setSelectedMatch('');
    } else if (!allMatches.some((m) => m.toUpperCase() === selectedMatch.toUpperCase())) {
      setSelectedMatch(allMatches[allMatches.length - 1]);
    }
  }, [allMatches, selectedMatch]);

  const matchActionCounts = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const k = String(r.match || '').trim().toUpperCase();
      if (k) map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [rows]);

  const setterActionCounts = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const k = String(r.setter || '').trim().toUpperCase();
      if (k) map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [rows]);

  // Composition de départ (Postes 1..6 : numéro + rôle)
  const [internalTeamLineup, setInternalTeamLineup] = useState(() => {
    try {
      const saved = localStorage.getItem(LINEUP_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_TEAM_LINEUP;
  });
  const teamLineup = externalTeamLineup || internalTeamLineup;
  const setTeamLineup = (updater) => {
    if (onChangeTeamLineup) {
      onChangeTeamLineup(updater);
    } else {
      setInternalTeamLineup(updater);
    }
  };
  const [setterOverrideNP, setSetterOverrideNP] = useState(false);

  useEffect(() => {
    if (externalTeamLineup) return;
    try {
      localStorage.setItem(LINEUP_STORAGE_KEY, JSON.stringify(internalTeamLineup));
    } catch {
      // ignore
    }
  }, [externalTeamLineup, internalTeamLineup]);

  // Étape active : 1 (Service) -> 2 (Terrain 2D Récep/Qualité puis Passe) -> 3 (Annonce Central) -> 4 (Terrain 2D Distrib) -> 5 (Résultat)
  const [step, setStep] = useState(1);

  // Champs d'une action
  const [service, setService] = useState('');
  const [zoneR, setZoneR] = useState('');
  const [qualiteR, setQualiteR] = useState('');
  const [zoneP, setZoneP] = useState('');
  const [baseOff, setBaseOff] = useState('');
  const [distribP, setDistribP] = useState('');
  const [joueur, setJoueur] = useState('');
  const [resAtt, setResAtt] = useState('');

  const [editingRowId, setEditingRowId] = useState(null);
  const [hoverZoneP, setHoverZoneP] = useState('');
  const [hoverDistribP, setHoverDistribP] = useState('');
  const [showLineupModal, setShowLineupModal] = useState(false);
  const [activeLineupSlot, setActiveLineupSlot] = useState(1);
  const [customPlayerDraft, setCustomPlayerDraft] = useState('');

  const [showNewMatchModal, setShowNewMatchModal] = useState(false);
  const [newMatchName, setNewMatchName] = useState('');
  const [targetSheetIds, setTargetSheetIds] = useState([]);
  const [inlineNewSheetName, setInlineNewSheetName] = useState('');
  const [inlineNewSheetSetter, setInlineNewSheetSetter] = useState('6');
  const [showInlineNewSheet, setShowInlineNewSheet] = useState(false);
  const [confirmDeleteMatch, setConfirmDeleteMatch] = useState(null);
  const [editingMatchName, setEditingMatchName] = useState(null);
  const [editingMatchDraft, setEditingMatchDraft] = useState('');

  const [showSetterModal, setShowSetterModal] = useState(false);
  const [newSetterCode, setNewSetterCode] = useState('');
  const [newSetterName, setNewSetterName] = useState('');
  const [createSheetForSetter, setCreateSheetForSetter] = useState(false);
  const [confirmDeleteSetter, setConfirmDeleteSetter] = useState(null);

  const [showSubModal, setShowSubModal] = useState(false);
  const [subSelectedOrigZone, setSubSelectedOrigZone] = useState(null);
  const [subIncomingCustomNum, setSubIncomingCustomNum] = useState('');
  const [subIncomingRole, setSubIncomingRole] = useState('');

  const [toast, setToast] = useState(null);

  const triggerToast = (msg, tone = 'emerald') => {
    setToast({ msg, tone });
    window.clearTimeout(window.__pancakeToastTimer);
    window.__pancakeToastTimer = window.setTimeout(() => setToast(null), 2400);
  };

  // Synchroniser le numéro du Passeur dans teamLineup quand allSetters change (ex: suppression / remise à zéro)
  useEffect(() => {
    setTeamLineup((prev) => {
      const pZone =
        Object.keys(prev).find((z) => prev[z]?.role === 'Passeur') || '1';
      const curNum = String(prev[pZone]?.num || '').trim().toUpperCase();
      if (allSetters.length === 0) {
        if (!curNum) return prev;
        return {
          ...prev,
          [pZone]: { ...prev[pZone], role: prev[pZone]?.role || 'Passeur', num: '' },
        };
      }
      const stillExists = allSetters.some(
        (s) => String(s?.code || '').trim().toUpperCase() === curNum
      );
      if (stillExists) return prev;
      return {
        ...prev,
        [pZone]: {
          ...prev[pZone],
          role: prev[pZone]?.role || 'Passeur',
          num: allSetters[0].code,
        },
      };
    });
  }, [allSetters]);

  // Calcul des positions actuelles selon la rotation sélectionnée
  const lineupInfo = useMemo(
    () => computeLineupAtRotation(teamLineup, selectedRotation),
    [teamLineup, selectedRotation]
  );

  const activeSetterCode = setterOverrideNP
    ? 'NP'
    : lineupInfo.passeur?.num || allSetters[0]?.code || 'NP';

  const allPlayerNumbers = useMemo(() => {
    const nums = new Set(DEFAULT_PLAYERS.map((p) => p.num));
    Object.values(teamLineup).forEach((slot) => {
      if (slot?.num) nums.add(String(slot.num).trim());
    });
    rows.forEach((r) => {
      if (r.joueur) nums.add(String(r.joueur).trim());
    });
    return Array.from(nums).sort((a, b) => Number(a) - Number(b));
  }, [teamLineup, rows]);

  const activeSubsList = useMemo(() => {
    return Object.values(lineupInfo.byZone || {}).filter(
      (z) => z.starterNum && z.starterNum !== z.num
    );
  }, [lineupInfo]);
  const activeSubsCount = activeSubsList.length;

  const onCourtNumbers = useMemo(() => {
    const set = new Set();
    Object.values(teamLineup || {}).forEach((slot) => {
      if (slot?.num) set.add(String(slot.num).trim());
    });
    return set;
  }, [teamLineup]);

  const benchPlayerNumbers = useMemo(() => {
    const set = new Set(allPlayerNumbers);
    allSetters.forEach((s) => {
      if (s?.code && s.code !== 'NP') set.add(String(s.code).trim());
    });
    Object.values(teamLineup || {}).forEach((slot) => {
      if (slot?.starterNum) set.add(String(slot.starterNum).trim());
    });
    return Array.from(set)
      .filter((n) => n && !onCourtNumbers.has(n))
      .sort((a, b) => Number(a) - Number(b));
  }, [allPlayerNumbers, allSetters, teamLineup, onCourtNumbers]);

  const matchActionCount = useMemo(
    () =>
      selectedMatch
        ? rows.filter((r) => r.match.toUpperCase() === selectedMatch.toUpperCase()).length
        : 0,
    [rows, selectedMatch]
  );

  const [showAllRecent, setShowAllRecent] = useState(false);

  const recentRows = useMemo(
    () => [...rows].slice(showAllRecent ? -12 : -1).reverse(),
    [rows, showAllRecent]
  );

  const resetForNextAction = () => {
    setService('');
    setZoneR('');
    setQualiteR('');
    setZoneP('');
    setBaseOff('');
    setDistribP('');
    setJoueur('');
    setResAtt('');
    setHoverZoneP('');
    setHoverDistribP('');
    setEditingRowId(null);
    setStep(1);
  };

  const handleRotateNext = () => {
    const idx = ROTATIONS_ORDER.indexOf(selectedRotation);
    const next = ROTATIONS_ORDER[(idx + 1) % ROTATIONS_ORDER.length];
    setSelectedRotation(next);
  };

  // --- SÉQUENCE AUTOMATIQUE DES ÉTAPES ---
  const handleChooseService = (code) => {
    setService(code);
    setStep(2);
  };

  const handleChooseZoneR = (code) => {
    setZoneR(code);
  };

  const handleChooseQualiteR = (code) => {
    setQualiteR(code);
    if (code !== '+' && code !== '#') {
      setBaseOff('0');
    }
  };

  const handleChooseZoneP = (code) => {
    setZoneP(code);
    if (qualiteR !== '+' && qualiteR !== '#') {
      setBaseOff('0');
      setStep(4);
    } else {
      setStep(3);
    }
  };

  const handleChooseBaseOff = (code) => {
    setBaseOff(code);
    setStep(4);
  };

  const handleChooseDistribP = (code) => {
    setDistribP(code);
    const autoJoueur = resolveAttackerForDistrib(code, lineupInfo);
    if (autoJoueur) {
      setJoueur(autoJoueur);
    }
    setStep(5);
  };

  const handleChooseResAtt = (code) => {
    setResAtt(code);
    const effectiveMatch = selectedMatch || 'MATCH 1';
    const finalJoueur = joueur || resolveAttackerForDistrib(distribP, lineupInfo) || '1';
    const payload = {
      match: effectiveMatch,
      rotation: selectedRotation,
      setter: activeSetterCode,
      service: service || 'F',
      zoneR: zoneR || '6',
      qualiteR: qualiteR || '#',
      zoneP: zoneP || '3',
      baseOff: baseOff || '1',
      distribP: distribP || '5',
      joueur: finalJoueur,
      resAtt: code,
    };

    if (editingRowId !== null) {
      onUpdateRow(editingRowId, payload);
      triggerToast(`Ligne #${editingRowId} mise à jour`, 'sky');
    } else {
      onAddRow(payload);
      if (!selectedMatch) {
        setSelectedMatch(effectiveMatch);
      }
      triggerToast(
        `${effectiveMatch} • P${selectedRotation} • ${payload.distribP} → #${payload.joueur} (${code})`,
        'emerald'
      );
    }
    resetForNextAction();
  };

  const handleLoadForEdit = (row) => {
    setEditingRowId(row.id);
    setSelectedMatch(row.match || selectedMatch);
    setSelectedRotation(row.rotation || selectedRotation);
    setService(row.service || 'F');
    setZoneR(row.zoneR || '');
    setQualiteR(row.qualiteR || '');
    setZoneP(row.zoneP || '');
    setBaseOff(row.baseOff || '');
    setDistribP(row.distribP || '');
    setJoueur(row.joueur || '');
    setResAtt(row.resAtt || '');
    setStep(1);
    triggerToast(`Modification ligne #${row.id}`, 'sky');
  };

  const updateLineupSlot = (zoneNum, patch) => {
    setTeamLineup((prev) => ({
      ...prev,
      [zoneNum]: {
        ...prev[zoneNum],
        ...patch,
        ...(patch.num !== undefined ? { starterNum: null, subRot: null } : {}),
      },
    }));
  };

  const openSubModal = (defaultOrigZone = null) => {
    const slots = Object.values(lineupInfo.byZone || {});
    const chosenSlot =
      (defaultOrigZone && slots.find((s) => s.origZone === defaultOrigZone)) ||
      slots.find((s) => s.starterNum && s.starterNum !== s.num) ||
      lineupInfo.byZone?.[4] ||
      slots[0];
    setSubSelectedOrigZone(chosenSlot?.origZone || 1);
    setSubIncomingRole(chosenSlot?.role || 'R4');
    setSubIncomingCustomNum('');
    setShowSubModal(true);
  };

  const handleSelectSubOutgoing = (origZone, role) => {
    setSubSelectedOrigZone(origZone);
    setSubIncomingRole(role || 'R4');
    setSubIncomingCustomNum('');
  };

  const handlePerformSubstitution = (origZone, incomingNum, incomingRole) => {
    const cleanIn = String(incomingNum || '').trim();
    const curSlot = teamLineup?.[origZone];
    if (!origZone || !curSlot || !cleanIn || cleanIn === curSlot.num) return;

    const nextRole = incomingRole || curSlot.role || 'R4';
    const isReturningStarter = curSlot.starterNum && cleanIn === curSlot.starterNum;
    const nextSlot = isReturningStarter
      ? { num: cleanIn, role: nextRole, starterNum: null, subRot: null }
      : {
          num: cleanIn,
          role: nextRole,
          starterNum: curSlot.starterNum || curSlot.num,
          subRot: selectedRotation,
        };

    setTeamLineup((prev) => ({
      ...prev,
      [origZone]: {
        ...prev[origZone],
        ...nextSlot,
      },
    }));

    if (nextRole === 'Passeur') {
      setSetterOverrideNP(false);
      if (
        onAddSetter &&
        !allSetters.some((s) => s.code.toUpperCase() === cleanIn.toUpperCase())
      ) {
        onAddSetter({ code: cleanIn, name: '' });
      }
    }

    setSubIncomingCustomNum('');
    triggerToast(
      isReturningStarter
        ? `Retour titulaire : #${curSlot.num} sort ➔ #${cleanIn} entre (${nextRole})`
        : `Changement : #${curSlot.num} sort ➔ #${cleanIn} entre (${nextRole})`,
      isReturningStarter ? 'sky' : 'emerald'
    );
  };

  const handleRevertAllSubstitutions = () => {
    setTeamLineup((prev) => {
      const next = {};
      Object.entries(prev).forEach(([z, slot]) => {
        if (slot?.starterNum) {
          next[z] = {
            ...slot,
            num: slot.starterNum,
            starterNum: null,
            subRot: null,
          };
        } else {
          next[z] = slot;
        }
      });
      return next;
    });
    triggerToast('6 de départ rétabli (tous titulaires revenus sur le terrain)', 'sky');
  };

  const selectActiveSetter = (code) => {
    const clean = String(code || '').trim().toUpperCase();
    if (!clean || clean === 'NP') {
      setSetterOverrideNP(true);
      return;
    }
    setSetterOverrideNP(false);
    setTeamLineup((prev) => {
      const pZone = Object.keys(prev).find((z) => prev[z]?.role === 'Passeur') || '1';
      return {
        ...prev,
        [pZone]: {
          ...prev[pZone],
          role: prev[pZone]?.role || 'Passeur',
          num: clean,
          starterNum: null,
          subRot: null,
        },
      };
    });
  };

  const openSetterModal = (preConfirmCode = null) => {
    setNewSetterCode('');
    setNewSetterName('');
    setCreateSheetForSetter(false);
    setConfirmDeleteSetter(typeof preConfirmCode === 'string' ? preConfirmCode : null);
    setShowSetterModal(true);
  };

  const handleCreateSetter = (e) => {
    e.preventDefault();
    const cleanCode = newSetterCode.trim().toUpperCase();
    const cleanName = newSetterName.trim().toUpperCase();
    if (!cleanCode || cleanCode === 'NP' || !onAddSetter) return;
    const addedCode = onAddSetter({
      code: cleanCode,
      name: cleanName,
      createSheet: createSheetForSetter,
    });
    if (addedCode) {
      selectActiveSetter(addedCode);
    }
    setNewSetterCode('');
    setNewSetterName('');
    setCreateSheetForSetter(false);
    setShowSetterModal(false);
    triggerToast(
      `Passeur #${cleanCode}${cleanName ? ` (${cleanName})` : ''} sélectionné`,
      'emerald'
    );
  };

  const openNewMatchModal = (opts = {}) => {
    const preConfirmDelete =
      typeof opts === 'string' ? opts : opts?.preConfirmDelete || null;
    const preEditMatch =
      typeof opts === 'object' && opts !== null ? opts?.preEditMatch || null : null;
    setNewMatchName('');
    setConfirmDeleteMatch(preConfirmDelete);
    setEditingMatchName(preEditMatch);
    setEditingMatchDraft(preEditMatch || '');
    // Pré-sélectionner les feuilles qui correspondent au passeur actif ou toutes s'il n'y en a qu'1-2
    const matchingSheets = sheetConfigs
      .filter((c) => c.setter === 'ALL' || c.setter === activeSetterCode)
      .map((c) => c.id);
    setTargetSheetIds(matchingSheets.length > 0 ? matchingSheets : sheetConfigs.map((c) => c.id));
    setShowInlineNewSheet(sheetConfigs.length === 0);
    setInlineNewSheetName('');
    setInlineNewSheetSetter(
      activeSetterCode === 'NP' || !activeSetterCode
        ? allSetters[0]?.code || 'ALL'
        : activeSetterCode
    );
    setShowNewMatchModal(true);
  };

  const handleConfirmRenameMatch = (oldName) => {
    if (!onRenameMatch) return;
    const renamed = onRenameMatch(oldName, editingMatchDraft);
    if (renamed) {
      if (selectedMatch.toUpperCase() === oldName.toUpperCase()) {
        setSelectedMatch(renamed);
      }
      triggerToast(`Match "${oldName}" renommé en "${renamed}"`, 'emerald');
    }
    setEditingMatchName(null);
    setEditingMatchDraft('');
  };

  const toggleTargetSheet = (id) => {
    setTargetSheetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateInlineSheet = () => {
    const clean = inlineNewSheetName.trim();
    if (!clean || !onCreateSheet) return;
    const createdId = onCreateSheet({ title: clean, setter: inlineNewSheetSetter });
    if (createdId) {
      setTargetSheetIds((prev) => [...prev, createdId]);
    }
    setInlineNewSheetName('');
    setShowInlineNewSheet(false);
  };

  const handleCreateMatch = (e) => {
    e.preventDefault();
    const trimmed = newMatchName.trim().toUpperCase();
    if (!trimmed) return;
    let finalTargetIds = [...targetSheetIds];
    if (showInlineNewSheet && inlineNewSheetName.trim() && onCreateSheet) {
      const createdId = onCreateSheet({
        title: inlineNewSheetName.trim(),
        setter: inlineNewSheetSetter,
      });
      if (createdId) finalTargetIds.push(createdId);
      setInlineNewSheetName('');
      setShowInlineNewSheet(false);
    }
    onAddMatch(trimmed, finalTargetIds);
    setSelectedMatch(trimmed);
    setNewMatchName('');
    setShowNewMatchModal(false);
    triggerToast(
      finalTargetIds.length > 0
        ? `Match "${trimmed}" ajouté (${finalTargetIds.length} feuille(s))`
        : `Match "${trimmed}" ajouté`,
      'emerald'
    );
  };

  // Coordonnées pour tracer les flèches bleues ① -> ② et ② -> Attaque sur les terrains 2D
  const rCoord = zoneR ? ZONE_2D_COORDS[zoneR] : null;
  const activeZonePForArrow = zoneP || hoverZoneP;
  const pCoord = activeZonePForArrow ? ZONE_2D_COORDS[activeZonePForArrow] : null;
  const activeDistribForArrow = distribP || hoverDistribP;
  const dCoord = activeDistribForArrow ? DISTRIB_2D_COORDS[activeDistribForArrow] : null;

  // Sous-état de l'étape 2 : 'recep' (choisir zoneR puis qualiteR) -> 'passe' (choisir zoneP)
  const step2Phase = !zoneR || !qualiteR ? 'recep' : 'passe';

  // Helper pour étiqueter chaque bouton d'attaque dans l'étape 4 avec le joueur automatique
  const getAutoTag = (distribCode) => {
    const num = resolveAttackerForDistrib(distribCode, lineupInfo);
    if (distribCode === '6' || distribCode === '8') return `Pt #${num || '?'}`;
    if (distribCode === '5' || distribCode === '9' || distribCode === '4') {
      return `R4 Av #${num || '?'}`;
    }
    if (distribCode === '10') return `R4 Arr #${num || '?'}`;
    if (['1', '1C', '2', '3', '7'].includes(distribCode)) return `C Av #${num || '?'}`;
    if (distribCode === 'PM') return `P #${num || '?'}`;
    return '';
  };

  const canGoToStep = (targetStep) => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return Boolean(service);
    if (targetStep === 3) return Boolean(service && zoneR && qualiteR && zoneP);
    if (targetStep === 4) return Boolean(service && zoneR && qualiteR && zoneP && baseOff);
    if (targetStep === 5) return Boolean(service && zoneR && qualiteR && zoneP && baseOff && distribP);
    return false;
  };

  return (
    <div className="flex flex-col gap-3 pb-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur-md ${
            toast.tone === 'emerald'
              ? 'border-emerald-400/60 bg-emerald-950/95 text-emerald-100'
              : toast.tone === 'sky'
                ? 'border-sky-400/60 bg-sky-950/95 text-sky-100'
                : 'border-amber-400/60 bg-amber-950/95 text-amber-100'
          }`}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* BARRE DE CONTEXTE COMPACTE (Match, Compo 6 de départ, Rotation, Undo) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-2.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Match + Gérer */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Match actif"
              value={selectedMatch}
              onChange={(e) => setSelectedMatch(e.target.value)}
              className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-black text-white outline-none focus:border-emerald-400"
            >
              {allMatches.length === 0 && <option value="">— Aucun match —</option>}
              {allMatches.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => openNewMatchModal()}
              className="flex h-10 items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Gérer Matchs
            </button>
            {selectedMatch && allMatches.length > 0 && onRenameMatch && (
              <button
                type="button"
                onClick={() => openNewMatchModal({ preEditMatch: selectedMatch })}
                title={`Renommer le match ${selectedMatch}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/35 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 active:scale-95"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            {selectedMatch && allMatches.length > 0 && onDeleteMatch && (
              <button
                type="button"
                onClick={() => openNewMatchModal({ preConfirmDelete: selectedMatch })}
                title={`Supprimer le match ${selectedMatch}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <span className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300">
              {matchActionCount} act.
            </span>
          </div>

          {/* Passeur + Gérer Passeurs + Composition de départ */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Passeur actif"
              value={setterOverrideNP || !activeSetterCode ? 'NP' : activeSetterCode}
              onChange={(e) => selectActiveSetter(e.target.value)}
              className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-black text-emerald-300 outline-none focus:border-emerald-400"
            >
              {!setterOverrideNP &&
                activeSetterCode &&
                activeSetterCode !== 'NP' &&
                !allSetters.some((s) => s.code === activeSetterCode) && (
                  <option value={activeSetterCode}>N° {activeSetterCode}</option>
                )}
              {allSetters.map((s) => (
                <option key={s.code} value={s.code}>
                  {formatSetterLabel(s)}
                </option>
              ))}
              <option value="NP">NP (Non passeur)</option>
            </select>
            <button
              type="button"
              onClick={() => openSetterModal()}
              className="flex h-10 items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/15 px-2.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Gérer Passeurs
            </button>
            {activeSetterCode &&
              activeSetterCode !== 'NP' &&
              allSetters.length > 0 &&
              onDeleteSetter && (
                <button
                  type="button"
                  onClick={() => openSetterModal(activeSetterCode)}
                  title={`Supprimer le passeur N° ${activeSetterCode}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

            <button
              type="button"
              onClick={() => setShowLineupModal(true)}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 text-xs font-black text-purple-100 hover:bg-purple-500/30 active:scale-95"
            >
              <Users className="h-4 w-4 text-purple-300" />
              6 de départ
            </button>

            <button
              type="button"
              onClick={() => openSubModal()}
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black transition active:scale-95 ${
                activeSubsCount > 0
                  ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
              }`}
              title="Faire entrer un remplaçant à la place d'un joueur"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Changement{activeSubsCount > 0 ? ` (${activeSubsCount})` : ''}
            </button>

            <div className="hidden xl:flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-[11px] font-bold">
              <span className="text-emerald-300">
                P #{activeSetterCode}
                {!setterOverrideNP && lineupInfo.passeur?.starterNum ? '⇄' : ''}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-300">
                Pt #{lineupInfo.pointu?.num || '?'}
                {lineupInfo.pointu?.starterNum ? '⇄' : ''}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-300">
                R4 Av #{lineupInfo.r4Front?.num || '?'}
                {lineupInfo.r4Front?.starterNum ? '⇄' : ''}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-200/80">
                Pipe #{lineupInfo.r4Back?.num || '?'}
                {lineupInfo.r4Back?.starterNum ? '⇄' : ''}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-purple-300">
                C Av #{lineupInfo.centralFront?.num || '?'}
                {lineupInfo.centralFront?.starterNum ? '⇄' : ''}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSetterOverrideNP((v) => !v)}
              className={`h-10 rounded-xl border px-2.5 text-xs font-black transition ${
                setterOverrideNP
                  ? 'border-amber-300 bg-amber-400 text-slate-950'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Basculer N° P sur NP (non-passeur) pour cette balle"
            >
              NP
            </button>
          </div>

          {/* Rotation + Tourner + Annuler */}
          <div className="flex flex-wrap items-center gap-1">
            {ROTATIONS_ORDER.map((rot) => {
              const active = selectedRotation === rot;
              return (
                <button
                  key={rot}
                  type="button"
                  onClick={() => setSelectedRotation(rot)}
                  className={`h-10 w-10 rounded-xl border text-xs font-black transition active:scale-95 ${
                    active
                      ? 'border-sky-300 bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  P{rot}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleRotateNext}
              className="flex h-10 items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/15 px-2.5 text-xs font-bold text-sky-300 active:scale-95"
              title="Rotation suivante"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Tourner
            </button>
            <button
              type="button"
              onClick={() => {
                const removed = onUndoLast();
                if (removed) {
                  triggerToast(
                    `Dernière action annulée (${removed.distribP} → #${removed.joueur})`,
                    'amber'
                  );
                }
              }}
              disabled={rows.length === 0}
              className="flex h-10 items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs font-bold text-amber-200 disabled:opacity-40 active:scale-95"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Annuler
            </button>
            {onRequestBlankReset && (
              <button
                type="button"
                onClick={onRequestBlankReset}
                className="flex h-10 items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-2.5 text-xs font-bold text-rose-200 active:scale-95"
                title="Tout vider et repartir à zéro"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Vider
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FIL D'ARIANE DES ÉTAPES (STEPPER) */}
      <div className="flex items-center justify-between gap-1.5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
        <div className="flex items-center gap-1.5 min-w-max">
          {STEP_LABELS.map((s, idx) => {
            const isCurrent = step === s.num;
            const enabled = canGoToStep(s.num);
            let badgeVal = '';
            if (s.num === 1 && service) badgeVal = service;
            if (s.num === 2 && zoneR && qualiteR && zoneP) badgeVal = `${zoneR}${qualiteR}→${zoneP}`;
            else if (s.num === 2 && zoneR) badgeVal = `${zoneR}${qualiteR || '?'}`;
            if (s.num === 3 && baseOff) badgeVal = `B${baseOff}`;
            if (s.num === 4 && distribP) badgeVal = `${distribP} (#${joueur})`;
            if (s.num === 5 && resAtt) badgeVal = resAtt;

            return (
              <React.Fragment key={s.num}>
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && setStep(s.num)}
                  className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                    isCurrent
                      ? 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-md'
                      : badgeVal
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                        : enabled
                          ? 'border-slate-700 bg-slate-800 text-slate-300'
                          : 'border-slate-800/70 bg-slate-900/40 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <span className="font-black">{s.num}.</span>
                  <span>{s.title}</span>
                  {badgeVal && (
                    <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-black">
                      {badgeVal}
                    </span>
                  )}
                </button>
                {idx < STEP_LABELS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {(service || editingRowId !== null) && (
          <button
            type="button"
            onClick={resetForNextAction}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700"
          >
            Recommencer action
          </button>
        )}
      </div>

      {/* ===================================================================== */}
      {/* ZONE PRINCIPALE PLEIN ÉCRAN : 1 SEULE ÉTAPE AFFICHÉE EN GRAND          */}
      {/* ===================================================================== */}
      <div className="min-h-[68vh] rounded-3xl border border-slate-800 bg-slate-900/95 p-4 md:p-6 shadow-2xl flex flex-col justify-between">
        {/* ÉTAPE 1 : SERVICE */}
        {step === 1 && (
          <div className="flex flex-1 flex-col justify-center gap-6">
            <div className="text-center">
              <span className="inline-block rounded-full border border-indigo-400/40 bg-indigo-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-indigo-300">
                Étape 1 / 5 •{' '}
                {editingRowId
                  ? `Modification ligne #${editingRowId}`
                  : `${selectedMatch || 'Aucun match'} • P${selectedRotation}`}
              </span>
              <h2 className="mt-2 text-2xl md:text-3xl font-black text-white">
                Quel type de SERVICE / BALLE ?
              </h2>
              <p className="mt-1 text-xs md:text-sm text-slate-400">
                Touchez un bouton pour passer directement au terrain 2D (Réception & Passe)
              </p>
            </div>

            <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-4">
              {SERVICE_OPTIONS.map((opt) => {
                const active = service === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => handleChooseService(opt.code)}
                    className={`flex h-36 md:h-44 flex-col items-center justify-center rounded-3xl border-2 transition active:scale-[0.97] ${
                      active
                        ? 'border-indigo-200 bg-indigo-500 text-white shadow-2xl shadow-indigo-500/30'
                        : 'border-slate-700 bg-slate-800/90 text-white hover:border-indigo-400/60 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-5xl md:text-6xl font-black leading-none">{opt.code}</span>
                    <span className="mt-2 text-sm md:text-base font-bold text-slate-300">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : TERRAIN 2D CLIQUABLE — RÉCEPTION ① + QUALITÉ, PUIS PASSE ② */}
        {step === 2 && (
          <div className="flex flex-1 flex-col gap-4">
            {/* En-tête dynamique 2a / 2b */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex h-10 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Service ({service})
                </button>
                <div>
                  <h2 className="text-lg md:text-2xl font-black text-white">
                    {step2Phase === 'recep'
                      ? !zoneR
                        ? 'Étape 2A — Point ① : Touchez la ZONE DE RÉCEPTION sur le terrain'
                        : `Étape 2A — Réception en Zone ${zoneR} : Qualifiez la réception`
                      : 'Étape 2B — Point ② : Touchez la ZONE DE PASSE sur le terrain'}
                  </h2>
                </div>
              </div>

              {step2Phase === 'passe' && (
                <button
                  type="button"
                  onClick={() => {
                    setZoneR('');
                    setQualiteR('');
                    setZoneP('');
                  }}
                  className="h-10 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-bold text-amber-200"
                >
                  Modifier Point ① ({zoneR} {qualiteR})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
              {/* TERRAIN 2D CONFORME AU SCHÉMA JOINT (media_1794871523907_6d2056e5.png) */}
              <div className="lg:col-span-8 flex flex-col items-center">
                <div className="w-full max-w-[580px] rounded-2xl border-2 border-slate-600 bg-[#f8fafc] p-3 text-slate-900 shadow-2xl">
                  {/* Bande repère camp adverse (haut) comme sur le schéma */}
                  <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Camp Adverse (Repère : 2 • 3 • 4 au filet)
                  </div>
                  <div className="grid grid-cols-3 border-x-2 border-t-2 border-black bg-slate-100/80 text-center text-xs font-bold text-slate-400 h-10">
                    <div className="flex items-center justify-center border-r border-slate-300">2</div>
                    <div className="flex items-center justify-center border-r border-slate-300">3</div>
                    <div className="flex items-center justify-center">4</div>
                  </div>

                  {/* FILET ÉPAIS NOIR */}
                  <div className="relative flex h-3 w-full items-center justify-center bg-black">
                    <span className="rounded bg-black px-2 text-[9px] font-black tracking-widest text-white">
                      FILET
                    </span>
                  </div>

                  {/* NOTRE DEMI-TERRAIN INTERACTIF (4-3-2 / 7-8-9 / 5-6-1) */}
                  <div
                    className="relative border-2 border-t-0 border-black bg-emerald-50 w-full select-none overflow-hidden"
                    style={{ paddingBottom: '100%', height: 0 }}
                  >
                    <div className="absolute inset-0">
                    {/* Ligne des 3m épaisse (33.3% depuis le filet) */}
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-black"
                      style={{ top: '33.33%' }}
                    />
                    {/* Ligne médiane arrière (66.6%) */}
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 border-t border-slate-400"
                      style={{ top: '66.66%' }}
                    />
                    {/* Séparations verticales des 3 couloirs */}
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-slate-400"
                      style={{ left: '33.33%' }}
                    />
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-slate-400"
                      style={{ left: '66.66%' }}
                    />

                    {/* COUCHE SVG FLÈCHE BLEUE ① -> ② */}
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                    >
                      <defs>
                        <marker
                          id="blueArrow"
                          markerWidth="6"
                          markerHeight="6"
                          refX="4"
                          refY="3"
                          orient="auto"
                        >
                          <path d="M0,0 L6,3 L0,6 Z" fill="#0284c7" />
                        </marker>
                      </defs>
                      {rCoord && pCoord && (
                        <line
                          x1={rCoord.x}
                          y1={rCoord.y}
                          x2={pCoord.x}
                          y2={pCoord.y}
                          stroke="#0284c7"
                          strokeWidth="1.6"
                          markerEnd="url(#blueArrow)"
                        />
                      )}
                    </svg>

                    {/* MODE 2A : CLIC SUR LES 9 ZONES DE RÉCEPTION (4-3-2 / 7-8-9 / 5-6-1) */}
                    {step2Phase === 'recep' && (
                      <div className="relative z-10 grid h-full w-full grid-cols-3 grid-rows-3">
                        {ZONE_R_GRID.flat().map((cell) => {
                          const isSelected = zoneR === cell.code;
                          return (
                            <button
                              key={cell.code}
                              type="button"
                              onClick={() => handleChooseZoneR(cell.code)}
                              className={`relative flex flex-col items-center justify-center transition active:scale-95 ${
                                isSelected
                                  ? 'bg-sky-500/25 ring-4 ring-inset ring-sky-500'
                                  : 'hover:bg-emerald-200/50'
                              }`}
                            >
                              <span
                                className={`text-2xl md:text-3xl font-black ${
                                  isSelected ? 'text-sky-700' : 'text-slate-600'
                                }`}
                              >
                                {cell.code}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500">
                                {cell.hint}
                              </span>
                              {isSelected && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white shadow">
                                  ① Récep {qualiteR}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* MODE 2B : CLIC SUR LES ZONES DE PASSE (4-3C-3-3A-2 / 7-8C-8-8A-9 / 5-6-1) */}
                    {step2Phase === 'passe' && (
                      <div className="relative z-30 flex h-full w-full flex-col">
                        {/* Repère Point ① Réception */}
                        {rCoord && (
                          <div
                            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white shadow-lg"
                            style={{ left: `${rCoord.x}%`, top: `${rCoord.y}%` }}
                          >
                            ① {zoneR} ({qualiteR})
                          </div>
                        )}

                        {/* Ligne Filet (Bonne situation: 4 | 3C | 3 | 3A | 2) */}
                        <div className="grid h-1/3 grid-cols-5 gap-1 p-1.5 bg-emerald-200/35">
                          {ZONE_P_ROWS[0].zones.map((z) => {
                            const active = zoneP === z.code;
                            return (
                              <button
                                key={z.code}
                                type="button"
                                onMouseEnter={() => setHoverZoneP(z.code)}
                                onMouseLeave={() => setHoverZoneP('')}
                                onClick={() => handleChooseZoneP(z.code)}
                                className={`flex flex-col items-center justify-center rounded-xl border-2 text-lg md:text-xl font-black transition active:scale-95 ${
                                  active
                                    ? 'border-emerald-700 bg-emerald-500 text-white shadow-lg'
                                    : 'border-emerald-600/40 bg-white/85 text-emerald-950 hover:bg-emerald-100'
                                }`}
                              >
                                <span>{z.label}</span>
                                <span className="text-[9px] font-bold text-emerald-700">Bonne</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Ligne 3m (Situation moyenne: 7 | 8C | 8 | 8A | 9 + 7C/7A) */}
                        <div className="relative grid h-1/3 grid-cols-5 gap-1 p-1.5 bg-amber-100/35">
                          {ZONE_P_ROWS[1].zones.map((z) => {
                            const active = zoneP === z.code;
                            return (
                              <button
                                key={z.code}
                                type="button"
                                onMouseEnter={() => setHoverZoneP(z.code)}
                                onMouseLeave={() => setHoverZoneP('')}
                                onClick={() => handleChooseZoneP(z.code)}
                                className={`flex flex-col items-center justify-center rounded-xl border-2 text-lg md:text-xl font-black transition active:scale-95 ${
                                  active
                                    ? 'border-amber-700 bg-amber-500 text-white shadow-lg'
                                    : 'border-amber-600/40 bg-white/85 text-amber-950 hover:bg-amber-100'
                                }`}
                              >
                                <span>{z.label}</span>
                                <span className="text-[9px] font-bold text-amber-700">Moy.</span>
                              </button>
                            );
                          })}
                          {/* Accès rapide 7C / 7A */}
                          <div className="absolute bottom-1 left-2 flex gap-1">
                            {ZONE_P_EXTRA.map((ex) => (
                              <button
                                key={ex}
                                type="button"
                                onMouseEnter={() => setHoverZoneP(ex)}
                                onMouseLeave={() => setHoverZoneP('')}
                                onClick={() => handleChooseZoneP(ex)}
                                className="rounded border border-amber-700/50 bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-black text-amber-950 hover:bg-amber-300"
                              >
                                {ex}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Ligne Fond (Situation mini: 5 | 6 | 1) */}
                        <div className="grid h-1/3 grid-cols-3 gap-2 p-1.5 bg-rose-100/35">
                          {ZONE_P_ROWS[2].zones.map((z) => {
                            const active = zoneP === z.code;
                            return (
                              <button
                                key={z.code}
                                type="button"
                                onMouseEnter={() => setHoverZoneP(z.code)}
                                onMouseLeave={() => setHoverZoneP('')}
                                onClick={() => handleChooseZoneP(z.code)}
                                className={`flex flex-col items-center justify-center rounded-xl border-2 text-xl md:text-2xl font-black transition active:scale-95 ${
                                  active
                                    ? 'border-rose-700 bg-rose-500 text-white shadow-lg'
                                    : 'border-rose-500/40 bg-white/85 text-rose-950 hover:bg-rose-100'
                                }`}
                              >
                                <span>{z.label}</span>
                                <span className="text-[9px] font-bold text-rose-700">Mini</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>

              {/* PANNEAU LATÉRAL DE QUALITÉ DE RÉCEPTION (ÉTAPE 2A) OU GUIDE (ÉTAPE 2B) */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                {step2Phase === 'recep' ? (
                  <div
                    className={`rounded-2xl border p-4 transition ${
                      zoneR
                        ? 'border-emerald-400/70 bg-emerald-950/30 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-800 bg-slate-950/60 opacity-75'
                    }`}
                  >
                    <div className="mb-3">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                        Qualité Réception {zoneR ? `(Zone ${zoneR})` : ''}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {zoneR
                          ? 'Touchez la qualité pour passer au choix de Zone de Passe ②'
                          : 'Touchez d’abord la zone d’arrivée sur le terrain à gauche'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {QUALITE_R_OPTIONS.map((q) => {
                        const active = qualiteR === q.code;
                        return (
                          <button
                            key={q.code}
                            type="button"
                            disabled={!zoneR}
                            onClick={() => handleChooseQualiteR(q.code)}
                            className={`flex h-20 flex-col items-center justify-center rounded-2xl border-2 transition active:scale-95 disabled:opacity-40 ${
                              active ? BTN_TONES_ACTIVE[q.style] : BTN_TONES[q.style]
                            }`}
                          >
                            <span className="text-3xl font-black leading-none">{q.code}</span>
                            <span className="mt-1 text-xs font-bold">{q.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-sky-500/40 bg-sky-950/30 p-4">
                    <div className="text-xs font-black uppercase tracking-wider text-sky-300">
                      Point ① enregistré
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="rounded-xl bg-sky-500 px-3 py-2 text-lg font-black text-slate-950">
                        Zone {zoneR} • {qualiteR}
                      </div>
                      <span className="text-sm font-bold text-slate-300">
                        Maintenant touchez sur le terrain l'endroit ② où le passeur touche la balle.
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-emerald-400" />
                        <span>Ligne filet (4, 3C, 3, 3A, 2) = Bonne situation</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-amber-400" />
                        <span>Ligne 3m (7, 8C, 8, 8A, 9) = Situation moyenne</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-rose-400" />
                        <span>Fond (5, 6, 1) = Situation mini</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : ANNONCE DU CENTRAL (BASE OFF) */}
        {step === 3 && (
          <div className="flex flex-1 flex-col justify-center gap-6">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex h-10 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour Terrain 2D
              </button>
              <span className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300">
                Récep {zoneR} ({qualiteR}) → Passe {zoneP}
              </span>
            </div>

            <div className="text-center">
              <span className="inline-block rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-sky-300">
                Étape 3 / 5
              </span>
              <h2 className="mt-2 text-2xl md:text-3xl font-black text-white">
                Annonce du Central (BASE OFF)
              </h2>
              <p className="mt-1 text-xs md:text-sm text-slate-400">
                Quelle fixation annonce le central ? (Central avant actuel :{' '}
                <strong className="text-purple-300">#{lineupInfo.centralFront?.num || '?'}</strong>)
              </p>
            </div>

            <div className="mx-auto grid w-full max-w-4xl grid-cols-2 md:grid-cols-3 gap-4">
              {BASE_OFF_OPTIONS.map((b) => {
                const active = baseOff === b.code;
                const recommendedZero =
                  b.code === '0' && (qualiteR === '-' || ['1', '6', '5'].includes(zoneP));
                return (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => handleChooseBaseOff(b.code)}
                    className={`flex h-32 md:h-36 flex-col items-center justify-center rounded-3xl border-2 transition active:scale-95 ${
                      active
                        ? 'border-sky-200 bg-sky-400 text-slate-950 shadow-2xl shadow-sky-400/30'
                        : recommendedZero
                          ? 'border-amber-400 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25'
                          : 'border-slate-700 bg-slate-800/90 text-white hover:border-sky-400/60 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-4xl md:text-5xl font-black leading-none">{b.code}</span>
                    <span className="mt-2 text-sm font-black">{b.label}</span>
                    <span className="text-xs opacity-75">{b.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ÉTAPE 4 : TERRAIN 2D DE DISTRIBUTION (DISTRIB P) + JOUEUR AUTO */}
        {step === 4 && (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(qualiteR === '+' || qualiteR === '#' ? 3 : 2)}
                  className="flex h-10 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {qualiteR === '+' || qualiteR === '#' ? `Base ${baseOff}` : 'Récep & Passe'}
                </button>
                <div>
                  <h2 className="text-lg md:text-2xl font-black text-white">
                    Étape 4 / 5 — Touchez où la passe est distribuée sur le terrain
                  </h2>
                  <p className="text-xs text-slate-400">
                    Le numéro du joueur attaquant est déterminé automatiquement selon la rotation P
                    {selectedRotation} !
                  </p>
                </div>
              </div>
            </div>

            {/* GRAND TERRAIN 2D SPATIAL POUR DISTRIB P */}
            <div className="mx-auto w-full max-w-[780px] rounded-2xl border-2 border-slate-600 bg-[#f8fafc] p-3 text-slate-900 shadow-2xl">
              {/* FILET EN HAUT */}
              <div className="mb-1 flex items-center justify-between text-[11px] font-black uppercase text-slate-700">
                <span>← Aile Gauche (Poste 4)</span>
                <span className="rounded bg-black px-3 py-0.5 text-white">FILET</span>
                <span>Aile Droite (Poste 2) →</span>
              </div>

              <div className="relative border-2 border-black bg-emerald-50 min-h-[380px] md:min-h-[420px] p-2.5 flex flex-col justify-between">
                {/* Flèche SVG Récep ① -> Passe ② -> Attaque sur le terrain */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                >
                  <defs>
                    <marker
                      id="passArrow"
                      markerWidth="6"
                      markerHeight="6"
                      refX="4"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="#0284c7" />
                    </marker>
                  </defs>
                  {rCoord && pCoord && (
                    <line
                      x1={rCoord.x}
                      y1={rCoord.y}
                      x2={pCoord.x}
                      y2={pCoord.y}
                      stroke="#94a3b8"
                      strokeWidth="1.1"
                      strokeDasharray="2 2"
                    />
                  )}
                  {pCoord && dCoord && (
                    <line
                      x1={pCoord.x}
                      y1={pCoord.y}
                      x2={dCoord.x}
                      y2={dCoord.y}
                      stroke="#0284c7"
                      strokeWidth="1.8"
                      markerEnd="url(#passArrow)"
                    />
                  )}
                </svg>

                {/* Ligne 3m visuelle */}
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-black/50"
                  style={{ top: '54%' }}
                />

                {/* Marqueur de l'origine de la passe ② */}
                {pCoord && (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white shadow"
                    style={{ left: `${pCoord.x}%`, top: `${Math.min(88, Math.max(12, pCoord.y))}%` }}
                  >
                    ② Passe {zoneP}
                  </div>
                )}

                {/* LIGNE AVANT (AU FILET : Gauche Poste 4 -> Centre Poste 3 -> Droite Poste 2) */}
                <div className="relative z-20 grid grid-cols-12 gap-2 items-start pt-1">
                  {/* AILE GAUCHE (Poste 4 : EN 4 [5], EN 4 Arr [9]) */}
                  <div className="col-span-3 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onMouseEnter={() => setHoverDistribP('5')}
                      onMouseLeave={() => setHoverDistribP('')}
                      onClick={() => handleChooseDistribP('5')}
                      className={`flex flex-col items-center justify-center rounded-2xl border-2 p-2.5 shadow transition active:scale-95 ${
                        distribP === '5'
                          ? 'border-amber-700 bg-amber-400 text-black'
                          : 'border-emerald-700/50 bg-white hover:bg-emerald-100'
                      }`}
                    >
                      <span className="text-2xl font-black leading-none">5</span>
                      <span className="text-[11px] font-extrabold uppercase text-slate-700">
                        EN 4
                      </span>
                      <span className="mt-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white">
                        {getAutoTag('5')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onMouseEnter={() => setHoverDistribP('9')}
                      onMouseLeave={() => setHoverDistribP('')}
                      onClick={() => handleChooseDistribP('9')}
                      className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${
                        distribP === '9'
                          ? 'border-amber-700 bg-amber-400 text-black'
                          : 'border-slate-400 bg-white/90 hover:bg-emerald-100'
                      }`}
                    >
                      <span>
                        <strong>9</strong> (4 Hte)
                      </span>
                      <span className="text-[10px] font-black text-sky-700">{getAutoTag('9')}</span>
                    </button>

                    <button
                      type="button"
                      onMouseEnter={() => setHoverDistribP('4')}
                      onMouseLeave={() => setHoverDistribP('')}
                      onClick={() => handleChooseDistribP('4')}
                      className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${
                        distribP === '4'
                          ? 'border-amber-700 bg-amber-400 text-black'
                          : 'border-slate-400 bg-white/90 hover:bg-emerald-100'
                      }`}
                    >
                      <span>
                        <strong>4</strong> (Croix)
                      </span>
                      <span className="text-[10px] font-black text-sky-700">{getAutoTag('4')}</span>
                    </button>
                  </div>

                  {/* ZONE CENTRE (DÉCA [7], FIX AV [1, 1C, 3], 2e MAIN [PM], FIX ARR [2]) */}
                  <div className="col-span-6 flex flex-col gap-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onMouseEnter={() => setHoverDistribP('7')}
                        onMouseLeave={() => setHoverDistribP('')}
                        onClick={() => handleChooseDistribP('7')}
                        className={`flex flex-col items-center justify-center rounded-2xl border-2 p-2 shadow transition active:scale-95 ${
                          distribP === '7'
                            ? 'border-amber-700 bg-amber-400 text-black'
                            : 'border-purple-600/40 bg-white hover:bg-purple-100'
                        }`}
                      >
                        <span className="text-xl font-black leading-none">7</span>
                        <span className="text-[10px] font-extrabold text-slate-700">DECA</span>
                        <span className="mt-1 rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                          {getAutoTag('7')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverDistribP('1')}
                        onMouseLeave={() => setHoverDistribP('')}
                        onClick={() => handleChooseDistribP('1')}
                        className={`flex flex-col items-center justify-center rounded-2xl border-2 p-2 shadow transition active:scale-95 ${
                          distribP === '1'
                            ? 'border-amber-700 bg-amber-400 text-black'
                            : 'border-purple-600/40 bg-white hover:bg-purple-100'
                        }`}
                      >
                        <span className="text-xl font-black leading-none">1</span>
                        <span className="text-[10px] font-extrabold text-slate-700">FIX AV</span>
                        <span className="mt-1 rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                          {getAutoTag('1')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverDistribP('2')}
                        onMouseLeave={() => setHoverDistribP('')}
                        onClick={() => handleChooseDistribP('2')}
                        className={`flex flex-col items-center justify-center rounded-2xl border-2 p-2 shadow transition active:scale-95 ${
                          distribP === '2'
                            ? 'border-amber-700 bg-amber-400 text-black'
                            : 'border-purple-600/40 bg-white hover:bg-purple-100'
                        }`}
                      >
                        <span className="text-xl font-black leading-none">2</span>
                        <span className="text-[10px] font-extrabold text-slate-700">FIX ARR</span>
                        <span className="mt-1 rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                          {getAutoTag('2')}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onMouseEnter={() => setHoverDistribP('1C')}
                        onMouseLeave={() => setHoverDistribP('')}
                        onClick={() => handleChooseDistribP('1C')}
                        className="flex flex-col items-center justify-center rounded-xl border border-purple-500/40 bg-white/95 py-1.5 text-xs font-bold shadow-sm hover:bg-purple-100 active:scale-95"
                      >
                        <span className="text-sm font-black">1C</span>
                        <span className="text-[9px] text-purple-800">{getAutoTag('1C')}</span>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverDistribP('3')}
                        onMouseLeave={() => setHoverDistribP('')}
                        onClick={() => handleChooseDistribP('3')}
                        className="flex flex-col items-center justify-center rounded-xl border border-purple-500/40 bg-white/95 py-1.5 text-xs font-bold shadow-sm hover:bg-purple-100 active:scale-95"
                      >
                        <span className="text-sm font-black">3 (Tendue)</span>
                        <span className="text-[9px] text-purple-800">{getAutoTag('3')}</span>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverDistribP('PM')}
                        onMouseLeave={() => setHoverDistribP('')}
                        onClick={() => handleChooseDistribP('PM')}
                        className="flex flex-col items-center justify-center rounded-xl border-2 border-emerald-600 bg-emerald-100 py-1.5 text-xs font-bold shadow-sm hover:bg-emerald-200 active:scale-95"
                      >
                        <span className="text-sm font-black text-emerald-950">PM (2e Main)</span>
                        <span className="text-[9px] font-black text-emerald-800">
                          {getAutoTag('PM')}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* AILE DROITE (Poste 2 : EN 2 [6]) */}
                  <div className="col-span-3 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onMouseEnter={() => setHoverDistribP('6')}
                      onMouseLeave={() => setHoverDistribP('')}
                      onClick={() => handleChooseDistribP('6')}
                      className={`flex h-28 flex-col items-center justify-center rounded-2xl border-2 p-2.5 shadow transition active:scale-95 ${
                        distribP === '6'
                          ? 'border-amber-700 bg-amber-400 text-black'
                          : 'border-amber-600/50 bg-white hover:bg-amber-100'
                      }`}
                    >
                      <span className="text-2xl font-black leading-none">6</span>
                      <span className="text-[11px] font-extrabold uppercase text-slate-700">
                        EN 2
                      </span>
                      <span className="mt-1 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-black text-white">
                        {getAutoTag('6')}
                      </span>
                    </button>
                  </div>
                </div>

                {/* LIGNE ARRIÈRE (PIPE [10] au centre, EN 1 [8] à droite) */}
                <div className="relative z-20 grid grid-cols-12 gap-2 pt-4 pb-1">
                  <div className="col-span-3" />
                  <div className="col-span-6">
                    <button
                      type="button"
                      onMouseEnter={() => setHoverDistribP('10')}
                      onMouseLeave={() => setHoverDistribP('')}
                      onClick={() => handleChooseDistribP('10')}
                      className={`flex h-24 w-full flex-col items-center justify-center rounded-2xl border-2 shadow transition active:scale-95 ${
                        distribP === '10'
                          ? 'border-amber-700 bg-amber-400 text-black'
                          : 'border-sky-600/50 bg-white hover:bg-sky-100'
                      }`}
                    >
                      <span className="text-2xl font-black leading-none">10</span>
                      <span className="text-xs font-extrabold uppercase text-slate-700">
                        PIPE (Zone 6/8)
                      </span>
                      <span className="mt-1 rounded-full bg-sky-600 px-2.5 py-0.5 text-[10px] font-black text-white">
                        {getAutoTag('10')}
                      </span>
                    </button>
                  </div>
                  <div className="col-span-3">
                    <button
                      type="button"
                      onMouseEnter={() => setHoverDistribP('8')}
                      onMouseLeave={() => setHoverDistribP('')}
                      onClick={() => handleChooseDistribP('8')}
                      className={`flex h-24 w-full flex-col items-center justify-center rounded-2xl border-2 shadow transition active:scale-95 ${
                        distribP === '8'
                          ? 'border-amber-700 bg-amber-400 text-black'
                          : 'border-amber-600/50 bg-white hover:bg-amber-100'
                      }`}
                    >
                      <span className="text-2xl font-black leading-none">8</span>
                      <span className="text-xs font-extrabold uppercase text-slate-700">
                        EN 1 (Arr. D)
                      </span>
                      <span className="mt-1 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-black text-white">
                        {getAutoTag('8')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ÉTAPE 5 : RÉSULTAT ATTAQUE + JOUEUR DÉTERMINÉ AUTO */}
        {step === 5 && (
          <div className="flex flex-1 flex-col justify-center gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex h-10 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Changer Passe ({distribP})
              </button>

              {/* Joueur auto-déterminé + correction rapide si besoin */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-purple-400/50 bg-purple-950/40 px-3 py-1.5">
                <Sparkles className="h-4 w-4 text-purple-300" />
                <span className="text-xs font-bold text-purple-200">Attaquant auto :</span>
                <span className="rounded-lg bg-purple-500 px-2.5 py-0.5 text-sm font-black text-white">
                  #{joueur}
                </span>
                <span className="text-[11px] text-slate-400 ml-1">Changer :</span>
                {allPlayerNumbers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setJoueur(num)}
                    className={`h-7 min-w-[30px] rounded-lg px-1.5 text-[11px] font-black transition ${
                      joueur === num
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center">
              <span className="inline-block rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-300">
                Étape 5 / 5 • Validation finale
              </span>
              <h2 className="mt-2 text-2xl md:text-3xl font-black text-white">
                Résultat de l'attaque (#{joueur} sur passe {distribP})
              </h2>
              <p className="mt-1 text-xs md:text-sm text-slate-400">
                Touchez le résultat : l'action s'enregistre et revient automatiquement à l'Étape 1
              </p>
            </div>

            <div className="mx-auto grid w-full max-w-5xl grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {RES_ATT_OPTIONS.map((r) => {
                const active = resAtt === r.code;
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => handleChooseResAtt(r.code)}
                    className={`flex h-32 md:h-40 flex-col items-center justify-center rounded-3xl border-2 transition active:scale-95 ${
                      active ? BTN_TONES_ACTIVE[r.style] : BTN_TONES[r.style]
                    }`}
                  >
                    <span className="text-4xl md:text-5xl font-black leading-none">{r.label}</span>
                    <span className="mt-2 text-xs font-bold text-center px-1">{r.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DERNIÈRES ACTIONS SAISIES */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
            {showAllRecent ? 'Dernières actions enregistrées' : 'Dernière action enregistrée'} ({rows.length} au total)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Touchez le crayon pour corriger une ligne
            </span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllRecent((v) => !v)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                {showAllRecent ? 'Réduire' : `Voir plus (${Math.min(rows.length, 12)})`}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Match</th>
                <th className="px-2 py-1">Rot</th>
                <th className="px-2 py-1">N° P</th>
                <th className="px-2 py-1">Serv</th>
                <th className="px-2 py-1">ZR</th>
                <th className="px-2 py-1">QR</th>
                <th className="px-2 py-1">ZP</th>
                <th className="px-2 py-1">Base</th>
                <th className="px-2 py-1">Dist</th>
                <th className="px-2 py-1">Joueur</th>
                <th className="px-2 py-1">Res</th>
                <th className="px-2 py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-2 py-1.5 font-mono text-slate-500">{row.id}</td>
                  <td className="px-2 py-1.5 font-bold text-slate-200">{row.match}</td>
                  <td className="px-2 py-1.5 font-bold text-sky-300">P{row.rotation}</td>
                  <td className="px-2 py-1.5 font-bold text-emerald-300">{row.setter}</td>
                  <td className="px-2 py-1.5">{row.service}</td>
                  <td className="px-2 py-1.5">{row.zoneR}</td>
                  <td className="px-2 py-1.5 font-bold">{row.qualiteR}</td>
                  <td className="px-2 py-1.5 font-bold text-amber-300">{row.zoneP}</td>
                  <td className="px-2 py-1.5">{row.baseOff}</td>
                  <td className="px-2 py-1.5 font-black text-white">{row.distribP}</td>
                  <td className="px-2 py-1.5 font-bold text-purple-300">#{row.joueur}</td>
                  <td className="px-2 py-1.5 font-black">{row.resAtt}</td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleLoadForEdit(row)}
                        className="rounded-lg bg-slate-800 p-1 text-sky-300 hover:bg-slate-700"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRow(row.id)}
                        className="rounded-lg bg-slate-800 p-1 text-rose-400 hover:bg-rose-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL COMPOSITION DE DÉPART (6 DE DÉPART SUR TERRAIN 2D)               */}
      {/* ===================================================================== */}
      {showLineupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-white">
                  Positions de départ & Postes de l'équipe
                </h3>
                <p className="text-xs text-slate-400">
                  Touchez une zone du terrain (4, 3, 2, 5, 6, 1) pour définir le N° du joueur et son poste.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {allSetters.map((s) => {
                  const isAct = !setterOverrideNP && activeSetterCode === s.code;
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => selectActiveSetter(s.code)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        isAct
                          ? 'border-emerald-300 bg-emerald-500 text-slate-950'
                          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                      }`}
                    >
                      Passeur {formatSetterLabel(s)}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setShowLineupModal(false);
                    openSetterModal();
                  }}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
                >
                  + Gérer passeurs
                </button>
                <button
                  type="button"
                  onClick={() => setShowLineupModal(false)}
                  className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
              {/* Terrain 6 postes (haut = filet : 4, 3, 2 / bas = fond : 5, 6, 1) */}
              <div className="md:col-span-7 rounded-2xl border-2 border-slate-600 bg-emerald-950/30 p-3">
                <div className="mb-2 rounded bg-black py-1 text-center text-[10px] font-black tracking-widest text-white">
                  FILET (AVANT : 4 • 3 • 2)
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[4, 3, 2].map((z) => {
                    const slot = teamLineup[z] || { num: '', role: 'R4' };
                    const selected = activeLineupSlot === z;
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setActiveLineupSlot(z)}
                        className={`flex h-24 flex-col items-center justify-center rounded-2xl border-2 p-2 transition ${
                          selected
                            ? 'border-white bg-slate-800 ring-2 ring-emerald-400'
                            : 'border-slate-700 bg-slate-900/90 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-[10px] font-bold text-slate-400">Zone {z} (Av)</span>
                        <span className="text-2xl font-black text-white">#{slot.num || '?'}</span>
                        <span
                          className={`mt-1 rounded border px-2 py-0.5 text-[10px] font-bold ${
                            ROLE_BADGE_STYLE[slot.role] || ROLE_BADGE_STYLE.R4
                          }`}
                        >
                          {slot.role}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[5, 6, 1].map((z) => {
                    const slot = teamLineup[z] || { num: '', role: 'R4' };
                    const selected = activeLineupSlot === z;
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setActiveLineupSlot(z)}
                        className={`flex h-24 flex-col items-center justify-center rounded-2xl border-2 p-2 transition ${
                          selected
                            ? 'border-white bg-slate-800 ring-2 ring-emerald-400'
                            : 'border-slate-700 bg-slate-900/90 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-[10px] font-bold text-slate-400">Zone {z} (Arr)</span>
                        <span className="text-2xl font-black text-white">#{slot.num || '?'}</span>
                        <span
                          className={`mt-1 rounded border px-2 py-0.5 text-[10px] font-bold ${
                            ROLE_BADGE_STYLE[slot.role] || ROLE_BADGE_STYLE.R4
                          }`}
                        >
                          {slot.role}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Éditeur de la zone sélectionnée */}
              <div className="md:col-span-5 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="text-xs font-black uppercase text-emerald-300">
                  Modifier Zone {activeLineupSlot}
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-slate-400">Poste du joueur</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TEAM_ROLES.map((r) => {
                      const active = teamLineup[activeLineupSlot]?.role === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => updateLineupSlot(activeLineupSlot, { role: r.id })}
                          className={`h-10 rounded-xl border text-xs font-bold transition ${
                            active
                              ? 'border-emerald-300 bg-emerald-500 text-slate-950'
                              : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-slate-400">Numéro de maillot</div>
                  <div className="flex flex-wrap gap-1.5">
                    {allPlayerNumbers.map((n) => {
                      const active = teamLineup[activeLineupSlot]?.num === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => updateLineupSlot(activeLineupSlot, { num: n })}
                          className={`h-9 min-w-[40px] rounded-xl border px-2 text-xs font-black transition ${
                            active
                              ? 'border-sky-300 bg-sky-400 text-slate-950'
                              : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      type="text"
                      value={customPlayerDraft}
                      onChange={(e) => setCustomPlayerDraft(e.target.value)}
                      placeholder="Autre N°"
                      className="h-9 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!customPlayerDraft.trim()) return;
                        updateLineupSlot(activeLineupSlot, { num: customPlayerDraft.trim() });
                        setCustomPlayerDraft('');
                      }}
                      className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-slate-950"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
              <div className="text-xs text-slate-400">
                Rotation affichée : <strong className="text-white">P{selectedRotation}</strong> •
                Passeur actif : <strong className="text-emerald-300">#{activeSetterCode}</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowLineupModal(false)}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-emerald-500 px-5 text-xs font-black text-slate-950"
              >
                <Check className="h-4 w-4" />
                Valider la composition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTION DES MATCHS : CRÉER + RENOMMER + SUPPRIMER */}
      {showNewMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">Gérer les matchs</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Créez, renommez ou supprimez vos matchs (MATCH 1, SUC, GRENOBLE...).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteMatch(null);
                  setEditingMatchName(null);
                  setEditingMatchDraft('');
                  setShowNewMatchModal(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* SECTION 1 : CRÉER UN MATCH */}
            <form
              onSubmit={handleCreateMatch}
              className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="text-xs font-black uppercase tracking-wide text-emerald-300">
                1. Créer un nouveau match
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  Nom du match
                </label>
                <input
                  type="text"
                  value={newMatchName}
                  onChange={(e) => setNewMatchName(e.target.value)}
                  placeholder="ex: MATCH 1, CANNES 1, GRENOBLE..."
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none focus:border-emerald-400"
                  autoFocus={!editingMatchName}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Envoyer dans la/les feuille(s) :
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowInlineNewSheet((v) => !v)}
                    className="text-xs font-bold text-emerald-300 hover:text-emerald-200"
                  >
                    + Nouvelle feuille
                  </button>
                </div>

                {sheetConfigs.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sheetConfigs.map((cfg) => {
                      const checked = targetSheetIds.includes(cfg.id);
                      return (
                        <button
                          key={cfg.id}
                          type="button"
                          onClick={() => toggleTargetSheet(cfg.id)}
                          className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                            checked
                              ? 'border-amber-300 bg-amber-400 text-slate-950'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <span>{cfg.title}</span>
                          <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                            {cfg.setter === 'ALL' ? 'Tous P' : `P#${cfg.setter}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-400">
                    Aucune feuille d'analyse pour le moment. Créez-en une ci-dessous !
                  </div>
                )}

                {showInlineNewSheet && (
                  <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-3 space-y-2">
                    <div className="text-[11px] font-bold text-emerald-300">
                      Créer une feuille d'analyse
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={inlineNewSheetName}
                        onChange={(e) => setInlineNewSheetName(e.target.value)}
                        placeholder="Nom feuille (ex: PAUL)"
                        className="h-9 flex-1 min-w-[140px] rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-white"
                      />
                      <select
                        value={inlineNewSheetSetter}
                        onChange={(e) => setInlineNewSheetSetter(e.target.value)}
                        className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs font-bold text-white"
                      >
                        {allSetters.map((s) => (
                          <option key={s.code} value={s.code}>
                            Passeur {formatSetterLabel(s)}
                          </option>
                        ))}
                        <option value="ALL">Tous passeurs</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleCreateInlineSheet}
                        className="h-9 rounded-lg bg-emerald-500 px-3 text-xs font-black text-slate-950"
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-black text-slate-950 hover:bg-emerald-400"
                >
                  <Plus className="h-4 w-4" />
                  Créer le match
                </button>
              </div>
            </form>

            {/* SECTION 2 : MATCHS EXISTANTS (RENOMMAGE + SUPPRESSION) */}
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs font-black uppercase tracking-wide text-slate-300">
                  2. Matchs existants ({allMatches.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Renommer met à jour toutes les actions et feuilles
                </span>
              </div>

              {allMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
                  Aucun match enregistré pour le moment.
                </div>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {allMatches.map((teamName) => {
                    const count = matchActionCounts[teamName.toUpperCase()] || 0;
                    const isSelected =
                      Boolean(selectedMatch) &&
                      teamName.toUpperCase() === selectedMatch.toUpperCase();
                    const isConfirmingDelete = confirmDeleteMatch === teamName;
                    const isEditing = editingMatchName === teamName;
                    return (
                      <div
                        key={teamName}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                          isSelected
                            ? 'border-emerald-500/40 bg-emerald-950/20'
                            : 'border-slate-800 bg-slate-900/90'
                        }`}
                      >
                        {isEditing ? (
                          <div className="flex w-full flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={editingMatchDraft}
                              onChange={(e) => setEditingMatchDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleConfirmRenameMatch(teamName);
                                } else if (e.key === 'Escape') {
                                  setEditingMatchName(null);
                                  setEditingMatchDraft('');
                                }
                              }}
                              aria-label={`Nouveau nom pour ${teamName}`}
                              className="h-9 flex-1 min-w-[140px] rounded-lg border border-sky-400 bg-slate-800 px-2.5 text-xs font-black text-white outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleConfirmRenameMatch(teamName)}
                              className="h-9 rounded-lg bg-sky-500 px-3 text-xs font-black text-slate-950 hover:bg-sky-400"
                            >
                              Valider
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMatchName(null);
                                setEditingMatchDraft('');
                              }}
                              className="h-9 rounded-lg bg-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-600"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white">{teamName}</span>
                              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                                {count} act.
                              </span>
                              {isSelected && (
                                <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                  Actif
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {onRenameMatch && !isConfirmingDelete && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteMatch(null);
                                    setEditingMatchName(teamName);
                                    setEditingMatchDraft(teamName);
                                  }}
                                  className="flex h-8 items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Renommer
                                </button>
                              )}

                              {onDeleteMatch && (
                                isConfirmingDelete ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-bold text-rose-300">
                                      Supprimer ?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onDeleteMatch(teamName);
                                        setConfirmDeleteMatch(null);
                                      }}
                                      className="h-8 rounded-lg bg-rose-500 px-2.5 text-[11px] font-black text-white hover:bg-rose-400"
                                    >
                                      Confirmer
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteMatch(null)}
                                      className="h-8 rounded-lg bg-slate-700 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMatchName(null);
                                      setConfirmDeleteMatch(teamName);
                                    }}
                                    className="flex h-8 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Supprimer
                                  </button>
                                )
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteMatch(null);
                  setEditingMatchName(null);
                  setEditingMatchDraft('');
                  setShowNewMatchModal(false);
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTION DES PASSEURS : CRÉER + SUPPRIMER */}
      {showSetterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">Gérer les passeurs</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Créez vos passeurs (numéro et nom) ou supprimez les passeurs existants.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSetter(null);
                  setShowSetterModal(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* SECTION 1 : CRÉER UN PASSEUR */}
            <form
              onSubmit={handleCreateSetter}
              className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="text-xs font-black uppercase tracking-wide text-sky-300">
                1. Créer / ajouter un passeur
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-300">
                    N° du passeur
                  </label>
                  <input
                    type="text"
                    value={newSetterCode}
                    onChange={(e) => setNewSetterCode(e.target.value)}
                    placeholder="ex: 12"
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-black text-white outline-none focus:border-sky-400"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-300">
                    Nom du passeur (optionnel)
                  </label>
                  <input
                    type="text"
                    value={newSetterName}
                    onChange={(e) => setNewSetterName(e.target.value)}
                    placeholder="ex: LUCAS, THÉO..."
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={createSheetForSetter}
                  onChange={(e) => setCreateSheetForSetter(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-sky-400"
                />
                <span>Créer aussi une feuille d'analyse pour ce passeur</span>
              </label>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-sky-500 px-4 text-xs font-black text-slate-950 hover:bg-sky-400"
                >
                  <Plus className="h-4 w-4" />
                  Créer le passeur
                </button>
              </div>
            </form>

            {/* SECTION 2 : PASSEURS EXISTANTS (SUPPRESSION) */}
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wide text-slate-300">
                  2. Passeurs existants ({allSetters.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Supprimer retire le passeur et ses actions saisies
                </span>
              </div>

              {allSetters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
                  Aucun passeur enregistré pour le moment.
                </div>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {allSetters.map((s) => {
                    const count = setterActionCounts[s.code.toUpperCase()] || 0;
                    const isSelected = !setterOverrideNP && activeSetterCode === s.code;
                    const isConfirming = confirmDeleteSetter === s.code;
                    return (
                      <div
                        key={s.code}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                          isSelected
                            ? 'border-sky-500/40 bg-sky-950/20'
                            : 'border-slate-800 bg-slate-900/90'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">
                            {formatSetterLabel(s)}
                          </span>
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                            {count} act.
                          </span>
                          {isSelected && (
                            <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                              Actif
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!isSelected && !isConfirming && (
                            <button
                              type="button"
                              onClick={() => {
                                selectActiveSetter(s.code);
                                triggerToast(`Passeur actif : ${formatSetterLabel(s)}`, 'sky');
                              }}
                              className="h-8 rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20"
                            >
                              Utiliser
                            </button>
                          )}

                          {onDeleteSetter && (
                            isConfirming ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-rose-300">
                                  Supprimer ?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteSetter(s.code);
                                    setConfirmDeleteSetter(null);
                                  }}
                                  className="h-8 rounded-lg bg-rose-500 px-2.5 text-[11px] font-black text-white hover:bg-rose-400"
                                >
                                  Confirmer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSetter(null)}
                                  className="h-8 rounded-lg bg-slate-700 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSetter(s.code)}
                                className="flex h-8 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Supprimer
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSetter(null);
                  setShowSetterModal(false);
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHANGEMENT DE JOUEURS (SORTANT ⇄ ENTRANT) */}
      {showSubModal && (() => {
        const currentSlots = Object.values(lineupInfo.byZone || {});
        const selectedSubSlot =
          currentSlots.find((s) => s.origZone === subSelectedOrigZone) ||
          lineupInfo.byZone?.[4] ||
          currentSlots[0];
        const effectiveRole = subIncomingRole || selectedSubSlot?.role || 'R4';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
            <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-500/20 text-amber-300">
                    <ArrowLeftRight className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Changement de joueur — Rotation P{selectedRotation}
                    </h3>
                    <p className="text-xs text-slate-400">
                      1. Touchez le joueur qui sort sur le terrain • 2. Choisissez le joueur qui entre.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeSubsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRevertAllSubstitutions}
                      className="flex h-9 items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
                    >
                      Rétablir tout le 6 de départ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSubModal(false)}
                    className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* 1. TERRAIN 2D DES 6 JOUEURS ACTUELS DANS LA ROTATION */}
                <div className="md:col-span-7 rounded-2xl border-2 border-slate-600 bg-emerald-950/30 p-3">
                  <div className="mb-2 rounded bg-black py-1 text-center text-[10px] font-black tracking-widest text-white">
                    FILET — POSITIONS ACTUELLES EN P{selectedRotation} (AVANT : 4 • 3 • 2)
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[4, 3, 2].map((z) => {
                      const slot = lineupInfo.byZone?.[z];
                      if (!slot) return null;
                      const isSel = selectedSubSlot?.origZone === slot.origZone;
                      const isSub = slot.starterNum && slot.starterNum !== slot.num;
                      return (
                        <button
                          key={z}
                          type="button"
                          onClick={() => handleSelectSubOutgoing(slot.origZone, slot.role)}
                          className={`flex min-h-[104px] flex-col items-center justify-center rounded-2xl border-2 p-2 transition ${
                            isSel
                              ? 'border-amber-300 bg-amber-950/40 ring-2 ring-amber-400'
                              : isSub
                                ? 'border-amber-500/50 bg-slate-800/90 hover:bg-slate-800'
                                : 'border-slate-700 bg-slate-900/90 hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-[10px] font-bold text-slate-400">
                            Zone {z} (Av)
                          </span>
                          <span className="text-2xl font-black text-white">
                            #{slot.num || '?'}
                          </span>
                          <span
                            className={`mt-1 rounded border px-2 py-0.5 text-[10px] font-bold ${
                              ROLE_BADGE_STYLE[slot.role] || ROLE_BADGE_STYLE.R4
                            }`}
                          >
                            {slot.role}
                          </span>
                          {isSub && (
                            <span className="mt-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black text-amber-200">
                              Entré pour #{slot.starterNum}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mb-2 border-t-2 border-dashed border-amber-400/60 pt-1 text-center text-[10px] font-bold uppercase text-amber-300/80">
                    Ligne des 3 mètres (ARRIÈRE : 5 • 6 • 1)
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[5, 6, 1].map((z) => {
                      const slot = lineupInfo.byZone?.[z];
                      if (!slot) return null;
                      const isSel = selectedSubSlot?.origZone === slot.origZone;
                      const isSub = slot.starterNum && slot.starterNum !== slot.num;
                      return (
                        <button
                          key={z}
                          type="button"
                          onClick={() => handleSelectSubOutgoing(slot.origZone, slot.role)}
                          className={`flex min-h-[104px] flex-col items-center justify-center rounded-2xl border-2 p-2 transition ${
                            isSel
                              ? 'border-amber-300 bg-amber-950/40 ring-2 ring-amber-400'
                              : isSub
                                ? 'border-amber-500/50 bg-slate-800/90 hover:bg-slate-800'
                                : 'border-slate-700 bg-slate-900/90 hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-[10px] font-bold text-slate-400">
                            Zone {z} (Arr)
                          </span>
                          <span className="text-2xl font-black text-white">
                            #{slot.num || '?'}
                          </span>
                          <span
                            className={`mt-1 rounded border px-2 py-0.5 text-[10px] font-bold ${
                              ROLE_BADGE_STYLE[slot.role] || ROLE_BADGE_STYLE.R4
                            }`}
                          >
                            {slot.role}
                          </span>
                          {isSub && (
                            <span className="mt-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black text-amber-200">
                              Entré pour #{slot.starterNum}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. PANNEAU JOUEUR ENTRANT */}
                <div className="md:col-span-5 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                      Joueur sortant sélectionné
                    </div>
                    <div className="mt-0.5 text-sm font-black text-white">
                      Sortant : #{selectedSubSlot?.num || '?'} ({selectedSubSlot?.role}) • Zone{' '}
                      {selectedSubSlot?.zone}
                    </div>
                  </div>

                  {/* Bouton prioritaire de retour du titulaire si ce joueur est un remplaçant */}
                  {selectedSubSlot?.starterNum &&
                    selectedSubSlot.starterNum !== selectedSubSlot.num && (
                      <button
                        type="button"
                        onClick={() =>
                          handlePerformSubstitution(
                            selectedSubSlot.origZone,
                            selectedSubSlot.starterNum,
                            effectiveRole
                          )
                        }
                        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-sky-300/60 bg-sky-500 px-3 text-xs font-black text-slate-950 shadow-lg hover:bg-sky-400 active:scale-95"
                      >
                        ↩ Faire re-rentrer le titulaire #{selectedSubSlot.starterNum}
                      </button>
                    )}

                  {/* Poste du joueur entrant */}
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-slate-400">
                      Poste du joueur entrant
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TEAM_ROLES.map((r) => {
                        const active = effectiveRole === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSubIncomingRole(r.id)}
                            className={`h-9 rounded-xl border text-xs font-bold transition ${
                              active
                                ? 'border-emerald-300 bg-emerald-500 text-slate-950'
                                : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                            }`}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Joueurs disponibles sur le banc */}
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold text-slate-400">
                      Joueurs disponibles sur le banc (touchez pour faire entrer)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {benchPlayerNumbers.map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() =>
                            handlePerformSubstitution(
                              selectedSubSlot?.origZone,
                              num,
                              effectiveRole
                            )
                          }
                          className="h-10 min-w-[46px] rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-sm font-black text-emerald-200 hover:bg-emerald-500 hover:text-slate-950 active:scale-95 transition"
                        >
                          #{num}
                        </button>
                      ))}
                      {benchPlayerNumbers.length === 0 && (
                        <span className="text-xs text-slate-500">
                          Saisissez un numéro ci-dessous.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Saisie d'un nouveau numéro de maillot entrant */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handlePerformSubstitution(
                        selectedSubSlot?.origZone,
                        subIncomingCustomNum,
                        effectiveRole
                      );
                    }}
                    className="flex gap-1.5 pt-1"
                  >
                    <input
                      type="text"
                      value={subIncomingCustomNum}
                      onChange={(e) => setSubIncomingCustomNum(e.target.value)}
                      placeholder="Autre N° entrant..."
                      className="h-10 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-black text-white outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-xl bg-amber-400 px-3 text-xs font-black text-slate-950 hover:bg-amber-300"
                    >
                      Faire entrer
                    </button>
                  </form>
                </div>
              </div>

              {/* 3. LISTE DES CHANGEMENTS ACTIFS SUR LE TERRAIN */}
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wide text-amber-300">
                    Changements actifs sur le terrain ({activeSubsCount})
                  </span>
                </div>

                {activeSubsCount === 0 ? (
                  <div className="text-xs text-slate-500">
                    Aucun changement actif — le 6 de départ complet est sur le terrain.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeSubsList.map((sub) => (
                      <div
                        key={sub.origZone}
                        className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/25 px-3 py-1.5 text-xs"
                      >
                        <span className="font-black text-white">
                          #{sub.num} remplace #{sub.starterNum}
                        </span>
                        <span className="text-slate-300">
                          • {sub.role} {sub.subRot ? `(P${sub.subRot})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handlePerformSubstitution(
                              sub.origZone,
                              sub.starterNum,
                              sub.role
                            )
                          }
                          className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:bg-sky-400"
                        >
                          ↩ Annuler / Inverser (#{sub.starterNum} ⇄ #{sub.num})
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSubModal(false)}
                  className="h-10 rounded-xl bg-emerald-500 px-5 text-xs font-black text-slate-950 hover:bg-emerald-400"
                >
                  Terminer
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
