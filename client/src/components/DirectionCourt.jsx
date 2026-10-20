// ============================================================================
// DIRECTIONS D'ATTAQUE — terrain à 2 clics (3.1.0).
//
// 1er clic : zone de DÉPART (aperçu de la zone seule) ;
// 2e clic  : zone d'ARRIVÉE → la flèche s'affiche et la direction est écrite
//            dans les champs EXISTANTS start_zone / end_zone du code (aucun
//            changement de format : les matchs déjà codés restent valides).
// Double-clic sur la même zone : comportement historique, zone de départ seule.
//
// `DirectionCourt` sert à la saisie et à la correction ; `DirectionMap` affiche
// les flèches agrégées de la fenêtre d'analyse « Directions ».
// ============================================================================

import { useId, useState } from 'react';
import { DV_ZONE_GRID, DV_ZONE_LABELS } from '../utils/datavolley';

const W = 360;
const NET_H = 22;
const COL_W = W / 3;
const ROW_H = 90;
const ROWS = 3;

/** Cellule (ligne, colonne) et coin supérieur gauche d'une zone 1-9. */
function cellOf(zone) {
  const z = String(zone || '');
  if (!z) return null;
  for (let r = 0; r < DV_ZONE_GRID.length; r += 1) {
    const c = DV_ZONE_GRID[r].indexOf(z);
    if (c !== -1) return { r, c, x: c * COL_W, y: NET_H + r * ROW_H };
  }
  return null;
}

/** Centre d'une zone (pour tracer la flèche). */
function centerOf(zone) {
  const cell = cellOf(zone);
  return cell ? { x: cell.x + COL_W / 2, y: cell.y + ROW_H / 2 } : null;
}

/** Toutes les zones du terrain, ligne par ligne (4 3 2 / 7 8 9 / 5 6 1). */
const ALL_ZONES = DV_ZONE_GRID.flat();

/**
 * Sélecteur de direction à 2 clics.
 * @param {Object} props
 * @param {string} [props.startZone]
 * @param {string} [props.endZone]
 * @param {Function} props.onChange - ({ start, end }) => void
 * @param {Function} [props.onCommit] - appelé au 2e clic (ou au double-clic)
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.compact]
 */
export default function DirectionCourt({
  startZone = '',
  endZone = '',
  onChange,
  onCommit,
  disabled = false,
  compact = false,
}) {
  const [pending, setPending] = useState(null);
  const [hover, setHover] = useState(null);
  const markerId = `dirc-arrow-${useId().replace(/:/g, '')}`;

  const start = String(startZone || '');
  const end = String(endZone || '');
  const arrowFrom = centerOf(pending || start);
  const arrowTo = centerOf(pending ? hover || end : end);

  const pick = (zone) => {
    if (disabled) return;
    const z = String(zone);
    if (!pending) {
      if (start === z && end === z) {
        // Double-clic sur la même zone : zone de départ seule (historique).
        const next = { start: z, end: '' };
        onChange?.(next);
        onCommit?.(next);
        setPending(null);
        return;
      }
      setPending(z);
      return;
    }
    if (pending === z) {
      const next = { start: z, end: '' };
      onChange?.(next);
      onCommit?.(next);
      setPending(null);
      return;
    }
    const next = { start: pending, end: z };
    onChange?.(next);
    onCommit?.(next);
    setPending(null);
  };

  const height = NET_H + ROWS * ROW_H;

  return (
    <div className={`dirc ${compact ? 'compact' : ''}`}>
      <svg
        className="dirc-court"
        viewBox={`0 0 ${W} ${height}`}
        role="group"
        aria-label="Terrain des directions d’attaque"
      >
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
          </marker>
        </defs>
        <rect x="0" y="0" width={W} height={height} rx="10" fill="rgba(32,30,27,0.85)" />
        <rect x="0" y="0" width={W} height={NET_H} fill="rgba(200,150,92,0.16)" />
        <text x={W / 2} y="15" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-muted)">
          FILET
        </text>
        <line
          x1="0"
          y1={NET_H + ROW_H}
          x2={W}
          y2={NET_H + ROW_H}
          stroke="rgba(232,224,213,0.18)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        {ALL_ZONES.map((zone) => {
          const cell = cellOf(zone);
          if (!cell) return null;
          const isStart = String(pending || start) === zone;
          const isEnd = !pending && end === zone;
          return (
            <g
              key={zone}
              onClick={() => pick(zone)}
              onMouseEnter={() => setHover(zone)}
              style={{ cursor: disabled ? 'default' : 'pointer' }}
            >
              <rect
                x={cell.x + 2}
                y={cell.y + 2}
                width={COL_W - 4}
                height={ROW_H - 4}
                rx="6"
                fill={isStart ? 'rgba(200,150,92,0.3)' : isEnd ? 'rgba(122,162,255,0.28)' : 'rgba(200,150,92,0.06)'}
                stroke={isStart || isEnd ? 'var(--accent)' : 'rgba(200,150,92,0.35)'}
                strokeWidth={isStart || isEnd ? 2 : 1}
              />
              <text
                x={cell.x + COL_W / 2}
                y={cell.y + 24}
                textAnchor="middle"
                fontSize="16"
                fontWeight="800"
                fill="var(--text-primary)"
              >
                {zone}
              </text>
              <text
                x={cell.x + COL_W / 2}
                y={cell.y + ROW_H / 2 + 18}
                textAnchor="middle"
                fontSize="8"
                fill="var(--text-muted)"
              >
                {DV_ZONE_LABELS[zone] || ''}
              </text>
            </g>
          );
        })}
        {arrowFrom && arrowTo && (arrowFrom.x !== arrowTo.x || arrowFrom.y !== arrowTo.y) && (
          <line
            x1={arrowFrom.x}
            y1={arrowFrom.y}
            x2={arrowTo.x - 2}
            y2={arrowTo.y}
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            markerEnd={`url(#${markerId})`}
            pointerEvents="none"
          />
        )}
        {arrowFrom && <circle cx={arrowFrom.x} cy={arrowFrom.y} r="5" fill="var(--accent)" pointerEvents="none" />}
      </svg>
      <p className="dirc-hint">
        Départ <strong>{start || '—'}</strong> · Arrivée <strong>{end || '—'}</strong>
        {pending ? ' — cliquez la zone d’arrivée' : ' — cliquez la zone de départ puis celle d’arrivée'}
      </p>
    </div>
  );
}

/**
 * Terrain d'analyse : une flèche par direction agrégée (départ → arrivée).
 * L'épaisseur du trait suit le volume ; un clic sur une flèche filtre la liste.
 * @param {Object} props
 * @param {Array<{key:string,start:string,end:string,total:number}>} props.rows
 * @param {Function} [props.onPick] - (row) => void
 * @param {string} [props.title]
 */
export function DirectionMap({ rows = [], onPick, title = 'Directions d’attaque' }) {
  const markerId = `dirc-map-${useId().replace(/:/g, '')}`;
  const height = NET_H + ROWS * ROW_H;
  const max = rows.reduce((m, r) => Math.max(m, Number(r.total) || 0), 1);
  return (
    <div className="dirc dirc-map">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
          </marker>
        </defs>
        <rect x="0" y="0" width={W} height={height} rx="10" fill="rgba(32,30,27,0.85)" />
        <rect x="0" y="0" width={W} height={NET_H} fill="rgba(200,150,92,0.16)" />
        <text x={W / 2} y="15" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-muted)">
          FILET
        </text>
        {ALL_ZONES.map((zone) => {
          const cell = cellOf(zone);
          if (!cell) return null;
          return (
            <g key={zone}>
              <rect
                x={cell.x + 2}
                y={cell.y + 2}
                width={COL_W - 4}
                height={ROW_H - 4}
                rx="6"
                fill="rgba(232,224,213,0.03)"
                stroke="rgba(232,224,213,0.12)"
              />
              <text
                x={cell.x + COL_W / 2}
                y={cell.y + ROW_H / 2 + 5}
                textAnchor="middle"
                fontSize="16"
                fontWeight="800"
                fill="var(--text-muted)"
              >
                {zone}
              </text>
            </g>
          );
        })}
        {rows.map((row) => {
          const from = centerOf(row.start);
          const to = centerOf(row.end);
          if (!from || !to) return null;
          const thickness = 1 + (4 * (Number(row.total) || 0)) / max;
          return (
            <g key={row.key} onClick={() => onPick?.(row)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <title>{`${row.key} · ${row.total} attaque(s)`}</title>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x - 2}
                y2={to.y}
                stroke="var(--accent)"
                strokeWidth={thickness}
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
                opacity="0.85"
              />
            </g>
          );
        })}
      </svg>
      <p className="dirc-hint">
        {rows.length
          ? `${rows.length} direction(s) agrégée(s) · clic sur une flèche pour filtrer la liste`
          : 'Aucune direction codée.'}
      </p>
    </div>
  );
}

