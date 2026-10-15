// ============================================================================
// Enregistrement du flux caméra du direct sur disque, pour le replay.
//
// Pendant qu'une caméra (téléphone) diffuse, chaque morceau vidéo reçu est NON
// SEULEMENT mis en buffer en mémoire (liveStream, pour la rediffusion différée)
// mais aussi ÉCRIT sur disque ici. À l'arrêt, le fichier est finalisé (remux /
// transcodage via ffmpeg côté route) puis rattaché à la session comme « vidéo ».
//
// L'horodatage de départ (`startedAt`, en ms) sert d'ANCRE : combiné au délai de
// rediffusion, il permet de convertir le `system_time` de chaque action codée en
// une position vidéo (voir route de finalisation).
// ============================================================================

const path = require('path');
const fs = require('fs-extra');

// Dossier de données (positionné par config.js ; repli sur server/).
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const liveDir = path.join(dataDir, 'uploads', 'live');

/** sessionId -> { stream, path, ext, mimeType, startedAt, bytes } */
const recordings = new Map();

/** sessionId -> infos du dernier enregistrement arrêté (pour la finalisation). */
const lastBySession = new Map();

/** Extension de fichier associée au type MIME de MediaRecorder. */
function extForMime(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg')) return 'ogv';
  if (m.includes('webm')) return 'webm';
  return 'webm';
}

function closeStream(rec) {
  if (!rec || !rec.stream) return;
  try {
    rec.stream.end();
  } catch (err) {
    /* flux déjà fermé */
  }
}

/**
 * Démarre l'enregistrement d'une session (repart de zéro si déjà en cours).
 * @returns {{path:string, ext:string}}
 */
function startRecording(sessionId, { mimeType = '' } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const previous = recordings.get(sessionId);
  if (previous) closeStream(previous);
  recordings.delete(sessionId);

  fs.ensureDirSync(liveDir);
  const ext = extForMime(mimeType);
  const filePath = path.join(liveDir, `live_${sessionId}.${ext}`);
  const stream = fs.createWriteStream(filePath);
  stream.on('error', (err) => console.error('liveRecord write error:', err));
  recordings.set(sessionId, { stream, path: filePath, ext, mimeType, startedAt: Date.now(), bytes: 0 });
  return { path: filePath, ext };
}

/** Ajoute un morceau au fichier d'enregistrement. */
function writeRecordingChunk(sessionId, data) {
  const rec = recordings.get(sessionId);
  if (!rec || !data || !data.length) return false;
  rec.stream.write(data);
  rec.bytes += data.length;
  return true;
}

/**
 * Arrête l'enregistrement et renvoie les métadonnées (à la fermeture du flux).
 * @returns {Promise<{path,ext,mimeType,startedAt,bytes}|null>}
 */
function stopRecording(sessionId) {
  const rec = recordings.get(sessionId);
  if (!rec) return Promise.resolve(null);
  recordings.delete(sessionId);
  const info = { path: rec.path, ext: rec.ext, mimeType: rec.mimeType, startedAt: rec.startedAt, bytes: rec.bytes };
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      lastBySession.set(sessionId, info);
      resolve(info);
    };
    try {
      rec.stream.end(finish);
    } catch (err) {
      finish();
    }
    // Filet de sécurité : ne pas rester bloqué si 'end' ne se déclenche pas.
    setTimeout(finish, 3000);
  });
}

function isRecording(sessionId) {
  return recordings.has(sessionId);
}

/** Infos du dernier enregistrement arrêté d'une session (pour la finalisation). */
function lastRecording(sessionId) {
  return lastBySession.get(sessionId) || null;
}

/** Métadonnées en cours (sans le flux). */
function recordingInfo(sessionId) {
  const rec = recordings.get(sessionId);
  if (!rec) return null;
  return { path: rec.path, ext: rec.ext, mimeType: rec.mimeType, startedAt: rec.startedAt, bytes: rec.bytes };
}

module.exports = {
  liveDir,
  extForMime,
  startRecording,
  writeRecordingChunk,
  stopRecording,
  isRecording,
  lastRecording,
  recordingInfo,
};
