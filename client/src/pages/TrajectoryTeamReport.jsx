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
  countByResult,
  filterShots,
  filterShotsByZone,
  resultsForKind,
  rosterOf,
  shotFromRow,
  shotsOfKind,
  shotsOfMatches,
  teamReport,
} from '../utils/trajectory';
import { downloadTrajectoryZip } from '../utils/trajectoryExport';
import { ChartColumn, Check, Eye, FileDown, House, Plane, Route, Users } from '../components/icons';

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
  // Matchs retirés du rapport cumulé (vide = toutes les fiches de l'équipe).
  const [excludedMatchIds, setExcludedMatchIds] = useState([]);
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

  // Changer d'équipe repart de toutes ses fiches (aucun match exclu).
  useEffect(() => { setExcludedMatchIds([]); }, [teamId]);

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

  // Sélection des matchs réunis : par défaut toutes les fiches de l'équipe.
  // Décocher un match retire ses flèches du tableau, des terrains et de l'export,
  // sans jamais modifier les fiches elles-mêmes.
  const matches = useMemo(() => data?.matches || [], [data]);
  const excludedSet = useMemo(() => new Set(excludedMatchIds.map(Number)), [excludedMatchIds]);
  const includedMatches = useMemo(
    () => matches.filter((m) => !excludedSet.has(Number(m.id))),
    [matches, excludedSet]
  );
  const includedMatchIds = useMemo(
    () => includedMatches.map((m) => m.id),
    [includedMatches]
  );
  const allShots = useMemo(
    () => shotsOfMatches(data?.shots, includedMatchIds).map(shotFromRow),
    [data, includedMatchIds]
  );
  const allIncluded = includedMatches.length === matches.length;
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
  // Le tableau de synthèse suit exactement le mode et le poste choisis :
  // « Attaque » ne compte que les attaques, « Attaque + poste 4 » seulement les
  // attaques parties de la zone 4, « Services » seulement les services.
  const summary = useMemo(() => teamReport(zoneShots, roster), [zoneShots, roster]);
  const kindLabel = kindLabelOf(kind);

  const toggleResult = (resultId) =>
    setHidden((prev) => (prev.includes(resultId) ? prev.filter((x) => x !== resultId) : [...prev, resultId]));

  // --- Sélection des matchs du rapport cumulé --------------------------------
  const toggleMatch = (matchId) =>
    setExcludedMatchIds((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    );

  const selectAllMatches = () => setExcludedMatchIds([]);

  const selectNoMatches = () => setExcludedMatchIds(matches.map((m) => m.id));

  // Exporte le rapport en dossier ZIP (visualiseur hors ligne, lecture seule).
  const exportZip = useCallback(async () => {
    if (!team || exporting || includedMatches.length === 0) return;
    setExporting(true);
    try {
      const suffix = allIncluded
        ? 'toutes les fiches'
        : `${includedMatches.length} / ${matches.length} matchs`;
      await downloadTrajectoryZip(
        {
          name: `Rapport cumulé — ${teamName} (${suffix})`,
          home_team: team,
          away_team: null,
          team1_name: teamName,
        },
        allShots
      );
      notify(true, 'Dossier ZIP téléchargé.');
    } catch (err) {
      notify(false, 'Échec de l’export.');
    } finally {
      setExporting(false);
    }
  }, [team, teamName, allShots, exporting, notify, includedMatches.length, matches.length, allIncluded]);

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
            <strong>Rapport cumulé — {teamName}</strong>
            <span className={`live-status ${includedMatches.length > 0 ? 'active' : ''}`}>
              {allIncluded
                ? 'Toutes les fiches'
                : `${includedMatches.length} / ${matches.length} fiches`}
            </span>
            <span className="dv-teams">
              <Route size={12} /> {includedMatches.length} / {matches.length} match{matches.length > 1 ? 's' : ''}
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
            disabled={exporting || includedMatches.length === 0}
            title="Télécharger un dossier ZIP du rapport cumulé (matchs sélectionnés uniquement, lecture seule)"
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
                {teamName} · {includedMatches.length} / {matches.length} match{matches.length > 1 ? 's' : ''} inclus · {allShots.length} flèche{allShots.length > 1 ? 's' : ''}
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
              Rapport cumulé : toutes les fiches cochées de <strong>{teamName}</strong> sont réunies (par défaut,
              toutes). Décochez un match pour l’exclure du tableau, des terrains et de l’export ZIP — les fiches
              elles-mêmes ne sont pas modifiées. L’onglet « Tout » rassemble les services et les attaques de chaque
              joueur ; les autres onglets isolent un type de frappe et le tableau ne garde alors que les colonnes de ce
              type. « Poste de départ » limite les attaques à la zone d’où part la flèche (4, 3, 2 ou arrière), dans le
              tableau comme sur les terrains. Cliquez sur un terrain pour l’agrandir.
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
                  <span className="tj-report-bar-label"><ChartColumn size={14} /> Matchs inclus :</span>
                  <div className="tj-report-match-tools">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={selectAllMatches}
                      disabled={allIncluded}
                      title="Réunir toutes les fiches de l’équipe"
                    >
                      Tous
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={selectNoMatches}
                      disabled={includedMatches.length === 0}
                      title="Retirer tous les matchs du rapport"
                    >
                      Aucun
                    </button>
                  </div>
                  {matches.map((m) => {
                    const included = !excludedSet.has(Number(m.id));
                    return (
                      <span
                        key={m.id}
                        className={`tj-report-match ${included ? 'included' : 'excluded'}`}
                      >
                        <button
                          type="button"
                          className="tj-report-match-toggle"
                          onClick={() => toggleMatch(m.id)}
                          aria-pressed={included}
                          title={
                            included
                              ? `Retirer « ${m.name} » du rapport cumulé`
                              : `Inclure « ${m.name} » dans le rapport cumulé`
                          }
                        >
                          <Check size={12} style={{ opacity: included ? 1 : 0.22 }} />
                          {m.team_side === 'home' ? <House size={12} /> : <Plane size={12} />}
                          {m.name}
                          <span className={`live-status ${included ? 'active' : ''}`}>{m.shot_count || 0}</span>
                        </button>
                        <button
                          type="button"
                          className="tj-report-match-open"
                          onClick={() => navigate(`/trajectories/${m.id}/consult`)}
                          title={`Ouvrir la fiche « ${m.name} » en consultation`}
                          aria-label={`Ouvrir la fiche ${m.name}`}
                        >
                          <Eye size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>

                {includedMatches.length === 0 ? (
                  <div className="tj-empty">
                    <p>
                      Aucun match sélectionné : cochez au moins un match ci-dessus pour afficher le rapport cumulé de
                      <strong> {teamName}</strong>.
                    </p>
                    <button className="btn btn-primary" onClick={selectAllMatches}>
                      <Check size={14} /> Tout sélectionner
                    </button>
                  </div>
                ) : (
                  <>
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
                      <caption
                        style={{
                          captionSide: 'top',
                          textAlign: 'left',
                          padding: '0 0 8px',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Tableau — {kindLabel}
                        {kind !== 'serve' && zone !== 'all' ? ` · poste ${zone === 'arriere' ? 'arrière' : zone}` : ''}
                        {' · '}
                        {zoneShots.length} flèche{zoneShots.length > 1 ? 's' : ''} prise{zoneShots.length > 1 ? 's' : ''} en compte
                      </caption>
                      <thead>
                        <tr className="group-row">
                          <th className="name">Joueur</th>
                          {(kind === 'all' || kind === 'serve') && <th>Services</th>}
                          {(kind === 'all' || kind === 'attack') && <th>Attaque</th>}
                          <th>Total</th>
                          {filterResults.map((r) => (
                            <th key={r.id} style={{ color: r.color }}>{r.short}</th>
                          ))}
                          <th>Réussite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.players.map((p) => (
                          <tr key={p.player_number}>
                            <td className="name">{p.player_number} · {p.name || `N°${p.player_number}`}</td>
                            {(kind === 'all' || kind === 'serve') && <td>{p.serveTotal}</td>}
                            {(kind === 'all' || kind === 'attack') && <td>{p.attackTotal}</td>}
                            <td><strong>{p.total}</strong></td>
                            {filterResults.map((r) => (
                              <td key={r.id}>{p.counts[r.id] || ''}</td>
                            ))}
                            <td>{p.total ? `${Math.round(p.successRate * 100)} %` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="team-row">
                          <td className="name">Total équipe</td>
                          {(kind === 'all' || kind === 'serve') && <td>{summary.serveTotal}</td>}
                          {(kind === 'all' || kind === 'attack') && <td>{summary.attackTotal}</td>}
                          <td><strong>{summary.total}</strong></td>
                          {filterResults.map((r) => (
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
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

