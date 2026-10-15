// ============================================================================
// Accueil de l'onglet « Trajectoires » : liste des fiches de trajectoire
// partagées et création d'un match.
//   • les équipes sont celles de l'application (onglet Équipes) ;
//   • on choisit 1 ou 2 équipes, ou on en crée une sans quitter la modale.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { teamsAPI, trajectoryAPI } from '../services/api';
import useTeamsSync from '../hooks/useTeamsSync';
import useCollectionChanged from '../hooks/useCollectionChanged';
import SyncStatusBar from './SyncStatusBar';
import { PLAYER_ROLES } from '../utils/lineup';
import { ChartColumn, Check, Eye, House, Pencil, Plane, Plus, Route, Trash, Users, X } from '../components/icons';

const emptyPlayer = () => ({ number: '', name: '', role: 'universal' });

/** Aperçu décoratif d'une fiche : mini terrain, filet et trois flèches types. */
function HomeThumb() {
  return (
    <svg viewBox="0 0 120 66" className="tj-thumb-svg" aria-hidden="true" focusable="false">
      <rect className="tj-thumb-court" x="4" y="4" width="112" height="58" rx="5" />
      <rect className="tj-thumb-net" x="57.5" y="4" width="5" height="58" rx="2" />
      <path className="tj-thumb-arrow flight" d="M 14 54 L 50 40" />
      <path className="tj-thumb-arrow arc" d="M 30 48 Q 62 10 98 30" />
      <path className="tj-thumb-arrow contree" d="M 42 18 L 88 14" />
    </svg>
  );
}

export default function TrajectoryHome({ user }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', homeId: '', awayId: '' });
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState({ open: false, name: '', players: [] });
  const [msg, setMsg] = useState(null);
  // Équipe choisie pour le rapport global (toutes ses fiches réunies).
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

  useEffect(() => { loadMatches(); loadTeams(); }, [loadMatches, loadTeams]);

  // Les équipes peuvent être modifiées sur un autre appareil du réseau local ou
  // sur un autre poste (synchronisation cloud) : la liste se recharge seule.
  useTeamsSync(loadTeams);

  // Une fiche créée/modifiée/supprimée sur un autre poste recharge la liste.
  useCollectionChanged('trajectories', loadMatches);

  // Le sélecteur du rapport global propose la première équipe par défaut.
  useEffect(() => {
    if (reportTeamId || teams.length === 0) return;
    setReportTeamId(String(teams[0].id));
  }, [teams, reportTeamId]);

  // Nom proposé à partir des équipes choisies, tant que l'utilisateur n'y touche pas.
  useEffect(() => {
    if (nameTouched) return;
    const home = teams.find((t) => String(t.id) === String(form.homeId));
    const away = teams.find((t) => String(t.id) === String(form.awayId));
    const pair = [home?.name, away?.name].filter(Boolean).join(' vs ');
    setForm((prev) => (prev.name === pair ? prev : { ...prev, name: pair }));
  }, [form.homeId, form.awayId, teams, nameTouched]);

  const openCreate = () => {
    setForm({ name: '', homeId: teams[0] ? String(teams[0].id) : '', awayId: '' });
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
        form.awayId ? Number(form.awayId) : null
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
      setMsg({ ok: true, text: 'Équipe créée : elle est partagée avec le reste de l’application.' });
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
    value ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const hasTeams = useMemo(() => teams.length > 0, [teams]);
  const teamName = (id) => teams.find((t) => String(t.id) === String(id))?.name || '';

  return (
    <div className="live-section tj-home">
      <div className="live-section-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Route size={18} /> Fiches de trajectoire
        </h3>
        <div className="live-section-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/teams')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Users size={14} /> Équipes
          </button>
          <button
            className="btn btn-primary"
            onClick={openCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Créer un match
          </button>
        </div>
      </div>

      <p className="dv-hint">
        Marquage des trajectoires de service et d’attaque, joueur par joueur, pour une équipe ou pour les deux. Les équipes
        sont celles enregistrées dans l’application : elles restent partagées avec les onglets Découpage et Codage DataVolley.
      </p>

      <SyncStatusBar api={trajectoryAPI} label="Fiches de trajectoire" />

      {/* Rapport global : réunit tous les matchs d'une équipe (équipe 1 ou 2). */}
      {hasTeams && (
        <div className="tj-report-bar">
          <span className="tj-report-bar-label"><ChartColumn size={15} /> Rapport global par équipe</span>
          <select
            className="tj-report-select"
            value={reportTeamId}
            onChange={(event) => setReportTeamId(event.target.value)}
            title="Équipe dont on veut réunir tous les matchs"
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
            title="Réunir tous les matchs de cette équipe : services et attaques de chaque joueur"
          >
            <Eye size={13} /> Voir le rapport
          </button>
          <span className="dv-hint">Tous les matchs de l’équipe réunis, joueur par joueur.</span>
        </div>
      )}

      {!hasTeams && !loadingTeams && (
        <div className="tj-empty">
          <p>Aucune équipe enregistrée pour l’instant.</p>
          <button className="btn btn-primary" onClick={() => navigate('/teams')}>
            <Users size={14} /> Créer une équipe
          </button>
        </div>
      )}

      {matches.length > 0 ? (
        <div className="tj-home-list">
          {matches.map((match) => (
            <div key={match.id} className="live-card tj-home-card">
              <button
                type="button"
                className="tj-home-open"
                onClick={() => navigate(`/trajectories/${match.id}`)}
                title="Ouvrir la fiche en marquage (mode Annoter)"
              >
                <span className="tj-home-thumb"><HomeThumb /></span>
                <span className="live-card-name">{match.name}</span>
                <span className="live-card-teams">
                  <House size={12} /> {match.team1_name || '—'}
                  {match.team2_name && <>&nbsp;·&nbsp; <Plane size={12} /> {match.team2_name}</>}
                </span>
                <span className="tj-home-meta">
                  <span>{formatDate(match.created_at)}</span>
                  <span className="live-status active">
                    {match.shot_count || 0} flèche{(match.shot_count || 0) > 1 ? 's' : ''}
                  </span>
                  {Number(match.error_count) > 0 && (
                    <span className="live-status finished">{match.error_count} faute(s) ou sortie(s)</span>
                  )}
                </span>
              </button>

              <div className="tj-home-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/trajectories/${match.id}`)}
                  title="Ajouter des flèches (marquage)"
                >
                  <Pencil size={13} /> Annoter
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/trajectories/${match.id}/consult`)}
                  title="Regarder les flèches en lecture seule, joueur par joueur et par type"
                >
                  <Eye size={13} /> Consulter
                </button>
                {Number(match.user_id) === Number(user?.id) && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm tj-home-trash"
                    title="Supprimer cette fiche"
                    onClick={() => removeMatch(match)}
                  >
                    <Trash size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dv-hint">Aucune fiche pour l’instant — cliquez « Créer un match » pour commencer.</p>
      )}

      <AnimatePresence>
        {showCreate && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowCreate(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal tj-create-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <h2>Nouveau match de trajectoire</h2>
              <form onSubmit={createMatch}>
                <div className="form-group">
                  <label>Nom de la fiche</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => { setNameTouched(true); setForm((prev) => ({ ...prev, name: event.target.value })); }}
                    placeholder="Ex: ASUL vs Lyon — 12 octobre"
                  />
                </div>

                <div className="tj-team-selects">
                  <div className="form-group">
                    <label>Équipe 1</label>
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

                <div className="tj-create-row">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setNewTeam({ open: !newTeam.open, name: '', players: [] })}
                  >
                    <Plus size={13} /> {newTeam.open ? 'Fermer la création d’équipe' : 'Créer une équipe'}
                  </button>
                  <span className="dv-hint">
                    {teamName(form.homeId) || 'Équipe 1 à choisir'}
                    {teamName(form.awayId) ? ` vs ${teamName(form.awayId)}` : ''}
                  </span>
                </div>

                {newTeam.open && (
                  <div className="tj-new-team">
                    <div className="form-group">
                      <label>Nom de la nouvelle équipe</label>
                      <input
                        type="text"
                        value={newTeam.name}
                        onChange={(event) => setNewTeam((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Ex: ASUL Lyon"
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
                            style={{ width: 70 }}
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
                            style={{ width: 150 }}
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
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={addPlayerRow}>
                        <Plus size={14} /> Ajouter un joueur
                      </button>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={createTeam}>
                      <Check size={13} /> Enregistrer l’équipe
                    </button>
                    <p className="dv-hint">
                      L’équipe est enregistrée dans l’application et immédiatement proposée dans les listes (y compris
                      l’onglet Équipes).
                    </p>
                  </div>
                )}

                {msg && <div className={`live-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

                <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                  <button className="btn btn-primary" type="submit" disabled={creating}>
                    {creating ? 'Création…' : 'Créer le match'}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => setShowCreate(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
