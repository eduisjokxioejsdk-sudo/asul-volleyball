import React, { useState, useMemo } from 'react';
import { Filter, Plus, Trash2, Search, Edit3 } from 'lucide-react';
import {
  computeSaisieSummary,
  formatDisValue,
  formatSetterLabel,
} from '../utils/scoutingEngine';

const EXCEL_GREEN = '#A8D08D';
const EXCEL_GRAY = '#BFBFBF';
const EXCEL_DARK_GRAY = '#A5A5A5';

function SimpleBarChart({ title, items, color = '#2563eb', showPercent = false }) {
  const total = items.reduce((s, it) => s + it.value, 0);
  const maxVal = Math.max(1, ...items.map((it) => it.value));

  return (
    <div className="rounded-lg border border-black/40 bg-white p-2.5 text-black shadow-sm">
      <div className="mb-2 text-center text-[11px] font-black uppercase tracking-wide text-slate-800">
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((it) => {
          const widthPct = Math.round((it.value / maxVal) * 100);
          const sharePct = total > 0 ? ((it.value / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={it.label} className="flex items-center gap-2 text-[11px]">
              <div className="w-12 shrink-0 text-right font-bold text-slate-700 truncate">
                {it.label}
              </div>
              <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden border border-slate-200">
                <div
                  className="h-full transition-all"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-16 shrink-0 font-bold text-slate-800 text-right">
                {it.value}
                {showPercent ? ` (${sharePct}%)` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SaisieSheetView({
  rows,
  allMatches,
  allSetters = [],
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onDeleteMatch,
  onRenameMatch,
  onDeleteSetter,
}) {
  const [filterMatch, setFilterMatch] = useState('ALL');
  const [confirmDeleteMatch, setConfirmDeleteMatch] = useState(false);
  const [isRenamingMatch, setIsRenamingMatch] = useState(false);
  const [renameMatchDraft, setRenameMatchDraft] = useState('');
  const [filterSetter, setFilterSetter] = useState('ALL');
  const [confirmDeleteSetter, setConfirmDeleteSetter] = useState(false);
  const [filterRot, setFilterRot] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editVal, setEditVal] = useState('');

  const summary = useMemo(() => computeSaisieSummary(rows, allSetters), [rows, allSetters]);

  const filteredTableRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterMatch !== 'ALL' && r.match.toUpperCase() !== filterMatch.toUpperCase()) return false;
      if (filterSetter !== 'ALL' && r.setter.toUpperCase() !== filterSetter.toUpperCase()) return false;
      if (filterRot !== 'ALL' && r.rotation !== filterRot) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hay = `${r.match} ${r.rotation} ${r.setter} ${r.zoneP} ${r.distribP} ${r.joueur} ${r.resAtt}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterMatch, filterSetter, filterRot, searchTerm]);

  const startEdit = (row, field) => {
    setEditingCell({ id: row.id, field });
    setEditVal(row[field] ?? '');
  };

  const commitEdit = () => {
    if (!editingCell) return;
    onUpdateRow(editingCell.id, { [editingCell.field]: editVal });
    setEditingCell(null);
  };

  const colsMeta = [
    { key: 'match', label: 'MATCH', width: 'w-28' },
    { key: 'rotation', label: 'ROTATION', width: 'w-16' },
    { key: 'setter', label: 'N° P', width: 'w-14' },
    { key: 'service', label: 'SERVICE', width: 'w-14' },
    { key: 'zoneR', label: 'ZONE R', width: 'w-14' },
    { key: 'qualiteR', label: 'QUALITE R', width: 'w-16' },
    { key: 'zoneP', label: 'ZONE P', width: 'w-16' },
    { key: 'baseOff', label: 'BASE OFF', width: 'w-16' },
    { key: 'distribP', label: 'DISTRIB P', width: 'w-16' },
    { key: 'joueur', label: 'N° JOUEUR', width: 'w-16' },
    { key: 'resAtt', label: 'RES ATT', width: 'w-16' },
  ];

  // Tableaux compteurs O15..AH27
  const counterGroups = [
    {
      title: 'ROTATIONS',
      rows: ['1', '2', '3', '4', '5', '6'].map((k) => [`ZP${k}`, summary.rotCounts[k] || 0]),
    },
    {
      title: 'PASSEUR',
      rows: Object.entries(summary.setterCounts).map(([code, val]) => [
        code === 'NP' ? 'NP' : `P#${code}`,
        val || 0,
      ]),
    },
    {
      title: 'SERVICE',
      rows: ['S', 'F', 'T', 'C'].map((k) => [k, summary.serviceCounts[k] || 0]),
    },
    {
      title: 'ZONE R',
      rows: ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => [
        `R${k}`,
        summary.zoneRCounts[k] || 0,
      ]),
    },
    {
      title: 'QUALITE R',
      rows: ['#', '+', '0', '!', '-', 'Err'].map((k) => [
        k === 'Err' ? 'ERR' : `R${k}`,
        summary.qualiteRCounts[k] || 0,
      ]),
    },
    {
      title: 'ZONE P',
      rows: ['1', '6', '5', '7', '8', '8A', '8C', '9', '2', '3', '3A', '3C', '4'].map((k) => [
        k,
        summary.zonePCounts[k] || 0,
      ]),
    },
    {
      title: 'BASE OFF',
      rows: ['1', '2', '7', '0'].map((k) => [`B${k}`, summary.baseOffCounts[k] || 0]),
    },
    {
      title: 'DISTRIB P',
      rows: ['1', '1C', '2', '7', '3', '4', '5', '6', '10', '8', '9', 'PM'].map((k) => [
        k,
        summary.distribPCounts[k] || 0,
      ]),
    },
    {
      title: 'RES ATT',
      rows: ['#', '+', '0', '/', 'Err'].map((k) => [
        k === 'Err' ? 'ERR' : `A${k}`,
        summary.resAttCounts[k] || 0,
      ]),
    },
    {
      title: 'N° JOUEUR',
      rows: Object.entries(summary.joueurCounts).map(([k, v]) => [k, v]),
    },
  ];

  const zonePPercent = (val) =>
    summary.totalZoneP > 0 ? formatDisValue(val / summary.totalZoneP, false) : '0.0%';

  const miniDistPercent = (val) =>
    summary.totalMiniDist > 0 ? formatDisValue(val / summary.totalMiniDist, false) : '0.0%';

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Filtres de la feuille saisie */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-black text-emerald-300 border border-emerald-500/40">
            <Filter className="h-3.5 w-3.5" />
            Feuille : saisie ({filteredTableRows.length} / {rows.length} lignes)
          </span>

          <select
            value={filterMatch}
            onChange={(e) => {
              setFilterMatch(e.target.value);
              setConfirmDeleteMatch(false);
              setIsRenamingMatch(false);
              setRenameMatchDraft('');
            }}
            className="h-9 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-slate-100"
          >
            <option value="ALL">Tous les matchs</option>
            {allMatches.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {filterMatch !== 'ALL' && onRenameMatch && (
            isRenamingMatch ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const renamed = onRenameMatch(filterMatch, renameMatchDraft);
                  if (renamed) setFilterMatch(renamed);
                  setIsRenamingMatch(false);
                  setRenameMatchDraft('');
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-sky-500/50 bg-sky-500/15 px-2 py-1 text-xs"
              >
                <input
                  type="text"
                  value={renameMatchDraft}
                  onChange={(e) => setRenameMatchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsRenamingMatch(false);
                      setRenameMatchDraft('');
                    }
                  }}
                  aria-label="Nouveau nom du match"
                  className="h-7 w-32 rounded-lg border border-sky-400 bg-slate-800 px-2 text-xs font-black text-white outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-7 rounded-lg bg-sky-500 px-2 text-[11px] font-black text-slate-950 hover:bg-sky-400"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRenamingMatch(false);
                    setRenameMatchDraft('');
                  }}
                  className="h-7 rounded-lg bg-slate-700 px-2 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
                >
                  Annuler
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteMatch(false);
                  setRenameMatchDraft(filterMatch);
                  setIsRenamingMatch(true);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/10 px-2.5 text-xs font-bold text-sky-300 hover:bg-sky-500/20"
                title={`Renommer le match ${filterMatch}`}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Renommer
              </button>
            )
          )}

          {filterMatch !== 'ALL' && onDeleteMatch && (
            confirmDeleteMatch ? (
              <div className="inline-flex items-center gap-1 rounded-xl border border-rose-500/50 bg-rose-500/15 px-2 py-1 text-xs">
                <span className="font-bold text-rose-200">
                  Supprimer {filterMatch} (
                  {
                    rows.filter(
                      (r) => String(r.match || '').trim().toUpperCase() === filterMatch.toUpperCase()
                    ).length
                  }{' '}
                  act.) ?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteMatch(filterMatch);
                    setFilterMatch('ALL');
                    setConfirmDeleteMatch(false);
                  }}
                  className="rounded-lg bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white hover:bg-rose-400"
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteMatch(false)}
                  className="rounded-lg bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
                >
                  Non
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsRenamingMatch(false);
                  setConfirmDeleteMatch(true);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                title={`Supprimer le match ${filterMatch} et ses actions`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Suppr. {filterMatch}
              </button>
            )
          )}

          <select
            value={filterSetter}
            onChange={(e) => {
              setFilterSetter(e.target.value);
              setConfirmDeleteSetter(false);
            }}
            className="h-9 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-slate-100"
          >
            <option value="ALL">Tous passeurs</option>
            {allSetters.map((s) => (
              <option key={s.code} value={s.code}>
                {formatSetterLabel(s)}
              </option>
            ))}
            <option value="NP">NP</option>
          </select>

          {filterSetter !== 'ALL' && filterSetter !== 'NP' && onDeleteSetter && (
            confirmDeleteSetter ? (
              <div className="inline-flex items-center gap-1 rounded-xl border border-rose-500/50 bg-rose-500/15 px-2 py-1 text-xs">
                <span className="font-bold text-rose-200">
                  Supprimer N° {filterSetter} (
                  {
                    rows.filter(
                      (r) => String(r.setter || '').trim().toUpperCase() === filterSetter.toUpperCase()
                    ).length
                  }{' '}
                  act.) ?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSetter(filterSetter);
                    setFilterSetter('ALL');
                    setConfirmDeleteSetter(false);
                  }}
                  className="rounded-lg bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white hover:bg-rose-400"
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSetter(false)}
                  className="rounded-lg bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
                >
                  Non
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteSetter(true)}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                title={`Supprimer le passeur N° ${filterSetter} et ses actions`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Suppr. N° {filterSetter}
              </button>
            )
          )}

          <select
            value={filterRot}
            onChange={(e) => setFilterRot(e.target.value)}
            className="h-9 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-slate-100"
          >
            <option value="ALL">Toutes rotations</option>
            {['1', '6', '5', '4', '3', '2'].map((r) => (
              <option key={r} value={r}>
                Rotation {r}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher..."
              className="h-9 rounded-xl border border-slate-700 bg-slate-800 pl-8 pr-3 text-xs text-white outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onAddRow({
              match:
                filterMatch !== 'ALL'
                  ? filterMatch
                  : allMatches[allMatches.length - 1] || 'MATCH 1',
              rotation: filterRot !== 'ALL' ? filterRot : '1',
              setter: filterSetter !== 'ALL' ? filterSetter : allSetters[0]?.code || 'NP',
              service: 'F',
              zoneR: '6',
              qualiteR: '#',
              zoneP: '3',
              baseOff: '1',
              distribP: '5',
              joueur: '33',
              resAtt: '#',
            })
          }
          className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-black text-slate-950 hover:bg-emerald-400"
        >
          <Plus className="h-4 w-4" />
          Ajouter ligne
        </button>
      </div>

      {/* CONTENU EXCEL DE SAISIE : GAUCHE TABLEAU A-K | DROITE COMPTEURS, SCHÉMAS & GRAPHIQUES */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* COLONNE GAUCHE : Tableau Excel A..K */}
        <div className="xl:col-span-5 rounded-xl border border-slate-700 bg-white text-black shadow-lg overflow-hidden">
          <div className="excel-scroll max-h-[760px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-200 text-black shadow-sm">
                <tr>
                  <th className="border border-slate-400 px-1.5 py-1 text-center font-bold bg-slate-300">
                    #
                  </th>
                  {colsMeta.map((c) => (
                    <th
                      key={c.key}
                      className={`border border-slate-400 px-1.5 py-1 text-center font-black whitespace-nowrap ${c.width}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="border border-slate-400 px-1.5 py-1 text-center font-bold bg-slate-300">
                    Suppr
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={idx % 2 === 0 ? 'bg-white hover:bg-emerald-50' : 'bg-slate-50 hover:bg-emerald-50'}
                  >
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[10px] text-slate-500 bg-slate-100">
                      {idx + 15}
                    </td>
                    {colsMeta.map((col) => {
                      const isEditing =
                        editingCell?.id === row.id && editingCell?.field === col.key;
                      return (
                        <td
                          key={col.key}
                          onClick={() => startEdit(row, col.key)}
                          className="border border-slate-300 px-1 py-1 text-center font-semibold cursor-pointer hover:bg-amber-100/70"
                          title="Cliquer pour modifier"
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={editVal}
                              onChange={(e) => setEditVal(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              className="w-full rounded border border-emerald-500 bg-white px-1 text-center text-[11px] font-bold outline-none"
                              autoFocus
                            />
                          ) : (
                            row[col.key]
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteRow(row.id)}
                        className="rounded p-0.5 text-rose-600 hover:bg-rose-100"
                        title="Supprimer cette ligne"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLONNE DROITE : Compteurs O-AH, Schémas Terrains & 6 Graphiques */}
        <div className="xl:col-span-7 flex flex-col gap-4 rounded-xl border border-slate-700 bg-white p-3 text-black shadow-lg">
          {/* 1. Compteurs O15:AH27 */}
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
              Compteurs automatiques (Colonnes O à AH)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {counterGroups.map((grp) => (
                <table key={grp.title} className="border-collapse text-[10px] shadow-xs">
                  <thead>
                    <tr>
                      <th
                        colSpan={2}
                        className="border border-black/50 px-1.5 py-0.5 text-center font-bold"
                        style={{ backgroundColor: EXCEL_GRAY }}
                      >
                        {grp.title}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {grp.rows.map(([k, v]) => (
                      <tr key={k}>
                        <td
                          className="border border-black/40 px-1.5 py-0.5 font-bold"
                          style={{ backgroundColor: '#e2e8f0' }}
                        >
                          {k}
                        </td>
                        <td className="border border-black/40 px-1.5 py-0.5 text-right font-mono font-bold bg-white">
                          {v}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </div>

          {/* 2. Les deux schémas terrains de `saisie` : `zone de PASSE` et `Distribution en` */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Schéma zone de PASSE (BC15:BQ32) */}
            <div
              className="border-2 border-black p-2"
              style={{ backgroundColor: EXCEL_GREEN }}
            >
              <div
                className="mb-2 inline-block border border-black/60 px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: EXCEL_GRAY }}
              >
                zone de PASSE
              </div>

              {/* Ligne fond: 1, 6, 5 */}
              <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[10px]">
                {['1', '6', '5'].map((zp) => (
                  <div key={zp} className="border border-black/70 bg-white/80 p-1">
                    <div className="font-black">ZP {zp}</div>
                    <div className="font-bold">{summary.zonePCounts[zp] || 0}</div>
                    <div className="text-[9px] text-slate-700">
                      {zonePPercent(summary.zonePCounts[zp] || 0)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Ligne 3m: 9, 8A, 8, 8C, 7 */}
              <div className="mb-2 grid grid-cols-5 gap-1 text-center text-[10px]">
                {['9', '8A', '8', '8C', '7'].map((zp) => (
                  <div key={zp} className="border border-black/70 bg-white/80 p-1">
                    <div className="font-black">{zp}</div>
                    <div className="font-bold">{summary.zonePCounts[zp] || 0}</div>
                    <div className="text-[9px] text-slate-700">
                      {zonePPercent(summary.zonePCounts[zp] || 0)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Ligne filet: 2, 3A, 3, 3C, 4 */}
              <div className="mb-2 grid grid-cols-5 gap-1 border-b-2 border-black pb-2 text-center text-[10px]">
                {['2', '3A', '3', '3C', '4'].map((zp) => (
                  <div key={zp} className="border border-black/70 bg-white/80 p-1">
                    <div className="font-black">{zp}</div>
                    <div className="font-bold">{summary.zonePCounts[zp] || 0}</div>
                    <div className="text-[9px] text-slate-700">
                      {zonePPercent(summary.zonePCounts[zp] || 0)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold">
                <span>TOTAL ACTIONS : {summary.totalZoneP}</span>
                <span>ACTIONS # : {summary.resAttCounts['#'] || 0}</span>
              </div>
            </div>

            {/* Schéma Distribution en (BU15:CJ32) */}
            <div
              className="border-2 border-black p-2"
              style={{ backgroundColor: EXCEL_GREEN }}
            >
              <div
                className="mb-2 inline-block border border-black/60 px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: EXCEL_GRAY }}
              >
                Distribution en
              </div>

              {/* Arrière: EN 1 | PIPE | autres */}
              <div className="mb-2 grid grid-cols-3 gap-2 text-[10px]">
                {[
                  ['EN 1', summary.miniDistQ.EN1],
                  ['PIPE', summary.miniDistQ.PIPE],
                  ['autres', summary.miniDistQ.autres],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="border border-black/70 bg-white/85">
                    <div
                      className="border-b border-black/60 px-1 py-0.5 text-center font-bold"
                      style={{ backgroundColor: EXCEL_GRAY }}
                    >
                      {lbl}
                    </div>
                    <div className="flex justify-between px-1.5 py-0.5">
                      <span className="font-semibold">Q</span>
                      <span className="font-black">{val}</span>
                    </div>
                    <div className="flex justify-between px-1.5 py-0.5 border-t border-black/20">
                      <span>Dis</span>
                      <span className="font-bold">{miniDistPercent(val)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Filet: EN 2 | FIX ARR | FIX AV | DECA | EN 4 */}
              <div className="mb-2 grid grid-cols-5 gap-1 border-b-2 border-black pb-2 text-[10px]">
                {[
                  ['EN 2', summary.miniDistQ.EN2],
                  ['FIX ARR', summary.miniDistQ.FIX_ARR],
                  ['FIX AV', summary.miniDistQ.FIX_AV],
                  ['DECA', summary.miniDistQ.DECA],
                  ['EN 4', summary.miniDistQ.EN4],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="border border-black/70 bg-white/85">
                    <div
                      className="border-b border-black/60 px-0.5 py-0.5 text-center font-bold truncate"
                      style={{ backgroundColor: EXCEL_GRAY }}
                    >
                      {lbl}
                    </div>
                    <div className="flex justify-between px-1 py-0.5">
                      <span>Q</span>
                      <span className="font-black">{val}</span>
                    </div>
                    <div className="flex justify-between px-1 py-0.5 border-t border-black/20">
                      <span>Dis</span>
                      <span className="font-bold">{miniDistPercent(val)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold">
                <span>TOTAL ACTIONS : {summary.totalMiniDist}</span>
                <span>ACTIONS # : {summary.resAttCounts['#'] || 0}</span>
              </div>
            </div>
          </div>

          {/* 3. Les 6 graphiques d'origine (chart1..chart6) */}
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
              Graphiques de synthèse (identiques à la feuille saisie)
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <SimpleBarChart
                title="TEMPS DE JEU DE P"
                color="#0284c7"
                showPercent
                items={[
                  { label: 'P#3', value: summary.setterCounts['3'] || 0 },
                  { label: 'P#6', value: summary.setterCounts['6'] || 0 },
                  { label: 'P#8', value: summary.setterCounts['8'] || 0 },
                ]}
              />
              <SimpleBarChart
                title="% DE ROTATIONS"
                color="#16a34a"
                showPercent
                items={['1', '2', '3', '4', '5', '6'].map((r) => ({
                  label: `ZP${r}`,
                  value: summary.rotCounts[r] || 0,
                }))}
              />
              <SimpleBarChart
                title="ORGA OFFENSIVE"
                color="#ea580c"
                showPercent
                items={['1', '2', '7', '0'].map((b) => ({
                  label: `B${b}`,
                  value: summary.baseOffCounts[b] || 0,
                }))}
              />
              <SimpleBarChart
                title="QUALITE DE REC"
                color="#9333ea"
                showPercent
                items={['#', '+', '0', '!', '-', 'Err'].map((q) => ({
                  label: q === 'Err' ? 'ERR' : `R${q}`,
                  value: summary.qualiteRCounts[q] || 0,
                }))}
              />
              <SimpleBarChart
                title="EFFICACITE OFFENSIVE"
                color="#059669"
                showPercent
                items={['#', '+', '0', '/', 'Err'].map((a) => ({
                  label: a === 'Err' ? 'ERR' : `A${a}`,
                  value: summary.resAttCounts[a] || 0,
                }))}
              />
              <SimpleBarChart
                title="REPARTITION OFFENSIVE"
                color="#dc2626"
                showPercent
                items={Object.entries(summary.joueurCounts)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => ({
                    label: `#${k}`,
                    value: v,
                  }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
