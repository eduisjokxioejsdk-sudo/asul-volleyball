import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DELAY_CHOICES } from '../../../services/liveCamera';
import useLiveCameraStream from '../hooks/useLiveCameraStream';

/**
 * Caméra du match « en grand », ouverte dans son propre onglet depuis le Banc :
 * - l'image occupe toute la fenêtre, avec un bouton plein écran ;
 * - mêmes commandes DVR que le direct (délai, -5 s, pause, +5 s, retour direct) ;
 * - aucune capture ici : la vidéo vient de l'appareil au rôle « Caméra ».
 */
export default function FastDirectCameraBigView({ session }) {
  const navigate = useNavigate();
  const stageRef = useRef(null);
  const camera = useLiveCameraStream(session.id, { enabled: true });
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.()?.catch?.(() => {});
      return;
    }
    stage.requestFullscreen?.()?.catch?.(() => {});
  }, []);

  const backToBench = useCallback(() => {
    const benchUrl = `/fast-direct/${session.id}?view=bench`;
    // Onglet ouvert par le Banc : on le referme ; sinon on revient au Banc.
    if (typeof window !== 'undefined' && window.opener) {
      window.close();
      window.setTimeout(() => navigate(benchUrl, { replace: true }), 250);
      return;
    }
    navigate(benchUrl, { replace: true });
  }, [navigate, session.id]);

  const handleTogglePause = () => setPaused(Boolean(camera.togglePause()));
  const handleJumpToLive = () => {
    setPaused(false);
    camera.jumpToLive();
  };

  const active = camera.camera.active;

  return (
    <div className="fast-direct-root min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2">
        <button
          type="button"
          onClick={backToBench}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-100"
          title="Fermer la caméra et revenir au Banc"
        >
          <ArrowLeft className="h-4 w-4" />
          Banc
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <Video className="h-5 w-5 text-rose-400" />
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">
              {session.team1_name} vs {session.team2_name}
            </div>
            <div className="truncate text-[11px] font-semibold text-slate-400">
              Caméra du match · {session.name} · code {session.join_code}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${
              active
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${active ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`}
            />
            {active ? `Direct · délai ${camera.camera.delay} s` : 'Caméra inactive'}
          </span>

          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 text-[11px] font-bold text-slate-300">
            Délai
            <select
              value={camera.camera.delay}
              onChange={(event) => camera.changeDelay(Number(event.target.value))}
              className="h-7 rounded-md border border-slate-700 bg-slate-800 px-1.5 text-xs font-black text-white"
              aria-label="Délai de la caméra"
            >
              {DELAY_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value} s
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-black text-slate-200 hover:bg-slate-800"
            title={fullscreen ? 'Quitter le plein écran' : 'Caméra en plein écran'}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? 'Réduire' : 'Plein écran'}
          </button>
        </div>
      </header>

      <main ref={stageRef} className="relative flex min-h-0 flex-1 flex-col bg-black">
        <video
          ref={camera.bindVideo}
          className="min-h-0 w-full flex-1 object-contain"
          playsInline
          muted
          autoPlay
        />

        {!active && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Video className="h-10 w-10 text-slate-700" />
            <p className="text-sm font-black text-slate-300">Aucune caméra active</p>
            <p className="max-w-md text-xs font-semibold text-slate-500">
              Ouvrez la session sur le téléphone avec le rôle « Caméra » : la vidéo apparaîtra ici
              automatiquement, avec le délai choisi.
            </p>
          </div>
        )}

        {/* Barre DVR : mêmes commandes que le direct DataVolley */}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-700/80 bg-slate-950/85 px-2 py-1.5 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => camera.seekRelative(-5)}
            disabled={!active}
            className="flex h-9 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-black text-slate-200 disabled:opacity-40"
            title="Reculer de 5 secondes"
          >
            <SkipBack className="h-4 w-4" /> -5 s
          </button>
          <button
            type="button"
            onClick={handleTogglePause}
            disabled={!active}
            className={`flex h-9 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-black disabled:opacity-40 ${
              paused
                ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                : 'border-slate-700 bg-slate-900 text-slate-200'
            }`}
            title={paused ? 'Reprendre la lecture' : 'Mettre la caméra en pause'}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? 'Lire' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => camera.seekRelative(5)}
            disabled={!active}
            className="flex h-9 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-black text-slate-200 disabled:opacity-40"
            title="Avancer de 5 secondes"
          >
            +5 s <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleJumpToLive}
            disabled={!active}
            className="flex h-9 items-center gap-1 rounded-xl border border-rose-500/50 bg-rose-500/15 px-2.5 text-[11px] font-black text-rose-200 disabled:opacity-40"
            title="Recoller au direct différé"
          >
            <RotateCcw className="h-4 w-4" /> Direct
          </button>
          {active && (
            <span className="px-1 text-[10px] font-bold text-slate-400">
              lecture {camera.latency} s
            </span>
          )}
        </div>

        {camera.message && (
          <p
            className={`absolute bottom-16 left-1/2 max-w-[92vw] -translate-x-1/2 rounded-lg bg-slate-950/85 px-3 py-1.5 text-center text-[11px] font-bold ${
              camera.message.ok ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {camera.message.text}
          </p>
        )}
      </main>
    </div>
  );
}
