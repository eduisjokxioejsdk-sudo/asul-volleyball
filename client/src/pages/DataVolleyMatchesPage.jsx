// ============================================================================
// APPLICATION 1 : DATA VOLLEY — SÉLECTION ET GESTION DES MATCHS
//
// Affiche la liste des vidéos uploadées pour le codage Data Volley,
// permet d'en ouvrir une pour coder, de filtrer par équipe,
// et impose le choix (ou la création) des 2 équipes lors de l'import.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import { videosAPI, foldersAPI, datavolleyAPI, teamsAPI } from '../services/api';
import useCollectionChanged from '../hooks/useCollectionChanged';
import { Check, Plus, Trash, X } from '../components/icons';

const FOLDER_COLORS = [
  '#c8a165', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48',
  '#38bdf8', '#f97316', '#71717a'
];

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

  useCollectionChanged('videos', loadAll);
  useCollectionChanged('teams', loadAll);

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

    const homeTeam = teams.find((t) => String(t.id) === String(homeTeamId));
    const awayTeam = teams.find((t) => String(t.id) === String(awayTeamId));

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      if (uploadFile) formData.append('video', uploadFile);
      if (uploadFileAngle2) formData.append('video_angle2', uploadFileAngle2);
      formData.append('angle2_offset', String(Number(angle2Offset) || 0));
      formData.append('home_team_id', homeTeamId);
      formData.append('away_team_id', awayTeamId);
      formData.append('team1_name', homeTeam?.name || 'Équipe 1');
      formData.append('team2_name', awayTeam?.name || 'Équipe 2');

      await videosAPI.upload(formData, (pct) => setUploadProgress(pct));
      setShowUpload(false);
      setUploadFile(null);
      setUploadFileAngle2(null);
      setAngle2Offset(0);
      loadAll();
    } catch (err) {
      setUploadError(err.response?.data?.error || `Erreur upload : ${err.message}`);
    } finally {
      setUploading(false);
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
                Importez vos vidéos de match en renseignant les deux équipes, puis ouvrez le poste de saisie Play-by-Play.
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
              <Plus size={15} /> Importer une vidéo de match
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
              {displayedVideos.length} / {videos.length} vidéo(s)
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
                : 'Aucune vidéo de match importée.'}
            </p>
            <p style={{ marginBottom: 16 }}>
              Importez une vidéo de match pour commencer le codage DataVolley et alimenter automatiquement le Centre Vidéo.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setShowUpload(true)}>
              + Importer une vidéo de match
            </button>
          </div>
        ) : (
          <div className="pk-cards-list">
            {displayedVideos.map((video) => {
              const isFinished = finishedMatches.some((m) => m.id === video.id);
              return (
                <div
                  key={video.id}
                  className="pk-match-item"
                  onClick={() => navigate(`/datavolley/${video.id}`)}
                >
                  <div>
                    <div className="pk-match-item-head">
                      <div className="pk-match-item-title">
                        {video.display_name || video.original_name}
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
                    <span className="pk-mono" style={{ fontSize: 11.5, color: '#71717a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{video.created_at ? new Date(video.created_at).toLocaleDateString('fr-FR') : '—'}</span>
                      <span
                        style={{
                          padding: '1px 5px',
                          fontSize: 10,
                          border: '1px solid #3f3f46',
                          color: video.filename && video.filename_angle2 ? '#38bdf8' : video.filename ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {video.filename && video.filename_angle2
                          ? '2 CAMÉRAS'
                          : video.filename
                          ? '1 CAMÉRA'
                          : 'VIDÉO APRÈS COUP'}
                      </span>
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        title="Supprimer cette vidéo"
                        onClick={(e) => handleDeleteVideo(e, video.id)}
                      >
                        <Trash size={13} /> Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal d'import de match avec choix / création obligatoire des 2 équipes */}
        {showUpload && (
          <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
            <div className="modal-card modal-dark-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div className="modal-header" style={{ padding: '14px 20px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PancakeLogo size={20} /> Importer une vidéo pour Data Volley
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

                <div className="form-group" style={{ marginBottom: 14, padding: 10, background: '#09090b', border: '1px solid #27272a' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>1a. Vidéo Caméra 1 — Vue Principale (MP4, MOV, MKV)</span>
                    <span style={{ fontSize: 10, color: '#a1a1aa' }}>Optionnel : importable après coup</span>
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    className="form-control"
                    onChange={(e) => setUploadFile(e.target.files[0] || null)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 18, padding: 10, background: '#09090b', border: '1px solid #27272a' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>1b. Vidéo Caméra 2 — Second Angle synchronisé</span>
                    <span style={{ fontSize: 10, color: '#38bdf8' }}>Optionnel : importable maintenant ou après coup</span>
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    className="form-control"
                    onChange={(e) => setUploadFileAngle2(e.target.files[0] || null)}
                  />
                  {uploadFileAngle2 && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Décalage Cam 2 vs Cam 1 (en secondes) :</span>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control"
                        style={{ width: 90 }}
                        value={angle2Offset}
                        onChange={(e) => setAngle2Offset(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>2. Équipe Domicile *</span>
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
                      <span>3. Équipe Extérieur *</span>
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
                      Téléversement en cours : {uploadProgress}%
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowUpload(false)} disabled={uploading}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={uploading || !homeTeamId || !awayTeamId}>
                    {uploading
                      ? 'Téléversement...'
                      : uploadFile || uploadFileAngle2
                      ? 'Importer le match'
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
