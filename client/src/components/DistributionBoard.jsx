// ============================================================================
// Planche de distribution : les 6 rotations (P1..P6) + Total côte à côte, chacune
// avec les 9 zones d'attaque (part de ballons, efficacité), et tableau par
// attaquant. Les données viennent de computeSetterDistributionByRotation /
// computeDistributionByPlayer.
// ============================================================================

import { useState } from 'react';
import { ATTACK_ZONES, SITUATIONS } from '../utils/distribution';
import { DV_ZONE_GRID } from '../utils/datavolley';

const POSITIONS = ['Total', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const CELL = 34;
const NET = 12;

/** Fusionne les situations choisies d'une rotation en une cellule par zone. */
function mergeZones(side, situations) {
  const out = {};
  let total = 0;
  for (const z of ATTACK_ZONES) {
    const m = { count: 0, points: 0, errors: 0, blocked: 0 };
    for (const sit of situations) {
      const c = side?.[sit]?.[z.id];
      if (!c) continue;
      m.count += c.count;
      m.points += c.points;
      m.errors += c.errors;
      m.blocked += c.blocked;
    }
    out[z.id] = m;
    total += m.count;
  }
  return { zones: out, total };
}

function MiniFan({ side, situations }) {
  const { zones, total } = mergeZones(side, situations);
  const max = Math.max(1, ...Object.values(zones).map((z) => z.count));
  return (
    <svg viewBox={`0 0 ${CELL * 3} ${NET + CELL * 3}`} style={{ width: '100%', display: 'block' }}>
      <rect width={CELL * 3} height={NET} fill="rgba(200,150,92,0.16)" />
      {DV_ZONE_GRID.map((row, r) =>
        row.map((zone, c) => {
          const m = zones[zone];
          const pct = total ? Math.round((m.count / total) * 100) : 0;
          const eff = m.count ? Math.round(((m.points - m.errors - m.blocked) / m.count) * 100) : 0;
          const alpha = m.count ? 0.1 + 0.6 * (m.count / max) : 0.03;
          return (
            <g key={zone} transform={`translate(${c * CELL},${NET + r * CELL})`}>
              <rect width={CELL} height={CELL} fill={`rgba(200,150,92,${alpha})`} stroke="rgba(232,224,213,0.15)" />
              <text x="3" y="8" fontSize="6" fill="rgba(255,255,255,0.55)">{zone}</text>
              {m.count > 0 && (
                <>
                  <text x={CELL / 2} y="19" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{pct}%</text>
                  <text x={CELL / 2} y="29" textAnchor="middle" fontSize="6" fill={eff >= 35 ? '#34d399' : eff < 0 ? '#fb7185' : '#d4d4d8'}>
                    {m.count} · {eff}%
                  </text>
                </>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

export function RotationBoard({ distribution }) {
  const [sit, setSit] = useState('ALL');
  const situations = sit === 'ALL' ? SITUATIONS : [sit];
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', ...SITUATIONS].map((s) => (
          <button key={s} type="button" className={`btn btn-sm ${sit === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSit(s)}>
            {s === 'ALL' ? 'Toutes réceptions' : `Réception ${s}`}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
        {POSITIONS.map((pos) => (
          <div key={pos}>
            <strong style={{ fontSize: 12 }}>{pos === 'Total' ? 'Toutes rotations' : `Passeur en ${pos}`}</strong>
            <MiniFan side={distribution?.[pos]} situations={situations} />
          </div>
        ))}
      </div>
    </div>
  );
}
export function PlayerDistributionTable({ rows = [] }) {
  if (!rows.length) return <p className="dv-hint">Aucune attaque pour ces filtres.</p>;
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Attaquant</th>
          <th>Ballons</th>
          <th>Part</th>
          <th>Après +</th>
          <th>Après 0</th>
          <th>Après −</th>
          <th>Pts</th>
          <th>Pts %</th>
          <th>Eff %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.number}>
            <td className="name">n°{String(r.number).padStart(2, '0')}</td>
            <td><strong>{r.count}</strong></td>
            <td>
              <span style={{ display: 'inline-block', height: 6, width: Math.max(2, r.pct), background: 'var(--accent)', marginRight: 4 }} />
              {r.pct}%
            </td>
            <td>{r.bySituation['+']}</td>
            <td>{r.bySituation['0']}</td>
            <td>{r.bySituation['-']}</td>
            <td>{r.points}</td>
            <td>{r.killPct}%</td>
            <td>{r.eff}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


function TendencyBlock({ title, data }) {
  return (
    <div>
      <strong style={{ fontSize: 12 }}>{title} ({data.total} ballon(s))</strong>
      {data.rows.length === 0 ? (
        <p className="dv-hint" style={{ margin: '4px 0' }}>Aucune donnée.</p>
      ) : (
        data.rows.slice(0, 6).map((r) => (
          <div key={r.number} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 3 }}>
            <span style={{ width: 34 }}>n°{String(r.number).padStart(2, '0')}</span>
            <span style={{ display: 'inline-block', height: 7, width: Math.max(2, r.pct * 1.4), background: 'var(--accent)' }} />
            <span>{r.pct}% ({r.count})</span>
          </div>
        ))
      )}
    </div>
  );
}

/** Tendances du passeur : après un point gagné / perdu, et après un échec. */
export function SetterTendencies({ data }) {
  if (!data) return null;
  const f = data.afterFail;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginTop: 6 }}>
      <TendencyBlock title="Après un point gagné" data={data.afterWin} />
      <TendencyBlock title="Après un point perdu" data={data.afterLoss} />
      <div>
        <strong style={{ fontSize: 12 }}>Après un échec d’attaque</strong>
        <p style={{ fontSize: 11, margin: '4px 0' }}>
          {f.total
            ? `Le même attaquant est resollicité ${f.samePct}% du temps (${f.same}/${f.total}).`
            : 'Aucune attaque ratée suivie d’une autre attaque.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Éventail du passeur : une flèche du passeur (au filet, entre les zones 2 et 3)
 * vers chaque zone d'attaque. Épaisseur = part des ballons, couleur = efficacité.
 */
export function SetterFan({ side, passZones = {}, situations: situationsProp = null }) {
  const [sit, setSit] = useState('ALL');
  const situations = situationsProp || (sit === 'ALL' ? SITUATIONS : [sit]);
  const { zones, total } = mergeZones(side, situations);
  const W = CELL * 3;
  const H = NET + CELL * 3;
  const topPass = Object.entries(passZones || {}).sort((a, b) => b[1] - a[1])[0];
  const passCell = topPass ? DV_ZONE_GRID.flatMap((row, r) => row.map((z, c) => ({ z, r, c }))).find((x) => x.z === topPass[0]) : null;
  const origin = passCell
    ? { x: passCell.c * CELL + CELL / 2, y: NET + passCell.r * CELL + CELL / 2 }
    : { x: W * 0.72, y: NET + 2 };
  const max = Math.max(1, ...Object.values(zones).map((z) => z.count));
  return (
    <div>
      {!situationsProp && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {['ALL', ...SITUATIONS].map((s) => (
            <button key={s} type="button" className={`btn btn-sm ${sit === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSit(s)}>
              {s === 'ALL' ? 'Toutes réceptions' : `Réception ${s}`}
            </button>
          ))}
        </div>
      )}
      <p className="dv-hint" style={{ margin: '0 0 6px' }}>
        {passCell
          ? `Le passeur est placé sur la zone de passe la plus fréquente (zone ${topPass[0]}, ${topPass[1]} passe(s)).`
          : 'Zone de passe inconnue : le passeur est placé au filet.'}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 420, display: 'block' }}>
      <rect width={W} height={H} fill="rgba(32,30,27,0.85)" />
      <rect width={W} height={NET} fill="rgba(200,150,92,0.16)" />
      {DV_ZONE_GRID.map((row, r) =>
        row.map((zone, c) => {
          const m = zones[zone];
          const cx = c * CELL + CELL / 2;
          const cy = NET + r * CELL + CELL / 2;
          const pct = total ? Math.round((m.count / total) * 100) : 0;
          const eff = m.count ? Math.round(((m.points - m.errors - m.blocked) / m.count) * 100) : 0;
          const color = eff >= 35 ? '#34d399' : eff < 0 ? '#fb7185' : '#fbbf24';
          return (
            <g key={zone}>
              <rect x={c * CELL} y={NET + r * CELL} width={CELL} height={CELL} fill="none" stroke="rgba(232,224,213,0.12)" />
              {m.count > 0 && (
                <>
                  <line
                    x1={origin.x}
                    y1={origin.y}
                    x2={cx}
                    y2={cy - 4}
                    stroke={color}
                    strokeWidth={0.8 + 4 * (m.count / max)}
                    strokeLinecap="round"
                    opacity="0.8"
                  />
                  <text x={cx} y={cy + 6} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{pct}%</text>
                  <text x={cx} y={cy + 14} textAnchor="middle" fontSize="5.5" fill="rgba(255,255,255,0.75)">{m.count} · eff {eff}%</text>
                </>
              )}
            </g>
          );
        })
      )}
      <circle cx={origin.x} cy={origin.y} r="3.5" fill="var(--accent)" stroke="#fff" strokeWidth="0.8" />
      </svg>
    </div>
  );
}
