// Vues (suite) : duel service / réception, contre et passe.

import { useMemo } from 'react';
import EvalBar from './EvalBar';
import { prepareRallies } from '../utils/dvAnalytics.js';
import { serveReceptionDuel } from '../utils/dvAnalytics2.js';
import { computeBlockAnalysis, computeSetAnalysis } from '../utils/dvAnalytics3.js';

const nn = (n) => `n°${String(n).padStart(2, '0')}`;

/** Duel service / réception. */
export function ServeReceptionDuelView({ actions, team }) {
  const all = useMemo(() => serveReceptionDuel(actions), [actions]);
  const mine = all[team];
  const servers = Object.entries(mine.servers).sort((a, b) => b[1].total - a[1].total);
  const receivers = Object.entries(mine.receivers).sort((a, b) => b[1].total - a[1].total);
  return (
    <div>
      <h5>Serveurs : réception obtenue chez l’adversaire</h5>
      {servers.length === 0 ? <p className="dv-hint">Aucun service.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Serveur</th><th>Serv.</th><th>Aces</th><th>Fautes</th><th>Réception adverse</th></tr></thead>
          <tbody>
            {servers.map(([n, s]) => (
              <tr key={n}>
                <td className="name">{nn(n)}</td><td>{s.total}</td><td>{s.aces}</td><td>{s.errors}</td>
                <td><EvalBar byEval={s.byRecQuality} width={140} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h5 style={{ marginTop: 10 }}>Réceptionneurs : services reçus par type</h5>
      {receivers.length === 0 ? <p className="dv-hint">Aucune réception.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Réceptionneur</th><th>Rec.</th><th>Types de service reçus</th><th>Qualité</th></tr></thead>
          <tbody>
            {receivers.map(([n, r]) => (
              <tr key={n}>
                <td className="name">{nn(n)}</td><td>{r.total}</td>
                <td>{Object.entries(r.byServeType).map(([t, c]) => `${t}: ${c}`).join(' · ')}</td>
                <td><EvalBar byEval={r.byQuality} width={140} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Contre et passe. */
export function BlockAndSetView({ actions, team }) {
  const prep = useMemo(() => prepareRallies(actions), [actions]);
  const block = useMemo(() => computeBlockAnalysis(actions, prep)[team], [actions, prep, team]);
  const set = useMemo(() => computeSetAnalysis(actions, prep)[team], [actions, prep, team]);
  const blockPlayers = Object.entries(block.byPlayer).sort((a, b) => b[1].total - a[1].total);
  const calls = Object.entries(set.byCall).sort((a, b) => b[1].total - a[1].total);
  const setters = Object.entries(set.byPlayer).sort((a, b) => b[1].total - a[1].total);
  return (
    <div>
      <h5>Contre</h5>
      {block.total === 0 ? <p className="dv-hint">Aucun contre codé.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Contreur</th><th>Contres</th><th>Points</th><th>% pts</th><th>Touchés</th><th>Fautes</th></tr></thead>
          <tbody>
            {blockPlayers.map(([n, r]) => (
              <tr key={n}><td className="name">{nn(n)}</td><td>{r.total}</td><td>{r.points}</td><td>{r.pointsPct}%</td><td>{r.touches}</td><td>{r.errors}</td></tr>
            ))}
            <tr className="team-row"><td className="name">Total</td><td>{block.total}</td><td>{block.points}</td><td>{block.pointsPct}%</td><td>{block.touches}</td><td>{block.errors}</td></tr>
          </tbody>
        </table>
      )}
      <h5 style={{ marginTop: 10 }}>Passe : efficacité de l’attaque selon l’appel</h5>
      {calls.length === 0 ? <p className="dv-hint">Aucun appel passeur codé.</p> : (
        <table className="report report-compact">
          <thead><tr><th className="name">Appel</th><th>Att.</th><th>Pts</th><th>% pts</th><th>Eff</th></tr></thead>
          <tbody>
            {calls.map(([c, r]) => (
              <tr key={c}><td className="name">{c}</td><td>{r.total}</td><td>{r.kills}</td><td>{r.killPct}%</td><td>{r.efficiency}%</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {setters.length > 0 && (
        <p className="dv-hint" style={{ margin: '6px 0 0' }}>
          Passeurs : {setters.map(([n, r]) => `${nn(n)} (${r.total} passes, eff ${r.efficiency}%)`).join(' · ')}
        </p>
      )}
    </div>
  );
}
