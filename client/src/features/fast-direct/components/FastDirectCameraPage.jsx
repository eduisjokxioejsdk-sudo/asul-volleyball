import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleCheck, CircleX, StopCircle, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { liveAPI } from '../../../services/api';
import { createSocket } from '../../../services/liveSocket';
import {
  cameraSupported,
  clampDelay,
  DEFAULT_DELAY_S,
  DELAY_CHOICES,
  startCameraCapture,
} from '../../../services/liveCamera';

/** Téléphone caméra Fast Direct : capture uniquement, comme dans le direct DataVolley. */
export default function FastDirectCameraPage({ session }) {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const captureRef = useRef(null);
  const videoRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delay, setDelay] = useState(DEFAULT_DELAY_S);
  const [stream, setStream] = useState(null);
  const [message, setMessage] = useState(null);
  const supported = cameraSupported();

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    const enter = () => {
      setConnected(true);
      socket.emit('live:join', session.id);
      socket.emit('live:camera-state', session.id);
    };
    socket.on('connect', enter);
    socket.on('disconnect', () => setConnected(false));
    socket.on('live:camera-state', (payload = {}) => {
      if (payload.cameraActive && Number.isFinite(Number(payload.delay))) {
        setDelay(clampDelay(Number(payload.delay)));
      }
    });

    liveAPI
      .getVideoState(session.id)
      .then((res) => {
        if (Number.isFinite(Number(res.data?.savedDelay))) {
          setDelay(clampDelay(Number(res.data.savedDelay)));
        }
      })
      .catch(() => {});

    return () => {
      captureRef.current?.stop?.();
      captureRef.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play?.().catch?.(() => {});
  }, [stream]);

  const start = async () => {
    if (!socketRef.current || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const capture = await startCameraCapture({
        socket: socketRef.current,
        sessionId: session.id,
        delay,
        onStream: setStream,
        onStatus: (text, ok) => setMessage({ text, ok }),
      });
      captureRef.current = capture;
      setActive(true);
    } catch (err) {
      setMessage({ text: err?.message || 'Caméra indisponible.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    captureRef.current?.stop?.();
    captureRef.current = null;
    setStream(null);
    setActive(false);
    setMessage({ text: 'Caméra arrêtée.', ok: false });
  };

  const changeDelay = async (value) => {
    const next = clampDelay(value);
    setDelay(next);
    try {
      await liveAPI.saveVideoDelay(session.id, next);
      setMessage({ text: `Délai vidéo réglé à ${next} s.`, ok: true });
    } catch {
      setMessage({ text: 'Délai non enregistré.', ok: false });
    }
  };

  return (
    <div className="fast-direct-root flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/fast-direct')}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold"
        >
          <ArrowLeft className="h-4 w-4" /> Quitter
        </button>
        <div>
          <div className="text-sm font-black text-white">Caméra Fast Direct</div>
          <div className="text-[11px] text-slate-400">
            {session.team1_name} · {session.team2_name} · code {session.join_code}
          </div>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black ${
            connected
              ? 'bg-emerald-500/15 text-emerald-200'
              : 'bg-rose-500/15 text-rose-200'
          }`}
        >
          {connected ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
          {connected ? 'Connecté' : 'Hors ligne'}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-700 bg-black">
          <video ref={videoRef} className="h-full w-full object-contain" playsInline muted autoPlay />
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-300">
              <Video className="h-10 w-10 text-rose-400" />
              <p className="text-sm font-bold">Aperçu de la caméra</p>
              <p className="text-xs text-slate-500">Appuyez sur « Démarrer la caméra ».</p>
            </div>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          {active ? (
            <button
              type="button"
              onClick={stop}
              disabled={busy}
              className="flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-black text-white"
            >
              <StopCircle className="h-4 w-4" /> Arrêter la caméra
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={busy || !connected || !supported}
              className="flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-black text-slate-950 disabled:opacity-40"
            >
              <Video className="h-4 w-4" /> {busy ? 'Démarrage…' : 'Démarrer la caméra'}
            </button>
          )}
          <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-300">
            Délai vidéo
            <select
              value={delay}
              onChange={(e) => changeDelay(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs font-black text-white"
            >
              {DELAY_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value} s
                </option>
              ))}
            </select>
          </label>
        </div>

        {message && (
          <p className={`text-center text-xs font-bold ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {message.text}
          </p>
        )}
        {!supported && (
          <p className="max-w-lg text-center text-xs text-amber-300">
            La caméra nécessite HTTPS ou l’ouverture depuis le PC hôte, avec l’autorisation caméra.
          </p>
        )}
        <p className="max-w-lg text-center text-xs text-slate-500">
          Posez le téléphone sur un support stable, objectif vers le terrain. La vidéo est rediffusée
          sur le PC hôte et la tablette du banc avec le délai choisi.
        </p>
      </main>
    </div>
  );
}
