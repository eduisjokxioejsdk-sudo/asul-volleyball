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
      className="stats-facile-page"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        minHeight: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: '#09090b',
        borderRadius: 0,
      }}
    >
      <AppNavigation user={user} onLogout={onLogout} />
      <iframe
        title="Stats facile"
        src={STATS_APP_URL}
        width="100%"
        height="100%"
        className="stats-facile-iframe"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'block',
          width: '100vw',
          height: '100vh',
          minHeight: '100vh',
          border: 0,
          margin: 0,
          padding: 0,
          background: '#09090b',
          borderRadius: 0,
          zIndex: 1,
        }}
      />
    </div>
  );
}
