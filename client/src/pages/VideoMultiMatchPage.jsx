// ============================================================================
// CENTRE VIDÉO — SÉLECTION DES MATCHS POUR LE CUMUL MULTI-MATCHS
//
// Cette page ne fait que choisir les matchs (tous ou une partie) et l'équipe
// à suivre. Elle ouvre ensuite l'écran de consultation habituel du Centre
// Vidéo en mode cumul : même lecteur, mêmes filtres, même play-by-play, mais
// la recherche d'actions porte sur toutes les vidéos sélectionnées.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import useCollectionChanged from '../hooks/useCollectionChanged';
import { videosAPI, teamsAPI } from '../services/api';
import { ArrowLeft, ChartColumn, Check, Eye, ListChecks } from '../components/icons';

const norm = (value) => String(value || '').trim().toLowerCase();
const matchLabelOf = (video) =>
  `${video?.team1_name || 'Domicile'} vs ${video?.team2_name || 'Extérieur'}`;
const dateOf = (video) =>
  video?.created_at ? new Date(video.created_at).toLocaleDateString('fr-FR') : '';

export default function VideoMultiMatchPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const idsParam = searchParams.get('ids') || '';
  const teamParam = searchParams.get('team') || '';
  const initialIds = useMemo(
    () =>
      idsParam
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    [idsParam]
  );

  const [videos, setVideos] = useState([]);
  const [teams, setTeams] = useState([]);
  // null = premier chargement : tous les matchs sont sélectionnés.
  const [selectedIds, setSelectedIds] = useState(initialIds.length > 0 ? initialIds : null);
  const [targetTeam, setTargetTeam] = useState(teamParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [videosRes, teamsRes] = await Promise.all([
        videosAPI.getAll(),
        teamsAPI.getAll().catch(() => ({ data: { teams: [] } })),
      ]);
      const list = videosRes.data?.videos || [];
      setVideos(list);
      setTeams(teamsRes.data?.teams || []);
      setSelectedIds((prev) => {
        if (prev === null) return list.map((v) => v.id);
        return prev.filter((id) => list.some((v) => Number(v.id) === Number(id)));
      });
      setError(null);
    } catch (err) {
      setError('Impossible de charger les matchs du Centre Vidéo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useCollectionChanged('videos', loadData);
  useCollectionChanged('teams', loadData);

  const includedMatches = useMemo(
    () => videos.filter((v) => (selectedIds || []).some((id) => Number(id) === Number(v.id))),
    [videos, selectedIds]
  );

  const availableTeams = useMemo(() => {
    const names = new Set();
    for (const v of includedMatches) {
      if (v.team1_name) names.add(v.team1_name.trim());
      if (v.team2_name) names.add(v.team2_name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [includedMatches]);

  // L'équipe choisie doit exister dans la sélection courante.
  useEffect(() => {
    if (availableTeams.length === 0) {
      if (targetTeam) setTargetTeam('');
      return;
    }
    if (!availableTeams.includes(targetTeam)) {
      setTargetTeam(availableTeams.includes(teamParam) ? teamParam : availableTeams[0]);
    }
  }, [availableTeams, targetTeam, teamParam]);

  // Roster de l'équipe : sert uniquement à afficher un rappel dans l'en-tête.
  const teamRoster = useMemo(() => {
    const team = teams.find((t) => norm(t.name) === norm(targetTeam));
    return team?.players?.length || 0;
  }, [teams, targetTeam]);

  const toggleMatch = (id) => {
    setSelectedIds((prev) => {
      const list = prev || [];
      return list.some((x) => Number(x) === Number(id))
        ? list.filter((x) => Number(x) !== Number(id))
        : [...list, id];
    });
  };

  const selectAllMatches = () => setSelectedIds(videos.map((v) => v.id));
  const selectNoneMatches = () => setSelectedIds([]);
  const allSelected = videos.length > 0 && (selectedIds || []).length === videos.length;

  const openCumulativeConsultation = () => {
    if (!targetTeam || includedMatches.length === 0) return;
    navigate(
      `/video-center?multi=${includedMatches.map((v) => v.id).join(',')}&team=${encodeURIComponent(targetTeam)}`
    );
  };

  return (
    <div className="video-center-page app-shell-dark">
      <AppNavigation user={user} onLogout={onLogout} />

      <main className="video-center-content">
        <div className="pk-mode-home">
          <header className="pk-mode-header" style={{ borderLeftColor: '#38bdf8' }}>
            <div className="pk-mode-header-left">
              <PancakeLogo size={60} />
              <div>
                <h1 className="pk-mode-header-title">Centre Vidéo · Cumul multi-matchs</h1>
                <p className="pk-mode-header-sub">
                  Choisissez les matchs à réunir et l’équipe à suivre. La consultation s’ouvre
                  ensuite dans l’écran habituel du Centre Vidéo — mêmes filtres, même lecteur,
                  même play-by-play — mais la recherche d’actions porte sur toutes les vidéos
                  sélectionnées.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="pk-mono" style={{ fontSize: 13, color: '#a1a1aa' }}>
                {includedMatches.length} / {videos.length} match(s)
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/video-center')}
              >
                <ArrowLeft size={13} /> Centre Vidéo
              </button>
            </div>
          </header>

          <div className="pk-filter-bar" style={{ display: 'block' }}>
            <div className="tj-report-matches">
              <span className="tj-report-bar-label">
                <ChartColumn size={14} /> Matchs inclus :
              </span>
              <div className="tj-report-match-tools">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={selectAllMatches}
                  disabled={allSelected}
                  title="Inclure tous les matchs"
                >
                  Tous
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={selectNoneMatches}
                  disabled={includedMatches.length === 0}
                  title="Retirer tous les matchs"
                >
                  Aucun
                </button>
              </div>
              {videos.map((video) => {
                const included = (selectedIds || []).some((id) => Number(id) === Number(video.id));
                return (
                  <span
                    key={video.id}
                    className={`tj-report-match ${included ? 'included' : 'excluded'}`}
                  >
                    <button
                      type="button"
                      className="tj-report-match-toggle"
                      onClick={() => toggleMatch(video.id)}
                      aria-pressed={included}
                      title={
                        included
                          ? `Retirer « ${matchLabelOf(video)} » du cumul`
                          : `Inclure « ${matchLabelOf(video)} » dans le cumul`
                      }
                    >
                      <Check size={12} style={{ opacity: included ? 1 : 0.22 }} />
                      {video.display_name || matchLabelOf(video)}
                      {dateOf(video) && (
                        <span style={{ fontSize: 10, color: '#71717a' }}>{dateOf(video)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="tj-report-match-open"
                      onClick={() => navigate(`/video-center?video=${video.id}`)}
                      title={`Ouvrir « ${matchLabelOf(video)} » seul dans le Centre Vidéo`}
                      aria-label={`Ouvrir ${matchLabelOf(video)}`}
                    >
                      <Eye size={12} />
                    </button>
                  </span>
                );
              })}
            </div>


            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                  Équipe à suivre
                </span>
                <select
                  value={targetTeam}
                  onChange={(event) => setTargetTeam(event.target.value)}
                  style={{ minWidth: 220, fontWeight: 600 }}
                  disabled={availableTeams.length === 0}
                >
                  {availableTeams.length === 0 && <option value="">Aucune équipe</option>}
                  {availableTeams.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn btn-primary"
                onClick={openCumulativeConsultation}
                disabled={!targetTeam || includedMatches.length === 0}
                title="Ouvrir les actions de cette équipe sur tous les matchs sélectionnés"
              >
                <ListChecks size={15} /> Ouvrir la consultation cumulée
              </button>

              <span className="dv-hint">
                {teamRoster > 0
                  ? `${teamRoster} joueur(s) dans l’effectif de ${targetTeam}.`
                  : `Effectif de ${targetTeam || 'l’équipe'} non renseigné : les numéros codés restent disponibles.`}
              </span>
            </div>
          </div>

          {error && <div className="live-msg err" style={{ marginTop: 12 }}>{error}</div>}

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px solid #27272a' }}>
              Chargement des matchs…
            </div>
          ) : videos.length === 0 ? (
            <div className="tj-empty" style={{ marginTop: 16 }}>
              <p>Aucun match dans le Centre Vidéo.</p>
              <button className="btn btn-primary" onClick={() => navigate('/datavolley')}>
                Créer un match YouTube
              </button>
            </div>
          ) : includedMatches.length === 0 ? (
            <div className="tj-empty" style={{ marginTop: 16 }}>
              <p>Aucun match sélectionné : cochez au moins un match ci-dessus.</p>
              <button className="btn btn-primary" onClick={selectAllMatches}>
                <Check size={14} /> Tout sélectionner
              </button>
            </div>
          ) : (
            <div className="tj-empty" style={{ marginTop: 16 }}>
              <p>
                <strong>{includedMatches.length} match(s)</strong> et{' '}
                <strong>{targetTeam}</strong> sélectionnés.
              </p>
              <p className="dv-hint">
                La consultation cumulée réunit les actions de cette équipe sur ces matchs. Les
                filtres Équipe / Joueur / Action / Évaluation, le lecteur, la synchronisation CAM 2,
                les playlists et le 2ᵉ écran sont identiques à la consultation d’une seule vidéo.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCumulativeConsultation}
                disabled={!targetTeam}
              >
                <ListChecks size={15} /> Ouvrir la consultation cumulée
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

