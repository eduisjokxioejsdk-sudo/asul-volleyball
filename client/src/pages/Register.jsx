import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import PancakeLogo from '../components/PancakeLogo';

function Register({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const performRegister = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError('Veuillez renseigner votre nom');
      return;
    }

    if (!cleanEmail) {
      setError('Veuillez renseigner votre email');
      return;
    }

    if (!password) {
      setError('Veuillez renseigner votre mot de passe');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await authAPI.register(cleanEmail, password, cleanName);
      onLogin(response.data.user, response.data.token);
    } catch (err) {
      setError(err.response?.data?.error || "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!loading) {
      performRegister();
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
  }, [name, email, password, confirmPassword, loading]);

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
            Créer un compte opérateur
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
          <div className="form-group">
            <label>Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Votre nom"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="votre@email.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Au moins 6 caractères"
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label>Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Répéter le mot de passe"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Inscription...' : "S'inscrire"} <kbd>Entrée</kbd>
          </button>
        </form>

        <div className="auth-link">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
