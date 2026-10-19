// ============================================================================
// BANDEAU DE FILTRES COMMUN à la Consultation et à l'Analyse : action, qualité,
// position, joueur, équipe, set et recherche libre de code.
// ============================================================================

import { ChartColumn, RotateCcw, Target, Users, Volleyball, X } from './icons';

/**
 * @param {Object} props
 * @param {Object} props.filters
 * @param {Function} props.onFilters - (patch) => void
 * @param {Function} [props.onResetFilters]
 * @param {Object} [props.options] - { players, sets, zones, actions, evaluations }
 * @param {string} [props.team1] / [props.team2]
 * @param {number} [props.resultCount] - actions retenues
 * @param {number} [props.pointCount] - points retenus
 * @param {boolean} [props.hasFilters]
 * @param {boolean} [props.withSet] - afficher le filtre de set (défaut : oui)
 */
export default function DvFilterPanel({
  filters,
  onFilters,
  onResetFilters,
  options = {},
  team1 = 'Domicile',
  team2 = 'Extérieur',
  resultCount = 0,
  pointCount = null,
  hasFilters = false,
  withSet = true,
}) {
  const setFilter = (key) => (e) => onFilters?.({ [key]: e.target.value });

  return (
    <div className="dvx-filters">
      <label className="dvx-filter">
        <span><Volleyball size={11} /> Action</span>
        <select value={filters.action} onChange={setFilter('action')}>
          <option value="all">Toutes</option>
          {(options.actions || []).map((a) => (
            <option key={a.code} value={a.code}>{a.label} ({a.code})</option>
          ))}
        </select>
      </label>

      <label className="dvx-filter">
        <span><Target size={11} /> Qualité</span>
        <select value={filters.evaluation} onChange={setFilter('evaluation')}>
          <option value="all">Toutes</option>
          {(options.evaluations || []).map((sym) => (
            <option key={sym} value={sym}>{sym}</option>
          ))}
        </select>
      </label>

      <label className="dvx-filter">
        <span><ChartColumn size={11} /> Position</span>
        <select value={filters.zone} onChange={setFilter('zone')}>
          <option value="all">Toutes</option>
          {(options.zones || []).map((z) => (
            <option key={z.value} value={z.value}>{z.label}</option>
          ))}
        </select>
      </label>

      <label className="dvx-filter">
        <span><Users size={11} /> Joueur</span>
        <select value={filters.player} onChange={setFilter('player')}>
          <option value="">Tous</option>
          {(options.players || []).map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="dvx-filter">
        <span>Équipe</span>
        <select value={filters.team} onChange={setFilter('team')}>
          <option value="all">Les deux</option>
          <option value="home">{team1}</option>
          <option value="away">{team2}</option>
        </select>
      </label>

      {withSet && (
        <label className="dvx-filter">
          <span>Set</span>
          <select value={filters.set} onChange={setFilter('set')}>
            <option value="all">Tous</option>
            {(options.sets || []).map((s) => (
              <option key={s} value={s}>Set {s}</option>
            ))}
          </select>
        </label>
      )}

      <label className="dvx-filter dvx-query">
        <span>Recherche libre</span>
        <input
          type="text"
          value={filters.query}
          placeholder="ex. *7A# ou 04S"
          onChange={(e) => onFilters?.({ query: e.target.value })}
        />
      </label>

      <p className="dvx-count">
        {resultCount} action(s){pointCount != null ? ` · ${pointCount} point(s)` : ''}
        {hasFilters && (
          <>
            {' '}
            <button type="button" className="dvm-btn dvm-mini" onClick={onResetFilters} title="Retirer les filtres">
              <X size={11} /> tout
            </button>
            <button type="button" className="dvm-btn dvm-mini" onClick={onResetFilters} title="Retirer les filtres">
              <RotateCcw size={11} />
            </button>
          </>
        )}
      </p>
    </div>
  );
}
