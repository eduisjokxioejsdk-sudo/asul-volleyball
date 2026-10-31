// ============================================================================
// Panneau « Caméra du match » (Data Volley 4 Live Video & Time-Shift DVR) :
// - Affiche le flux vidéo différé reçu du serveur (voir services/liveCameraPlayer)
//   ou un flux réseau direct (caméra IP / HTTP) ;
// - Permet au statisticien sur son PC de démarrer directement une caméra locale
//   (webcam USB, carte d'acquisition HDMI/CamLink, OBS Virtual Camera) sans
//   avoir besoin d'un second appareil dédié ;
// - Offre les contrôles DVR en direct : Rembobiner (-5s), Pause/Lecture,
//   Avancer (+5s) et Recoller au direct différé ;
// - Peut accueillir en surimpression le bandeau TV Score et la grille 3D
//   homographique (calibration 4 coins) pour cliquer les zones sur la vidéo.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { DELAY_CHOICES, cameraSupported, listCameraDevices } from '../services/liveCamera';
import { Camera, RefreshCw, RotateCcw, StopCircle, Video } from './icons';

/**
 * @param {Object} props
 * @param {(el:HTMLVideoElement|null)=>void} props.bindVideo - attache le lecteur
 * @param {boolean} props.active - une caméra diffuse actuellement
 * @param {number} props.delay - délai de rediffusion en secondes
 * @param {boolean} [props.canChangeDelay] - propriétaire de la session
 * @param {(seconds:number)=>void} [props.onDelayChange]
 * @param {{text:string, ok:boolean}|null} [props.message] - info / erreur
 * @param {(label:string)=>void} [props.onHint] - texte d'aide quand rien n'arrive
 * @param {boolean} [props.compact] - version réduite (onglet Rapport / Banc)
 * @param {React.ReactNode} [props.extra] - contenu additionnel (ex. retard lu)
 * @param {boolean} [props.canStartLocal] - autorise à filmer depuis ce PC
 * @param {boolean} [props.localActive] - ce poste est en train de filmer
 * @param {boolean} [props.cameraBusy] - démarrage en cours
 * @param {(deviceId?:string)=>void} [props.onStartLocal] - lance la capture locale
 * @param {()=>void} [props.onStopLocal] - arrête la capture locale
 * @param {(deltaSeconds:number)=>void} [props.onSeekRelative] - DVR -5s / +5s
 * @param {()=>void} [props.onJumpToLive] - DVR retour au direct différé
 * @param {()=>boolean} [props.onTogglePause] - DVR pause / reprise
 * @param {React.ReactNode} [props.overlaySlot] - incrustation TV / Calibration 4 coins
 */
export default function LiveCameraPanel({
  bindVideo,
  active,
  delay,
  canChangeDelay = false,
  onDelayChange,
  message = null,
  onHint = null,
  compact = false,
  extra = null,
  canStartLocal = false,
  localActive = false,
  cameraBusy = false,
  onStartLocal = null,
  onStopLocal = null,
  onSeekRelative = null,
  onJumpToLive = null,
  onTogglePause = null,
  overlaySlot = null,
}) {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [paused, setPaused] = useState(false);
  const [ipStreamUrl, setIpStreamUrl] = useState('');
  const [activeIpUrl, setActiveIpUrl] = useState('');
  const [showSourceConfig, setShowSourceConfig] = useState(false);

  const supported = cameraSupported();

  const refreshDevices = useCallback(async () => {
    const list = await listCameraDevices();
    setDevices(list);
    if (list.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(list[0].deviceId);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!canStartLocal || compact) return;
    refreshDevices();
  }, [canStartLocal, compact, refreshDevices]);

  const handleTogglePause = () => {
    if (!onTogglePause) return;
    const isNowPaused = onTogglePause();
    setPaused(!!isNowPaused);
  };

  const handleJumpLive = () => {
    setPaused(false);
    if (onJumpToLive) onJumpToLive();
  };

  const isStreaming = active || !!activeIpUrl;

  return (
    <div className={`live-camera${compact ? ' compact' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="live-camera-head" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span className={`live-camera-dot${isStreaming ? ' on' : ''}`} aria-hidden="true" />
        <strong>Caméra du match</strong>
        <span className={`live-camera-tag${isStreaming ? ' on' : ''}`}>
          {active
            ? `en direct · retard ${delay} s`
            : activeIpUrl
            ? 'flux IP direct'
            : 'hors ligne'}
        </span>
        {extra}

        {canChangeDelay && (
          <span className="live-camera-delay">
            <label htmlFor="live-camera-delay">Délai</label>
            <select
              id="live-camera-delay"
              value={delay}
              onChange={(e) => onDelayChange && onDelayChange(Number(e.target.value))}
              title="Retard de la vidéo sur la réalité : il laisse le temps de coder le point avant de le revoir"
            >
              {DELAY_CHOICES.map((s) => (
                <option key={s} value={s}>{s} s</option>
              ))}
            </select>
          </span>
        )}

        {/* Contrôles DVR (Time-Shift façon Data Volley 4) */}
        {active && (onSeekRelative || onTogglePause || onJumpToLive) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            {onSeekRelative && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onSeekRelative(-5)}
                title="Rembobiner de 5 secondes dans le buffer du direct différé"
                style={{ padding: '2px 6px', fontSize: 11 }}
              >
                ⏪ -5s
              </button>
            )}
            {onTogglePause && (
              <button
                type="button"
                className={`btn btn-xs ${paused ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleTogglePause}
                title={paused ? 'Reprendre la lecture du flux' : 'Mettre en pause le flux différé'}
                style={{ padding: '2px 6px', fontSize: 11 }}
              >
                {paused ? '▶ Lire' : '⏸ Pause'}
              </button>
            )}
            {onSeekRelative && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onSeekRelative(5)}
                title="Avancer de 5 secondes"
                style={{ padding: '2px 6px', fontSize: 11 }}
              >
                ⏭ +5s
              </button>
            )}
            {onJumpToLive && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={handleJumpLive}
                title="Recoller au direct différé"
                style={{ padding: '2px 6px', fontSize: 11 }}
              >
                <RotateCcw size={11} /> Direct
              </button>
            )}
          </div>
        )}

        {/* Bouton d'acquisition locale sur le PC du statisticien */}
        {canStartLocal && !compact && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: active ? 0 : 'auto' }}>
            {localActive ? (
              <button
                type="button"
                className="btn btn-danger btn-xs"
                onClick={() => onStopLocal && onStopLocal()}
                disabled={cameraBusy}
                title="Arrêter la caméra branchée sur ce poste"
                style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <StopCircle size={12} /> Arrêter ma caméra
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => onStartLocal && onStartLocal(selectedDeviceId)}
                  disabled={cameraBusy || !supported}
                  title="Filmer directement depuis une caméra branchée à ce PC (webcam USB, carte d'acquisition HDMI/CamLink, OBS Virtual Camera)"
                  style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Video size={12} /> {cameraBusy ? 'Démarrage…' : 'Activer caméra PC'}
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${showSourceConfig ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setShowSourceConfig((v) => !v);
                    if (!showSourceConfig) refreshDevices();
                  }}
                  title="Choisir le périphérique vidéo (USB / HDMI / OBS) ou une URL de caméra IP"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                >
                  <Camera size={12} /> Source
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Barre de configuration de la source vidéo (Périphérique USB/HDMI/OBS ou Flux IP) */}
      {canStartLocal && !compact && showSourceConfig && !localActive && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            padding: '6px 8px',
            marginBottom: 6,
            background: 'var(--bg-tertiary, #18181b)',
            border: '1px solid var(--border-subtle, #27272a)',
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          <span style={{ fontWeight: 700 }}>Périphérique :</span>
          <select
            className="dvx-input"
            style={{ fontSize: 11, padding: '2px 6px', maxWidth: 220 }}
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
          >
            <option value="">Caméra par défaut (USB / HDMI / OBS)</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={refreshDevices}
            title="Actualiser la liste des caméras branchées"
            style={{ padding: '2px 6px' }}
          >
            <RefreshCw size={11} />
          </button>

          <span style={{ marginLeft: 6, fontWeight: 700 }}>ou URL IP/HTTP :</span>
          <input
            type="url"
            className="dvx-input"
            placeholder="http://192.168.1.50:8080/video"
            value={ipStreamUrl}
            onChange={(e) => setIpStreamUrl(e.target.value)}
            style={{ fontSize: 11, padding: '2px 6px', width: 190 }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => setActiveIpUrl(ipStreamUrl.trim())}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            Lire URL
          </button>
          {activeIpUrl && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={() => { setActiveIpUrl(''); setIpStreamUrl(''); }}
              style={{ padding: '2px 7px', fontSize: 11 }}
            >
              Couper URL
            </button>
          )}
        </div>
      )}

      {/* Conteneur vidéo + incrustation TV Score / Calibration 4 coins */}
      <div style={{ position: 'relative', flex: 1, minHeight: compact ? 140 : 180, background: '#09090b', overflow: 'hidden', borderRadius: 4 }}>
        {activeIpUrl && !active ? (
          activeIpUrl.includes('/video') || activeIpUrl.includes('mjpg') || activeIpUrl.includes('mjpeg') ? (
            <img
              src={activeIpUrl}
              alt="Flux caméra IP"
              className="live-camera-video"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <video
              src={activeIpUrl}
              className="live-camera-video"
              playsInline
              muted
              autoPlay
              controls
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )
        ) : (
          <video
            ref={bindVideo}
            className="live-camera-video"
            playsInline
            muted
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
        {overlaySlot}
      </div>

      {!isStreaming && (
        <p className="dv-hint" style={{ marginTop: 6 }}>
          {onHint
            ? onHint('Aucune caméra connectée')
            : canStartLocal
            ? 'Aucune caméra active : cliquez sur « Activer caméra PC » (webcam USB, carte HDMI, OBS) ou connectez un téléphone avec le rôle « Caméra ».'
            : 'Aucune caméra connectée : ouvrez le match sur un téléphone avec le rôle « Caméra » ou activez la caméra sur le PC hôte.'}
        </p>
      )}
      {message && (
        <p className={`dv-hint live-camera-msg${message.ok ? '' : ' err'}`} style={{ marginTop: 4 }}>{message.text}</p>
      )}
    </div>
  );
}
