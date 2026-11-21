import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, CloudOff, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { liveAPI } from '../../../services/api';
import { createSocket } from '../../../services/liveSocket';
import {
  buildInitialVolleyStatsSeed,
  computeVolleyStatsDelta,
  mergeVolleyStatsStates,
} from '../utils/statsSync';

/**
 * Intègre « Stats Fast Direct » (Volley Stats) en direct dans une session Fast Direct.
 * - Mode `readOnly = false` (appareil Stats) : chaque saisie est synchronisée avec le serveur
 *   et diffusée aux autres appareils via Socket.IO (`fast-direct:stats-update`).
 * - Mode `readOnly = true` (tablette Banc) : consultation en direct, verrouillée en lecture seule.
 */
export default function FastDirectStatsPane({
  session,
  homeTeam = null,
  awayTeam = null,
  readOnly = false,
  active = true,
}) {
  const sessionId = session?.id || '';
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const iframeReadyRef = useRef(false);
  const clientIdRef = useRef(
    `fdstats_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );

  const revisionRef = useRef(0);
  const remoteStateRef = useRef(null);
  const pushInFlightRef = useRef(false);
  const pullInFlightRef = useRef(false);
  const pushTimerRef = useRef(null);

  const pendingRef = useRef({
    hasPending: false,
    basePrevState: null,
    latestState: null,
    forceReplace: false,
  });

  const [status, setStatus] = useState(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing'
  );
  const [revision, setRevision] = useState(0);
  const [updatedBy, setUpdatedBy] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const seed = useMemo(
    () => buildInitialVolleyStatsSeed(session, homeTeam, awayTeam),
    [session, homeTeam, awayTeam]
  );
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const iframeUrl = useMemo(() => {
    const base = import.meta.env?.BASE_URL || '/';
    const mode = readOnly ? 'bench' : 'live';
    return `${base}stats-fast-direct/index.html?mode=${mode}&session=${encodeURIComponent(
      sessionId
    )}&theme=dark`;
  }, [readOnly, sessionId]);

  const postToIframe = useCallback(
    (payload) => {
      if (typeof window === 'undefined' || !iframeReadyRef.current) return;
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage({ ...payload, sessionId }, window.location.origin);
      } catch {
        // ignore cross-frame errors during unmount
      }
    },
    [sessionId]
  );

  const applyRemoteSnapshot = useCallback(
    (nextState, nextRev) => {
      const cleanRev = Number(nextRev ?? nextState?.revision) || 0;
      revisionRef.current = cleanRev;
      remoteStateRef.current = nextState || null;
      setRevision(cleanRev);
      setUpdatedBy(nextState?.updatedByName || '');
      if (nextState) {
        postToIframe({
          type: 'fd-stats:remote-state',
          state: nextState,
          revision: cleanRev,
        });
      }
    },
    [postToIframe]
  );

  const flushPushQueue = useCallback(async () => {
    if (readOnly || !sessionId) return;
    if (pushInFlightRef.current || !pendingRef.current.hasPending) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return;
    }

    pushInFlightRef.current = true;
    setStatus('syncing');

    try {
      while (pendingRef.current.hasPending) {
        const op = {
          basePrevState: pendingRef.current.basePrevState,
          latestState: pendingRef.current.latestState,
          forceReplace: pendingRef.current.forceReplace,
        };
        pendingRef.current = {
          hasPending: false,
          basePrevState: null,
          latestState: null,
          forceReplace: false,
        };

        const baseRevision = revisionRef.current;
        try {
          const res = await liveAPI.saveFastDirectStatsState(sessionId, {
            state: op.latestState,
            baseRevision,
            clientId: clientIdRef.current,
          });
          const savedRev = Number(res.data?.revision) || baseRevision + 1;
          const savedState = res.data?.state || op.latestState;
          revisionRef.current = savedRev;
          remoteStateRef.current = savedState;
          setRevision(savedRev);
          setUpdatedBy(res.data?.updatedByName || savedState?.updatedByName || '');
          setErrorMsg('');
        } catch (err) {
          if (err?.response?.status === 409 && err.response.data?.state) {
            const remote = err.response.data.state;
            const remoteRev = Number(err.response.data.revision) || Number(remote.revision) || 0;
            const delta = computeVolleyStatsDelta(op.basePrevState, op.latestState);
            const merged = mergeVolleyStatsStates(remote, op.latestState, delta, op.forceReplace);
            const retry = await liveAPI.saveFastDirectStatsState(sessionId, {
              state: merged,
              baseRevision: remoteRev,
              clientId: clientIdRef.current,
            });
            const retryRev = Number(retry.data?.revision) || remoteRev + 1;
            const retryState = retry.data?.state || merged;
            revisionRef.current = retryRev;
            remoteStateRef.current = retryState;
            setRevision(retryRev);
            setUpdatedBy(retry.data?.updatedByName || retryState?.updatedByName || '');
            setErrorMsg('');
            if (!pendingRef.current.hasPending) {
              postToIframe({
                type: 'fd-stats:remote-state',
                state: retryState,
                revision: retryRev,
              });
            }
          } else {
            // Restaurer l'opération en file pour retry ultérieur
            pendingRef.current = {
              hasPending: true,
              basePrevState: op.basePrevState,
              latestState: pendingRef.current.hasPending
                ? pendingRef.current.latestState
                : op.latestState,
              forceReplace: Boolean(op.forceReplace || pendingRef.current.forceReplace),
            };
            throw err;
          }
        }
      }

      setStatus('synced');
    } catch (err) {
      setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      setErrorMsg(err?.response?.data?.error || err?.message || 'Erreur de synchronisation stats.');
    } finally {
      pushInFlightRef.current = false;
    }
  }, [postToIframe, readOnly, sessionId]);

  const scheduleFlush = useCallback(
    (delayMs = 120) => {
      if (typeof window === 'undefined') return;
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = window.setTimeout(() => {
        pushTimerRef.current = null;
        flushPushQueue();
      }, delayMs);
    },
    [flushPushQueue]
  );

  const loadFromServer = useCallback(
    async ({ silent = true } = {}) => {
      if (!sessionId || pullInFlightRef.current) return;
      if (pendingRef.current.hasPending) {
        await flushPushQueue();
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setStatus('offline');
        return;
      }
      pullInFlightRef.current = true;
      if (!silent) setStatus('syncing');
      try {
        const res = await liveAPI.getFastDirectStatsState(sessionId);
        const nextState = res.data?.state || null;
        const nextRev = Number(res.data?.revision ?? nextState?.revision) || 0;
        if (nextState && nextRev !== revisionRef.current) {
          applyRemoteSnapshot(nextState, nextRev);
        } else if (!nextState && iframeReadyRef.current) {
          postToIframe({ type: 'fd-stats:seed', seed: seedRef.current });
        }
        setErrorMsg('');
        setStatus('synced');
      } catch (err) {
        setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
        setErrorMsg(err?.response?.data?.error || 'Connexion aux stats indisponible.');
      } finally {
        pullInFlightRef.current = false;
      }
    },
    [applyRemoteSnapshot, flushPushQueue, postToIframe, sessionId]
  );

  // Écoute des messages postMessage provenant de l'iframe Volley Stats
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionId) return undefined;

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.sessionId !== sessionId) return;

      if (data.type === 'fd-stats:ready') {
        iframeReadyRef.current = true;
        if (pendingRef.current.hasPending && pendingRef.current.latestState) {
          postToIframe({
            type: 'fd-stats:remote-state',
            state: pendingRef.current.latestState,
            revision: revisionRef.current,
          });
        } else if (remoteStateRef.current) {
          postToIframe({
            type: 'fd-stats:remote-state',
            state: remoteStateRef.current,
            revision: revisionRef.current,
          });
        } else {
          postToIframe({ type: 'fd-stats:seed', seed: seedRef.current });
          loadFromServer({ silent: true });
        }
      } else if (data.type === 'fd-stats:change' && !readOnly && data.state) {
        const cur = pendingRef.current;
        pendingRef.current = {
          hasPending: true,
          basePrevState: cur.hasPending ? cur.basePrevState : data.prevState || remoteStateRef.current || {},
          latestState: data.state,
          forceReplace: Boolean(cur.forceReplace || data.forceReplace),
        };
        scheduleFlush(data.forceReplace ? 20 : 120);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [loadFromServer, postToIframe, readOnly, scheduleFlush, sessionId]);

  // Si les fiches d'équipes arrivent après l'initialisation et aucune action distante n'existe encore
  useEffect(() => {
    if (!remoteStateRef.current && !pendingRef.current.hasPending && iframeReadyRef.current) {
      postToIframe({ type: 'fd-stats:seed', seed });
    }
  }, [postToIframe, seed]);

  // Temps réel Socket.IO + polling de secours + reconnexion réseau
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionId) return undefined;

    loadFromServer({ silent: false });
    const socket = createSocket();

    const enter = () => {
      socket.emit('live:join', sessionId);
      loadFromServer({ silent: true });
    };
    const onStatsUpdate = (payload = {}) => {
      if (payload.clientId && payload.clientId === clientIdRef.current) return;
      if (Number(payload.revision) !== revisionRef.current) {
        loadFromServer({ silent: true });
      }
    };
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        loadFromServer({ silent: true });
      }
    };
    const onOnline = () => loadFromServer({ silent: false });
    const onOffline = () => setStatus('offline');

    socket.on('connect', enter);
    socket.on('fast-direct:stats-update', onStatsUpdate);
    const intervalId = window.setInterval(() => loadFromServer({ silent: true }), 5000);

    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
      window.clearInterval(intervalId);
      socket.off('connect', enter);
      socket.off('fast-direct:stats-update', onStatsUpdate);
      socket.disconnect();
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadFromServer, sessionId]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onFs = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el || typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen?.();
      } else {
        await el.requestFullscreen?.();
      }
    } catch {
      // ignore fullscreen restrictions on iOS
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 flex-col bg-slate-950 ${active ? '' : 'hidden'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black ${
              status === 'offline' || status === 'error'
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                : status === 'syncing'
                  ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                  : 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
            }`}
          >
            {status === 'offline' || status === 'error' ? (
              <CloudOff className="h-3.5 w-3.5" />
            ) : status === 'syncing' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
            {status === 'offline'
              ? 'Hors-ligne'
              : status === 'error'
                ? 'Reconnexion stats…'
                : status === 'syncing'
                  ? 'Synchro stats…'
                  : `Stats en direct · v${revision}`}
          </span>
          {updatedBy && (
            <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">
              Dernière saisie : {updatedBy}
            </span>
          )}
          {readOnly && (
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-200">
              Consultation seule
            </span>
          )}
          {errorMsg && (
            <span className="text-[11px] font-bold text-rose-300">{errorMsg}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => loadFromServer({ silent: false })}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
            title="Synchroniser maintenant"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => {
              iframeReadyRef.current = false;
              setReloadKey((k) => k + 1);
            }}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
            title="Recharger l'affichage Stats"
          >
            Recharger
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden h-8 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 sm:flex"
            title={isFullscreen ? 'Quitter le plein écran' : 'Afficher en plein écran'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <iframe
        key={reloadKey}
        ref={iframeRef}
        title={readOnly ? 'Stats du match (Banc)' : 'Stats Fast Direct (Volley Stats)'}
        src={iframeUrl}
        onLoad={() => {
          iframeReadyRef.current = true;
          if (pendingRef.current.hasPending && pendingRef.current.latestState) {
            postToIframe({
              type: 'fd-stats:remote-state',
              state: pendingRef.current.latestState,
              revision: revisionRef.current,
            });
          } else if (remoteStateRef.current) {
            postToIframe({
              type: 'fd-stats:remote-state',
              state: remoteStateRef.current,
              revision: revisionRef.current,
            });
          } else {
            postToIframe({ type: 'fd-stats:seed', seed: seedRef.current });
          }
        }}
        className="w-full flex-1 border-0 bg-[#0b1220]"
        style={{ minHeight: readOnly ? 'calc(100vh - 150px)' : 'calc(100vh - 108px)' }}
      />
    </div>
  );
}
