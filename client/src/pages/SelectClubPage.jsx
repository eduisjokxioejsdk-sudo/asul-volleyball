import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, Check, LogOut, Shield } from '../components/icons';
import PancakeLogo from '../components/PancakeLogo';
import { useClub } from '../contexts/ClubContext';

export default function SelectClubPage({ user, onLogout }) {
  const location = useLocation();
  const { clubs, switchingClub, selectClub, refreshClubs } = useClub();
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clubs || clubs.length === 0) {
      refreshClubs();
    }
  }, [clubs, refreshClubs]);

  const requestedNext = new URLSearchParams(location.search).get('next');
  const nextPath =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : null;

  const handleChoose = async (clubId) => {
    if (switchingClub) return;
    setError('');
    setSelectedId(clubId);
    try {
      await selectClub(clubId, {
        redirectTo: location.pathname === '/login' || location.pathname === '/register' ? (nextPath || '/dashboard') : nextPath,
      });
    } catch (err) {
      setError(err?.response?.data?.error || "Impossible de rejoindre cette équipe pour le moment.");
      setSelectedId('');
    }
  };

  return (
    <div className="auth-page asul-modern">
      <div className="auth-container select-club-container">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <PancakeLogo size={64} />
          </div>
          <div style={{ fontSize: 11, color: '#c8a165', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Bienvenue, {user?.name || user?.email}
          </div>
          <h1 style={{ fontWeight: 800, letterSpacing: '-0.04em', fontSize: 24, margin: '6px 0 6px' }}>
            Choisissez votre équipe
          </h1>
          <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}>
            Chaque équipe dispose de son propre écosystème cloisonné (matchs, effectifs, vidéos et directs).
            Vous pourrez changer d’équipe à tout moment depuis votre profil en haut à droite.
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="select-club-list">
          {(clubs || []).map((club) => {
            const busy = switchingClub && selectedId === club.id;
            const accent = club.color || '#c8a165';
            return (
              <button
                key={club.id}
                type="button"
                className={`select-club-card ${busy ? 'is-busy' : ''}`}
                onClick={() => handleChoose(club.id)}
                disabled={switchingClub}
              >
                <span className="select-club-badge" style={{ background: accent }}>
                  {club.shortName || club.name?.slice(0, 4)?.toUpperCase() || 'EQ'}
                </span>
                <span className="select-club-info">
                  <span className="select-club-name">{club.name}</span>
                  {club.description && <span className="select-club-desc">{club.description}</span>}
                </span>
                <span className="select-club-action">
                  {busy ? <Check size={16} /> : <ArrowRight size={16} />}
                </span>
              </button>
            );
          })}

          {(!clubs || clubs.length === 0) && (
            <div style={{ textAlign: 'center', padding: '18px 12px', color: '#a1a1aa', fontSize: 13 }}>
              <Shield size={18} style={{ marginBottom: 6 }} />
              <div>Aucune équipe configurée dans <code>server/src/clubs.js</code>.</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onLogout}
            disabled={switchingClub}
          >
            <LogOut size={13} /> Se déconnecter ({user?.email})
          </button>
        </div>
      </div>
    </div>
  );
}
