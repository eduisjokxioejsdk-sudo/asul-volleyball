// Vues : side-out / break par rotation et 1re attaque selon la réception.

import { useMemo } from 'react';
import { computeSideOutBreak } from '../utils/dvAnalytics.js';
import { attackByReception } from '../utils/dvAnalytics2.js';

const ROTS = ['Total', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const CATS = [
  ['ace', 'Aces'], ['attack', 'Attaques'], ['block', 'Contres'], ['opponentError', 'Fautes adverses'], ['other', 'Autres'],
];
const QUALITIES = ['#', '+', '!', '-', '/', '='];
const nn = (n) => `n°${String(n).padStart(2, '0')}`;

function Pct({ value, good = 60 }) {
  const color = value >= good ? '#34d399' : value >= good - 20 ? '#fbbf24' : '#fb7185';
  return <strong style={{ color }}>{value}%</strong>;
}

/** Side-out et break par rotation. */
export function SideOutBreakView({ actions, setups, team }) {
  const data = useMemo(() => computeSideOutBreak(actions, setups)[team], [actions, setups, team]);
  return (
    <div>
      <table className="report report-compact">
        <thead>
          <tr>
            <th className="name">Rotation</th><th>Rallies</th>
            <th>Side-out</th><th>% SO</th><th>Break</th><th>% BK</th><th>Pts</th>
            {CATS.map(([k, l]) => <th key={k} title={`Points gagnés : ${l}`}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {ROTS.map((k) => {
            const r = data[k];
            if (!r || r.rallies === 0) return null;
            return (
              <tr key={k} className={k === 'Total' ? 'team-row' : ''}>
                <td className="name">{k === 'Total' ? 'Total' : `Passeur ${k}`}</td>
                <td>{r.rallies}</td>
                <td>{r.sideOutWon}/{r.sideOutOpp}</td>
                <td><Pct value={r.sideOutPct} good={60} /></td>
                <td>{r.breakWon}/{r.breakOpp}</td>
                <td><Pct value={r.breakPct} good={40} /></td>
                <td>{r.points}</td>
                {CATS.map(([c]) => <td key={c}>{r.wonBy[c] || ''}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="dv-hint" style={{ margin: '4px 0 0' }}>
        Side-out : point gagné en réception. Break : point gagné au service. Rotation = position du passeur.
      </p>
    </div>
  );
}

/** Efficacité de la 1re attaque selon la qualité de réception. */
export function AttackByReceptionView({ actions, setups, team }) {
  const data = useMemo(() => attackByReception(actions, setups)[team], [actions, setups, team]);
  const rows = QUALITIES.filter((q) => data.byQuality[q]);
  if (rows.length === 0) return <p className="dv-hint">Aucune attaque après réception.</p>;
  const players = Object.keys(data.byPlayer).map(Number).sort((a, b) => a - b);
  return (
    <div>
      <table className="report report-compact">
        <thead>
          <tr><th className="name">Réception</th><th>Att.</th><th>Pts</th><th>Fautes</th><th>Contrées</th><th>% pts</th><th>Eff</th></tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const c = data.byQuality[q];
            return (
              <tr key={q}>
                <td className="name">Réception {q}</td><td>{c.total}</td><td>{c.points}</td>
                <td>{c.errors}</td><td>{c.blocked}</td><td>{c.killPct}%</td><td><Pct value={c.efficiency} good={30} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h5 style={{ marginTop: 10 }}>Par attaquant (efficacité selon la réception)</h5>
      <table className="report report-compact">
        <thead>
          <tr><th className="name">Attaquant</th>{rows.map((q) => <th key={q}>Rec {q}</th>)}</tr>
        </thead>
        <tbody>
          {players.map((n) => (
            <tr key={n}>
              <td className="name">{nn(n)}</td>
              {rows.map((q) => {
                const c = data.byPlayer[n][q];
                return <td key={q}>{c ? `${c.total} · ${c.efficiency}%` : ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
