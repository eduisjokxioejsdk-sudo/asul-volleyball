import React from 'react';
import AppNavigation from '../components/AppNavigation';

const STATS_APP_URL = `${import.meta.env.BASE_URL}stats-fast-direct/index.html?theme=dark`;

/**
 * Application « Stats facile » : page autonome (HTML/JS) servie depuis
 * client/public/stats-fast-direct et affichée directement en plein écran.
 * La barre de navigation globale reste accessible au survol en haut de l'écran.
 */
export default function StatsFastDirectPage({ user, onLogout }) {
  return (
    <div
      className="h-screen w-full overflow-hidden bg-[#09090b] text-zinc-100"
      style={{ borderRadius: 0 }}
    >
      <AppNavigation user={user} onLogout={onLogout} />
      <iframe
        title="Stats facile"
        src={STATS_APP_URL}
        className="block h-screen w-full border-0 bg-[#09090b]"
        style={{ borderRadius: 0 }}
      />
    </div>
  );
}
