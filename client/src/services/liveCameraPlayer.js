// ============================================================================
// Lecteur du flux caméra différé (PC statisticiens et observateurs).
//
// Les morceaux vidéo arrivent du serveur (`live:video-ready`) dans l'ordre de
// capture, déjà décalés du délai choisi. On les pousse dans un `MediaSource`
// attaché à un élément <video> : le navigateur les présente comme un flux
// continu, en lecture automatique.
//
// Deux points délicats sont traités ici :
//   • l'en-tête du format (WebM/MP4) ne se trouve que dans le PREMIER morceau
//     du flux : un appareil qui rejoint en cours de match ne peut pas décoder
//     sans lui. Le serveur le renvoie (`live:video-init`) sur demande ;
//   • en attendant cet en-tête, les morceaux reçus sont mis de côté au lieu
//     d'être poussés, sinon le lecteur partirait en erreur ;
//   • dans un vrai navigateur, `sourceopen` est asynchrone : les morceaux sont
//     donc placés dans `pending` avant que `sourceopen` ne crée `sourceBuffer`.
// ============================================================================

/** Données déjà lues à conserver derrière la tête de lecture (secondes). */
const KEEP_BEHIND_S = 2;

/** Longueur du buffer à partir de laquelle on purge le passé (secondes). */
const TRIM_AFTER_S = 45;

/** Écart considéré comme un trou dans le flux (secondes). */
const GAP_S = 0.5;

/** Morceaux mis de côté dans l'attente de l'en-tête avant repli (garde-fou). */
const MAX_WAITING_CHUNKS = 240;

/**
 * Crée un lecteur de flux caméra.
 *
 * @param {HTMLVideoElement} video - élément vidéo (muet, lecture automatique)
 * @param {(text:string, ok?:boolean)=>void} [onStatus]
 * @returns {{pushInit:Function, push:Function, reset:Function, end:Function, destroy:Function, latency:Function, seekRelative:Function, jumpToLive:Function, togglePause:Function, isStarted:Function}}
 */
export function createCameraPlayer(video, onStatus) {
  let mediaSource = null;
  let sourceBuffer = null;
  let objectUrl = null;
  let pending = []; // morceaux prêts à être poussés (SourceBuffer occupé ou en ouverture)
  let waiting = []; // morceaux reçus avant l'en-tête du flux
  let mimeType = '';
  let started = false;
  let gapCount = 0;
  let lastSeq = 0;
  let userPaused = false;

  const getMediaSourceCtor = () =>
    (typeof window !== 'undefined' && (window.MediaSource || window.ManagedMediaSource)) || null;

  const isSupported = () => !!getMediaSourceCtor();

  const detach = () => {
    pending = [];
    waiting = [];
    lastSeq = 0;
    userPaused = false;
    sourceBuffer = null;
    if (mediaSource && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream();
      } catch {
        // déjà terminé
      }
    }
    mediaSource = null;
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
      objectUrl = null;
    }
    if (video) {
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        // ignore
      }
    }
  };

  /** Libère les données déjà vues : sinon le navigateur garde tout le match. */
  const trim = () => {
    try {
      const buffered = sourceBuffer.buffered;
      if (!buffered.length || !video) return false;
      const start = buffered.start(0);
      const end = buffered.end(buffered.length - 1);
      if (end - start < TRIM_AFTER_S) return false;
      const keepFrom = Math.min((video.currentTime || 0) - KEEP_BEHIND_S, end);
      if (keepFrom <= start + GAP_S) return false;
      sourceBuffer.remove(start, keepFrom);
      return true;
    } catch {
      return false;
    }
  };

  /** La tête de lecture est-elle bloquée derrière un trou du flux ? */
  const skipGap = () => {
    try {
      if (userPaused) return false;
      const buffered = sourceBuffer.buffered;
      if (buffered.length < 2 || !video) return false;
      const t = video.currentTime || 0;
      for (let i = 0; i < buffered.length - 1; i += 1) {
        const within = t >= buffered.start(i) - 0.2 && t <= buffered.end(i) + 0.2;
        if (!within) continue;
        if (buffered.start(i + 1) - buffered.end(i) > GAP_S) {
          video.currentTime = buffered.start(i + 1);
          gapCount += 1;
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  /** Pousse les morceaux en attente quand le SourceBuffer est libre. */
  const drain = () => {
    if (!sourceBuffer || sourceBuffer.updating) return;
    // Purge : elle attend la fin de l'opération (updateend rappellera drain).
    if (trim()) return;
    // Recalage immédiat si la tête de lecture est bloquée derrière un trou.
    skipGap();

    const chunk = pending.shift();
    if (!chunk) {
      if (video && video.paused && !userPaused && sourceBuffer.buffered?.length) {
        const p = video.play?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return;
    }
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch {
      // Buffer plein ou donnée invalide : on vide et on reprend au suivant.
      try {
        if (sourceBuffer.buffered.length) sourceBuffer.remove(0, sourceBuffer.buffered.end(0));
      } catch {
        // ignore
      }
      gapCount += 1;
    }
  };

  /** Prépare le MediaSource pour un type MIME donné (appelé au 1er morceau). */
  const attach = (type) => {
    const MSCtor = getMediaSourceCtor();
    if (!video || !MSCtor || !isSupported()) {
      if (onStatus) onStatus('Lecture du flux caméra non supportée par ce navigateur.', false);
      return false;
    }
    mimeType = type || 'video/webm';
    if (started && mediaSource) return true;

    detach();
    mediaSource = new MSCtor();
    mediaSource.addEventListener('sourceopen', () => {
      if (!mediaSource) return;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.mode = 'segments';
        sourceBuffer.addEventListener('updateend', drain);
      } catch {
        if (onStatus) onStatus(`Flux vidéo illisible (${mimeType}).`, false);
        return;
      }
      drain();
    });
    objectUrl = URL.createObjectURL(mediaSource);
    video.src = objectUrl;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    const p = video.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    started = true;
    return true;
  };

  /** Reçoit l'en-tête du flux : sans lui, aucune image ne peut être décodée. */
  const pushInit = (data, type, seq = 1) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!bytes || !bytes.length) return;
    // Nouvelle source : on repart proprement. L'en-tête passe en premier
    // (ses images sont les plus anciennes), puis les morceaux déjà reçus.
    const waitingCopy = waiting;
    started = false;
    pending = [];
    waiting = [];
    if (!attach(type)) return;
    lastSeq = Number(seq) > 0 ? Number(seq) : 1;
    // Dans un vrai navigateur, `sourceopen` est asynchrone : `sourceBuffer`
    // n'existe pas encore à cette ligne. En plaçant `bytes` dans `pending`,
    // `drain()` les consommera dès l'ouverture du `sourceBuffer` (et tout de
    // suite si `sourceopen` est synchrone).
    pending.push(bytes, ...waitingCopy);
    drain();
  };

  /** Reçoit un morceau du serveur. */
  const push = (data, type, seq) => {
    if (!data) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!started) {
      // Le tout premier morceau du flux (seq === 1) porte l'en-tête WebM/MP4 :
      // on démarre la lecture immédiatement sans attendre 240 morceaux.
      if (seq === 1) {
        pushInit(bytes, type, 1);
        return;
      }
      // Tant que l'en-tête n'est pas arrivé, on met de côté : pousser un
      // morceau sans en-tête mettrait le lecteur en erreur.
      waiting.push(bytes);
      if (waiting.length > MAX_WAITING_CHUNKS) {
        // Repli : si l'en-tête ne vient pas, on tente sans lui.
        const queued = waiting;
        waiting = [];
        if (attach(type)) {
          pending.push(...queued);
          drain();
        }
      }
      return;
    }
    if (Number.isFinite(Number(seq)) && Number(seq) > 0) {
      if (Number(seq) <= lastSeq) return;
      lastSeq = Number(seq);
    }
    pending.push(bytes);
    drain();
  };

  /** Repart de zéro (nouvelle caméra, ou trou signalé par le serveur). */
  const reset = () => {
    started = false;
    detach();
  };

  /** Fin du flux : on laisse le lecteur finir proprement. */
  const end = () => {
    if (mediaSource && mediaSource.readyState === 'open' && !sourceBuffer?.updating) {
      try {
        mediaSource.endOfStream();
      } catch {
        // ignore
      }
    }
  };

  /** Retard approximatif du lecteur (secondes), pour l'affichage. */
  const latency = () => {
    try {
      const buffered = sourceBuffer?.buffered;
      if (!buffered || !buffered.length || !video) return 0;
      const end = buffered.end(buffered.length - 1);
      return Math.max(0, Math.round((end - video.currentTime) * 10) / 10);
    } catch {
      return 0;
    }
  };

  /** Contrôle DVR : recule ou avance dans la mémoire tampon du direct différé. */
  const seekRelative = (deltaSeconds) => {
    try {
      const buffered = sourceBuffer?.buffered;
      if (!buffered || !buffered.length || !video) return false;
      const start = buffered.start(0);
      const end = buffered.end(buffered.length - 1);
      const next = Math.max(start, Math.min(end - 0.05, (video.currentTime || 0) + Number(deltaSeconds || 0)));
      video.currentTime = next;
      return true;
    } catch {
      return false;
    }
  };

  /** Contrôle DVR : revient au point le plus récent du flux différé. */
  const jumpToLive = () => {
    try {
      const buffered = sourceBuffer?.buffered;
      if (!buffered || !buffered.length || !video) return false;
      const end = buffered.end(buffered.length - 1);
      video.currentTime = Math.max(0, end - 0.15);
      userPaused = false;
      const p = video.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  };

  /** Contrôle DVR : pause / reprise sur le flux différé. */
  const togglePause = () => {
    if (!video) return false;
    if (video.paused) {
      userPaused = false;
      const p = video.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return false;
    }
    userPaused = true;
    video.pause?.();
    return true;
  };

  return {
    pushInit,
    push,
    reset,
    end,
    destroy: detach,
    latency,
    gapCount: () => gapCount,
    seekRelative,
    jumpToLive,
    togglePause,
    isStarted: () => started,
  };
}

/**
 * Décode un morceau reçu par Socket.IO (ArrayBuffer ou base64) en Uint8Array.
 * Socket.IO transmet les ArrayBuffer tels quels ; on tolère aussi une chaîne.
 */
export function chunkToBytes(data) {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') {
    try {
      const bin = atob(data);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  return null;
}
