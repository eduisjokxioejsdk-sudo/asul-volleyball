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

// Centres normalisés [cx, cy] des 18 zones DataVolley (9 par demi-terrain)
const COURT_ZONE_CENTERS = [
  // Camp Haut (cy < 0.5)
  { x: 1 / 6, y: 1 / 12 }, { x: 3 / 6, y: 1 / 12 }, { x: 5 / 6, y: 1 / 12 },
  { x: 1 / 6, y: 3 / 12 }, { x: 3 / 6, y: 3 / 12 }, { x: 5 / 6, y: 3 / 12 },
  { x: 1 / 6, y: 5 / 12 }, { x: 3 / 6, y: 5 / 12 }, { x: 5 / 6, y: 5 / 12 },
  // Camp Bas (cy > 0.5)
  { x: 1 / 6, y: 7 / 12 }, { x: 3 / 6, y: 7 / 12 }, { x: 5 / 6, y: 7 / 12 },
  { x: 1 / 6, y: 9 / 12 }, { x: 3 / 6, y: 9 / 12 }, { x: 5 / 6, y: 9 / 12 },
  { x: 1 / 6, y: 11 / 12 }, { x: 3 / 6, y: 11 / 12 }, { x: 5 / 6, y: 11 / 12 },
];

// --- Transparence de la grille 3D projetée sur la vidéo ---------------------
// La grille doit rester lisible sans masquer le jeu : hiérarchie de
// transparence, du trait le plus présent au plus discret. L'opacité est
// appliquée au groupe entier (ombre sombre + trait clair) pour que le
// sous-tracé de contraste ne reste pas opaque.
const GRID_OPACITY_SIDE = 0.7; // lignes de côté (contour) : le moins transparent
const GRID_OPACITY_LINE = 0.45; // filet et lignes des 3 m
const GRID_OPACITY_SUBZONE = 0.22; // pointillés de sous-zones : le plus transparent
const GRID_OPACITY_ZONE_LABEL = 0.4; // badges « Z1 »..« Z9 » en filigrane

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

  // Génère un segment projeté sur la vidéo avec un double tracé (ombre sombre +
  // trait clair) : le contraste reste bon sur parquet clair ou foncé, tandis que
  // l'opacité (appliquée au groupe) garde la grille discrète sur la vidéo.
  const renderCourtContrastedLine = (
    x1,
    y1,
    x2,
    y2,
    {
      stroke = '#ffffff',
      strokeWidth = 2,
      opacity = 0.95,
      strokeDasharray = undefined,
      strokeLinecap = 'round',
      shadowColor = 'rgba(0, 0, 0, 0.85)',
      shadowWidth = undefined,
    } = {},
    key = undefined
  ) => {
    if (!courtCorners || courtCorners.length !== 4) return null;
    const p1 = courtPointToVideo(courtCorners, { x: x1, y: y1 });
    const p2 = courtPointToVideo(courtCorners, { x: x2, y: y2 });
    if (!p1 || !p2) return null;
    const underWidth = shadowWidth !== undefined ? shadowWidth : strokeWidth + 2;
    // L'opacité porte sur le groupe entier : l'ombre sombre s'estompe avec le
    // trait clair, la grille reste contrastée mais transparente sur la vidéo.
    return (
      <g key={key} opacity={opacity}>
        {/* Sous-tracé de contraste sombre pour détacher les pointillés sur parquets clairs ou reflets */}
        <line
          x1={p1.x * 1000}
          y1={p1.y * 1000}
          x2={p2.x * 1000}
          y2={p2.y * 1000}
          vectorEffect="non-scaling-stroke"
          stroke={shadowColor}
          strokeWidth={underWidth}
          strokeDasharray={strokeDasharray}
          strokeLinecap={strokeLinecap}
        />
        {/* Tracé visible clair lumineux */}
        <line
          x1={p1.x * 1000}
          y1={p1.y * 1000}
          x2={p2.x * 1000}
          y2={p2.y * 1000}
          vectorEffect="non-scaling-stroke"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinecap={strokeLinecap}
        />
      </g>
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
          {/* Grille perspective complète si les 4 coins sont définis. Pendant le
              recalibrage elle est atténuée (0.6) pour ne pas masquer la vidéo ;
              les opacités par type de ligne s'y multiplient. */}
          {courtCorners && courtCorners.length === 4 && (
            <g opacity={isCalibrating && draftCorners.length > 0 ? 0.6 : 1}>
              {/* Contour extérieur du terrain : lignes de côté, les moins transparentes */}
              {renderCourtContrastedLine(0, 0, 1, 0, { stroke: '#f59e0b', strokeWidth: 2.6, opacity: GRID_OPACITY_SIDE }, 'b-top')}
              {renderCourtContrastedLine(1, 0, 1, 1, { stroke: '#f59e0b', strokeWidth: 2.6, opacity: GRID_OPACITY_SIDE }, 'b-right')}
              {renderCourtContrastedLine(1, 1, 0, 1, { stroke: '#f59e0b', strokeWidth: 2.6, opacity: GRID_OPACITY_SIDE }, 'b-bottom')}
              {renderCourtContrastedLine(0, 1, 0, 0, { stroke: '#f59e0b', strokeWidth: 2.6, opacity: GRID_OPACITY_SIDE }, 'b-left')}

              {/* Filet central (y = 0.5) */}
              {renderCourtContrastedLine(0, 0.5, 1, 0.5, { stroke: '#ffffff', strokeWidth: 3, strokeDasharray: '8 4', opacity: GRID_OPACITY_LINE }, 'net')}

              {/* Lignes des 3m d'attaque (1/3 et 2/3 de chaque demi-terrain) */}
              {renderCourtContrastedLine(0, 0.5 - 1 / 6, 1, 0.5 - 1 / 6, { stroke: '#38bdf8', strokeWidth: 2.2, opacity: GRID_OPACITY_LINE }, '3m-top')}
              {renderCourtContrastedLine(0, 0.5 + 1 / 6, 1, 0.5 + 1 / 6, { stroke: '#38bdf8', strokeWidth: 2.2, opacity: GRID_OPACITY_LINE }, '3m-bottom')}

              {/* Pointillés des sous-zones (subdivisions longitudinales 1/3 et 2/3) : les plus transparents */}
              {renderCourtContrastedLine(1 / 3, 0, 1 / 3, 1, {
                stroke: '#ffffff',
                strokeWidth: 2,
                strokeDasharray: '7 4',
                opacity: GRID_OPACITY_SUBZONE,
              }, 'zone-v1')}
              {renderCourtContrastedLine(2 / 3, 0, 2 / 3, 1, {
                stroke: '#ffffff',
                strokeWidth: 2,
                strokeDasharray: '7 4',
                opacity: GRID_OPACITY_SUBZONE,
              }, 'zone-v2')}

              {/* Pointillés des sous-zones (subdivisions transversales 1/6 et 5/6 - séparation fond / milieu) */}
              {renderCourtContrastedLine(0, 1 / 6, 1, 1 / 6, {
                stroke: '#ffffff',
                strokeWidth: 2,
                strokeDasharray: '7 4',
                opacity: GRID_OPACITY_SUBZONE,
              }, 'zone-h1')}
              {renderCourtContrastedLine(0, 5 / 6, 1, 5 / 6, {
                stroke: '#ffffff',
                strokeWidth: 2,
                strokeDasharray: '7 4',
                opacity: GRID_OPACITY_SUBZONE,
              }, 'zone-h2')}

              {/* Nom des 9 zones par demi-terrain, affiché en filigrane transparent */}
              {COURT_ZONE_CENTERS.map((c, idx) => {
                const vpt = courtPointToVideo(courtCorners, c);
                const zInfo = courtPointToZone(c);
                if (!vpt || !zInfo) return null;
                return (
                  <g key={`zl-${idx}`} pointerEvents="none" opacity={GRID_OPACITY_ZONE_LABEL}>
                    <circle
                      cx={vpt.x * 1000}
                      cy={vpt.y * 1000}
                      r="12"
                      fill="rgba(9, 9, 11, 0.72)"
                      stroke="rgba(255, 255, 255, 0.65)"
                      strokeWidth="1.2"
                    />
                    <text
                      x={vpt.x * 1000}
                      y={vpt.y * 1000 + 4}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="11"
                      fontWeight="800"
                      fontFamily="var(--font-mono, monospace)"
                      style={{ userSelect: 'none' }}
                    >
                      Z{zInfo.zone}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Lignes pointillées directes entre les coins en cours de sélection */}
          {isCalibrating && draftCorners.length > 1 && (
            <g pointerEvents="none">
              {draftCorners.map((pt, i) => {
                if (i === 0) return null;
                const prev = draftCorners[i - 1];
                return (
                  <g key={`draft-edge-${i}`}>
                    <line
                      x1={prev.x * 1000}
                      y1={prev.y * 1000}
                      x2={pt.x * 1000}
                      y2={pt.y * 1000}
                      vectorEffect="non-scaling-stroke"
                      stroke="rgba(0, 0, 0, 0.85)"
                      strokeWidth="4"
                      strokeDasharray="7 4"
                    />
                    <line
                      x1={prev.x * 1000}
                      y1={prev.y * 1000}
                      x2={pt.x * 1000}
                      y2={pt.y * 1000}
                      vectorEffect="non-scaling-stroke"
                      stroke="#fbbf24"
                      strokeWidth="2.2"
                      strokeDasharray="7 4"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Points des coins cliqués */}
          {(cornersToDraw || []).map((pt, i) => (
            <g key={`corner-${i}`} pointerEvents="none">
              <circle
                cx={pt.x * 1000}
                cy={pt.y * 1000}
                r="11"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="2.5"
                filter="drop-shadow(0 0 4px rgba(0,0,0,0.9))"
              />
              <text
                x={pt.x * 1000 + 15}
                y={pt.y * 1000 + 5}
                fill="#fbbf24"
                fontSize="18"
                fontWeight="900"
                style={{
                  paintOrder: 'stroke',
                  stroke: '#09090b',
                  strokeWidth: '4px',
                  strokeLinejoin: 'round',
                  userSelect: 'none',
                }}
              >
                C{i + 1}
              </text>
            </g>
          ))}

          {/* Dernier point d'impact détecté */}
          {lastDetected && (
            <g pointerEvents="none">
              <circle
                cx={lastDetected.u * 1000}
                cy={lastDetected.v * 1000}
                r="12"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="2.5"
                filter="drop-shadow(0 0 4px rgba(0,0,0,0.9))"
              />
              <text
                x={lastDetected.u * 1000 + 16}
                y={lastDetected.v * 1000 + 6}
                fill="#34d399"
                fontSize="20"
                fontWeight="900"
                style={{
                  paintOrder: 'stroke',
                  stroke: '#09090b',
                  strokeWidth: '4px',
                  strokeLinejoin: 'round',
                  userSelect: 'none',
                }}
              >
                Z{lastDetected.zone}{lastDetected.subzone}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
