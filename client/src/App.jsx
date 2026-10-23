import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ThemeProvider } from './contexts/ThemeContext';
import { BackgroundTasksProvider } from './contexts/BackgroundTasksContext';
import BackgroundTasksBar from './components/BackgroundTasksBar';
import UpdateBanner from './components/UpdateBanner';
import UpdateDialog from './components/UpdateDialog';
import useAppUpdate from './hooks/useAppUpdate';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

// Route-level Code Splitting (Point 30)
const DataVolleyDashboard = lazy(() => import('./pages/DataVolleyDashboard'));
const DataVolleyMatchesPage = lazy(() => import('./pages/DataVolleyMatchesPage'));
const MultiMatchAnalysisPage = lazy(() => import('./pages/MultiMatchAnalysisPage'));
const CodeAutomationPage = lazy(() => import('./pages/CodeAutomationPage'));
const PracticeModePage = lazy(() => import('./pages/PracticeModePage'));
const DetachedVideoPage = lazy(() => import('./pages/DetachedVideoPage'));
const TrajectoryDashboard = lazy(() => import('./pages/TrajectoryDashboard'));
const TrajectoryView = lazy(() => import('./pages/TrajectoryView'));
const TrajectoryTeamReport = lazy(() => import('./pages/TrajectoryTeamReport'));
const TrajectoryHubPage = lazy(() => import('./pages/TrajectoryHubPage'));
const VideoCenterPage = lazy(() => import('./pages/VideoCenterPage'));
const LiveDashboard = lazy(() => import('./pages/LiveDashboard'));
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
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  // Mise à jour de l'interface (bandeau + « Quoi de neuf »).
  const update = useAppUpdate();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p className="loading-text">Démarrage du système</p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <BackgroundTasksProvider>
        <div className="app">
          <UpdateBanner update={update} />
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/login"
                element={
                  <AnimatedPage>
                    {user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/register"
                element={
                  <AnimatedPage>
                    {user ? <Navigate to="/dashboard" /> : <Register onLogin={handleLogin} />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <AnimatedPage>
                    {user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/datavolley"
                element={
                  <AnimatedPage>
                    {user ? <DataVolleyMatchesPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/datavolley/multi"
                element={
                  <AnimatedPage>
                    {user ? <MultiMatchAnalysisPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/datavolley/auto-codes"
                element={
                  <AnimatedPage>
                    {user ? <CodeAutomationPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/datavolley/:id"
                element={
                  <AnimatedPage>
                    {user ? <DataVolleyDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/practice"
                element={
                  <AnimatedPage>
                    {user ? <PracticeModePage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
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
                element={
                  <AnimatedPage>
                    {user ? <TrajectoryHubPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/trajectories/:id"
                element={
                  <AnimatedPage>
                    {user ? <TrajectoryDashboard user={user} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/trajectories/team/:teamId"
                element={
                  <AnimatedPage>
                    {user ? <TrajectoryTeamReport user={user} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/trajectories/:id/consult"
                element={
                  <AnimatedPage>
                    {user ? <TrajectoryView user={user} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/video-center"
                element={
                  <AnimatedPage>
                    {user ? <VideoCenterPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/live/:sessionId"
                element={
                  <AnimatedPage>
                    {user ? <LiveDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/teams"
                element={
                  <AnimatedPage>
                    {user ? <TeamsPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route
                path="/training"
                element={
                  <AnimatedPage>
                    {user ? <TrainingPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                  </AnimatedPage>
                }
              />
              <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
            </Routes>
          </AnimatePresence>
          <BackgroundTasksBar />
          <UpdateDialog update={update} />
        </div>
      </BackgroundTasksProvider>
    </ThemeProvider>
  );
}

export default App;
