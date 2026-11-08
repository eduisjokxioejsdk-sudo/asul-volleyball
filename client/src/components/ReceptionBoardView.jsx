// Planche Réception : réceptionneurs (barre de qualité) et zones de réception.

import { useMemo } from 'react';
import EvalBar from './EvalBar';
import { receptionBoard } from '../utils/dvMatrices.js';

export default function ReceptionBoardView({ actions, team }) {
  const b = useMemo(() => receptionBoard(actions, team), [actions, team]);
  if (b.total === 0) return <p className="dv-hint">Aucune réception codée.</p>;
  return (
    <div>
      <table className="report report-compact">
        <thead>
          <tr>
            <th className="name">Réceptionneur</th>
            <th>Rec</th>
            <th>% pos</th>
            <th>% parf</th>
            <th>% faute</th>
            <th>Répartition</th>
          </tr>
        </thead>
        <tbody>
          {b.players.map((p) => (
            <tr key={p.number}>
              <td className="name">n°{String(p.number).padStart(2, '0')}</td>
              <td><strong>{p.total}</strong></td>
              <td>{p.positivePct}%</td>
              <td>{p.perfectPct}%</td>
              <td>{p.errorPct}%</td>
              <td><EvalBar byEval={p.byEval} total={p.total} width={140} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h5 style={{ marginTop: 10 }}>Zones de réception</h5>
      <table className="report report-compact">
        <thead>
          <tr><th>Zone</th><th>Rec</th><th>% pos</th><th>Répartition</th></tr>
        </thead>
        <tbody>
          {Object.entries(b.zones).sort((x, y) => Number(x[0]) - Number(y[0])).map(([z, v]) => (
            <tr key={z}>
              <td>{z}</td>
              <td>{v.total}</td>
              <td>{v.positivePct}%</td>
              <td><EvalBar byEval={v.byEval} total={v.total} width={140} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
