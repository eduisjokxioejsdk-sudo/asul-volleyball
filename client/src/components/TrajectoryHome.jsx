// ============================================================================
// Accueil de l'onglet « Trajectoires » : liste des fiches de trajectoire
// partagées et création d'un match.
//   • les équipes sont celles de l'application (onglet Équipes) ;
//   • on choisit 1 ou 2 équipes, ou on en crée une sans quitter la modale.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsAPI, trajectoryAPI, videosAPI } from '../services/api';
import useTeamsSync from '../hooks/useTeamsSync';
import useCollectionChanged from '../hooks/useCollectionChanged';
import SyncStatusBar from './SyncStatusBar';
import { PLAYER_ROLES } from '../utils/lineup';
import { Check, Plus, Trash, X } from '../components/icons';
import PancakeLogo from './PancakeLogo';

const emptyPlayer = () => ({ number: '', name: '', role: 'universal' });

export default function TrajectoryHome({ user }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);

  const [videos, setVideos] = useState([]);
  const loadVideos = useCallback(async () => {
    try {
      const res = await videosAPI.getAll();
      setVideos(res.data?.videos || []);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const handleLinkVideo = async (matchId, videoId) => {
    try {
      await trajectoryAPI.linkVideo(matchId, videoId);
      loadMatches();
    } catch (err) {
      console.error('Erreur liaison vidéo:', err);
    }
  };

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', homeId: '', awayId: '', videoId: '' });
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState({ open: false, name: '', players: [] });
  const [msg, setMsg] = useState(null);
  const [reportTeamId, setReportTeamId] = useState('');

  const loadMatches = useCallback(async () => {
    try {
      const res = await trajectoryAPI.getAll();
      setMatches(res.data.matches || []);
    } catch (err) {
      console.error('Failed to load trajectory matches:', err);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const res = await teamsAPI.getAll();
      setTeams(res.data.teams || []);
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
    loadTeams();
  }, [loadMatches, loadTeams]);

  useTeamsSync(loadTeams);
  useCollectionChanged('trajectories', loadMatches);

  useEffect(() => {
    if (reportTeamId || teams.length === 0) return;
    setReportTeamId(String(teams[0].id));
  }, [teams, reportTeamId]);

  useEffect(() => {
    if (nameTouched) return;
    const home = teams.find((t) => String(t.id) === String(form.homeId));
    const away = teams.find((t) => String(t.id) === String(form.awayId));
    const pair = [home?.name, away?.name].filter(Boolean).join(' vs ');
    setForm((prev) => (prev.name === pair ? prev : { ...prev, name: pair }));
  }, [form.homeId, form.awayId, teams, nameTouched]);

  const openCreate = () => {
    setForm({ name: '', homeId: teams[0] ? String(teams[0].id) : '', awayId: '', videoId: '' });
    setNameTouched(false);
    setNewTeam({ open: false, name: '', players: [] });
    setMsg(null);
    setShowCreate(true);
    loadTeams();
  };

  const createMatch = async (event) => {
    event.preventDefault();
    if (!form.homeId && !form.awayId) {
      setMsg({ ok: false, text: 'Choisissez au moins une équipe (ou créez-la).' });
      return;
    }
    setCreating(true);
    try {
      const res = await trajectoryAPI.create(
        form.name.trim(),
        form.homeId ? Number(form.homeId) : null,
        form.awayId ? Number(form.awayId) : null,
        form.videoId ? Number(form.videoId) : null
      );
      setShowCreate(false);
      navigate(`/trajectories/${res.data.match.id}`);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Création du match impossible.' });
    } finally {
      setCreating(false);
    }
  };

  const addPlayerRow = () => setNewTeam((prev) => ({ ...prev, players: [...prev.players, emptyPlayer()] }));
  const removePlayerRow = (index) =>
    setNewTeam((prev) => ({ ...prev, players: prev.players.filter((_, i) => i !== index) }));
  const updatePlayerRow = (index, field, value) =>
    setNewTeam((prev) => ({
      ...prev,
      players: prev.players.map((p, i) =>
        i === index ? { ...p, [field]: field === 'number' ? value.replace(/\D/g, '') : value } : p
      ),
    }));

  const createTeam = async () => {
    if (!newTeam.name.trim()) {
      setMsg({ ok: false, text: 'Le nom de la nouvelle équipe est requis.' });
      return;
    }
    try {
      const players = newTeam.players
        .filter((p) => (p.number || '').trim() !== '' || (p.name || '').trim() !== '')
        .map((p) => ({
          number: Number(p.number) || 0,
          name: (p.name || '').trim() || `N°${p.number}`,
          role: p.role || 'universal',
        }));
      const res = await teamsAPI.create(newTeam.name.trim(), players);
      const created = res.data.team;
      setTeams(res.data.teams || []);
      setNewTeam({ open: false, name: '', players: [] });
      if (created) {
        setForm((prev) => (prev.homeId ? { ...prev, awayId: String(created.id) } : { ...prev, homeId: String(created.id) }));
      }
      setMsg({ ok: true, text: 'Équipe créée et partagée.' });
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Création de l’équipe impossible.' });
    }
  };

  const removeMatch = async (match) => {
    if (!window.confirm(`Supprimer définitivement la fiche « ${match.name} » ?`)) return;
    try {
      await trajectoryAPI.delete(match.id);
      await loadMatches();
    } catch (err) {
      alert(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const hasTeams = useMemo(() => teams.length > 0, [teams]);
  const teamName = (id) => teams.find((t) => String(t.id) === String(id))?.name || '';

  return (
    <main className="pk-mode-home">
      {/* En-tête du mode Trajectoires */}
      <header className="pk-mode-header" style={{ borderLeftColor: '#0ea5e9' }}>
        <div className="pk-mode-header-left">
          <PancakeLogo size={60} />
          <div>
            <h1 className="pk-mode-header-title">Trajectoires & Radar d’Impact</h1>
            <p className="pk-mode-header-sub">
              Annotez les directions de service et d’attaque par joueur, liez vos fiches à une vidéo DataVolley et générez des bilans d’équipe.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <SyncStatusBar api={trajectoryAPI} label="Trajectoires" />
          <button className="btn btn-secondary" onClick={() => navigate('/teams')}>
            Gérer les Équipes
          </button>
          <button className="btn btn-primary btn-lg" onClick={openCreate}>
            <Plus size={15} /> Nouvelle fiche de trajectoire
          </button>
        </div>
      </header>

      {/* Barre de Rapport Global par Équipe */}
      {hasTeams && (
        <div className="pk-filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#e8c98f' }}>
              Rapport global par équipe :
            </span>
            <select
              value={reportTeamId}
              onChange={(event) => setReportTeamId(event.target.value)}
              style={{ minWidth: 220, fontWeight: 600 }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!reportTeamId}
              onClick={() => navigate(`/trajectories/team/${reportTeamId}`)}
            >
              Ouvrir le rapport cumulé →
            </button>
            <span style={{ fontSize: 12.5, color: '#a1a1aa' }}>
              Réunit toutes les fiches de cette équipe, joueur par joueur.
            </span>
          </div>

          <span className="pk-mono" style={{ fontSize: 12, color: '#a1a1aa' }}>
            {matches.length} fiche(s) enregistrée(s)
          </span>
        </div>
      )}

      {!hasTeams && !loadingTeams && (
        <div style={{ padding: 20, background: '#141418', border: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#d4d4d8' }}>Aucune équipe enregistrée pour l’instant.</span>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/teams')}>
            Créer une équipe
          </button>
        </div>
      )}

      {/* Liste des fiches de trajectoires en cartes carrées spacieuses */}
      {matches.length > 0 ? (
        <div className="pk-cards-list">
          {matches.map((match) => (
            <div
              key={match.id}
              className="pk-match-item"
              onClick={() => navigate(`/trajectories/${match.id}/consult`)}
            >
              <div>
                <div className="pk-match-item-head">
                  <div className="pk-match-item-title">{match.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span
                      className="pk-mono"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        background: 'rgba(14, 165, 233, 0.14)',
                        color: '#38bdf8',
                        border: '1px solid #0284c7',
                      }}
                    >
                      {match.shot_count || 0} flèche(s)
                    </span>
                    {Number(match.error_count) > 0 && (
                      <span
                        className="pk-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          background: 'rgba(225, 29, 72, 0.14)',
                          color: '#fb7185',
                          border: '1px solid #9f1239',
                        }}
                      >
                        {match.error_count} faute(s)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div className="pk-match-versus">
                    <span>{match.team1_name || '—'}</span>
                    {match.team2_name && (
                      <>
                        <em>VS</em>
                        <span>{match.team2_name}</span>
                      </>
                    )}
                  </div>
                  <span className="pk-mono" style={{ fontSize: 11.5, color: '#71717a' }}>
                    {formatDate(match.created_at)}
                  </span>
                </div>

                {/* Liaison Vidéo DataVolley */}
                <div
                  style={{ marginTop: 14, padding: '10px 12px', background: '#0d0d11', border: '1px solid #27272a' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {match.video_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/datavolley/${match.video_id}`)}
                        title="Ouvrir la vidéo correspondante dans le mode Data Volley"
                      >
                        Voir la vidéo dans DataVolley →
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleLinkVideo(match.id, null)}
                        title="Dissocier la vidéo"
                      >
                        <X size={12} /> Dissocier
                      </button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleLinkVideo(match.id, e.target.value);
                      }}
                      style={{ width: '100%', fontSize: 12 }}
                      title="Lier cette fiche de trajectoires à une vidéo de match Data Volley"
                    >
                      <option value="">+ Lier cette fiche à une vidéo DataVolley…</option>
                      {videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.display_name || v.original_name} ({v.team1_name || 'Domicile'} vs {v.team2_name || 'Extérieur'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="pk-match-item-foot" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate(`/trajectories/${match.id}`)}
                  >
                    Annoter
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/trajectories/${match.id}/consult`)}
                  >
                    Consulter →
                  </button>
                </div>

                {Number(match.user_id) === Number(user?.id) && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    title="Supprimer cette fiche"
                    onClick={() => removeMatch(match)}
                  >
                    <Trash size={13} /> Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px dashed #3f3f46' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', marginBottom: 8 }}>
            Aucune fiche de trajectoire enregistrée.
          </p>
          <p style={{ marginBottom: 16 }}>
            Créez une fiche en choisissant 1 ou 2 équipes et liez-la éventuellement à une vidéo de match DataVolley.
          </p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Nouvelle fiche de trajectoire
          </button>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal tj-create-modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 540, padding: 22 }}>
            <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <PancakeLogo size={22} /> Nouvelle fiche de trajectoire
            </h2>
            <form onSubmit={createMatch}>
              <div className="form-group">
                <label>Nom de la fiche</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => {
                    setNameTouched(true);
                    setForm((prev) => ({ ...prev, name: event.target.value }));
                  }}
                  placeholder="Ex: Domicile vs Extérieur"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Équipe 1 *</label>
                  <select value={form.homeId} onChange={(event) => setForm((prev) => ({ ...prev, homeId: event.target.value }))}>
                    <option value="">— Choisir une équipe —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Équipe 2 (optionnel)</label>
                  <select value={form.awayId} onChange={(event) => setForm((prev) => ({ ...prev, awayId: event.target.value }))}>
                    <option value="">Aucune — une seule équipe</option>
                    {teams.filter((t) => String(t.id) !== String(form.homeId)).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 8 }}>
                <label>Vidéo du match dans DataVolley (optionnel)</label>
                <select
                  value={form.videoId || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, videoId: event.target.value }))}
                >
                  <option value="">Aucune — laisser non liée</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.display_name || v.original_name} ({v.team1_name || 'Domicile'} vs {v.team2_name || 'Extérieur'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setNewTeam({ open: !newTeam.open, name: '', players: [] })}
                >
                  <Plus size={12} /> {newTeam.open ? 'Fermer la création d’équipe' : 'Créer une nouvelle équipe'}
                </button>
                <span style={{ fontSize: 12, color: '#a1a1aa' }}>
                  {teamName(form.homeId) || 'Équipe 1 à choisir'}
                  {teamName(form.awayId) ? ` vs ${teamName(form.awayId)}` : ''}
                </span>
              </div>

              {newTeam.open && (
                <div style={{ padding: 14, background: '#0d0d11', border: '1px solid #3f3f46', marginBottom: 14 }}>
                  <div className="form-group">
                    <label>Nom de la nouvelle équipe</label>
                    <input
                      type="text"
                      value={newTeam.name}
                      onChange={(event) => setNewTeam((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Nom de l'équipe"
                    />
                  </div>
                  <div className="form-group">
                    <label>Joueurs (n° + nom + rôle)</label>
                    {newTeam.players.map((p, index) => (
                      <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="N°"
                          value={p.number}
                          onChange={(event) => updatePlayerRow(index, 'number', event.target.value)}
                          style={{ width: 64 }}
                        />
                        <input
                          type="text"
                          placeholder="Nom"
                          value={p.name}
                          onChange={(event) => updatePlayerRow(index, 'name', event.target.value)}
                          style={{ flex: 1 }}
                        />
                        <select
                          value={p.role}
                          onChange={(event) => updatePlayerRow(index, 'role', event.target.value)}
                          style={{ width: 140 }}
                        >
                          {PLAYER_ROLES.map((role) => (
                            <option key={role.id} value={role.id}>{role.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title="Retirer ce joueur"
                          onClick={() => removePlayerRow(index)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addPlayerRow}>
                      <Plus size={12} /> Ajouter un joueur
                    </button>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={createTeam}>
                    <Check size={12} /> Enregistrer l’équipe
                  </button>
                </div>
              )}

              {msg && <div className={`live-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowCreate(false)}>
                  Annuler
                </button>
                <button className="btn btn-primary" type="submit" disabled={creating}>
                  {creating ? 'Création…' : 'Créer la fiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
