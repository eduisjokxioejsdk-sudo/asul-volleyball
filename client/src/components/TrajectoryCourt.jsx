// ============================================================================
// Terrain de trajectoire : un terrain complet aux proportions réelles
// (18 m × 9 m, filet au centre) sur lequel on trace les flèches d'un joueur.
//
//   1er clic = point de départ · 2e clic = point d'arrivée.
//   • arrivée hors des lignes  → flèche rouge immédiate (issue « out ») ;
//   • arrivée dans le terrain  → le parent ouvre la popup des issues
//     (onComplete reçoit alors result = null).
//
// Mode consultation (`readOnly`) : le terrain ne prend aucun tracé et la flèche
// n'est plus annulable ; un glissement désigne en revanche une zone, dont les
// flèches passent en violet et sont comptées. L'agrandissement reste possible.
//
// Le nom du joueur est affiché au-dessus du terrain, dans l'en-tête de la carte.
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { roleColor, roleShort } from '../utils/lineup.js';
import { ZONE_CELLS, xyFrom } from '../utils/courtGeometry.js';
import {
  SELECTION_COLOR,
  TRAJECTORY_COURT,
  TRAJECTORY_RESULTS,
  TRAJECTORY_VIEWBOX,
  TRAJECTORY_VIEWBOX_STR,
  countByResult,
  landingResult,
  normalizeRect,
  resultColor,
  resultLabel,
  selectedShotIndexes,
  shotPath,
  svgPointFromEvent,
} from '../utils/trajectory.js';
import { Crosshair, Maximize2, Minimize2, Undo2, X } from './icons';

const ZONE_KEYS = Object.keys(ZONE_CELLS);
const SIDES = ['left', 'right'];

/** Titre écrit sur le terrain selon le type de frappe affiché. */
const KIND_TITLES = {
  serve: 'SERVICES',
  attack: 'ATTAQUE',
  all: 'SERVICES + ATTAQUE',
};

/** Terrain cliquable : rendu à l'identique dans la carte et en version agrandie. */
function CourtSvg({
  markerId,
  kind,
  teams,
  shots,
  start,
  hover,
  onPick,
  onMove,
  selection,
  selectedIndexes,
  dragging,
  onSelectStart,
  onSelectMove,
  onSelectEnd,
  className,
}) {
  const pointOf = (event) => svgPointFromEvent(event.currentTarget, event);
  // Consultation : le terrain sert alors à désigner une zone de flèches.
  const selectable = typeof onSelectStart === 'function';
  const selected = useMemo(() => new Set(selectedIndexes || []), [selectedIndexes]);
  const hasSelection = selected.size > 0;

  const handleClick = (event) => {
    if (!onPick) return; // consultation : terrain non cliquable
    const point = pointOf(event);
    if (point) onPick(point);
  };

  const handlePointerDown = (event) => {
    if (!selectable) return;
    const point = pointOf(event);
    if (!point) return;
    // La capture garde le glissement vivant même si le curseur sort du terrain.
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    onSelectStart(point);
  };

  const handleMove = (event) => {
    const point = selectable || start ? pointOf(event) : null;
    // Glissement de sélection en cours (consultation).
    if (selectable && dragging) {
      if (point) onSelectMove(point);
      return;
    }
    // Aucun aperçu à tracer tant que le point de départ n'est pas posé :
    // on évite ainsi de redessiner les terrains au simple survol.
    if (!onMove || !start || !point) return;
    onMove(point);
  };

  const handlePointerUp = (event) => {
    if (!selectable || !dragging) return;
    if (typeof event.currentTarget.releasePointerCapture === 'function' && event.pointerId != null) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (err) {
        // capture déjà relâchée : sans conséquence
      }
    }
    onSelectEnd(pointOf(event));
  };

  // Aperçu du tracé en cours : la couleur annonce déjà si la cible est dehors.
  const previewResult = start && hover ? landingResult(hover) || 'point' : null;

  return (
    <svg
      viewBox={TRAJECTORY_VIEWBOX_STR}
      className={`tj-court-svg tj-kind-${kind}${selectable ? ' selectable' : ''} ${className || ''}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handleMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="img"
      aria-label={`Terrain de trajectoire — ${teams.left}${teams.right ? ` contre ${teams.right}` : ''}`}
    >
      <defs>
        {TRAJECTORY_RESULTS.map((r) => (
          <marker
            key={r.id}
            id={`${markerId}-${r.id}`}
            viewBox="0 0 8 8"
            refX="6.6"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill={r.color} />
          </marker>
        ))}

        {/* Pointe violette des flèches désignées par une zone (consultation). */}
        <marker
          id={`${markerId}-selection`}
          viewBox="0 0 8 8"
          refX="6.6"
          refY="4"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={SELECTION_COLOR} />
        </marker>
      </defs>

      {/* Zone libre : c'est là qu'on vise un service raté ou un ballon sorti. */}
      <rect
        className="tj-court-free"
        x={TRAJECTORY_VIEWBOX.x}
        y={TRAJECTORY_VIEWBOX.y}
        width={TRAJECTORY_VIEWBOX.w}
        height={TRAJECTORY_VIEWBOX.h}
        rx="4"
      />

      {/* Terrain : 18 m × 9 m (teinté selon la frappe : service ou attaque) */}
      <rect
        className="tj-court-field"
        x={TRAJECTORY_COURT.x}
        y={TRAJECTORY_COURT.y}
        width={TRAJECTORY_COURT.w}
        height={TRAJECTORY_COURT.h}
        stroke="var(--text-primary)"
        strokeWidth="1.2"
      />

      {/* Lignes d'attaque, à 3 m de chaque côté du filet */}
      <line
        x1={TRAJECTORY_COURT.netX - TRAJECTORY_COURT.attack}
        y1={TRAJECTORY_COURT.top}
        x2={TRAJECTORY_COURT.netX - TRAJECTORY_COURT.attack}
        y2={TRAJECTORY_COURT.bottom}
        stroke="var(--text-primary)"
        strokeWidth="0.8"
        opacity="0.8"
      />
      <line
        x1={TRAJECTORY_COURT.netX + TRAJECTORY_COURT.attack}
        y1={TRAJECTORY_COURT.top}
        x2={TRAJECTORY_COURT.netX + TRAJECTORY_COURT.attack}
        y2={TRAJECTORY_COURT.bottom}
        stroke="var(--text-primary)"
        strokeWidth="0.8"
        opacity="0.8"
      />

      {/* Filet */}
      <rect
        x={TRAJECTORY_COURT.netX - 0.8}
        y={TRAJECTORY_COURT.top - 4}
        width="1.6"
        height={TRAJECTORY_COURT.h + 8}
        fill="var(--accent)"
        opacity="0.3"
      />
      <line
        x1={TRAJECTORY_COURT.netX}
        y1={TRAJECTORY_COURT.top}
        x2={TRAJECTORY_COURT.netX}
        y2={TRAJECTORY_COURT.bottom}
        stroke="var(--text-primary)"
        strokeWidth="0.7"
        opacity="0.75"
      />

      {/* Numérotation des zones (filigrane) pour se repérer comme en DataVolley */}
      {SIDES.map((side) =>
        ZONE_KEYS.map((zone) => {
          const [depth, width] = ZONE_CELLS[zone];
          const p = xyFrom(depth, width, side);
          return (
            <text
              key={`${side}-${zone}`}
              x={p.x}
              y={p.y + 1.4}
              textAnchor="middle"
              fontSize="3.6"
              fontWeight="700"
              fill="var(--text-muted)"
              opacity="0.35"
            >
              {zone}
            </text>
          );
        })
      )}

      {/* Repère de la frappe, écrit sur le terrain (visible aussi en agrandi) */}
      <text
        className="tj-court-kind"
        x={TRAJECTORY_VIEWBOX.x + 2}
        y={TRAJECTORY_VIEWBOX.y + 8}
        fontSize="6"
        fontWeight="800"
      >
        {KIND_TITLES[kind] || 'ATTAQUE'}
      </text>

      {/* Nom du camp à gauche (celui qu'on marque) et de l'adversaire à droite */}
      <text x={TRAJECTORY_COURT.x + 1} y={TRAJECTORY_COURT.top - 6} fontSize="5" fontWeight="800" fill="var(--text-secondary)">
        {teams.left}
      </text>
      <text
        x={TRAJECTORY_COURT.x + TRAJECTORY_COURT.w - 1}
        y={TRAJECTORY_COURT.top - 6}
        textAnchor="end"
        fontSize="5"
        fontWeight="800"
        fill="var(--text-muted)"
      >
        {teams.right || 'Adversaire'}
      </text>

      {/* Flèches déjà marquées : trait droit, ou arc de cercle pour les feintes.
          Celles que la zone désigne passent en violet « flashy » (les autres
          s'effacent pour bien les distinguer). */}
      {shots.map((shot, index) => {
        const color = resultColor(shot.result);
        const path = shotPath(shot.start, shot.end, shot.result);
        const isSelected = selected.has(index);
        const strokeColor = isSelected ? SELECTION_COLOR : color;
        return (
          <g
            key={shot.id ?? `${shot.result}-${index}`}
            className={isSelected ? 'tj-shot selected' : 'tj-shot'}
            opacity={hasSelection && !isSelected ? 0.22 : 1}
          >
            <title>{`${resultLabel(shot.result)} — de (${shot.start.x} ; ${shot.start.y}) à (${shot.end.x} ; ${shot.end.y})`}</title>
            {isSelected && (
              <path
                d={path.d}
                fill="none"
                stroke={SELECTION_COLOR}
                strokeWidth="4.6"
                strokeLinecap="round"
                opacity="0.4"
              />
            )}
            <path
              d={path.d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isSelected ? 2.4 : 1.5}
              strokeLinecap="round"
              markerEnd={isSelected ? `url(#${markerId}-selection)` : `url(#${markerId}-${shot.result})`}
            />
            <circle cx={shot.start.x} cy={shot.start.y} r={isSelected ? 1.9 : 1.5} fill={strokeColor} fillOpacity="0.8" />
            <circle cx={shot.end.x} cy={shot.end.y} r={isSelected ? 1.5 : 1.1} fill={strokeColor} />
          </g>
        );
      })}

      {/* Zone de sélection en cours (ou dernière zone désignée) */}
      {selection && (selection.w > 0 || selection.h > 0) && (
        <rect
          className="tj-sel-rect"
          x={selection.x}
          y={selection.y}
          width={selection.w}
          height={selection.h}
        />
      )}

      {/* Tracé en cours : départ posé, aperçu jusqu'au curseur */}
      {start && (
        <g>
          <circle cx={start.x} cy={start.y} r="2.2" fill="var(--accent)" stroke="#151311" strokeWidth="0.4" />
          {hover && previewResult && (
            <path
              d={shotPath(start, hover, previewResult).d}
              fill="none"
              stroke={resultColor(previewResult)}
              strokeWidth="1.1"
              strokeDasharray="4 3"
              opacity="0.9"
            />
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * Carte d'un joueur : nom au-dessus du terrain, flèches de service / d'attaque.
 *
 * @param {Object} props
 * @param {{number:number,name:string,role:string}} props.player
 * @param {Array} props.shots - flèches du joueur pour le type de frappe courant
 * @param {'serve'|'attack'} props.kind
 * @param {{left:string,right:string}} props.teams - noms des deux camps
 * @param {(start:Object, end:Object, result:string|null) => void} props.onComplete
 * @param {Function} [props.onRemoveLast]
 * @param {boolean} [props.readOnly] - consultation : aucun tracé possible
 */
export default function TrajectoryCourt({ player, shots = [], kind, teams, onComplete, onRemoveLast, readOnly = false }) {
  const uid = String(useId() || 'tj').replace(/[^a-zA-Z0-9]/g, '');
  const markerId = `tjm-${uid}`;
  const [start, setStart] = useState(null);
  const [hover, setHover] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Zone désignée au glissement (consultation) : les flèches qu'elle traverse
  // passent en violet et sont comptées.
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef(null);

  // Changer d'onglet (services ↔ attaque) ou de joueur abandonne le tracé.
  useEffect(() => {
    setStart(null);
    setHover(null);
    setSelection(null);
    setDragging(false);
    dragFrom.current = null;
  }, [kind, player?.number]);

  // Échap annule le tracé en cours.
  useEffect(() => {
    if (!start) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setStart(null);
        setHover(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setDragging(false);
    dragFrom.current = null;
  }, []);

  // Échap efface aussi la zone désignée (consultation).
  useEffect(() => {
    if (!selection) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, clearSelection]);

  const startSelection = (point) => {
    dragFrom.current = point;
    setDragging(true);
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const moveSelection = (point) => {
    if (!dragFrom.current) return;
    setSelection(normalizeRect(dragFrom.current, point));
  };

  const endSelection = (point) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragging(false);
    if (!from || !point) {
      setSelection(null);
      return;
    }
    const rect = normalizeRect(from, point);
    // Un simple clic (sans glissement) efface la zone au lieu d'en créer une.
    setSelection(rect.w < 1 && rect.h < 1 ? null : rect);
  };

  const handlePick = (point) => {
    if (readOnly) return; // consultation : le terrain ne prend aucun tracé
    if (!start) {
      setStart(point);
      setHover(null);
      return;
    }
    const from = start;
    const result = landingResult(point);
    setStart(null);
    setHover(null);
    onComplete(from, point, result);
  };

  const counts = countByResult(shots);
  const selectedIndexes = useMemo(() => selectedShotIndexes(shots, selection), [shots, selection]);
  const courtProps = {
    teams,
    shots,
    start: readOnly ? null : start,
    hover: readOnly ? null : hover,
    selection,
    selectedIndexes,
    dragging,
    // En consultation, le terrain sert à désigner une zone de flèches.
    ...(readOnly
      ? { onSelectStart: startSelection, onSelectMove: moveSelection, onSelectEnd: endSelection }
      : { onPick: handlePick, onMove: setHover }),
  };
  const playerName = player?.name || `N°${player?.number}`;

  return (
    <div className={`tj-card tj-kind-${kind} ${start ? 'drawing' : ''}${readOnly ? ' readonly selectable' : ''}`}>
      <div className="tj-card-head">
        <span className="tj-number" style={{ borderColor: roleColor(player?.role) }}>{player?.number}</span>
        <span className="tj-name" title={playerName}>{playerName}</span>
        <span className="tj-role" style={{ color: roleColor(player?.role) }}>{roleShort(player?.role)}</span>
        <span className="tj-card-actions">
          {!readOnly && shots.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRemoveLast}
              title="Annuler la dernière flèche de ce joueur"
            >
              <Undo2 size={12} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setExpanded(true)}
            title="Agrandir le terrain de ce joueur"
          >
            <Maximize2 size={12} />
          </button>
        </span>
      </div>

      <CourtSvg markerId={markerId} kind={kind} className={start ? 'drawing' : ''} {...courtProps} />

      <div className="tj-card-stats">
        {shots.length === 0 && (
          <span className="tj-hint">
            {readOnly ? 'Aucune flèche pour ce joueur.' : '1er clic : départ · 2e clic : arrivée.'}
          </span>
        )}
        {readOnly && shots.length > 0 && selectedIndexes.length === 0 && (
          <span className="tj-hint">Glissez sur le terrain pour désigner une zone de flèches.</span>
        )}
        {readOnly && selectedIndexes.length > 0 && (
          <span className="tj-sel-count" title="Flèches traversées par la zone désignée">
            <Crosshair size={12} />
            {selectedIndexes.length} flèche{selectedIndexes.length > 1 ? 's' : ''} sélectionnée{selectedIndexes.length > 1 ? 's' : ''}
            <button type="button" className="tj-sel-clear" onClick={clearSelection} title="Effacer la sélection">
              <X size={11} />
            </button>
          </span>
        )}
        {TRAJECTORY_RESULTS.filter((r) => counts[r.id] > 0).map((r) => (
          <span key={r.id} className="tj-chip" style={{ borderColor: r.color, color: r.color }}>
            {r.short} {counts[r.id]}
          </span>
        ))}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="modal-overlay tj-zoom-overlay"
            onClick={() => setExpanded(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal tj-zoom"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="tj-card-head">
                <span className="tj-number" style={{ borderColor: roleColor(player?.role) }}>{player?.number}</span>
                <span className="tj-name">{playerName}</span>
                <span className="tj-card-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded(false)} title="Réduire">
                    <Minimize2 size={13} />
                  </button>
                </span>
              </div>
              <CourtSvg markerId={`${markerId}-big`} kind={kind} className="tj-court-big" {...courtProps} />
              <p className="dv-hint">
                {readOnly
                  ? 'Consultation : glissez sur le terrain pour désigner une zone — les flèches concernées passent en violet et sont comptées. Le menu « Filtres » choisit les issues affichées.'
                  : '1er clic : point de départ · 2e clic : point d’arrivée. Hors des lignes la flèche passe au rouge automatiquement ; dans le terrain, choisissez l’issue de la frappe.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
