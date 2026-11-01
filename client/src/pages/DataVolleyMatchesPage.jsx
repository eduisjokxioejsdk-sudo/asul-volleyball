// ============================================================================
// APPLICATION 1 : DATA VOLLEY — SÉLECTION ET GESTION DES MATCHS
//
// Affiche la liste des vidéos et liens YouTube partagés pour le codage Data Volley,
// permet d'en ouvrir une pour coder, de filtrer par équipe,
// et impose le choix (ou la création) des 2 équipes lors de l'import.
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import { videosAPI, foldersAPI, datavolleyAPI, teamsAPI } from '../services/api';
import { useOnCollectionsChanged } from '../hooks/useCollectionChanged';
import { extractYouTubeId } from '../utils/youtube';
import { Check, Plus, Trash, X } from '../components/icons';

const FOLDER_COLORS = [
  '#c8a165', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48',
  '#38bdf8', '#f97316', '#71717a'
];

// Journée du championnat affichée devant le nom du match (« J0 » par défaut).
const DEFAULT_JOURNEE = 'J0';

/** Normalise la saisie : « 3 » ou « j3 » → « J3 », vide → « J0 ». */
function normalizeJournee(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_JOURNEE;
  const digits = raw.match(/^(\d{1,2})$/);
  if (digits) return `J${digits[1]}`;
  const prefixed = raw.match(/^j\s*[-_ ]?\s*(\d{1,2})$/i);
  if (prefixed) return `J${prefixed[1]}`;
  return raw.slice(0, 24);
}

/**
 * Bloc d'import d'une caméra : un seul menu par caméra, avec deux options —
 * lien YouTube partagé (aucun transfert de fichier) ou fichier vidéo local.
 */
export function CameraUploadBlock({
  title,
  accent,
  hint,
  mode,
  onMode,
  youtubeUrl,
  onYoutubeUrl,
  youtubePlaceholder,
  file,
  onFile,
  extra,
}) {
  return (
    <div
      className="form-group"
      style={{ marginBottom: 14, padding: 12, background: '#09090b', border: '1px solid #27272a' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 700, color: accent }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'youtube' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onMode('youtube')}
            title="Coller un lien YouTube (public ou non répertorié)"
          >
            ▶ YouTube
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onMode('file')}
            title="Importer un fichier vidéo depuis ce PC"
          >
            📁 Fichier MP4
          </button>
        </div>
      </div>

      {mode === 'youtube' ? (
        <>
          <input
            type="url"
            className="form-control"
            placeholder={youtubePlaceholder || 'https://www.youtube.com/watch?v=... ou https://youtu.be/...'}
            value={youtubeUrl}
            onChange={(e) => onYoutubeUrl(e.target.value)}
          />
          <span style={{ fontSize: 11, color: '#a1a1aa', display: 'block', marginTop: 4 }}>{hint}</span>
        </>
      ) : (
        <>
          <input
            type="file"
            accept="video/*"
            className="form-control"
            onChange={(e) => onFile(e.target.files[0] || null)}
          />
          <span style={{ fontSize: 11, color: '#a1a1aa', display: 'block', marginTop: 4 }}>
            {file ? `Fichier sélectionné : ${file.name}` : 'Aucun fichier sélectionné (MP4, MOV, MKV).'}
          </span>
        </>
      )}

      {extra}
    </div>
  );
}

export default function DataVolleyMatchesPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [folders, setFolders] = useState([]);
  const [teams, setTeams] = useState([]);
  const [finishedMatches, setFinishedMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#c8a165');

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFileAngle2, setUploadFileAngle2] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeUrlAngle2, setYoutubeUrlAngle2] = useState('');
  // Mode d'import par caméra : « youtube » (lien partagé) ou « file » (fichier local).
  const [cam1Mode, setCam1Mode] = useState('youtube');
  const [cam2Mode, setCam2Mode] = useState('youtube');
  const [angle2Offset, setAngle2Offset] = useState(0);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  const [showQuickTeam, setShowQuickTeam] = useState(false);
  const [quickTeamTarget, setQuickTeamTarget] = useState('home');
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');

  // Édition en ligne de la journée (double-clic sur le badge « J0 »).
  const [editingJourneeId, setEditingJourneeId] = useState(null);
  const [journeeDraft, setJourneeDraft] = useState('');
  const cancelJourneeEditRef = useRef(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [vidsRes, foldsRes, teamsRes, finRes] = await Promise.all([
        videosAPI.getAll(),
        foldersAPI.getAll(),
        teamsAPI.getAll().catch(() => ({ data: { teams: [] } })),
        datavolleyAPI.getFinished().catch(() => ({ data: { matches: [] } })),
      ]);
      setVideos(vidsRes.data?.videos || []);
      setFolders(foldsRes.data?.folders || []);
      const loadedTeams = teamsRes.data?.teams || [];
      setTeams(loadedTeams);
      setFinishedMatches(finRes.data?.matches || []);

      if (loadedTeams.length >= 1 && !homeTeamId) setHomeTeamId(String(loadedTeams[0].id));
      if (loadedTeams.length >= 2 && !awayTeamId) setAwayTeamId(String(loadedTeams[1].id));
    } catch (err) {
      console.error('Erreur chargement Data Volley matchs:', err);
    } finally {
      setLoading(false);
    }
  };

  useOnCollectionsChanged(['videos', 'teams', 'matches'], loadAll);

  const handleQuickCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const res = await teamsAPI.create(newTeamName.trim(), [], {});
      const created = res.data?.team;
      const teamsRes = await teamsAPI.getAll();
      const updatedTeams = teamsRes.data?.teams || [];
      setTeams(updatedTeams);

      const newId = created?.id || updatedTeams[updatedTeams.length - 1]?.id;
      if (newId) {
        if (quickTeamTarget === 'home') setHomeTeamId(String(newId));
        else setAwayTeamId(String(newId));
      }
      setNewTeamName('');
      setShowQuickTeam(false);
      setUploadError('');
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Impossible de créer l’équipe');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError('');

    if (!homeTeamId || !awayTeamId) {
      setUploadError('Veuillez sélectionner les 2 équipes du match (ou les créer).');
      return;
    }
    if (String(homeTeamId) === String(awayTeamId)) {
      setUploadError('Les deux équipes du match doivent être différentes.');
      return;
    }
    if (cam1Mode === 'youtube' && youtubeUrl.trim() && !extractYouTubeId(youtubeUrl)) {
      setUploadError(
        'CAM 1 : lien YouTube invalide. Exemple : https://www.youtube.com/watch?v=... ou https://youtu.be/...'
      );
      return;
    }
    if (cam2Mode === 'youtube' && youtubeUrlAngle2.trim() && !extractYouTubeId(youtubeUrlAngle2)) {
      setUploadError(
        'CAM 2 : lien YouTube invalide. Exemple : https://www.youtube.com/watch?v=... ou https://youtu.be/...'
      );
      return;
    }

    const homeTeam = teams.find((t) => String(t.id) === String(homeTeamId));
    const awayTeam = teams.find((t) => String(t.id) === String(awayTeamId));

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      // CAM 1 : soit un fichier vidéo local, soit un lien YouTube partagé.
      if (cam1Mode === 'file' && uploadFile) formData.append('video', uploadFile);
      if (cam1Mode === 'youtube' && youtubeUrl.trim()) formData.append('youtube_url', youtubeUrl.trim());
      // CAM 2 : même choix, indépendant de la CAM 1.
      if (cam2Mode === 'file' && uploadFileAngle2) formData.append('video_angle2', uploadFileAngle2);
      if (cam2Mode === 'youtube' && youtubeUrlAngle2.trim()) {
        formData.append('youtube_url_angle2', youtubeUrlAngle2.trim());
      }
      formData.append('angle2_offset', String(Number(angle2Offset) || 0));
      formData.append('home_team_id', homeTeamId);
      formData.append('away_team_id', awayTeamId);
      formData.append('team1_name', homeTeam?.name || 'Équipe 1');
      formData.append('team2_name', awayTeam?.name || 'Équipe 2');

      await videosAPI.upload(formData, (pct) => setUploadProgress(pct));
      setShowUpload(false);
      setUploadFile(null);
      setUploadFileAngle2(null);
      setYoutubeUrl('');
      setYoutubeUrlAngle2('');
      setAngle2Offset(0);
      setCam1Mode('youtube');
      setCam2Mode('youtube');
      loadAll();
    } catch (err) {
      setUploadError(err.response?.data?.error || `Erreur upload : ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const startEditJournee = (e, video) => {
    e.stopPropagation();
    cancelJourneeEditRef.current = false;
    setEditingJourneeId(video.id);
    setJourneeDraft(video.journee || DEFAULT_JOURNEE);
  };

  const cancelEditJournee = () => {
    setEditingJourneeId(null);
    setJourneeDraft('');
  };

  const commitJournee = async (video) => {
    if (editingJourneeId !== video.id) return;
    const previous = video.journee || DEFAULT_JOURNEE;
    const next = normalizeJournee(journeeDraft);
    setEditingJourneeId(null);
    setJourneeDraft('');
    if (next === previous) return;
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, journee: next } : v)));
    try {
      await videosAPI.update(video.id, { journee: next });
    } catch (err) {
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, journee: previous } : v)));
      alert(`Erreur mise à jour de la journée : ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDeleteVideo = async (e, videoId) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer définitivement cette vidéo de match ?')) return;
    try {
      await videosAPI.delete(videoId);
      loadAll();
    } catch (err) {
      alert(`Erreur suppression: ${err.message}`);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await foldersAPI.create(newFolderName, newFolderColor, currentFolder?.id || null);
      setNewFolderName('');
      setShowFolderModal(false);
      loadAll();
    } catch (err) {
      alert(`Erreur création dossier: ${err.message}`);
    }
  };

  const openFolder = (folder) => {
    setCurrentFolder(folder);
    setFolderPath([...folderPath, folder]);
  };

  const navigateToFolder = (index) => {
    if (index === -1) {
      setCurrentFolder(null);
      setFolderPath([]);
    } else {
      setCurrentFolder(folderPath[index]);
      setFolderPath(folderPath.slice(0, index + 1));
    }
  };

  const subfolders = folders.filter(
    (f) => f.parent_folder_id === (currentFolder?.id || null)
  );

  const displayedVideos = (currentFolder
    ? videos.filter((v) => v.folder_id === currentFolder.id)
    : videos
  ).filter((v) => {
    if (selectedTeamFilter !== 'ALL') {
      const targetTeam = teams.find((t) => String(t.id) === String(selectedTeamFilter));
      const matchById =
        String(v.home_team_id) === String(selectedTeamFilter) ||
        String(v.away_team_id) === String(selectedTeamFilter);
      const matchByName =
        targetTeam &&
        ((v.team1_name || '').toLowerCase() === targetTeam.name.toLowerCase() ||
          (v.team2_name || '').toLowerCase() === targetTeam.name.toLowerCase());
      if (!matchById && !matchByName) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (v.display_name || v.original_name || '').toLowerCase();
    const t1 = (v.team1_name || '').toLowerCase();
    const t2 = (v.team2_name || '').toLowerCase();
    return name.includes(q) || t1.includes(q) || t2.includes(q);
  });

  return (
    <div className="dv-matches-page">
      <AppNavigation user={user} onLogout={onLogout} />

      <main className="pk-mode-home">
        {/* En-tête du mode Data Volley */}
        <header className="pk-mode-header">
          <div className="pk-mode-header-left">
            <PancakeLogo size={60} />
            <div>
              <h1 className="pk-mode-header-title">Data Volley · Matchs & Codage Vidéo</h1>
              <p className="pk-mode-header-sub">
                Partagez vos matchs via un lien YouTube (public ou non répertorié) ou un fichier MP4 local, puis codez et consultez les stats sur tous les postes.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowFolderModal(true)}>
              + Nouveau dossier
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                setUploadError('');
                setShowUpload(true);
              }}
            >
              <Plus size={15} /> Nouveau match (YouTube ou fichier vidéo)
            </button>
          </div>
        </header>

        {/* Barre de filtrage (Équipe, Recherche, Dossiers) */}
        <div className="pk-filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Filtrer par équipe :
            </span>
            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              style={{ minWidth: 210, fontWeight: 600 }}
            >
              <option value="ALL">Toutes les équipes ({teams.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {selectedTeamFilter !== 'ALL' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedTeamFilter('ALL')}>
                Réinitialiser
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Rechercher un match ou une équipe…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ minWidth: 260 }}
            />
            <span className="pk-mono" style={{ fontSize: 12, color: '#a1a1aa', padding: '0 6px' }}>
              {displayedVideos.length} / {videos.length} match(s)
            </span>
          </div>
        </div>

        {/* Fil d'Ariane et sous-dossiers */}
        {(folderPath.length > 0 || subfolders.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: '#141418', border: '1px solid #27272a' }}>
            <button
              type="button"
              className={`btn btn-sm ${!currentFolder ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => navigateToFolder(-1)}
            >
              Tous les dossiers
            </button>
            {folderPath.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <span style={{ color: '#71717a' }}>/</span>
                <button
                  type="button"
                  className={`btn btn-sm ${index === folderPath.length - 1 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => navigateToFolder(index)}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
            {subfolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => openFolder(folder)}
                style={{ borderLeft: `3px solid ${folder.color || '#c8a165'}` }}
              >
                📁 {folder.name}
              </button>
            ))}
          </div>
        )}

        {/* Grille de cartes de matchs */}
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px solid #27272a' }}>
            Chargement des vidéos de match…
          </div>
        ) : displayedVideos.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa', background: '#141418', border: '1px dashed #3f3f46' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', marginBottom: 8 }}>
              {selectedTeamFilter !== 'ALL'
                ? 'Aucune vidéo trouvée pour cette équipe.'
                : 'Aucun match enregistré.'}
            </p>
            <p style={{ marginBottom: 16 }}>
              Créez un match avec un lien YouTube (public ou non répertorié) ou un fichier MP4 pour commencer le codage DataVolley et partager automatiquement les statistiques avec tous les postes.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setShowUpload(true)}>
              + Nouveau match (YouTube ou vidéo)
            </button>
          </div>
        ) : (
          <div className="pk-cards-list">
            {displayedVideos.map((video) => {
              const isFinished = finishedMatches.some((m) => m.id === video.id);
              const hasYt = Boolean(extractYouTubeId(video.youtube_url));
              const hasLocal = Boolean(video.filename);
              // CAM 2 peut être un fichier local ou un lien YouTube (stocké à part).
              const hasCam2 = Boolean(video.filename_angle2 || extractYouTubeId(video.youtube_url_angle2));
              return (
                <div
                  key={video.id}
                  className="pk-match-item"
                  onClick={() => navigate(`/datavolley/${video.id}`)}
                >
                  <div>
                    <div className="pk-match-item-head">
                      <div className="pk-match-item-names">
                        {editingJourneeId === video.id ? (
                          <input
                            className="pk-match-day-input pk-mono"
                            value={journeeDraft}
                            autoFocus
                            maxLength={12}
                            title="Journée du match (ex. J1) — Entrée pour valider, Échap pour annuler"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setJourneeDraft(e.target.value)}
                            onBlur={() => {
                              if (cancelJourneeEditRef.current) {
                                cancelJourneeEditRef.current = false;
                                return;
                              }
                              commitJournee(video);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelJourneeEditRef.current = true;
                                cancelEditJournee();
                              }
                            }}
                          />
                        ) : (
                          <span
                            className="pk-match-day pk-mono"
                            title="Double-cliquez pour changer la journée"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => startEditJournee(e, video)}
                          >
                            {video.journee || DEFAULT_JOURNEE}
                          </span>
                        )}
                        <div className="pk-match-item-title">
                          {video.display_name || video.original_name}
                        </div>
                      </div>
                      <span
                        className="pk-mono"
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          background: isFinished ? 'rgba(16, 185, 129, 0.14)' : 'rgba(14, 165, 233, 0.14)',
                          color: isFinished ? '#10b981' : '#38bdf8',
                          border: `1px solid ${isFinished ? '#059669' : '#0284c7'}`,
                        }}
                      >
                        {isFinished ? 'TERMINÉ' : 'EN SAISIE'}
                      </span>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div className="pk-match-versus">
                        <span>{video.team1_name || 'Domicile'}</span>
                        <em>VS</em>
                        <span>{video.team2_name || 'Extérieur'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pk-match-item-foot" onClick={(e) => e.stopPropagation()}>
                    <span className="pk-mono" style={{ fontSize: 11.5, color: '#71717a', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{video.created_at ? new Date(video.created_at).toLocaleDateString('fr-FR') : '—'}</span>
                      {hasYt && (
                        <span
                          style={{
                            padding: '1px 6px',
                            fontSize: 10,
                            border: '1px solid #ef4444',
                            color: '#f87171',
                            background: 'rgba(239, 68, 68, 0.12)',
                            fontWeight: 700,
                          }}
                        >
                          ▶ YOUTUBE PARTAGÉ
                        </span>
                      )}
                      <span
                        style={{
                          padding: '1px 5px',
                          fontSize: 10,
                          border: '1px solid #3f3f46',
                          color:
                            hasCam2
                              ? '#38bdf8'
                              : hasLocal
                              ? '#10b981'
                              : hasYt
                              ? '#a1a1aa'
                              : '#f59e0b',
                        }}
                      >
                        {hasLocal && hasCam2
                          ? '2 CAMÉRAS LOCALES'
                          : hasCam2
                          ? video.filename_angle2
                            ? 'CAM 1 + CAM 2'
                            : 'CAM 2 CLOUD'
                          : hasLocal
                          ? '1 CAMÉRA LOCALE'
                          : hasYt
                          ? 'CLOUD PRÊT'
                          : 'SANS VIDÉO'}
                      </span>
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/datavolley/${video.id}`)}
                      >
                        Ouvrir dans DataVolley →
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        title="Supprimer ce match"
                        onClick={(e) => handleDeleteVideo(e, video.id)}
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal d'import de match avec lien YouTube et/ou fichiers vidéo */}
        {showUpload && (
          <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
            <div className="modal-card modal-dark-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
              <div className="modal-header" style={{ padding: '14px 20px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PancakeLogo size={20} /> Nouveau match Data Volley
                </h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowUpload(false)}>
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleUpload} style={{ padding: '20px' }}>
                {uploadError && (
                  <div className="live-msg err" style={{ marginBottom: 16 }}>
                    {uploadError}
                  </div>
                )}

                <CameraUploadBlock
                  title="1. CAM 1 — Vue principale"
                  accent="#c8a165"
                  hint="Hébergez la vidéo sur YouTube en mode « Non répertorié » : tous les postes la voient, sans transfert de fichier."
                  mode={cam1Mode}
                  onMode={setCam1Mode}
                  youtubeUrl={youtubeUrl}
                  onYoutubeUrl={setYoutubeUrl}
                  file={uploadFile}
                  onFile={setUploadFile}
                />

                <CameraUploadBlock
                  title="2. CAM 2 — Second angle synchronisé"
                  accent="#38bdf8"
                  hint="Même choix pour le second angle : lien YouTube (public ou non répertorié) ou fichier vidéo local."
                  mode={cam2Mode}
                  onMode={setCam2Mode}
                  youtubeUrl={youtubeUrlAngle2}
                  onYoutubeUrl={setYoutubeUrlAngle2}
                  file={uploadFileAngle2}
                  onFile={setUploadFileAngle2}
                  extra={
                    (cam2Mode === 'file' && uploadFileAngle2) ||
                    (cam2Mode === 'youtube' && youtubeUrlAngle2.trim()) ? (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#a1a1aa' }}>Décalage CAM 2 vs CAM 1 (en secondes) :</span>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          style={{ width: 90 }}
                          value={angle2Offset}
                          onChange={(e) => setAngle2Offset(e.target.value)}
                        />
                      </div>
                    ) : null
                  }
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>3. Équipe Domicile *</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setQuickTeamTarget('home');
                          setShowQuickTeam(true);
                        }}
                      >
                        + Créer
                      </button>
                    </label>
                    <select
                      className="form-control"
                      value={homeTeamId}
                      onChange={(e) => setHomeTeamId(e.target.value)}
                      required
                    >
                      <option value="">-- Choisir une équipe --</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>4. Équipe Extérieur *</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setQuickTeamTarget('away');
                          setShowQuickTeam(true);
                        }}
                      >
                        + Créer
                      </button>
                    </label>
                    <select
                      className="form-control"
                      value={awayTeamId}
                      onChange={(e) => setAwayTeamId(e.target.value)}
                      required
                    >
                      <option value="">-- Choisir une équipe --</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {showQuickTeam && (
                  <div style={{ padding: 12, background: '#0d0d11', border: '1px solid #3f3f46', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong>
                        Nouvelle équipe ({quickTeamTarget === 'home' ? 'Domicile' : 'Extérieur'})
                      </strong>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowQuickTeam(false)}>
                        <X size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Nom de l'équipe"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleQuickCreateTeam}
                        disabled={creatingTeam || !newTeamName.trim()}
                      >
                        <Check size={14} /> Ajouter
                      </button>
                    </div>
                  </div>
                )}

                {uploading && (
                  <div style={{ marginBottom: 16, marginTop: 12 }}>
                    <div style={{ height: 8, background: '#27272a', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#c8a165' }} />
                    </div>
                    <span className="pk-mono" style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4, display: 'block' }}>
                      Enregistrement en cours : {uploadProgress}%
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowUpload(false)} disabled={uploading}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={uploading || !homeTeamId || !awayTeamId}>
                    {uploading
                      ? 'Enregistrement...'
                      : (cam1Mode === 'file' && uploadFile) ||
                        (cam2Mode === 'file' && uploadFileAngle2) ||
                        (cam1Mode === 'youtube' && youtubeUrl.trim()) ||
                        (cam2Mode === 'youtube' && youtubeUrlAngle2.trim())
                      ? 'Créer et partager le match'
                      : 'Créer le match (vidéos après coup)'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Nouveau Dossier */}
        {showFolderModal && (
          <div className="modal-backdrop" onClick={() => setShowFolderModal(false)}>
            <div className="modal-card modal-dark-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ padding: '14px 20px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Créer un dossier</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowFolderModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleCreateFolder} style={{ padding: '20px' }}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Nom du dossier</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Ex: Championnat 2026, Playoffs..."
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 20 }}>
                  <label>Couleur du dossier</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewFolderColor(c)}
                        style={{
                          width: 28,
                          height: 28,
                          background: c,
                          border: newFolderColor === c ? '2px solid #fff' : '2px solid transparent',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowFolderModal(false)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Créer le dossier
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
