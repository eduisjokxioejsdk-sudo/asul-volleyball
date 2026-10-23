import { ATTACK_ZONES, SITUATIONS } from '../utils/distribution';
import { DV_ZONE_GRID, DV_ZONE_LABELS } from '../utils/datavolley';

const W = 360;
const NET_H = 22;
const COL_W = 120;
const ROW_H = 90;

// Numérotation officielle DataVolley : grille 3 × 3, filet en haut.
//   4  3  2
//   7  8  9
//   5  6  1
const GRID_ROW_KEYS = ['net', 'mid', 'back'];

/** Position d'une zone dans la grille DataVolley (ligne de grille + colonne). */
function zoneCell(zone) {
  const z = String(zone);
  for (let r = 0; r < DV_ZONE_GRID.length; r += 1) {
    const c = DV_ZONE_GRID[r].indexOf(z);
    if (c !== -1) return { gridRow: r, col: c, rowKey: GRID_ROW_KEYS[r] || 'back' };
  }
  return null;
}

/** Zones non tracées sur le terrain de l'onglet Distribution. */
export const HIDDEN_DISTRIBUTION_ZONES = ['5', '7', '8', '9'];

/**
 * Géométrie du terrain pour une liste de zones : les lignes sans zone affichée
 * (ici la bande médiane 7/8/9) sont supprimées, la ligne des 3 m se replace sous
 * la dernière ligne avant.
 */
function buildCourtGeometry(zones) {
  const rows = GRID_ROW_KEYS.filter((key) => zones.some((z) => zoneCell(z.id)?.rowKey === key));
  const height = NET_H + rows.length * ROW_H + 8;
  const backIndex = rows.indexOf('back');
  const threeMeterY = NET_H + (backIndex >= 0 ? backIndex : rows.length) * ROW_H;
  const rectOf = (zone) => {
    const cell = zoneCell(zone);
    if (!cell) return null;
    const rowIndex = rows.indexOf(cell.rowKey);
    if (rowIndex === -1) return null;
    return { x: cell.col * COL_W, y: NET_H + rowIndex * ROW_H, w: COL_W, h: ROW_H };
  };
  return { rows, height, threeMeterY, rectOf };
}

function CourtBase({ children, height = NET_H + ROW_H * 3 + 8, threeMeterY = NET_H + ROW_H * 2 }) {
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <rect x="0" y="0" width={W} height={height} rx="10" fill="rgba(32,30,27,0.85)" />
      <rect x="0" y="0" width={W} height={NET_H} fill="rgba(200,150,92,0.16)" />
      <text x={W / 2} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-muted)">FILET</text>
      <line
        x1="0"
        y1={threeMeterY}
        x2={W}
        y2={threeMeterY}
        stroke="rgba(232,224,213,0.18)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text x={W - 6} y={threeMeterY - 5} textAnchor="end" fontSize="9" fill="var(--text-muted)">
        ligne des 3 m
      </text>
      {children}
    </svg>
  );
}

// Demi-terrain cliquable (correction manuelle de la zone d'une action).
export function AttackCourtPicker({ onPick, selected }) {
  const geometry = buildCourtGeometry(ATTACK_ZONES);
  return (
    <CourtBase height={geometry.height} threeMeterY={geometry.threeMeterY}>
      {ATTACK_ZONES.map((z) => {
        const r = geometry.rectOf(z.id);
        if (!r) return null;
        const active = String(selected || '') === z.id;
        return (
          <g key={z.id} onClick={() => onPick(z.id)} style={{ cursor: 'pointer' }}>
            <rect
              className="court-zone-hover"
              x={r.x + 2}
              y={r.y + 2}
              width={r.w - 4}
              height={r.h - 4}
              rx="6"
              fill={active ? 'rgba(200,150,92,0.28)' : 'rgba(200,150,92,0.07)'}
              stroke={active ? 'var(--accent)' : 'rgba(200,150,92,0.35)'}
              strokeWidth={active ? 2 : 1}
            />
            <text x={r.x + r.w / 2} y={r.y + 22} textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--text-primary)">
              {z.label}
            </text>
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 18} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
              {DV_ZONE_LABELS[z.id] || ''}
            </text>
          </g>
        );
      })}
    </CourtBase>
  );
}

// Demi-terrain d'analyse : chaque zone affiche 3 colonnes (+, 0, −) = nb + % + eff%.
export function DistributionCourt({ distribution, hidden = HIDDEN_DISTRIBUTION_ZONES }) {
  const zones = ATTACK_ZONES.filter((z) => !hidden.includes(z.id));
  const geometry = buildCourtGeometry(zones);

  return (
    <>
      <CourtBase height={geometry.height} threeMeterY={geometry.threeMeterY}>
        {zones.map((z) => {
          const r = geometry.rectOf(z.id);
          if (!r) return null;
          const colW = (r.w - 4) / 3;
          return (
            <g key={z.id}>
              <rect
                x={r.x + 2}
                y={r.y + 2}
                width={r.w - 4}
                height={r.h - 4}
                rx="3"
                fill="rgba(24,24,27,0.75)"
                stroke="rgba(245,158,11,0.22)"
                strokeWidth="1"
              />
              <text x={r.x + r.w / 2} y={r.y + 15} textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--accent)">
                Zone {z.label}
              </text>
              {SITUATIONS.map((sit, si) => {
                const cell = distribution?.[sit]?.[z.id] || { count: 0, pct: 0, eff: 0, topCombo: null };
                const cx = r.x + 2 + colW * si + colW / 2;
                const effColor = cell.eff >= 35 ? '#10b981' : cell.eff < 0 ? '#f43f5e' : '#a1a1aa';
                return (
                  <g key={sit}>
                    <text x={cx} y={r.y + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--text-muted)">
                      {sit}
                    </text>
                    <text x={cx} y={r.y + 47} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text-primary)">
                      {cell.count}
                    </text>
                    <text x={cx} y={r.y + 62} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fbbf24">
                      {cell.pct}%
                    </text>
                    {cell.count > 0 && (
                      <text x={cx} y={r.y + 75} textAnchor="middle" fontSize="8" fontWeight="700" fill={effColor}>
                        Eff {cell.eff}%{cell.topCombo ? ` · ${cell.topCombo}` : ''}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </CourtBase>
      {hidden.length > 0 && (
        <p className="dv-hint" style={{ marginTop: 6 }}>
          Zones {hidden.join(', ')} masquées — les pourcentages portent sur l’ensemble des zones. Zones analysées :{' '}
          {zones.map((z) => z.label).join(' · ')}.
        </p>
      )}
    </>
  );
}

/**
 * Terrain d'analyse des directions : une flèche par direction agrégée (départ → arrivée).
 */
export function DirectionMap({ rows = [], onPick, title = 'Directions d’attaque' }) {
  const height = NET_H + ROW_H * 3;
  const max = rows.reduce((m, r) => Math.max(m, Number(r.total) || 0), 1);
  const centerOf = (zone) => {
    const cell = zoneCell(zone);
    if (!cell) return null;
    return { x: cell.col * COL_W + COL_W / 2, y: NET_H + cell.gridRow * ROW_H + ROW_H / 2 };
  };
  const allZones = DV_ZONE_GRID.flat();

  return (
    <div className="dirc dirc-map">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
        <defs>
          <marker id="dirc-map-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
          </marker>
        </defs>
        <rect x="0" y="0" width={W} height={height} rx="10" fill="rgba(32,30,27,0.85)" />
        <rect x="0" y="0" width={W} height={NET_H} fill="rgba(200,150,92,0.16)" />
        <text x={W / 2} y="15" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-muted)">
          FILET
        </text>
        {allZones.map((zone) => {
          const cell = zoneCell(zone);
          if (!cell) return null;
          const x = cell.col * COL_W;
          const y = NET_H + cell.gridRow * ROW_H;
          return (
            <g key={zone}>
              <rect
                x={x + 2}
                y={y + 2}
                width={COL_W - 4}
                height={ROW_H - 4}
                rx="6"
                fill="rgba(232,224,213,0.03)"
                stroke="rgba(232,224,213,0.12)"
              />
              <text
                x={x + COL_W / 2}
                y={y + ROW_H / 2 + 5}
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
                markerEnd="url(#dirc-map-arrow)"
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
