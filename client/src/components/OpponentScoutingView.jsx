// ============================================================================
// OPPONENT SCOUTING VIEW — Plan de Jeu & Préparation Tactique Adverse (Point 7)
//
// Analyse N matches d'un adversaire pour générer un Game Plan prêt à l'emploi :
//   1. Tendances de distribution du passeur par rotation (P1 à P6) en K1 et K2.
//   2. Cibles prioritaires au service (points faibles en réception).
//   3. Attaquants clés et directions préférentielles (Diagonale, Ligne, Pipe...).
//   4. Synthèse tactique et alertes pour les consignes de match d'avant-rencontre.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Target, Trophy, Users, Volleyball, Shield, AlertTriangle, FileDown, Eye, Check } from './icons';
import { COURT_POSITIONS } from '../utils/rotation';

export default function OpponentScoutingView({
  actions = [],
  rallies = [],
  teamName = 'Adversaire',
  opponentName = 'Notre Équipe',
  matchesCount = 1,
  onPrint = null,
}) {
  const [activeRotation, setActiveRotation] = useState('ALL'); // 'ALL' | '1'..'6'
  const [phaseFilter, setPhaseFilter] = useState('ALL'); // 'ALL' | 'K1' | 'K2'

  // 1. Filtrer les actions de l'équipe cible
  const teamActions = useMemo(() => {
    return actions.filter((a) => a && a.team === 'home');
  }, [actions]);

  // 2. Analyse des Récepteurs (Cibles au service)
  const receptionAnalysis = useMemo(() => {
    const map = new Map();
    for (const a of teamActions) {
      if (a.action !== 'R' || a.player_number == null) continue;
      const num = Number(a.player_number);
      if (!map.has(num)) {
        map.set(num, { number: num, total: 0, perf: 0, pos: 0, neg: 0, err: 0, slash: 0, zones: {} });
      }
      const p = map.get(num);
      p.total += 1;
      const ev = a.evaluation || '';
      if (ev === '#') p.perf += 1;
      else if (ev === '+') p.pos += 1;
      else if (ev === '!' || ev === '0') p.slash += 1;
      else if (ev === '-') p.neg += 1;
      else if (ev === '=') p.err += 1;

      const z = a.start_zone || a.end_zone || a.zone;
      if (z) {
        p.zones[z] = (p.zones[z] || 0) + 1;
      }
    }

    const list = [...map.values()].map((p) => {
      const posPct = p.total > 0 ? Math.round(((p.perf + p.pos) / p.total) * 100) : 0;
      const perfPct = p.total > 0 ? Math.round((p.perf / p.total) * 100) : 0;
      const errPct = p.total > 0 ? Math.round((p.err / p.total) * 100) : 0;
      const diffPct = posPct - errPct;

      // Zone la plus fréquente
      const topZone = Object.entries(p.zones).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

      return {
        ...p,
        posPct,
        perfPct,
        errPct,
        diffPct,
        topZone,
      };
    });

    // Trier du plus vulnérable au plus solide (cible n°1 = fort % erreur et faible % pos)
    return list.sort((a, b) => a.diffPct - b.diffPct || b.err - a.err);
  }, [teamActions]);

  // 3. Analyse des Attaquants & Directions
  const attackAnalysis = useMemo(() => {
    const map = new Map();
    for (const a of teamActions) {
      if (a.action !== 'A' || a.player_number == null) continue;
      const num = Number(a.player_number);
      if (!map.has(num)) {
        map.set(num, {
          number: num,
          total: 0,
          kills: 0,
          errors: 0,
          blocked: 0,
          directions: {},
          rotations: {},
        });
      }
      const p = map.get(num);
      p.total += 1;
      const ev = a.evaluation || '';
      if (ev === '#') p.kills += 1;
      else if (ev === '=') p.errors += 1;
      else if (ev === '/') p.blocked += 1;

      // Direction start -> end
      if (a.start_zone && a.end_zone) {
        const dir = `${a.start_zone} → ${a.end_zone}`;
        p.directions[dir] = (p.directions[dir] || 0) + 1;
      }

      // Rotation
      const rot = a.rotation || '1';
      p.rotations[rot] = (p.rotations[rot] || 0) + 1;
    }

    return [...map.values()]
      .map((p) => {
        const killPct = p.total > 0 ? Math.round((p.kills / p.total) * 100) : 0;
        const errPct = p.total > 0 ? Math.round((p.errors / p.total) * 100) : 0;
        const effPct = p.total > 0 ? Math.round(((p.kills - p.errors - p.blocked) / p.total) * 100) : 0;

        // Top 2 directions
        const topDirs = Object.entries(p.directions)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([dir, count]) => `${dir} (${Math.round((count / p.total) * 100)}%)`);

        return {
          ...p,
          killPct,
          errPct,
          effPct,
          topDirs: topDirs.length > 0 ? topDirs.join(', ') : 'Non codé',
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [teamActions]);

  // 4. Distribution Passeur par Rotation (P1 à P6) en K1 et K2
  const distributionByRotation = useMemo(() => {
    const rotations = ['1', '2', '3', '4', '5', '6'];
    const res = {};

    for (const rot of rotations) {
      res[rot] = {
        K1: { total: 0, zones: { '4': 0, '3': 0, '2': 0, 'pipe': 0, 'other': 0 } },
        K2: { total: 0, zones: { '4': 0, '3': 0, '2': 0, 'pipe': 0, 'other': 0 } },
        totalAttacks: 0,
      };
    }

    for (const a of teamActions) {
      if (a.action !== 'A') continue;
      const rot = String(a.rotation || '1');
      if (!res[rot]) continue;

      // Détecter K1 (Side-out / après réception) vs K2 (Transition / après défense ou contre)
      const isK1 = a.phase === 'K1' || a.situation === '+' || a.situation === '#' || a.type === 'SO';
      const phaseKey = isK1 ? 'K1' : 'K2';

      res[rot][phaseKey].total += 1;
      res[rot].totalAttacks += 1;

      const z = String(a.start_zone || a.attack_zone || '');
      if (z === '4' || z === '7') res[rot][phaseKey].zones['4'] += 1;
      else if (z === '3') res[rot][phaseKey].zones['3'] += 1;
      else if (z === '2' || z === '9') res[rot][phaseKey].zones['2'] += 1;
      else if (z === '6' || z === '8' || z === 'pipe') res[rot][phaseKey].zones['pipe'] += 1;
      else res[rot][phaseKey].zones['other'] += 1;
    }

    return res;
  }, [teamActions]);

  // Synthèse & Alertes Tactiques
  const tacticalAlerts = useMemo(() => {
    const alerts = [];

    // Cible #1 Réception
    if (receptionAnalysis.length > 0) {
      const target1 = receptionAnalysis[0];
      alerts.push({
        type: 'serve',
        severity: 'high',
        title: `Cible Service Prioritaire : N°${target1.number}`,
        desc: `Vulnérabilité maximale avec ${target1.errPct}% de fautes directes et seulement ${target1.posPct}% de réceptions positives (${target1.total} ballons reçus). Viser prioritairement vers la zone ${target1.topZone}.`,
      });
      if (receptionAnalysis.length > 1 && receptionAnalysis[1].errPct >= 10) {
        const target2 = receptionAnalysis[1];
        alerts.push({
          type: 'serve',
          severity: 'medium',
          title: `Cible Service Secondaire : N°${target2.number}`,
          desc: `${target2.errPct}% de fautes directes en réception (${target2.posPct}% positives).`,
        });
      }
    }

    // Attaquant #1 Danger
    if (attackAnalysis.length > 0) {
      const topSpiker = attackAnalysis[0];
      alerts.push({
        type: 'block',
        severity: 'high',
        title: `Top Attaquant à Verrouiller : N°${topSpiker.number}`,
        desc: `Volume offensif dominant avec ${topSpiker.total} attaques (${topSpiker.killPct}% de points directs, efficacité ${topSpiker.effPct}%). Directions dominantes : ${topSpiker.topDirs}.`,
      });
    }

    // Tendances passeur notables
    for (const rot of ['1', '2', '3', '4', '5', '6']) {
      const d = distributionByRotation[rot];
      if (d.K1.total >= 3) {
        const z4Pct = Math.round((d.K1.zones['4'] / d.K1.total) * 100);
        const z3Pct = Math.round((d.K1.zones['3'] / d.K1.total) * 100);
        const z2Pct = Math.round((d.K1.zones['2'] / d.K1.total) * 100);

        if (z4Pct >= 60) {
          alerts.push({
            type: 'distribution',
            severity: 'medium',
            title: `Rotation P${rot} en K1 : Fixation en 4 (${z4Pct}%)`,
            desc: `En P${rot} sur Side-Out (K1), le passeur distribue ${z4Pct}% de ses ballons à l'aile gauche (Zone 4).`,
          });
        } else if (z3Pct >= 40) {
          alerts.push({
            type: 'distribution',
            severity: 'medium',
            title: `Rotation P${rot} en K1 : Fixation au Centre (${z3Pct}%)`,
            desc: `En P${rot} sur Side-Out (K1), le passeur utilise fortement son central en zone 3 (${z3Pct}%).`,
          });
        }
      }
    }

    return alerts;
  }, [receptionAnalysis, attackAnalysis, distributionByRotation]);

  return (
    <div className="opponent-scouting-view" style={{ padding: 16 }}>
      {/* En-tête du Plan de Jeu */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 18px',
          background: '#141418',
          border: '1px solid #27272a',
          borderLeft: '4px solid #38bdf8',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <h2 style={{ margin: 0, fontSize: 18, color: '#f4f4f5' }}>
              Plan de Jeu Pré-Match &amp; Scouting Tactique
            </h2>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 8px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid #0284c7',
              }}
            >
              {matchesCount} MATCH{matchesCount > 1 ? 'S' : ''} ANALYSÉ{matchesCount > 1 ? 'S' : ''}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#a1a1aa' }}>
            Rapport tactique pour préparer le match contre <strong>{teamName}</strong> (Tendances Passeur P1-P6, Cibles Réception, Directions Attaque).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onPrint && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onPrint}
              title="Imprimer ou exporter en PDF ce plan de jeu pour le banc"
            >
              <FileDown size={13} /> Imprimer Game Plan
            </button>
          )}
        </div>
      </div>

      {/* Cartes d'Alertes Tactiques Clés */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0', fontSize: 14 }}>
          <AlertTriangle size={15} className="text-amber-500" /> Consignes Clés &amp; Alertes Tactiques
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {tacticalAlerts.map((alt, idx) => (
            <div
              key={idx}
              style={{
                padding: 12,
                background: '#09090b',
                border: '1px solid #27272a',
                borderLeft: `3px solid ${alt.severity === 'high' ? '#f43f5e' : '#f59e0b'}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: alt.severity === 'high' ? '#fda4af' : '#fde047', marginBottom: 4 }}>
                {alt.title}
              </div>
              <div style={{ fontSize: 11.5, color: '#d4d4d8', lineHeight: 1.4 }}>
                {alt.desc}
              </div>
            </div>
          ))}
          {tacticalAlerts.length === 0 && (
            <div style={{ padding: 12, color: '#71717a', fontSize: 12 }}>
              Codage insuffisant pour générer des alertes automatiques.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* SECTION 1 : Cibles au Service */}
        <div style={{ background: '#141418', border: '1px solid #27272a', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              <Volleyball size={14} className="text-emerald-500" /> Cibles Prioritaires au Service
            </h4>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>Trié par vulnérabilité</span>
          </div>

          <table className="pk-table" style={{ width: '100%', fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Joueur</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center' }}>+ / # %</th>
                <th style={{ textAlign: 'center' }}>Fautes %</th>
                <th style={{ textAlign: 'center' }}>Diff %</th>
                <th style={{ textAlign: 'center' }}>Zone Cible</th>
                <th style={{ textAlign: 'center' }}>Priorité</th>
              </tr>
            </thead>
            <tbody>
              {receptionAnalysis.map((p, idx) => (
                <tr key={p.number} style={{ background: idx === 0 ? 'rgba(244,63,94,0.08)' : undefined }}>
                  <td style={{ fontWeight: 700 }}>
                    N°{String(p.number).padStart(2, '0')}
                  </td>
                  <td style={{ textAlign: 'center' }}>{p.total}</td>
                  <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{p.posPct}%</td>
                  <td style={{ textAlign: 'center', color: p.errPct >= 10 ? '#f43f5e' : '#a1a1aa', fontWeight: 600 }}>
                    {p.errPct}%
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.diffPct}%</td>
                  <td style={{ textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
                    Zone {p.topZone}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {idx === 0 ? (
                      <span className="badge" style={{ background: '#e11d48', color: '#fff', fontSize: 10 }}>CIBLE #1</span>
                    ) : idx === 1 ? (
                      <span className="badge" style={{ background: '#f59e0b', color: '#000', fontSize: 10 }}>CIBLE #2</span>
                    ) : (
                      <span style={{ color: '#71717a', fontSize: 10 }}>Solide</span>
                    )}
                  </td>
                </tr>
              ))}
              {receptionAnalysis.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#71717a', padding: 12 }}>
                    Aucune réception codée pour cette équipe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* SECTION 2 : Top Attaquants & Directions Préférentielles */}
        <div style={{ background: '#141418', border: '1px solid #27272a', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              <Target size={14} className="text-amber-500" /> Attaquants Clés &amp; Directions
            </h4>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>Trié par volume d'attaques</span>
          </div>

          <table className="pk-table" style={{ width: '100%', fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Joueur</th>
                <th style={{ textAlign: 'center' }}>Attaques</th>
                <th style={{ textAlign: 'center' }}>Points %</th>
                <th style={{ textAlign: 'center' }}>Fautes %</th>
                <th style={{ textAlign: 'center' }}>Efficacité</th>
                <th style={{ textAlign: 'left' }}>Directions Préférentielles</th>
              </tr>
            </thead>
            <tbody>
              {attackAnalysis.slice(0, 7).map((p, idx) => (
                <tr key={p.number}>
                  <td style={{ fontWeight: 700 }}>
                    N°{String(p.number).padStart(2, '0')}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.total}</td>
                  <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{p.killPct}%</td>
                  <td style={{ textAlign: 'center', color: p.errPct >= 15 ? '#f43f5e' : '#a1a1aa' }}>{p.errPct}%</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: p.effPct >= 30 ? '#38bdf8' : undefined }}>
                    {p.effPct}%
                  </td>
                  <td style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{p.topDirs}</td>
                </tr>
              ))}
              {attackAnalysis.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#71717a', padding: 12 }}>
                    Aucune attaque codée pour cette équipe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3 : Tendances de Distribution du Passeur par Rotation (P1 à P6) */}
      <div style={{ background: '#141418', border: '1px solid #27272a', padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <Users size={15} className="text-cyan-400" /> Tendances Passeur par Rotation (P1 à P6)
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
              Pourcentage des passes attribuées à chaque poste (Poste 4, Centre 3, Poste 2, Pipe 6) en Side-out (K1) vs Transition (K2).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#a1a1aa', marginRight: 4 }}>Rotation :</span>
            <button
              type="button"
              className={`btn btn-xs ${activeRotation === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveRotation('ALL')}
            >
              Toutes
            </button>
            {['1', '2', '3', '4', '5', '6'].map((r) => (
              <button
                key={r}
                type="button"
                className={`btn btn-xs ${activeRotation === r ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveRotation(r)}
              >
                P{r}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {['1', '2', '3', '4', '5', '6']
            .filter((r) => activeRotation === 'ALL' || activeRotation === r)
            .map((rot) => {
              const d = distributionByRotation[rot];
              const k1Total = d.K1.total;
              const k2Total = d.K2.total;

              const pct = (val, total) => (total > 0 ? Math.round((val / total) * 100) : 0);

              return (
                <div
                  key={rot}
                  style={{
                    padding: 12,
                    background: '#09090b',
                    border: '1px solid #27272a',
                    borderTop: '3px solid #06b6d4',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13, color: '#e0f2fe' }}>Rotation P{rot}</strong>
                    <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'JetBrains Mono, monospace' }}>
                      {d.totalAttacks} attaques
                    </span>
                  </div>

                  {/* Tableau K1 vs K2 */}
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#71717a', borderBottom: '1px solid #27272a' }}>
                        <th style={{ textAlign: 'left', padding: '3px 0' }}>Phase</th>
                        <th style={{ textAlign: 'center' }}>Total</th>
                        <th style={{ textAlign: 'center', color: '#38bdf8' }}>Aile 4</th>
                        <th style={{ textAlign: 'center', color: '#34d399' }}>Centre 3</th>
                        <th style={{ textAlign: 'center', color: '#fbbf24' }}>Aile 2</th>
                        <th style={{ textAlign: 'center', color: '#c084fc' }}>Pipe</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #1f1f23' }}>
                        <td style={{ padding: '4px 0', fontWeight: 600 }}>K1 (Side-out)</td>
                        <td style={{ textAlign: 'center', color: '#a1a1aa' }}>{k1Total}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K1.zones['4'], k1Total)}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K1.zones['3'], k1Total)}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K1.zones['2'], k1Total)}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K1.zones['pipe'], k1Total)}%</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', fontWeight: 600 }}>K2 (Transition)</td>
                        <td style={{ textAlign: 'center', color: '#a1a1aa' }}>{k2Total}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K2.zones['4'], k2Total)}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K2.zones['3'], k2Total)}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K2.zones['2'], k2Total)}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pct(d.K2.zones['pipe'], k2Total)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
