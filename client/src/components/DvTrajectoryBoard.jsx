// Trajectoires DataVolley : filtres (équipe, compétence, joueur, zone de
// départ, évaluation), terrain complet ou planche par zone de départ.

import { useEffect, useMemo, useState } from 'react';
import TrajectoryMap from './DvTrajectoryMap';
import { buildActionContext } from '../utils/dvContext.js';
import {
  EVAL_COLORS, EVAL_ORDER, TRAJECTORY_SKILLS,
  buildShots, directionCoverage, distinctValues, playersWithShots, startZonesOf, summarizeShots,
} from '../utils/dvTrajectories.js';

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
const startOf = (s) => String(s.action.start_zone || s.action.attack_zone || '');

function StatLine({ s }) {
  return (
    <div style={{ fontSize: 11, textAlign: 'center', opacity: 0.9 }}>
      {s.total} · # {s.killPct}% · = {s.errorPct}% · / {s.blockedPct}% · eff {s.efficiency}%
    </div>
  );
}

export default function DvTrajectoryBoard({ actions = [], names = {}, initialSide = 'home', setups = {}, setterNumbers = {}, onSeekAction = null, contextOverride = null, matchLabels = null, onShotsChange = null }) {
  const [team, setTeam] = useState(initialSide);
  const [skill, setSkill] = useState('A');
  const [player, setPlayer] = useState('all');
  const [zone, setZone] = useState('all');
  const [evals, setEvals] = useState([]);
  const [combo, setCombo] = useState('all');
  const [type, setType] = useState('all');
  const [blockers, setBlockers] = useState('all');
  const [phase, setPhase] = useState('all');
  const [situation, setSituation] = useState('all');
  const [rotation, setRotation] = useState('all');
  const [setNo, setSetNo] = useState('all');
  const [moneyTime, setMoneyTime] = useState(false);
  const [picked, setPicked] = useState(null);
  const [heat, setHeat] = useState(false);
  // Multi-matchs : le contexte est calculé match par match par l'appelant.
  const context = useMemo(
    () => contextOverride || buildActionContext(actions, setups, setterNumbers),
    [actions, setups, setterNumbers, contextOverride]
  );
  const [matchNo, setMatchNo] = useState('all');
  const setNumbers = useMemo(
    () => [...new Set([...context.values()].map((c) => c.setNumber))].sort((a, b) => a - b),
    [context]
  );
  const [board, setBoard] = useState(false);

  const players = useMemo(() => playersWithShots(actions, skill, team), [actions, skill, team]);
  const combos = useMemo(() => distinctValues(actions, skill, team, 'combo'), [actions, skill, team]);
  const types = useMemo(() => distinctValues(actions, skill, team, 'type'), [actions, skill, team]);
  const blockerCounts = useMemo(() => distinctValues(actions, skill, team, 'num_blockers'), [actions, skill, team]);
  const allShots = useMemo(
    () => buildShots(actions, {
      team,
      skill,
      player: player === 'all' ? null : player,
      evals,
      combo: combo === 'all' ? null : combo,
      type: type === 'all' ? null : type,
      blockers: blockers === 'all' ? null : blockers,
      phase,
      situation,
      rotation,
      set: setNo,
      moneyTime,
      match: matchNo,
      context,
    }),
    [actions, team, skill, player, evals, combo, type, blockers, phase, situation, rotation, setNo, moneyTime, matchNo, context]
  );
  const shots = useMemo(
    () => (zone === 'all' ? allShots : allShots.filter((s) => startOf(s) === zone)),
    [allShots, zone]
  );
  const zones = useMemo(() => startZonesOf(allShots), [allShots]);
  // Permet au parent (montage vidéo) de récupérer les actions affichées.
  useEffect(() => {
    if (onShotsChange) onShotsChange(shots.map((s) => s.action));
  }, [shots]); // eslint-disable-line react-hooks/exhaustive-deps
  const cover = useMemo(() => directionCoverage(actions, skill, team), [actions, skill, team]);

  const toggleEval = (e) => setEvals((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  const reset = () => {
    setPlayer('all');
    setZone('all');
    setCombo('all');
    setType('all');
    setBlockers('all');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {['home', 'away'].map((t) => (
          <button key={t} type="button" style={team === t ? CHIP_ON : CHIP} onClick={() => { setTeam(t); reset(); }}>
            {names[t] || (t === 'home' ? 'Domicile' : 'Extérieur')}
          </button>
        ))}
        {TRAJECTORY_SKILLS.map((s) => (
          <button key={s.id} type="button" style={skill === s.id ? CHIP_ON : CHIP} onClick={() => { setSkill(s.id); reset(); }}>
            {s.label}
          </button>
        ))}
        <select value={player} onChange={(e) => setPlayer(e.target.value)} style={CHIP}>
          <option value="all">Tous les joueurs</option>
          {players.map((n) => <option key={n} value={n}>n°{n}</option>)}
        </select>
        {types.length > 0 && (
          <select value={type} onChange={(e) => setType(e.target.value)} style={CHIP} title="Type de frappe">
            <option value="all">Tous types</option>
            {types.map((t) => <option key={t} value={t}>Type {t}</option>)}
          </select>
        )}
        {combos.length > 0 && (
          <select value={combo} onChange={(e) => setCombo(e.target.value)} style={CHIP} title="Combinaison d'attaque">
            <option value="all">Toutes combinaisons</option>
            {combos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {blockerCounts.length > 0 && (
          <select value={blockers} onChange={(e) => setBlockers(e.target.value)} style={CHIP} title="Nombre de contreurs">
            <option value="all">Tous contres</option>
            {blockerCounts.map((b) => <option key={b} value={b}>{b} contreur(s)</option>)}
          </select>
        )}
        {!board && (
          <select value={zone} onChange={(e) => setZone(e.target.value)} style={CHIP}>
            <option value="all">Toutes zones de départ</option>
            {zones.map((z) => <option key={z} value={z}>Zone {z}</option>)}
          </select>
        )}
        <button type="button" style={heat ? CHIP_ON : CHIP} onClick={() => setHeat((v) => !v)}>Carte de chaleur</button>
        <button type="button" style={board ? CHIP_ON : CHIP} onClick={() => setBoard((v) => !v)}>Planche par zone</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {skill === 'A' && (
          <select value={phase} onChange={(e) => setPhase(e.target.value)} style={CHIP} title="Phase de jeu">
            <option value="all">Toutes phases</option>
            <option value="K1">Side-out (K1)</option>
            <option value="K2">Transition (K2)</option>
            <option value="FREEBALL">Freeball</option>
          </select>
        )}
        {skill === 'A' && (
          <select value={situation} onChange={(e) => setSituation(e.target.value)} style={CHIP} title="Qualité du 1er contact">
            <option value="all">Toutes situations</option>
            <option value="+">1er contact + </option>
            <option value="0">1er contact 0</option>
            <option value="-">1er contact −</option>
          </select>
        )}
        <select value={rotation} onChange={(e) => setRotation(e.target.value)} style={CHIP} title="Position du passeur">
          <option value="all">Toutes rotations</option>
          {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((p) => <option key={p} value={p}>Passeur {p}</option>)}
        </select>
        {setNumbers.length > 1 && (
          <select value={setNo} onChange={(e) => setSetNo(e.target.value)} style={CHIP} title="Set">
            <option value="all">Tous sets</option>
            {setNumbers.map((n) => <option key={n} value={n}>Set {n}</option>)}
          </select>
        )}
        {matchLabels && matchLabels.length > 1 && (
          <select value={matchNo} onChange={(e) => setMatchNo(e.target.value)} style={CHIP} title="Match">
            <option value="all">Tous les matchs</option>
            {matchLabels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
        <button type="button" style={moneyTime ? CHIP_ON : CHIP} onClick={() => setMoneyTime((v) => !v)}>Money-time</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {EVAL_ORDER.map((e) => (
          <button
            key={e}
            type="button"
            style={{ ...(evals.includes(e) ? CHIP_ON : CHIP), color: EVAL_COLORS[e], fontWeight: 700 }}
            onClick={() => toggleEval(e)}
          >
            {e}
          </button>
        ))}
        {evals.length > 0 && <button type="button" style={CHIP} onClick={() => setEvals([])}>Tout</button>}
      </div>

      <p className="dv-hint" style={{ margin: '0 0 8px' }}>
        Directions codées : {cover.withDirection}/{cover.total} ({cover.pct}%). Pointillés : direction déduite de la zone seule.
      </p>

      {shots.length === 0 ? (
        <p className="dv-hint">Aucune trajectoire pour ces filtres.</p>
      ) : board ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {zones.map((z) => {
            const zs = allShots.filter((s) => startOf(s) === z);
            return (
              <div key={z}>
                <strong style={{ fontSize: 12 }}>Zone de départ {z}</strong>
                <TrajectoryMap shots={zs} compact teamSide={team} />
                <StatLine s={summarizeShots(zs)} />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ maxWidth: 760 }}>
          <TrajectoryMap shots={shots} heat={heat} teamSide={team} onPick={setPicked} />
          <StatLine s={summarizeShots(shots)} />
        </div>
      )}
      {picked && (
        <div style={{ marginTop: 8, padding: 8, border: '1px solid rgba(232,224,213,0.2)', borderRadius: 6, fontSize: 12 }}>
          <strong>{picked.action.code}</strong> · n°{picked.action.player_number} · {picked.precision}
          {onSeekAction && (
            <button type="button" style={{ ...CHIP, marginLeft: 8 }} onClick={() => onSeekAction(picked.action)}>
              Voir dans la vidéo
            </button>
          )}
          <button type="button" style={{ ...CHIP, marginLeft: 6 }} onClick={() => setPicked(null)}>Fermer</button>
        </div>
      )}
      {onSeekAction && shots.length > 0 && shots.length <= 60 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {shots.map((s) => (
            <button key={s.action.uid ?? s.action.id} type="button" style={{ ...CHIP, padding: '1px 6px', fontSize: 11 }} onClick={() => onSeekAction(s.action)} title="Voir dans la vidéo">
              {s.action.code}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, marginTop: 8 }}>
        {EVAL_ORDER.map((e) => (
          <span key={e}><i style={{ width: 14, height: 3, background: EVAL_COLORS[e], display: 'inline-block', marginRight: 4 }} />{e}</span>
        ))}
      </div>
    </div>
  );
}
