import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, LogOut, Tablet, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LiveCameraPanel from '../../components/LiveCameraPanel';
import { startCameraCapture } from '../../services/liveCamera';
import { createSocket } from '../../services/liveSocket';
import FastDirectWorkspace from './FastDirectWorkspace';
import FastDirectStatsPane from './components/FastDirectStatsPane';
import FastDirectJoinLinks from './components/FastDirectJoinLinks';
import FastDirectCameraDock from './components/FastDirectCameraDock';
import useLiveCameraStream from './hooks/useLiveCameraStream';

/**
 * Espace unifié de l'appareil « Stats » (et hôte) :
 * - Tous les onglets accessibles en direct : Distribution, Autres stats, Caméra.
 * - Distribution et Autres stats restent montés en continu pour basculer sans rechargement.
 */
export default function FastDirectStatsShell({
  session,
  user,
  initialData = null,
  homeTeam = null,
  awayTeam = null,
  onLogout = null,
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('distribution'); // 'distribution' | 'stats' | 'camera'
  const camera = useLiveCameraStream(session.id, { enabled: true });

  // Capture locale optionnelle depuis ce poste depuis l'onglet Caméra
  const captureSocketRef = useRef(null);
  const captureRef = useRef(null);
  const [localActive, setLocalActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState(null);

  useEffect(() => {
    return () => {
      captureRef.current?.stop?.();
      captureRef.current = null;
      captureSocketRef.current?.disconnect?.();
      captureSocketRef.current = null;
    };
  }, [session.id]);

  const handleStartLocalCamera = async (deviceId = '') => {
    if (cameraBusy || typeof window === 'undefined') return;
    setCameraBusy(true);
    setLocalMessage(null);
    try {
      const sock = createSocket();
      captureSocketRef.current = sock;
      await new Promise((resolve) => {
        if (sock.connected) {
          sock.emit('live:join', session.id);
          resolve();
          return;
        }
        const onConnect = () => {
          sock.emit('live:join', session.id);
          resolve();
        };
        sock.once('connect', onConnect);
        window.setTimeout(resolve, 1500);
      });

      const capture = await startCameraCapture({
        socket: sock,
        sessionId: session.id,
        delay: camera.camera.delay,
        deviceId: typeof deviceId === 'string' ? deviceId : '',
        onStatus: (text, ok) => setLocalMessage({ text, ok }),
      });
      captureRef.current = capture;
      setLocalActive(true);
    } catch (err) {
      captureSocketRef.current?.disconnect?.();
      captureSocketRef.current = null;
      setLocalMessage({ text: err?.message || 'Caméra locale indisponible.', ok: false });
    } finally {
      setCameraBusy(false);
    }
  };

  const handleStopLocalCamera = () => {
    captureRef.current?.stop?.();
    captureRef.current = null;
    captureSocketRef.current?.disconnect?.();
    captureSocketRef.current = null;
    setLocalActive(false);
    setLocalMessage({ text: 'Caméra arrêtée.', ok: false });
  };

  const cameraOnline = camera.camera.active || localActive;

  return (
    <div className="fast-direct-root min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* BARRE SUPÉRIEURE GLOBALE : Appareil Stats (3 onglets + liens d'invitation) */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/fast-direct')}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
              title="Retour aux sessions Fast Direct"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Quitter</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-black text-white">
                  {session.name || 'Fast Direct'}
                </span>
                <span className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-300">
                  Stats
                </span>
              </div>
              <div className="truncate text-[11px] font-semibold text-slate-400">
                {session.team1_name} vs {session.team2_name} · code {session.join_code}
              </div>
            </div>
          </div>

          {/* 3 ONGLETS PRINCIPAUX ACCESSIBLES SUR CHAQUE APPAREIL STATS */}
          <nav className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            <button
              type="button"
              onClick={() => setMode('distribution')}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition ${
                mode === 'distribution'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Tablet className="h-4 w-4" />
              Distribution
            </button>
            <button
              type="button"
              onClick={() => setMode('stats')}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition ${
                mode === 'stats'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Autres stats
            </button>
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition ${
                mode === 'camera'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Video className="h-4 w-4" />
              Caméra
              <span
                className={`h-2 w-2 rounded-full ${
                  cameraOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <FastDirectJoinLinks session={session} />
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex h-9 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                title="Déconnexion"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Déconnexion</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ONGLET 1 : DISTRIBUTION (pancake-distribution exact) */}
      <div className={mode === 'distribution' ? 'flex flex-1 flex-col' : 'hidden'}>
        <FastDirectWorkspace
          key={session.id}
          session={session}
          user={user}
          initialData={initialData}
          embedded
        />
      </div>

      {/* ONGLET 2 : AUTRES STATS (stats-fast-direct synchronisé en direct) */}
      <FastDirectStatsPane
        session={session}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        readOnly={false}
        active={mode === 'stats'}
      />

      {/* ONGLET 3 : CAMÉRA GRAND FORMAT + DVR + CAPTURE LOCALE OPTIONNELLE */}
      {mode === 'camera' && (
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 p-4">
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-3 min-h-[520px]">
            <LiveCameraPanel
              sessionId={session.id}
              bindVideo={camera.bindVideo}
              active={camera.camera.active}
              delay={camera.camera.delay}
              canChangeDelay
              onDelayChange={camera.changeDelay}
              canStartLocal
              localActive={localActive}
              cameraBusy={cameraBusy}
              onStartLocal={handleStartLocalCamera}
              onStopLocal={handleStopLocalCamera}
              onSeekRelative={camera.seekRelative}
              onJumpToLive={camera.jumpToLive}
              onTogglePause={camera.togglePause}
              message={localMessage || camera.message}
              extra={
                camera.camera.active ? (
                  <span className="text-[11px] font-bold text-slate-400">
                    lecture {camera.latency} s
                  </span>
                ) : null
              }
            />
          </div>
        </main>
      )}

      {/* APERÇU CAMÉRA FLOTTANT SUR DISTRIBUTION ET AUTRES STATS */}
      {mode !== 'camera' && <FastDirectCameraDock sessionId={session.id} />}
    </div>
  );
}
