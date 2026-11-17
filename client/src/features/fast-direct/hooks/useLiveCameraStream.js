import { useCallback, useEffect, useRef, useState } from 'react';
import { liveAPI } from '../../../services/api';
import { createSocket } from '../../../services/liveSocket';
import { createCameraPlayer, chunkToBytes } from '../../../services/liveCameraPlayer';
import { DEFAULT_DELAY_S, clampDelay } from '../../../services/liveCamera';

/**
 * Flux caméra différé partagé par le Banc Fast Direct et les écrans de
 * consultation. Il ne démarre aucune capture : il rejoint la caméra de la
 * session et expose les mêmes commandes DVR que le direct DataVolley.
 */
export default function useLiveCameraStream(sessionId, { enabled = true } = {}) {
  const socketRef = useRef(null);
  const playerRef = useRef(null);
  const [camera, setCamera] = useState({
    active: false,
    delay: DEFAULT_DELAY_S,
    savedDelay: DEFAULT_DELAY_S,
    mimeType: '',
  });
  const [latency, setLatency] = useState(0);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!enabled || !sessionId) return undefined;
    const socket = createSocket();
    socketRef.current = socket;

    const enter = () => {
      socket.emit('live:join', sessionId);
      socket.emit('live:camera-state', sessionId);
    };
    socket.on('connect', enter);
    socket.on('live:camera-joined', ({ mimeType, delay } = {}) => {
      setCamera((prev) => ({
        ...prev,
        active: true,
        mimeType: mimeType || prev.mimeType,
        delay: Number.isFinite(Number(delay)) ? Number(delay) : prev.delay,
      }));
      playerRef.current?.reset?.();
    });
    socket.on('live:camera-left', () => {
      setCamera((prev) => ({ ...prev, active: false }));
      playerRef.current?.end?.();
    });
    socket.on('live:video-ready', ({ seq, data, mimeType } = {}) => {
      const bytes = chunkToBytes(data);
      if (bytes) playerRef.current?.push(bytes, mimeType, seq);
    });
    socket.on('live:video-init', ({ data, mimeType, delay } = {}) => {
      const bytes = chunkToBytes(data);
      if (bytes) playerRef.current?.pushInit(bytes, mimeType);
      if (Number.isFinite(Number(delay))) {
        setCamera((prev) => ({ ...prev, delay: Number(delay) }));
      }
    });
    socket.on('live:video-gap', () => playerRef.current?.reset?.());
    socket.on('live:camera-state', (payload = {}) => {
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      setCamera((prev) => ({
        ...prev,
        active: !!payload.cameraActive,
        mimeType: payload.mimeType || prev.mimeType,
        delay:
          payload.cameraActive && Number.isFinite(Number(payload.delay))
            ? Number(payload.delay)
            : prev.delay,
      }));
    });
    socket.on('live:video-delay', ({ delay }) => {
      if (Number.isFinite(Number(delay))) {
        setCamera((prev) => ({ ...prev, delay: Number(delay), savedDelay: Number(delay) }));
      }
    });

    liveAPI
      .getVideoState(sessionId)
      .then((res) => {
        const saved = clampDelay(Number(res.data?.savedDelay));
        setCamera((prev) => ({
          ...prev,
          active: !!res.data?.cameraActive,
          mimeType: res.data?.mimeType || prev.mimeType,
          savedDelay: saved,
          delay: saved,
        }));
      })
      .catch(() => {});

    return () => {
      socket.disconnect();
      socketRef.current = null;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [enabled, sessionId]);

  useEffect(() => {
    if (!camera.active) return undefined;
    const timer = setInterval(() => setLatency(playerRef.current?.latency?.() || 0), 1000);
    return () => clearInterval(timer);
  }, [camera.active]);

  const bindVideo = useCallback(
    (el) => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
      if (!el) return;
      playerRef.current = createCameraPlayer(el, (text, ok) => setMessage({ text, ok }));
      socketRef.current?.emit('live:camera-state', sessionId);
    },
    [sessionId]
  );

  const changeDelay = useCallback(
    async (seconds) => {
      const next = clampDelay(seconds);
      setCamera((prev) => ({ ...prev, delay: next, savedDelay: next }));
      try {
        const res = await liveAPI.saveVideoDelay(sessionId, next);
        const saved = clampDelay(Number(res.data?.delay ?? next));
        setCamera((prev) => ({ ...prev, delay: saved, savedDelay: saved }));
        setMessage({ text: `Délai vidéo réglé à ${saved} s.`, ok: true });
        return saved;
      } catch (err) {
        setMessage({
          text: err?.response?.data?.error || 'Délai vidéo non enregistré.',
          ok: false,
        });
        return null;
      }
    },
    [sessionId]
  );

  return {
    camera,
    latency,
    message,
    bindVideo,
    changeDelay,
    seekRelative: (delta) => playerRef.current?.seekRelative?.(delta),
    jumpToLive: () => playerRef.current?.jumpToLive?.(),
    togglePause: () => playerRef.current?.togglePause?.() ?? false,
  };
}
