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
import { isUndefinedTeam } from '../utils/teams';
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
 * Bloc d'import d'une caméra : un lien YouTube partagé, visible sur tous les
 * comptes et tous les postes (aucun fichier à transférer).
 */
export function CameraUploadBlock({ title, accent, hint, youtubeUrl, onYoutubeUrl, extra }) {
  return (
    <div
      className="form-group"
      style={{ marginBottom: 14, padding: 12, background: '#09090b', border: '1px solid #27272a' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 700, color: accent }}>{title}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            border: '1px solid #ef4444',
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.12)',
          }}
        >
          ▶ YOUTUBE
        </span>
      </div>

      <input
        type="url"
        className="form-control"
        placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
        value={youtubeUrl}
        onChange={(e) => onYoutubeUrl(e.target.value)}
      />
      {hint && (
        <span style={{ fontSize: 11, color: '#a1a1aa', display: 'block', marginTop: 4 }}>{hint}</span>
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
  // Glisser-déposer d'une vidéo sur un dossier existant.
  const [draggingVideoId, setDraggingVideoId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeUrlAngle2, setYoutubeUrlAngle2] = useState('');
  const [angle2Offset, setAngle2Offset] = useState(0);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [uploading, setUploading] = useState(false);
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

  const loadAll = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  };

  useOnCollectionsChanged(['videos', 'teams', 'matches'], () => loadAll({ silent: true }));

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
    if (!youtubeUrl.trim()) {
      setUploadError(
        'CAM 1 : un lien YouTube est obligatoire. Hébergez la vidéo sur YouTube (public ou non répertorié) puis collez le lien.'
      );
      return;
    }
    if (!extractYouTubeId(youtubeUrl)) {
      setUploadError(
        'CAM 1 : lien YouTube invalide. Exemple : https://www.youtube.com/watch?v=... ou https://youtu.be/...'
      );
      return;
    }
    if (youtubeUrlAngle2.trim() && !extractYouTubeId(youtubeUrlAngle2)) {
      setUploadError(
        'CAM 2 : lien YouTube invalide. Exemple : https://www.youtube.com/watch?v=... ou https://youtu.be/...'
      );
      return;
    }

    const homeTeam = teams.find((t) => String(t.id) === String(homeTeamId));
    const awayTeam = teams.find((t) => String(t.id) === String(awayTeamId));

    setUploading(true);

    try {
      const formData = new FormData();
      // Uniquement des liens YouTube : la bibliothèque est identique sur tous
      // les comptes et tous les postes.
      formData.append('youtube_url', youtubeUrl.trim());
      if (youtubeUrlAngle2.trim()) {
        formData.append('youtube_url_angle2', youtubeUrlAngle2.trim());
      }
      formData.append('angle2_offset', String(Number(angle2Offset) || 0));
      formData.append('home_team_id', homeTeamId);
      formData.append('away_team_id', awayTeamId);
      formData.append('team1_name', homeTeam?.name || 'Équipe 1');
      formData.append('team2_name', awayTeam?.name || 'Équipe 2');

      const uploadRes = await videosAPI.upload(formData);
      const createdId = uploadRes.data?.id;
      let folderWarning = '';
      if (createdId && uploadFolderId) {
        try {
          await videosAPI.setFolder(createdId, Number(uploadFolderId));
        } catch (folderErr) {
          folderWarning = `Match créé, mais impossible de le placer dans le dossier : ${
            folderErr.response?.data?.error || folderErr.message
          }`;
        }
      }
      setShowUpload(false);
      setYoutubeUrl('');
      setYoutubeUrlAngle2('');
      setAngle2Offset(0);
      setUploadFolderId('');
      if (folderWarning) alert(folderWarning);
      loadAll();
    } catch (err) {
      setUploadError(err.response?.data?.error || `Erreur création : ${err.message}`);
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

  const folderIdsOf = (video) =>
    String(video?.folder_ids || '')
      .split(',')
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);

  /** Chemin lisible d'un dossier (dossiers imbriqués). */
  const folderLabel = (folder) => {
    const byId = new Map(folders.map((f) => [Number(f.id), f]));
    const names = [];
    const seen = new Set();
    let current = folder;
    while (current && !seen.has(Number(current.id))) {
      seen.add(Number(current.id));
      names.unshift(current.name);
      current = current.parent_folder_id ? byId.get(Number(current.parent_folder_id)) : null;
    }
    return names.join(' / ');
  };

  const videosInFolder = (folderId) =>
    videos.filter((v) => folderIdsOf(v).includes(Number(folderId))).length;

  /** Déplace une vidéo vers un dossier ; `null` la remet sans dossier. */
  const moveVideoToFolder = async (videoId, folderId) => {
    const target = folderId ? Number(folderId) : null;
    const id = Number(videoId);
    if (!Number.isInteger(id) || id <= 0) return;
    const previous = videos;
    setVideos((prev) =>
      prev.map((v) => (Number(v.id) === id ? { ...v, folder_ids: target ? String(target) : '' } : v))
    );
    setDraggingVideoId(null);
    setDragOverFolderId(null);
    try {
      await videosAPI.setFolder(id, target);
    } catch (err) {
      setVideos(previous);
      alert(`Erreur déplacement : ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDragStart = (e, video) => {
    e.stopPropagation();
    setDraggingVideoId(video.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(video.id));
  };

  const handleDragEnd = () => {
    setDraggingVideoId(null);
    setDragOverFolderId(null);
  };

  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggingVideoId) setDragOverFolderId(folderId == null ? 0 : Number(folderId));
  };

  const handleFolderDragLeave = (e, folderId) => {
    e.preventDefault();
    const key = folderId == null ? 0 : Number(folderId);
    if (dragOverFolderId === key) setDragOverFolderId(null);
  };

  const handleFolderDrop = (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = Number(e.dataTransfer.getData('text/plain')) || draggingVideoId;
    if (dropped) moveVideoToFolder(dropped, folderId);
  };

  const parentFolderId = currentFolder ? Number(currentFolder.id) : null;
  const subfolders = folders.filter((f) => {
    const pid = f.parent_folder_id == null ? null : Number(f.parent_folder_id);
    return pid === parentFolderId;
  });

  const displayedVideos = videos
    .filter((v) => {
      const ids = folderIdsOf(v);
      return currentFolder ? ids.includes(Number(currentFolder.id)) : ids.length === 0;
    })
    .filter((v) => {
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

  const openUploadModal = () => {
    setUploadError('');
    setUploadFolderId(currentFolder ? String(currentFolder.id) : '');
    setShowUpload(true);
  };

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
                Partagez vos matchs via un lien YouTube (public ou non répertorié), puis codez et consultez les stats sur tous les comptes et tous les postes.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/distribution')}>
              Rapport Distribution Passeur
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowFolderModal(true)}>
              + Nouveau dossier
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={openUploadModal}
            >
              <Plus size={15} /> Nouveau match YouTube
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
              className={`btn btn-sm ${!currentFolder ? 'btn-primary' : 'btn-secondary'} ${
                dragOverFolderId === 0 ? 'drag-over' : ''
              }`}
              onClick={() => navigateToFolder(-1)}
              onDragOver={(e) => handleFolderDragOver(e, null)}
              onDragLeave={(e) => handleFolderDragLeave(e, null)}
              onDrop={(e) => handleFolderDrop(e, null)}
              title="Revenir à la racine ou déposer une vidéo pour la retirer de son dossier"
            >
              Sans dossier
            </button>
            {folderPath.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <span style={{ color: '#71717a' }}>/</span>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    index === folderPath.length - 1 ? 'btn-primary' : 'btn-secondary'
                  } ${dragOverFolderId === Number(folder.id) ? 'drag-over' : ''}`}
                  onClick={() => navigateToFolder(index)}
                  onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                  onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                  onDrop={(e) => handleFolderDrop(e, folder.id)}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Dossiers : zones de dépôt pour déplacer une vidéo */}
        {subfolders.length > 0 && (
          <div className="pk-folder-grid">
            {subfolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`pk-folder-card ${dragOverFolderId === Number(folder.id) ? 'drag-over' : ''}`}
                onClick={() => openFolder(folder)}
                onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
                style={{ borderLeftColor: folder.color || '#c8a165' }}
                title="Ouvrir ce dossier ou y déposer une vidéo"
              >
                <span className="pk-folder-card-name">📁 {folder.name}</span>
                <span className="pk-folder-card-count">{videosInFolder(folder.id)} match(s)</span>
              </button>
            ))}
          </div>
        )}
        {draggingVideoId && (
          <div className="pk-folder-drag-hint">
            Déposez la vidéo sur un dossier pour la déplacer.
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
                : currentFolder
                  ? 'Aucun match dans ce dossier.'
                  : 'Aucun match sans dossier.'}
            </p>
            <p style={{ marginBottom: 16 }}>
              {currentFolder
                ? 'Revenez au dossier parent et déposez une vidéo sur le nom de ce dossier pour la déplacer ici.'
                : 'Créez un match avec un lien YouTube (public ou non répertorié) : la vidéo et les statistiques sont visibles sur tous les comptes et tous les postes.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={openUploadModal}>
              + Nouveau match (YouTube)
            </button>
          </div>
        ) : (
          <div className="pk-cards-list">
            {displayedVideos.map((video) => {
              const isFinished = finishedMatches.some((m) => m.id === video.id);
              const hasYt = Boolean(extractYouTubeId(video.youtube_url));
              const hasCam2 = Boolean(extractYouTubeId(video.youtube_url_angle2));
              return (
                <div
                  key={video.id}
                  className={`pk-match-item ${draggingVideoId === video.id ? 'dragging' : ''}`}
                  draggable
                  title="Glissez ce match sur un dossier pour le déplacer"
                  onDragStart={(e) => handleDragStart(e, video)}
                  onDragEnd={handleDragEnd}
                  onClick={() => {
                    if (draggingVideoId) return;
                    navigate(`/datavolley/${video.id}`);
                  }}
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
                        <span className={isUndefinedTeam(video.team1_name) ? 'team-undef' : undefined}>
                          {video.team1_name || 'Domicile'}
                        </span>
                        <em>VS</em>
                        <span className={isUndefinedTeam(video.team2_name) ? 'team-undef' : undefined}>
                          {video.team2_name || 'Extérieur'}
                        </span>
                      </div>
                      {(isUndefinedTeam(video.team1_name) || isUndefinedTeam(video.team2_name)) && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ marginTop: 8 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const teamId = isUndefinedTeam(video.team1_name)
                              ? video.home_team_id
                              : video.away_team_id;
                            if (teamId) navigate(`/teams?reassign=${teamId}`);
                            else navigate('/teams');
                          }}
                        >
                          Réaffecter l’équipe…
                        </button>
                      )}
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
                          color: hasCam2 ? '#38bdf8' : hasYt ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {hasCam2 ? '2 CAMÉRAS YOUTUBE' : hasYt ? 'CAM 1 YOUTUBE' : 'SANS VIDÉO'}
                      </span>
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <select
                        className="pk-folder-select"
                        value={folderIdsOf(video)[0] || ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => moveVideoToFolder(video.id, e.target.value)}
                        title="Placer ce match dans un dossier"
                      >
                        <option value="">Sans dossier</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folderLabel(folder)}
                          </option>
                        ))}
                      </select>
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

        {/* Modal de création d’un match avec liens YouTube (CAM 1 / CAM 2) */}
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
                  hint="Hébergez la vidéo sur YouTube en mode « Non répertorié » : tous les comptes et tous les postes la voient, sans transfert de fichier."
                  youtubeUrl={youtubeUrl}
                  onYoutubeUrl={setYoutubeUrl}
                />

                <CameraUploadBlock
                  title="2. CAM 2 — Second angle synchronisé (optionnel)"
                  accent="#38bdf8"
                  hint="Même principe pour le second angle : un lien YouTube (public ou non répertorié)."
                  youtubeUrl={youtubeUrlAngle2}
                  onYoutubeUrl={setYoutubeUrlAngle2}
                  extra={
                    youtubeUrlAngle2.trim() ? (
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

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>5. Dossier de destination (optionnel)</label>
                  <select
                    className="form-control"
                    value={uploadFolderId}
                    onChange={(e) => setUploadFolderId(e.target.value)}
                  >
                    <option value="">Sans dossier</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folderLabel(folder)}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: '#a1a1aa', display: 'block', marginTop: 4 }}>
                    Le match sera directement rangé dans ce dossier.
                  </span>
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
                    <span className="pk-mono" style={{ fontSize: 12, color: '#a1a1aa', display: 'block' }}>
                      Enregistrement du match en cours…
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowUpload(false)} disabled={uploading}>
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={uploading || !homeTeamId || !awayTeamId || !youtubeUrl.trim()}
                  >
                    {uploading ? 'Enregistrement...' : 'Créer et partager le match'}
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
                <p className="dv-hint" style={{ marginTop: 0 }}>
                  Dossier parent : <strong>{currentFolder ? folderLabel(currentFolder) : 'Racine (sans dossier)'}</strong>
                </p>
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
