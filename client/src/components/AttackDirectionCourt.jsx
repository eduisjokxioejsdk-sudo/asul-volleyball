// ============================================================================
// TERRAIN DE DIRECTION D'ATTAQUE — fenêtre séparée, façon mode Trajectoires.
//
// Un terrain complet (18 m × 9 m), deux clics :
//   1er clic = point de départ · 2e clic = point d'arrivée.
// Seule la trajectoire est enregistrée (aucun type d'attaque demandé) : les
// points sont convertis en zones DataVolley 1-9, puis écrits dans les champs
// existants start_zone / end_zone — le format des matchs ne change pas.
//
// Les attaques précédentes du MÊME JOUEUR sont affichées en transparence,
// uniquement sous forme de flèches (pas de type, pas d'issue).
// ============================================================================

import { useId, useState } from 'react';
import { ZONE_CELLS, zoneCenter, zoneFromPoint } from '../utils/courtGeometry.js';
import {
  TRAJECTORY_COURT,
  TRAJECTORY_VIEWBOX,
  TRAJECTORY_VIEWBOX_STR,
  svgPointFromEvent,
} from '../utils/trajectory.js';

const ZONE_KEYS = Object.keys(ZONE_CELLS);
const SVG_SIDES = ['left', 'right'];

/**
 * @param {Object} props
 * @param {string} [props.startZone] - zone de départ enregistrée
 * @param {string} [props.endZone] - zone d'arrivée enregistrée
 * @param {Array<{start:string,end:string}>} [props.history] - attaques précédentes du joueur
 * @param {'home'|'away'} [props.side] - camp de l'équipe qui attaque
 * @param {string} [props.playerLabel] - ex. « n°07 JULIEN »
 * @param {string} [props.teamName] / [props.opponentName] - noms écrits sur le terrain
 * @param {Function} props.onChange - ({ start, end }) => void
 * @param {Function} [props.onCommit] - même objet, au 2e clic
 * @param {boolean} [props.disabled]
 */
export default function AttackDirectionCourt({
  startZone = '',
  endZone = '',
  history = [],
  side = 'home',
  playerLabel = '',
  teamName = 'Domicile',
  opponentName = 'Extérieur',
  onChange,
  onCommit,
  disabled = false,
}) {
  const [pending, setPending] = useState(null);
  const [hover, setHover] = useState(null);
  const [committed, setCommitted] = useState(null);
  const markerId = `adc-${useId().replace(/:/g, '')}`;

  const savedFrom = zoneCenter(startZone, side);
  const savedTo = zoneCenter(endZone, side);
  const commitValid =
    committed && committed.start === String(startZone || '') && committed.end === String(endZone || '');
  const from = pending || (commitValid ? committed.from : savedFrom);
  const to = pending ? hover || pending : commitValid ? committed.to : savedTo;
  const hasArrow = !!(from && to && (from.x !== to.x || from.y !== to.y));

  const cancel = () => {
    setPending(null);
    setHover(null);
  };

  const pick = (event) => {
    if (disabled) return;
    const point = svgPointFromEvent(event.currentTarget, event);
    if (!point) return;
    if (!pending) {
      setPending(point);
      setHover(point);
      return;
    }
    const firstZone = zoneFromPoint(pending, side) || '';
    const secondZone = zoneFromPoint(point, side) || '';
    // Même zone aux deux clics : comportement historique, zone de départ seule.
    const next =
      firstZone && secondZone && firstZone !== secondZone
        ? { start: firstZone, end: secondZone }
        : { start: firstZone, end: '' };
    onChange?.(next);
    onCommit?.(next);
    setCommitted({ ...next, from: pending, to: firstZone !== secondZone ? point : null });
    setPending(null);
    setHover(null);
  };

  return (
    <div className={`adc ${disabled ? 'disabled' : ''}`}>
      <svg
        className="adc-court"
        viewBox={TRAJECTORY_VIEWBOX_STR}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Direction d’attaque — ${teamName} contre ${opponentName}`}
        onClick={pick}
        onMouseMove={(e) => {
          if (!pending) return;
          const point = svgPointFromEvent(e.currentTarget, e);
          if (point) setHover(point);
        }}
      >
        <defs>
          <marker
            id={`${markerId}-current`}
            viewBox="0 0 8 8"
            refX="6.6"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--accent)" />
          </marker>
          <marker
            id={`${markerId}-old`}
            viewBox="0 0 8 8"
            refX="6.6"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--text-muted)" />
          </marker>
        </defs>

        <rect
          x={TRAJECTORY_VIEWBOX.x}
          y={TRAJECTORY_VIEWBOX.y}
          width={TRAJECTORY_VIEWBOX.w}
          height={TRAJECTORY_VIEWBOX.h}
          rx="4"
          fill="rgba(32,30,27,0.6)"
        />
        <rect
          x={TRAJECTORY_COURT.x}
          y={TRAJECTORY_COURT.y}
          width={TRAJECTORY_COURT.w}
          height={TRAJECTORY_COURT.h}
          fill="rgba(200,150,92,0.06)"
          stroke="var(--text-primary)"
          strokeWidth="1.2"
        />
        {/* Camp de l'équipe qui attaque : c'est là que se cliquent départ et arrivée. */}
        <rect
          x={side === 'away' ? TRAJECTORY_COURT.netX : TRAJECTORY_COURT.x}
          y={TRAJECTORY_COURT.y}
          width={TRAJECTORY_COURT.w / 2}
          height={TRAJECTORY_COURT.h}
          fill="rgba(200,150,92,0.08)"
          pointerEvents="none"
        />
        <line
          x1={TRAJECTORY_COURT.netX - TRAJECTORY_COURT.attack}
          y1={TRAJECTORY_COURT.top}
          x2={TRAJECTORY_COURT.netX - TRAJECTORY_COURT.attack}
          y2={TRAJECTORY_COURT.bottom}
          stroke="var(--text-primary)"
          strokeWidth="0.8"
          opacity="0.8"
        />
        <line
          x1={TRAJECTORY_COURT.netX + TRAJECTORY_COURT.attack}
          y1={TRAJECTORY_COURT.top}
          x2={TRAJECTORY_COURT.netX + TRAJECTORY_COURT.attack}
          y2={TRAJECTORY_COURT.bottom}
          stroke="var(--text-primary)"
          strokeWidth="0.8"
          opacity="0.8"
        />
        <rect
          x={TRAJECTORY_COURT.netX - 0.8}
          y={TRAJECTORY_COURT.top - 4}
          width="1.6"
          height={TRAJECTORY_COURT.h + 8}
          fill="var(--accent)"
          opacity="0.3"
        />
        <line
          x1={TRAJECTORY_COURT.netX}
          y1={TRAJECTORY_COURT.top}
          x2={TRAJECTORY_COURT.netX}
          y2={TRAJECTORY_COURT.bottom}
          stroke="var(--text-primary)"
          strokeWidth="0.7"
          opacity="0.75"
        />


        {SVG_SIDES.map((svgSide) =>
          ZONE_KEYS.map((zone) => {
            const point = zoneCenter(zone, svgSide === 'left' ? 'home' : 'away');
            if (!point) return null;
            return (
              <text
                key={`${svgSide}-${zone}`}
                x={point.x}
                y={point.y + 1.4}
                textAnchor="middle"
                fontSize="3.6"
                fontWeight="700"
                fill="var(--text-muted)"
                opacity="0.35"
              >
                {zone}
              </text>
            );
          })
        )}

        <text
          x={TRAJECTORY_VIEWBOX.x + 2}
          y={TRAJECTORY_VIEWBOX.y + 8}
          fontSize="5.5"
          fontWeight="800"
          fill="var(--accent)"
        >
          DIRECTION D’ATTAQUE
        </text>
        <text
          x={TRAJECTORY_COURT.x + 1}
          y={TRAJECTORY_COURT.top - 6}
          fontSize="5"
          fontWeight="800"
          fill="var(--text-secondary)"
        >
          {teamName}
        </text>
        <text
          x={TRAJECTORY_COURT.x + TRAJECTORY_COURT.w - 1}
          y={TRAJECTORY_COURT.top - 6}
          textAnchor="end"
          fontSize="5"
          fontWeight="800"
          fill="var(--text-muted)"
        >
          {opponentName}
        </text>

        {/* Attaques précédentes du joueur : uniquement la trajectoire, en transparence. */}
        {history.map((shot, index) => {
          const a = zoneCenter(shot.start, side);
          const b = zoneCenter(shot.end, side);
          if (!a || !b) return null;
          return (
            <line
              key={`${shot.start}-${shot.end}-${index}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--text-muted)"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.25"
              markerEnd={`url(#${markerId}-old)`}
            />
          );
        })}

        {/* Trajectoire en cours / enregistrée */}
        {hasArrow && (
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            markerEnd={`url(#${markerId}-current)`}
          />
        )}
        {from && <circle cx={from.x} cy={from.y} r="1.8" fill="var(--accent)" />}
        {to && hasArrow && <circle cx={to.x} cy={to.y} r="1.2" fill="var(--accent)" />}
      </svg>

      <div className="adc-foot">
        <p className="adc-hint">
          {playerLabel ? `${playerLabel} · ` : ''}
          Départ <strong>{startZone || '—'}</strong> · Arrivée <strong>{endZone || '—'}</strong>
          {pending ? ' — cliquez le point d’arrivée' : ' — cliquez le point de départ puis le point d’arrivée'}
        </p>
        {pending && !disabled && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
            Annuler le tracé
          </button>
        )}
      </div>
      <p className="adc-history">
        {history.length
          ? `${history.length} attaque${history.length > 1 ? 's' : ''} précédente${
              history.length > 1 ? 's' : ''
            } de ce joueur, en transparence.`
          : 'Aucune attaque précédente pour ce joueur.'}
      </p>
    </div>
  );
}

