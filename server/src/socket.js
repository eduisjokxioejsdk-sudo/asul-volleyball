// ============================================================================
// Socket.IO : diffusion temps réel des actions d'une session live entre les
// appareils connectés (PC statisticiens + tablettes en lecture seule).
//
// Il porte aussi le flux caméra : le téléphone (rôle « caméra ») envoie des
// morceaux vidéo, le serveur les stocke dans un buffer (liveStream) et les
// rediffuse aux autres appareils avec le délai configuré.
// ============================================================================

const stream = require('./liveStream');
const liveRecord = require('./liveRecord');

let io = null;

/** Émetteur lié à une session : sert au buffer pour rediffuser la vidéo. */
function emitterFor(sessionId) {
  return (event, payload) => {
    if (!io) return;
    io.to(`live:${sessionId}`).emit(event, payload);
  };
}

function initSocket(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: true, credentials: true },
    // Les morceaux vidéo arrivent en binaire : on autorise de gros messages.
    maxHttpBufferSize: 8 * 1024 * 1024,
  });

  io.on('connection', (socket) => {
    socket.on('live:join', (sessionId) => {
      if (typeof sessionId === 'string' && sessionId) {
        socket.join(`live:${sessionId}`);
        // Un appareil qui rejoint une session déjà filmée apprend tout de suite
        // qu'une caméra diffuse (état du flux + délai en cours).
        const state = stream.streamState(sessionId);
        if (state.cameraActive) {
          socket.emit('live:camera-joined', { mimeType: state.mimeType, delay: state.delay });
        }
      }
    });

    socket.on('live:leave', (sessionId) => {
      if (typeof sessionId === 'string' && sessionId) {
        socket.leave(`live:${sessionId}`);
      }
    });

    // --- Caméra ------------------------------------------------------------
    // Le téléphone annonce le début de la diffusion (type MIME + délai voulu).
    socket.on('live:camera-start', (payload = {}) => {
      const { sessionId, mimeType, delay } = payload;
      if (typeof sessionId !== 'string' || !sessionId) return;
      socket.join(`live:${sessionId}`);
      socket.data.cameraSession = sessionId;
      const state = stream.cameraStarted(sessionId, {
        mimeType,
        delay,
        emit: emitterFor(sessionId),
      });
      // Le flux est aussi enregistré sur disque pour un replay ultérieur.
      liveRecord.startRecording(sessionId, { mimeType });
      socket.emit('live:camera-ack', state);
    });

    // Morceau vidéo : il est bufferisé puis rediffusé avec le délai configuré.
    socket.on('live:video-chunk', (payload = {}) => {
      const { sessionId, data, mimeType } = payload;
      if (typeof sessionId !== 'string' || !sessionId || !data) return;
      const buf = Buffer.from(data);
      stream.writeChunk(sessionId, buf, mimeType);
      liveRecord.writeRecordingChunk(sessionId, buf);
    });

    // Le téléphone arrête la diffusion.
    socket.on('live:camera-stop', (payload = {}) => {
      const sessionId = typeof payload === 'string' ? payload : payload.sessionId;
      if (typeof sessionId !== 'string' || !sessionId) return;
      stream.cameraStopped(sessionId);
      liveRecord.stopRecording(sessionId);
      if (socket.data.cameraSession === sessionId) delete socket.data.cameraSession;
    });

    // Un appareil demande l'état du flux (caméra active ? délai ?). S'il y a
    // une caméra en cours, on lui renvoie aussi l'en-tête du flux : il en a
    // besoin pour décoder la vidéo, quelle que soit son heure d'arrivée.
    socket.on('live:camera-state', (sessionId) => {
      if (typeof sessionId !== 'string' || !sessionId) return;
      socket.emit('live:camera-state', { sessionId, ...stream.streamState(sessionId) });
      const init = stream.initChunk(sessionId);
      if (init) {
        socket.emit('live:video-init', {
          seq: init.seq,
          data: init.data,
          mimeType: init.mimeType,
          delay: stream.streamState(sessionId).delay,
        });
      }
    });

    // Si la caméra se déconnecte sans prévenir, on libère le flux.
    socket.on('disconnect', () => {
      const sessionId = socket.data.cameraSession;
      if (sessionId) {
        stream.cameraStopped(sessionId);
        liveRecord.stopRecording(sessionId);
        delete socket.data.cameraSession;
      }
    });

    // Dès qu'un appareil se connecte, on lui signale de rafraîchir les équipes
    // partagées (elles sont globales, pas privées par utilisateur).
    socket.emit('teams:changed', { at: Date.now() });
  });

  return io;
}

/** Diffuse un événement à tous les appareils connectés à la session. */
function emitToSession(sessionId, event, payload) {
  if (!io || !sessionId) return;
  io.to(`live:${sessionId}`).emit(event, payload);
}

/** Signale à tous les appareils connectés que les équipes partagées ont changé. */
function emitTeamsChanged() {
  if (!io) return;
  io.emit('teams:changed', { at: Date.now() });
}

/** Signale à tous les appareils connectés qu'une collection partagée a changé. */
function emitCollectionChanged(key) {
  if (!io) return;
  io.emit(`${key}:changed`, { at: Date.now() });
}

module.exports = { initSocket, emitToSession, emitTeamsChanged, emitCollectionChanged };
