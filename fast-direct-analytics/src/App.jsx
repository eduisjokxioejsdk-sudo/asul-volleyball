import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Crosshair,
  Download,
  FileJson,
  Layers,
  RefreshCw,
  Table2,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import DataSourcePanel from './components/DataSourcePanel.jsx';
import FiltersBar from './components/FiltersBar.jsx';
import DataTablePanel from './components/DataTablePanel.jsx';
import {
  CombosPanel,
  DistributionPanel,
  MatchesPanel,
  OverviewPanel,
  PlayersPanel,
  ReceptionPanel,
} from './components/StatsPanels.jsx';
import { Badge, EmptyState } from './components/Ui.jsx';
import {
  computeStats,
  downloadTextFile,
  filterOptions,
  filterRows,
  formatInt,
  rowsToCsv,
} from './utils/statsEngine.js';
import { listLocalSessions, loadLocalSession, readBackupFile } from './utils/dataSource.js';

const TABS = [
  { id: 'overview', label: "Vue d'ensemble", icon: BarChart3 },
  { id: 'reception', label: 'Réception', icon: Target },
  { id: 'distribution', label: 'Distribution', icon: Crosshair },
  { id: 'players', label: 'Attaquants', icon: Users },
  { id: 'matches', label: 'Matchs', icon: Trophy },
  { id: 'combos', label: 'Combinaisons', icon: Layers },
  { id: 'data', label: 'Données', icon: Table2 },
];

const EMPTY_FILTERS = { matches: [], setters: [], rotations: [], players: [] };

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours()
  )}h${pad(now.getMinutes())}`;
}

export default function App() {
  const [dataset, setDataset] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeTab, setActiveTab] = useState('overview');
  const [showSources, setShowSources] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const quickInputRef = useRef(null);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const rows = dataset?.rows || [];
  const options = useMemo(() => filterOptions(rows), [rows]);
  const filteredRows = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const stats = useMemo(() => computeStats(filteredRows), [filteredRows]);
  const sessions = useMemo(() => listLocalSessions(), [dataset, showSources]);

  const applyDataset = (next, message) => {
    setDataset(next);
    setFilters(EMPTY_FILTERS);
    setActiveTab('overview');
    setShowSources(false);
    setError('');
    setNotice({ tone: 'emerald', text: message });
  };

  const handleImportFile = async (file) => {
    setBusy(true);
    setError('');
    try {
      const next = await readBackupFile(file);
      applyDataset(next, `Sauvegarde chargée : ${next.meta.rowCount} action(s).`);
    } catch (err) {
      setError(err?.message || 'Impossible de lire cette sauvegarde.');
    } finally {
      setBusy(false);
    }
  };

  const handlePickSession = (prefix) => {
    setError('');
    try {
      const next = loadLocalSession(prefix);
      applyDataset(next, `Session locale chargée : ${next.meta.rowCount} action(s).`);
    } catch (err) {
      setError(err?.message || 'Impossible de charger cette session locale.');
    }
  };

  const handleClear = () => {
    setDataset(null);
    setFilters(EMPTY_FILTERS);
    setShowSources(true);
    setError('');
    setNotice({ tone: 'sky', text: 'Données retirées de l’application.' });
  };

  const handleExportCsv = () => {
    if (filteredRows.length === 0) {
      setNotice({ tone: 'amber', text: 'Aucune action à exporter avec ces filtres.' });
      return;
    }
    const name = `stats_fast_direct_${timestamp()}.csv`;
    downloadTextFile(name, rowsToCsv(filteredRows), 'text/csv;charset=utf-8');
    setNotice({ tone: 'emerald', text: `${filteredRows.length} action(s) exportée(s) en CSV.` });
  };

  const hasActiveFilters =
    filters.matches.length > 0 ||
    filters.setters.length > 0 ||
    filters.rotations.length > 0 ||
    filters.players.length > 0;

  const renderPanel = () => {
    if (filteredRows.length === 0) {
      return (
        <EmptyState
          title="Aucune action avec ces filtres"
          description="Modifiez ou réinitialisez les filtres pour retrouver des actions."
        >
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200"
          >
            Réinitialiser les filtres
          </button>
        </EmptyState>
      );
    }

    if (activeTab === 'reception') return <ReceptionPanel reception={stats.reception} />;
    if (activeTab === 'distribution') return <DistributionPanel distribution={stats.distribution} />;
    if (activeTab === 'players') {
      return <PlayersPanel players={stats.players} distribution={stats.distribution} />;
    }
    if (activeTab === 'matches') return <MatchesPanel matches={stats.matches} />;
    if (activeTab === 'combos') return <CombosPanel combos={stats.combos} />;
    if (activeTab === 'data') {
      return <DataTablePanel rows={filteredRows} onExportCsv={handleExportCsv} />;
    }
    return <OverviewPanel stats={stats} />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/15 text-xs font-black text-emerald-300">
              FDA
            </span>
            <div>
              <h1 className="text-sm font-black leading-tight text-white">Fast Direct Analytics</h1>
              <p className="text-[11px] text-slate-400">
                Distribution passeur • réception • attaquants
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dataset && <Badge tone="emerald">{formatInt(rows.length)} actions</Badge>}
            {dataset && (
              <Badge tone={dataset.meta.sourceKind === 'file' ? 'sky' : 'purple'}>
                {dataset.meta.sourceKind === 'file' ? 'Sauvegarde .json' : 'Session locale'}
              </Badge>
            )}
            <button
              type="button"
              onClick={() => setShowSources((value) => !value)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Source
            </button>
            <button
              type="button"
              onClick={() => quickInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
            >
              <FileJson className="h-4 w-4" />
              Importer
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!dataset}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <input
              ref={quickInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files && event.target.files[0];
                event.target.value = '';
                if (file) handleImportFile(file);
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-3 py-3">
        {(!dataset || showSources) && (
          <DataSourcePanel
            sessions={sessions}
            dataset={dataset}
            onImportFile={handleImportFile}
            onPickSession={handlePickSession}
            onClear={handleClear}
            error={error}
            busy={busy}
          />
        )}

        {!dataset ? (
          <EmptyState
            title="Aucune donnée Fast Direct chargée"
            description="Importez la sauvegarde .json exportée depuis le mode Fast Direct (Distribution → Sauvegarde JSON) ou chargez une session enregistrée dans ce navigateur. Toutes les statistiques sont calculées localement, sans envoi vers un serveur."
          >
            <button
              type="button"
              onClick={() => quickInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
            >
              <FileJson className="h-4 w-4" />
              Choisir une sauvegarde .json
            </button>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => handlePickSession(sessions[0].prefix)}
                className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
              >
                Charger « {sessions[0].label} »
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            <FiltersBar
              options={options}
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_FILTERS)}
              filteredCount={filteredRows.length}
              totalCount={rows.length}
            />

            <nav className="stats-scroll flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                      active
                        ? 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-md'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
              {hasActiveFilters && (
                <span className="ml-auto shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                  Vue filtrée
                </span>
              )}
            </nav>

            <div className="pb-8">{renderPanel()}</div>
          </>
        )}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 px-3 py-3 text-center text-[11px] text-slate-500">
        Fast Direct Analytics • v1.0.0 — calculs effectués localement, aucune donnée envoyée sur le
        réseau.
      </footer>

      {notice && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-xl border px-4 py-2.5 text-xs font-bold shadow-2xl backdrop-blur ${
            notice.tone === 'emerald'
              ? 'border-emerald-400/60 bg-emerald-950/95 text-emerald-100'
              : notice.tone === 'amber'
                ? 'border-amber-400/60 bg-amber-950/95 text-amber-100'
                : 'border-sky-400/60 bg-sky-950/95 text-sky-100'
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}

