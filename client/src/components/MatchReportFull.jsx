// ============================================================================
// Rapport complet (façon DataVolley 4) : synthèse P2 + un sous-onglet par
// compétence (ventilations par évaluation, type, zone), zones (heatmaps),
// situations, rotations, complexe I/II et classements.
//
// L'UI reste lisible : une seule section affichée à la fois, chaque section
// étant un tableau ou une carte. Le bouton « Imprimer / PDF » met tout le
// rapport dans un document imprimable multi-pages (voir .report-print).
// ============================================================================

import { useMemo, useState } from 'react';
import MatchReportTable from './MatchReportTable';
import PancakeLogo from './PancakeLogo';
import ZoneHeatmap from './ZoneHeatmap';
import { DirectionMap } from './AttackCourt';
import { DV_EVAL_KEYS, DV_EVALUATIONS, DV_ZONE_LABELS } from '../utils/datavolley';
import {
  RANKING_LABELS,
  SKILLS,
  describeType,
  observedTypes,
  playersWithSkill,
  skillLabel,
  skillMetrics,
  directionTableRows,
  setEfficiencyRows,
  tacticTableRows,
  blockerTableRows,
  zoneCellRows,
} from '../utils/scouting';

/** Sous-onglets du rapport. */
const TABS = [
  { key: 'synthese', label: 'Synthèse' },
  { key: 'service', label: 'Service', skill: 'serve', action: 'S' },
  { key: 'reception', label: 'Réception', skill: 'reception', action: 'R' },
  { key: 'attaque', label: 'Attaque', skill: 'attack', action: 'A' },
  { key: 'combinaisons', label: 'Setter Call / Combos' },
  { key: 'contre', label: 'Contre', skill: 'block', action: 'B' },
  { key: 'defense', label: 'Défense / Passe', skills: ['dig', 'set', 'freeball'] },
  { key: 'zones', label: 'Zones' },
  { key: 'situations', label: 'Situations' },
  { key: 'rotations', label: 'Rotations' },
  { key: 'classements', label: 'Classements' },
  { key: 'parette', label: 'Par set' },
  { key: 'joueurs', label: 'Joueurs' },
  { key: 'directions', label: 'Directions' },
];

/** Clés des fenêtres portées par le rapport (le menu de gauche les pilote). */
export const REPORT_TAB_KEYS = TABS.map((t) => t.key);
export const REPORT_TABS = TABS;

/** Nom affiché d'un joueur (ou total d'équipe). */
function playerLabel(p, teamName) {
  if (p.number === 0) return `TOTAL ${teamName}`;
  return `n°${String(p.number).padStart(2, '0')}${p.name ? ` ${p.name}` : ''}`;
}

/** Fenêtre « Joueurs » : effectif des deux équipes, actions et rendement. */
function PlayersTable({ report }) {
  const rows = [];
  for (const key of ['home', 'away']) {
    const team = report[key];
    for (const p of team.players || []) {
      rows.push({ team: team.name, ...p });
    }
  }
  if (!rows.length) return <p className="dv-hint">Aucun joueur enregistré.</p>;
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Équipe</th>
          <th className="name">Joueur</th>
          <th>Rôle</th>
          <th>Actions</th>
          <th>Pts</th>
          <th>Fautes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={`${p.team}-${p.number}-${i}`}>
            <td className="name">{p.team}</td>
            <td className="name">{playerLabel(p, p.team)}</td>
            <td>{p.roleLabel || '—'}</td>
            <td>{p.total}</td>
            <td>{p.points}</td>
            <td>{p.faults}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Zones de la grille DataVolley (lignes du tableau croisé des directions). */
const DIRECTION_ZONES = ['4', '3', '2', '7', '8', '9', '5', '6', '1'];

/**
 * Tableau croisé des directions : zone de départ × zone d'arrivée.
 * Chaque cellule est l'agrégat « 4 → 5 » ; un clic filtre la liste des actions.
 */
function DirectionCrossTable({ rows = [], onPick }) {
  const map = new Map();
  for (const r of rows) map.set(`${r.start}|${r.end}`, r);
  return (
    <table className="dirc-table">
      <thead>
        <tr>
          <th>Départ \ Arrivée</th>
          {DIRECTION_ZONES.map((z) => (
            <th key={z}>{z}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {DIRECTION_ZONES.map((start) => (
          <tr key={start}>
            <th>{start}</th>
            {DIRECTION_ZONES.map((end) => {
              const row = map.get(`${start}|${end}`);
              return (
                <td key={end}>
                  {row ? (
                    <button
                      type="button"
                      onClick={() => onPick?.(row)}
                      title={`${row.key} · ${row.total} attaque(s)`}
                    >
                      {row.total}
                    </button>
                  ) : (
                    ''
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Table « ventilation par évaluation » d'une compétence. */
function EvalTable({ side, skillId, label }) {
  const players = playersWithSkill(side, skillId);
  if (players.length === 0) return <p className="dv-hint">Aucune action « {label} » pour {side.name}.</p>;
  const rows = [...players, side.totals];
  const evalLabels = DV_EVALUATIONS[skillId === 'serve' ? 'S' : skillId === 'reception' ? 'R' : 'A'] || [];
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Joueur</th>
          <th>Tot</th>
          {DV_EVAL_KEYS.map((sym) => (
            <th key={sym} title={evalLabels.find((e) => e.sym === sym)?.label || sym}>{sym}</th>
          ))}
          <th>Pts</th>
          <th>Err</th>
          <th>Eff%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const agg = p.skills[skillId];
          const m = skillMetrics(skillId, agg);
          return (
            <tr key={`${p.number}-${i}`} className={p.number === 0 ? 'team-row' : ''}>
              <td className="name">{playerLabel(p, side.name)}</td>
              <td>{agg.total}</td>
              {DV_EVAL_KEYS.map((sym) => (
                <td key={sym}>{agg.byEval[sym] || ''}</td>
              ))}
              <td>{agg.points}</td>
              <td>{agg.errors}</td>
              <td>{m.efficiency != null ? `${m.efficiency}%` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
/** Table « ventilation par type » d'une compétence (M/P/T…). */
function TypeTable({ side, skillId, actionCode, actions }) {
  const types = observedTypes(actions, actionCode);
  if (types.length === 0) return <p className="dv-hint">Aucun type renseigné pour cette compétence.</p>;
  const players = playersWithSkill(side, skillId);
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Joueur</th>
          {types.map((t) => {
            const d = describeType(actionCode, t);
            return <th key={t} title={d.desc}>{t} — {d.label}</th>;
          })}
        </tr>
      </thead>
      <tbody>
        {[...players, side.totals].map((p, i) => (
          <tr key={`${p.number}-${i}`} className={p.number === 0 ? 'team-row' : ''}>
            <td className="name">{playerLabel(p, side.name)}</td>
            {types.map((t) => (
              <td key={t}>{p.skills[skillId].byType[t] || ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Table « combinaisons d'attaque » (compteurs et efficacité par code). */
function ComboTable({ side }) {
  const rows = tacticTableRows(side, 'attack', 'combo');
  if (rows.length === 0) return <p className="dv-hint">Aucune combinaison d’attaque codée (ex: *09AX1#, *12AV54#).</p>;
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Combinaison</th>
          <th>Tot</th>
          <th>Pts (#)</th>
          <th>Err (=)</th>
          <th>Contrées (/)</th>
          <th>Kill%</th>
          <th>Eff%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const killPct = r.total ? Math.round((r.points / r.total) * 1000) / 10 : 0;
          return (
            <tr key={r.code}>
              <td className="name" title={r.desc}>
                <code>{r.code}</code> {r.label}
              </td>
              <td>{r.total}</td>
              <td>{r.points}</td>
              <td>{r.errors}</td>
              <td>{r.blocked}</td>
              <td>{killPct}%</td>
              <td><strong>{r.efficiency}%</strong></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Table « Appels du passeur / Fixations du central (Setter Calls K1, K2, K7, KE…) ». */
function SetterCallTable({ side }) {
  const rows = tacticTableRows(side, 'set', 'call');
  if (rows.length === 0) {
    return (
      <p className="dv-hint">
        Aucun appel passeur codé sur une passe (ex: <code>*07EK1#</code> pour Fixation Devant, <code>*07EK2#</code> Derrière, <code>*07EK7#</code> Tendue 3m).
      </p>
    );
  }
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Appel Passeur (Course Central)</th>
          <th>Passes</th>
          <th>Pts Att (#)</th>
          <th>Fautes (=)</th>
          <th>Contrées (/)</th>
          <th>Eff%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code}>
            <td className="name" title={r.desc}>
              <code>{r.code}</code> {r.label}
            </td>
            <td>{r.total}</td>
            <td>{r.points}</td>
            <td>{r.errors}</td>
            <td>{r.blocked}</td>
            <td><strong>{r.efficiency}%</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Matrice d'efficacité d'attaque par Nombre de Contreurs (0, 1, 2, 3, 4=Trou). */
function BlockersTable({ side }) {
  const { rows, totalCoded, oneOrZero, setter1v1Pct } = blockerTableRows(side);
  if (rows.length === 0) {
    return (
      <p className="dv-hint">
        Aucun nombre de contreurs codé après l’évaluation d’attaque (ex: <code>*09AV54#1</code> = 1 contreur, <code>*09AV54#2</code> = 2 contreurs).
      </p>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontFamily: 'var(--font-mono)' }}>
          Situations 0/1 Contreur créées par le passeur : {setter1v1Pct}% ({oneOrZero}/{totalCoded})
        </span>
      </div>
      <table className="report report-compact">
        <thead>
          <tr>
            <th className="name">Opposition au Contre</th>
            <th>Attaques</th>
            <th>Part %</th>
            <th>Pts (#)</th>
            <th>Err (=)</th>
            <th>Contrées (/)</th>
            <th>Kill%</th>
            <th>Eff%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="name" title={r.desc}>
                <code>{r.code}</code> {r.label}
              </td>
              <td>{r.total}</td>
              <td>{r.sharePct}%</td>
              <td>{r.points}</td>
              <td>{r.errors}</td>
              <td>{r.blocked}</td>
              <td>{r.killPct}%</td>
              <td><strong>{r.efficiency}%</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Table « zones » (compteurs, % en infobulle) d'une compétence. */
function ZoneTable({ side, skillId }) {
  const players = playersWithSkill(side, skillId);
  const zones = Object.keys(DV_ZONE_LABELS);
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Joueur</th>
          {zones.map((z) => (
            <th key={z} title={DV_ZONE_LABELS[z]}>{z}</th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {[...players, side.totals].map((p, i) => {
          const { rows, total } = zoneCellRows(p.skills[skillId]);
          const byZone = Object.fromEntries(rows.map((r) => [r.zone, r]));
          return (
            <tr key={`${p.number}-${i}`} className={p.number === 0 ? 'team-row' : ''}>
              <td className="name">{playerLabel(p, side.name)}</td>
              {zones.map((z) => (
                <td key={z} title={byZone[z] ? `${byZone[z].pct} %` : ''}>{byZone[z]?.count || ''}</td>
              ))}
              <td>{total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Situations : qualité de réception (+ / 0 / −) → issue de la 1re attaque. */
function SituationTable({ side }) {
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Réception</th>
          <th>Attaques</th>
          <th>Pts</th>
          <th>Err</th>
          <th>Contrées</th>
          <th>Réussite</th>
          <th>Eff%</th>
        </tr>
      </thead>
      <tbody>
        {['+', '0', '-'].map((sit) => {
          const c = side.situations[sit];
          return (
            <tr key={sit}>
              <td className="name">{c.label} ({sit})</td>
              <td>{c.total}</td>
              <td>{c.points}</td>
              <td>{c.errors}</td>
              <td>{c.blocked}</td>
              <td>{c.total ? `${c.successPct}%` : '—'}</td>
              <td>{c.total ? `${c.efficiency}%` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Complexe I / II (FBSO, Side-out global, Side-out en Transition et Break Point). */
function ComplexBlock({ side }) {
  const { sideOut, fbso = { total: 0, won: 0, pct: 0 }, transitionSideOut = { total: 0, won: 0, pct: 0 }, transition } = side.complex || {};
  return (
    <div className="report-complex" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <div className="report-complex-card" style={{ borderColor: 'rgba(16, 185, 129, 0.35)' }}>
        <span className="report-complex-title" style={{ color: '#10b981' }}>FBSO% (1st Ball Side-Out)</span>
        <span className="report-complex-value" style={{ color: '#34d399' }}>{fbso.total ? `${fbso.pct}%` : '—'}</span>
        <span className="report-complex-detail">{fbso.won} / {fbso.total} sur 1re attaque K1</span>
      </div>
      <div className="report-complex-card">
        <span className="report-complex-title">Side-Out Total (SO%) — K1</span>
        <span className="report-complex-value">{sideOut?.total ? `${sideOut.pct}%` : '—'}</span>
        <span className="report-complex-detail">{sideOut?.won || 0} / {sideOut?.total || 0} réceptions gagnées</span>
      </div>
      <div className="report-complex-card">
        <span className="report-complex-title">Side-Out après Défense (K1→K2)</span>
        <span className="report-complex-value">{transitionSideOut.total ? `${transitionSideOut.pct}%` : '—'}</span>
        <span className="report-complex-detail">{transitionSideOut.won} / {transitionSideOut.total} rallye(s) rejoué(s)</span>
      </div>
      <div className="report-complex-card" style={{ borderColor: 'rgba(245, 158, 11, 0.35)' }}>
        <span className="report-complex-title" style={{ color: '#f59e0b' }}>Break Point (BP%) — K2</span>
        <span className="report-complex-value" style={{ color: '#fbbf24' }}>{transition?.total ? `${transition.pct}%` : '—'}</span>
        <span className="report-complex-detail">{transition?.won || 0} / {transition?.total || 0} services gagnés</span>
      </div>
    </div>
  );
}

/** Rotations P1..P6. */
function RotationTable({ side }) {
  return (
    <table className="report report-compact">
      <thead>
        <tr>
          <th className="name">Rotation</th>
          <th>Points</th>
          <th>Gagnés</th>
          <th>%</th>
          <th>Eff% srv</th>
          <th>Eff% att</th>
        </tr>
      </thead>
      <tbody>
        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((pos) => {
          const r = side.rotations[pos];
          return (
            <tr key={pos}>
              <td className="name">{pos}</td>
              <td>{r.rallies}</td>
              <td>{r.won}</td>
              <td>{r.rallies ? `${r.pct}%` : '—'}</td>
              <td>{r.serve.total ? `${r.serveEfficiency}%` : '—'}</td>
              <td>{r.attack.total ? `${r.attackEfficiency}%` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Classements (meilleurs joueurs par compétence). */
function RankingsBlock({ side }) {
  return (
    <ul className="report-rankings">
      {Object.entries(RANKING_LABELS).map(([key, label]) => {
        const item = side.rankings[key];
        return (
          <li key={key}>
            <span className="report-ranking-label">{label}</span>
            {item ? (
              <span className="report-ranking-player">
                n°{String(item.player.number).padStart(2, '0')}
                {item.player.name ? ` ${item.player.name}` : ''}
                <strong>{key === 'block' ? `${item.value} pts` : `${item.value}%`}</strong>
              </span>
            ) : (
              <span className="dv-hint">—</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
/** Table « directions d'attaque » (zone de départ → zone d'arrivée). */
function DirectionTable({ side }) {
  const rows = directionTableRows(side, 'attack');
  if (rows.length === 0) return null;
  return (
    <>
      <h5>Directions d’attaque (départ → arrivée)</h5>
      <table className="report report-compact">
        <thead>
          <tr>
            <th className="name">Direction</th>
            <th>Tot</th>
            <th>Pts</th>
            <th>Err</th>
            <th>Contrées</th>
            <th>Eff%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="name">Zone {r.start} → {r.end}</td>
              <td>{r.total}</td>
              <td>{r.points}</td>
              <td>{r.errors}</td>
              <td>{r.blocked}</td>
              <td>{r.efficiency}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Synthèse par set : efficacités clés des deux équipes, set par set. */
function SetTable({ report }) {
  const rows = setEfficiencyRows(report);
  if (rows.length === 0) return <p className="dv-hint">Aucun set avec des actions codées.</p>;
  const h = report?.home?.name || 'Domicile';
  const a = report?.away?.name || 'Extérieur';
  return (
    <div className="report-wrap">
      <table className="report report-compact">
        <thead>
          <tr className="group-row">
            <th className="name" rowSpan={2}>Set</th>
            <th colSpan={5}>{h}</th>
            <th colSpan={5}>{a}</th>
          </tr>
          <tr>
            <th>Eff% srv</th><th>Pos% réc</th><th>Att %</th><th>Eff% att</th><th>Pts</th>
            <th>Eff% srv</th><th>Pos% réc</th><th>Att %</th><th>Eff% att</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.setNumber}>
              <td className="name">Set {r.setNumber}</td>
              <td>{r.home.serve}%</td><td>{r.home.recPos}%</td><td>{r.home.attPct}%</td><td>{r.home.attEff}%</td><td>{r.home.points}</td>
              <td>{r.away.serve}%</td><td>{r.away.recPos}%</td><td>{r.away.attPct}%</td><td>{r.away.attEff}%</td><td>{r.away.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Eff. srv / Att. eff = (points − fautes [− contrées]) / total · Réc. pos. = réceptions «&nbsp;#&nbsp;» et «&nbsp;+&nbsp;» · Pts = points marqués (service + attaque + contre).
      </p>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.report - sortie de computeScouting()
 * @param {'coding'|'live'} [props.context] - mention affichée dans l'en-tête
 * @param {React.ReactNode} [props.actionsBar] - boutons d'export (en-tête)
 * @param {number[]} [props.sets] - sets disponibles (filtre)
 * @param {number[]} [props.activeSets]
 * @param {Function} [props.onToggleSet]
 * @param {Array} [props.rawActions] - actions brutes (types observés)
 * @param {Array} [props.events] - temps morts / remplacements (impression)
 * @param {string} [props.initialTab] - sous-onglet ouvert au départ
 * @param {string} [props.tab] - onglet piloté par le menu (sans remontage)
 * @param {Function} [props.onTab] - (key) => void (menu / barre d'onglets)
 * @param {boolean} [props.hideTabs] - masque la barre d'onglets (menu à gauche)
 * @param {Function} [props.onDirectionCell] - (row) => void (filtre la liste)
 * @param {string} [props.initialSide] - équipe affichée au départ
 */
export default function MatchReportFull({
  report,
  context = 'coding',
  actionsBar = null,
  sets = [],
  activeSets = [],
  onToggleSet,
  rawActions = [],
  events = [],
  initialTab = 'synthese',
  tab: controlledTab = null,
  onTab,
  hideTabs = false,
  onDirectionCell,
  initialSide = 'home',
}) {
  const [internalTab, setInternalTab] = useState(initialTab);
  const [side, setSide] = useState(initialSide);
  const [printAll, setPrintAll] = useState(false);
  // Onglet piloté par le menu de gauche : pas de remontage du composant, on
  // garde `initialTab` en secours quand l'onglet n'est pas contrôlé.
  const tab = controlledTab ?? internalTab;
  const setTab = (key) => {
    setInternalTab(key);
    onTab?.(key);
  };

  const current = useMemo(() => TABS.find((t) => t.key === tab) || TABS[0], [tab]);
  const sides = useMemo(
    () => [
      { key: 'home', label: report?.home?.name || 'Domicile' },
      { key: 'away', label: report?.away?.name || 'Extérieur' },
    ],
    [report]
  );

  if (!report) return <p className="dv-hint">Aucune donnée à afficher.</p>;

  const sideName = sides.find((s) => s.key === side)?.label || '';
  const skillsOfTab = current.skill ? [current.skill] : (current.skills || []);
  const actionOfSkill = (skillId) => SKILLS.find((s) => s.id === skillId)?.action || 'S';

  /** Cartes de zones affichées dans le sous-onglet « Zones ». */
  const ZONE_SKILLS = ['serve', 'reception', 'attack', 'block'];

  const printDocument = () => {
    setPrintAll(true);
    // Laisse React peindre le document complet avant d'ouvrir l'impression.
    if (typeof window !== 'undefined') window.setTimeout(() => window.print(), 80);
  };

  return (
    <div className="report-full">
      {/* Barre : sous-onglets, choix d'équipe, export */}
      <div className="report-bar">
        <div className="dv-stat-tabs report-tabs">
          {!hideTabs &&
            TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`video-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
        </div>
        <div className="report-bar-right">
          <div className="dv-stat-tabs">
            {sides.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`video-tab ${side === s.key ? 'active' : ''}`}
                onClick={() => setSide(s.key)}
                title={s.label}
              >
                {s.label}
              </button>
            ))}
          </div>
          {actionsBar}
        </div>
      </div>

      {sets.length > 1 && onToggleSet && (
        <div className="report-set-filter">
          <button
            type="button"
            className={`btn btn-sm ${activeSets.length === 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onToggleSet(0)}
          >
            Tous les sets
          </button>
          {sets.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-sm ${activeSets.includes(s) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onToggleSet(s)}
            >
              Set {s}
            </button>
          ))}
        </div>
      )}

      <p className="dv-hint report-context">
        {report.actionCount} action(s) codée(s) · {report.rallyCount} point(s) ·{' '}
        {context === 'live' ? 'match en direct' : 'codage vidéo'}
        {events.length > 0 ? ` · ${events.length} événement(s)` : ''}
      </p>
<div className="report-body">
        {tab === 'synthese' && (
          <MatchReportTable report={report} sets={sets} activeSets={activeSets} onToggleSet={onToggleSet} />
        )}

        {tab === 'combinaisons' && (
          <>
            <h5>Combinaisons d’attaque — {sideName}</h5>
            <ComboTable side={report[side]} />
            <h5 style={{ marginTop: 16 }}>Appels du Passeur (Fixation Central : K1, K2, K7, KE…) — {sideName}</h5>
            <SetterCallTable side={report[side]} />
            <h5 style={{ marginTop: 16 }}>Efficacité d’Attaque par Nombre de Contreurs (0 / 1 / 2 / 3 / Trou) — {sideName}</h5>
            <BlockersTable side={report[side]} />
          </>
        )}

        {tab === 'parette' && <SetTable report={report} />}

        {tab === 'joueurs' && <PlayersTable report={report} />}

        {tab === 'directions' && (
          <>
            <h5>Directions d’attaque — {sideName}</h5>
            <p className="dv-hint">
              Zone de départ × zone d’arrivée : chaque chiffre du tableau est l’agrégat d’un couple
              (« 4 → 5 »). Cliquez une cellule ou une flèche pour filtrer la liste des actions.
            </p>
            <div className="dirc-grid">
              <DirectionMap rows={directionTableRows(report[side], 'attack')} onPick={onDirectionCell} />
              <div>
                <DirectionCrossTable rows={directionTableRows(report[side], 'attack')} onPick={onDirectionCell} />
                <div className="dirc-aggregates">
                  {directionTableRows(report[side], 'attack').map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      className="dvc-missing"
                      onClick={() => onDirectionCell?.(row)}
                      title={`${row.total} attaque(s) · ${row.efficiency}% d’efficacité`}
                    >
                      {row.key} · {row.total}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {current.skill && (
          <>
            <h5>{skillLabel(current.skill)} — {sideName}</h5>
            <EvalTable side={report[side]} skillId={current.skill} label={skillLabel(current.skill)} />
            <h5>Par type</h5>
            <TypeTable side={report[side]} skillId={current.skill} actionCode={current.action} actions={rawActions} />
            <h5>Par zone</h5>
            <ZoneTable side={report[side]} skillId={current.skill} />
            <ZoneHeatmap
              zones={report[side].totals.skills[current.skill].byZone}
              title={`${skillLabel(current.skill)} — ${sideName}`}
            />
            {current.skill === 'attack' && (
              <>
                <h5>Par Nombre de Contreurs (0 / 1 / 2 / 3 / Trou)</h5>
                <BlockersTable side={report[side]} />
                <DirectionTable side={report[side]} />
              </>
            )}
          </>
        )}

        {current.skills && skillsOfTab.map((skillId) => (
          <div key={skillId} className="report-subsection">
            <h5>{skillLabel(skillId)} — {sideName}</h5>
            <EvalTable side={report[side]} skillId={skillId} label={skillLabel(skillId)} />
            <TypeTable side={report[side]} skillId={skillId} actionCode={actionOfSkill(skillId)} actions={rawActions} />
          </div>
        ))}

        {tab === 'zones' && ZONE_SKILLS.map((skillId) => (
          <div key={skillId} className="report-subsection">
            <h5>{skillLabel(skillId)} — {sideName}</h5>
            <ZoneHeatmap zones={report[side].totals.skills[skillId].byZone} title={skillLabel(skillId)} />
            <ZoneTable side={report[side]} skillId={skillId} />
          </div>
        ))}

        {(tab === 'situations' || tab === 'rotations' || tab === 'classements') && sides.map((s) => (
          <div key={s.key} className="report-subsection">
            <h5>{current.label} — {s.label}</h5>
            {tab === 'situations' && (
              <>
                <ComplexBlock side={report[s.key]} />
                <div style={{ marginTop: 10 }}>
                  <SituationTable side={report[s.key]} />
                </div>
              </>
            )}
            {tab === 'rotations' && <RotationTable side={report[s.key]} />}
            {tab === 'classements' && (
              <>
                <RankingsBlock side={report[s.key]} />
                <ComplexBlock side={report[s.key]} />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Document imprimable : tout le rapport, une section par page. */}
      {printAll && (
        <div className="report-print">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PancakeLogo size={32} /> Pancake Stats — Rapport de match
          </h1>
          <p className="report-print-meta">
            {report.home.name} — {report.away.name} · {report.actionCount} action(s) · {report.rallyCount} point(s)
            {activeSets.length > 0 ? ` · set(s) ${activeSets.join(', ')}` : ''}
          </p>
          <section className="report-print-section">
            <h2>Synthèse</h2>
            <MatchReportTable report={report} />
          </section>
          {SKILLS.map((s) => (
            <section key={s.id} className="report-print-section">
              <h2>{s.label}</h2>
              {['home', 'away'].map((k) => (
                <div key={k}>
                  <h3>{report[k].name}</h3>
                  <EvalTable side={report[k]} skillId={s.id} label={s.label} />
                  <TypeTable side={report[k]} skillId={s.id} actionCode={s.action} actions={rawActions} />
                  <h4>Zones</h4>
                  <ZoneHeatmap zones={report[k].totals.skills[s.id].byZone} title={s.label} />
                  <ZoneTable side={report[k]} skillId={s.id} />
                </div>
              ))}
            </section>
          ))}
          <section className="report-print-section">
            <h2>Situations</h2>
            {['home', 'away'].map((k) => (
              <div key={k}>
                <h3>{report[k].name}</h3>
                <SituationTable side={report[k]} />
              </div>
            ))}
          </section>
          <section className="report-print-section">
            <h2>Rotations</h2>
            {['home', 'away'].map((k) => (
              <div key={k}>
                <h3>{report[k].name}</h3>
                <RotationTable side={report[k]} />
              </div>
            ))}
          </section>
          <section className="report-print-section">
            <h2>Complexe I / II et classements</h2>
            {['home', 'away'].map((k) => (
              <div key={k}>
                <h3>{report[k].name}</h3>
                <ComplexBlock side={report[k]} />
                <RankingsBlock side={report[k]} />
              </div>
            ))}
          </section>
          {events.length > 0 && (
            <section className="report-print-section">
              <h2>Temps morts et remplacements</h2>
              <table className="report report-compact">
                <thead>
                  <tr><th className="name">Type</th><th>Set</th><th>Après</th><th>Équipe</th><th>Détail</th></tr>
                </thead>
                <tbody>
                  {events.map((ev, i) => (
                    <tr key={ev.id ?? i}>
                      <td className="name">{ev.kind === 'timeout' ? 'Temps mort' : 'Remplacement'}</td>
                      <td>{ev.set_number || 1}</td>
                      <td>{Number(ev.point_number) || 0} pt</td>
                      <td>{ev.team === 'away' ? report.away.name : report.home.name}</td>
                      <td>{ev.kind === 'substitution' ? `n°${ev.payload?.out} → n°${ev.payload?.in}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      <div className="report-print-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={printDocument}>
          Imprimer / PDF (tout le rapport)
        </button>
      </div>
    </div>
  );
}