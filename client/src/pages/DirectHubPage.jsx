// ============================================================================
// PANCAKE STATS — ONGLET DIRECT UNIFIÉ
// Regroupe :
//   1. Stats en direct faciles (ancien Fast Direct)
//   2. Stats en direct avancées (ancien Direct Play-by-Play)
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Radio, Zap } from 'lucide-react';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import FastDirectHomePage from './FastDirectHomePage';
import { liveAPI, teamsAPI } from '../services/api';
import useTeamsSync from '../hooks/useTeamsSync';
import useCollectionChanged from '../hooks/useCollectionChanged';

export default function DirectHubPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'advanced' ? 'advanced' : 'easy';

  const setTab = (next) => {
    setSearchParams(next === 'advanced' ? { tab: 'advanced' } : { tab: 'easy' }, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppNavigation user={user} onLogout={onLogout} />

      <div className="border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <PancakeLogo size={36} />
            <div>
              <h1 className="text-base font-black tracking-tight text-white">Direct</h1>
              <p className="text-[11px] text-zinc-400">
                Choisissez entre les stats en direct faciles ou le codage avancé en direct
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1" role="tablist" aria-label="Modes en direct">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'easy'}
              onClick={() => setTab('easy')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                activeTab === 'easy'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Stats en direct faciles
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'advanced'}
              onClick={() => setTab('advanced')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                activeTab === 'advanced'
                  ? 'bg-[#c8a165] text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              Stats en direct avancées
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'easy' ? (
        <FastDirectHomePage user={user} onLogout={onLogout} embedded={true} />
      ) : (
        <AdvancedDirectPanel user={user} navigate={navigate} />
      )}
    </div>
  );
}

function AdvancedDirectPanel({ user, navigate }) {
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

  const loadTeams = useCallback(async () => {
    try {
      const r = await teamsAPI.getAll();
      setTeams(r.data?.teams || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([liveAPI.mine(), liveAPI.getTrash()]);
      const filterAdv = (list) => (list || []).filter((s) => s.session_kind !== 'fast_direct');
      setLiveSessions(filterAdv(a.data?.sessions));
      setTrashed(filterAdv(t.data?.sessions));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadTeams();
    loadLive();
  }, [loadTeams, loadLive]);

  useTeamsSync(loadTeams);
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
      const r = await liveAPI.create({
        name: liveName.trim() || `${t1.name} vs ${t2.name}`,
        team1_name: t1.name,
        team2_name: t2.name,
        home_team_id: t1.id,
        away_team_id: t2.id,
      });
      const sessionId = r.data?.id || r.data?.session?.id;
      if (!sessionId) throw new Error('session id manquant');
      setShowCreate(false);
      setLiveName('');
      setHomeId('');
      setAwayId('');
      navigate(`/live/${sessionId}`);
    }, 'Création du direct impossible');

  const joinLive = () =>
    act(async () => {
      const code = joinCode.trim();
      if (!code) return;
      const r = await liveAPI.join({ join_code: code });
      const sessionId = r.data?.sessionId || r.data?.session?.id;
      if (!sessionId) throw new Error('session id manquant');
      const target = r.data?.session_kind === 'fast_direct' ? '/fast-direct/' : '/live/';
      navigate(`${target}${sessionId}`);
    }, 'Code de session introuvable');

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      {err && <div className="dv-flash err" style={{ marginBottom: 14 }}>{err}</div>}

      <section className="pk-showcase-box">
        <div className="pk-showcase-box-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PancakeLogo size={20} />
            <h3>Stats en direct avancées · Sessions DataVolley collaboratives</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Code session (ex. A1B2)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinLive()}
              style={{ width: 165, fontFamily: 'var(--font-mono)' }}
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
              Aucune session avancée en direct active. Cliquez sur <strong>« + Nouveau match en direct »</strong> ou entrez un code de session.
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
    </main>
  );
}
