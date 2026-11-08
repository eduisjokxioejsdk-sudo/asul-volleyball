// Indicateur de qualité du codage : part des attaques et services avec direction,
// sous-zone d'arrivée, type de frappe et coordonnées précises (clics).

import { useMemo } from 'react';
import { codingQuality } from '../utils/dvTrajectories.js';

function Gauge({ label, value }) {
  const color = value >= 90 ? '#34d399' : value >= 60 ? '#fbbf24' : '#fb7185';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }} title={`${label} : ${value}%`}>
      {label}
      <span style={{ display: 'inline-block', width: 44, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }}>
        <i style={{ display: 'block', width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </span>
      {value}%
    </span>
  );
}

export default function CodingQualityBadge({ actions = [] }) {
  const attack = useMemo(() => codingQuality(actions, 'A'), [actions]);
  const serve = useMemo(() => codingQuality(actions, 'S'), [actions]);
  if (attack.total + serve.total === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
      <strong>Qualité du codage</strong>
      {attack.total > 0 && (
        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          Attaque ({attack.total}) :
          <Gauge label="direction" value={attack.direction} />
          <Gauge label="sous-zone" value={attack.subzone} />
          <Gauge label="type" value={attack.type} />
          <Gauge label="clics" value={attack.xy} />
        </span>
      )}
      {serve.total > 0 && (
        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          Service ({serve.total}) :
          <Gauge label="direction" value={serve.direction} />
          <Gauge label="sous-zone" value={serve.subzone} />
          <Gauge label="type" value={serve.type} />
        </span>
      )}
    </div>
  );
}
