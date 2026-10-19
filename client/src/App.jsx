import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
import DataVolleyDashboard from './pages/DataVolleyDashboard';
import TrajectoryDashboard from './pages/TrajectoryDashboard';
import TrajectoryView from './pages/TrajectoryView';
import TrajectoryTeamReport from './pages/TrajectoryTeamReport';
import LiveDashboard from './pages/LiveDashboard';
import TeamsPage from './pages/TeamsPage';
import TrainingPage from './pages/TrainingPage';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } },
};

function AnimatedPage({ children }) {
  return (
    <motion.div
      className="page-shell"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
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
                path="/datavolley/:id"
                element={
                  <AnimatedPage>
                    {user ? <DataVolleyDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
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