// ============================================================================
// APPLICATION 2 : TRAJECTOIRES & RADAR (Hub dédié)
// ============================================================================

import React from 'react';
import AppNavigation from '../components/AppNavigation';
import TrajectoryHome from '../components/TrajectoryHome';

export default function TrajectoryHubPage({ user, onLogout }) {
  return (
    <div className="trajectory-hub-page app-shell-dark">
      <AppNavigation user={user} onLogout={onLogout} />
      <div className="trajectory-hub-body">
        <TrajectoryHome user={user} />
      </div>
    </div>
  );
}
