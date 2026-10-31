// ============================================================================
// Capture caméra du match en direct (PC statisticien : webcam USB / carte
// d'acquisition HDMI / OBS Virtual Camera, ou téléphone avec rôle « caméra »).
//
// La caméra filme et envoie la vidéo au serveur par morceaux (`MediaRecorder`
// → Socket.IO). Le serveur la rediffuse aux appareils avec le délai choisi
// (voir server/src/liveStream.js) et l'enregistre pour le replay DataVolley.
//
// Aucune dépendance externe : `getUserMedia` et `MediaRecorder` sont des API
// navigateur standard (Chrome / Firefox / Safari / Electron).
// ============================================================================

/** Types MIME essayés, du plus efficace au plus compatible. */
export const CAMERA_MIME_CANDIDATES = [
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
];

/** Vrai si le navigateur sait enregistrer ce type. */
export function recorderSupports(mimeType) {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return false;
  try {
    return window.MediaRecorder.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

/** Vrai si le navigateur sait LIRE ce type dans un MediaSource. */
export function sourceSupports(mimeType) {
  if (typeof window === 'undefined') return false;
  const MS = window.MediaSource || window.ManagedMediaSource;
  if (typeof MS === 'undefined') {
    // Sur certains appareils mobiles (Safari iOS), `window.MediaSource` n'est
    // pas exposé alors que `MediaRecorder` sait enregistrer en MP4/WebM que les
    // PC statisticiens savent lire.
    return false;
  }
  try {
    return MS.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

/**
 * Type MIME commun à la capture et à la lecture : la caméra enregistre et
 * les PCs doivent pouvoir lire le même flux. Sur iOS où `MediaSource` est
 * absent, on retient le premier format supporté par `MediaRecorder`.
 */
export function pickCameraMimeType() {
  const both = CAMERA_MIME_CANDIDATES.filter((m) => recorderSupports(m) && sourceSupports(m));
  if (both.length > 0) return both[0];
  const hasMS =
    typeof window !== 'undefined' &&
    typeof (window.MediaSource || window.ManagedMediaSource) !== 'undefined';
  if (!hasMS) {
    const recOnly = CAMERA_MIME_CANDIDATES.filter((m) => recorderSupports(m));
    return recOnly[0] || '';
  }
  return '';
}

/** Vrai si l'appareil peut filmer (contexte sécurisé + API disponibles). */
export function cameraSupported() {
  if (typeof navigator === 'undefined') return false;
  const hasApi = !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';
  const secure = typeof window !== 'undefined' ? window.isSecureContext !== false : true;
  return hasApi && secure;
}

/** Liste les caméras vidéo disponibles (webcam USB, carte d'acquisition HDMI, OBS…). */
export async function listCameraDevices() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Caméra ${i + 1}`,
      }));
  } catch {
    return [];
  }
}

/** Intervalle d'envoi des morceaux (ms) : court pour limiter la latence. */
export const CHUNK_INTERVAL_MS = 250;

/**
 * Délais de rediffusion proposés (secondes). 0 = vrai direct ; les valeurs
 * usuelles (5 à 15 s) laissent le temps de coder le point avant de le revoir.
 * Même liste que côté serveur (server/src/liveStream.js).
 */
export const DELAY_CHOICES = [0, 3, 5, 8, 10, 15, 20, 30];

/** Délai par défaut, identique à celui du serveur. */
export const DEFAULT_DELAY_S = 10;

/** Borne une valeur de délai dans les limites acceptées par le serveur. */
export function clampDelay(seconds) {
  const v = Number(seconds);
  if (!Number.isFinite(v)) return DEFAULT_DELAY_S;
  return Math.max(0, Math.min(60, Math.round(v)));
}

/** Contraintes vidéo : caméra arrière du téléphone ou périphérique précis (USB/HDMI/OBS). */
export function cameraConstraints(deviceId = '') {
  const video = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 25, max: 30 },
  };
  if (deviceId && typeof deviceId === 'string') {
    delete video.facingMode;
    video.deviceId = { exact: deviceId };
  }
  return {
    audio: false,
    video,
  };
}

/**
 * Démarre la capture et l'envoi des morceaux au serveur.
 *
 * @param {Object} options
 * @param {Object} options.socket - socket Socket.IO connecté
 * @param {string} options.sessionId
 * @param {number} [options.delay] - délai de rediffusion voulu (secondes)
 * @param {string} [options.deviceId] - identifiant de caméra (USB / HDMI / OBS)
 * @param {(stream:MediaStream)=>void} [options.onStream] - aperçu local
 * @param {(text:string, ok?:boolean)=>void} [options.onStatus]
 * @returns {Promise<{stop:Function, mimeType:string, stream:MediaStream}>}
 */
export async function startCameraCapture({ socket, sessionId, delay, deviceId, onStream, onStatus } = {}) {
  if (!cameraSupported()) {
    throw new Error(
      'Caméra indisponible : ouvrez la page en HTTPS (ou directement sur le PC hôte) et autorisez la caméra.'
    );
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId));
  } catch (err) {
    if (deviceId) {
      // Repli sur la caméra par défaut si le périphérique choisi n'accepte pas les contraintes.
      stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
    } else {
      throw err;
    }
  }
  if (onStream) onStream(stream);

  const mimeType = pickCameraMimeType();
  const options = mimeType ? { mimeType } : {};

  let recorder;
  try {
    recorder = new window.MediaRecorder(stream, { ...options, videoBitsPerSecond: 2_500_000 });
  } catch {
    // Certains navigateurs refusent le bitrate explicite : on réessaie sans.
    recorder = new window.MediaRecorder(stream, options);
  }

  // Le serveur crée le buffer et prévient les autres appareils.
  socket.emit('live:camera-start', { sessionId, mimeType: recorder.mimeType || mimeType, delay });

  recorder.ondataavailable = async (event) => {
    if (!event.data || !event.data.size) return;
    try {
      const data = await event.data.arrayBuffer();
      socket.emit('live:video-chunk', { sessionId, data, mimeType: recorder.mimeType || mimeType });
    } catch {
      // Morceau perdu : le flux reprend au suivant.
    }
  };

  recorder.onerror = () => {
    if (onStatus) onStatus('Erreur de capture vidéo.', false);
  };

  recorder.start(CHUNK_INTERVAL_MS);
  if (onStatus) onStatus('Caméra en direct : la vidéo arrive avec le délai choisi.', true);

  const stop = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      // déjà arrêté
    }
    stream.getTracks().forEach((t) => t.stop());
    socket.emit('live:camera-stop', { sessionId });
    if (onStatus) onStatus('Caméra arrêtée.', false);
  };

  return { stop, mimeType: recorder.mimeType || mimeType, stream };
}
