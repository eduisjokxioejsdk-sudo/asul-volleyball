// ============================================================================
// TERRAIN DE DIRECTION & TRAJECTOIRE (Point 14 — Coordonnées 100×100 DV4).
//
// Un terrain complet (18 m × 9 m), deux ou trois clics :
//   Mode 2 clics : 1er clic = point de départ · 2e clic = point d'arrivée.
//   Mode 3 clics : 1er clic = départ · 2e clic = point intermédiaire (passe/bloc)
//                  · 3e clic = point d'arrivée.
// Les points sont convertis automatiquement :
//   • en zones DataVolley 1-9 + sous-zone A-D ;
//   • en coordonnées millimétriques DataVolley 4 (start_x/y, mid_x/y, end_x/y sur 0..100).
// ============================================================================

import { useId, useState } from 'react';
import {
  ZONE_CELLS,
  zoneCenter,
  zoneFromPoint,
  subzoneFromPoint,
  toDv100Coords,
  fromDv100Coords,
} from '../utils/courtGeometry.js';
import {
  TRAJECTORY_COURT,
  TRAJECTORY_VIEWBOX,
  TRAJECTORY_VIEWBOX_STR,
  svgPointFromEvent,
} from '../utils/trajectory.js';

const ZONE_KEYS = Object.keys(ZONE_CELLS);
const SVG_SIDES = ['left', 'right'];

export default function AttackDirectionCourt({
  startZone = '',
  endZone = '',
  endSubzone = '',
  startX = null,
  startY = null,
  midX = null,
  midY = null,
  endX = null,
  endY = null,
  history = [],
  side = 'home',
  playerLabel = '',
  teamName = 'Domicile',
  opponentName = 'Extérieur',
  onChange,
  onCommit,
  disabled = false,
}) {
  const [threePointMode, setThreePointMode] = useState(false);
  const [stepPoints, setStepPoints] = useState([]); // [startPt] ou [startPt, midPt]
  const [hover, setHover] = useState(null);
  const [committed, setCommitted] = useState(null);
  const markerId = `adc-${useId().replace(/:/g, '')}`;

  const savedFrom = fromDv100Coords(startX, startY) || zoneCenter(startZone, side);
  const savedMid = fromDv100Coords(midX, midY);
  const opponentSide = side === 'away' ? 'home' : 'away';
  const savedTo = fromDv100Coords(endX, endY) || zoneCenter(endZone, opponentSide) || zoneCenter(endZone, side);

  const commitValid =
    committed && committed.start === String(startZone || '') && committed.end === String(endZone || '');

  const from = stepPoints[0] || (commitValid ? committed.from : savedFrom);
  const mid = stepPoints[1] || (commitValid ? committed.mid : savedMid);
  const to =
    stepPoints.length > 0
      ? hover || stepPoints[stepPoints.length - 1]
      : commitValid
      ? committed.to
      : savedTo;

  const hasArrow = !!(from && to && (from.x !== to.x || from.y !== to.y));

  const cancel = () => {
    setStepPoints([]);
    setHover(null);
  };

  const pick = (event) => {
    if (disabled) return;
    const point = svgPointFromEvent(event.currentTarget, event);
    if (!point) return;

    const targetSteps = threePointMode ? 3 : 2;
    const nextSteps = [...stepPoints, point];

    if (nextSteps.length < targetSteps) {
      setStepPoints(nextSteps);
      setHover(point);
      return;
    }

    const pStart = nextSteps[0];
    const pMid = threePointMode ? nextSteps[1] : null;
    const pEnd = nextSteps[nextSteps.length - 1];

    const firstZone = zoneFromPoint(pStart, side) || '';
    // Pour le point d'arrivée, s'il est dans le camp adverse, on calcule la zone dans le repère adverse
    const landedInOpponentHalf =
      side === 'home' ? pEnd.x >= TRAJECTORY_COURT.netX : pEnd.x <= TRAJECTORY_COURT.netX;
    const endSide = landedInOpponentHalf ? opponentSide : side;
    const secondZone = zoneFromPoint(pEnd, endSide) || '';
    const subzone = subzoneFromPoint(pEnd, endSide) || '';

    const cStart = toDv100Coords(pStart);
    const cMid = pMid ? toDv100Coords(pMid) : { x: null, y: null };
    const cEnd = toDv100Coords(pEnd);

    const sameSpot = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y) < 3;
    const payload = sameSpot
      ? {
          start: firstZone,
          end: '',
          endSubzone: '',
          start_x: cStart.x,
          start_y: cStart.y,
          mid_x: null,
          mid_y: null,
          end_x: null,
          end_y: null,
        }
      : {
          start: firstZone,
          end: secondZone,
          endSubzone: subzone,
          start_x: cStart.x,
          start_y: cStart.y,
          mid_x: cMid.x,
          mid_y: cMid.y,
          end_x: cEnd.x,
          end_y: cEnd.y,
        };

    onChange?.(payload);
    onCommit?.(payload);
    setCommitted({ ...payload, from: pStart, mid: pMid, to: sameSpot ? null : pEnd });
    setStepPoints([]);
    setHover(null);
  };

  return (
    <div className={`adc ${disabled ? 'disabled' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          Grille <strong>100×100 DataVolley 4</strong> + dérivation auto Zone (1-9) & Sous-zone (A-D)
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={threePointMode}
            onChange={(e) => {
              setThreePointMode(e.target.checked);
              cancel();
            }}
          />
          Tracé 3 points (Départ → Passe/Bloc → Impact)
        </label>
      </div>

      <svg
        className="adc-court"
        viewBox={TRAJECTORY_VIEWBOX_STR}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Direction d’attaque — ${teamName} contre ${opponentName}`}
        onClick={pick}
        onMouseMove={(e) => {
          if (stepPoints.length === 0) return;
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
          DIRECTION D’ATTAQUE (100×100)
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

        {/* Attaques précédentes du joueur */}
        {history.map((shot, index) => {
          const a = fromDv100Coords(shot.startX, shot.startY) || zoneCenter(shot.start, side);
          const b = fromDv100Coords(shot.endX, shot.endY) || zoneCenter(shot.end, opponentSide) || zoneCenter(shot.end, side);
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

        {/* Trajectoire en cours / enregistrée (2 ou 3 points) */}
        {hasArrow && !mid && (
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
        {hasArrow && mid && (
          <polyline
            points={`${from.x},${from.y} ${mid.x},${mid.y} ${to.x},${to.y}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId}-current)`}
          />
        )}
        {from && <circle cx={from.x} cy={from.y} r="1.8" fill="var(--accent)" />}
        {mid && <circle cx={mid.x} cy={mid.y} r="1.5" fill="#38bdf8" />}
        {to && hasArrow && <circle cx={to.x} cy={to.y} r="1.2" fill="var(--accent)" />}
      </svg>

      <div className="adc-foot">
        <p className="adc-hint">
          {playerLabel ? `${playerLabel} · ` : ''}
          Départ <strong>{startZone || '—'}</strong> · Arrivée{' '}
          <strong>
            {endZone || '—'}
            {endSubzone || committed?.endSubzone || ''}
          </strong>
          {(startX != null || committed?.start_x != null) && (
            <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: '#38bdf8' }}>
              [{committed?.start_x ?? startX},{committed?.start_y ?? startY} → {committed?.end_x ?? endX},{committed?.end_y ?? endY}]
            </span>
          )}
        </p>
        {stepPoints.length > 0 && !disabled && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
            Annuler le tracé ({stepPoints.length}/{threePointMode ? 3 : 2})
          </button>
        )}
      </div>
    </div>
  );
}
