// ============================================================================
// PANCAKE STATS — barre de navigation globale auto-cachée au survol en haut
// de l'écran, avec menu profil cliquable pour changer d'équipe.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronDown, LogOut } from './icons';
import PancakeLogo from './PancakeLogo';
import { useClub } from '../contexts/ClubContext';

// Sous-pages de Stats (ancien Data Volley) qui ont leur propre onglet ou
// destination (« Codes Auto ») : l'onglet « Stats » ne reste pas surligné dessus.
const DATAVOLLEY_SUBROUTES = new Set(['multi', 'auto-codes', 'distribution']);

const TABS = [
  {
    key: 'dashboard',
    path: '/dashboard',
    label: 'Hub',
    hint: 'Accueil — modules de travail',
    isActive: (p) => p === '/dashboard' || p === '/',
  },
  {
    key: 'datavolley',
    path: '/datavolley',
    label: 'Stats',
    hint: 'Stats : matchs vidéo, codage Play-by-Play et entraînements',
    isActive: (p) => {
      if (p === '/datavolley' || p === '/practice' || p.startsWith('/practice/')) return true;
      if (!p.startsWith('/datavolley/')) return false;
      const sub = p.slice('/datavolley/'.length).split('/')[0];
      return !DATAVOLLEY_SUBROUTES.has(sub);
    },
  },
  {
    key: 'stats-fast-direct',
    path: '/stats-fast-direct',
    label: 'Stats facile',
    hint: 'Stats facile — saisie rapide, stats équipe & joueurs et exports',
    isActive: (p) => p === '/stats-fast-direct' || p.startsWith('/stats-fast-direct/'),
  },
  {
    key: 'multi',
    path: '/datavolley/multi',
    label: 'Multi-Matchs',
    hint: 'Analyse cumulative & Plan de jeu adverse',
    isActive: (p) => p === '/datavolley/multi' || p.startsWith('/datavolley/multi/'),
  },
  {
    key: 'distribution',
    path: '/distribution',
    label: 'Distribution',
    hint: 'Rapport de distribution des passeurs (Multi-Matchs & Excel)',
    isActive: (p) =>
      p === '/distribution' ||
      p.startsWith('/distribution/') ||
      p === '/datavolley/distribution' ||
      p.startsWith('/datavolley/distribution/'),
  },
  {
    key: 'trajectories',
    path: '/trajectories',
    label: 'Trajectoires',
    hint: 'Fiches de trajectoires service / attaque',
    isActive: (p) => p === '/trajectories' || p.startsWith('/trajectories/'),
  },
  {
    key: 'direct',
    path: '/direct',
    label: 'Direct',
    hint: 'Stats en direct faciles & Stats en direct avancées',
    isActive: (p) =>
      p === '/direct' ||
      p.startsWith('/direct/') ||
      p === '/fast-direct' ||
      p.startsWith('/fast-direct/') ||
      p.startsWith('/live/'),
  },
  {
    key: 'video-center',
    path: '/video-center',
    label: 'Centre vidéo',
    hint: 'Consultation filtrée des vidéos de match',
    isActive: (p) => p === '/video-center' || p.startsWith('/video-center/'),
  },
  {
    key: 'training',
    path: '/training',
    label: 'Académie',
    hint: 'Académie, tutoriels et leçons de codage DataVolley',
    isActive: (p) => p === '/training' || p.startsWith('/training/'),
  },
];

/**
 * @param {Object} props
 * @param {Object} [props.user]
 * @param {Function} [props.onLogout]
 * @param {boolean} [props.compact]
 * @param {React.ReactNode} [props.tools]
 */
export default function AppNavigation({ user, onLogout, compact = false, tools = null }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { clubs, activeClub, switchingClub, selectClub } = useClub();

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchError, setSwitchError] = useState('');

  const hideTimerRef = useRef(null);
  const shellRef = useRef(null);
  const profileRef = useRef(null);

  const isRevealed = hovered || focused || menuOpen;

  const cancelHide = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const revealNav = () => {
    cancelHide();
    setHovered(true);
  };

  const scheduleHideNav = () => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      setHovered(false);
    }, 180);
  };

  useEffect(() => () => cancelHide(), []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onMouseDown = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleSelectClub = async (clubId) => {
    if (switchingClub) return;
    if (clubId === activeClub?.id) {
      setMenuOpen(false);
      return;
    }
    setSwitchError('');
    try {
      await selectClub(clubId);
      setMenuOpen(false);
    } catch (err) {
      setSwitchError(err?.response?.data?.error || 'Impossible de changer d’équipe.');
    }
  };

  const isActive = (tab) => (tab.isActive ? tab.isActive(pathname) : pathname === tab.path);

  return (
    <div
      ref={shellRef}
      className={`app-global-nav-shell ${isRevealed ? 'is-revealed' : ''}`}
      onMouseEnter={revealNav}
      onMouseLeave={scheduleHideNav}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (shellRef.current && !shellRef.current.contains(e.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <div className="nav-hover-trigger" aria-hidden="true">
        <span className="nav-hover-hint" />
      </div>

      <header className={`app-global-nav ${compact ? 'is-compact' : ''}`}>
        <div className="nav-brand-section" onClick={() => navigate('/dashboard')} title="Accueil">
          <span className="brand-logo-glow"><PancakeLogo size={compact ? 24 : 40} /></span>
          <span className="brand-name">Pancake</span>
        </div>

        <nav className="nav-apps-menu">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`nav-app-btn ${isActive(tab) ? 'active' : ''}`}
              onClick={() => navigate(tab.path)}
              title={tab.hint}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="nav-right-section">
          {tools}
          <button
            type="button"
            className="btn btn-sm nav-teams-btn"
            onClick={() => navigate('/datavolley/auto-codes')}
            title="Codes automatiques & macros clavier"
          >
            Codes Auto
          </button>
          <button
            type="button"
            className="btn btn-sm nav-teams-btn"
            onClick={() => navigate('/teams')}
            title="Effectifs & joueurs de l'équipe active"
          >
            Équipes
          </button>
          {user && (
            <div className="nav-user-group" ref={profileRef}>
              <button
                type="button"
                className={`nav-user-pill nav-user-trigger ${menuOpen ? 'is-open' : ''}`}
                onClick={() => {
                  setSwitchError('');
                  setMenuOpen((prev) => !prev);
                }}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title={
                  activeClub
                    ? `${user.name} · Équipe : ${activeClub.name} (cliquer pour changer d’équipe)`
                    : `${user.name} (cliquer pour choisir une équipe)`
                }
              >
                <span className="user-initial">{user.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                <span className="user-fullname">{user.name}</span>
                {activeClub && (
                  <span
                    className="nav-club-badge"
                    style={{ '--club-accent': activeClub.color || '#c8a165' }}
                  >
                    <span className="nav-club-dot" />
                    <span className="nav-club-label">
                      {activeClub.shortName || activeClub.name}
                    </span>
                  </span>
                )}
                <ChevronDown size={13} className="nav-user-chevron" />
              </button>

              {menuOpen && (
                <div className="nav-profile-menu" role="menu" aria-label="Profil et changement d'équipe">
                  <div className="nav-profile-head">
                    <div className="nav-profile-name">{user.name}</div>
                    <div className="nav-profile-email">{user.email}</div>
                  </div>

                  {switchError && (
                    <div className="nav-profile-error">{switchError}</div>
                  )}

                  <div className="nav-profile-section-title">Changer d’équipe</div>
                  <div className="nav-profile-clubs">
                    {(clubs || []).map((club) => {
                      const current = club.id === activeClub?.id;
                      const accent = club.color || '#c8a165';
                      return (
                        <button
                          key={club.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={current}
                          className={`nav-profile-club-item ${current ? 'is-active' : ''}`}
                          onClick={() => handleSelectClub(club.id)}
                          disabled={switchingClub}
                        >
                          <span className="nav-profile-club-dot" style={{ background: accent }} />
                          <span className="nav-profile-club-text">
                            <span className="nav-profile-club-name">{club.name}</span>
                            {club.description && (
                              <span className="nav-profile-club-desc">{club.description}</span>
                            )}
                          </span>
                          {current && <Check size={14} className="nav-profile-club-check" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="button" className="nav-logout-btn" onClick={onLogout} title="Se déconnecter">
                <LogOut size={12} /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
}
