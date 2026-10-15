// ============================================================================
// Éditeur de six de départ + libéro (par set).
// Le six est enregistré dans set_setups.home_lineup / away_lineup sous la forme
//   { start: { P1..P6 }, roster: [{ number, name, role }], libero, liberoFor }
// ============================================================================

import { COURT_POSITIONS, FRONT_ROW, normalizeLineup } from '../utils/rotation';
import {
  LINEUP_ISSUE_LABELS,
  PLAYER_ROLES,
  autoLineup,
  validateLineup,
} from '../utils/lineup';

const inputStyle = {
  padding: '3px 6px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
};

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {Object} props.lineup - { P1..P6 }
 * @param {Object} props.config - { roster, libero, liberoFor }
 * @param {Function} props.onLineupChange
 * @param {Function} props.onConfigChange
 */
export default function LineupEditor({ title, lineup, config, onLineupChange, onConfigChange }) {
  const l = normalizeLineup(lineup);
  const issues = validateLineup(l, config);
  const libero = config?.libero || '';
  const liberoFor = config?.liberoFor || '';

  const roleOfNumber = (n) => {
    const found = (config?.roster || []).find((p) => Number(p.number) === Number(n));
    return found?.role || 'universal';
  };

  const setRole = (number, role) => {
    const num = Number(number);
    const roster = [...(config?.roster || [])].filter((p) => Number(p.number) !== num);
    if (num > 0) roster.push({ number: num, name: '', role });
    roster.sort((a, b) => a.number - b.number);
    onConfigChange({ ...(config || {}), roster });
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {title} — six de départ (P1 = arrière droit, au service)
      </div>
      {COURT_POSITIONS.map((p) => (
        <div key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ minWidth: 62, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
            {p} {FRONT_ROW.includes(p) ? '(avant)' : '(arrière)'}
          </span>
          <input
            type="number"
            min="1"
            max="99"
            value={l[p] ?? ''}
            onChange={(e) => onLineupChange({ ...l, [p]: e.target.value === '' ? null : Number(e.target.value) })}
            style={{ ...inputStyle, width: 70 }}
          />
          <select
            value={roleOfNumber(l[p])}
            onChange={(e) => setRole(l[p], e.target.value)}
            disabled={!l[p]}
            style={inputStyle}
          >
            {PLAYER_ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            title="Désigner ce joueur comme remplacé par le libéro sur les postes arrière"
            disabled={!l[p]}
            onClick={() => {
              if (String(liberoFor) === String(l[p])) onConfigChange({ ...(config || {}), liberoFor: null });
              else onConfigChange({ ...(config || {}), liberoFor: l[p], libero: libero || l[p] });
            }}
            style={{ color: String(liberoFor) === String(l[p]) ? 'var(--accent)' : undefined }}
          >
            Lib
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <span style={{ minWidth: 62, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Libéro</span>
        <input
          type="number"
          min="1"
          max="99"
          value={libero}
          placeholder="n°"
          onChange={(e) => onConfigChange({ ...(config || {}), libero: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ ...inputStyle, width: 70 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          remplace le n°{liberoFor || '—'} sur les postes arrière
        </span>
      </div>
      {!issues.valid && (
        <p style={{ fontSize: 11, color: 'var(--danger, #e05252)', marginTop: 6 }}>
          {issues.issues.map((k) => LINEUP_ISSUE_LABELS[k] || k).join(' · ')}
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onLineupChange(autoLineup(config))}>
          Six automatique
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onLineupChange({ P1: null, P2: null, P3: null, P4: null, P5: null, P6: null })}
        >
          Vider le six
        </button>
      </div>
    </div>
  );
}
