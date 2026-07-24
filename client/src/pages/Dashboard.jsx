import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { videosAPI, foldersAPI } from '../services/api';

const VIDEO_COLORS = [
  '#1a73e8', '#ea4335', '#34a853', '#fbbc04', '#9c27b0',
  '#ff5722', '#00bcd4', '#ff4081', '#795548', '#607d8b'
];

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.4, 0, 0.2, 1] }
  }),
  hover: {
    y: -8,
    transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
  }
};

function Dashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
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

  useEffect(() => {
    if (currentFolder) {
      loadVideosInFolder(currentFolder.id);
    } else {
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

      await videosAPI.upload(formData, (percent) => {
        setUploadProgress(percent);
      });
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

  const subfolders = folders.filter(f => f.parent_folder_id === (currentFolder?.id || null));
  const videosToDisplay = currentFolder ? videosInCurrentFolder : videos;

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">
          <img src="/logo.png" alt="ASUL" style={{ height: 28, marginRight: 4 }} />
          ASUL <span>• Analyse Volleyball</span>
        </div>
        <div className="navbar-user">
          <span className="user-info">
            <span className="user-name">{user.name}</span>
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="videos-header">
          <h2>Mes vidéos</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              className="btn btn-secondary"
              onClick={() => setShowFolderModal(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              📁 Nouveau dossier
            </motion.button>
            <motion.button
              className="btn btn-primary"
              onClick={() => setShowUpload(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              + Uploader
            </motion.button>
          </div>
        </div>

        {/* Breadcrumb */}
        <motion.div
          className="breadcrumb"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
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
                  color: index === folderPath.length - 1 ? 'var(--bg-deep)' : folder.color,
                  fontWeight: index === folderPath.length - 1 ? 600 : 400
                }}
              >
                📁 {folder.name}
              </button>
            </div>
          ))}
        </motion.div>

        {loading ? (
          <div className="loading-text">Chargement des vidéos...</div>
        ) : (
          <div>
            {/* Folders grid */}
            {subfolders.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3 className="sub-section-header" style={{ marginBottom: 16 }}>Dossiers</h3>
                <div className="videos-grid">
                  <AnimatePresence>
                    {subfolders.map((folder, idx) => (
                      <motion.div
                        key={folder.id}
                        custom={idx}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover="hover"
                        className="video-card folder-card"
                        onDoubleClick={() => openFolder(folder)}
                        style={{ borderTop: `3px solid ${folder.color}` }}
                      >
                        <div className="video-card-thumbnail" style={{
                          background: `linear-gradient(135deg, ${folder.color} 0%, rgba(0,0,0,0.3) 100%)`,
                          height: 120
                        }}>
                          <span style={{ fontSize: 48 }}>📁</span>
                        </div>
                        <div className="video-card-body">
                          <h3>{folder.name}</h3>
                          <p style={{ fontSize: 13 }}>
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
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Videos grid */}
            <div>
              <h3 className="sub-section-header" style={{ marginBottom: 16 }}>
                {currentFolder ? `Vidéos dans "${currentFolder.name}"` : 'Toutes les vidéos'}
              </h3>
              {videosToDisplay.length === 0 ? (
                <motion.div
                  className="empty-state"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <span className="empty-state-icon">🎥</span>
                  <h3>Aucune vidéo dans ce dossier</h3>
                  <p>Ajoutez des vidéos à ce dossier en utilisant le menu déroulant.</p>
                </motion.div>
              ) : (
                <div className="videos-grid">
                  <AnimatePresence>
                    {videosToDisplay.map((video, idx) => (
                      <motion.div
                        key={video.id}
                        custom={idx}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover="hover"
                        className="video-card"
                        onClick={() => navigate(`/video/${video.id}`)}
                        style={{ borderTop: `3px solid ${video.color || '#1a73e8'}` }}
                        layout
                      >
                        <div className="video-card-thumbnail" style={{
                          background: `linear-gradient(135deg, ${video.color || '#1a73e8'} 0%, rgba(0,0,0,0.3) 100%)`
                        }}>
                          🎬
                        </div>
                        <div className="video-card-body">
                          {editingVideo === video.id ? (
                            <>
                              <input
                                type="text"
                                value={editVideoName}
                                onChange={(e) => setEditVideoName(e.target.value)}
                                style={{ width: '100%', padding: '4px 8px', marginBottom: 8, fontSize: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--text-primary)' }}
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
                                      border: editVideoColor === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                                      cursor: 'pointer',
                                      padding: 0,
                                      boxShadow: editVideoColor === color ? 'var(--neon-red-glow)' : 'none'
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
                                  style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }}
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
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowUpload(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              <h2>Uploader une vidéo</h2>

              {!uploadFile ? (
                <motion.div
                  className="upload-zone"
                  onClick={() => fileInputRef.current?.click()}
                  whileHover={{ scale: 1.01 }}
                >
                  <span className="upload-zone-icon">📹</span>
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
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <p style={{ marginBottom: 12 }}>
                    <strong>Fichier sélectionné :</strong> {uploadFile.name}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
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
                    <div className="upload-progress-container">
                      <div className="upload-progress-info">
                        <span className="upload-progress-label">
                          {uploadProgress < 100 ? 'Transfert en cours...' : 'Finalisation...'}
                        </span>
                        <span className="upload-progress-percent">{uploadProgress}%</span>
                      </div>
                      <div className="upload-progress">
                        <motion.div
                          className="upload-progress-bar"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        />
                        <motion.div
                          className="upload-progress-glow"
                          initial={{ left: '-10%' }}
                          animate={{ left: `${uploadProgress}%` }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="upload-progress-size">
                        <span>
                          {(uploadFile.size * uploadProgress / 100 / (1024 * 1024)).toFixed(1)} MB / {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12 }}>
                    <motion.button
                      className="btn btn-primary"
                      onClick={handleUpload}
                      disabled={uploading}
                      whileHover={!uploading ? { scale: 1.02 } : {}}
                      whileTap={!uploading ? { scale: 0.98 } : {}}
                      style={{ flex: 1 }}
                    >
                      {uploading ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="upload-spinner" />
                          {uploadProgress < 100 ? 'Upload...' : 'Sauvegarde...'}
                        </span>
                      ) : "Confirmer l'upload"}
                    </motion.button>
                    <motion.button
                      className="btn btn-secondary"
                      onClick={() => setUploadFile(null)}
                      disabled={uploading}
                      whileHover={!uploading ? { scale: 1.02 } : {}}
                      whileTap={!uploading ? { scale: 0.98 } : {}}
                    >
                      Annuler
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder Creation Modal */}
      <AnimatePresence>
        {showFolderModal && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowFolderModal(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
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
                          border: newFolderColor === color ? '3px solid var(--text-primary)' : '2px solid transparent',
                          cursor: 'pointer',
                          padding: 0,
                          boxShadow: newFolderColor === color ? 'var(--neon-red-glow)' : 'none'
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dashboard;