// ============================================================================
// MODE CONSULTATION — relire un match codé sans les temps morts.
// À gauche la vidéo (elle enchaîne les points toute seule), sous la vidéo les
// commandes de lecture ; à droite les filtres et le déroulé cliquable.
// La vidéo est fournie par la page de codage : un seul lecteur à la fois.
// ============================================================================

import { useMemo } from 'react';
import { ChevronLeft, Clock, Pause, Play } from './icons';
import DvCodeList from './DvCodeList';
import DvFilterPanel from './DvFilterPanel';
import DvRotationWindow from './DvRotationWindow';
import { formatTimecode } from '../utils/datavolley';
import { EMPTY_FILTERS, actionShortLabel, reviewTotals } from '../utils/codingTools';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * @param {Object} props
 * @param {React.ReactNode} props.videoNode - le lecteur (rendu une seule fois par la page)
 * @param {Array} props.points - points retenus par les filtres (rallyes)
 * @param {Array} props.segments - segments jouables (buildPointSegments)
 * @param {number} props.duration - durée de la vidéo
 * @param {number} props.activeIndex - action_index du point en cours (-1 hors point)
 * @param {boolean} props.playing
 * @param {number} props.rate
 * @param {Set<string>} [props.matchedUids] - actions qui correspondent aux filtres
 * @param {Object} props.filters
 * @param {Function} props.onFilters - (patch) => void
 * @param {Function} props.onResetFilters
 * @param {Object} [props.options] - { players, sets, zones, actions, evaluations }
 * @param {number} [props.resultCount] - nombre d'actions retenues
 * @param {Function} props.onSeekAction - (action) => void
 * @param {Function} [props.onSeekPoint] - (rally) => void (début du point)
 * @param {Function} props.onTogglePlay
 * @param {Function} props.onRate - (rate) => void
 * @param {Function} props.onStep - (dir) => void
 * @param {Object} props.rotationView - état du terrain au point lu
 */
export default function DvConsultationPane({
  videoNode,
  points,
  segments,
  duration,
  activeIndex,
  playing,
  rate,
  matchedUids,
  filters,
  onFilters,
  onResetFilters,
  options = {},
  resultCount = 0,
  onSeekAction,
  onSeekPoint,
  onTogglePlay,
  onRate,
  onStep,
  rotationView,
  team1,
  team2,
  homeConfig,
  awayConfig,
  events = [],
  setsWon1 = 0,
  setsWon2 = 0,
  issues = [],
  actionSet,
}) {
  const totals = useMemo(() => reviewTotals(segments, duration), [segments, duration]);

  const activePoint = useMemo(() => {
    if (activeIndex == null || activeIndex < 0) return null;
    return (points || []).find((p) => (p.actions || []).some((a) => a.action_index === activeIndex)) || null;
  }, [points, activeIndex]);

  const activeSegment = useMemo(() => {
    if (!activePoint) return null;
    return (segments || []).find((s) => s.pointNumber === activePoint.pointNumber) || null;
  }, [segments, activePoint]);

  const pointRank = activeSegment ? segments.findIndex((s) => s.pointNumber === activeSegment.pointNumber) + 1 : 0;

  const hasFilters = useMemo(
    () => Object.keys(EMPTY_FILTERS).some((k) => String(filters?.[k] ?? '') !== String(EMPTY_FILTERS[k])),
    [filters]
  );

  return (
    <div className="dvx-consult">
      <div className="dvx-main">
        <div className="dvx-stage">{videoNode}</div>

        <div className="dvx-transport">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(-1)} title="Point précédent (←)">
            <ChevronLeft size={14} /> Point précédent
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onTogglePlay} title="Lecture / pause (Espace)">
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Lecture'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(1)} title="Point suivant (→)">
            Point suivant
          </button>
          <span className="dvx-rate">
            Vitesse
            {RATES.map((r) => (
              <button
                key={r}
                type="button"
                className={`dvm-btn dvm-mini ${rate === r ? 'active' : ''}`}
                onClick={() => onRate?.(r)}
              >
                {r}×
              </button>
            ))}
          </span>
        </div>

        <div className="dvx-progress">
          <div className="dvx-progress-head">
            <span>
              {activePoint ? (
                <>
                  <strong>Point {activePoint.pointNumber}</strong>
                  {` · ${pointRank}/${segments.length}`}
                  {activeSegment && ` · ${formatTimecode(activeSegment.segmentStart)} → ${formatTimecode(activeSegment.segmentEnd)}`}
                </>
              ) : (
                'Temps mort — la lecture reprend au point suivant'
              )}
            </span>
            <span title="Temps morts évités par la lecture enchaînée">
              <Clock size={12} /> temps morts évités : {Math.round(totals.skipped / 60)} min
            </span>
          </div>
          <div className="dvx-progress-bar">
            <div
              className="dvx-progress-fill"
              style={{ width: `${segments.length ? (pointRank / segments.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {rotationView && (
          <div className="dvx-rotation">
            <DvRotationWindow
              state={rotationView}
              team1={team1}
              team2={team2}
              homeConfig={homeConfig}
              awayConfig={awayConfig}
              events={events}
              setsWon1={setsWon1}
              setsWon2={setsWon2}
              compact
            />
          </div>
        )}
      </div>

      <aside className="dvx-side">
        <DvFilterPanel
          filters={filters}
          onFilters={onFilters}
          onResetFilters={onResetFilters}
          options={options}
          team1={team1}
          team2={team2}
          resultCount={resultCount}
          pointCount={segments.length}
          hasFilters={hasFilters}
        />

        {activePoint && (
          <div className="dvx-current">
            <h5>Actions du point en cours</h5>
            <div className="dvx-current-rows">
              {(activePoint.actions || []).map((a) => (
                <button
                  key={a.uid || a.action_index}
                  type="button"
                  className={`dvx-current-row ${matchedUids?.has(a.uid) ? 'matched' : ''}`}
                  onClick={() => onSeekAction?.(a)}
                  title="Revoir cette action"
                >
                  <code>{a.code}</code>
                  <span>{formatTimecode(a.timecode)}</span>
                  <span className="dvx-current-act">{actionShortLabel(a.action)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <DvCodeList
          rallies={points}
          mode="consultation"
          activeIndex={activeIndex}
          onSeek={onSeekAction}
          onSeekPoint={onSeekPoint}
          issues={issues}
          actionSet={actionSet}
          emptyText="Aucun point ne correspond aux filtres."
        />
      </aside>
    </div>
  );
}
