// ============================================================================
// Bilan de match standardisé (présentation feuille de match FIVB / LNV).
// Colonnes calculées à partir des codes DataVolley (voir utils/matchReport).
// ============================================================================

import { REPORT_COLUMNS, formatReportCell, reportHeaderGroups } from '../utils/matchReport';
import { roleColor, roleShort } from '../utils/lineup';

/**
 * @param {Object} props
 * @param {Object} props.report - résultat de computeMatchReport()
 * @param {number[]} [props.sets] - sets disponibles pour le filtre
 * @param {number[]} [props.activeSets] - sets sélectionnés (vide = tous)
 * @param {Function} [props.onToggleSet] - (setNumber) => void ; 0 = tous
 */
export default function MatchReportTable({ report, sets = [], activeSets = [], onToggleSet }) {
  const groups = reportHeaderGroups();
  const columns = REPORT_COLUMNS;

  const rows = (sideKey) => {
    const side = report[sideKey];
    return (
      <>
        {side.players.map((p) => (
          <tr key={`${sideKey}-${p.number}`}>
            <td className="name">
              <span className="report-role" style={{ background: roleColor(p.rosterRole) }}>
                {roleShort(p.rosterRole)}
              </span>{' '}
              n°{String(p.number).padStart(2, '0')}
              {p.name ? ` ${p.name}` : ''}
            </td>
            {columns.map((c) => (
              <td key={c.key} title={c.label}>
                {formatReportCell(c.get(p), c.key)}
              </td>
            ))}
          </tr>
        ))}
        {side.players.length === 0 && (
          <tr>
            <td className="name">Aucune action pour {side.name}</td>
            <td colSpan={columns.length}>—</td>
          </tr>
        )}
        <tr className="team-row">
          <td className="name">TOTAL {side.name}</td>
          {columns.map((c) => (
            <td key={c.key} title={c.label}>
              {formatReportCell(c.get(side.totals), c.key)}
            </td>
          ))}
        </tr>
      </>
    );
  };

  return (
    <div>
      {sets.length > 0 && onToggleSet && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
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
      <div className="report-wrap">
        <table className="report">
          <thead>
            <tr className="group-row">
              <th className="name">Joueur</th>
              {groups.map((g) => (
                <th key={g.group} colSpan={g.cols.length}>{g.group}</th>
              ))}
            </tr>
            <tr>
              <th className="name">N° / rôle</th>
              {columns.map((c) => (
                <th key={c.key} title={c.label}>{c.short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows('home')}
            {rows('away')}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Eff = efficacité ((points − fautes [− contrées à l’attaque]) / total). Pos% = réceptions «&nbsp;#&nbsp;» et
        «&nbsp;+&nbsp;». Exc% = réceptions parfaites.
      </p>
    </div>
  );
}
