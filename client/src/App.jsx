import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import VideoDashboard from './pages/VideoDashboard';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } },
};

function AnimatedPage({ children }) {
  return (
    <motion.div
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
      <div className="app">
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
              path="/video/:id"
              element={
                <AnimatedPage>
                  {user ? <VideoDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
                </AnimatedPage>
              }
            />
            <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
          </Routes>
        </AnimatePresence>
      </div>
    </ThemeProvider>
  );
}

export default App;