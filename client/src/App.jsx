import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ThemeProvider } from './contexts/ThemeContext';
import { BackgroundTasksProvider } from './contexts/BackgroundTasksContext';
import { ClubProvider } from './contexts/ClubContext';
import { authAPI } from './services/api';
import BackgroundTasksBar from './components/BackgroundTasksBar';
import UpdateBanner from './components/UpdateBanner';
import UpdateDialog from './components/UpdateDialog';
import useAppUpdate from './hooks/useAppUpdate';
import Login from './pages/Login';
import Register from './pages/Register';
import SelectClubPage from './pages/SelectClubPage';
import Dashboard from './pages/Dashboard';

// Route-level Code Splitting (Point 30)
const DataVolleyDashboard = lazy(() => import('./pages/DataVolleyDashboard'));
const DataVolleyMatchesPage = lazy(() => import('./pages/DataVolleyMatchesPage'));
const MultiMatchAnalysisPage = lazy(() => import('./pages/MultiMatchAnalysisPage'));
const DistributionModePage = lazy(() => import('./pages/DistributionModePage'));
const CodeAutomationPage = lazy(() => import('./pages/CodeAutomationPage'));
const PracticeModePage = lazy(() => import('./pages/PracticeModePage'));
const DetachedVideoPage = lazy(() => import('./pages/DetachedVideoPage'));
const TrajectoryDashboard = lazy(() => import('./pages/TrajectoryDashboard'));
const TrajectoryView = lazy(() => import('./pages/TrajectoryView'));
const TrajectoryTeamReport = lazy(() => import('./pages/TrajectoryTeamReport'));
const TrajectoryHubPage = lazy(() => import('./pages/TrajectoryHubPage'));
const VideoCenterPage = lazy(() => import('./pages/VideoCenterPage'));
const VideoMultiMatchPage = lazy(() => import('./pages/VideoMultiMatchPage'));
const SharedClipPage = lazy(() => import('./pages/SharedClipPage'));
const LiveDashboard = lazy(() => import('./pages/LiveDashboard'));
const DirectHubPage = lazy(() => import('./pages/DirectHubPage'));
const StatsFastDirectPage = lazy(() => import('./pages/StatsFastDirectPage'));
const FastDirectPage = lazy(() => import('./pages/FastDirectPage'));
const FastDirectJoinPage = lazy(() => import('./pages/FastDirectJoinPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TrainingPage = lazy(() => import('./pages/TrainingPage'));

const pageVariants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 1, y: 0, transition: { duration: 0 } },
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: '#18181b', color: '#f4f4f5', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <h2 style={{ color: '#f87171', margin: 0, fontSize: 16 }}>Une erreur est survenue lors de l'affichage</h2>
          <pre style={{ background: '#09090b', padding: 12, border: '1px solid #27272a', borderRadius: 4, maxWidth: '80%', overflow: 'auto', fontSize: 12, color: '#fbbf24' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AnimatedPage({ children }) {
  return (
    <motion.div
      className="page-shell"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="app-loading">
              <div className="spinner"></div>
              <p className="loading-text">Chargement…</p>
            </div>
          }
        >
          {children}
        </Suspense>
      </ErrorBoundary>
    </motion.div>
  );
}


function App() {
  const [user, setUser] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  // Mise à jour de l'interface (bandeau + « Quoi de neuf »).
  const update = useAppUpdate();

  useEffect(() => {
    let alive = true;
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    const loadClubsPublic = authAPI.getClubs()
      .then((res) => {
        if (alive) setClubs(res.data?.clubs || []);
      })
      .catch(() => {});

    if (storedUser && storedToken) {
      let parsedUser = null;
      try {
        parsedUser = JSON.parse(storedUser);
      } catch {
        parsedUser = null;
      }

      authAPI.me()
        .then((res) => {
          if (!alive) return;
          const freshUser = res.data?.user;
          if (freshUser) {
            localStorage.setItem('user', JSON.stringify(freshUser));
            setUser(freshUser);
          } else if (parsedUser) {
            setUser(parsedUser);
          }
          if (Array.isArray(res.data?.clubs)) {
            setClubs(res.data.clubs);
          }
        })
        .catch(() => {
          if (!alive) return;
          // L'intercepteur API redirige en cas de 401/403 ; en cas d'erreur réseau
          // transitoire, on conserve l'utilisateur local s'il existe.
          if (parsedUser && localStorage.getItem('token')) {
            setUser(parsedUser);
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    } else {
      loadClubsPublic.finally(() => {
        if (alive) setLoading(false);
      });
    }

    return () => {
      alive = false;
    };
  }, []);

  const handleLogin = useCallback((userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    if (token) localStorage.setItem('token', token);
    setUser(userData);
    authAPI.getClubs()
      .then((res) => setClubs(res.data?.clubs || []))
      .catch(() => {});
  }, []);

  const handleUserUpdated = useCallback((userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    if (token) localStorage.setItem('token', token);
    setUser(userData);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p className="loading-text">Démarrage du système</p>
      </div>
    );
  }

  const requestedNext = new URLSearchParams(location.search).get('next');
  const loginNext =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/dashboard';

  const requireClub = (element) => {
    if (!user) return <Navigate to="/login" />;
    if (!user.club_id) return <SelectClubPage user={user} onLogout={handleLogout} />;
    return element;
  };

  return (
    <ThemeProvider>
      <BackgroundTasksProvider>
        <ClubProvider
          user={user}
          clubs={clubs}
          onClubsLoaded={setClubs}
          onUserUpdated={handleUserUpdated}
        >
          <div className="app">
            <UpdateBanner update={update} />
            <AnimatePresence mode="wait">
              <Routes location={location} key={`${location.pathname}::${user?.club_id || 'none'}`}>
                <Route
                  path="/login"
                  element={
                    <AnimatedPage>
                      {user ? (user.club_id ? <Navigate to={loginNext} /> : <SelectClubPage user={user} onLogout={handleLogout} />) : <Login onLogin={handleLogin} />}
                    </AnimatedPage>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <AnimatedPage>
                      {user ? (user.club_id ? <Navigate to={loginNext} /> : <SelectClubPage user={user} onLogout={handleLogout} />) : <Register onLogin={handleLogin} />}
                    </AnimatedPage>
                  }
                />
                <Route
                  path="/dashboard"
                  element={<AnimatedPage>{requireClub(<Dashboard user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/datavolley"
                  element={<AnimatedPage>{requireClub(<DataVolleyMatchesPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/datavolley/multi"
                  element={<AnimatedPage>{requireClub(<MultiMatchAnalysisPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/distribution"
                  element={<AnimatedPage>{requireClub(<DistributionModePage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/datavolley/distribution"
                  element={<AnimatedPage>{requireClub(<DistributionModePage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/datavolley/auto-codes"
                  element={<AnimatedPage>{requireClub(<CodeAutomationPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/datavolley/:id"
                  element={<AnimatedPage>{requireClub(<DataVolleyDashboard user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/practice"
                  element={<AnimatedPage>{requireClub(<PracticeModePage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/video-popout"
                  element={
                    <AnimatedPage>
                      <DetachedVideoPage />
                    </AnimatedPage>
                  }
                />
                <Route
                  path="/trajectories"
                  element={<AnimatedPage>{requireClub(<TrajectoryHubPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/trajectories/:id"
                  element={<AnimatedPage>{requireClub(<TrajectoryDashboard user={user} />)}</AnimatedPage>}
                />
                <Route
                  path="/trajectories/team/:teamId"
                  element={<AnimatedPage>{requireClub(<TrajectoryTeamReport user={user} />)}</AnimatedPage>}
                />
                <Route
                  path="/trajectories/:id/consult"
                  element={<AnimatedPage>{requireClub(<TrajectoryView user={user} />)}</AnimatedPage>}
                />
                <Route
                  path="/video-center/multi"
                  element={<AnimatedPage>{requireClub(<VideoMultiMatchPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/video-center"
                  element={<AnimatedPage>{requireClub(<VideoCenterPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/shared-clip/:token"
                  element={
                    <AnimatedPage>
                      <SharedClipPage />
                    </AnimatedPage>
                  }
                />
                <Route
                  path="/fast-direct/join/:joinCode"
                  element={
                    <AnimatedPage>
                      {user && !user.club_id ? (
                        <SelectClubPage user={user} onLogout={handleLogout} />
                      ) : (
                        <FastDirectJoinPage user={user} />
                      )}
                    </AnimatedPage>
                  }
                />
                <Route
                  path="/direct"
                  element={<AnimatedPage>{requireClub(<DirectHubPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/fast-direct"
                  element={<AnimatedPage>{requireClub(<Navigate to="/direct" replace />)}</AnimatedPage>}
                />
                <Route
                  path="/stats-fast-direct"
                  element={<AnimatedPage>{requireClub(<StatsFastDirectPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/fast-direct/:sessionId"
                  element={<AnimatedPage>{requireClub(<FastDirectPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/live/:sessionId"
                  element={<AnimatedPage>{requireClub(<LiveDashboard user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/teams"
                  element={<AnimatedPage>{requireClub(<TeamsPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route
                  path="/training"
                  element={<AnimatedPage>{requireClub(<TrainingPage user={user} onLogout={handleLogout} />)}</AnimatedPage>}
                />
                <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
              </Routes>
            </AnimatePresence>
            <BackgroundTasksBar />
            <UpdateDialog update={update} />
          </div>
        </ClubProvider>
      </BackgroundTasksProvider>
    </ThemeProvider>
  );
}

export default App;
