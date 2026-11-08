// Rapports cumulés (suite) : 1re attaque selon la réception, duel service /
// réception, contre et passe, calculés match par match puis additionnés.

import { useMemo } from 'react';
import EvalBar from './EvalBar';
import {
  cumulativeAttackByReception,
  cumulativeBlockAndSet,
  cumulativeServeReceptionDuel,
} from '../utils/multiMatchAnalytics.js';

const QUALITIES = ['#', '+', '!', '-', '/', '='];
const nn = (n) => `n°${String(n).padStart(2, '0')}`;

export default function MultiMatchTeamView2({ prepared, side }) {
  const att = useMemo(() => cumulativeAttackByReception(prepared), [prepared]);
  const duel = useMemo(() => cumulativeServeReceptionDuel(prepared), [prepared]);
  const bs = useMemo(() => cumulativeBlockAndSet(prepared), [prepared]);
  const qualities = att ? QUALITIES.filter((q) => att[side].byQuality[q]) : [];
  const servers = duel ? Object.entries(duel[side].servers).sort((a, b) => b[1].total - a[1].total) : [];
  const receivers = duel ? Object.entries(duel[side].receivers).sort((a, b) => b[1].total - a[1].total) : [];
  const block = bs?.block?.[side];
  const calls = bs ? Object.entries(bs.set[side].byCall).sort((a, b) => b[1].total - a[1].total) : [];

  return (
    <div>
      <h5 style={{ marginTop: 14 }}>1re attaque selon la réception (cumul)</h5>
      {qualities.length === 0 ? <p className="dv-hint">Aucune attaque après réception.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Réception</th><th>Att.</th><th>Pts</th><th>Fautes</th><th>Contrées</th><th>% pts</th><th>Eff</th></tr></thead>
          <tbody>
            {qualities.map((q) => {
              const c = att[side].byQuality[q];
              return (
                <tr key={q}>
                  <td className="name">Réception {q}</td><td>{c.total}</td><td>{c.points}</td>
                  <td>{c.errors}</td><td>{c.blocked}</td><td>{c.killPct}%</td><td>{c.efficiency}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h5 style={{ marginTop: 14 }}>Serveurs (cumul)</h5>
      {servers.length === 0 ? <p className="dv-hint">Aucun service.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Serveur</th><th>Serv.</th><th>Aces</th><th>Fautes</th><th>Réception adverse</th></tr></thead>
          <tbody>
            {servers.map(([n, s]) => (
              <tr key={n}><td className="name">{nn(n)}</td><td>{s.total}</td><td>{s.aces}</td><td>{s.errors}</td><td><EvalBar byEval={s.byRecQuality} width={140} /></td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h5 style={{ marginTop: 14 }}>Réceptionneurs (cumul)</h5>
      {receivers.length === 0 ? <p className="dv-hint">Aucune réception.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Réceptionneur</th><th>Rec.</th><th>Qualité</th></tr></thead>
          <tbody>
            {receivers.map(([n, r]) => (
              <tr key={n}><td className="name">{nn(n)}</td><td>{r.total}</td><td><EvalBar byEval={r.byQuality} width={140} /></td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h5 style={{ marginTop: 14 }}>Contre et passe (cumul)</h5>
      <p className="dv-hint" style={{ margin: '0 0 4px' }}>
        {block && block.total > 0
          ? `Contres : ${block.total} dont ${block.points} gagnant(s) (${block.pointsPct}%), ${block.touches} touché(s), ${block.errors} faute(s).`
          : 'Aucun contre codé.'}
      </p>
      {calls.length > 0 && (
        <table className="report report-compact">
          <thead><tr><th className="name">Appel</th><th>Att.</th><th>Pts</th><th>% pts</th><th>Eff</th></tr></thead>
          <tbody>
            {calls.map(([c, r]) => (
              <tr key={c}><td className="name">{c}</td><td>{r.total}</td><td>{r.kills}</td><td>{r.killPct}%</td><td>{r.efficiency}%</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
