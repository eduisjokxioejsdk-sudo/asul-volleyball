import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { extractYouTubeId } from '../utils/youtube';

let ytApiPromise = null;
function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') prevCallback();
      resolve(window.YT);
    };
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

/**
 * Lecteur vidéo universel compatible HTML5 <video> ET YouTube (public / non répertorié / live).
 * Expose une interface impérative identique à un élément <video> sur sa ref :
 *   - currentTime (lecture / écriture)
 *   - duration (lecture)
 *   - paused (lecture)
 *   - playbackRate (lecture / écriture)
 *   - play() / pause()
 *   - requestFullscreen()
 */
const SmartVideoPlayer = forwardRef(function SmartVideoPlayer(
  {
    src,
    youtubeUrl,
    controls = true,
    preload = 'auto',
    playsInline = true,
    muted = false,
    style,
    className,
    onTimeUpdate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onWaiting,
    onPlaying,
    onCanPlay,
    onError,
    onClick,
  },
  ref
) {
  const youtubeId = extractYouTubeId(youtubeUrl) || extractYouTubeId(src);
  const [localFailed, setLocalFailed] = useState(false);

  // Réinitialise l'état d'échec local quand la source change
  useEffect(() => {
    setLocalFailed(false);
  }, [src, youtubeUrl]);

  const useYouTube = Boolean(youtubeId && (!src || extractYouTubeId(src) || localFailed));

  const nativeVideoRef = useRef(null);
  const ytContainerRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const ytStateRef = useRef({
    currentTime: 0,
    duration: 0,
    paused: true,
    playbackRate: 1,
    pendingSeek: null,
  });

  const callbacksRef = useRef({});
  callbacksRef.current = {
    onTimeUpdate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onWaiting,
    onPlaying,
    onCanPlay,
    onError,
  };

  // Expose une interface unifiée sur `ref`
  useImperativeHandle(
    ref,
    () => {
      if (!useYouTube) {
        return nativeVideoRef.current;
      }
      const proxy = {
        get currentTime() {
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.getCurrentTime === 'function') {
            const t = Number(p.getCurrentTime());
            if (Number.isFinite(t)) ytStateRef.current.currentTime = t;
          }
          return ytStateRef.current.currentTime;
        },
        set currentTime(val) {
          const sec = Math.max(0, Number(val) || 0);
          ytStateRef.current.currentTime = sec;
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.seekTo === 'function') {
            p.seekTo(sec, true);
            if (callbacksRef.current.onTimeUpdate) {
              callbacksRef.current.onTimeUpdate({ target: proxy, currentTarget: proxy });
            }
          } else {
            ytStateRef.current.pendingSeek = sec;
          }
        },
        get duration() {
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.getDuration === 'function') {
            const d = Number(p.getDuration());
            if (Number.isFinite(d) && d > 0) ytStateRef.current.duration = d;
          }
          return ytStateRef.current.duration;
        },
        get paused() {
          return ytStateRef.current.paused;
        },
        get playbackRate() {
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.getPlaybackRate === 'function') {
            return Number(p.getPlaybackRate()) || ytStateRef.current.playbackRate || 1;
          }
          return ytStateRef.current.playbackRate || 1;
        },
        set playbackRate(rate) {
          const r = Number(rate) || 1;
          ytStateRef.current.playbackRate = r;
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.setPlaybackRate === 'function') {
            p.setPlaybackRate(r);
          }
        },
        play() {
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.playVideo === 'function') {
            p.playVideo();
          }
          return Promise.resolve();
        },
        pause() {
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.pauseVideo === 'function') {
            p.pauseVideo();
          }
        },
        requestFullscreen() {
          const el = ytContainerRef.current;
          if (el && el.requestFullscreen) return el.requestFullscreen();
          return Promise.resolve();
        },
      };
      return proxy;
    },
    [useYouTube, youtubeId]
  );

  // Cycle de vie du lecteur YouTube IFrame API
  useEffect(() => {
    if (!useYouTube || !youtubeId) return undefined;

    let cancelled = false;
    let pollTimer = null;
    ytReadyRef.current = false;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT || !ytContainerRef.current) return;

      ytContainerRef.current.innerHTML = '';
      const mountEl = document.createElement('div');
      mountEl.style.width = '100%';
      mountEl.style.height = '100%';
      ytContainerRef.current.appendChild(mountEl);

      const player = new YT.Player(mountEl, {
        width: '100%',
        height: '100%',
        videoId: youtubeId,
        playerVars: {
          controls: controls ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: playsInline ? 1 : 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            ytReadyRef.current = true;
            if (muted && typeof player.mute === 'function') player.mute();
            const dur = typeof player.getDuration === 'function' ? Number(player.getDuration()) || 0 : 0;
            ytStateRef.current.duration = dur;
            if (ytStateRef.current.pendingSeek != null) {
              player.seekTo(ytStateRef.current.pendingSeek, true);
              ytStateRef.current.currentTime = ytStateRef.current.pendingSeek;
              ytStateRef.current.pendingSeek = null;
            }
            const evtTarget = {
              currentTime: ytStateRef.current.currentTime,
              duration: dur,
            };
            if (callbacksRef.current.onLoadedMetadata) {
              callbacksRef.current.onLoadedMetadata({ target: evtTarget, currentTarget: evtTarget });
            }
            if (callbacksRef.current.onCanPlay) {
              callbacksRef.current.onCanPlay({ target: evtTarget, currentTarget: evtTarget });
            }

            pollTimer = setInterval(() => {
              if (!ytReadyRef.current || typeof player.getCurrentTime !== 'function') return;
              const t = Number(player.getCurrentTime());
              const d = typeof player.getDuration === 'function' ? Number(player.getDuration()) : 0;
              if (Number.isFinite(d) && d > 0) ytStateRef.current.duration = d;
              if (Number.isFinite(t) && Math.abs(t - ytStateRef.current.currentTime) >= 0.04) {
                ytStateRef.current.currentTime = t;
                if (callbacksRef.current.onTimeUpdate) {
                  const target = {
                    currentTime: t,
                    duration: ytStateRef.current.duration,
                  };
                  callbacksRef.current.onTimeUpdate({ target, currentTarget: target });
                }
              }
            }, 100);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const state = event.data;
            const YTState = window.YT?.PlayerState || {};
            if (state === YTState.PLAYING) {
              ytStateRef.current.paused = false;
              if (callbacksRef.current.onPlay) callbacksRef.current.onPlay(event);
              if (callbacksRef.current.onPlaying) callbacksRef.current.onPlaying(event);
            } else if (state === YTState.PAUSED || state === YTState.ENDED) {
              ytStateRef.current.paused = true;
              if (callbacksRef.current.onPause) callbacksRef.current.onPause(event);
            } else if (state === YTState.BUFFERING) {
              if (callbacksRef.current.onWaiting) callbacksRef.current.onWaiting(event);
            }
          },
          onError: (event) => {
            if (cancelled) return;
            if (callbacksRef.current.onError) callbacksRef.current.onError(event);
          },
        },
      });

      ytPlayerRef.current = player;
    });

    return () => {
      cancelled = true;
      ytReadyRef.current = false;
      if (pollTimer) clearInterval(pollTimer);
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
      }
      ytPlayerRef.current = null;
    };
  }, [useYouTube, youtubeId, controls, playsInline, muted]);

  if (useYouTube) {
    return (
      <div
        ref={ytContainerRef}
        className={className}
        onClick={onClick}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 280,
          aspectRatio: '16 / 9',
          background: '#000',
          ...style,
        }}
      />
    );
  }

  return (
    <video
      ref={nativeVideoRef}
      src={src}
      controls={controls}
      preload={preload}
      playsInline={playsInline}
      muted={muted}
      style={style}
      className={className}
      onTimeUpdate={onTimeUpdate}
      onLoadedMetadata={onLoadedMetadata}
      onPlay={onPlay}
      onPause={onPause}
      onWaiting={onWaiting}
      onPlaying={onPlaying}
      onCanPlay={onCanPlay}
      onClick={onClick}
      onError={(e) => {
        if (youtubeId && !localFailed) {
          setLocalFailed(true);
          return;
        }
        if (onError) onError(e);
      }}
    />
  );
});

export default SmartVideoPlayer;
