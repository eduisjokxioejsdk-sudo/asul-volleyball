// ============================================================================
// LECTEUR VIDÉO DÉTACHÉ SUR 2e ÉCRAN (Point 20 — /video-popout).
//
// S'ouvre uniquement lorsque l'utilisateur clique sur le bouton « 2e écran »
// de la barre d'outils vidéo. Synchronisé en temps réel avec la fenêtre de
// codage / consultation principale via BroadcastChannel('pancake_video_sync').
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatTimecode } from '../utils/datavolley';

const CHANNEL_NAME = 'pancake_video_sync';

export default function DetachedVideoPage() {
  const [searchParams] = useSearchParams();
  const [videoSrc, setVideoSrc] = useState(searchParams.get('src') || '');
  const [title, setTitle] = useState(searchParams.get('title') || 'Lecteur Vidéo Détaché (2e écran)');
  const [currentTime, setCurrentTime] = useState(Number(searchParams.get('t')) || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [overlay, setOverlay] = useState(null);
  const videoRef = useRef(null);
  const channelRef = useRef(null);
  const suppressEchoRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.postMessage({ type: 'POPOUT_READY' });

    ch.onmessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      const vid = videoRef.current;

      if (msg.type === 'LOAD_VIDEO') {
        if (msg.videoSrc) setVideoSrc(msg.videoSrc);
        if (msg.title) setTitle(msg.title);
      } else if (msg.type === 'SEEK' && vid && Number.isFinite(Number(msg.currentTime))) {
        suppressEchoRef.current = true;
        vid.currentTime = Number(msg.currentTime);
        setCurrentTime(Number(msg.currentTime));
        setTimeout(() => {
          suppressEchoRef.current = false;
        }, 80);
      } else if (msg.type === 'PLAY_PAUSE' && vid) {
        suppressEchoRef.current = true;
        if (msg.playing) {
          vid.play?.().catch(() => {});
        } else {
          vid.pause?.();
        }
        setTimeout(() => {
          suppressEchoRef.current = false;
        }, 80);
      } else if (msg.type === 'RATE' && vid && Number.isFinite(Number(msg.rate))) {
        vid.playbackRate = Number(msg.rate);
        setPlaybackRate(Number(msg.rate));
      } else if (msg.type === 'OVERLAY') {
        setOverlay(msg.overlay || null);
      } else if (msg.type === 'CLOSE_POPOUT') {
        window.close();
      }
    };

    const handleBeforeUnload = () => {
      try {
        ch.postMessage({ type: 'POPOUT_CLOSED' });
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      try {
        ch.postMessage({ type: 'POPOUT_CLOSED' });
        ch.close();
      } catch { /* ignore */ }
    };
  }, []);

  const stepFrame = (dir) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.pause?.();
    const next = Math.max(0, (vid.currentTime || 0) + dir * 0.04);
    vid.currentTime = next;
    setCurrentTime(next);
    channelRef.current?.postMessage({ type: 'REMOTE_TIME', currentTime: next });
  };

  const changeRate = (r) => {
    const vid = videoRef.current;
    if (vid) vid.playbackRate = r;
    setPlaybackRate(r);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Barre supérieure compacte */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          background: '#111827',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge" style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', fontWeight: 700 }}>
            🖥️ 2e Écran Synchronisé
          </span>
          <strong style={{ fontSize: 14 }}>{title}</strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#fbbf24', fontWeight: 700 }}>
            {formatTimecode(currentTime)}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => stepFrame(-1)} title="Image précédente (-0.04s)">
            ⏮ -1 img
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => stepFrame(1)} title="Image suivante (+0.04s)">
            +1 img ⏭
          </button>
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-sm ${playbackRate === r ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => changeRate(r)}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>

      {/* Zone vidéo plein écran */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            style={{ width: '100%', height: 'calc(100vh - 54px)', objectFit: 'contain' }}
            onLoadedMetadata={(e) => {
              const initT = Number(searchParams.get('t')) || 0;
              if (initT > 0) e.currentTarget.currentTime = initT;
            }}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setCurrentTime(t);
              if (!suppressEchoRef.current) {
                channelRef.current?.postMessage({ type: 'REMOTE_TIME', currentTime: t });
              }
            }}
            onPlay={() => {
              if (!suppressEchoRef.current) {
                channelRef.current?.postMessage({ type: 'REMOTE_PLAY_STATE', playing: true });
              }
            }}
            onPause={() => {
              if (!suppressEchoRef.current) {
                channelRef.current?.postMessage({ type: 'REMOTE_PLAY_STATE', playing: false });
              }
            }}
          />
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            En attente du flux vidéo depuis la fenêtre principale…
          </div>
        )}

        {/* Incrustation score / code en direct si envoyée */}
        {overlay && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              padding: '8px 14px',
              borderRadius: 10,
              background: 'rgba(15, 23, 42, 0.82)',
              border: '1px solid rgba(255,255,255,0.18)',
              pointerEvents: 'none',
              fontFamily: 'monospace',
            }}
          >
            {overlay.scoreText && <div style={{ fontWeight: 800, fontSize: 16 }}>{overlay.scoreText}</div>}
            {overlay.lastCode && <div style={{ color: '#38bdf8', fontSize: 13 }}>{overlay.lastCode}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
