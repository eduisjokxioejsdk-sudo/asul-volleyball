// ============================================================================
// DISTRIBUTION D'UN MATCH (mode DataVolley)
//
// Deux rendus, un seul calcul :
//  - `variant="full"`      : rapport IDENTIQUE à l'onglet « Distribution »
//    (/distribution) — même moteur (utils/excelDistributionEngine) et même
//    composant de rendu (ExcelDistributionReport).
//  - `variant="synthetic"` : synthèse compacte des mêmes chiffres pour le banc
//    (mode Banc / Coach) : KPI, répartition par zone, attaquants, réception.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import ExcelDistributionReport from './ExcelDistributionReport';
import {
  EXCEL_ALL_BOXES,
  cleanVal,
  computeExcelDistributionReport,
  extractPossessionsFromMatches,
} from '../utils/excelDistributionEngine';
import { House, Plane } from './icons';

const PHASES = [
  { id: 'ALL', label: 'Toutes phases (S+F+T+C)' },
  { id: 'K1', label: 'Réception / Side-Out (S+F+T)' },
  { id: 'K2', label: 'Contre-attaque (C)' },
];

/** Libellés courts des 8 boîtes d'attaque du demi-terrain de distribution. */
const BOX_LABELS = {
  'EN 1': 'EN 1 · arrière 1',
  PIPE: 'PIPE · arrière 6',
  autres: 'Autres',
  'EN 2': 'EN 2 · poste 2',
  'FIX ARR': 'Fix. arrière',
  'FIX AV': 'Fix. avant',
  DECA: 'Décalée',
  'EN 4': 'EN 4 · poste 4',
};

const SYNTH_SECTION_LABEL = {
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#a1a1aa',
  marginBottom: 4,
};

const FILTER_LABEL = {
  fontSize: 11.5,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#a1a1aa',
  marginRight: 4,
};

function fmtPct(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits).replace('.', ',')}%`;
}

/** Somme des ballons (et points) de plusieurs boîtes du demi-terrain. */
function sumBoxes(boxes, keys) {
  return keys.reduce(
    (acc, key) => ({
      q: acc.q + (boxes[key]?.q || 0),
      kills: acc.kills + (boxes[key]?.kills || 0),
    }),
    { q: 0, kills: 0 }
  );
}

/** Tuile de KPI de la synthèse. */
function Kpi({ label, value, detail, accent = '#f4f4f5' }) {
  return (
    <div style={{ padding: '8px 10px', background: '#09090b', border: '1px solid #27272a' }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#a1a1aa',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          marginTop: 2,
          color: accent,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {value}
      </div>
      {detail && <div style={{ fontSize: 10.5, color: '#a1a1aa', marginTop: 1 }}>{detail}</div>}
    </div>
  );
}


/** Tuile KPI de l'en-tête du rapport (même présentation que l'onglet Distribution). */
function Metric({ label, value, detail, accent = '#f4f4f5' }) {
  return (
    <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 900,
          color: accent,
          marginTop: 2,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#a1a1aa' }}>{detail}</div>
    </div>
  );
}

/**
 * Synthèse compacte du rapport de distribution (version « banc »).
 * Ne recalcule rien : tout vient de `computeExcelDistributionReport`.
 * @param {Object} props
 * @param {Object} props.report - rapport renvoyé par computeExcelDistributionReport.
 */
export function DistributionSynthesis({ report }) {
  if (!report || !report.globalCourt) return null;

  const { globalCourt, saisieSummary } = report;
  const boxes = globalCourt.boxes || {};
  const total = globalCourt.totalActions || 0;

  if (!total) {
    return <p className="dv-hint" style={{ margin: 0 }}>Aucune attaque éligible pour cette sélection.</p>;
  }

  const wing = sumBoxes(boxes, ['EN 2', 'EN 1']);
  const middle = sumBoxes(boxes, ['FIX AV', 'FIX ARR', 'DECA', 'PIPE']);
  const four = sumBoxes(boxes, ['EN 4']);

  const rows = EXCEL_ALL_BOXES
    .map((key) => ({ key, ...(boxes[key] || { q: 0, disPct: 0, effPct: 0 }) }))
    .sort((a, b) => b.q - a.q || a.key.localeCompare(b.key));
  const maxQ = Math.max(1, ...rows.map((r) => r.q));

  const attackers = (saisieSummary?.attackerBreakdown || []).slice(0, 5);
  const reception = (saisieSummary?.receptionQualityBreakdown || []).filter((r) => r.count > 0);
  const setters = (saisieSummary?.setterBreakdown || []).slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 6 }}>
        <Kpi label="Attaques" value={total} detail={`Eff. ${fmtPct(globalCourt.totalEffPct)}`} />
        <Kpi
          label="Poste 4"
          value={fmtPct((four.q / total) * 100)}
          detail={`${four.q} ballon(s)`}
          accent="#f59e0b"
        />
        <Kpi
          label="P2 + P1"
          value={fmtPct((wing.q / total) * 100)}
          detail={`${wing.q} ballon(s)`}
          accent="#10b981"
        />
        <Kpi
          label="Centre + Pipe"
          value={fmtPct((middle.q / total) * 100)}
          detail={`${middle.q} ballon(s)`}
          accent="#38bdf8"
        />
      </div>

      <div>
        <div style={SYNTH_SECTION_LABEL}>Répartition par zone</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map((r) => (
            <div
              key={r.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '86px 1fr 76px',
                alignItems: 'center',
                gap: 6,
                fontSize: 10.5,
              }}
            >
              <span style={{ color: '#d4d4d8' }}>{BOX_LABELS[r.key] || r.key}</span>
              <span style={{ height: 6, background: '#27272a', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${(r.q / maxQ) * 100}%`,
                    background: '#c8a165',
                  }}
                />
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#f4f4f5',
                }}
              >
                {fmtPct(r.disPct, 1)} · {r.q}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div>
          <div style={SYNTH_SECTION_LABEL}>Attaquants les plus sollicités</div>
          {attackers.length === 0 && <p className="dv-hint" style={{ margin: 0 }}>Aucun attaquant identifié.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {attackers.map((a) => (
              <div
                key={a.number}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10.5, padding: '1px 0' }}
              >
                <span style={{ color: '#e4e4e7' }}>
                  N°{a.number}
                  {a.name ? ` ${a.name}` : ''}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#a1a1aa' }}>
                  {a.q} · {fmtPct(a.killPct)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={SYNTH_SECTION_LABEL}>Qualité de réception</div>
          {reception.length === 0 ? (
            <p className="dv-hint" style={{ margin: 0 }}>Aucune réception codée.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {reception.map((r) => (
                <span
                  key={r.key}
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    border: `1px solid ${r.color}`,
                    color: r.color,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {r.label} {r.count} · {fmtPct(r.pct)}
                </span>
              ))}
            </div>
          )}
          {setters.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#a1a1aa' }}>
              Temps de jeu : {setters.map((s) => `${s.label} ${fmtPct(s.pct)}`).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Distribution d'un match : rapport complet (mode Analyse) ou synthèse
 * (mode Banc). L'extraction et les calculs sont ceux de l'onglet
 * « Distribution » : un seul jeu de chiffres pour toute l'application.
 *
 * @param {Object} props
 * @param {Object} [props.video] - fiche vidéo du match (id, team1_name, team2_name).
 * @param {Array} props.actions - actions codées du match.
 * @param {Object} [props.setups] - six de départ par set.
 * @param {Array} [props.events] - temps morts / remplacements.
 * @param {Object} [props.homeConfig] - fiche équipe domicile (rôles des joueurs).
 * @param {Object} [props.awayConfig] - fiche équipe extérieur.
 * @param {string} [props.team1] - nom de l'équipe domicile.
 * @param {string} [props.team2] - nom de l'équipe extérieur.
 * @param {'home'|'away'} [props.initialTeam='home'] - équipe affichée au départ.
 * @param {'full'|'synthetic'} [props.variant='full'] - rendu complet ou synthèse.
 * @param {Function} [props.onSeekAction] - relit une action dans la vidéo.
 */
export default function MatchDistributionPanel({
  video = null,
  actions = [],
  setups = {},
  events = [],
  homeConfig = null,
  awayConfig = null,
  team1 = 'Domicile',
  team2 = 'Extérieur',
  initialTeam = 'home',
  variant = 'full',
  onSeekAction = null,
}) {
  const [team, setTeam] = useState(initialTeam);
  const [selectedSetter, setSelectedSetter] = useState('ALL');
  const [phaseFilter, setPhaseFilter] = useState('ALL');

  // Le mode Banc pilote l'équipe observée : on suit la sélection du parent.
  useEffect(() => {
    setTeam(initialTeam);
  }, [initialTeam]);

  const teamName = team === 'home' ? team1 : team2;
  const config = team === 'home' ? homeConfig : awayConfig;

  const players = useMemo(
    () =>
      (config?.roster || []).map((p) => ({
        number: Number(p.number) || 0,
        name: p.name || '',
        role: p.role || 'universal',
      })),
    [config]
  );

  // Possessions au format de la feuille « saisie » de l'Excel : même
  // extraction que l'onglet Distribution, limitée à ce match.
  const possessions = useMemo(() => {
    if (!teamName) return [];
    const matchVideo = {
      ...(video || {}),
      team1_name: video?.team1_name || team1,
      team2_name: video?.team2_name || team2,
    };
    return extractPossessionsFromMatches(
      [{ video: matchVideo, actions, setups, events, players }],
      teamName
    );
  }, [video, actions, setups, events, players, teamName, team1, team2]);

  const setters = useMemo(() => {
    const counts = new Map();
    let total = 0;
    for (const p of possessions) {
      const s = cleanVal(p.setterNumber) || 'NP';
      counts.set(s, (counts.get(s) || 0) + 1);
      total += 1;
    }
    return [...counts.entries()]
      .map(([setter, count]) => ({
        setter,
        label: setter === 'NP' ? 'NP (Non-Passeur)' : `Passeur N°${setter}`,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (a.setter === 'NP') return 1;
        if (b.setter === 'NP') return -1;
        return b.count - a.count;
      });
  }, [possessions]);

  // Un passeur qui disparaît (autre équipe / autre match) retombe sur « Tous ».
  useEffect(() => {
    if (selectedSetter !== 'ALL' && !setters.some((s) => cleanVal(s.setter) === cleanVal(selectedSetter))) {
      setSelectedSetter('ALL');
    }
  }, [setters, selectedSetter]);

  const report = useMemo(
    () => computeExcelDistributionReport(possessions, { setterFilter: selectedSetter, phaseFilter }),
    [possessions, selectedSetter, phaseFilter]
  );

  const setterLabel =
    selectedSetter === 'ALL'
      ? 'Tous les passeurs'
      : selectedSetter === 'NP'
      ? 'NP (Non-Passeur)'
      : `Passeur N°${selectedSetter}`;

  // Chiffres d'en-tête, identiques aux tuiles de l'onglet Distribution.
  const courtBoxes = report.globalCourt.boxes || {};
  const courtTotal = report.globalCourt.totalActions || 0;
  const wingQ = sumBoxes(courtBoxes, ['EN 2', 'EN 1']).q;
  const centerQ = sumBoxes(courtBoxes, ['FIX AV', 'FIX ARR', 'DECA', 'PIPE']).q;
  const fourBox = courtBoxes['EN 4'] || { q: 0, kills: 0, disPct: 0, effPct: 0 };


  const teamSelector = (
    <div className="btn-group-horizontal">
      <button
        type="button"
        className={`btn-choice ${team === 'home' ? 'active team1' : ''}`}
        onClick={() => setTeam('home')}
        title={`Distribution de ${team1}`}
      >
        <House size={13} /> {team1}
      </button>
      <button
        type="button"
        className={`btn-choice ${team === 'away' ? 'active team2' : ''}`}
        onClick={() => setTeam('away')}
        title={`Distribution de ${team2}`}
      >
        <Plane size={13} /> {team2}
      </button>
    </div>
  );

  const setterSelector = (
    <>
      <button
        type="button"
        className={`btn btn-sm ${selectedSetter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setSelectedSetter('ALL')}
      >
        Tous les passeurs ({possessions.length})
      </button>
      {setters.map((s) => {
        const active = cleanVal(selectedSetter) === cleanVal(s.setter);
        return (
          <button
            key={s.setter}
            type="button"
            className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedSetter(s.setter)}
          >
            <span>{s.label}</span>
            <span
              style={{
                marginLeft: 6,
                padding: '0 5px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                background: active ? 'rgba(0,0,0,0.28)' : '#09090b',
              }}
            >
              {s.count} ({s.pct}%)
            </span>
          </button>
        );
      })}
    </>
  );

  const phaseSelector = PHASES.map((ph) => (
    <button
      key={ph.id}
      type="button"
      className={`btn btn-sm ${phaseFilter === ph.id ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => setPhaseFilter(ph.id)}
    >
      {ph.label}
    </button>
  ));

  if (variant === 'synthetic') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Synthèse distribution — {teamName}
          </strong>
          {teamSelector}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          {setterSelector}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          {phaseSelector}
        </div>

        <p className="dv-hint" style={{ margin: 0 }}>
          {setterLabel} · mêmes chiffres que la fenêtre Distribution du mode Analyse.
        </p>

        <DistributionSynthesis report={report} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h4 style={{ margin: 0 }}>Distribution du passeur — {teamName}</h4>
          <p className="dv-hint" style={{ margin: '4px 0 0' }}>
            Rapport identique à l’onglet « Distribution » : rotations, bases, zones de réception, 13 zones de
            passe et feuille « saisie ».
          </p>
        </div>
        {teamSelector}
      </div>

      <div
        style={{
          padding: '10px 12px',
          background: '#141418',
          border: '1px solid #27272a',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={FILTER_LABEL}>Passeur :</span>
          {setterSelector}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <span style={FILTER_LABEL}>Phase :</span>
          {phaseSelector}
        </div>
      </div>

      {report.globalCourt.totalActions === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', background: '#141418', border: '1px solid #27272a' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
            Aucune possession d’attaque trouvée.
          </div>
          <p className="dv-hint" style={{ margin: 0 }}>
            Codez au moins une attaque (avec sa zone de distribution), ou vérifiez le passeur et la phase
            sélectionnés.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 10,
            }}
          >
            <Metric label="Équipe / Passeur" value={teamName} detail={setterLabel} accent="#c8a165" />
            <Metric label="Total actions" value={courtTotal} detail="possessions analysées" />
            <Metric
              label="Actions gagnantes (#)"
              value={report.globalCourt.totalKills}
              detail={`EFF : ${fmtPct(report.globalCourt.totalEffPct, 1)}`}
              accent="#10b981"
            />
            <Metric
              label="Poste 4 (EN 4)"
              value={fmtPct(fourBox.disPct, 1)}
              detail={`Q=${fourBox.q} · ${fourBox.kills}# (${Math.round(fourBox.effPct)}%)`}
            />
            <Metric
              label="Poste 2 / 1 (EN 2 + EN 1)"
              value={fmtPct(courtTotal ? (wingQ / courtTotal) * 100 : 0, 1)}
              detail={`EN 2: ${courtBoxes['EN 2']?.q || 0} · EN 1: ${courtBoxes['EN 1']?.q || 0}`}
            />
            <Metric
              label="Fixations + Pipe"
              value={fmtPct(courtTotal ? (centerQ / courtTotal) * 100 : 0, 1)}
              detail={`Fix Av: ${courtBoxes['FIX AV']?.q || 0} · Arr: ${courtBoxes['FIX ARR']?.q || 0} · Pipe: ${
                courtBoxes.PIPE?.q || 0
              }`}
            />
          </div>

          <ExcelDistributionReport
            report={report}
            teamName={teamName}
            setterLabel={setterLabel}
            onSelectActionsForVideo={
              onSeekAction
                ? (title, list) => {
                    const first = (list || [])[0];
                    if (first) onSeekAction(first.actionObj || first);
                  }
                : null
            }
          />
        </>
      )}
    </div>
  );
}
