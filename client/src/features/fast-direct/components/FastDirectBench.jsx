import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChartColumn,
  Download,
  Eye,
  LayoutDashboard,
  ShieldCheck,
  Table2,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LiveCameraPanel from '../../../components/LiveCameraPanel';
import SetterAnalysisSheetView from './SetterAnalysisSheetView';
import FastDirectDataTable from './FastDirectDataTable';
import useLiveCameraStream from '../hooks/useLiveCameraStream';
import useFastDirectSessionState from '../hooks/useFastDirectSessionState';
import {
  computeSaisieSummary,
  filterRowsForPreset,
  formatSetterLabel,
  normalizeRow,
} from '../utils/scoutingEngine';
import { exportWorkbookIdenticalToOriginal } from '../utils/excelExporter';

const pct = (value, total) => (total ? `${Math.round((value / total) * 100)}%` : '—');

function distributionRows(rows) {
  const byPlayer = new Map();
  rows.forEach((row) => {
    const key = row.joueur || '—';
    const item = byPlayer.get(key) || { player: key, total: 0, kills: 0, errors: 0 };
    item.total += 1;
    if (row.resAtt === '#') item.kills += 1;
    if (row.resAtt === 'Err' || row.resAtt === '/') item.errors += 1;
    byPlayer.set(key, item);
  });
  return Array.from(byPlayer.values())
    .sort((a, b) => b.total - a.total || String(a.player).localeCompare(String(b.player)))
    .slice(0, 8);
}

export default function FastDirectBench({ session, user, role, onLogout }) {
  const navigate = useNavigate();
  const { state, loading, error } = useFastDirectSessionState(session.id);
  const camera = useLiveCameraStream(session.id);
  const [tab, setTab] = useState('banc');
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => state.rows.map((r, i) => normalizeRow(r, i)), [state.rows]);
  const summary = useMemo(
    () => computeSaisieSummary(rows, state.setterList || []),
    [rows, state.setterList]
  );
  const players = useMemo(() => distributionRows(rows), [rows]);
  const activeSheet = state.sheetConfigs.find((sheet) => sheet.id === tab);
  const activeRows = useMemo(
    () => (activeSheet ? filterRowsForPreset(rows, activeSheet) : []),
    [activeSheet, rows]
  );

  const receptions = Object.values(summary.qualiteRCounts || {}).reduce((a, b) => a + b, 0);
  const positiveReceptions =
    (summary.qualiteRCounts?.['#'] || 0) + (summary.qualiteRCounts?.['+'] || 0);
  const attacks = Object.values(summary.resAttCounts || {}).reduce((a, b) => a + b, 0);
  const kills = summary.resAttCounts?.['#'] || 0;
  const attackErrors = (summary.resAttCounts?.Err || 0) + (summary.resAttCounts?.['/'] || 0);
  const topTargets = Object.entries(summary.distribPCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxTarget = topTargets[0]?.[1] || 1;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportWorkbookIdenticalToOriginal(rows, state.sheetConfigs || []);
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { id: 'banc', label: 'Banc / Coach', icon: LayoutDashboard },
    { id: 'saisie', label: 'Données', icon: Table2 },
    ...(state.sheetConfigs || []).map((sheet) => ({
      id: sheet.id,
      label: sheet.title,
      icon: ChartColumn,
    })),
  ];

  return (
    <div className="fast-direct-root min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200"
            onClick={() => navigate('/fast-direct')}
          >
            <ArrowLeft className="h-4 w-4" /> Fast Direct
          </button>
          <div>
            <div className="text-sm font-black text-white">{session.name}</div>
            <div className="text-[11px] font-semibold text-slate-400">
              {session.team1_name} · {session.team2_name} · code {session.join_code}
            </div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-black text-emerald-200">
            <Eye className="h-3.5 w-3.5" /> Banc · lecture seule
          </span>
          {role === 'statistician' && (
            <button
              type="button"
              className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200"
              onClick={onLogout}
            >
              Quitter
            </button>
          )}
        </div>
        <div className="mx-auto flex max-w-[1680px] gap-1.5 overflow-x-auto px-4 pb-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black ${
                  tab === item.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-slate-800 bg-slate-900 text-slate-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto flex max-w-[1680px] flex-col gap-3 px-3 py-3">
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-xs font-bold text-rose-200">
            {error}
          </div>
        )}

        {!loading && tab === 'banc' && (
          <>
            <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
              <section className="min-h-[320px] overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
                  <Video className="h-4 w-4 text-rose-400" />
                  <strong className="text-xs text-white">Caméra du match</strong>
                  {camera.camera.active && (
                    <span className="ml-auto rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-black text-rose-200">
                      DIFFUSION · {camera.camera.delay} s
                    </span>
                  )}
                </div>
                <div className="h-[300px]">
                  <LiveCameraPanel
                    compact
                    sessionId={session.id}
                    bindVideo={camera.bindVideo}
                    active={camera.camera.active}
                    delay={camera.camera.delay}
                    canStartLocal={false}
                    onSeekRelative={camera.seekRelative}
                    onJumpToLive={camera.jumpToLive}
                    onTogglePause={camera.togglePause}
                    message={camera.message}
                    extra={
                      camera.camera.active ? (
                        <span className="text-[10px] font-bold text-slate-400">
                          lecture {camera.latency} s
                        </span>
                      ) : null
                    }
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                      Synthèse Fast Direct
                    </div>
                    <h3 className="text-lg font-black text-white">Distribution en direct</h3>
                  </div>
                  <span className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-300">
                    Rév. {state.revision || 0}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <BenchKpi label="Actions" value={summary.totalRows} accent="text-white" />
                  <BenchKpi
                    label="Réception +"
                    value={pct(positiveReceptions, receptions)}
                    accent="text-emerald-300"
                  />
                  <BenchKpi label="Attaques" value={attacks} accent="text-sky-300" />
                  <BenchKpi
                    label="Efficacité attaque"
                    value={pct(kills - attackErrors, attacks)}
                    accent="text-amber-300"
                  />
                </div>
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Zones de distribution les plus utilisées
                  </div>
                  {topTargets.length === 0 ? (
                    <div className="text-xs text-slate-500">Aucune distribution enregistrée.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {topTargets.map(([zone, count]) => (
                        <div key={zone} className="flex items-center gap-2">
                          <span className="w-9 text-[11px] font-black text-slate-200">{zone}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                            <div
                              className="h-full rounded bg-emerald-400"
                              style={{ width: `${Math.max(4, (count / maxTarget) * 100)}%` }}
                            />
                          </div>
                          <span className="w-6 text-right text-[10px] font-bold text-slate-400">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>


            <section className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <strong className="text-xs text-white">Attaquants sollicités</strong>
                <span className="text-[10px] font-semibold text-slate-500">
                  calculé uniquement sur les actions de distribution
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Joueur</th>
                      <th className="px-2 py-2">Ballons</th>
                      <th className="px-2 py-2">Points</th>
                      <th className="px-2 py-2">Fautes / contres</th>
                      <th className="px-2 py-2">Efficacité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player) => (
                      <tr key={player.player} className="border-t border-slate-800">
                        <td className="px-2 py-2 font-black text-white">N° {player.player}</td>
                        <td className="px-2 py-2 text-slate-300">{player.total}</td>
                        <td className="px-2 py-2 text-emerald-300">{player.kills}</td>
                        <td className="px-2 py-2 text-rose-300">{player.errors}</td>
                        <td className="px-2 py-2 font-bold text-amber-200">
                          {pct(player.kills - player.errors, player.total)}
                        </td>
                      </tr>
                    ))}
                    {players.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                          Aucun attaquant renseigné.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!loading && tab === 'saisie' && (
          <FastDirectDataTable rows={rows} setterList={state.setterList || []} />
        )}

        {!loading && activeSheet && (
          <SetterAnalysisSheetView
            sheetConfig={activeSheet}
            filteredRows={activeRows}
            allMatches={state.matchList || []}
            allSetters={state.setterList || []}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pb-4">
          <span className="mr-auto text-[10px] font-semibold text-slate-500">
            {state.sheetConfigs?.length || 0} feuille(s) · {rows.length} action(s) · aucune
            modification autorisée sur cet appareil
          </span>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || rows.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400/60 bg-emerald-500 px-3 text-xs font-black text-slate-950 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Export…' : 'Exporter Excel'}
          </button>
        </div>
      </main>
    </div>
  );
}

function BenchKpi({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${accent}`}>{value}</div>
    </div>
  );
}
