// ============================================================================
// Panneau « Caméra du match » : affiche le flux vidéo différé reçu du serveur
// (voir services/liveCameraPlayer) et, pour le propriétaire de la session, le
// réglage du délai de retard.
//
// L'élément <video> reste toujours monté : le lecteur peut ainsi s'y attacher
// dès le premier morceau, sans course avec l'état « caméra connectée ».
// ============================================================================

import { DELAY_CHOICES } from '../services/liveCamera';

/**
 * @param {Object} props
 * @param {(el:HTMLVideoElement|null)=>void} props.bindVideo - attache le lecteur
 * @param {boolean} props.active - une caméra diffuse actuellement
 * @param {number} props.delay - délai de rediffusion en secondes
 * @param {boolean} [props.canChangeDelay] - propriétaire de la session
 * @param {(seconds:number)=>void} [props.onDelayChange]
 * @param {{text:string, ok:boolean}|null} [props.message] - info / erreur
 * @param {(label:string)=>void} [props.onHint] - texte d'aide quand rien n'arrive
 * @param {boolean} [props.compact] - version réduite (onglet Rapport)
 * @param {React.ReactNode} [props.extra] - contenu additionnel (ex. retard lu)
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
}) {
  return (
    <div className={`live-camera${compact ? ' compact' : ''}`}>
      <div className="live-camera-head">
        <span className={`live-camera-dot${active ? ' on' : ''}`} aria-hidden="true" />
        <strong>Caméra du match</strong>
        <span className={`live-camera-tag${active ? ' on' : ''}`}>
          {active ? `en direct · retard ${delay} s` : 'hors ligne'}
        </span>
        {extra}
        {canChangeDelay && (
          <span className="live-camera-delay">
            <label htmlFor="live-camera-delay">Délai</label>
            <select
              id="live-camera-delay"
              value={delay}
              onChange={(e) => onDelayChange && onDelayChange(Number(e.target.value))}
              title="Retard de la vidéo sur la réalité : il laisse le temps de coder le point"
            >
              {DELAY_CHOICES.map((s) => (
                <option key={s} value={s}>{s} s</option>
              ))}
            </select>
          </span>
        )}
      </div>

      <video ref={bindVideo} className="live-camera-video" playsInline muted autoPlay />

      {!active && (
        <p className="dv-hint">
          {onHint
            ? onHint('Aucune caméra connectée')
            : 'Aucune caméra connectée : ouvrez le match sur un téléphone avec le rôle « Caméra ».'}
        </p>
      )}
      {message && (
        <p className={`dv-hint live-camera-msg${message.ok ? '' : ' err'}`}>{message.text}</p>
      )}
    </div>
  );
}