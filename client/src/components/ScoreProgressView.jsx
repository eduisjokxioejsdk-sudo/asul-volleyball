// Évolution du score : courbe de l'écart point par point pour chaque set, avec
// séries, plus gros écart, temps morts / remplacements et money-time.

import { useMemo } from 'react';
import { computeMoneyTimeSplit, computeScoreProgress } from '../utils/dvAnalytics4.js';
import { prepareRallies } from '../utils/dvAnalytics.js';

const W = 360;
const H = 90;

function SetCurve({ entry, names, events }) {
  const pts = entry.points;
  const max = Math.max(3, ...pts.map((p) => Math.abs(p.diff)));
  const x = (i) => (pts.length <= 1 ? W / 2 : 8 + (i / (pts.length - 1)) * (W - 16));
  const y = (d) => H / 2 - (d / max) * (H / 2 - 8);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.diff)}`).join(' ');
  const marks = (events || []).filter((e) => Number(e.set_number || 1) === entry.set);
  return (
    <div style={{ marginBottom: 14 }}>
      <strong style={{ fontSize: 12 }}>
        Set {entry.set} : {entry.final.home}–{entry.final.away}
      </strong>
      <span className="dv-hint" style={{ marginLeft: 8 }}>
        plus longue série : {entry.longestRun.side === 'home' ? names.home : names.away} ({entry.longestRun.len}) · plus gros écart : {entry.maxLead.side === 'home' ? names.home : names.away} (+{entry.maxLead.gap}) · {entry.moneyPoints} point(s) en money-time
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560, display: 'block', background: 'rgba(32,30,27,0.6)', borderRadius: 6 }}>
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(232,224,213,0.3)" strokeDasharray="3 3" />
        <text x="4" y="10" fontSize="8" fill="rgba(255,255,255,0.6)">{names.home}</text>
        <text x="4" y={H - 4} fontSize="8" fill="rgba(255,255,255,0.6)">{names.away}</text>
        {pts.map((p, i) => p.moneyTime && (
          <rect key={`m${i}`} x={x(i) - 2} y="0" width="4" height={H} fill="rgba(251,191,36,0.14)" />
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
        {marks.map((e, i) => {
          const idx = Math.min(pts.length - 1, Math.max(0, Number(e.point_number || 1) - 1));
          return (
            <g key={`e${i}`}>
              <line x1={x(idx)} y1="0" x2={x(idx)} y2={H} stroke={e.kind === 'timeout' ? '#60a5fa' : '#a78bfa'} strokeWidth="0.8" />
              <text x={x(idx) + 2} y="18" fontSize="7" fill={e.kind === 'timeout' ? '#60a5fa' : '#a78bfa'}>{e.kind === 'timeout' ? 'TM' : 'R'}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ScoreProgressView({ actions, setups, names, events = [] }) {
  const prep = useMemo(() => prepareRallies(actions, setups), [actions, setups]);
  const progress = useMemo(() => computeScoreProgress(actions, setups, prep), [actions, setups, prep]);
  const split = useMemo(() => computeMoneyTimeSplit(actions, setups, prep), [actions, setups, prep]);
  if (progress.length === 0) return <p className="dv-hint">Aucun point terminé.</p>;
  return (
    <div>
      {progress.map((e) => <SetCurve key={e.set} entry={e} names={names} events={events} />)}
      <p className="dv-hint">Courbe : écart de score (au-dessus de la ligne = {names.home} devant). Bande jaune : money-time. TM : temps mort, R : remplacement.</p>
      <h5>Money-time contre reste du match</h5>
      <table className="report report-compact">
        <thead><tr><th className="name">Équipe</th><th>Phase</th><th>Rallies</th><th>Gagnés</th><th>% gagnés</th><th>Attaques</th><th>Eff</th></tr></thead>
        <tbody>
          {['home', 'away'].flatMap((s) => ['money', 'rest'].map((k) => {
            const b = split[s][k];
            return (
              <tr key={`${s}${k}`}>
                <td className="name">{names[s]}</td><td>{k === 'money' ? 'Money-time' : 'Reste'}</td>
                <td>{b.rallies}</td><td>{b.won}</td><td>{b.winPct}%</td><td>{b.attacks}</td><td>{b.efficiency}%</td>
              </tr>
            );
          }))}
        </tbody>
      </table>
    </div>
  );
}
