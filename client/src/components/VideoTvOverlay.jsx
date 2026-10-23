// ============================================================================
// VideoTvOverlay.jsx — Superposition TV Dynamique (Scoreboard, Rotations,
// Code actif) + Calibration Perspective 4-Points du Terrain (Homographie).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { courtPointToVideo, videoPointToCourt, courtPointToZone } from '../utils/homography';
import { describeCode } from '../utils/datavolley';
import PancakeLogo from './PancakeLogo';
import { RotateCcw } from './icons';

const CORNER_LABELS = [
  '1/4 · Coin Fond-Gauche (Camp Haut)',
  '2/4 · Coin Fond-Droit (Camp Haut)',
  '3/4 · Coin Fond-Droit (Camp Bas)',
  '4/4 · Coin Fond-Gauche (Camp Bas)',
];

export default function VideoTvOverlay({
  showTvOverlay: showTvOverlayProp,
  showScoreboard,
  team1 = 'Domicile',
  team2 = 'Extérieur',
  score = { team1: 0, team2: 0 },
  setsWon = { team1: 0, team2: 0 },
  setNumber: setNumberProp = 1,
  currentSet,
  server = 'team1',
  homeSetterPos = null,
  awaySetterPos = null,
  activeAction = null,
  calibMode: calibModeProp = false,
  calibrationMode,
  courtCorners: courtCornersProp = null,
  corners,
  onCornersChange: onCornersChangeProp,
  onSaveCorners,
  onZoneDetected,
  onCloseCalibration,
  onStartCalibration,
}) {
  const showTvOverlay = showTvOverlayProp !== undefined ? showTvOverlayProp : (showScoreboard !== undefined ? showScoreboard : true);
  const setNumber = currentSet !== undefined ? currentSet : (setNumberProp || 1);
  const calibMode = calibrationMode !== undefined ? calibrationMode : (calibModeProp || false);
  const courtCorners = corners !== undefined ? corners : courtCornersProp;
  const onCornersChange = onCornersChangeProp || onSaveCorners;
  const svgRef = useRef(null);
  const [draftCorners, setDraftCorners] = useState([]);
  const [lastDetected, setLastDetected] = useState(null);

  useEffect(() => {
    if (calibMode === 'calibrating') {
      setDraftCorners([]);
    }
  }, [calibMode]);

  const isCalibrating = calibMode === 'calibrating';
  const isInteractiveGrid = calibMode === 'active' && Array.isArray(courtCorners) && courtCorners.length === 4;

  const handleSvgClick = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (isCalibrating) {
      e.stopPropagation();
      const next = [...draftCorners, { x: u, y: v }];
      if (next.length >= 4) {
        setDraftCorners([]);
        onCornersChange?.(next);
      } else {
        setDraftCorners(next);
      }
      return;
    }

    if (isInteractiveGrid) {
      e.stopPropagation();
      const courtPt = videoPointToCourt(courtCorners, { x: u, y: v });
      const res = courtPointToZone(courtPt);
      if (res) {
        setLastDetected({ ...res, u, v, ts: Date.now() });
        onZoneDetected?.(res);
      }
    }
  };

  // Génère un segment projeté sur la vidéo à partir de 2 points du terrain [0..1, 0..1]
  const renderCourtLine = (x1, y1, x2, y2, props = {}) => {
    if (!courtCorners || courtCorners.length !== 4) return null;
    const p1 = courtPointToVideo(courtCorners, { x: x1, y: y1 });
    const p2 = courtPointToVideo(courtCorners, { x: x2, y: y2 });
    if (!p1 || !p2) return null;
    return (
      <line
        x1={p1.x * 1000}
        y1={p1.y * 1000}
        x2={p2.x * 1000}
        y2={p2.y * 1000}
        vectorEffect="non-scaling-stroke"
        {...props}
      />
    );
  };

  const cornersToDraw = isCalibrating ? draftCorners : courtCorners;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: isCalibrating || isInteractiveGrid ? 'auto' : 'none',
        zIndex: 1,
        overflow: 'hidden',
      }}
    >
      {/* Bandeau TV Broadcast Scoreboard (Haut-Gauche) */}
      {showTvOverlay && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 3,
            display: 'flex',
            alignItems: 'stretch',
            background: 'rgba(9, 9, 11, 0.88)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 3,
            boxShadow: '0 8px 24px rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            fontFamily: 'var(--font-sans)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              background: 'rgba(245, 158, 11, 0.14)',
              borderRight: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: 10,
              fontWeight: 900,
              color: '#fbbf24',
              letterSpacing: '0.06em',
            }}
          >
            <PancakeLogo size={16} />
            <span>SET {setNumber}</span>
          </div>

          {/* Équipe 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRight: '1px solid #27272a' }}>
            {server === 'team1' && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }} />
            )}
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f4f4f5', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {team1}
            </span>
            {homeSetterPos && (
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#a1a1aa', padding: '1px 4px', background: '#18181b', border: '1px solid #27272a', borderRadius: 2 }}>
                {homeSetterPos}
              </span>
            )}
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fbbf24', padding: '0 3px' }}>
              ({setsWon?.team1 || 0})
            </span>
            <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#ffffff', minWidth: 20, textAlign: 'center' }}>
              {score?.team1 ?? 0}
            </span>
          </div>

          {/* Équipe 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
            <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#ffffff', minWidth: 20, textAlign: 'center' }}>
              {score?.team2 ?? 0}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8', padding: '0 3px' }}>
              ({setsWon?.team2 || 0})
            </span>
            {awaySetterPos && (
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#a1a1aa', padding: '1px 4px', background: '#18181b', border: '1px solid #27272a', borderRadius: 2 }}>
                {awaySetterPos}
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f4f4f5', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {team2}
            </span>
            {server === 'team2' && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
            )}
          </div>
        </div>
      )}

      {/* Badge Play-by-Play de l'action active (Bas-Gauche, au-dessus de la barre vidéo) */}
      {showTvOverlay && activeAction && (
        <div
          style={{
            position: 'absolute',
            bottom: 46,
            left: 10,
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px',
            background: 'rgba(9, 9, 11, 0.88)',
            border: '1px solid #27272a',
            borderLeft: '3px solid #f59e0b',
            borderRadius: 3,
            boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
            maxWidth: '82%',
          }}
        >
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 900, color: '#fbbf24' }}>
            {activeAction.code}
          </code>
          <span style={{ fontSize: 11, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeAction?.code ? describeCode(activeAction.code) : ""}
          </span>
        </div>
      )}

      {/* Instructions de Calibration 4-Points */}
      {isCalibrating && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 3,
            padding: '8px 12px',
            background: 'rgba(9, 9, 11, 0.92)',
            border: '1px solid #f59e0b',
            borderRadius: 3,
            color: '#f4f4f5',
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>
              Calibration Perspective (4 Coins)
            </span>
            {onCloseCalibration && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseCalibration();
                }}
                className="btn btn-secondary btn-xs"
                style={{ pointerEvents: 'auto', padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}
              >
                Annuler
              </button>
            )}
          </div>
          <div>Cliquez sur : <strong>{CORNER_LABELS[draftCorners.length] || "4 coins validés"}</strong></div>
        </div>
      )}

      {/* Retour visuel clic sur terrain calibré */}
      {isInteractiveGrid && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 3,
            padding: '6px 10px',
            background: 'rgba(16, 185, 129, 0.16)',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            borderRadius: 3,
            color: '#ecfdf5',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>
            TERRAIN CALIBRÉ : Cliquez un point d’impact → Zone auto
            {lastDetected && (
              <strong style={{ marginLeft: 6, color: '#34d399' }}>
                [Z{lastDetected.zone}{lastDetected.subzone}]
              </strong>
            )}
          </span>
          {onStartCalibration && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartCalibration();
              }}
              className="btn btn-secondary btn-xs"
              style={{ pointerEvents: 'auto', padding: '2px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              title="Redéfinir les 4 coins si la caméra a bougé"
            >
              <RotateCcw size={10} /> Recalibrer
            </button>
          )}
        </div>
      )}

      {/* Calque SVG de calibration / grille perspective 3D */}
      {(isCalibrating || isInteractiveGrid) && (
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          onClick={handleSvgClick}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            cursor: 'crosshair',
            zIndex: 1,
          }}
        >
          {/* Grille perspective complète si les 4 coins sont définis */}
          {courtCorners && courtCorners.length === 4 && (
            <g>
              {/* Contour extérieur du terrain */}
              {renderCourtLine(0, 0, 1, 0, { stroke: '#f59e0b', strokeWidth: 2, opacity: 0.85 })}
              {renderCourtLine(1, 0, 1, 1, { stroke: '#f59e0b', strokeWidth: 2, opacity: 0.85 })}
              {renderCourtLine(1, 1, 0, 1, { stroke: '#f59e0b', strokeWidth: 2, opacity: 0.85 })}
              {renderCourtLine(0, 1, 0, 0, { stroke: '#f59e0b', strokeWidth: 2, opacity: 0.85 })}

              {/* Filet central (y = 0.5) */}
              {renderCourtLine(0, 0.5, 1, 0.5, { stroke: '#ffffff', strokeWidth: 2.5, strokeDasharray: '6 4', opacity: 0.95 })}

              {/* Lignes des 3m (1/3 et 2/3 de chaque demi-terrain) */}
              {renderCourtLine(0, 0.5 - 1 / 6, 1, 0.5 - 1 / 6, { stroke: '#38bdf8', strokeWidth: 1.5, opacity: 0.75 })}
              {renderCourtLine(0, 0.5 + 1 / 6, 1, 0.5 + 1 / 6, { stroke: '#38bdf8', strokeWidth: 1.5, opacity: 0.75 })}

              {/* Subdivisions de zones 3x3 (1/3 et 2/3 en largeur et profondeur) */}
              {renderCourtLine(1 / 3, 0, 1 / 3, 1, { stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1, strokeDasharray: '3 3' })}
              {renderCourtLine(2 / 3, 0, 2 / 3, 1, { stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1, strokeDasharray: '3 3' })}
              {renderCourtLine(0, 1 / 6, 1, 1 / 6, { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, strokeDasharray: '3 3' })}
              {renderCourtLine(0, 5 / 6, 1, 5 / 6, { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, strokeDasharray: '3 3' })}
            </g>
          )}

          {/* Points des coins cliqués */}
          {(cornersToDraw || []).map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x * 1000} cy={pt.y * 1000} r="10" fill="#f59e0b" stroke="#09090b" strokeWidth="2" />
              <text x={pt.x * 1000 + 14} y={pt.y * 1000 + 5} fill="#fbbf24" fontSize="18" fontWeight="900">
                C{i + 1}
              </text>
            </g>
          ))}

          {/* Dernier point d'impact détecté */}
          {lastDetected && (
            <g>
              <circle cx={lastDetected.u * 1000} cy={lastDetected.v * 1000} r="11" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
              <text x={lastDetected.u * 1000 + 15} y={lastDetected.v * 1000 + 5} fill="#34d399" fontSize="20" fontWeight="900">
                Z{lastDetected.zone}{lastDetected.subzone}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
