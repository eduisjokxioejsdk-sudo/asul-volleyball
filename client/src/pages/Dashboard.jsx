import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { videosAPI, foldersAPI } from '../services/api';

const VIDEO_COLORS = [
  '#1a73e8', '#ea4335', '#34a853', '#fbbc04', '#9c27b0',
  '#ff5722', '#00bcd4', '#ff4081', '#795548', '#607d8b'
];

function Dashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [videos, setVideos] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFolder, setCurrentFolder] = useState(null); // null = root
  const [folderPath, setFolderPath] = useState([]); // breadcrumb path
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#1a73e8');
  const [editingVideo, setEditingVideo] = useState(null);
  const [editVideoName, setEditVideoName] = useState('');
  const [editVideoColor, setEditVideoColor] = useState('#1a73e8');
  const [videosInCurrentFolder, setVideosInCurrentFolder] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadVideos();
    loadFolders();
  }, []);

  // Load videos in current folder when folder changes
  useEffect(() => {
    if (currentFolder) {
      loadVideosInFolder(currentFolder.id);
    } else {
      // At root, show all videos
      setVideosInCurrentFolder(videos);
    }
  }, [currentFolder, videos]);

  const loadVideos = async () => {
    try {
      const response = await videosAPI.getAll();
      setVideos(response.data.videos);
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const response = await foldersAPI.getAll();
      setFolders(response.data.folders);
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  };

  const loadVideosInFolder = async (folderId) => {
    try {
      const response = await foldersAPI.getVideos(folderId);
      setVideosInCurrentFolder(response.data.videos);
    } catch (err) {
      console.error('Failed to load videos in folder:', err);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', uploadFile);
      formData.append('team1_name', team1Name || uploadFile.name.replace(/\.[^/.]+$/, '').split('vs')[0]?.trim() || 'Équipe 1');
      formData.append('team2_name', team2Name || 'Équipe 2');

      await videosAPI.upload(formData);
      setShowUpload(false);
      setUploadFile(null);
      setTeam1Name('');
      setTeam2Name('');
      setUploadProgress(0);
      loadVideos();
    } catch (err) {
      console.error('Upload failed:', err);
      alert(err.response?.data?.error || 'Échec de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVideo = async (e, videoId) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer cette vidéo ?')) return;

    try {
      await videosAPI.delete(videoId);
      loadVideos();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await foldersAPI.create(newFolderName, newFolderColor, currentFolder?.id || null);
      setNewFolderName('');
      setNewFolderColor('#1a73e8');
      setShowFolderModal(false);
      loadFolders();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la création du dossier');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm('Supprimer ce dossier ? Les vidéos ne seront pas supprimées.')) return;

    try {
      await foldersAPI.delete(folderId);
      loadFolders();
      if (currentFolder?.id === folderId) {
        setCurrentFolder(null);
        setFolderPath([]);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression du dossier');
    }
  };

  const handleEditVideo = (video) => {
    setEditingVideo(video.id);
    setEditVideoName(video.display_name || video.original_name);
    setEditVideoColor(video.color || '#1a73e8');
  };

  const handleSaveVideoEdit = async (videoId) => {
    try {
      await videosAPI.update(videoId, {
        display_name: editVideoName,
        color: editVideoColor
      });
      setEditingVideo(null);
      loadVideos();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la modification');
    }
  };

  const handleAddToFolder = async (videoId, folderId) => {
    try {
      await videosAPI.addToFolder(videoId, folderId);
      loadVideos();
      loadFolders();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de l\'ajout au dossier');
    }
  };

  const handleRemoveFromFolder = async (videoId, folderId) => {
    try {
      await videosAPI.removeFromFolder(videoId, folderId);
      loadVideos();
      loadFolders();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors du retrait du dossier');
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

  const getStatusLabel = (status) => {
    const labels = {
      'uploaded': 'Uploadée',
      'cut_ready': 'Points marqués',
      'trimmed': 'Découpée',
      'annotated': 'Annotée'
    };
    return labels[status] || status;
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const adjustColor = (color, amount) => {
    return color;
  };

  // Get subfolders of current folder
  const subfolders = folders.filter(f => f.parent_folder_id === (currentFolder?.id || null));
  
  // Use videosInCurrentFolder which is loaded from the server
  const videosToDisplay = currentFolder ? videosInCurrentFolder : videos;

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="brand-icon">⚡</span>ASUL <span>• Analyse Volleyball</span>
        </div>
        <div className="navbar-user">
          <span className="user-info">
            <span className="user-name">{user.name}</span>
          </span>
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            title={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="videos-header">
          <h2>Mes vidéos</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowFolderModal(true)}>
              📁 Nouveau dossier
            </button>
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
              + Uploader
            </button>
          </div>
        </div>

        {/* Breadcrumb navigation */}
        <div className="breadcrumb">
          <button
            className={`breadcrumb-item ${!currentFolder ? 'active' : ''}`}
            onClick={() => navigateToFolder(-1)}
          >
            📂 Racine
          </button>
          {folderPath.map((folder, index) => (
            <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="breadcrumb-separator">›</span>
              <button
                className={`breadcrumb-item ${index === folderPath.length - 1 ? 'active' : ''}`}
                onClick={() => navigateToFolder(index)}
                style={{
                  borderLeftColor: folder.color,
                  background: index === folderPath.length - 1 ? folder.color : undefined,
                  color: index === folderPath.length - 1 ? 'var(--bg-primary)' : folder.color,
                  fontWeight: index === folderPath.length - 1 ? 600 : 400
                }}
              >
                📁 {folder.name}
              </button>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading-text">Chargement des vidéos...</div>
        ) : (
          <div>
            {/* Folders grid */}
            {subfolders.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ marginBottom: 16, fontSize: 18, color: 'var(--gray-700)' }}>Dossiers</h3>
                <div className="videos-grid">
                  {subfolders.map(folder => (
                    <div
                      key={folder.id}
                      className="video-card"
                      onDoubleClick={() => openFolder(folder)}
                      style={{ 
                        borderTop: `4px solid ${folder.color}`,
                        cursor: 'pointer'
                      }}
                    >
                      <div className="video-card-thumbnail" style={{ 
                        background: `linear-gradient(135deg, ${folder.color} 0%, ${adjustColor(folder.color, -20)} 100%)`,
                        height: 120
                      }}>
                        <span style={{ fontSize: 48 }}>📁</span>
                      </div>
                      <div className="video-card-body">
                        <h3>{folder.name}</h3>
                        <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
                          {folder.video_count || 0} vidéo{(folder.video_count || 0) !== 1 ? 's' : ''}
                        </p>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                            style={{ flex: 1 }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Videos grid */}
            <div>
              <h3 style={{ marginBottom: 16, fontSize: 18, color: 'var(--gray-700)' }}>
                {currentFolder ? `Vidéos dans "${currentFolder.name}"` : 'Toutes les vidéos'}
              </h3>
              {videosToDisplay.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🎥</div>
                  <h3>Aucune vidéo dans ce dossier</h3>
                  <p>Ajoutez des vidéos à ce dossier en utilisant le menu déroulant.</p>
                </div>
              ) : (
                <div className="videos-grid">
                  {videosToDisplay.map((video) => (
                    <div
                      key={video.id}
                      className="video-card"
                      onClick={() => navigate(`/video/${video.id}`)}
                      style={{ borderTop: `4px solid ${video.color || '#1a73e8'}` }}
                    >
                      <div className="video-card-thumbnail" style={{ background: `linear-gradient(135deg, ${video.color || '#1a73e8'} 0%, ${adjustColor(video.color || '#1a73e8', -20)} 100%)` }}>
                        🎬
                      </div>
                      <div className="video-card-body">
                        {editingVideo === video.id ? (
                          <>
                            <input
                              type="text"
                              value={editVideoName}
                              onChange={(e) => setEditVideoName(e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', marginBottom: 8, fontSize: 14 }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                              {VIDEO_COLORS.map(color => (
                                <button
                                  key={color}
                                  onClick={(e) => { setEditVideoColor(color); e.stopPropagation(); }}
                                  style={{ 
                                    width: 24, 
                                    height: 24, 
                                    borderRadius: '50%', 
                                    background: color, 
                                    border: editVideoColor === color ? '2px solid var(--dark)' : '2px solid transparent',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                />
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={(e) => { handleSaveVideoEdit(video.id); e.stopPropagation(); }}
                                style={{ flex: 1 }}
                              >
                                ✓
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => { setEditingVideo(null); e.stopPropagation(); }}
                                style={{ flex: 1 }}
                              >
                                ✕
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <h3 title={video.display_name || video.original_name}>
                              {video.display_name || video.original_name}
                            </h3>
                            <p>{formatDate(video.created_at)}</p>
                            <span className={`video-card-status status-${video.status}`}>
                              {getStatusLabel(video.status)}
                            </span>
                            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => { handleEditVideo(video); e.stopPropagation(); }}
                                style={{ flex: 1 }}
                              >
                                ✏️
                              </button>
                              <select
                                value=""
                                onChange={(e) => { 
                                  if (e.target.value) {
                                    handleAddToFolder(video.id, e.target.value);
                                    e.stopPropagation();
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--gray-300)' }}
                              >
                                <option value="">+ Ajouter au dossier</option>
                                {folders.map(folder => (
                                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                                ))}
                              </select>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={(e) => handleDeleteVideo(e, video.id)}
                              >
                                🗑️
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Uploader une vidéo</h2>

            {!uploadFile ? (
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                <div className="upload-zone-icon">📹</div>
                <p>Cliquez pour sélectionner une vidéo</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>
                  Formats supportés : MP4, MOV, AVI, MKV (max 500MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: 12 }}>
                  <strong>Fichier sélectionné :</strong> {uploadFile.name}
                </p>
                <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 16 }}>
                  Taille : {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>

                <div className="form-group">
                  <label>Nom de l'Équipe 1</label>
                  <input
                    type="text"
                    value={team1Name}
                    onChange={(e) => setTeam1Name(e.target.value)}
                    placeholder={uploadFile.name.replace(/\.[^/.]+$/, '').split('vs')[0]?.trim() || 'Équipe 1'}
                  />
                </div>

                <div className="form-group">
                  <label>Nom de l'Équipe 2</label>
                  <input
                    type="text"
                    value={team2Name}
                    onChange={(e) => setTeam2Name(e.target.value)}
                    placeholder="Équipe 2"
                  />
                </div>

                {uploading && (
                  <div className="upload-progress">
                    <div
                      className="upload-progress-bar"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading ? 'Upload en cours...' : 'Confirmer l\'upload'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setUploadFile(null)}
                    disabled={uploading}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Folder Creation Modal */}
      {showFolderModal && (
        <div className="modal-overlay" onClick={() => setShowFolderModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nouveau dossier</h2>
            <form onSubmit={handleCreateFolder}>
              <div className="form-group">
                <label>Nom du dossier</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ex: Tournoi d'été"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Couleur</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {VIDEO_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewFolderColor(color)}
                      style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: '50%', 
                        background: color, 
                        border: newFolderColor === color ? '3px solid var(--dark)' : '2px solid transparent',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" className="btn btn-primary">
                  Créer
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFolderModal(false)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;