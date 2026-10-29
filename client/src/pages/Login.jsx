import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import PancakeLogo from '../components/PancakeLogo';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const performLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Veuillez renseigner votre adresse email');
      return;
    }
    if (!password) {
      setError('Veuillez renseigner votre mot de passe');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(cleanEmail, password);
      onLogin(response.data.user, response.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!loading) {
      performLogin();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    const onGlobalKeyDown = (e) => {
      if (e.key === 'Enter' && !loading) {
        handleSubmit(e);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [email, password, loading]);

  return (
    <div className="auth-page asul-modern">
      <div className="auth-container">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <PancakeLogo size={72} />
          </div>
          <h1 style={{ fontWeight: 800, letterSpacing: '-0.05em', fontSize: 22, margin: 0 }}>
            Pancake Stats
          </h1>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
            Play-by-Play · Scouting · DataVolley 4
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="votre@email.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'} <kbd>Entrée</kbd>
          </button>
        </form>

        <div className="auth-link">
          Pas encore de compte ? <Link to="/register">S'inscrire</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
