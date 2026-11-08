// ============================================================================
// Terrain complet + une flèche par action, colorée selon l'évaluation.
// `heat` colore les zones d'arrivée selon leur fréquence (nb · % · efficacité).
// ============================================================================

import { useId, useMemo } from 'react';
import {
  ATTACK_M, FREE, LEFT_X, M, NET_X, RIGHT_X, U, ZONE_CELLS, xyFrom,
} from '../utils/courtGeometry.js';
import { TRAJECTORY_VIEWBOX_STR } from '../utils/trajectory.js';
import { EVAL_COLORS, EVAL_ORDER, EVAL_PATTERNS, NO_EVAL_COLOR, endZoneCounts } from '../utils/dvTrajectories.js';

const MARKER_KEY = { '#': 'k', '=': 'e', '+': 'p', '!': 'o', '-': 'm', '/': 'b' };

export function TrajectoryMap({ shots = [], heat = false, compact = false, teamSide = 'home', onPick = null, bw = false }) {
  const uid = useId().replace(/:/g, '');
  const counts = useMemo(() => endZoneCounts(shots), [shots]);
  const max = Math.max(1, ...Object.values(counts).map((c) => c.count));
  const total = shots.length || 1;
  const foeSide = teamSide === 'away' ? 'left' : 'right';
  const courtW = RIGHT_X - LEFT_X;

  return (
    <svg viewBox={TRAJECTORY_VIEWBOX_STR} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        {[...EVAL_ORDER, 'none'].map((e) => (
          <marker
            key={e}
            id={`${uid}-${MARKER_KEY[e] || 'n'}`}
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L5,2.5 L0,5 z" fill={EVAL_COLORS[e] || NO_EVAL_COLOR} />
          </marker>
        ))}
      </defs>
      <rect x={LEFT_X} y={FREE} width={courtW} height={M * U} fill={bw ? '#fff' : 'rgba(32,30,27,0.85)'} stroke={bw ? '#333' : 'rgba(232,224,213,0.5)'} />
      <line x1={NET_X} y1={FREE - 3} x2={NET_X} y2={FREE + M * U + 3} stroke="#e8e0d5" strokeWidth="1.2" />
      <line x1={NET_X - ATTACK_M * U} y1={FREE} x2={NET_X - ATTACK_M * U} y2={FREE + M * U} stroke={bw ? '#999' : 'rgba(232,224,213,0.3)'} strokeDasharray="3 2" />
      <line x1={NET_X + ATTACK_M * U} y1={FREE} x2={NET_X + ATTACK_M * U} y2={FREE + M * U} stroke={bw ? '#999' : 'rgba(232,224,213,0.3)'} strokeDasharray="3 2" />

      {heat && Object.entries(ZONE_CELLS).map(([z, cell]) => {
        const c = counts[z];
        const p = xyFrom(cell[0], cell[1], foeSide);
        const alpha = c ? 0.12 + 0.55 * (c.count / max) : 0.03;
        return (
          <g key={z}>
            <rect x={p.x - 15} y={p.y - 15} width="30" height="30" fill={bw ? `rgba(0,0,0,${alpha * 0.35})` : `rgba(200,150,92,${alpha})`} stroke={bw ? '#bbb' : 'rgba(232,224,213,0.12)'} />
            {c && (
              <text x={p.x} y={p.y + 1} textAnchor="middle" fontSize="7" fontWeight="700" fill={bw ? '#000' : '#fff'}>
                {c.count} · {Math.round((c.count / total) * 100)}%
              </text>
            )}
            {c && (
              <text x={p.x} y={p.y + 9} textAnchor="middle" fontSize="5" fill={bw ? '#222' : 'rgba(255,255,255,0.8)'}>
                eff {Math.round(((c.points - c.errors) / c.count) * 100)}%
              </text>
            )}
          </g>
        );
      })}

      {shots.map((s, i) => {
        const e = s.action.evaluation;
        const color = EVAL_COLORS[e] || NO_EVAL_COLOR;
        const curved = s.action.type === 'P' || s.action.type === 'T';
        const mx = (s.from.x + s.to.x) / 2;
        const my = (s.from.y + s.to.y) / 2 - (curved ? 10 : 0);
        let d = curved
          ? `M${s.from.x},${s.from.y} Q${mx},${my} ${s.to.x},${s.to.y}`
          : `M${s.from.x},${s.from.y} L${s.to.x},${s.to.y}`;
        if (s.mid) d = `M${s.from.x},${s.from.y} L${s.mid.x},${s.mid.y} L${s.to.x},${s.to.y}`;
        return (
          <g
            key={s.action.uid ?? s.action.id ?? i}
            onClick={onPick ? () => onPick(s) : undefined}
            style={onPick ? { cursor: 'pointer' } : undefined}
          >
            <title>{`${s.action.code || ''} · n°${s.action.player_number} · ${s.precision}`}</title>
            <path
              d={d}
              fill="none"
              stroke={bw ? '#111' : color}
              strokeWidth={compact ? 0.9 : 1.2}
              opacity="0.85"
              strokeDasharray={bw ? (EVAL_PATTERNS[e]?.dash || undefined) : (s.precision === 'zone' ? '3 2' : undefined)}
              markerEnd={`url(#${uid}-${MARKER_KEY[e] || 'n'})`}
            />
            <circle cx={s.from.x} cy={s.from.y} r={compact ? 1.2 : 1.6} fill={bw ? '#111' : color} />
            {s.mid && (
              <circle cx={s.mid.x} cy={s.mid.y} r={compact ? 1 : 1.4} fill={bw ? '#fff' : '#fff'} stroke={bw ? '#111' : color} strokeWidth="0.6" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default TrajectoryMap;
