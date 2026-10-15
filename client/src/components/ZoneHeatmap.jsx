// ============================================================================
// Carte de zones générique : demi-terrain DataVolley où chaque zone affiche un
// compteur (et un pourcentage) sous forme de « heatmap ».
//
// Utilisée par les rapports : service (zone cible), réception (zone lue),
// attaque (zone de départ) et attaque visée, contre, défense.
// ============================================================================

import { DV_ZONE_GRID, DV_ZONE_LABELS } from '../utils/datavolley';

const W = 360;
const NET_H = 22;
const COL_W = 120;
const ROW_H = 90;
const ROW_KEYS = ['net', 'mid', 'back'];

/** Couleur de la cellule selon sa part (0 → 1) : du neutre au chaud. */
export function heatColor(pct) {
  const p = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
  if (p === 0) return { fill: 'rgba(200,150,92,0.05)', stroke: 'rgba(200,150,92,0.25)' };
  if (p < 0.2) return { fill: 'rgba(200,150,92,0.12)', stroke: 'rgba(200,150,92,0.4)' };
  if (p < 0.4) return { fill: 'rgba(200,150,92,0.24)', stroke: 'rgba(232,163,61,0.5)' };
  if (p < 0.6) return { fill: 'rgba(232,163,61,0.34)', stroke: 'rgba(232,163,61,0.65)' };
  return { fill: 'rgba(232,104,61,0.42)', stroke: 'rgba(232,104,61,0.8)' };
}

function cellOf(zone) {
  const z = String(zone);
  for (let r = 0; r < DV_ZONE_GRID.length; r += 1) {
    const c = DV_ZONE_GRID[r].indexOf(z);
    if (c !== -1) return { rowKey: ROW_KEYS[r] || 'back', col: c };
  }
  return null;
}

/**
 * @param {Object} props
 * @param {Object} props.zones - { '5': 3, '1': 1 } compteurs par zone
 * @param {string} [props.title] - titre affiché au-dessus du filet
 * @param {boolean} [props.showPct] - afficher aussi le pourcentage
 * @param {string} [props.unit] - unité des compteurs (« flèches », « actions »)
 */
export default function ZoneHeatmap({ zones = {}, title = '', showPct = true, unit = 'actions' }) {
  const total = Object.values(zones).reduce((s, v) => s + (Number(v) || 0), 0);
  const height = NET_H + ROW_H * 3 + 8;
  const rows = ROW_KEYS;
  const pctOf = (v) => (total ? Math.round((v / total) * 1000) / 10 : 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="zone-heatmap"
      role="img"
      aria-label={`Répartition par zones${title ? ` — ${title}` : ''}`}
    >
      <rect x="0" y="0" width={W} height={height} rx="10" fill="rgba(32,30,27,0.85)" />
      <rect x="0" y="0" width={W} height={NET_H} fill="rgba(200,150,92,0.16)" />
      <text x={W / 2} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-muted)">
        {title || 'FILET'}
      </text>
      {/* Ligne des 3 m, au-dessus de la rangée arrière */}
      <line
        x1="0"
        y1={NET_H + ROW_H * 2}
        x2={W}
        y2={NET_H + ROW_H * 2}
        stroke="rgba(232,224,213,0.18)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />

      {DV_ZONE_GRID.flat().map((zone) => {
        const cell = cellOf(zone);
        if (!cell) return null;
        const rowIndex = rows.indexOf(cell.rowKey);
        const x = cell.col * COL_W;
        const y = NET_H + rowIndex * ROW_H;
        const count = Number(zones[zone]) || 0;
        const pct = pctOf(count);
        const heat = heatColor(pct);
        return (
          <g key={zone}>
            <title>{`Zone ${zone} — ${DV_ZONE_LABELS[zone] || ''} : ${count} ${unit}${count ? ` (${pct} %)` : ''}`}</title>
            <rect
              x={x + 3}
              y={y + 3}
              width={COL_W - 6}
              height={ROW_H - 6}
              rx="7"
              fill={heat.fill}
              stroke={heat.stroke}
              strokeWidth="1"
            />
            <text x={x + 14} y={y + 22} fontSize="13" fontWeight="800" fill="var(--text-secondary)">
              {zone}
            </text>
            <text x={x + COL_W / 2} y={y + ROW_H / 2 + 12} textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text-primary)">
              {count || ''}
            </text>
            {showPct && count > 0 && (
              <text x={x + COL_W / 2} y={y + ROW_H / 2 + 30} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                {pct} %
              </text>
            )}
          </g>
        );
      })}

      <text x={W - 6} y={height - 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">
        {total} {unit} · ligne des 3 m
      </text>
    </svg>
  );
}