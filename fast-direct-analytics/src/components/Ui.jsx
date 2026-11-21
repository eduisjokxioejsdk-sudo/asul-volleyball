import React from 'react';

export const TONE_BAR = {
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-400',
  amber: 'bg-amber-400',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  red: 'bg-red-500',
  sky: 'bg-sky-500',
  purple: 'bg-purple-500',
  slate: 'bg-slate-500',
};

export const TONE_TEXT = {
  emerald: 'text-emerald-300',
  teal: 'text-teal-300',
  amber: 'text-amber-300',
  orange: 'text-orange-300',
  rose: 'text-rose-300',
  red: 'text-red-300',
  sky: 'text-sky-300',
  purple: 'text-purple-300',
  slate: 'text-slate-300',
};

export const TONE_BADGE = {
  emerald: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
  teal: 'border-teal-400/50 bg-teal-500/15 text-teal-200',
  amber: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
  orange: 'border-orange-400/50 bg-orange-500/15 text-orange-200',
  rose: 'border-rose-400/50 bg-rose-500/15 text-rose-200',
  red: 'border-red-400/50 bg-red-500/15 text-red-200',
  sky: 'border-sky-400/50 bg-sky-500/15 text-sky-200',
  purple: 'border-purple-400/50 bg-purple-500/15 text-purple-200',
  slate: 'border-slate-500/50 bg-slate-700/40 text-slate-200',
};

export function Badge({ children, tone = 'slate' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_BADGE[tone] || TONE_BADGE.slate}`}
    >
      {children}
    </span>
  );
}

export function SectionCard({ title, subtitle, right = null, children, className = '' }) {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg ${className}`}
    >
      {(title || right) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && (
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone = 'emerald' }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 shadow">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black leading-tight ${TONE_TEXT[tone] || 'text-white'}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Liste de barres horizontales.
 * items: [{ label, value, share, hint?, tone? }]
 */
export function BarList({ items, emptyLabel = 'Aucune donnée', valueLabel }) {
  if (!items || items.length === 0) {
    return <p className="rounded-xl bg-slate-950/60 px-3 py-4 text-center text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => {
        const share = typeof item.share === 'number' ? item.share : 0;
        const width = Math.max(0, Math.min(100, share * 100));
        return (
          <li key={item.key || item.label} className="rounded-xl bg-slate-950/60 px-2.5 py-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-bold text-slate-200">{item.label}</span>
              <span className="shrink-0 font-black text-slate-300">
                {valueLabel ? valueLabel(item) : item.value}
                <span className="ml-1.5 font-semibold text-slate-500">
                  {(share * 100).toFixed(1)} %
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${TONE_BAR[item.tone] || TONE_BAR.emerald}`}
                style={{ width: `${width}%` }}
              />
            </div>
            {item.hint && <p className="mt-0.5 text-[10px] text-slate-500">{item.hint}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyState({ title, description, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
      <p className="text-base font-black text-slate-200">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Table({ head, children, className = '' }) {
  return (
    <div className={`stats-scroll overflow-x-auto rounded-xl border border-slate-800 ${className}`}>
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400">
          <tr>
            {head.map((label) => (
              <th key={label} className="whitespace-nowrap px-2.5 py-2 font-bold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">{children}</tbody>
      </table>
    </div>
  );
}
