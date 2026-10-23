// ============================================================================
// HOOK DUAL-SCREEN VIDEO (Point 20 — 100% Optionnel via BroadcastChannel).
//
// Permet d'ouvrir optionnellement une seconde fenêtre dédiée à la vidéo
// (`/video-popout`) et de synchroniser bidirectionnellement la lecture, le
// timecode, la vitesse et la source vidéo sans jamais imposer le second écran.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const CHANNEL_NAME = 'pancake_video_sync';

export function useDualScreenVideo({
  videoId = null,
  videoSrc = '',
  title = '',
  onRemoteSeek = null,
  onRemotePlayState = null,
} = {}) {
  const [popoutOpen, setPopoutOpen] = useState(false);
  const channelRef = useRef(null);
  const popoutWinRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.onmessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'POPOUT_READY') {
        setPopoutOpen(true);
        if (videoSrc) {
          ch.postMessage({
            type: 'LOAD_VIDEO',
            videoId,
            videoSrc,
            title,
          });
        }
      } else if (msg.type === 'POPOUT_CLOSED') {
        setPopoutOpen(false);
      } else if (msg.type === 'REMOTE_TIME' && typeof onRemoteSeek === 'function') {
        onRemoteSeek(msg.currentTime);
      } else if (msg.type === 'REMOTE_PLAY_STATE' && typeof onRemotePlayState === 'function') {
        onRemotePlayState(msg.playing);
      }
    };

    return () => {
      try {
        ch.close();
      } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [videoId, videoSrc, title, onRemoteSeek, onRemotePlayState]);

  useEffect(() => {
    if (channelRef.current && videoSrc) {
      channelRef.current.postMessage({
        type: 'LOAD_VIDEO',
        videoId,
        videoSrc,
        title,
      });
    }
  }, [videoId, videoSrc, title]);

  const openDetachedVideo = useCallback(
    (initialTime = 0) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams();
      if (videoId) params.set('videoId', String(videoId));
      if (videoSrc) params.set('src', String(videoSrc));
      if (title) params.set('title', String(title));
      if (initialTime > 0) params.set('t', String(Math.round(initialTime * 10) / 10));

      const url = `/video-popout?${params.toString()}`;
      const win = window.open(
        url,
        'PancakeAnalyzerVideoPopout',
        'width=1120,height=680,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
      );
      if (win) {
        popoutWinRef.current = win;
        setPopoutOpen(true);
      }
    },
    [videoId, videoSrc, title]
  );

  const closeDetachedVideo = useCallback(() => {
    try {
      if (popoutWinRef.current && !popoutWinRef.current.closed) {
        popoutWinRef.current.close();
      }
    } catch { /* ignore */ }
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'CLOSE_POPOUT' });
    }
    setPopoutOpen(false);
  }, []);

  const syncSeek = useCallback((timeSeconds) => {
    if (!channelRef.current || !Number.isFinite(Number(timeSeconds))) return;
    channelRef.current.postMessage({
      type: 'SEEK',
      currentTime: Number(timeSeconds),
    });
  }, []);

  const syncPlayPause = useCallback((playing) => {
    if (!channelRef.current) return;
    channelRef.current.postMessage({
      type: 'PLAY_PAUSE',
      playing: Boolean(playing),
    });
  }, []);

  const syncPlaybackRate = useCallback((rate) => {
    if (!channelRef.current || !Number.isFinite(Number(rate))) return;
    channelRef.current.postMessage({
      type: 'RATE',
      rate: Number(rate),
    });
  }, []);

  const syncOverlay = useCallback((overlayData) => {
    if (!channelRef.current) return;
    channelRef.current.postMessage({
      type: 'OVERLAY',
      overlay: overlayData,
    });
  }, []);

  const broadcastSync = useCallback(({ videoId: vId, src, currentTime, playing, playbackRate, title: t, overlay }) => {
    if (!channelRef.current) return;
    if (src) {
      channelRef.current.postMessage({
        type: 'LOAD_VIDEO',
        videoId: vId || videoId,
        videoSrc: src || videoSrc,
        title: t || title,
      });
    }
    if (Number.isFinite(Number(currentTime))) {
      channelRef.current.postMessage({ type: 'SEEK', currentTime: Number(currentTime) });
    }
    if (typeof playing === 'boolean') {
      channelRef.current.postMessage({ type: 'PLAY_PAUSE', playing });
    }
    if (Number.isFinite(Number(playbackRate))) {
      channelRef.current.postMessage({ type: 'RATE', rate: Number(playbackRate) });
    }
    if (overlay) {
      channelRef.current.postMessage({ type: 'OVERLAY', overlay });
    }
  }, [videoId, videoSrc, title]);

  const openSecondScreen = useCallback((opts = {}) => {
    openDetachedVideo();
    if (opts.src) {
      setTimeout(() => {
        broadcastSync(opts);
      }, 500);
    }
  }, [openDetachedVideo, broadcastSync]);

  return {
    popoutOpen,
    popoutActive: popoutOpen,
    openDetachedVideo,
    openSecondScreen,
    closeDetachedVideo,
    syncSeek,
    syncPlayPause,
    syncPlaybackRate,
    syncOverlay,
    broadcastSync,
  };
}

export default useDualScreenVideo;
