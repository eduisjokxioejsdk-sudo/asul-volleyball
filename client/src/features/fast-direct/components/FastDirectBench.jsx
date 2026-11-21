import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Download,
  Eye,
  LayoutGrid,
  SlidersHorizontal,
  Video,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LiveCameraPanel from '../../../components/LiveCameraPanel';
import { DistributionCourtTable, OrgaCourtTable } from './SetterAnalysisSheetView';
import FastDirectStatsPane from './FastDirectStatsPane';
import useLiveCameraStream from '../hooks/useLiveCameraStream';
import useFastDirectSessionState from '../hooks/useFastDirectSessionState';
import {
  computeDistributionGrid,
  computeOrgaGrid,
  formatDisValue,
  formatSetterLabel,
  normalizeRow,
} from '../utils/scoutingEngine';
import { exportWorkbookIdenticalToOriginal } from '../utils/excelExporter';

const ROTATION_TABS = ['1', '2', '3', '4', '5', '6'];

const ZONE_LABELS = {
  EN1: 'EN 1',
  PIPE: 'PIPE',
  autres: 'Autres',
  EN2: 'EN 2',
  FIX_ARR: 'FIX ARR',
  FIX_AV: 'FIX AV',
  DECA: 'DÉCALÉE',
  EN4: 'EN 4',
};

const SITUATIONS = {
  all: { label: 'Toutes situations', zones: null },
  bonne: { label: 'Bonne (filet)', zones: new Set(['4', '3C', '3', '3A', '2']) },
  moyenne: { label: 'Moyenne (3m)', zones: new Set(['7', '7C', '7A', '8C', '8', '8A', '9']) },
  mini: { label: 'Mini (fond)', zones: new Set(['5', '6', '1']) },
};

/**
 * Interface tablette « Banc » (lecture seule) :
 * - Exactement 2 onglets :
 *   1. Distribution P1–P6 (sélecteur P1..P6 + terrain 8 zones + organisation offensive)
 *   2. Stats (Stats Fast Direct en direct, lecture seule)
 * - Bouton Caméra escamotable dans l'en-tête avec réglage délai & DVR.
 */
export default function FastDirectBench({
  session,
  homeTeam = null,
  awayTeam = null,
  canSwitchToStats = false,
  onSwitchToStats = null,
}) {
  const navigate = useNavigate();
  const { state, loading, error } = useFastDirectSessionState(session.id);
  const camera = useLiveCameraStream(session.id, { enabled: true });

  const [tab, setTab] = useState('distrib'); // 'distrib' | 'stats'
  const [selectedRot, setSelectedRot] = useState('1');
  const [setterFilter, setSetterFilter] = useState('ALL');
  const [matchFilter, setMatchFilter] = useState('ALL');
  const [situationFilter, setSituationFilter] = useState('all');
  const [showCameraDrawer, setShowCameraDrawer] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(
    () => (state.rows || []).map((r, i) => normalizeRow(r, i)),
    [state.rows]
  );

  const availableSetters = useMemo(() => {
    const map = new Map();
    (state.setterList || []).forEach((s) => {
      const code = String(s?.code || '').trim().toUpperCase();
      if (code && code !== 'NP') {
        map.set(code, { code, name: String(s?.name || '').trim().toUpperCase() });
      }
    });
    rows.forEach((r) => {
      const code = String(r.setter || '').trim().toUpperCase();
      if (code && code !== 'NP' && !map.has(code)) {
        map.set(code, { code, name: '' });
      }
    });
    return Array.from(map.values());
  }, [rows, state.setterList]);

  const availableMatches = useMemo(() => {
    const set = new Set();
    const list = [];
    (state.matchList || []).forEach((m) => {
      const clean = String(m || '').trim();
      if (clean && !set.has(clean.toUpperCase())) {
        set.add(clean.toUpperCase());
        list.push(clean);
      }
    });
    rows.forEach((r) => {
      const clean = String(r.match || '').trim();
      if (clean && !set.has(clean.toUpperCase())) {
        set.add(clean.toUpperCase());
        list.push(clean);
      }
    });
    return list;
  }, [rows, state.matchList]);

  const baseFilteredRows = useMemo(() => {
    const allowedZones = SITUATIONS[situationFilter]?.zones || null;
    return rows.filter((r) => {
      if (setterFilter !== 'ALL' && r.setter !== setterFilter) return false;
      if (matchFilter !== 'ALL' && r.match.toUpperCase() !== matchFilter.toUpperCase()) return false;
      if (allowedZones && !allowedZones.has(r.zoneP)) return false;
      return true;
    });
  }, [rows, setterFilter, matchFilter, situationFilter]);

  const rotationCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    baseFilteredRows.forEach((r) => {
      if (counts[r.rotation] !== undefined) counts[r.rotation] += 1;
    });
    return counts;
  }, [baseFilteredRows]);

  const rotRows = useMemo(
    () => baseFilteredRows.filter((r) => r.rotation === selectedRot),
    [baseFilteredRows, selectedRot]
  );

  const rotDistGrid = useMemo(() => computeDistributionGrid(rotRows), [rotRows]);
  const rotOrgaGrid = useMemo(
    () => computeOrgaGrid(rotRows, ['4', '3', '2'].includes(selectedRot)),
    [rotRows, selectedRot]
  );

  const rotSummary = useMemo(() => {
    const recepRows = rotRows.filter((r) => r.qualiteR);
    const posRecep = recepRows.filter((r) => r.qualiteR === '#' || r.qualiteR === '+').length;
    const recepPct =
      recepRows.length > 0 ? `${Math.round((posRecep / recepRows.length) * 100)}%` : '—';

    let topZone = null;
    Object.entries(rotDistGrid.zones || {}).forEach(([key, val]) => {
      if (val.q > 0 && (!topZone || val.q > topZone.q)) {
        topZone = { key, label: ZONE_LABELS[key] || key, q: val.q, dis: val.dis };
      }
    });

    const bases = [
      { label: 'BASE 1', data: rotOrgaGrid.base1 },
      { label: 'BASE 2', data: rotOrgaGrid.base2 },
      { label: 'BASE 7', data: rotOrgaGrid.base7 },
      { label: 'BASE 0', data: rotOrgaGrid.base0 },
    ].filter((b) => (b.data?.q || 0) > 0);
    bases.sort((a, b) => (b.data?.q || 0) - (a.data?.q || 0));
    const topBase = bases[0] || null;

    return {
      actions: rotRows.length,
      recepPct,
      topZone,
      topBase,
    };
  }, [rotDistGrid, rotOrgaGrid, rotRows]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportWorkbookIdenticalToOriginal(rows, state.sheetConfigs || []);
    } finally {
      setExporting(false);
    }
  };

  const showSubFilters =
    availableSetters.length > 1 || availableMatches.length > 1 || rows.length > 0;

  return (
    <div className="fast-direct-root min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* EN-TÊTE TABLETTE COMPACT */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-2 px-3 py-2">
          {/* Gauche : retour + titre + révision */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/fast-direct')}
              className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-black text-slate-200 hover:bg-slate-800"
              title="Retour à Fast Direct"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-black text-white">
                  {session.team1_name} vs {session.team2_name}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                  En direct · Rév. {state.revision || 0}
                </span>
              </div>
              <div className="truncate text-[11px] font-semibold text-slate-400">
                {session.name} · code {session.join_code}
              </div>
            </div>
          </div>

          {/* Centre : EXACTEMENT 2 GROS ONGLETS TACTILES */}
          <nav className="flex items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setTab('distrib')}
              className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-black transition ${
                tab === 'distrib'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Distribution P1–P6
            </button>
            <button
              type="button"
              onClick={() => setTab('stats')}
              className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-black transition ${
                tab === 'stats'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Stats
            </button>
          </nav>

          {/* Droite : Caméra escamotable + badge lecture seule */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCameraDrawer((open) => !open)}
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black transition ${
                showCameraDrawer
                  ? 'border-rose-400 bg-rose-600 text-white'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
              }`}
            >
              <Video className="h-4 w-4" />
              Caméra
              <span
                className={`h-2 w-2 rounded-full ${
                  camera.camera.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
            </button>
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 py-2 text-[11px] font-black text-amber-200">
              <Eye className="h-3.5 w-3.5" /> Banc · lecture seule
            </span>
            {canSwitchToStats && onSwitchToStats && (
              <button
                type="button"
                onClick={onSwitchToStats}
                className="flex h-10 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-[11px] font-black text-slate-200 hover:bg-slate-700"
                title="Basculer vers l'interface Stats complète"
              >
                Mode Stats
              </button>
            )}
          </div>
        </div>
      </header>

      {/* TIROIR VIDÉO ESCAMOTABLE (sans créer de 3e onglet) */}
      {showCameraDrawer && (
        <section className="border-b border-slate-800 bg-slate-900/95 px-3 py-2.5">
          <div className="mx-auto max-w-[1680px] overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-1.5">
              <div className="flex items-center gap-2 text-xs font-black text-white">
                <Video className="h-4 w-4 text-rose-400" />
                Caméra du match
                {camera.camera.active && (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-200">
                    Délai {camera.camera.delay} s · lecture {camera.latency} s
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCameraDrawer(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Fermer la caméra"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[260px] sm:h-[320px]">
              <LiveCameraPanel
                compact
                sessionId={session.id}
                bindVideo={camera.bindVideo}
                active={camera.camera.active}
                delay={camera.camera.delay}
                canChangeDelay
                onDelayChange={camera.changeDelay}
                canStartLocal={false}
                onSeekRelative={camera.seekRelative}
                onJumpToLive={camera.jumpToLive}
                onTogglePause={camera.togglePause}
                message={camera.message}
              />
            </div>
          </div>
        </section>
      )}

      {/* ONGLET 1 : CONSULTATION DISTRIBUTION ADVERSE P1 À P6 */}
      {tab === 'distrib' && (
        <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-3 p-3">
          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-xs font-bold text-rose-200">
              {error}
            </div>
          )}

          {/* GRANDE BARRE TACTILE P1 .. P6 */}
          <div className="grid grid-cols-6 gap-2">
            {ROTATION_TABS.map((rot) => {
              const active = selectedRot === rot;
              const count = rotationCounts[rot] || 0;
              return (
                <button
                  key={rot}
                  type="button"
                  onClick={() => setSelectedRot(rot)}
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 py-2.5 px-2 transition active:scale-95 ${
                    active
                      ? 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                      : 'border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-lg sm:text-xl font-black leading-none">P{rot}</span>
                  <span
                    className={`mt-1 text-[10px] sm:text-[11px] font-bold ${
                      active ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {count} act.
                  </span>
                </button>
              );
            })}
          </div>

          {/* FILTRES RAPIDES OPTIONNELS + EXPORT EXCEL */}
          {showSubFilters && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/85 px-3 py-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
              {availableSetters.length > 0 && (
                <select
                  value={setterFilter}
                  onChange={(e) => setSetterFilter(e.target.value)}
                  className="h-8 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-white"
                  aria-label="Filtrer par passeur"
                >
                  <option value="ALL">Tous passeurs</option>
                  {availableSetters.map((s) => (
                    <option key={s.code} value={s.code}>
                      {formatSetterLabel(s)}
                    </option>
                  ))}
                </select>
              )}

              {availableMatches.length > 1 && (
                <select
                  value={matchFilter}
                  onChange={(e) => setMatchFilter(e.target.value)}
                  className="h-8 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-white"
                  aria-label="Filtrer par match"
                >
                  <option value="ALL">Tous les matchs</option>
                  {availableMatches.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex flex-wrap items-center gap-1">
                {Object.entries(SITUATIONS).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSituationFilter(key)}
                    className={`h-8 rounded-xl border px-2.5 text-[11px] font-bold transition ${
                      situationFilter === key
                        ? 'border-amber-300 bg-amber-400 text-slate-950'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || rows.length === 0}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-xl border border-emerald-400/60 bg-emerald-500 px-3 text-[11px] font-black text-slate-950 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? 'Export…' : 'Exporter Excel'}
              </button>
            </div>
          )}

          {/* SCHÉMAS TERRAIN GRAND FORMAT TABLETTE POUR LA ROTATION CHOISIE */}
          {loading ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 py-16 text-sm text-slate-400">
              Chargement de la distribution…
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-white p-2.5 shadow-xl">
                <DistributionCourtTable
                  fullWidth
                  headerTitle="Distribution adverse"
                  centerBadge={`P${selectedRot}`}
                  gridData={rotDistGrid}
                  decimalMode={false}
                  showRedHighlights
                />
              </div>

              <div className="rounded-2xl border border-slate-700 bg-white p-2.5 shadow-xl">
                <OrgaCourtTable
                  fullWidth
                  rotLabel={`P${selectedRot}`}
                  orgaData={rotOrgaGrid}
                  decimalMode={false}
                  showRedHighlights
                />
              </div>
            </div>
          )}

          {/* BANDE SYNTHÈSE DE LA ROTATION SÉLECTIONNÉE */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <BenchKpi
              label={`Actions en P${selectedRot}`}
              value={rotSummary.actions}
              accent="text-white"
            />
            <BenchKpi
              label="Réception +"
              value={rotSummary.recepPct}
              accent="text-emerald-300"
            />
            <BenchKpi
              label="Zone dominante"
              value={rotSummary.topZone ? rotSummary.topZone.label : '—'}
              hint={
                rotSummary.topZone
                  ? `${rotSummary.topZone.q} ballons (${formatDisValue(rotSummary.topZone.dis, false)})`
                  : 'aucune action'
              }
              accent="text-amber-300"
            />
            <BenchKpi
              label="Base dominante"
              value={rotSummary.topBase ? rotSummary.topBase.label : '—'}
              hint={
                rotSummary.topBase
                  ? `${rotSummary.topBase.data.q} ballons (${formatDisValue(rotSummary.topBase.data.pctBase, false)})`
                  : 'aucune annonce'
              }
              accent="text-sky-300"
            />
          </div>
        </main>
      )}

      {/* ONGLET 2 : STATS (stats-fast-direct en direct, lecture seule) */}
      <FastDirectStatsPane
        session={session}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        readOnly
        active={tab === 'stats'}
      />
    </div>
  );
}

function BenchKpi({ label, value, hint = '', accent }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/85 p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-black ${accent}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] font-semibold text-slate-400">{hint}</div>}
    </div>
  );
}
