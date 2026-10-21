// ============================================================================
// PLAYLIST DE RALLIES — lecture enchaînée des points (façon DataVolley).
//
// Affiche la liste des points retenus, permet d'en ouvrir un par clic, et de
// lancer une lecture en boucle : à la fin d'un segment, la vidéo saute
// automatiquement au début du point suivant.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Clock, Pause, Play, Repeat } from './icons';
import { formatTimecode } from '../utils/datavolley';
import { buildPlaylist, playlistStats, sortPlaylist } from '../utils/rallyPlaylist';

/**
 * @param {Object} props
 * @param {Array} props.rallies - points (groupActionsIntoRallies)
 * @param {Array} props.segments - segments jouables (buildPointSegments)
 * @param {number} props.activeIndex - action_index du point en cours
 * @param {Function} props.onSeekPoint - (rally) => void (début du point)
 * @param {Function} props.onSeekAction - (action) => void
 * @param {number} props.currentTime - position courante de la vidéo (secondes)
 * @param {boolean} props.playing - lecture en cours
 * @param {Function} props.onTogglePlay - () => void
 * @param {boolean} props.loop - lecture en boucle activée
 * @param {Function} props.onToggleLoop - () => void
 * @param {Function} props.onStep - (dir: -1 | 1) => void
 */
export default function RallyPlaylist({
  rallies = [],
  segments = [],
  activeIndex = null,
  onSeekPoint,
  currentTime = 0,
  duration = 0,
  playing = false,
  onTogglePlay,
  loop = false,
  onToggleLoop,
  onStep,
}) {
  const activePointNumber = useCallback(() => {
    if (activeIndex == null) return null;
    const r = rallies.find((x) => (x.actions || []).some((a) => a.action_index === activeIndex));
    return r ? r.pointNumber : null;
  }, [rallies, activeIndex]);

  // Playlist normalisée + tri choisi par l'utilisateur.
  const [sort, setSort] = useState('order');
  const [sortDir, setSortDir] = useState('asc');

  const playlist = useMemo(() => sortPlaylist(buildPlaylist(rallies), sort, sortDir), [rallies, sort, sortDir]);
  const stats = useMemo(() => playlistStats(playlist), [playlist]);

  const toggleSortDir = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));


  // Lecture en boucle : c'est la page qui pilote l'enchaînement des points
  // (elle gère déjà le saut hors segment). Ici on ne fait que l'affichage.
  const isActive = (pointNumber) => activePointNumber() === pointNumber;


  return (
    <div className="rally-playlist">
      <div className="rally-playlist-head">
        <span className="rally-playlist-title">
          <Clock size={12} /> Playlist de rallies
        </span>
        <div className="rally-playlist-controls">
          <button
            type="button"
            className={`btn btn-secondary btn-sm ${loop ? 'active' : ''}`}
            onClick={() => onToggleLoop?.()}
            title="Lecture en boucle des points"
          >
            <Repeat size={11} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(-1)} title="Point précédent">
            <ChevronsLeft size={11} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onTogglePlay} title={playing ? 'Pause' : 'Lecture'}>
            {playing ? <Pause size={11} /> : <Play size={11} />}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep?.(1)} title="Point suivant">
            <ChevronsRight size={11} />
          </button>
        </div>
      </div>

      <div className="rally-playlist-bar">
        <select
          className="rally-playlist-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          title="Trier la playlist"
          aria-label="Trier la playlist"
        >
          <option value="order">Ordre des points</option>
          <option value="time">Timecode</option>
          <option value="actions">Nombre d'actions</option>
          <option value="code">Code</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={toggleSortDir}
          title={sortDir === 'asc' ? 'Ordre croissant' : 'Ordre décroissant'}
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
        <span className="rally-playlist-stats">
          {stats.count} point{stats.count > 1 ? 's' : ''} · {stats.actions} action{stats.actions > 1 ? 's' : ''}
        </span>
      </div>

      <div className="rally-playlist-list">
        {playlist.length === 0 && <p className="dv-empty">Aucun point dans la playlist.</p>}
        {playlist.map((r) => {
          const actions = r.actions || [];
          const first = actions[0];
          const last = actions[actions.length - 1];
          const seg = segments.find((s) => s.pointNumber === r.pointNumber);
          const selected = isActive(r.pointNumber);
          return (
            <button
              key={r.pointNumber}
              type="button"
              className={`rally-item ${selected ? 'active' : ''}`}
              onClick={() => onSeekPoint?.(r)}
              title={`Point ${r.pointNumber} · ${formatTimecode(first?.timecode)} → ${formatTimecode(last?.timecode)}`}
            >
              <span className="rally-item-num">P{r.pointNumber}</span>
              <span className="rally-item-code">{r.code}</span>
              <span className="rally-item-tc">
                {seg ? `${formatTimecode(seg.segmentStart)} → ${formatTimecode(seg.segmentEnd)}` : formatTimecode(first?.timecode)}
              </span>
              <span className="rally-item-count">{r.actionCount}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
