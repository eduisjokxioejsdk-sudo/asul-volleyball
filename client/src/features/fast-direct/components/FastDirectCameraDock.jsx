import React, { useState } from 'react';
import { Video, X } from 'lucide-react';
import LiveCameraPanel from '../../../components/LiveCameraPanel';
import useLiveCameraStream from '../hooks/useLiveCameraStream';

/** Aperçu caméra escamotable sur le PC hôte ou l'appareil de distribution. */
export default function FastDirectCameraDock({ sessionId }) {
  const [open, setOpen] = useState(false);
  const camera = useLiveCameraStream(sessionId, { enabled: open });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-14 right-2 z-[95] flex h-10 items-center gap-1.5 rounded-xl border border-rose-500/50 bg-slate-950/95 px-3 text-[11px] font-black text-rose-200 shadow-xl"
      >
        <Video className="h-4 w-4" /> Caméra
      </button>
    );
  }

  return (
    <div className="fixed bottom-14 right-2 z-[95] w-[min(92vw,420px)] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-slate-800 px-2.5 py-1.5">
        <Video className="h-3.5 w-3.5 text-rose-400" />
        <span className="text-[11px] font-black text-white">Caméra du match</span>
        <span className="text-[10px] font-bold text-slate-500">
          {camera.camera.active ? `${camera.camera.delay} s` : 'inactive'}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Fermer l’aperçu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-[220px] bg-black">
        <LiveCameraPanel
          compact
          sessionId={sessionId}
          bindVideo={camera.bindVideo}
          active={camera.camera.active}
          delay={camera.camera.delay}
          canStartLocal={false}
          onSeekRelative={camera.seekRelative}
          onJumpToLive={camera.jumpToLive}
          onTogglePause={camera.togglePause}
          message={camera.message}
          extra={
            camera.camera.active ? (
              <span className="text-[10px] font-bold text-slate-400">
                lecture {camera.latency} s
              </span>
            ) : null
          }
        />
      </div>
    </div>
  );
}
