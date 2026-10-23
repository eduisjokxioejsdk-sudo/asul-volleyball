import axios from 'axios';

// L'interface et l'API sont servies par le même serveur : les appels visent /api.
// En développement, le proxy Vite redirige /api vers le serveur (port 3001).
const API_BASE = '/api';


const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, name) => api.post('/auth/register', { email, password, name }),
  me: () => api.get('/auth/me'),
};

// Videos API
export const videosAPI = {
  getAll: () => api.get('/videos'),
  getOne: (id) => api.get(`/videos/${id}`),
  upload: (formData, onProgress) =>
    api.post('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Pas de limite de taille ni de timeout côté client (gros fichiers).
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    }),
  update: (id, data) => api.patch(`/videos/${id}`, data),
  uploadAngle: (id, formData, onProgress) =>
    api.post(`/videos/${id}/upload-angle`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    }),
  delete: (id) => api.delete(`/videos/${id}`),
  getFileUrl: (filename) => `${API_BASE}/videos/file/${filename}`,
  getProxyUrl: (filename) => `${API_BASE}/videos/proxy/${filename}`,

  addToFolder: (videoId, folderId) => api.post(`/videos/${videoId}/folders`, { folder_id: folderId }),
  removeFromFolder: (videoId, folderId) => api.delete(`/videos/${videoId}/folders/${folderId}`),
  getFolders: (videoId) => api.get(`/videos/${videoId}/folders`),
  // Partage à distance (métadonnées vidéo seulement, jamais les fichiers).
  sync: () => api.post('/videos/sync'),
  getSyncStatus: () => api.get('/videos/sync/status'),
  saveSyncConfig: (payload) => api.put('/videos/sync/config', payload),
};

// Folders API
export const foldersAPI = {
  getAll: () => api.get('/videos/folders/all'),
  getVideos: (folderId) => api.get(`/videos/folders/${folderId}/videos`),
  create: (name, color, parent_folder_id) => api.post('/videos/folders', { name, color, parent_folder_id }),
  update: (id, data) => api.patch(`/videos/folders/${id}`, data),
  delete: (id) => api.delete(`/videos/folders/${id}`),
};

// DataVolley API (codage d'actions + synchronisation vidéo)
export const datavolleyAPI = {
  getActions: (videoId) => api.get(`/datavolley/${videoId}/actions`),
  saveActions: (videoId, actions) => api.post(`/datavolley/${videoId}/actions`, { actions }),
  saveSetActions: (videoId, setNumber, actions) =>
    api.post(`/datavolley/${videoId}/actions/set/${setNumber}`, { actions }),
  deleteActions: (videoId) => api.delete(`/datavolley/${videoId}/actions`),
  getSync: (videoId) => api.get(`/datavolley/${videoId}/sync`),
  saveSync: (videoId, sync) => api.put(`/datavolley/${videoId}/sync`, sync),
  getMatch: (videoId) => api.get(`/datavolley/${videoId}/match`),
  finish: (videoId) => api.post(`/datavolley/${videoId}/finish`),
  reopen: (videoId) => api.post(`/datavolley/${videoId}/reopen`),
  getFinished: () => api.get('/datavolley/finished'),
  getMultiMatchData: (videoIds) => api.post('/datavolley/multi-match-data', { videoIds }),
  getTeams: (videoId) => api.get(`/datavolley/${videoId}/teams`),
  saveTeams: (videoId, payload) => api.put(`/datavolley/${videoId}/teams`, payload),
  getSetups: (videoId) => api.get(`/datavolley/${videoId}/setups`),
  saveSetups: (videoId, setups) => api.put(`/datavolley/${videoId}/setups`, { setups }),
  // Temps morts et remplacements (frise chronologique du match).
  getEvents: (videoId) => api.get(`/datavolley/${videoId}/events`),
  saveEvent: (videoId, event) => api.post(`/datavolley/${videoId}/events`, event),
  deleteEvent: (videoId, eventId) => api.delete(`/datavolley/${videoId}/events/${eventId}`),
  // Attribution de sets (codage collaboratif).
  getClaims: (videoId) => api.get(`/datavolley/${videoId}/claims`),
  claimSet: (videoId, setNumber) => api.post(`/datavolley/${videoId}/claims`, { set_number: setNumber }),
  releaseSet: (videoId, setNumber) => api.delete(`/datavolley/${videoId}/claims/${setNumber}`),
  // Partage à distance du codage DataVolley (actions).
  sync: () => api.post('/datavolley/sync'),
  getSyncStatus: () => api.get('/datavolley/sync/status'),
  saveSyncConfig: (payload) => api.put('/datavolley/sync/config', payload),
};

// Équipes partagées (globales) + joueurs (n° + nom + rôle) + libéro
export const teamsAPI = {
  getAll: () => api.get('/teams'),
  create: (name, players, settings = {}) =>
    api.post('/teams', { name, players, libero: settings.libero ?? null, libero_for: settings.liberoFor ?? null }),
  update: (id, name, players, settings = {}) =>
    api.patch(`/teams/${id}`, { name, players, libero: settings.libero ?? null, libero_for: settings.liberoFor ?? null }),
  delete: (id) => api.delete(`/teams/${id}`),
  getDirectory: () => api.get('/teams/players/directory'),
  importBatch: (teams) => api.post('/teams/import-batch', { teams }),
  // Partage à distance (synchronisation cloud — voir server/src/teamsSync.js)
  sync: () => api.post('/teams/sync'),
  getSyncStatus: () => api.get('/teams/sync/status'),
  saveSyncConfig: (payload) => api.put('/teams/sync/config', payload),
};

// Fiches de trajectoire (outil temporaire : service / attaque par joueur).
// Partagées comme les équipes ; seul le créateur peut supprimer une fiche.
export const trajectoryAPI = {
  getAll: () => api.get('/trajectories'),
  create: (name, homeTeamId, awayTeamId, videoId) =>
    api.post('/trajectories', { name, home_team_id: homeTeamId ?? null, away_team_id: awayTeamId ?? null, video_id: videoId ?? null }),
  getOne: (id) => api.get(`/trajectories/${id}`),
  // Rapport global : toutes les flèches de tous les matchs d'une équipe.
  getTeamReport: (teamId) => api.get(`/trajectories/team/${teamId}`),
  rename: (id, name) => api.patch(`/trajectories/${id}`, { name }),
  delete: (id) => api.delete(`/trajectories/${id}`),
  saveShots: (id, shots) => api.post(`/trajectories/${id}/shots`, { shots }),
  linkVideo: (id, videoId) => api.put(`/trajectories/${id}/link-video`, { video_id: videoId }),
  // Partage à distance (synchronisation cloud).
  sync: () => api.post('/trajectories/sync'),
  getSyncStatus: () => api.get('/trajectories/sync/status'),
  saveSyncConfig: (payload) => api.put('/trajectories/sync/config', payload),
};

// État technique du serveur (base, stockage, ffmpeg disponible…)
export const systemAPI = {
  getStatus: () => api.get('/system/status'),
};

// Live API (match en direct, multi-appareils)
export const liveAPI = {
  create: (payload) => api.post('/live', payload),
  mine: () => api.get('/live/mine'),
  get: (sessionId) => api.get(`/live/${sessionId}`),
  join: (payload) => api.post('/live/join', payload),
  update: (sessionId, payload) => api.patch(`/live/${sessionId}`, payload),
  finish: (sessionId) => api.post(`/live/${sessionId}/finish`),
  trash: (sessionId) => api.post(`/live/${sessionId}/trash`),
  restore: (sessionId) => api.post(`/live/${sessionId}/restore`),
  deletePermanently: (sessionId) => api.delete(`/live/${sessionId}`),
  getTrash: () => api.get('/live/trash'),
  invite: (sessionId, emails) => api.post(`/live/${sessionId}/invite`, { emails }),
  updateMember: (sessionId, memberId, payload) => api.put(`/live/${sessionId}/members/${memberId}`, payload),
  addAction: (sessionId, payload) => api.post(`/live/${sessionId}/actions`, payload),
  updateAction: (sessionId, actionId, payload) => api.patch(`/live/${sessionId}/actions/${actionId}`, payload),
  deleteAction: (sessionId, actionId) => api.delete(`/live/${sessionId}/actions/${actionId}`),
  completePoint: (sessionId) => api.post(`/live/${sessionId}/point/complete`),
  time: () => api.get('/live/time'),
  // Flux caméra : état du flux et réglage du délai de rediffusion.
  getVideoState: (sessionId) => api.get(`/live/${sessionId}/video-state`),
  saveVideoDelay: (sessionId, delay) => api.put(`/live/${sessionId}/video-delay`, { delay }),
  getTeams: (sessionId) => api.get(`/live/${sessionId}/teams`),
  saveTeams: (sessionId, payload) => api.put(`/live/${sessionId}/teams`, payload),
  getSetups: (sessionId) => api.get(`/live/${sessionId}/setups`),
  saveSetups: (sessionId, setups) => api.put(`/live/${sessionId}/setups`, { setups }),
  // Enregistrement du direct : finalise la piste en une vidéo de replay ancrée.
  finalizeRecording: (sessionId) => api.post(`/live/${sessionId}/finalize-recording`, {}, { timeout: 0 }),
};

// Montages vidéo (Chantier 5 : export compilations d'actions / rallies)
export const montageAPI = {
  getAll: (videoId) => api.get(`/videos/${videoId}/montages`),
  getOne: (videoId, montageId) => api.get(`/videos/${videoId}/montages/${montageId}`),
  create: (videoId, payload) => api.post(`/videos/${videoId}/montages`, payload),
  cancel: (videoId, montageId) => api.post(`/videos/${videoId}/montages/${montageId}/cancel`),
  delete: (videoId, montageId) => api.delete(`/videos/${videoId}/montages/${montageId}`),
  getDownloadUrl: (videoId, montageId) => `${API_BASE}/videos/${videoId}/montages/${montageId}/download`,
  getStreamUrl: (videoId, montageId) => `${API_BASE}/videos/${videoId}/montages/${montageId}/stream`,
  // Téléchargement authentifié : le navigateur n'envoie pas le header
  // Authorization lors d'une navigation classique, on passe donc par axios
  // (intercepteur token) puis on déclenche l'enregistrement du blob.
  download: async (videoId, montageId, filename = 'montage.mp4') => {
    const res = await api.get(`/videos/${videoId}/montages/${montageId}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
};


// Playlists Vidéo Persistantes Multi-Matchs (Point 19)
export const playlistsAPI = {
  getAll: () => api.get('/playlists'),
  create: (data) => api.post('/playlists', data),
  update: (id, data) => api.put(`/playlists/${id}`, data),
  addItems: (id, items) => api.post(`/playlists/${id}/items`, { items }),
  removeItem: (id, itemId) => api.delete(`/playlists/${id}/items/${itemId}`),
  delete: (id) => api.delete(`/playlists/${id}`),
};

// Mode Entraînement (Point 13 — ateliers & séances sans score ni rotation)
export const practiceAPI = {
  getSessions: () => api.get('/practice/sessions'),
  getSession: (id) => api.get(`/practice/sessions/${id}`),
  createSession: (data) => api.post('/practice/sessions', data),
  updateSession: (id, data) => api.put(`/practice/sessions/${id}`, data),
  saveActions: (id, actions) => api.post(`/practice/sessions/${id}/actions`, { actions }),
  getMultiSessionData: (sessionIds) => api.post('/practice/multi-session-data', { sessionIds }),
  deleteSession: (id) => api.delete(`/practice/sessions/${id}`),
};

export default api;