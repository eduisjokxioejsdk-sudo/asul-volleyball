// Fiche individuelle : sélecteur de joueur, statistiques par compétence,
// trajectoires d'attaque et de service, zones de réception.

import { useMemo, useState } from 'react';
import EvalBar from './EvalBar';
import TrajectoryMap from './DvTrajectoryMap';
import { buildShots, summarizeShots } from '../utils/dvTrajectories.js';

const SKILLS = [
  ['S', 'Service'], ['R', 'Réception'], ['A', 'Attaque'], ['B', 'Contre'], ['D', 'Défense'], ['E', 'Passe'],
];
const nn = (n) => `n°${String(n).padStart(2, '0')}`;

function skillStats(actions, team, player, code) {
  const list = actions.filter((a) => a.team === team && Number(a.player_number) === player && a.action === code);
  const byEval = {};
  for (const a of list) byEval[a.evaluation || ''] = (byEval[a.evaluation || ''] || 0) + 1;
  const total = list.length;
  const k = byEval['#'] || 0;
  const e = byEval['='] || 0;
  const b = byEval['/'] || 0;
  const pos = (byEval['#'] || 0) + (byEval['+'] || 0);
  return { total, byEval, kills: k, errors: e, blocked: b,
    positivePct: total ? Math.round((pos / total) * 100) : 0,
    efficiency: total ? Math.round(((k - e - b) / total) * 100) : 0 };
}

export default function PlayerSheet({ actions = [], names = {}, initialTeam = 'home' }) {
  const [team, setTeam] = useState(initialTeam);
  const numbers = useMemo(
    () => [...new Set(actions.filter((a) => a.team === team).map((a) => Number(a.player_number)))]
      .filter((n) => n > 0).sort((a, b) => a - b),
    [actions, team]
  );
  const [player, setPlayer] = useState(null);
  const current = numbers.includes(player) ? player : numbers[0] || null;

  const rows = useMemo(
    () => (current ? SKILLS.map(([c, l]) => ({ code: c, label: l, ...skillStats(actions, team, current, c) })).filter((r) => r.total > 0) : []),
    [actions, team, current]
  );
  const attackShots = useMemo(() => (current ? buildShots(actions, { team, skill: 'A', player: current }) : []), [actions, team, current]);
  const serveShots = useMemo(() => (current ? buildShots(actions, { team, skill: 'S', player: current }) : []), [actions, team, current]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        {['home', 'away'].map((t) => (
          <button key={t} type="button" className={`btn btn-sm ${team === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTeam(t); setPlayer(null); }}>
            {names[t] || (t === 'home' ? 'Domicile' : 'Extérieur')}
          </button>
        ))}
        <select value={current ?? ''} onChange={(e) => setPlayer(Number(e.target.value))} className="btn btn-sm btn-secondary">
          {numbers.map((n) => <option key={n} value={n}>{nn(n)}</option>)}
        </select>
      </div>
      {!current ? <p className="dv-hint">Aucun joueur avec des actions.</p> : (
        <>
          <table className="report report-compact">
            <thead>
              <tr><th className="name">{nn(current)}</th><th>Tot</th><th>Pts</th><th>Fautes</th><th>Contrées</th><th>% pos</th><th>Eff</th><th>Répartition</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="name">{r.label}</td><td>{r.total}</td><td>{r.kills}</td><td>{r.errors}</td><td>{r.blocked}</td>
                  <td>{r.positivePct}%</td><td>{r.efficiency}%</td>
                  <td><EvalBar byEval={r.byEval} total={r.total} width={130} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, marginTop: 10 }}>
            <div>
              <strong style={{ fontSize: 12 }}>Attaque</strong>
              {attackShots.length ? (
                <>
                  <TrajectoryMap shots={attackShots} compact teamSide={team} />
                  <div style={{ fontSize: 11, textAlign: 'center' }}>{summarizeShots(attackShots).total} direction(s) · eff {summarizeShots(attackShots).efficiency}%</div>
                </>
              ) : <p className="dv-hint">Aucune direction d’attaque.</p>}
            </div>
            <div>
              <strong style={{ fontSize: 12 }}>Service</strong>
              {serveShots.length ? <TrajectoryMap shots={serveShots} compact teamSide={team} /> : <p className="dv-hint">Aucune direction de service.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
