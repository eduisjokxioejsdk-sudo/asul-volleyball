import axios from 'axios';

// Utilise l'URL de l'API depuis les variables d'environnement (pour la production)
// ou /api pour le développement local (avec le proxy Vite)
const API_ORIGIN = import.meta.env.VITE_API_URL || '';
const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';


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
  upload: (formData) =>
    api.post('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id, data) => api.patch(`/videos/${id}`, data),
  delete: (id) => api.delete(`/videos/${id}`),
  getFileUrl: (filename) => `${API_BASE}/videos/file/${filename}`,
  getTrimmedUrl: (filename) => `${API_BASE}/videos/trimmed/${filename}`,

  addToFolder: (videoId, folderId) => api.post(`/videos/${videoId}/folders`, { folder_id: folderId }),
  removeFromFolder: (videoId, folderId) => api.delete(`/videos/${videoId}/folders/${folderId}`),
  getFolders: (videoId) => api.get(`/videos/${videoId}/folders`),
};

// Folders API
export const foldersAPI = {
  getAll: () => api.get('/videos/folders/all'),
  getVideos: (folderId) => api.get(`/videos/folders/${folderId}/videos`),
  create: (name, color, parent_folder_id) => api.post('/videos/folders', { name, color, parent_folder_id }),
  update: (id, data) => api.patch(`/videos/folders/${id}`, data),
  delete: (id) => api.delete(`/videos/folders/${id}`),
};

// Cutting API
export const cuttingAPI = {
  saveSegments: (videoId, segments) => api.post(`/cutting/segments/${videoId}`, { segments }),
  getSegments: (videoId) => api.get(`/cutting/segments/${videoId}`),
  generateTrimmed: (videoId) => api.post(`/cutting/generate/${videoId}`),
};

// Points API
export const pointsAPI = {
  getPoints: (videoId) => api.get(`/points/${videoId}`),
  savePoints: (videoId, points) => api.post(`/points/${videoId}`, { points }),
};

export default api;