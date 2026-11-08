// Analyses cumulées sur plusieurs matchs : tableau des matchs, side-out / break
// par rotation et money-time cumulés, trajectoires de tous les matchs réunis.
// Chaque match garde son état (sets, rotations) : on additionne les compteurs.

import { useMemo, useState } from 'react';
import DvTrajectoryBoard from './DvTrajectoryBoard';
import MultiMatchPlaylistButton from './MultiMatchPlaylistButton';
import MultiMatchTeamView2 from './MultiMatchTeamView2';
import { allActions, buildMultiContext, matchSummaries } from '../utils/multiMatch.js';
import { cumulativeMoneyTime, cumulativeSideOutBreak } from '../utils/multiMatchAnalytics.js';

const ROTS = ['Total', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

export default function MultiMatchTeamView({ prepared, targetTeam }) {
  const [side, setSide] = useState('home');
  const [shown, setShown] = useState([]);
  const summaries = useMemo(() => matchSummaries(prepared), [prepared]);
  const sob = useMemo(() => cumulativeSideOutBreak(prepared), [prepared]);
  const money = useMemo(() => cumulativeMoneyTime(prepared), [prepared]);
  const actions = useMemo(() => allActions(prepared), [prepared]);
  const context = useMemo(() => buildMultiContext(prepared), [prepared]);
  const matchLabels = useMemo(
    () => (prepared || []).map((m) => ({ id: m.id, label: `vs ${m.opponent || '?'}` })),
    [prepared]
  );
  const names = { home: targetTeam || 'Équipe', away: 'Adversaires' };

  if (!prepared || prepared.length === 0) {
    return <p className="dv-hint">Aucun match sélectionné où l’équipe analysée a joué.</p>;
  }
  return (
    <div style={{ background: '#141418', border: '1px solid #27272a', padding: 14 }}>
      <h4 style={{ marginTop: 0 }}>Matchs cumulés ({prepared.length})</h4>
      <table className="report report-compact">
        <thead><tr><th className="name">Adversaire</th><th>Sets</th><th>Points joués</th><th>Actions codées</th></tr></thead>
        <tbody>
          {summaries.map((m) => (
            <tr key={m.id}>
              <td className="name">{m.opponent}</td>
              <td>{m.setsFor}–{m.setsAgainst}</td>
              <td>{m.rallies}</td>
              <td>{m.actions}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 6, margin: '14px 0 6px' }}>
        {['home', 'away'].map((s) => (
          <button key={s} type="button" className={`btn btn-sm ${side === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSide(s)}>
            {names[s]}
          </button>
        ))}
      </div>

      <h5>Side-out et break par rotation (cumul)</h5>
      <table className="report report-compact">
        <thead><tr><th className="name">Rotation</th><th>Rallies</th><th>Side-out</th><th>% SO</th><th>Break</th><th>% BK</th></tr></thead>
        <tbody>
          {ROTS.map((k) => {
            const r = sob?.[side]?.[k];
            if (!r || r.rallies === 0) return null;
            return (
              <tr key={k} className={k === 'Total' ? 'team-row' : ''}>
                <td className="name">{k === 'Total' ? 'Total' : `Passeur ${k}`}</td>
                <td>{r.rallies}</td><td>{r.sideOutWon}/{r.sideOutOpp}</td><td>{r.sideOutPct}%</td>
                <td>{r.breakWon}/{r.breakOpp}</td><td>{r.breakPct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {money && (
        <>
          <h5 style={{ marginTop: 14 }}>Money-time contre reste du match (cumul)</h5>
          <table className="report report-compact">
            <thead><tr><th className="name">Phase</th><th>Rallies</th><th>Gagnés</th><th>%</th><th>Attaques</th><th>Eff</th></tr></thead>
            <tbody>
              {['money', 'rest'].map((k) => {
                const b = money[side][k];
                return (
                  <tr key={k}>
                    <td className="name">{k === 'money' ? 'Money-time' : 'Reste'}</td>
                    <td>{b.rallies}</td><td>{b.won}</td><td>{b.winPct}%</td><td>{b.attacks}</td><td>{b.efficiency}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <MultiMatchTeamView2 prepared={prepared} side={side} />
      <h5 style={{ marginTop: 14 }}>Trajectoires de tous les matchs</h5>
      <DvTrajectoryBoard key={side} actions={actions} names={names} initialSide={side} contextOverride={context} matchLabels={matchLabels} onShotsChange={setShown} />
      <MultiMatchPlaylistButton
        actions={shown}
        label={`Montage ${targetTeam || 'équipe'}`}
        matchLabelOf={(a) => (prepared.find((m) => m.id === a.match_video_id)?.opponent ? `vs ${prepared.find((m) => m.id === a.match_video_id).opponent}` : '')}
      />
    </div>
  );
}
