// ============================================================================
// Panneau droit du mode « Relecture » : filtres (action, qualité, position),
// liste des points — le point lu est surligné et suit la lecture — et actions
// du point en cours. Chaque action et chaque point s'ajoute à une playlist.
// ============================================================================

import { useEffect, useMemo, useRef } from 'react';
import { Plus } from './icons';
import {
  DV_ACTIONS,
  DV_EVAL_KEYS,
  DV_WIN_METHODS,
  formatTimecode,
  rallyWinMethod,
} from '../utils/datavolley.js';
import { PLAYLIST_POSTES, matchedActionIndexes, posteLabel, posteOfAction } from '../utils/playlists.js';

/**
 * @param {Object} props
 * @param {Object} props.video match relu ({ team1_name, team2_name… })
 * @param {Array} props.points points de relecture (reviewPoints)
 * @param {Array} props.filtered points qui satisfont les filtres
 * @param {Object} props.filters { team, action, evaluation, method, playerNumber, poste, setNumber }
 * @param {(key:string, value:any)=>void} props.onFilter
 * @param {Array} props.playerNumbers numéros présents dans le codage
 * @param {(team:string, number:number)=>string} props.nameOf nom d'un joueur
 * @param {number} props.currentIndex index du point lu dans points (-1 : aucun / temps mort)
 * @param {Object|null} props.currentPoint point lu (null en dehors d'un point)
 * @param {Object|null} props.totals compteurs ({ count, covered, skipped })
 * @param {(point:Object)=>void} props.onPlayPoint lire ce point
 * @param {(point:Object)=>void} props.onAddPoint ajouter le point entier à une playlist
 * @param {(point:Object, action:Object)=>void} props.onAddAction ajouter une action à une playlist
 */
export default function MatchReviewSidebar({
  video,
  points,
  filtered,
  filters,
  onFilter,
  playerNumbers,
  nameOf,
  currentIndex,
  currentPoint,
  totals,
  onPlayPoint,
  onAddPoint,
  onAddAction,
}) {
  const listRef = useRef(null);

  const sets = useMemo(() => {
    const numbers = new Set();
    for (const p of points || []) {
      for (const a of p.actions || []) numbers.add(Number(a.set_number) || 1);
    }
    return [...numbers].sort((a, b) => a - b);
  }, [points]);

  // Le point lu reste visible : la liste défile toute seule.
  useEffect(() => {
    if (currentIndex < 0) return;
    const active = listRef.current ? listRef.current.querySelector('.mrv-point.active') : null;
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
  }, [currentIndex]);

  /** Actions du point qui satisfont les filtres (surlignage, mêmes critères que le codage). */
  const matchedOf = (point) =>
    matchedActionIndexes(point, {
      team: filters.team,
      playerNumber: filters.playerNumber,
      action: filters.action,
      poste: filters.poste,
      setNumber: filters.setNumber,
    });

  const durationText = (seconds) => {
    const total = Math.round(Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return minutes === 0 ? `${rest} s` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
  };

  return (
    <div className="mrv-side">
      <div className="pl-filters mrv-filters">
        <label className="pl-filter">
          Action
          <select value={filters.action} onChange={(e) => onFilter('action', e.target.value)}>
            <option value="all">Toutes</option>
            {DV_ACTIONS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} — {a.label}</option>
            ))}
          </select>
        </label>
        <label className="pl-filter" title="Évaluation présente dans le point (#, +, !, −, /, =)">
          Qualité
          <select value={filters.evaluation} onChange={(e) => onFilter('evaluation', e.target.value)}>
            <option value="all">Toutes</option>
            {DV_EVAL_KEYS.map((sym) => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </select>
        </label>
        <label className="pl-filter" title="Attaques parties de la zone choisie">
          Position
          <select value={filters.poste} onChange={(e) => onFilter('poste', e.target.value)}>
            <option value="all">Toutes</option>
            {PLAYLIST_POSTES.map((poste) => (
              <option key={poste.id} value={poste.id}>{poste.label}</option>
            ))}
          </select>
        </label>
        <label className="pl-filter">
          Équipe
          <select value={filters.team} onChange={(e) => onFilter('team', e.target.value)}>
            <option value="all">Toutes</option>
            <option value="home">{video?.team1_name || 'Équipe 1'}</option>
            <option value="away">{video?.team2_name || 'Équipe 2'}</option>
          </select>
        </label>
        <label className="pl-filter">
          Joueur
          <select
            value={String(filters.playerNumber)}
            onChange={(e) => onFilter('playerNumber', e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Tous</option>
            {playerNumbers.map((n) => (
              <option key={n} value={n}>
                n°{String(n).padStart(2, '0')}
                {nameOf('home', n) || nameOf('away', n) ? ` ${nameOf('home', n) || nameOf('away', n)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="pl-filter">
          Set
          <select
            value={String(filters.setNumber)}
            onChange={(e) => onFilter('setNumber', e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Tous</option>
            {sets.map((n) => (
              <option key={n} value={n}>Set {n}</option>
            ))}
          </select>
        </label>
        <label className="pl-filter">
          Conclusion du point
          <select value={filters.method} onChange={(e) => onFilter('method', e.target.value)}>
            <option value="all">Toutes</option>
            {Object.keys(DV_WIN_METHODS).map((k) => (
              <option key={k} value={k}>{DV_WIN_METHODS[k]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="pl-summary mrv-summary">
        {filtered.length} point(s) sur {points.length}
        {totals ? ` · relecture ${durationText(totals.covered)}` : ''}
        {totals && totals.skipped != null ? ` · temps morts évités ${durationText(totals.skipped)}` : ''}
      </div>

      <div className="mrv-points" ref={listRef}>
        {filtered.length === 0 ? (
          <p className="dv-empty">
            Aucun point ne correspond aux filtres — ou le codage n’a pas de timecode : synchronisez la
            vidéo dans le codage pour relire le match.
          </p>
        ) : (
          filtered.map((p) => {
            const index = points.indexOf(p);
            const matched = matchedOf(p);
            return (
              <div
                key={p.pointNumber}
                className={`mrv-point${index === currentIndex ? ' active' : ''}`}
                onClick={() => onPlayPoint(p)}
                title="Lire ce point (la relecture enchaîne ensuite les suivants)"
              >
                <div className="mrv-point-head">
                  <span>Point {p.pointNumber} · {rallyWinMethod(p).label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mrv-point-time">
                      {formatTimecode(p.segmentStart)} → {formatTimecode(p.segmentEnd)}
                    </span>
                    <button
                      type="button"
                      className="plp-add-btn"
                      title="Ajouter tout le point à une playlist"
                      onClick={(e) => { e.stopPropagation(); onAddPoint(p); }}
                    >
                      <Plus size={11} /> Point
                    </button>
                  </span>
                </div>
                <div className="dv-rally-codes">
                  {p.actions.map((a) => (
                    <button
                      key={a.action_index}
                      type="button"
                      className={`dv-chip plp-chip${matched.has(a.action_index) ? ' matched' : ''}`}
                      title={`Ajouter ${a.code} (action seule) à une playlist`}
                      onClick={(e) => { e.stopPropagation(); onAddAction(p, a); }}
                    >
                      {a.code}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mrv-current">
        <div className="mrv-current-head">Actions du point en cours</div>
        {currentPoint ? (
          <>
            <div className="mrv-current-sub">
              Point {currentPoint.pointNumber} · {formatTimecode(currentPoint.segmentStart)} →{' '}
              {formatTimecode(currentPoint.segmentEnd)}
            </div>
            {currentPoint.actions.map((a) => (
              <div key={a.action_index} className="mrv-current-row">
                <code>{a.code}</code>
                <span className="mrv-current-meta">
                  {(a.team === 'away' ? video?.team2_name : video?.team1_name) || ''}
                  {a.player_number
                    ? ` · n°${String(a.player_number).padStart(2, '0')}${
                        nameOf(a.team, a.player_number) ? ` ${nameOf(a.team, a.player_number)}` : ''
                      }`
                    : ''}
                  {posteOfAction(a) ? ` · ${posteLabel(posteOfAction(a))}` : ''}
                  {a.evaluation ? ` · ${a.evaluation}` : ''}
                </span>
                <button
                  type="button"
                  className="plp-add-btn"
                  title={`Ajouter ${a.code} (action seule) à une playlist`}
                  onClick={() => onAddAction(currentPoint, a)}
                >
                  <Plus size={11} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="plp-add-btn mrv-current-all"
              title="Ajouter tout le point à une playlist"
              onClick={() => onAddPoint(currentPoint)}
            >
              <Plus size={11} /> Point entier
            </button>
          </>
        ) : (
          <p className="dv-hint">
            Lancez la lecture : les actions du point lu s’affichent ici, prêtes à rejoindre une
            playlist d’un clic.
          </p>
        )}
      </div>
    </div>
  );
}
