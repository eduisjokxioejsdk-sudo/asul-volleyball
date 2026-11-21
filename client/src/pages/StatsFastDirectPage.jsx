import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react';
import AppNavigation from '../components/AppNavigation';

const STATS_APP_URL = `${import.meta.env.BASE_URL}stats-fast-direct/index.html`;

/**
 * Application « Stats Fast Direct » : page autonome (HTML/JS) servie depuis
 * client/public/stats-fast-direct. Elle est affichée dans un cadre plein écran
 * pour rester dans Pancake Stats (barre de navigation conservée).
 */
export default function StatsFastDirectPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <AppNavigation user={user} onLogout={onLogout} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/85 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700"
            title="Retour au Hub"
          >
            <ArrowLeft className="h-4 w-4" />
            Hub
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black leading-tight text-white">
              Stats Fast Direct
            </h1>
            <p className="truncate text-[11px] text-slate-400">
              Match live, statistiques équipe & joueurs, grille originale, exports Excel / PDF / CSV
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            <RotateCw className="h-4 w-4" />
            Recharger
          </button>
          <a
            href={STATS_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir en plein écran
          </a>
        </div>
      </div>

      <iframe
        key={reloadKey}
        title="Stats Fast Direct"
        src={STATS_APP_URL}
        className="w-full flex-1 border-0 bg-white"
        style={{ minHeight: 'calc(100vh - 104px)' }}
      />
    </div>
  );
}
