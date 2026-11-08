// Tableau croisé départ × arrivée enrichi : nb, part de la ligne, efficacité,
// couleur, option sous-zones, filtre attaquant, totaux de lignes et colonnes.

import { useMemo, useState } from 'react';
import { attackCrossMatrix } from '../utils/dvMatrices.js';

const CHIP = {
  border: '1px solid rgba(232,224,213,0.25)',
  background: 'transparent',
  color: 'inherit',
  borderRadius: 6,
  padding: '3px 9px',
  fontSize: 12,
  cursor: 'pointer',
};
const CHIP_ON = { ...CHIP, background: 'rgba(200,150,92,0.28)', borderColor: 'var(--accent)' };
const PRINT = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

function effBackground(eff) {
  if (eff >= 35) return 'rgba(52,211,153,0.28)';
  if (eff >= 10) return 'rgba(251,191,36,0.22)';
  if (eff < 0) return 'rgba(251,113,133,0.28)';
  return 'rgba(161,161,170,0.14)';
}

export default function CrossMatrixTable({ actions, team, onPick = null }) {
  const [bySubzone, setBySubzone] = useState(false);
  const [player, setPlayer] = useState('all');
  const players = useMemo(
    () => [...new Set((actions || []).filter((a) => a.action === 'A' && a.team === team).map((a) => Number(a.player_number)))]
      .filter((n) => n > 0).sort((a, b) => a - b),
    [actions, team]
  );
  const m = useMemo(
    () => attackCrossMatrix(actions, team, { bySubzone, player: player === 'all' ? null : player }),
    [actions, team, bySubzone, player]
  );
  const cols = bySubzone ? m.cols.filter((c) => m.colTotals[c]) : m.cols;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <button type="button" style={bySubzone ? CHIP_ON : CHIP} onClick={() => setBySubzone((v) => !v)}>
          Par sous-zone d’arrivée
        </button>
        <select value={player} onChange={(e) => setPlayer(e.target.value)} style={CHIP}>
          <option value="all">Tous les attaquants</option>
          {players.map((n) => <option key={n} value={n}>n°{n}</option>)}
        </select>
      </div>
      {m.total === 0 ? (
        <p className="dv-hint">Aucune attaque avec départ et arrivée codés.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="report report-compact" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Départ \ Arrivée</th>
                {cols.map((c) => <th key={c}>{c}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.filter((r) => m.rowTotals[r]).map((r) => (
                <tr key={r}>
                  <th>{r}</th>
                  {cols.map((c) => {
                    const cell = m.cells[`${r}|${c}`];
                    const rt = m.rowTotals[r];
                    return (
                      <td
                        key={c}
                        style={cell ? { background: effBackground(cell.efficiency), cursor: onPick ? 'pointer' : 'default', ...PRINT } : undefined}
                        title={cell ? `${r} → ${c} : ${cell.total} att., ${cell.points} pt, ${cell.errors} faute, ${cell.blocked} contrée, eff ${cell.efficiency}%` : ''}
                        onClick={cell && onPick ? () => onPick({ start: r, end: c, ...cell }) : undefined}
                      >
                        {cell ? (
                          <>
                            <strong>{cell.total}</strong>
                            <div style={{ fontSize: 9, opacity: 0.85 }}>
                              {Math.round((cell.total / rt.total) * 100)}% · {cell.efficiency}%
                            </div>
                          </>
                        ) : ''}
                      </td>
                    );
                  })}
                  <td style={{ fontWeight: 700 }}>
                    {m.rowTotals[r].total}
                    <div style={{ fontSize: 9, fontWeight: 400 }}>eff {m.rowTotals[r].efficiency}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="team-row">
                <th>Total</th>
                {cols.map((c) => <td key={c}>{m.colTotals[c] ? m.colTotals[c].total : ''}</td>)}
                <td><strong>{m.total}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="dv-hint" style={{ margin: '4px 0 0' }}>
        Cellule : nombre, part de la ligne, efficacité ((# − = − /) / total). Vert ≥ 35 %, rouge &lt; 0 %.
      </p>
    </div>
  );
}
