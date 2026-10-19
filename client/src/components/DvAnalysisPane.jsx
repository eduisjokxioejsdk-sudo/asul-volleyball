// ============================================================================
// MODE ANALYSE — les fenêtres d'analyse de DataVolley : feuille de match,
// compétences, rotations, zones, distribution, points.
// Le menu (à gauche), la barre de filtres et la liste des actions retenues (à
// droite, « Click to Rally ») sont posés par la page de codage dans une grille,
// autour des fenêtres d'analyse elles-mêmes.
// ============================================================================

import { useMemo } from 'react';
import { ChartColumn, Maximize2 } from './icons';
import { formatTimecode } from '../utils/datavolley';
import { groupByPoint } from '../utils/codingTools';

/**
 * Menu des fenêtres d'analyse (colonne de gauche).
 * @param {Object} props
 * @param {Array} props.windows - [{ key, label, icon, hint }]
 * @param {string} props.windowKey
 * @param {Function} props.onWindow - (key) => void
 * @param {Function} [props.onFullScreen]
 */
export function DvAnalysisMenu({ windows = [], windowKey, onWindow, onFullScreen }) {
  return (
    <nav className="dvx-menu" aria-label="Fenêtres d’analyse">
      <span className="dvx-menu-title">Fenêtres d’analyse</span>
      {windows.map((w) => {
        const Icon = w.icon || ChartColumn;
        return (
          <button
            key={w.key}
            type="button"
            className={`dvm-btn dvm-menu ${windowKey === w.key ? 'active' : ''}`}
            onClick={() => onWindow(w.key)}
            title={w.hint || w.label}
          >
            <Icon size={13} /> {w.label}
          </button>
        );
      })}
      {onFullScreen && (
        <button type="button" className="dvm-btn dvm-menu" onClick={onFullScreen} title="Afficher la feuille de match en plein écran">
          <Maximize2 size={13} /> Plein écran
        </button>
      )}
    </nav>
  );
}

/**
 * Actions retenues par les filtres (colonne de droite) : c'est la lecture
 * « Click to Rally » de DataVolley — on voit les actions derrière un chiffre et
 * on les relit d'un clic.
 * @param {Object} props
 * @param {Array} props.matches
 * @param {Function} props.onSeekAction
 * @param {Function} [props.pointOf]
 */
export function DvDrillDown({ matches = [], onSeekAction, pointOf }) {
  const grouped = useMemo(() => groupByPoint(matches, { pointOf }), [matches, pointOf]);

  return (
    <aside className="dvx-drill">
      <h5>Actions retenues ({matches.length})</h5>
      <p className="dv-hint">
        Cliquez une action pour la revoir dans la vidéo. Un chiffre d’une analyse se relit ici en filtrant
        (action, qualité, position, joueur, set).
      </p>
      {grouped.length === 0 && <p className="dv-empty">Aucune action pour ces critères.</p>}
      <div className="dvx-drill-list">
        {grouped.map((g) => (
          <div key={g.pointNumber} className="dvx-drill-point">
            <span className="dvx-drill-num">Point {g.pointNumber}</span>
            <div className="dvx-drill-actions">
              {g.actions.map((a) => (
                <button
                  key={a.uid || a.action_index}
                  type="button"
                  className="dvc-code"
                  onClick={() => onSeekAction?.(a)}
                  title={`${a.code} — ${formatTimecode(a.timecode)}`}
                >
                  <span className="dvc-tc">{formatTimecode(a.timecode)}</span>
                  <span className="dvc-txt">{a.code}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
