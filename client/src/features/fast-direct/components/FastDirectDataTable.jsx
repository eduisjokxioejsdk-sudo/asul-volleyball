import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { computeSaisieSummary, normalizeRow } from '../utils/scoutingEngine';

function pct(value, total) {
  if (!total) return '—';
  return `${Math.round((value / total) * 100)}%`;
}

/**
 * Consultation brute des actions de distribution. Aucun champ n'est éditable :
 * ce composant est partagé par le banc et par l'hôte en lecture.
 */
export default function FastDirectDataTable({ rows = [], setterList = [] }) {
  const [match, setMatch] = useState('ALL');
  const [setter, setSetter] = useState('ALL');
  const [rotation, setRotation] = useState('ALL');
  const [query, setQuery] = useState('');

  const normalized = useMemo(() => rows.map((r, i) => normalizeRow(r, i)), [rows]);
  const matches = useMemo(
    () => Array.from(new Set(normalized.map((r) => r.match).filter(Boolean))),
    [normalized]
  );
  const setters = useMemo(
    () =>
      Array.from(
        new Set([
          ...setterList.map((s) => String(s.code || '').toUpperCase()).filter(Boolean),
          ...normalized.map((r) => r.setter).filter(Boolean),
        ])
      ),
    [normalized, setterList]
  );
  const rotations = useMemo(
    () => Array.from(new Set(normalized.map((r) => r.rotation).filter(Boolean))),
    [normalized]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return normalized.filter((row) => {
      if (match !== 'ALL' && row.match.toUpperCase() !== match.toUpperCase()) return false;
      if (setter !== 'ALL' && row.setter.toUpperCase() !== setter.toUpperCase()) return false;
      if (rotation !== 'ALL' && row.rotation !== rotation) return false;
      if (!q) return true;
      return `${row.match} ${row.rotation} ${row.setter} ${row.zoneP} ${row.distribP} ${row.joueur} ${row.resAtt}`
        .toLowerCase()
        .includes(q);
    });
  }, [match, normalized, query, rotation, setter]);

  const summary = useMemo(() => computeSaisieSummary(filtered, setterList), [filtered, setterList]);
  const receptions = Object.values(summary.qualiteRCounts || {}).reduce((a, b) => a + b, 0);
  const positiveReceptions =
    (summary.qualiteRCounts?.['#'] || 0) + (summary.qualiteRCounts?.['+'] || 0);
  const attacks = Object.values(summary.resAttCounts || {}).reduce((a, b) => a + b, 0);
  const kills = summary.resAttCounts?.['#'] || 0;
  const attackErrors = (summary.resAttCounts?.Err || 0) + (summary.resAttCounts?.['/'] || 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label="Actions" value={summary.totalRows} />
        <Kpi label="Réception +" value={pct(positiveReceptions, receptions)} />
        <Kpi label="Attaques" value={attacks} />
        <Kpi label="Points attaque" value={kills} />
        <Kpi label="Efficacité attaque" value={pct(kills - attackErrors, attacks)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher joueur, zone, match…"
            className="h-9 w-64 rounded-lg border border-slate-700 bg-slate-800 pl-8 pr-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
          />
        </div>
        <Filter value={match} onChange={setMatch} label="Match" options={matches} />
        <Filter value={setter} onChange={setSetter} label="Passeur" options={setters} />
        <Filter value={rotation} onChange={setRotation} label="Rotation" options={rotations} />
        <span className="ml-auto text-xs font-bold text-slate-400">
          {filtered.length} action{filtered.length > 1 ? 's' : ''} · lecture seule
        </span>
      </div>


      <div className="excel-scroll overflow-auto rounded-xl border border-slate-700 bg-white shadow-xl">
        <table className="w-full min-w-[1050px] border-collapse text-[11px] text-slate-900">
          <thead className="sticky top-0 bg-slate-200">
            <tr>
              {['MATCH', 'ROT.', 'PASSEUR', 'SERVICE', 'ZONE R', 'QUAL. R', 'ZONE P', 'BASE', 'DISTRIB.', 'JOUEUR', 'RÉSULTAT'].map(
                (label) => (
                  <th key={label} className="border border-slate-300 px-2 py-2 text-left font-black">
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={row.uid || row.id || index} className="odd:bg-white even:bg-slate-50">
                <td className="border border-slate-300 px-2 py-1.5 font-bold">{row.match || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{row.rotation || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-bold">{row.setter || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{row.service || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{row.zoneR || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-bold">{row.qualiteR || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{row.zoneP || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{row.baseOff || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{row.distribP || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-bold">{row.joueur || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-bold">{row.resAtt || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
                  Aucune action de distribution enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs font-bold text-slate-100"
      >
        <option value="ALL">Tous</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}
