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
 * `autoPlay` lance la vidéo dès qu'elle est prête (fichier local comme lien
 * YouTube) : la lecture est d'abord tentée avec le son, puis en muet si le
 * navigateur refuse la lecture automatique — le son revient au premier geste
 * de l'utilisateur (clic ou touche du clavier).
 * Expose une interface impérative identique à un élément <video> sur sa ref :
 *   - currentTime (lecture / écriture)
 *   - duration (lecture)
 *   - paused (lecture)
 *   - playbackRate (lecture / écriture)
 *   - play() / pause()
 *   - requestFullscreen()
 *
 * Les callbacks `onTimeUpdate` / `onSeeked` reçoivent le même genre d'événement
 * pour les deux lecteurs : les timecodes du codage restent justes après un
 * retour en arrière, y compris sur une vidéo YouTube.
 */
const SmartVideoPlayer = forwardRef(function SmartVideoPlayer(
  {
    src,
    youtubeUrl,
    controls = true,
    autoPlay = false,
    preload = 'auto',
    playsInline = true,
    muted = false,
    style,
    className,
    onTimeUpdate,
    onSeeked,
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
    // Déplacement demandé par l'application : le temps optimiste est conservé
    // tant que YouTube n'a pas appliqué le saut (seek asynchrone).
    seekingTo: null,
  });

  const callbacksRef = useRef({});
  callbacksRef.current = {
    onTimeUpdate,
    onSeeked,
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
          ytStateRef.current.seekingTo = { target: sec, at: Date.now() };
          const p = ytPlayerRef.current;
          if (p && ytReadyRef.current && typeof p.seekTo === 'function') {
            p.seekTo(sec, true);
            if (callbacksRef.current.onTimeUpdate) {
              callbacksRef.current.onTimeUpdate({ target: proxy, currentTarget: proxy });
            }
            if (callbacksRef.current.onSeeked) {
              callbacksRef.current.onSeeked({ target: proxy, currentTarget: proxy });
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
    let autoplayTimer = null;
    let unmuteOnGesture = null;
    ytReadyRef.current = false;

    const clearUnmuteOnGesture = () => {
      if (!unmuteOnGesture) return;
      window.removeEventListener('pointerdown', unmuteOnGesture);
      window.removeEventListener('keydown', unmuteOnGesture);
      unmuteOnGesture = null;
    };

    // Position lue directement sur le lecteur YouTube. La boucle tourne aussi
    // pendant une pause : un retour en arrière (curseur, bouton) ou un arrêt
    // doit immédiatement mettre à jour le timecode affiché et celui du codage.
    const emitTime = (force = false) => {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current || typeof p.getCurrentTime !== 'function') return;
      const t = Number(p.getCurrentTime());
      if (!Number.isFinite(t)) return;
      const d = typeof p.getDuration === 'function' ? Number(p.getDuration()) : 0;
      if (Number.isFinite(d) && d > 0) ytStateRef.current.duration = d;

      // Saut demandé par l'application : YouTube applique le `seekTo` de façon
      // asynchrone. Tant qu'il renvoie l'ancienne position, on conserve la
      // position demandée au lieu de réafficher l'ancienne.
      const guard = ytStateRef.current.seekingTo;
      if (guard) {
        const applied = Math.abs(t - guard.target) <= 0.75;
        if (!applied && Date.now() - guard.at < 1500) return;
        ytStateRef.current.seekingTo = null;
      }

      const delta = Math.abs(t - ytStateRef.current.currentTime);
      if (!force && delta < 0.04) return;
      ytStateRef.current.currentTime = t;
      const target = { currentTime: t, duration: ytStateRef.current.duration };
      if (callbacksRef.current.onTimeUpdate) {
        callbacksRef.current.onTimeUpdate({ target, currentTarget: target });
      }
      // Saut franc (curseur YouTube, retour en arrière) : on prévient comme le
      // ferait l'événement `seeked` d'un <video>.
      if (delta > 1.5 && callbacksRef.current.onSeeked) {
        callbacksRef.current.onSeeked({ target, currentTarget: target });
      }
    };

    // Boucle créée avant même l'API YouTube : elle ne fait rien tant que le
    // lecteur n'est pas prêt, mais elle ne peut pas être perdue si `onReady`
    // n'est pas émis.
    pollTimer = setInterval(() => emitTime(false), 100);

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT || !ytContainerRef.current) return;

      ytContainerRef.current.innerHTML = '';
      const mountEl = document.createElement('div');
      mountEl.style.width = '100%';
      mountEl.style.height = '100%';
      ytContainerRef.current.appendChild(mountEl);

      // Démarrage immédiat (autoPlay) : on demande la lecture avec le son ; si
      // le navigateur la refuse (aucune interaction préalable avec youtube.com),
      // la vidéo démarre en muet et le son revient au premier geste de
      // l'utilisateur — clic ou touche du clavier pendant le codage.
      function startPlayback() {
        try {
          player.playVideo();
        } catch {
          // Lecteur pas encore prêt : YouTube démarrera seul (playerVars.autoplay).
        }
        if (muted) return;
        if (autoplayTimer) clearTimeout(autoplayTimer);
        autoplayTimer = setTimeout(() => {
          if (cancelled || !ytReadyRef.current) return;
          const YTState = window.YT?.PlayerState || {};
          const state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : null;
          // Lecture démarrée (ou en tampon) : rien à faire. Mise en pause par
          // l'utilisateur entre-temps : on ne la relance pas de force.
          if (state === YTState.PLAYING || state === YTState.BUFFERING || state === YTState.PAUSED) return;
          if (typeof player.mute === 'function') player.mute();
          try {
            player.playVideo();
          } catch {
            // ignore
          }
          if (unmuteOnGesture) return;
          unmuteOnGesture = () => {
            clearUnmuteOnGesture();
            if (cancelled || !ytReadyRef.current) return;
            if (typeof player.unMute === 'function') player.unMute();
          };
          window.addEventListener('pointerdown', unmuteOnGesture);
          window.addEventListener('keydown', unmuteOnGesture);
        }, 1200);
      }

      const player = new YT.Player(mountEl, {
        width: '100%',
        height: '100%',
        videoId: youtubeId,
        playerVars: {
          controls: controls ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: playsInline ? 1 : 0,
          autoplay: autoPlay ? 1 : 0,
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

            if (autoPlay) startPlayback();
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const state = event.data;
            const YTState = window.YT?.PlayerState || {};
            // La position est relue à chaque changement d'état : une pause ou
            // une reprise juste après un déplacement affiche tout de suite le
            // bon timecode, sans attendre le tour suivant de la boucle.
            emitTime(true);
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
      if (autoplayTimer) clearTimeout(autoplayTimer);
      clearUnmuteOnGesture();
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
      }
      ytPlayerRef.current = null;
    };
  }, [useYouTube, youtubeId, controls, playsInline, muted, autoPlay]);

  // Lecture immédiate d'un fichier local : l'attribut `autoPlay` suffit la
  // plupart du temps, mais un navigateur peut refuser la lecture avec son.
  // Même repli que YouTube : démarrage en muet, son rendu au premier geste.
  useEffect(() => {
    if (!autoPlay || useYouTube) return undefined;
    const el = nativeVideoRef.current;
    if (!el) return undefined;

    let mutedByPolicy = false;
    const restoreSound = () => {
      if (!mutedByPolicy) return;
      mutedByPolicy = false;
      el.muted = muted;
      window.removeEventListener('pointerdown', restoreSound);
      window.removeEventListener('keydown', restoreSound);
    };

    // Chaque essai repart du son demandé (une source précédente a pu être mise
    // en muet par le repli ci-dessous).
    el.muted = muted;
    const attempt = el.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // Aucun média chargé : rien à démarrer, on n'arme pas le repli.
        if (!el.currentSrc && !el.getAttribute('src')) return;
        mutedByPolicy = true;
        el.muted = true;
        try {
          el.play();
        } catch {
          // ignore
        }
        window.addEventListener('pointerdown', restoreSound);
        window.addEventListener('keydown', restoreSound);
      });
    }

    return () => {
      window.removeEventListener('pointerdown', restoreSound);
      window.removeEventListener('keydown', restoreSound);
    };
  }, [autoPlay, useYouTube, src, youtubeUrl, muted]);

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
      autoPlay={autoPlay}
      preload={preload}
      playsInline={playsInline}
      muted={muted}
      style={style}
      className={className}
      onTimeUpdate={onTimeUpdate}
      onSeeked={onSeeked}
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
