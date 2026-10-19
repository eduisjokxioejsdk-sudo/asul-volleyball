// ============================================================================
// Barre latérale d'une playlist de séance : les actions ajoutées, dans l'ordre.
// Chaque entrée indique son match, son joueur, son poste de départ et ses
// timecodes ; un clic la lit dans le lecteur, les flèches la déplacent et la
// croix la retire. L'export (CSV de séance, EDL de montage) est en tête.
// ============================================================================

import { ChevronDown, ChevronUp, FileDown, Film, Trash } from './icons';
import { formatTimecode } from '../utils/datavolley.js';
import { actionLabel, posteLabel } from '../utils/playlists.js';

/** Libellé d'une entrée : n° + nom du joueur (ou l'équipe si inconnu). */
function playerLabelOf(item) {
  if (item.player_number) {
    return `n°${String(item.player_number).padStart(2, '0')}${item.player_name ? ` ${item.player_name}` : ''}`;
  }
  return item.team_label || '';
}

/**
 * @param {Object} props
 * @param {Array} props.items entrées de la playlist (normalisées)
 * @param {number} props.currentIndex entrée en cours de lecture (-1 si aucune)
 * @param {Set<number>} [props.missingVideoIds] matchs sans fichier sur ce poste
 * @param {(index:number)=>void} props.onPlay
 * @param {(id:string)=>void} props.onRemove
 * @param {(from:number,to:number)=>void} props.onMove
 * @param {()=>void} props.onExportCsv
 * @param {()=>void} props.onExportEdl
 * @param {()=>void} [props.onExportClips] export MP4 (clips par joueur / poste)
 */
export default function PlaylistSidebar({
  items,
  currentIndex,
  missingVideoIds,
  onPlay,
  onRemove,
  onMove,
  onExportCsv,
  onExportEdl,
  onExportClips,
}) {
  const list = items || [];
  const missing = missingVideoIds || new Set();

  return (
    <div className="plp-side">
      <div className="plp-side-head">
        <strong>
          <Film size={14} /> Playlist
        </strong>
        <div className="plp-side-actions">
          {onExportClips && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onExportClips}
              disabled={list.length === 0}
              title="Découper les actions en fichiers MP4 (un par joueur, par poste ou par action)"
            >
              <FileDown size={13} /> Clips MP4
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onExportCsv}
            disabled={list.length === 0}
            title="Exporter la feuille de séance (timecodes, joueur, poste)"
          >
            <FileDown size={13} /> CSV
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onExportEdl}
            disabled={list.length === 0}
            title="Exporter les marqueurs de montage (EDL, un événement par action)"
          >
            <FileDown size={13} /> EDL
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="dv-empty">
          Aucune action pour l’instant. Ouvrez l’onglet « Ajouter », choisissez un match puis ajoutez les
          actions au fil du visionnage.
        </p>
      ) : (
        <div className="plp-items">
          {list.map((item, index) => {
            const absent = missing.has(Number(item.video_id));
            const duration = Math.max(0, Number(item.segment_end) - Number(item.segment_start));
            return (
              <div
                key={item.id}
                className={`plp-item${index === currentIndex ? ' active' : ''}${absent ? ' missing' : ''}`}
              >
                <button
                  type="button"
                  className="plp-item-main"
                  onClick={() => onPlay(index)}
                  title={
                    absent
                      ? 'Fichier vidéo absent sur ce poste : la playlist reste modifiable'
                      : `Lire ${item.action_code} (point ${item.point_number || '?'})`
                  }
                >
                  <span className="plp-item-head">
                    <span className="plp-item-pos">{index + 1}</span>
                    <span className="plp-item-match">{item.video_label || 'Match'}</span>
                    <span className="plp-item-time">{formatTimecode(item.segment_start)}</span>
                  </span>
                  <span className="plp-item-meta">
                    {playerLabelOf(item)}
                    {item.poste ? ` · ${posteLabel(item.poste)}` : ''}
                    {item.point_number ? ` · P${item.point_number}` : ''}
                    {item.set_number ? ` · set ${item.set_number}` : ''}
                  </span>
                  <span className="plp-item-codes">
                    <span className="dv-chip">{item.action_code || '—'}</span>
                    <span className="plp-item-sub">
                      {actionLabel(item.action)}
                      {item.evaluation ? ` · ${item.evaluation}` : ''} · {duration.toFixed(1)} s
                    </span>
                  </span>
                </button>
                <div className="plp-item-buttons">
                  <button
                    type="button"
                    className="plp-icon-btn"
                    onClick={() => onMove(index, index - 1)}
                    disabled={index === 0}
                    title="Monter l’action dans la playlist"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="plp-icon-btn"
                    onClick={() => onMove(index, index + 1)}
                    disabled={index === list.length - 1}
                    title="Descendre l’action dans la playlist"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="plp-icon-btn danger"
                    onClick={() => onRemove(item.id)}
                    title="Retirer de la playlist"
                  >
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
