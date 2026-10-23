// ============================================================================
// PANCAKE STATS — HUB PRINCIPAL (Vitrine & Lanceur des 5 Modes)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
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
    title: 'Data Volley',
    desc: 'Importez vos vidéos de match, codez en Play-by-Play et générez vos feuilles de statistiques complètes.',
    cta: 'Ouvrir Data Volley',
    kbd: 'Ctrl+Alt+2',
    accent: '#c8a165',
    path: '/datavolley',
  },
  {
    num: '02',
    key: 'multi',
    title: 'Multi-Matchs',
    desc: 'Analysez plusieurs matchs d’un coup : synthèse cumulée, comparaison d’équipes et plan de jeu adverse.',
    cta: 'Ouvrir Multi-Matchs',
    kbd: 'Ctrl+Alt+3',
    accent: '#14b8a6',
    path: '/datavolley/multi',
  },
  {
    num: '03',
    key: 'trajectories',
    title: 'Trajectoires & Radar',
    desc: 'Tracez les impacts de service et d’attaque, liez vos fiches aux vidéos et compilez des bilans par équipe.',
    cta: 'Ouvrir Trajectoires',
    kbd: 'Ctrl+Alt+5',
    accent: '#0ea5e9',
    path: '/trajectories',
  },
  {
    num: '04',
    key: 'video',
    title: 'Centre Vidéo',
    desc: 'Consultez toutes les vidéos de match filtrées par équipe, par joueur, par type d’action et par évaluation.',
    cta: 'Ouvrir Centre Vidéo',
    kbd: 'Ctrl+Alt+6',
    accent: '#10b981',
    path: '/video-center',
  },
  {
    num: '05',
    key: 'live',
    title: 'Mode En Direct',
    desc: 'Scouting collaboratif en temps réel au bord du terrain avec synchronisation multi-postes et retour caméra.',
    cta: 'Lancer un Direct',
    kbd: 'Live',
    accent: '#e11d48',
    path: null,
  },
  {
    num: '06',
    key: 'practice',
    title: 'Entraînement',
    desc: 'Scouting de séances et ateliers d’entraînement pour travailler la lecture du jeu en équipe.',
    cta: 'Ouvrir Entraînement',
    kbd: 'Ctrl+Alt+4',
    accent: '#8b5cf6',
    path: '/practice',
  },
  {
    num: '07',
    key: 'training',
    title: 'Académie',
    desc: 'Maîtrisez la syntaxe DataVolley grâce aux 11 leçons progressives, QCM, jeux de paires et traductions.',
    cta: 'S’entraîner',
    kbd: 'Ctrl+Alt+7',
    accent: '#f59e0b',
    path: '/training',
  },
];

const ECOSYSTEM_FEATURES = [
  {
    tag: 'INTERCONNEXION',
    title: 'Équipes & Effectifs Unifiés',
    text: 'Chaque équipe créée (lors d’un upload vidéo, d’un direct ou d’une fiche de trajectoires) est partagée dans toute l’application avec ses numéros et rôles.',
  },
  {
    tag: 'PONT VIDÉO ↔ TRAJ',
    title: 'Fiches Liées aux Matchs DataVolley',
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
  const liveSectionRef = useRef(null);

  const [counts, setCounts] = useState({ videos: 0, sheets: 0, teams: 0 });
  const [liveSessions, setLiveSessions] = useState([]);
  const [trashed, setTrashed] = useState([]);
  const [showTrash, setShowTrash] = useState(false);

  const [teams, setTeams] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [liveName, setLiveName] = useState('');
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [newTeamSide, setNewTeamSide] = useState('home');
  const [newTeamName, setNewTeamName] = useState('');
  const [err, setErr] = useState('');

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
      setTeams(list);
      setCounts((c) => ({ ...c, teams: list.length }));
    } catch {
      /* ignore */
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([liveAPI.mine(), liveAPI.getTrash()]);
      setLiveSessions(a.data?.sessions || []);
      setTrashed(t.data?.sessions || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadCounts();
    loadTeams();
    loadLive();
  }, [loadCounts, loadTeams, loadLive]);

  useTeamsSync(loadTeams);
  useCollectionChanged('videos', loadCounts);
  useCollectionChanged('trajectories', loadCounts);
  useCollectionChanged('live', loadLive);

  const act = async (fn, fallback) => {
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e?.response?.data?.error || fallback);
    }
  };

  const createInlineTeam = () =>
    act(async () => {
      if (!newTeamName.trim()) return;
      const r = await teamsAPI.create(newTeamName.trim(), []);
      const created = r.data?.team;
      await loadTeams();
      if (created) {
        if (newTeamSide === 'home') setHomeId(String(created.id));
        else setAwayId(String(created.id));
      }
      setNewTeamName('');
      setNewTeamOpen(false);
    }, 'Création d’équipe impossible');

  const createLive = () =>
    act(async () => {
      const t1 = teams.find((t) => String(t.id) === String(homeId));
      const t2 = teams.find((t) => String(t.id) === String(awayId));
      if (!t1 || !t2) {
        setErr('Sélectionnez les 2 équipes du match.');
        return;
      }
      if (t1.id === t2.id) {
        setErr('Les deux équipes doivent être différentes.');
        return;
      }
      const r = await liveAPI.create(
        liveName.trim() || `${t1.name} vs ${t2.name}`,
        t1.name,
        t2.name,
        t1.id,
        t2.id
      );
      setShowCreate(false);
      setLiveName('');
      setHomeId('');
      setAwayId('');
      navigate(`/live/${r.data.session.id}`);
    }, 'Création du direct impossible');

  const joinLive = () =>
    act(async () => {
      if (!joinCode.trim()) return;
      const r = await liveAPI.join(joinCode.trim());
      navigate(`/live/${r.data.session.id}`);
    }, 'Code de session introuvable');

  const handleModeClick = (m) => {
    if (m.path) {
      navigate(m.path);
    } else {
      setShowCreate(true);
      liveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="dashboard">
      <AppNavigation user={user} onLogout={onLogout} />
      {err && <div className="dv-flash err" style={{ margin: '12px 28px 0' }}>{err}</div>}

      <div className="pk-showcase-wrap">
        {/* ================================================================
            1. HERO VITRINE AVEC PANCAKE ANIMÉ
           ================================================================ */}
        <section className="pk-hero-banner">
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
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
            <h1 className="pk-hero-title">
              Le futur de la <span>statistique au volley</span>.
            </h1>
            <p className="pk-hero-lead">
              Une station d’analyse haute précision inspirée de DataVolley 4. Codez vos matchs en Play-by-Play,
              cartographiez toutes les trajectoires d’impact et filtrez chaque séquence vidéo par équipe, joueur et
              qualité d’évaluation.
            </p>

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
                <div className="v" style={{ color: liveSessions.some((s) => s.status === 'active') ? '#10b981' : '#f4f4f5' }}>
                  {liveSessions.filter((s) => s.status === 'active').length}
                </div>
                <div className="l">Directs en cours</div>
              </div>
            </div>
          </div>

          <AnimatedPancake size={160} showTelemetry={true} />
        </section>

        {/* ================================================================
            2. LES 5 GRANDS BOUTONS DE MODES
           ================================================================ */}
        <section>
          <div className="pk-modes-section-head">
            <h2>Sélectionner un module de travail</h2>
            <span style={{ fontSize: 12, color: '#a1a1aa' }}>
              Navigation rapide au clavier : <kbd>Alt+1</kbd> à <kbd>Alt+5</kbd>
            </span>
          </div>

          <div className="pk-modes-grid">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className="pk-mode-card"
                style={{ '--mode-accent': m.accent }}
                onClick={() => handleModeClick(m)}
              >
                <div>
                  <div className="pk-mode-card-top">
                    <span className="pk-mode-num">MODULE {m.num}</span>
                    <kbd>{m.kbd}</kbd>
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
            3. GRILLE BASSE : ARENA EN DIRECT + PRÉSENTATION DES OUTILS
           ================================================================ */}
        <div className="pk-hub-lower-grid" ref={liveSectionRef}>
          {/* Colonne Gauche : Matchs en Direct */}
          <section className="pk-showcase-box">
            <div className="pk-showcase-box-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PancakeLogo size={20} />
                <h3>Mode En Direct · Sessions Collaboratives</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Code session (ex. A1B2)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && joinLive()}
                  style={{ width: 150, fontFamily: 'var(--font-mono)' }}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={joinLive}>
                  Rejoindre
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreate((v) => !v)}
                >
                  {showCreate ? 'Fermer' : '+ Nouveau match en direct'}
                </button>
              </div>
            </div>

            <div className="pk-showcase-box-body">
              {showCreate && (
                <div style={{ padding: 16, background: '#0d0d11', border: '1px solid #3f3f46', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#e8c98f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Configurer un nouveau match en direct (2 équipes obligatoires)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Nom du match (optionnel)</label>
                      <input
                        type="text"
                        placeholder="Auto : Domicile vs Extérieur"
                        value={liveName}
                        onChange={(e) => setLiveName(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Équipe Domicile (*)</label>
                      <select
                        value={homeId}
                        onChange={(e) => {
                          if (e.target.value === '__new') {
                            setNewTeamSide('home');
                            setNewTeamOpen(true);
                          } else {
                            setHomeId(e.target.value);
                          }
                        }}
                      >
                        <option value="">— Choisir Équipe 1 —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                        <option value="__new">+ Créer une nouvelle équipe…</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Équipe Extérieur (a)</label>
                      <select
                        value={awayId}
                        onChange={(e) => {
                          if (e.target.value === '__new') {
                            setNewTeamSide('away');
                            setNewTeamOpen(true);
                          } else {
                            setAwayId(e.target.value);
                          }
                        }}
                      >
                        <option value="">— Choisir Équipe 2 —</option>
                        {teams.filter((t) => String(t.id) !== String(homeId)).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                        <option value="__new">+ Créer une nouvelle équipe…</option>
                      </select>
                    </div>
                  </div>

                  {newTeamOpen && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, background: '#141418', border: '1px solid #2e2e38' }}>
                      <input
                        type="text"
                        placeholder={`Nom de l'équipe (${newTeamSide === 'home' ? 'Domicile' : 'Extérieur'})`}
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createInlineTeam()}
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={createInlineTeam}>
                        Créer l’équipe
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewTeamOpen(false)}>
                        Annuler
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={createLive}
                      disabled={!homeId || !awayId}
                    >
                      Démarrer la session Live →
                    </button>
                  </div>
                </div>
              )}

              {liveSessions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {liveSessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/live/${s.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: '#0d0d11',
                        border: '1px solid #27272a',
                        borderLeft: `3px solid ${s.status === 'active' ? '#10b981' : '#52525b'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#f4f4f5', fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>
                          {s.team1_name} <span style={{ color: '#c8a165' }}>vs</span> {s.team2_name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            background: s.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : '#1c1c22',
                            color: s.status === 'active' ? '#10b981' : '#a1a1aa',
                            border: `1px solid ${s.status === 'active' ? '#059669' : '#3f3f46'}`,
                          }}
                        >
                          {s.status === 'active' ? '● EN DIRECT' : 'TERMINÉ'}
                        </span>
                        {s.owner_user_id === user?.id && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Mettre « ${s.name} » à la corbeille ?`)) {
                                act(() => liveAPI.trash(s.id).then(loadLive), 'Erreur corbeille');
                              }
                            }}
                          >
                            Corbeille
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#a1a1aa', background: '#0d0d11', border: '1px dashed #2e2e38' }}>
                  Aucune session en direct active. Cliquez sur <strong>« + Nouveau match en direct »</strong> ou entrez un code de session.
                </div>
              )}

              {trashed.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#71717a' }}>
                      Corbeille ({trashed.length})
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowTrash((v) => !v)}>
                      {showTrash ? 'Masquer' : 'Afficher'}
                    </button>
                  </div>
                  {showTrash && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {trashed.map((s) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#0d0d11', border: '1px solid #27272a' }}>
                          <span style={{ fontSize: 12.5 }}>{s.name} ({s.team1_name} vs {s.team2_name})</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(() => liveAPI.restore(s.id).then(loadLive), 'Erreur restauration')}>
                              Restaurer
                            </button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => window.confirm(`Supprimer définitivement « ${s.name} » ?`) && act(() => liveAPI.deletePermanently(s.id).then(loadLive), 'Erreur suppression')}>
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Colonne Droite : Présentation des Outils & Référentiel */}
          <section className="pk-showcase-box">
            <div className="pk-showcase-box-head">
              <h3>Architecture & Outils Pancake Stats</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/teams')}>
                Gérer les Équipes ({counts.teams})
              </button>
            </div>
            <div className="pk-showcase-box-body">
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
    </div>
  );
}
