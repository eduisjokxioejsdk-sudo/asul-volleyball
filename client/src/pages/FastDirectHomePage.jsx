import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import { liveAPI, teamsAPI } from '../services/api';
import useCollectionChanged from '../hooks/useCollectionChanged';

/**
 * Accueil du mode « Stats en direct faciles » (Fast Direct) :
 * partage exactement la même UI, la même palette de boutons (Or Pancake #c8a165 /
 * Zinc #18181b) et la même répartition à l'écran en 2 colonnes que le mode
 * « Stats en direct avancées ».
 */
export default function FastDirectHomePage({ user, onLogout, embedded = false }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');

  const load = useCallback(async () => {
    try {
      const [teamsRes, liveRes] = await Promise.all([teamsAPI.getAll(), liveAPI.mine()]);
      setTeams(teamsRes.data?.teams || []);
      setSessions(
        (liveRes.data?.sessions || []).filter((session) => session.session_kind === 'fast_direct')
      );
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de charger les sessions Fast Direct.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useCollectionChanged('live', load);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status !== 'finished'),
    [sessions]
  );

  const createSession = async (event) => {
    event.preventDefault();
    const main = teams.find((team) => String(team.id) === String(team1));
    if (!main && !name.trim()) {
      setError('Choisissez une équipe ou saisissez le nom de la session.');
      return;
    }
    const opponent = teams.find((team) => String(team.id) === String(team2));
    const mainName = main?.name || name.trim() || 'Équipe';
    setCreating(true);
    setError('');
    try {
      const res = await liveAPI.create({
        mode: 'fast_direct',
        name: name.trim() || `Fast Direct · ${mainName}`,
        team1_name: mainName,
        team2_name: opponent?.name || 'Adversaire',
        home_team_id: main?.id || null,
        away_team_id: opponent?.id || null,
      });
      const sessionId = res.data?.id || res.data?.session?.id;
      if (!sessionId) throw new Error('Identifiant de session manquant.');
      navigate(`/fast-direct/${sessionId}`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div className="dv-flash err">{error}</div>}

      <div className="pk-direct-grid">
        {/* COLONNE GAUCHE : SESSIONS FAST DIRECT & CRÉATION */}
        <section className="pk-showcase-box">
          <div className="pk-showcase-box-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PancakeLogo size={20} />
              <h3>Sessions Fast Direct ({activeSessions.length})</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
                <RefreshCw size={13} /> Actualiser
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowCreate((value) => !value)}
              >
                <Plus size={14} />
                {showCreate ? 'Masquer la création' : 'Nouvelle session Fast Direct'}
              </button>
            </div>
          </div>

          <div className="pk-showcase-box-body">
            {showCreate && (
              <form
                onSubmit={createSession}
                style={{
                  padding: 16,
                  background: '#0d0d11',
                  border: '1px solid #3f3f46',
                  borderLeft: '3px solid #c8a165',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 12.5,
                    color: '#e8c98f',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Héberger une nouvelle session Fast Direct sur ce poste
                </div>

                <div className="pk-direct-form-grid">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Nom de la session</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex. ASUL — match du 17/11"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Équipe analysée (optionnelle)</label>
                    <select value={team1} onChange={(e) => setTeam1(e.target.value)}>
                      <option value="">— Sans fiche d’équipe —</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Adversaire (optionnel)</label>
                    <select value={team2} onChange={(e) => setTeam2(e.target.value)}>
                      <option value="">— Aucun adversaire précis —</option>
                      {teams
                        .filter((team) => String(team.id) !== String(team1))
                        .map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {!teams.length && (
                  <div style={{ fontSize: 12, color: '#e8c98f' }}>
                    Aucune fiche équipe : la session utilisera le nom saisi et les joueurs pourront
                    être renseignés directement dans la prise de distribution.
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowCreate(false)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={creating}>
                    {creating ? 'Création…' : 'Démarrer la session en direct →'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div
                style={{
                  padding: '28px 18px',
                  textAlign: 'center',
                  color: '#a1a1aa',
                  background: '#0d0d11',
                  border: '1px dashed #2e2e38',
                }}
              >
                Chargement des sessions Fast Direct…
              </div>
            ) : activeSessions.length === 0 ? (
              <div
                style={{
                  padding: '28px 18px',
                  textAlign: 'center',
                  color: '#a1a1aa',
                  background: '#0d0d11',
                  border: '1px dashed #2e2e38',
                }}
              >
                Aucune session Fast Direct active. Cliquez sur{' '}
                <strong style={{ color: '#e8c98f' }}>« + Nouvelle session Fast Direct »</strong> pour
                lancer un direct depuis ce poste.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => navigate(`/fast-direct/${session.id}`)}
                    className="pk-direct-session-card"
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#f4f4f5', fontSize: 14 }}>
                        {session.name}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#a1a1aa', marginTop: 2 }}>
                        {session.team1_name}{' '}
                        <span style={{ color: '#c8a165', fontWeight: 700 }}>vs</span>{' '}
                        {session.team2_name}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {session.join_code && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11.5,
                            fontWeight: 800,
                            padding: '3px 8px',
                            background: 'rgba(200, 161, 101, 0.14)',
                            color: '#e8c98f',
                            border: '1px solid rgba(200, 161, 101, 0.45)',
                          }}
                        >
                          CODE {session.join_code}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid #059669',
                        }}
                      >
                        ● EN DIRECT
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/fast-direct/${session.id}`);
                        }}
                      >
                        Ouvrir →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* COLONNE DROITE : REJOINDRE DEPUIS UN AUTRE APPAREIL */}
        <section className="pk-showcase-box">
          <div className="pk-showcase-box-head">
            <h3>Rejoindre depuis un autre appareil</h3>
          </div>
          <div className="pk-showcase-box-body">
            <div
              style={{
                padding: '10px 12px',
                background: '#0d0d11',
                border: '1px solid #2e2e38',
                borderLeft: '3px solid #c8a165',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#e8c98f',
              }}
            >
              Aucun code à saisir : le PC hôte envoie directement le lien correspondant au rôle.
            </div>

            <div className="pk-direct-step">
              <span className="pk-direct-step-num">1</span>
              <div>
                Sur le PC hôte, ouvrez la session puis cliquez sur <strong style={{ color: '#fff' }}>Code</strong> en haut à droite.
              </div>
            </div>
            <div className="pk-direct-step">
              <span className="pk-direct-step-num">2</span>
              <div>
                Copiez le lien de l’appareil souhaité : <strong style={{ color: '#fff' }}>Appareil Stats</strong> (tous onglets), <strong style={{ color: '#fff' }}>Banc (Tablette)</strong> ou <strong style={{ color: '#fff' }}>Caméra</strong>.
              </div>
            </div>
            <div className="pk-direct-step">
              <span className="pk-direct-step-num">3</span>
              <div>
                Ouvrez ce lien sur la tablette, le téléphone ou l’autre poste connecté au même réseau Wi‑Fi : il rejoint la session automatiquement.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="dv-matches-page">
      <AppNavigation user={user} onLogout={onLogout} />
      <main className="pk-mode-home">
        <header className="pk-mode-header">
          <div className="pk-mode-header-left">
            <PancakeLogo size={56} />
            <div>
              <h1 className="pk-mode-header-title">Direct · Stats en direct faciles</h1>
              <p className="pk-mode-header-sub">
                3 appareils reliés en direct : Stats (Distribution + Autres stats + Caméra), Banc
                tablette (P1–P6 &amp; Stats) et Caméra terrain.
              </p>
            </div>
          </div>
        </header>
        {content}
      </main>
    </div>
  );
}
