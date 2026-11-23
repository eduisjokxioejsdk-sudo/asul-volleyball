// ============================================================================
// PANCAKE STATS — barre de navigation globale toujours déployée en haut de
// l'écran, avec menu profil cliquable pour changer d'équipe.
//
// La barre est fixée en haut de la fenêtre ; un espaceur de même hauteur est
// rendu dans le flux de la page pour que le contenu ne soit jamais recouvert.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronDown, LogOut, Settings, Users } from './icons';
import PancakeLogo from './PancakeLogo';
import { useClub } from '../contexts/ClubContext';

// Sous-pages de Stats (ancien Data Volley) qui ont leur propre onglet ou
// destination (« Clavier ») : l'onglet « Stats » ne reste pas surligné dessus.
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [tabsOverflowLeft, setTabsOverflowLeft] = useState(false);
  const [tabsOverflowRight, setTabsOverflowRight] = useState(false);

  const profileRef = useRef(null);
  const tabsRef = useRef(null);

  // La rangée d'onglets peut devenir défilable sur les écrans étroits :
  // on centre l'onglet actif pour qu'il reste toujours visible.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const active = el.querySelector('.nav-app-btn.active');
    if (!active || typeof el.scrollTo !== 'function') return;
    const left = active.offsetLeft - el.offsetLeft;
    const target = left - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [pathname]);

  // Signale visuellement (dégradés) qu'il reste des onglets hors champ,
  // côté gauche et/ou droit, sans jamais masquer un onglet entièrement visible.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const scrollable = max > 2;
      const left = scrollable && el.scrollLeft > 2;
      const right = scrollable && max - el.scrollLeft > 2;
      setTabsOverflowLeft((prev) => (prev === left ? prev : left));
      setTabsOverflowRight((prev) => (prev === right ? prev : right));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => {
        el.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      };
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

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
    <>
      {/* Réserve la hauteur de la barre dans le flux : le contenu commence
          sous la barre, qui reste fixée en haut de la fenêtre. */}
      <div className={`nav-spacer ${compact ? 'is-compact' : ''}`} aria-hidden="true" />

      <div className="app-global-nav-shell">
        <header className={`app-global-nav ${compact ? 'is-compact' : ''}`}>
          <div className="nav-brand-section" onClick={() => navigate('/dashboard')} title="Accueil">
            <span className="brand-logo-glow"><PancakeLogo size={compact ? 22 : 30} /></span>
            <span className="brand-name">Pancake</span>
          </div>

          <nav
            className={`nav-apps-menu ${tabsOverflowLeft ? 'has-overflow-left' : ''} ${
              tabsOverflowRight ? 'has-overflow-right' : ''
            }`}
            aria-label="Navigation principale"
            ref={tabsRef}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`nav-app-btn ${isActive(tab) ? 'active' : ''}`}
                onClick={() => navigate(tab.path)}
                title={tab.hint}
                aria-current={isActive(tab) ? 'page' : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="nav-right-section">
            {tools}
            <button
              type="button"
              className={`nav-action-btn nav-action-keyboard ${
                pathname === '/datavolley/auto-codes' ? 'active' : ''
              }`}
              onClick={() => navigate('/datavolley/auto-codes')}
              title="Clavier — codes automatiques & macros clavier"
              aria-current={pathname === '/datavolley/auto-codes' ? 'page' : undefined}
            >
              <Settings size={14} />
              <span className="nav-action-label">Clavier</span>
            </button>
            <button
              type="button"
              className={`nav-action-btn nav-action-teams ${pathname === '/teams' ? 'active' : ''}`}
              onClick={() => navigate('/teams')}
              title="Équipes — effectifs & joueurs de l'équipe active"
              aria-current={pathname === '/teams' ? 'page' : undefined}
            >
              <Users size={14} />
              <span className="nav-action-label">Équipes</span>
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

                <button
                  type="button"
                  className="nav-logout-btn"
                  onClick={onLogout}
                  title="Se déconnecter"
                  aria-label="Se déconnecter"
                >
                  <LogOut size={13} />
                  <span className="nav-logout-label">Déconnexion</span>
                </button>
              </div>
            )}
          </div>
        </header>
      </div>
    </>
  );
}
