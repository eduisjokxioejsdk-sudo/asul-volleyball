// ============================================================================
// MODE BANC / COACH TABLET (Feature 18 — DataVolley 4 Pro Bench View)
//
// Interface haute-lisibilité temps réel conçue pour l'entraîneur et le banc :
// - Rotation en cours & Front d'attaque adverse (P4 / P3 / P2 + Pipe P6)
// - Alertes tactiques automatiques calculées en direct (tendances passeur,
//   cible de service, joueur chaud, passe de secours)
// - Distribution du passeur adverse dans la rotation actuelle (K1 / K2)
// - KPIs clés en direct : Side-Out (SO%), First Ball Side-Out (FBSO%),
//   Transition (K1->K2), Break Point (BP%), Contre 1v1
// ============================================================================

import React, { useState, useMemo } from 'react';
import { DistributionCourt } from './AttackCourt';
import { computeSetterDistributionByRotation } from '../utils/distribution';
import { blockerTableRows } from '../utils/scouting';
import { AlertTriangle, Crosshair, House, Plane, RotateCcw, Target, Trophy, Users, Volleyball } from './icons';

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(v)}%`;
}

function fmtEff(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const r = Math.round(v);
  return r > 0 ? `+${r}%` : `${r}%`;
}

export default function LiveCoachTablet({
  team1 = 'Domicile',
  team2 = 'Extérieur',
  boardState = {},
  scouting = null,
  actions = [],
  rallies = [],
  setups = {},
  setterNumbers = { home: null, away: null },
  homeConfig = {},
  awayConfig = {},
  videoSlot = null,
}) {
  // Équipe observée comme "Adversaire" par le coach (par défaut 'away')
  const [oppTeam, setOppTeam] = useState('away');
  const [distScope, setDistScope] = useState('CURRENT'); // 'CURRENT' | 'Total'
  const [distPhase, setDistPhase] = useState('ALL'); // 'ALL' | 'K1' | 'K2'

  const myTeam = oppTeam === 'away' ? 'home' : 'away';
  const oppName = oppTeam === 'away' ? team2 : team1;
  const myName = myTeam === 'away' ? team2 : team1;

  const oppSide = oppTeam === 'away' ? scouting?.away : scouting?.home;
  const mySide = myTeam === 'away' ? scouting?.away : scouting?.home;

  const oppLineup = oppTeam === 'away' ? boardState?.awayLineup : boardState?.homeLineup;
  const myLineup = myTeam === 'away' ? boardState?.awayLineup : boardState?.homeLineup;
  const oppSetterPos = (oppTeam === 'away' ? boardState?.awaySetterPos : boardState?.homeSetterPos) || 'P1';
  const mySetterPos = (myTeam === 'away' ? boardState?.awaySetterPos : boardState?.homeSetterPos) || 'P1';

  const oppRoster = (oppTeam === 'away' ? awayConfig?.roster : homeConfig?.roster) || [];

  const getOppPlayerInfo = (num) => {
    const n = Number(num);
    if (!n) return { number: null, name: '—', role: '', attack: null, reception: null };
    const rosterEntry = oppRoster.find((p) => Number(p.number) === n);
    const pStats = oppSide?.players?.find((p) => Number(p.number) === n);
    return {
      number: n,
      name: rosterEntry?.name || pStats?.name || '',
      role: rosterEntry?.role || pStats?.role || '',
      attack: pStats?.attack || null,
      reception: pStats?.reception || null,
      block: pStats?.block || null,
      serve: pStats?.serve || null,
    };
  };

  // Passeur avant (P2, P3, P4 = 2 attaquants devant) vs Passeur arrière (P1, P6, P5 = 3 attaquants devant)
  const isOppSetterFrontRow = ['P2', 'P3', 'P4'].includes(oppSetterPos);

  // Distribution adverse filtrée par phase (ALL, K1, K2)
  const oppDistByRot = useMemo(() => {
    const statsActions = (actions || []).filter((a) => a && a.evaluation);
    return computeSetterDistributionByRotation(statsActions, rallies || [], setups || {}, setterNumbers, {
      phase: distPhase,
      passZone: 'ALL',
      setterCall: 'ALL',
      defenderRole: 'ALL',
    });
  }, [actions, rallies, setups, setterNumbers, distPhase]);

  const activeDistKey = distScope === 'CURRENT' && oppSetterPos ? oppSetterPos : 'Total';
  const activeDistribution =
    oppDistByRot?.[oppTeam]?.[activeDistKey] || oppDistByRot?.[oppTeam]?.Total;

  // Génération automatique d'alertes tactiques en direct pour le coach
  const tacticalAlerts = useMemo(() => {
    const alerts = [];
    if (!oppSide) return alerts;

    // 1. Zone préférentielle dans la rotation actuelle
    const rotDist = oppDistByRot?.[oppTeam]?.[oppSetterPos];
    if (rotDist && rotDist.total >= 2) {
      const sortedZones = Object.entries(rotDist.zones || {})
        .filter(([, z]) => z.count > 0)
        .sort((a, b) => b[1].count - a[1].count);
      if (sortedZones.length > 0) {
        const [topZone, topData] = sortedZones[0];
        alerts.push({
          type: 'setter',
          priority: 'high',
          badge: `ROTATION ${oppSetterPos}`,
          title: `Distribution passeur en ${oppSetterPos} : ${topData.pct}% en Zone ${topZone}`,
          detail: `${topData.count}/${rotDist.total} ballons envoyés en Z${topZone} (${topData.topCombo ? `Combo ${topData.topCombo}, ` : ''}Eff ${fmtEff(topData.eff)}).`,
        });
      }
    }

    // 2. Joueur d'attaque le plus sollicité / le plus dangereux
    const attackers = (oppSide.players || [])
      .filter((p) => (p.attack?.total || 0) >= 3)
      .sort((a, b) => (b.attack?.kills || 0) - (a.attack?.kills || 0));
    if (attackers.length > 0) {
      const hot = attackers[0];
      const a = hot.attack;
      const eff = a.total ? Math.round(((a.kills - a.errors - a.blocked) / a.total) * 100) : 0;
      alerts.push({
        type: 'attack',
        priority: eff >= 35 ? 'high' : 'normal',
        badge: 'MENACE ATTAQUE',
        title: `N°${String(hot.number).padStart(2, '0')} ${hot.name || ''} : ${a.kills} pts sur ${a.total} att. (Eff ${fmtEff(eff)})`,
        detail: `${a.errors} faute(s) directe(s), ${a.blocked} contrée(s). À cibler prioritairement au contre.`,
      });
    }

    // 3. Cible de service recommandée (réceptionneur le moins positif ou ayant pris des aces)
    const receivers = (oppSide.players || [])
      .filter((p) => (p.reception?.total || 0) >= 3)
      .map((p) => {
        const r = p.reception;
        const posPct = r.total ? Math.round(((r.perfect + r.positive) / r.total) * 100) : 0;
        return { ...p, posPct, aces: r.errors || 0, total: r.total };
      })
      .sort((a, b) => a.posPct - b.posPct || b.aces - a.aces);

    if (receivers.length > 0) {
      const target = receivers[0];
      alerts.push({
        type: 'serve',
        priority: target.posPct <= 40 || target.aces >= 2 ? 'high' : 'normal',
        badge: 'CIBLE SERVICE',
        title: `Viser N°${String(target.number).padStart(2, '0')} ${target.name || ''} en réception (${target.posPct}% Pos)`,
        detail: `${target.total} réceptions codées · ${target.aces} ace(s) encaissé(s).`,
      });
    }

    // 4. Efficacité contre 1 vs 2 contreurs
    const blkRows = blockerTableRows(oppSide);
    if (blkRows.totalWithBlockers >= 2) {
      const r1 = blkRows.rows.find((r) => r.key === '1');
      const r2 = blkRows.rows.find((r) => r.key === '2');
      alerts.push({
        type: 'block',
        priority: 'normal',
        badge: 'CONTRE & 1v1',
        title: `Passeur adverse crée ${fmtPct(blkRows.setter1v1Pct)} de situations à 0/1 contreur`,
        detail: `Eff. sur 1 contreur : ${fmtEff(r1?.eff)} (${r1?.total || 0} ballons) · Eff. sur 2 contreurs : ${fmtEff(r2?.eff)} (${r2?.total || 0} ballons).`,
      });
    }

    return alerts;
  }, [oppSide, oppDistByRot, oppTeam, oppSetterPos]);

  const frontRowPositions = ['P4', 'P3', 'P2'];
  const backRowPositions = ['P5', 'P6', 'P1'];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 10,
        background: '#09090b',
        color: '#f4f4f5',
        minHeight: '100%',
        overflowY: 'auto',
      }}
    >
      {/* BARRE SUPÉRIEURE : SCOREBOARD GRAND FORMAT & SÉLECTEUR D'ÉQUIPE CIBLÉE */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 14px',
          background: '#141418',
          border: '1px solid #27272a',
          borderLeft: '3px solid #f59e0b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 800,
                fontFamily: 'JetBrains Mono, monospace',
                background: '#f59e0b',
                color: '#09090b',
              }}
            >
              MODE BANC · SET {boardState?.currentSet || 1}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {boardState?.server === 'team1' && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              )}
              <span style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>{team1}</span>
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>({boardState?.setsWon?.team1 ?? 0})</span>
            </div>

            <div
              style={{
                padding: '4px 12px',
                fontSize: 22,
                fontWeight: 900,
                background: '#09090b',
                border: '1px solid #3f3f46',
                color: '#fafafa',
                letterSpacing: '0.06em',
              }}
            >
              {boardState?.score?.team1 ?? 0} — {boardState?.score?.team2 ?? 0}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>({boardState?.setsWon?.team2 ?? 0})</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fb923c' }}>{team2}</span>
              {boardState?.server === 'team2' && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
            Équipe adverse analysée :
          </span>
          <button
            type="button"
            className={`btn btn-sm ${oppTeam === 'home' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setOppTeam('home')}
          >
            <House size={12} /> {team1}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${oppTeam === 'away' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setOppTeam('away')}
          >
            <Plane size={12} /> {team2}
          </button>
        </div>
      </div>

      {/* GRILLE PRINCIPALE DU MODE BANC (2 COLONNES HAUTE DENSITÉ) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 10,
        }}
      >
        {/* COLONNE GAUCHE : FRONT D'ATTAQUE ACTUEL + ALERTES TACTIQUES LIVE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 1. FRONT D'ATTAQUE & ROTATION EN COURS */}
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: '1px solid #27272a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} className="text-amber-500" />
                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Front d’Attaque Adverse ({oppName})
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(245,158,11,0.16)',
                    border: '1px solid #f59e0b',
                    color: '#fbbf24',
                  }}
                >
                  Passeur en {oppSetterPos}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    background: isOppSetterFrontRow ? 'rgba(14,165,233,0.16)' : 'rgba(225,29,72,0.16)',
                    border: `1px solid ${isOppSetterFrontRow ? '#0ea5e9' : '#e11d48'}`,
                    color: isOppSetterFrontRow ? '#38bdf8' : '#fb7185',
                  }}
                >
                  {isOppSetterFrontRow ? '2 ATTAQUANTS DEVANT' : '3 ATTAQUANTS DEVANT'}
                </span>
              </div>
            </div>

            {/* Ligne Avant : P4 - P3 - P2 */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa', marginBottom: 4 }}>
              Ligne Avant (Filet : P4 · P3 · P2)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              {frontRowPositions.map((pos) => {
                const playerNum = oppLineup?.[pos];
                const info = getOppPlayerInfo(playerNum);
                const att = info.attack;
                const eff =
                  att && att.total
                    ? Math.round(((att.kills - att.errors - att.blocked) / att.total) * 100)
                    : null;
                const isSetterHere = oppSetterPos === pos;
                return (
                  <div
                    key={pos}
                    style={{
                      padding: 10,
                      background: '#09090b',
                      border: `1px solid ${isSetterHere ? '#f59e0b' : '#27272a'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                          color: isSetterHere ? '#f59e0b' : '#38bdf8',
                        }}
                      >
                        {pos} {isSetterHere ? '· PASSEUR' : ''}
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 900,
                          color: '#fafafa',
                        }}
                      >
                        {info.number ? `#${String(info.number).padStart(2, '0')}` : '—'}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#e4e4e7',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {info.name || (info.number ? `Joueur #${info.number}` : 'Non renseigné')}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: '1px solid #1f1f23',
                        fontSize: 11,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#a1a1aa',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Att: {att ? `${att.kills}/${att.total}` : '0/0'}</span>
                      <span style={{ color: eff != null && eff >= 30 ? '#10b981' : '#e4e4e7', fontWeight: 700 }}>
                        Eff {fmtEff(eff)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ligne Arrière : P5 - P6 - P1 */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#71717a', marginBottom: 4 }}>
              Ligne Arrière (Défense / Pipe P6 / Att. Arrière P1)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {backRowPositions.map((pos) => {
                const playerNum = oppLineup?.[pos];
                const info = getOppPlayerInfo(playerNum);
                const att = info.attack;
                const rec = info.reception;
                const recPos =
                  rec && rec.total ? Math.round(((rec.perfect + rec.positive) / rec.total) * 100) : null;
                const isSetterHere = oppSetterPos === pos;
                return (
                  <div
                    key={pos}
                    style={{
                      padding: 8,
                      background: '#0d0d10',
                      border: `1px solid ${isSetterHere ? '#f59e0b' : '#27272a'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#a1a1aa' }}>
                        {pos} {isSetterHere ? '· PASSEUR' : ''}
                      </span>
                      <strong style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#e4e4e7' }}>
                        {info.number ? `#${String(info.number).padStart(2, '0')}` : '—'}
                      </strong>
                    </div>
                    <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 2 }}>
                      {info.name || (info.number ? `Joueur #${info.number}` : '—')}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#71717a',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Réc+: {fmtPct(recPos)}</span>
                      <span>Att: {att ? `${att.kills}/${att.total}` : '0/0'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. ALERTES TACTIQUES AUTOMATIQUES */}
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid #27272a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={15} className="text-amber-500" />
                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Alertes Tactiques Temps Réel ({oppName})
                </strong>
              </div>
              <span style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#a1a1aa' }}>
                {actions.length} actions analysées
              </span>
            </div>

            {tacticalAlerts.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#71717a', fontSize: 12 }}>
                En attente de données suffisantes sur ce match pour générer les alertes tactiques automatiques…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tacticalAlerts.map((al, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 10px',
                      background: '#09090b',
                      border: '1px solid #27272a',
                      borderLeft: `3px solid ${al.priority === 'high' ? '#f59e0b' : '#38bdf8'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 800,
                          padding: '1px 5px',
                          background: al.priority === 'high' ? 'rgba(245,158,11,0.18)' : 'rgba(56,189,248,0.15)',
                          color: al.priority === 'high' ? '#fbbf24' : '#38bdf8',
                        }}
                      >
                        {al.badge}
                      </span>
                      <strong style={{ fontSize: 12, color: '#f4f4f5' }}>{al.title}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: '#a1a1aa' }}>{al.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. KPIs CLÉS DU MATCH (SO%, FBSO%, K1->K2, BP%) */}
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid #27272a',
              }}
            >
              <Trophy size={14} className="text-amber-500" />
              <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Indicateurs Clés (Side-Out · FBSO · Break Point)
              </strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                {
                  label: 'Side-Out (SO%)',
                  myVal: mySide?.complex?.sideOut?.pct,
                  oppVal: oppSide?.complex?.sideOut?.pct,
                },
                {
                  label: '1st Ball SO (FBSO%)',
                  myVal: mySide?.complex?.fbso?.pct,
                  oppVal: oppSide?.complex?.fbso?.pct,
                },
                {
                  label: 'SO après Défense',
                  myVal: mySide?.complex?.transitionSideOut?.pct,
                  oppVal: oppSide?.complex?.transitionSideOut?.pct,
                },
                {
                  label: 'Break Point (BP%)',
                  myVal: mySide?.complex?.breakPoint?.pct,
                  oppVal: oppSide?.complex?.breakPoint?.pct,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  style={{
                    padding: 8,
                    background: '#09090b',
                    border: '1px solid #27272a',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#a1a1aa', marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>
                      {myName.slice(0, 6)}: {fmtPct(kpi.myVal)}
                    </span>
                    <span style={{ color: '#fb923c', fontWeight: 800 }}>
                      {oppName.slice(0, 6)}: {fmtPct(kpi.oppVal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLONNE DROITE : DISTRIBUTION DU PASSEUR ADVERSE EN DIRECT + FLUX VIDÉO OPTIONNEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {videoSlot && (
            <div style={{ background: '#141418', border: '1px solid #27272a', padding: 8 }}>
              {videoSlot}
            </div>
          )}

          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: '1px solid #27272a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={15} className="text-amber-500" />
                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Distribution Passeur ({oppName})
                </strong>
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${distScope === 'CURRENT' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDistScope('CURRENT')}
                >
                  Rotation actuelle ({oppSetterPos})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${distScope === 'Total' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDistScope('Total')}
                >
                  Toutes rotations
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: 'Toutes phases' },
                { key: 'K1', label: 'Side-Out (K1 Réception)' },
                { key: 'K2', label: 'Transition (K2 Défense)' },
              ].map((ph) => (
                <button
                  key={ph.key}
                  type="button"
                  className={`btn btn-sm ${distPhase === ph.key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDistPhase(ph.key)}
                  style={{ fontSize: 11 }}
                >
                  {ph.label}
                </button>
              ))}
            </div>

            <DistributionCourt distribution={activeDistribution} />
          </div>
        </div>
      </div>
    </div>
  );
}
