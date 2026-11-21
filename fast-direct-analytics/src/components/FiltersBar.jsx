import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';

function Chip({ active, onClick, children, tone = 'emerald' }) {
  const activeClass =
    tone === 'sky'
      ? 'border-sky-300 bg-sky-500 text-slate-950'
      : tone === 'purple'
        ? 'border-purple-300 bg-purple-500 text-white'
        : 'border-emerald-300 bg-emerald-500 text-slate-950';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
        active
          ? activeClass
          : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function FiltersBar({
  options,
  filters,
  onChange,
  onReset,
  filteredCount,
  totalCount,
}) {
  const hasActive =
    filters.matches.length > 0 ||
    filters.setters.length > 0 ||
    filters.rotations.length > 0 ||
    filters.players.length > 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-lg">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-300">
          <Filter className="h-4 w-4 text-emerald-300" />
          Filtres
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
            {filteredCount} / {totalCount} actions
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasActive}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-[11px] font-bold text-slate-200 disabled:opacity-40 hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {options.matches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Matchs
            </span>
            {options.matches.map((match) => (
              <Chip
                key={match}
                active={filters.matches.includes(match)}
                onClick={() => onChange({ ...filters, matches: toggle(filters.matches, match) })}
              >
                {match}
              </Chip>
            ))}
          </div>
        )}

        {options.setters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Passeurs
            </span>
            {options.setters.map((setter) => (
              <Chip
                key={setter}
                active={filters.setters.includes(setter)}
                onClick={() => onChange({ ...filters, setters: toggle(filters.setters, setter) })}
              >
                #{setter}
              </Chip>
            ))}
          </div>
        )}

        {options.rotations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Rotations
            </span>
            {options.rotations.map((rotation) => (
              <Chip
                key={rotation}
                tone="sky"
                active={filters.rotations.includes(rotation)}
                onClick={() =>
                  onChange({ ...filters, rotations: toggle(filters.rotations, rotation) })
                }
              >
                P{rotation}
              </Chip>
            ))}
          </div>
        )}

        {options.players.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Attaquants
            </span>
            {options.players.map((player) => (
              <Chip
                key={player}
                tone="purple"
                active={filters.players.includes(player)}
                onClick={() =>
                  onChange({ ...filters, players: toggle(filters.players, player) })
                }
              >
                #{player}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
