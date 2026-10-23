// ============================================================================
// Rapport global des trajectoires d'une équipe (lecture seule).
//   • réunit TOUS les matchs où l'équipe a été marquée (équipe 1 ou équipe 2) ;
//   • un onglet « Tout » rassemble les services et les attaques de chaque joueur ;
//   • un terrain par joueur, comme dans une fiche, + un tableau de synthèse ;
//   • le menu « Filtres » choisit les types de flèches affichés.
// Aucune donnée n'est modifiée : le rapport est calculé à partir des fiches.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PancakeLogo from '../components/PancakeLogo';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import TrajectoryCourt from '../components/TrajectoryCourt';
import TrajectoryFilter from '../components/TrajectoryFilter';
import TrajectoryZoneFilter from '../components/TrajectoryZoneFilter';
import { teamsAPI, trajectoryAPI } from '../services/api';
import {
  TRAJECTORY_KINDS,
  TRAJECTORY_RESULTS,
  countByResult,
  filterShots,
  filterShotsByZone,
  resultsForKind,
  rosterOf,
  shotFromRow,
  shotsOfKind,
  teamReport,
} from '../utils/trajectory';
import { downloadTrajectoryZip } from '../utils/trajectoryExport';
import { ChartColumn, FileDown, House, Plane, Route, Users } from '../components/icons';

/** Onglets du rapport : « Tout » réunit services et attaques. */
const KIND_TABS = [{ id: 'all', label: 'Tout' }, ...TRAJECTORY_KINDS];

const kindLabelOf = (id) => KIND_TABS.find((k) => k.id === id)?.label || id;

export default function TrajectoryTeamReport() {
  const { teamId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null); // { team, matches, shots }
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState('all');
  const [hidden, setHidden] = useState([]); // issues masquées par le filtre
  const [zone, setZone] = useState('all'); // poste de départ des attaques affichées
  const [flash, setFlash] = useState(null);
  const [exporting, setExporting] = useState(false);

  const flashTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trajectoryAPI.getTeamReport(teamId);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Rapport introuvable.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  // Le sélecteur d'équipe permet de changer de rapport sans revenir à l'accueil.
  useEffect(() => {
    teamsAPI.getAll()
      .then((res) => setTeams(res.data.teams || []))
      .catch(() => {});
  }, []);

  const notify = useCallback((ok, text) => {
    setFlash({ ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // --- Données dérivées -----------------------------------------------------
  const team = data?.team || null;
  const teamName = team?.name || `Équipe ${teamId}`;
  const roster = useMemo(() => rosterOf(team), [team]);
  const allShots = useMemo(() => (data?.shots || []).map(shotFromRow), [data]);
  // Le tableau de synthèse suit le tri par poste de départ : les services
  // restent comptés, seules les attaques se limitent au poste choisi.
  const reportShots = useMemo(
    () => filterShotsByZone(allShots, zone === 'all' ? [] : [zone], 'home'),
    [allShots, zone]
  );
  const summary = useMemo(() => teamReport(reportShots, roster), [reportShots, roster]);
  const kindShots = useMemo(() => shotsOfKind(allShots, kind), [allShots, kind]);
  // Le tri par poste de départ ne concerne que les attaques : les services
  // restent affichés. L'équipe du rapport occupe toujours la moitié gauche.
  const zoneShots = useMemo(
    () => filterShotsByZone(kindShots, zone === 'all' ? [] : [zone], 'home'),
    [kindShots, zone]
  );
  const shownShots = useMemo(() => filterShots(zoneShots, hidden), [zoneShots, hidden]);
  const recap = useMemo(() => countByResult(shownShots), [shownShots]);
  const filterResults = useMemo(() => resultsForKind(kind), [kind]);
  const kindLabel = kindLabelOf(kind);

  const toggleResult = (resultId) =>
    setHidden((prev) => (prev.includes(resultId) ? prev.filter((x) => x !== resultId) : [...prev, resultId]));

  // Exporte le rapport en dossier ZIP (visualiseur hors ligne, lecture seule).
  const exportZip = useCallback(async () => {
    if (!team || exporting) return;
    setExporting(true);
    try {
      await downloadTrajectoryZip(
        { name: `Rapport global — ${teamName}`, home_team: team, away_team: null, team1_name: teamName },
        allShots
      );
      notify(true, 'Dossier ZIP téléchargé.');
    } catch (err) {
      notify(false, 'Échec de l’export.');
    } finally {
      setExporting(false);
    }
  }, [team, teamName, allShots, exporting, notify]);

  // --- Rendu ----------------------------------------------------------------
  if (loading) {
    return (
      <div className="video-dashboard tj-page">
        <div className="app-loading">
          <div className="spinner"></div>
          <p className="loading-text">Chargement du rapport…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="video-dashboard tj-page">
        <div className="vd-workspace">
          <nav className="video-tabs dv-nav">
            <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>←</motion.button>
            <div className="dv-title"><strong>Rapport global</strong></div>
          </nav>
          <div className="vd-main">
            <div className="dv-panel">
              <p className="tj-error">{error || 'Rapport introuvable.'}</p>
              <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Retour à l’accueil</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="video-dashboard tj-page">
      <div className="vd-workspace">
        <nav className="video-tabs dv-nav">
          <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>←</motion.button>
          <div className="dv-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PancakeLogo size={18} />
            <strong>Rapport global — {teamName}</strong>
            <span className="live-status active">Toutes les fiches</span>
            <span className="dv-teams">
              <Route size={12} /> {data.matches.length} match{data.matches.length > 1 ? 's' : ''}
            </span>
          </div>
          <select
            className="tj-report-select"
            value={teamId}
            onChange={(event) => navigate(`/trajectories/team/${event.target.value}`)}
            title="Changer d’équipe"
          >
            {teams.length === 0 && <option value={teamId}>{teamName}</option>}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            className="btn btn-secondary btn-sm"
            onClick={exportZip}
            disabled={exporting}
            title="Télécharger un dossier ZIP du rapport (lecture seule)"
          >
            <FileDown size={14} /> {exporting ? 'Export…' : 'Télécharger'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/teams')}
            title="Modifier les équipes et leurs joueurs"
          >
            <Users size={14} /> Équipes
          </button>
        </nav>

        <div className="vd-main">
          <motion.div className="dv-panel tj-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className={`tj-toolbar tj-kind-${kind}`}>
              <div className="dv-stat-tabs">
                {KIND_TABS.map((k) => (
                  <button
                    key={k.id}
                    className={`video-tab ${kind === k.id ? 'active' : ''}`}
                    onClick={() => setKind(k.id)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <span className="tj-toolbar-team">
                {teamName} · {data.matches.length} match{data.matches.length > 1 ? 's' : ''} · {allShots.length} flèche{allShots.length > 1 ? 's' : ''}
              </span>
              <div className="tj-toolbar-spacer" />
              {kind !== 'serve' && (
                <TrajectoryZoneFilter value={zone} onChange={setZone} />
              )}
              <TrajectoryFilter
                results={filterResults}
                hidden={hidden}
                onToggle={toggleResult}
                onSetAll={setHidden}
              />
            </div>

            {flash && <div className={`live-msg ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>}

            <p className="dv-hint">
              Rapport global : toutes les fiches de <strong>{teamName}</strong> sont réunies. L’onglet « Tout » rassemble
              les services et les attaques de chaque joueur ; les autres onglets isolent un type de frappe. « Poste de
              départ » limite les attaques à la zone d’où part la flèche (4, 3, 2 ou arrière), dans le tableau comme sur
              les terrains. Cliquez sur un terrain pour l’agrandir.
            </p>

            {data.matches.length === 0 ? (
              <div className="tj-empty">
                <p>Aucun match de trajectoire pour <strong>{teamName}</strong>.</p>
                <p className="dv-hint">
                  Créez une fiche avec cette équipe (équipe 1 ou équipe 2) : ses flèches apparaîtront ici, réunies.
                </p>
                <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
                  <Route size={14} /> Aller aux fiches de trajectoire
                </button>
              </div>
            ) : (
              <>
                <div className="tj-report-matches">
                  <span className="tj-report-bar-label"><ChartColumn size={14} /> Matchs réunis :</span>
                  {data.matches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="tj-report-match"
                      onClick={() => navigate(`/trajectories/${m.id}/consult`)}
                      title={`Ouvrir la fiche « ${m.name} » en consultation`}
                    >
                      {m.team_side === 'home' ? <House size={12} /> : <Plane size={12} />}
                      {m.name}
                      <span className="live-status active">{m.shot_count || 0}</span>
                    </button>
                  ))}
                </div>

                <div className="tj-recap">
                  <span className="tj-recap-label">
                    {kindLabel} — {teamName} · {shownShots.length} flèche{shownShots.length > 1 ? 's' : ''} affichée{shownShots.length > 1 ? 's' : ''}
                  </span>
                  {filterResults.filter((r) => recap[r.id] > 0).map((r) => (
                    <span key={r.id} className="tj-chip" style={{ borderColor: r.color, color: r.color }}>
                      {r.label} {recap[r.id]}
                    </span>
                  ))}
                  {shownShots.length === 0 && (
                    <span className="dv-hint">
                      {kindShots.length === 0
                        ? 'Aucune flèche marquée pour l’instant.'
                        : 'Toutes les flèches sont masquées par le filtre.'}
                    </span>
                  )}
                </div>

                <div className="report-wrap">
                  <table className="report report-compact tj-report-table">
                    <thead>
                      <tr className="group-row">
                        <th className="name">Joueur</th>
                        <th>Services</th>
                        <th>Attaque</th>
                        <th>Total</th>
                        {TRAJECTORY_RESULTS.map((r) => (
                          <th key={r.id} style={{ color: r.color }}>{r.short}</th>
                        ))}
                        <th>Réussite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.players.map((p) => (
                        <tr key={p.player_number}>
                          <td className="name">{p.player_number} · {p.name || `N°${p.player_number}`}</td>
                          <td>{p.serveTotal}</td>
                          <td>{p.attackTotal}</td>
                          <td><strong>{p.total}</strong></td>
                          {TRAJECTORY_RESULTS.map((r) => (
                            <td key={r.id}>{p.counts[r.id] || ''}</td>
                          ))}
                          <td>{p.total ? `${Math.round(p.successRate * 100)} %` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="team-row">
                        <td className="name">Total équipe</td>
                        <td>{summary.serveTotal}</td>
                        <td>{summary.attackTotal}</td>
                        <td><strong>{summary.total}</strong></td>
                        {TRAJECTORY_RESULTS.map((r) => (
                          <td key={r.id}>{summary.counts[r.id] || ''}</td>
                        ))}
                        <td>{summary.total ? `${Math.round(summary.successRate * 100)} %` : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {summary.players.length === 0 ? (
                  <div className="tj-empty">
                    <p>Aucun joueur dans l’effectif de <strong>{teamName}</strong>.</p>
                    <button className="btn btn-secondary" onClick={() => navigate('/teams')}>
                      <Users size={14} /> Ouvrir les équipes
                    </button>
                  </div>
                ) : (
                  <div className="tj-grid">
                    {summary.players.map((p) => (
                      <TrajectoryCourt
                        key={`${kind}-${p.player_number}`}
                        player={{ number: p.player_number, name: p.name, role: p.role }}
                        kind={kind}
                        teams={{ left: teamName, right: 'Adversaire' }}
                        shots={shownShots.filter((s) => Number(s.player_number) === p.player_number)}
                        readOnly
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

