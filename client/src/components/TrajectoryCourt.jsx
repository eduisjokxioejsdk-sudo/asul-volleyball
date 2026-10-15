// ============================================================================
// Terrain de trajectoire : un terrain complet aux proportions réelles
// (18 m × 9 m, filet au centre) sur lequel on trace les flèches d'un joueur.
//
//   1er clic = point de départ · 2e clic = point d'arrivée.
//   • arrivée hors des lignes  → flèche rouge immédiate (issue « out ») ;
//   • arrivée dans le terrain  → le parent ouvre la popup des issues
//     (onComplete reçoit alors result = null).
//
// Mode consultation (`readOnly`) : le terrain ne réagit plus au clic, la flèche
// n'est plus annulable ; seuls l'agrandissement et la lecture restent possibles.
//
// Le nom du joueur est affiché au-dessus du terrain, dans l'en-tête de la carte.
// ============================================================================

import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { roleColor, roleShort } from '../utils/lineup.js';
import { ZONE_CELLS, xyFrom } from '../utils/courtGeometry.js';
import {
  TRAJECTORY_COURT,
  TRAJECTORY_RESULTS,
  TRAJECTORY_VIEWBOX,
  TRAJECTORY_VIEWBOX_STR,
  countByResult,
  landingResult,
  resultColor,
  resultLabel,
  shotPath,
  svgPointFromEvent,
} from '../utils/trajectory.js';
import { Maximize2, Minimize2, Undo2 } from './icons';

const ZONE_KEYS = Object.keys(ZONE_CELLS);
const SIDES = ['left', 'right'];

/** Titre écrit sur le terrain selon le type de frappe affiché. */
const KIND_TITLES = {
  serve: 'SERVICES',
  attack: 'ATTAQUE',
  all: 'SERVICES + ATTAQUE',
};

/** Terrain cliquable : rendu à l'identique dans la carte et en version agrandie. */
function CourtSvg({ markerId, kind, teams, shots, start, hover, onPick, onMove, className }) {
  const pointOf = (event) => svgPointFromEvent(event.currentTarget, event);

  const handleClick = (event) => {
    if (!onPick) return; // consultation : terrain non cliquable
    const point = pointOf(event);
    if (point) onPick(point);
  };

  const handleMove = (event) => {
    // Aucun aperçu à tracer tant que le point de départ n'est pas posé :
    // on évite ainsi de redessiner les terrains au simple survol.
    if (!onMove || !start) return;
    const point = pointOf(event);
    if (point) onMove(point);
  };

  // Aperçu du tracé en cours : la couleur annonce déjà si la cible est dehors.
  const previewResult = start && hover ? landingResult(hover) || 'point' : null;

  return (
    <svg
      viewBox={TRAJECTORY_VIEWBOX_STR}
      className={`tj-court-svg tj-kind-${kind} ${className || ''}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
      onPointerMove={handleMove}
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

      {/* Flèches déjà marquées : trait droit, ou arc de cercle pour les feintes */}
      {shots.map((shot, index) => {
        const color = resultColor(shot.result);
        const path = shotPath(shot.start, shot.end, shot.result);
        return (
          <g key={shot.id ?? `${shot.result}-${index}`}>
            <title>{`${resultLabel(shot.result)} — de (${shot.start.x} ; ${shot.start.y}) à (${shot.end.x} ; ${shot.end.y})`}</title>
            <path
              d={path.d}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              markerEnd={`url(#${markerId}-${shot.result})`}
            />
            <circle cx={shot.start.x} cy={shot.start.y} r="1.5" fill={color} fillOpacity="0.8" />
            <circle cx={shot.end.x} cy={shot.end.y} r="1.1" fill={color} />
          </g>
        );
      })}

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

  // Changer d'onglet (services ↔ attaque) ou de joueur abandonne le tracé.
  useEffect(() => {
    setStart(null);
    setHover(null);
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
  const courtProps = {
    teams,
    shots,
    start: readOnly ? null : start,
    hover: readOnly ? null : hover,
    ...(readOnly ? {} : { onPick: handlePick, onMove: setHover }),
  };
  const playerName = player?.name || `N°${player?.number}`;

  return (
    <div className={`tj-card tj-kind-${kind} ${start ? 'drawing' : ''}${readOnly ? ' readonly' : ''}`}>
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
                  ? 'Consultation : les flèches sont en lecture seule (le menu « Filtres » choisit les issues affichées).'
                  : '1er clic : point de départ · 2e clic : point d’arrivée. Hors des lignes la flèche passe au rouge automatiquement ; dans le terrain, choisissez l’issue de la frappe.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
