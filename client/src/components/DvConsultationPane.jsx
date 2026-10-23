// ============================================================================
// MODE CONSULTATION — relire un match codé sans les temps morts.
// À gauche la vidéo (elle enchaîne les points toute seule), sous la vidéo les
// commandes de lecture ; à droite les filtres, la playlist multi-matchs et le
// déroulé cliquable.
// ============================================================================

import { useMemo, useState } from 'react';
import { ChevronLeft, Clock, Film, Pause, Play } from './icons';
import DvCodeList from './DvCodeList';
import DvFilterPanel from './DvFilterPanel';
import DvRotationWindow from './DvRotationWindow';
import PlaylistManagerModal from './PlaylistManagerModal';
import { formatTimecode } from '../utils/datavolley';
import { EMPTY_FILTERS, actionShortLabel, reviewTotals } from '../utils/codingTools';

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export default function DvConsultationPane({
  videoNode,
  videoId = null,
  videoTitle = '',
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
  onFrameStep,
  rotationView,
  currentTime = 0,
  team1,
  team2,
  homeConfig,
  awayConfig,
  events = [],
  setsWon1 = 0,
  setsWon2 = 0,
  issues = [],
  actionSet,
  loop = false,
  onToggleLoop,
  onOpenMontage,
  leadIn = 4,
  leadOut = 3,
  onSyncPatch,
  onOpenDetachedVideo,
  popoutOpen = false,
}) {
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
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

        <div className="dvx-transport" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(-1)} title="Point précédent (←)">
            <ChevronLeft size={14} /> Point préc.
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onFrameStep?.(-1)} title="Image par image en arrière (,)">
            ⏮ -1 img
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onTogglePlay} title="Lecture / pause (Espace)">
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Lecture'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onFrameStep?.(1)} title="Image par image en avant (.)">
            +1 img ⏭
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(1)} title="Point suivant (→)">
            Point suiv.
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

          {/* Contrôles Pre-Roll / Post-Roll & Boucle clip (Point 21) */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
            Pré:
            <input
              type="number"
              min="0"
              max="15"
              step="0.5"
              value={leadIn}
              onChange={(e) => onSyncPatch?.({ lead_in: Number(e.target.value) })}
              style={{ width: 46, padding: '2px 4px', borderRadius: 4, fontSize: 11 }}
              title="Marge avant l'action (Pre-roll en secondes)"
            />
            s · Post:
            <input
              type="number"
              min="0"
              max="15"
              step="0.5"
              value={leadOut}
              onChange={(e) => onSyncPatch?.({ lead_out: Number(e.target.value) })}
              style={{ width: 46, padding: '2px 4px', borderRadius: 4, fontSize: 11 }}
              title="Marge après l'action (Post-roll en secondes)"
            />
            s
          </span>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPlaylistModalOpen(true)}
            title="Ouvrir le gestionnaire de Playlists Multi-Matchs"
          >
            <Film size={13} /> Playlists Multi-Matchs
          </button>

          {onOpenDetachedVideo && (
            <button
              type="button"
              className={`btn btn-sm ${popoutOpen ? 'btn-primary' : 'btn-secondary'}`}
              onClick={onOpenDetachedVideo}
              title="Ouvrir optionnellement le lecteur vidéo sur un 2e écran synchronisé"
            >
              🖥️ 2e écran {popoutOpen ? '(Actif)' : ''}
            </button>
          )}
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

        <PlaylistManagerModal
          inline
          videoId={videoId}
          videoTitle={videoTitle}
          rallies={points}
          segments={segments}
          activeIndex={activeIndex}
          onSeekPoint={onSeekPoint}
          playing={playing}
          onTogglePlay={onTogglePlay}
          loop={loop}
          onToggleLoop={onToggleLoop}
          onStep={onStep}
          leadIn={leadIn}
          leadOut={leadOut}
        />

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

      <PlaylistManagerModal
        open={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        videoId={videoId}
        videoTitle={videoTitle}
        rallies={points}
        segments={segments}
        leadIn={leadIn}
        leadOut={leadOut}
      />
    </div>
  );
}
