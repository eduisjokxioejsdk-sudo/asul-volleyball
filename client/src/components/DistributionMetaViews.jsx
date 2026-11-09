// Compteurs de couverture et tableaux Appels / Combinaisons. Les ratios sont
// ceux du moteur de distribution ; aucun calcul n'est refait dans ces vues.

const LABELS = {
  UNKNOWN_PHASE: 'phase inconnue',
  UNKNOWN_SITUATION: 'qualité inconnue',
  UNKNOWN_ATTACK_ZONE: 'zone d’attaque inconnue',
};

export function DistributionCoverage({ meta }) {
  if (!meta) return null;
  const excluded = Object.entries(meta.excluded || {}).filter(([, count]) => count > 0);
  return (
    <div className="dv-hint" style={{ padding: 8, border: '1px solid #27272a', marginBottom: 10, fontSize: 11 }}>
      <strong>Couverture du rapport :</strong>{' '}
      {meta.rawAttacks} attaque(s) · {meta.eligible} éligible(s) · <strong>{meta.included} affichée(s)</strong>
      {meta.filteredOut > 0 && ` · ${meta.filteredOut} écartée(s) par les filtres`}.
      {excluded.length > 0 && (
        <div>Exclusions : {excluded.map(([key, count]) => `${count} ${LABELS[key] || key}`).join(' · ')}.</div>
      )}
      {(meta.unknownRotation > 0 || meta.unknownPassZone > 0) && (
        <div>
          {meta.unknownRotation > 0 && `${meta.unknownRotation} rotation(s) indéterminée(s)`}
          {meta.unknownRotation > 0 && meta.unknownPassZone > 0 && ' · '}
          {meta.unknownPassZone > 0 && `${meta.unknownPassZone} zone(s) de passe inconnue(s)`}.
        </div>
      )}
    </div>
  );
}

function CodeTable({ title, data, rotation, onPick = null }) {
  const rows = Object.entries(data || {})
    .map(([code, row]) => ({ code, stats: rotation === 'Total' ? row.total : row.byRotation[rotation], situations: row.bySituation }))
    .filter((r) => r.stats)
    .sort((a, b) => b.stats.total - a.stats.total || a.code.localeCompare(b.code));
  if (!rows.length) return <p className="dv-hint">Aucune donnée pour cette sélection.</p>;
  return (
    <div>
      <h5>{title}</h5>
      <table className="report report-compact">
        <thead>
          <tr>
            <th className="name">Code</th><th>Att.</th><th>Part</th><th>Pts</th><th>Fautes</th><th>Contrées</th>
            <th>% pts</th><th>Eff</th><th>Après +</th><th>Après 0</th><th>Après −</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ code, stats, situations }) => (
            <tr
              key={code}
              onClick={onPick ? () => onPick({ code, actions: stats.actions }) : undefined}
              style={onPick ? { cursor: 'pointer' } : undefined}
              title={onPick ? 'Afficher les attaques de ce code' : undefined}
            >
              <td className="name"><strong>{code}</strong></td>
              <td>{stats.total}</td><td>{rotation === 'Total' ? `${stats.pct}%` : '—'}</td>
              <td>{stats.points}</td><td>{stats.errors}</td><td>{stats.blocked}</td>
              <td>{stats.killPct}%</td><td>{stats.eff}%</td>
              <td>{situations['+']?.total || 0}</td><td>{situations['0']?.total || 0}</td><td>{situations['-']?.total || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DistributionCodeTable({ title, data, rotation = 'Total', onPick = null }) {
  return <CodeTable title={title} data={data} rotation={rotation} onPick={onPick} />;
}
