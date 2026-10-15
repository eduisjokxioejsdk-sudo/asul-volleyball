// ============================================================================
// Terrain de volley tracé aux proportions réelles (18 m × 9 m) : filet vertical
// au centre, lignes d'attaque à 3 m, zone libre, six des deux équipes.
// La géométrie (postes, zones, conversions) est dans utils/courtGeometry.
// ============================================================================

import { roleShort, roleColor } from '../utils/lineup';
import {
  ATTACK,
  FREE,
  H,
  LEFT_X,
  M,
  NET_X,
  RIGHT_X,
  SPOTS,
  SPOT_LABELS,
  W,
  ZONE_CELLS,
  xyFrom,
  spotXY,
} from '../utils/courtGeometry.js';

const DEPTH = M * 10; // profondeur d'un camp en unités (90)

function Player({ spot, info, side, serving, setter, compact, highlighted }) {
  const { x, y } = spotXY(spot, side);
  const number = info?.number;
  const role = info?.role || 'universal';
  const color = roleColor(role);
  const r = compact ? 6.6 : 8.8;
  const numSize = compact ? 8.6 : 11.6;
  const badgeSize = compact ? 4.4 : 5.4;
  const isLibero = !!info?.isLibero;

  return (
    <g>
      {/* Joueur correspondant au numéro en cours de frappe : halo pulsant. */}
      {highlighted && (
        <>
          <circle
            cx={x}
            cy={y}
            r={r + (compact ? 3.4 : 4.6)}
            className="vc-active"
            fill="rgba(200, 150, 92, 0.18)"
            stroke="var(--accent)"
            strokeWidth={compact ? 1.6 : 2.2}
          />
        </>
      )}
      {serving && (
        <circle
          cx={x}
          cy={y}
          r={r + (compact ? 2.2 : 3)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={compact ? 1.2 : 1.6}
        />
      )}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={number ? 'rgba(28,26,23,0.94)' : 'rgba(255,255,255,0.05)'}
        stroke={number ? color : 'var(--border-subtle)'}
        strokeWidth={isLibero ? 1.6 : 1.2}
        strokeDasharray={isLibero ? '2 1.4' : undefined}
      />
      <text
        x={x}
        y={y + numSize * 0.34}
        textAnchor="middle"
        fontSize={numSize}
        fontWeight="800"
        fill={number ? 'var(--text-primary)' : 'var(--text-muted)'}
      >
        {number || '·'}
      </text>
      {setter && number && (
        <text
          x={x}
          y={y - r - 2.4}
          textAnchor="middle"
          fontSize={badgeSize + 1.4}
          fontWeight="800"
          fill="var(--accent)"
        >
          ✦
        </text>
      )}
      {number && !compact && (
        <text x={x} y={y + r + 6} textAnchor="middle" fontSize={badgeSize} fontWeight="800" fill={color}>
          {roleShort(role)}
        </text>
      )}
      <title>{`${SPOT_LABELS[spot]} · n°${number || '—'}${info?.name ? ` ${info.name}` : ''}`}</title>
    </g>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.home / props.away - { P1..P6 } (sortie de resolveOnCourt)
 * @param {string} [props.serving] - 'home' | 'away'
 * @param {string} [props.homeSetter] / [props.awaySetter] - poste du passeur
 * @param {string} [props.homeName] / [props.awayName]
 * @param {boolean} [props.compact] - version très réduite (sous la vidéo)
 * @param {string} [props.activeTeam] - 'home' | 'away' : équipe du joueur mis en avant
 * @param {number} [props.activeNumber] - numéro de joueur mis en avant
 */
export default function VolleyCourt({
  home,
  away,
  serving = null,
  homeSetter = null,
  awaySetter = null,
  homeName = 'Domicile',
  awayName = 'Extérieur',
  compact = false,
  activeTeam = null,
  activeNumber = null,
}) {
  const showZones = !compact;
  const teams = [
    { key: 'home', side: 'left', onCourt: home, setter: homeSetter, label: homeName },
    { key: 'away', side: 'right', onCourt: away, setter: awaySetter, label: awayName },
  ];
  const activeNum = Number(activeNumber) || null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="volley-court"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Terrain de volley — ${homeName} contre ${awayName}`}
    >
      <defs>
        <pattern id="vc-net" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 0 L4 4 M4 0 L0 4" stroke="var(--text-muted)" strokeWidth="0.5" opacity="0.5" />
        </pattern>
      </defs>

      {/* Sol / zone libre */}
      <rect x="0" y="0" width={W} height={H} rx="3" fill="rgba(200,150,92,0.07)" />

      {/* Lignes du terrain : 18 m de long × 9 m de large */}
      <rect
        x={LEFT_X}
        y={FREE}
        width={DEPTH * 2}
        height={DEPTH}
        fill="rgba(255,255,255,0.02)"
        stroke="var(--text-primary)"
        strokeWidth="1.4"
      />

      {/* Lignes d'attaque, à 3 m de chaque côté du filet */}
      <line x1={NET_X - ATTACK} y1={FREE} x2={NET_X - ATTACK} y2={FREE + DEPTH} stroke="var(--text-primary)" strokeWidth="0.9" />
      <line x1={NET_X + ATTACK} y1={FREE} x2={NET_X + ATTACK} y2={FREE + DEPTH} stroke="var(--text-primary)" strokeWidth="0.9" />

      {/* Ligne médiane (sous le filet) */}
      <line x1={NET_X} y1={FREE} x2={NET_X} y2={FREE + DEPTH} stroke="var(--text-primary)" strokeWidth="0.7" opacity="0.55" />

      {/* Filet + poteaux */}
      <rect x={NET_X - 0.9} y={FREE - 5} width="1.8" height={DEPTH + 10} fill="url(#vc-net)" />
      <line x1={NET_X} y1={FREE - 5} x2={NET_X} y2={FREE + DEPTH + 5} stroke="var(--text-primary)" strokeWidth="0.8" opacity="0.8" />
      <circle cx={NET_X} cy={FREE - 5} r="2" fill="var(--accent)" />
      <circle cx={NET_X} cy={FREE + DEPTH + 5} r="2" fill="var(--accent)" />

      {/* Numérotation des zones (3 × 3 par camp) */}
      {showZones &&
        teams.map(({ key, side }) => (
          <g key={`z-${key}`}>
            {Object.keys(ZONE_CELLS).map((z) => {
              const [depth, width] = ZONE_CELLS[z];
              const { x, y } = xyFrom(depth, width, side);
              return (
                <text
                  key={z}
                  x={x}
                  y={y + 1.4}
                  textAnchor="middle"
                  fontSize="4.4"
                  fontWeight="700"
                  fill="var(--text-muted)"
                  opacity="0.55"
                >
                  {z}
                </text>
              );
            })}
          </g>
        ))}

      {/* Les deux six */}
      {teams.map(({ key, side, onCourt, setter, label }) => (
        <g key={key}>
          {SPOTS.map((spot) => (
            <Player
              key={spot}
              spot={spot}
              info={onCourt?.[spot]}
              side={side}
              serving={serving === key && spot === 'P1'}
              setter={setter === spot}
              compact={compact}
              highlighted={activeTeam === key && !!activeNum && Number(onCourt?.[spot]?.number) === activeNum}
            />
          ))}
          {!compact && (
            <text
              x={side === 'left' ? LEFT_X + 2 : RIGHT_X - 2}
              y={FREE - 8}
              textAnchor={side === 'left' ? 'start' : 'end'}
              fontSize="6"
              fontWeight="800"
              fill="var(--text-secondary)"
            >
              {label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

