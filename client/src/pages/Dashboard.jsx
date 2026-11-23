// ============================================================================
// PANCAKE STATS — HUB PRINCIPAL (Vitrine & Lanceur des Modules)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { videosAPI, liveAPI, teamsAPI, trajectoryAPI } from '../services/api';
import useTeamsSync from '../hooks/useTeamsSync';
import useCollectionChanged from '../hooks/useCollectionChanged';
import AppNavigation from '../components/AppNavigation';
import AnimatedPancake from '../components/AnimatedPancake';
import PancakeLogo from '../components/PancakeLogo';

const MODES = [
  {
    num: '01',
    key: 'datavolley',
    title: 'Stats',
    desc: 'Importez vos vidéos de match, codez en Play-by-Play, générez vos feuilles de statistiques et accédez aux stats d’entraînements.',
    cta: 'Ouvrir Stats',
    accent: '#c8a165',
    path: '/datavolley',
  },
  {
    num: '02',
    key: 'stats-fast-direct',
    title: 'Stats facile',
    desc: 'Saisie rapide en plein écran, fiches équipe et joueurs, grille originale et exports Excel / PDF / CSV instantanés.',
    cta: 'Ouvrir Stats facile',
    accent: '#fbbf24',
    path: '/stats-fast-direct',
  },
  {
    num: '03',
    key: 'multi',
    title: 'Multi-Matchs',
    desc: 'Analysez plusieurs matchs d’un coup : synthèse cumulée, comparaison d’équipes et plan de jeu adverse.',
    cta: 'Ouvrir Multi-Matchs',
    accent: '#14b8a6',
    path: '/datavolley/multi',
  },
  {
    num: '04',
    key: 'distribution',
    title: 'Distribution Passeur',
    desc: 'Sélectionnez plusieurs matchs codés et générez le rapport complet de distribution des passeurs par équipe.',
    cta: 'Ouvrir Distribution',
    accent: '#22c55e',
    path: '/distribution',
  },
  {
    num: '05',
    key: 'trajectories',
    title: 'Trajectoires & Radar',
    desc: 'Tracez les impacts de service et d’attaque, liez vos fiches aux vidéos et compilez des bilans par équipe.',
    cta: 'Ouvrir Trajectoires',
    accent: '#0ea5e9',
    path: '/trajectories',
  },
  {
    num: '06',
    key: 'video',
    title: 'Centre Vidéo',
    desc: 'Consultez toutes les vidéos de match filtrées par équipe, par joueur, par type d’action et par évaluation.',
    cta: 'Ouvrir Centre Vidéo',
    accent: '#10b981',
    path: '/video-center',
  },
  {
    num: '07',
    key: 'direct',
    title: 'Direct',
    desc: 'Stats en direct faciles (Fast Direct, tablettes & caméra) et stats en direct avancées (Play-by-Play collaboratif).',
    cta: 'Ouvrir Direct',
    accent: '#e11d48',
    path: '/direct',
  },
  {
    num: '08',
    key: 'training',
    title: 'Académie',
    desc: 'Maîtrisez la syntaxe DataVolley et les fonctionnalités de l’app grâce aux leçons, tutoriels et simulations.',
    cta: 'S’entraîner',
    accent: '#f59e0b',
    path: '/training',
  },
];

const ECOSYSTEM_FEATURES = [
  {
    tag: 'INTERCONNEXION',
    title: 'Équipes & Effectifs Cloisonnés',
    text: 'Chaque équipe/club dispose de son espace étanche (matchs, vidéos, effectifs, directs) avec changement en un clic depuis votre profil.',
  },
  {
    tag: 'PONT VIDÉO ↔ TRAJ',
    title: 'Fiches Liées aux Matchs Stats',
    text: 'Associez une fiche de trajectoires à une vidéo de match pour basculer en un clic du radar d’impact vers le séquençage vidéo Play-by-Play.',
  },
  {
    tag: 'MOTEUR DV4',
    title: 'Métriques Officielles Haute Précision',
    text: 'Calcul instantané du Side-out (SO), Break Point (BP), Eff%, Pos%, rotations P1–P6, Setter Calls et matrices de directions Zone → Zone.',
  },
];

export default function Dashboard({ user, onLogout }) {
  const navigate = useNavigate();

  const [counts, setCounts] = useState({ videos: 0, sheets: 0, teams: 0 });
  const [activeLiveCount, setActiveLiveCount] = useState(0);

  const loadCounts = useCallback(async () => {
    const [v, s] = await Promise.allSettled([videosAPI.getAll(), trajectoryAPI.getAll()]);
    setCounts((c) => ({
      ...c,
      videos: v.status === 'fulfilled' ? (v.value.data?.videos || []).length : c.videos,
      sheets: s.status === 'fulfilled' ? (s.value.data?.matches || []).length : c.sheets,
    }));
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const r = await teamsAPI.getAll();
      const list = r.data?.teams || [];
      setCounts((c) => ({ ...c, teams: list.length }));
    } catch {
      /* ignore */
    }
  }, []);

  const loadLiveCount = useCallback(async () => {
    try {
      const a = await liveAPI.mine();
      const active = (a.data?.sessions || []).filter((s) => s.status === 'active').length;
      setActiveLiveCount(active);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadCounts();
    loadTeams();
    loadLiveCount();
  }, [loadCounts, loadTeams, loadLiveCount]);

  useTeamsSync(loadTeams);
  useCollectionChanged('videos', loadCounts);
  useCollectionChanged('trajectories', loadCounts);
  useCollectionChanged('live', loadLiveCount);

  return (
    <div className="dashboard">
      <AppNavigation user={user} onLogout={onLogout} />

      <div className="pk-showcase-wrap">
        {/* ================================================================
            1. HERO VITRINE AVEC PANCAKE ANIMÉ
           ================================================================ */}
        <section className="pk-hero-banner pk-hero-banner--compact">
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <PancakeLogo size={54} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.05em', color: '#ffffff', lineHeight: 1.1 }}>
                  Pancake <span style={{ color: '#c8a165' }}>Stats</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e8c98f', letterSpacing: '0.08em', marginTop: 2 }}>
                  SUITE SCOUTING & VIDÉO VOLLEYBALL
                </div>
              </div>
            </div>

            <div className="pk-hero-metrics">
              <div className="pk-hero-metric">
                <div className="v">{counts.videos}</div>
                <div className="l">Matchs Vidéo</div>
              </div>
              <div className="pk-hero-metric">
                <div className="v">{counts.sheets}</div>
                <div className="l">Fiches Trajectoires</div>
              </div>
              <div className="pk-hero-metric">
                <div className="v">{counts.teams}</div>
                <div className="l">Équipes Actives</div>
              </div>
              <div className="pk-hero-metric">
                <div className="v" style={{ color: activeLiveCount > 0 ? '#10b981' : '#f4f4f5' }}>
                  {activeLiveCount}
                </div>
                <div className="l">Directs en cours</div>
              </div>
            </div>
          </div>

          <AnimatedPancake size={160} showTelemetry={true} />
        </section>

        {/* ================================================================
            2. MODULES DE TRAVAIL
           ================================================================ */}
        <section>
          <div className="pk-modes-section-head">
            <h2>Sélectionner un module de travail</h2>
          </div>

          <div className="pk-modes-grid">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className="pk-mode-card"
                style={{ '--mode-accent': m.accent }}
                onClick={() => navigate(m.path)}
              >
                <div>
                  <div className="pk-mode-card-top">
                    <span className="pk-mode-num">MODULE {m.num}</span>
                  </div>
                  <div className="pk-mode-title">{m.title}</div>
                  <div className="pk-mode-desc">{m.desc}</div>
                </div>
                <div className="pk-mode-cta">
                  <span>{m.cta}</span>
                  <span>→</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ================================================================
            3. ARCHITECTURE & OUTILS PANCAKE STATS
           ================================================================ */}
        <section className="pk-showcase-box">
          <div className="pk-showcase-box-head">
            <h3>Architecture & Outils Pancake Stats</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/teams')}>
              Gérer les Équipes ({counts.teams})
            </button>
          </div>
          <div className="pk-showcase-box-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {ECOSYSTEM_FEATURES.map((f) => (
                <div
                  key={f.title}
                  style={{
                    padding: '12px 14px',
                    background: '#0d0d11',
                    border: '1px solid #27272a',
                    borderLeft: '3px solid #c8a165',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#c8a165', letterSpacing: '0.08em' }}>
                    {f.tag}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#f4f4f5', margin: '2px 0 4px' }}>{f.title}</div>
                  <div style={{ fontSize: 12.5, color: '#a1a1aa', lineHeight: 1.45 }}>{f.text}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 14px', background: '#0d0d11', border: '1px solid #27272a' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a1a1aa', marginBottom: 8 }}>
                Code Couleur Sémantique DataVolley
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11.5, textAlign: 'center' }}>
                <div style={{ padding: '6px 4px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #059669', color: '#10b981', fontWeight: 700 }}>
                  # Point
                </div>
                <div style={{ padding: '6px 4px', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid #0284c7', color: '#0ea5e9', fontWeight: 700 }}>
                  + Positif
                </div>
                <div style={{ padding: '6px 4px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #d97706', color: '#f59e0b', fontWeight: 700 }}>
                  ! Neutre
                </div>
                <div style={{ padding: '6px 4px', background: 'rgba(249, 115, 22, 0.12)', border: '1px solid #ea580c', color: '#f97316', fontWeight: 700 }}>
                  - Négatif
                </div>
                <div style={{ padding: '6px 4px', background: 'rgba(225, 29, 72, 0.12)', border: '1px solid #e11d48', color: '#fb7185', fontWeight: 700 }}>
                  = Faute
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
