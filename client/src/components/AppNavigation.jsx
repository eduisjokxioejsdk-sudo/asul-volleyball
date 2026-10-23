// ============================================================================
// PANCAKE STATS — barre de navigation globale (36 px).
// Onglets texte (sans icônes), raccourcis clavier Ctrl+Alt+1…7 affichés en badges.
// ============================================================================

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from './icons';
import PancakeLogo from './PancakeLogo';

// Sous-pages de Data Volley qui ont leur propre onglet ou leur propre
// destination (bouton « Codes Auto ») : l'onglet « Data Volley » ne doit
// pas rester surligné sur ces routes.
const DATAVOLLEY_SUBROUTES = new Set(['multi', 'auto-codes']);

const TABS = [
  {
    key: 'dashboard',
    path: '/dashboard',
    label: 'Hub',
    hint: 'Accueil — modules et matchs en direct',
    isActive: (p) => p === '/dashboard' || p === '/',
  },
  {
    key: 'datavolley',
    path: '/datavolley',
    label: 'Data Volley',
    hint: 'Scouting : vidéos de match et saisie des codes',
    // Actif sur /datavolley et /datavolley/:id (un match), mais pas sur les
    // sous-pages dédiées (/datavolley/multi, /datavolley/auto-codes).
    isActive: (p) => {
      if (p === '/datavolley') return true;
      if (!p.startsWith('/datavolley/')) return false;
      const sub = p.slice('/datavolley/'.length).split('/')[0];
      return !DATAVOLLEY_SUBROUTES.has(sub);
    },
  },
  {
    key: 'multi',
    path: '/datavolley/multi',
    label: 'Multi-Matchs',
    hint: 'Analyse cumulative & Plan de jeu adverse',
    isActive: (p) => p === '/datavolley/multi' || p.startsWith('/datavolley/multi/'),
  },
  {
    key: 'practice',
    path: '/practice',
    label: 'Entraînement',
    hint: 'Scouting de séances & ateliers d’entraînement',
    isActive: (p) => p === '/practice' || p.startsWith('/practice/'),
  },
  {
    key: 'trajectories',
    path: '/trajectories',
    label: 'Trajectoires',
    hint: 'Fiches de trajectoires service / attaque',
    isActive: (p) => p === '/trajectories' || p.startsWith('/trajectories/'),
  },
  {
    key: 'video-center',
    path: '/video-center',
    label: 'Vidéo',
    hint: 'Consultation filtrée des vidéos de match',
    isActive: (p) => p === '/video-center' || p.startsWith('/video-center/'),
  },
  {
    key: 'training',
    path: '/training',
    label: 'Académie',
    hint: 'Académie et leçons de codage DataVolley',
    isActive: (p) => p === '/training' || p.startsWith('/training/'),
  },
];

/**
 * @param {Object} props
 * @param {Object} [props.user]
 * @param {Function} [props.onLogout]
 * @param {boolean} [props.compact] - barre réduite (mode codage) : 38 px au lieu
 *   de 56 px, badges de raccourcis masqués, pour laisser plus de place aux
 *   fenêtres de saisie des stats.
 * @param {React.ReactNode} [props.tools] - actions supplémentaires placées à
 *   droite de la barre (ex. « Sans évaluation » sur la page de codage).
 */
export default function AppNavigation({ user, onLogout, compact = false, tools = null }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Onglet actif exact : « Data Volley » ne doit plus rester surligné sur
  // /datavolley/multi (ni sur /datavolley/auto-codes) : chaque onglet
  // expose son propre prédicat d'activité.
  const isActive = (tab) => (tab.isActive ? tab.isActive(pathname) : pathname === tab.path);

  // Ctrl+Alt+1…7 : navigation entre modules.
  // On n'utilise volontairement PAS Alt seul : les macros de codage
  // utilisent Alt+1…0 (compoundCodes.js) et quitteraient le match en plein
  // codage si la barre globale capturait Alt.
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || !e.ctrlKey || e.metaKey) return;
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && TABS[index]) {
        e.preventDefault();
        navigate(TABS[index].path);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <header className={`app-global-nav ${compact ? 'is-compact' : ''}`}>
      <div className="nav-brand-section" onClick={() => navigate('/dashboard')} title="Accueil">
        <span className="brand-logo-glow"><PancakeLogo size={compact ? 24 : 40} /></span>
        <span className="brand-name">Pancake <b>Stats</b></span>
      </div>

      <nav className="nav-apps-menu">
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            type="button"
            className={`nav-app-btn ${isActive(tab) ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
            title={`${tab.hint} (Ctrl+Alt+${i + 1})`}
          >
            {tab.label}
            <kbd>Ctrl+Alt+{i + 1}</kbd>
          </button>
        ))}
      </nav>

      <div className="nav-right-section">
        {tools}
        <button type="button" className="btn btn-sm nav-teams-btn" onClick={() => navigate('/datavolley/auto-codes')} title="Codes automatiques & macros clavier">
          Codes Auto
        </button>
        <button type="button" className="btn btn-sm nav-teams-btn" onClick={() => navigate('/teams')} title="Équipes et effectifs">
          Équipes
        </button>
        {user && (
          <div className="nav-user-group">
            <div className="nav-user-pill">
              <span className="user-initial">{user.name?.charAt(0)?.toUpperCase() || 'U'}</span>
              <span className="user-fullname">{user.name}</span>
            </div>
            <button type="button" className="nav-logout-btn" onClick={onLogout} title="Se déconnecter">
              <LogOut size={12} /> Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
