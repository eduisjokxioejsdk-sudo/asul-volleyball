// ============================================================================
// Flux caméra du match en direct : buffer circulaire + rediffusion différée.
//
// Le téléphone (rôle « caméra ») enregistre la vidéo et envoie des morceaux
// (`live:video-chunk`) au serveur. Chaque morceau est horodaté à son arrivée.
// Un minuteur renvoie ensuite les morceaux arrivés à maturité — c'est-à-dire
// arrivés il y a plus de `delayMs` — aux autres appareils de la session.
// C'est ce délai qui permet aux statisticiens de coder AVANT l'image.
//
// Le buffer vit en mémoire (borné) : la vidéo n'est jamais écrite sur disque.
// ============================================================================

/** Plafond mémoire du buffer (le plus ancien morceau est jeté au-delà). */
const MAX_BUFFER_BYTES = 64 * 1024 * 1024; // 64 Mo

/** Période du minuteur de rediffusion. */
const REPLAY_TICK_MS = 150;

/** Délai par défaut (secondes) entre la capture et l'affichage. */
const DEFAULT_DELAY_S = 10;

/** Délais proposés dans l'interface (secondes). */
const DELAY_CHOICES = [0, 3, 5, 8, 10, 15, 20, 30];

const buffers = new Map(); // sessionId -> buffer

function createBuffer() {
  return {
    chunks: [],
    bytes: 0,
    seq: 0,
    delayMs: DEFAULT_DELAY_S * 1000,
    mimeType: '',
    // Premier morceau du flux : il porte l'en-tête du format (WebM/MP4). Sans
    // lui, un appareil qui rejoint en cours de route ne peut pas décoder.
    init: null,
    emit: null,
    replayTimer: null,
    cameraActive: false,
  };
}

function ensure(sessionId) {
  let buf = buffers.get(sessionId);
  if (!buf) {
    buf = createBuffer();
    buffers.set(sessionId, buf);
  }
  return buf;
}

function clampDelay(seconds) {
  const v = Number(seconds);
  if (!Number.isFinite(v)) return DEFAULT_DELAY_S;
  return Math.max(0, Math.min(60, Math.round(v)));
}

function stopReplay(buf) {
  if (buf && buf.replayTimer) {
    clearInterval(buf.replayTimer);
    buf.replayTimer = null;
  }
}

/** Émet les morceaux arrivés à maturité (plus vieux que le délai demandé). */
function flushDue(sessionId, buf) {
  if (!buf.emit || !buf.chunks.length) return;
  const cutoff = Date.now() - buf.delayMs;
  // Les morceaux sont dans l'ordre d'arrivée : on peut s'arrêter au premier
  // qui n'est pas encore mûr.
  while (buf.chunks.length && buf.chunks[0].arrival <= cutoff) {
    const chunk = buf.chunks.shift();
    buf.bytes -= chunk.data.length;
    buf.emit('live:video-ready', { seq: chunk.seq, data: chunk.data, mimeType: buf.mimeType });
  }
}

function startReplay(sessionId, buf) {
  stopReplay(buf);
  buf.replayTimer = setInterval(() => {
    try {
      flushDue(sessionId, buf);
    } catch (err) {
      console.error('live stream replay error:', err);
    }
  }, REPLAY_TICK_MS);
  if (typeof buf.replayTimer.unref === 'function') buf.replayTimer.unref();
}
/**
 * La caméra annonce qu'elle commence à diffuser : le buffer est vidé, le type
 * MIME est mémorisé et le minuteur de rediffusion démarre.
 * @param {string} sessionId
 * @param {Object} options - { mimeType, delay, emit }
 * @returns {{delay:number, mimeType:string}}
 */
function cameraStarted(sessionId, { mimeType = '', delay = DEFAULT_DELAY_S, emit } = {}) {
  const buf = ensure(sessionId);
  stopReplay(buf);
  buf.chunks = [];
  buf.bytes = 0;
  buf.seq = 0;
  buf.init = null;
  buf.mimeType = mimeType || '';
  buf.delayMs = clampDelay(delay) * 1000;
  buf.emit = typeof emit === 'function' ? emit : buf.emit;
  buf.cameraActive = true;
  startReplay(sessionId, buf);

  if (buf.emit) {
    buf.emit('live:camera-joined', {
      mimeType: buf.mimeType,
      delay: Math.round(buf.delayMs / 1000),
    });
  }
  return { delay: Math.round(buf.delayMs / 1000), mimeType: buf.mimeType };
}

/** Ajoute un morceau de vidéo au buffer (horodaté à l'arrivée). */
function writeChunk(sessionId, data, mimeType = '') {
  if (!data || !data.length) return false;
  const buf = ensure(sessionId);
  if (!buf.cameraActive) return false;

  buf.seq += 1;
  const entry = { seq: buf.seq, data, arrival: Date.now(), sent: false };
  buf.chunks.push(entry);
  buf.bytes += data.length;
  if (mimeType && !buf.mimeType) buf.mimeType = mimeType;
  // Le tout premier morceau porte l'en-tête du flux : on le garde de côté pour
  // pouvoir le renvoyer aux appareils qui rejoignent en cours de match.
  if (!buf.init) buf.init = entry;

  // Buffer borné : on jette les morceaux les plus anciens et on prévient les
  // lecteurs qu'il y a un trou (leur lecteur devra se resynchroniser).
  let droppedNow = 0;
  while (buf.bytes > MAX_BUFFER_BYTES && buf.chunks.length > 1) {
    const old = buf.chunks.shift();
    buf.bytes -= old.data.length;
    droppedNow += 1;
  }
  if (droppedNow > 0 && buf.emit) buf.emit('live:video-gap', { dropped: droppedNow });
  return true;
}

/** Arrête la caméra : vide le buffer et prévient les appareils. */
function cameraStopped(sessionId) {
  const buf = buffers.get(sessionId);
  if (!buf) return;
  stopReplay(buf);
  buf.cameraActive = false;
  buf.chunks = [];
  buf.bytes = 0;
  buf.init = null;
  if (buf.emit) buf.emit('live:camera-left', {});
}

/**
 * Change le délai de rediffusion (réglé par le propriétaire de la session).
 * Les morceaux déjà en buffer sont immédiatement réévalués.
 */
function setDelay(sessionId, seconds, emit) {
  const buf = ensure(sessionId);
  if (typeof emit === 'function') buf.emit = emit;
  buf.delayMs = clampDelay(seconds) * 1000;
  flushDue(sessionId, buf);
  if (buf.emit) buf.emit('live:video-delay', { delay: Math.round(buf.delayMs / 1000) });
  return Math.round(buf.delayMs / 1000);
}

/** État courant du flux (affichage : caméra active, délai, type MIME). */
function streamState(sessionId) {
  const buf = buffers.get(sessionId);
  return {
    cameraActive: !!buf?.cameraActive,
    delay: buf ? Math.round(buf.delayMs / 1000) : DEFAULT_DELAY_S,
    mimeType: buf?.mimeType || '',
    hasInit: !!buf?.init,
  };
}

/**
 * En-tête du flux à renvoyer à un appareil qui rejoint en cours de match.
 * @returns {{seq:number, data:Buffer, mimeType:string}|null}
 */
function initChunk(sessionId) {
  const buf = buffers.get(sessionId);
  if (!buf || !buf.cameraActive || !buf.init) return null;
  return { seq: buf.init.seq, data: buf.init.data, mimeType: buf.mimeType };
}

/** Vrai si la session a une caméra qui diffuse. */
function isCameraActive(sessionId) {
  return !!buffers.get(sessionId)?.cameraActive;
}

/** Octets actuellement en attente de rediffusion (diagnostic / tests). */
function bufferedBytes(sessionId) {
  return buffers.get(sessionId)?.bytes || 0;
}

/** Libère entièrement le buffer d'une session (session terminée / supprimée). */
function dispose(sessionId) {
  const buf = buffers.get(sessionId);
  if (!buf) return;
  stopReplay(buf);
  buffers.delete(sessionId);
}

module.exports = {
  DEFAULT_DELAY_S,
  DELAY_CHOICES,
  MAX_BUFFER_BYTES,
  REPLAY_TICK_MS,
  cameraStarted,
  cameraStopped,
  bufferedBytes,
  dispose,
  initChunk,
  isCameraActive,
  setDelay,
  streamState,
  writeChunk,
};