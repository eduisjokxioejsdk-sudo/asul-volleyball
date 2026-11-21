import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { SectionCard, Table } from './Ui.jsx';
import { formatInt } from '../utils/statsEngine.js';

const PAGE_SIZE = 60;

function matchesSearch(row, needle) {
  if (!needle) return true;
  const haystack = [
    row.match,
    row.rotation,
    row.setter,
    row.service,
    row.zoneR,
    row.qualiteR,
    row.zoneP,
    row.baseOff,
    row.distribP,
    row.joueur,
    row.resAtt,
  ]
    .join(' ')
    .toUpperCase();
  return haystack.includes(needle);
}

export default function DataTablePanel({ rows, onExportCsv }) {
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return needle ? rows.filter((row) => matchesSearch(row, needle)) : rows;
  }, [rows, search]);

  const shown = filtered.slice(0, visible);

  return (
    <SectionCard
      title="Données détaillées"
      subtitle="Toutes les actions chargées, avec recherche et export CSV."
      right={
        <button
          type="button"
          onClick={onExportCsv}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
        >
          <Download className="h-4 w-4" />
          Exporter CSV
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Rechercher un match, un joueur, une zone…"
            className="w-full bg-transparent text-xs font-semibold text-slate-100 outline-none placeholder:text-slate-500"
          />
        </label>
        <span className="text-[11px] font-bold text-slate-400">
          {formatInt(filtered.length)} ligne(s) affichable(s) sur {formatInt(rows.length)}
        </span>
      </div>

      <Table
        head={[
          'Match',
          'Rot.',
          'Passeur',
          'Service',
          'Zone récep.',
          'Qualité',
          'Zone passe',
          'Base',
          'Distribution',
          'Attaquant',
          'Résultat',
        ]}
      >
        {shown.length === 0 && (
          <tr>
            <td colSpan={11} className="px-2.5 py-4 text-center text-slate-500">
              Aucune action ne correspond à la recherche.
            </td>
          </tr>
        )}
        {shown.map((row) => (
          <tr key={row.uid} className="text-slate-200 hover:bg-slate-800/40">
            <td className="whitespace-nowrap px-2.5 py-1.5 font-bold">{row.match || '—'}</td>
            <td className="px-2.5 py-1.5 text-sky-300">P{row.rotation || '?'}</td>
            <td className="px-2.5 py-1.5">#{row.setter || '—'}</td>
            <td className="px-2.5 py-1.5">{row.service || '—'}</td>
            <td className="px-2.5 py-1.5">{row.zoneR || '—'}</td>
            <td className="px-2.5 py-1.5 font-bold">{row.qualiteR || '—'}</td>
            <td className="px-2.5 py-1.5">{row.zoneP || '—'}</td>
            <td className="px-2.5 py-1.5">{row.baseOff || '—'}</td>
            <td className="px-2.5 py-1.5 font-black text-emerald-300">{row.distribP || '—'}</td>
            <td className="px-2.5 py-1.5 font-bold text-purple-200">#{row.joueur || '—'}</td>
            <td className="px-2.5 py-1.5 font-bold">{row.resAtt || '—'}</td>
          </tr>
        ))}
      </Table>

      {visible < filtered.length && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((value) => value + PAGE_SIZE)}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            Afficher {Math.min(PAGE_SIZE, filtered.length - visible)} lignes de plus
          </button>
        </div>
      )}
    </SectionCard>
  );
}
