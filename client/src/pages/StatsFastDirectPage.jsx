import React from 'react';
import AppNavigation from '../components/AppNavigation';

const STATS_APP_URL = `${import.meta.env.BASE_URL}stats-fast-direct/index.html?theme=dark`;

/**
 * Application « Stats facile » : page autonome (HTML/JS) servie depuis
 * client/public/stats-fast-direct et affichée en plein écran sous la barre de
 * navigation globale, qui reste déployée en permanence.
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
          top: 'var(--nav-h)',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'block',
          width: '100vw',
          height: 'calc(100vh - var(--nav-h))',
          minHeight: 'calc(100vh - var(--nav-h))',
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
