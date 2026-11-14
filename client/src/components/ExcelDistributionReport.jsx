// ============================================================================
// Composant de rendu du Rapport de Distribution Passeur (modèle exact du
// classeur Excel DISTRIBUTION_PASSEUR_.xlsx : PAUL, MARCUS, J1-3, J4-6, saisie).
// 100% autonome en styles (inline + CSS scopé Pancake Pro Studio & Excel).
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  EXCEL_FRONT_BOXES,
  exportPossessionsToSaisieCSV,
} from '../utils/excelDistributionEngine';

const NOTES_STORAGE_KEY = 'pancake_excel_distribution_notes_v1';

function fmtPct1(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0,0%';
  return `${n.toFixed(1).replace('.', ',')}%`;
}

function fmtPctInt(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n)}%`;
}

/** Pastille SVG représentant le passeur vu de dessus (identique à l'icône verte de l'Excel). */
function SetterAvatarBadge({ x, y }) {
  return (
    <div
      title="Zone de passe du passeur"
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 22,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
      }}
    >
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
        <ellipse
          cx="16"
          cy="16"
          rx="13"
          ry="9"
          transform="rotate(-30 16 16)"
          fill="#548235"
          stroke="#ffffff"
          strokeWidth="2"
        />
        <circle cx="13" cy="14" r="5.5" fill="#548235" stroke="#ffffff" strokeWidth="1.8" />
      </svg>
    </div>
  );
}

/** Bulle d'annotation tactique bleue en haut à droite de chaque terrain (cliquable pour éditer). */
function TacticalNoteBubble({ noteKey, defaultText, customNotes, onSaveNote }) {
  const [editing, setEditing] = useState(false);
  const currentText = customNotes[noteKey] !== undefined ? customNotes[noteKey] : defaultText;
  const [draft, setDraft] = useState(currentText);

  useEffect(() => {
    setDraft(customNotes[noteKey] !== undefined ? customNotes[noteKey] : defaultText);
  }, [customNotes, noteKey, defaultText]);

  if (editing) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          right: 6,
          top: 6,
          zIndex: 35,
          width: 175,
          background: '#2f5597',
          border: '2px solid #ffffff',
          borderRadius: 8,
          padding: 6,
          color: '#ffffff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
          fontSize: 10,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          style={{
            width: '100%',
            resize: 'none',
            background: '#1f3864',
            color: '#ffffff',
            border: '1px solid #6fa8dc',
            borderRadius: 4,
            padding: 4,
            fontSize: 10,
            lineHeight: 1.25,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 4 }}>
          <button
            type="button"
            onClick={() => {
              onSaveNote(noteKey, undefined);
              setEditing(false);
            }}
            style={{
              background: '#3f3f46',
              color: '#e4e4e7',
              border: 'none',
              borderRadius: 3,
              padding: '2px 6px',
              fontSize: 9,
              cursor: 'pointer',
            }}
            title="Réinitialiser le texte automatique"
          >
            Auto
          </button>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                background: '#52525b',
                color: '#ffffff',
                border: 'none',
                borderRadius: 3,
                padding: '2px 6px',
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveNote(noteKey, draft.trim());
                setEditing(false);
              }}
              style={{
                background: '#f59e0b',
                color: '#09090b',
                fontWeight: 800,
                border: 'none',
                borderRadius: 3,
                padding: '2px 7px',
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentText) return null;

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Cliquer pour personnaliser cette note tactique"
      style={{
        position: 'absolute',
        right: 6,
        top: 6,
        zIndex: 20,
        maxWidth: '55%',
        background: '#4472c4',
        border: '1px solid #2f5597',
        borderRadius: 8,
        padding: '4px 8px',
        textAlign: 'left',
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.2,
        color: '#ffffff',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ whiteSpace: 'pre-line' }}>{currentText}</div>
      <span
        style={{
          position: 'absolute',
          bottom: -7,
          left: 12,
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '7px solid #4472c4',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
}

/** Boîte d'attaque individuelle (EN 1, PIPE, autres, EN 2, FIX ARR, FIX AV, DECA, EN 4). */
function CourtAttackBox({ boxData, excelTheme, onSelectActions }) {
  if (!boxData) return null;
  const { key, q, disPct, kills, effPct, actions, killActions } = boxData;
  const hasActions = q > 0;

  const borderCol = excelTheme ? '#000000' : '#3f3f46';
  const headerBg = excelTheme ? '#d9d9d9' : '#1c1c22';
  const headerColor = excelTheme ? '#000000' : '#f4f4f5';
  const bodyBg = excelTheme ? '#bfbfbf' : '#111115';
  const bodyColor = excelTheme ? '#000000' : '#e4e4e7';
  const effColor = excelTheme ? '#275317' : '#10b981';
  const subBorder = excelTheme ? '1px solid rgba(0,0,0,0.22)' : '1px solid #27272a';

  return (
    <div
      style={{
        width: '100%',
        border: `1px solid ${borderCol}`,
        background: bodyBg,
        color: bodyColor,
        fontSize: 10,
        lineHeight: 1.2,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: headerBg,
          color: headerColor,
          borderBottom: `1px solid ${borderCol}`,
          padding: '2px 2px',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 9.5,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {key}
      </div>

      {/* Ligne Q */}
      <div
        onClick={() => hasActions && onSelectActions && onSelectActions(`${key} — Toutes les attaques (${q})`, actions)}
        title={hasActions ? 'Cliquer pour inspecter ces actions' : ''}
        style={{
          display: 'grid',
          gridTemplateColumns: '38% 62%',
          alignItems: 'center',
          padding: '1.5px 3px',
          borderBottom: subBorder,
          cursor: hasActions && onSelectActions ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontWeight: 700 }}>Q</span>
        <span style={{ textAlign: 'center', fontWeight: 700 }}>{q > 0 ? q : 0}</span>
      </div>

      {/* Ligne Dis */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '38% 62%',
          alignItems: 'center',
          padding: '1.5px 3px',
          borderBottom: subBorder,
        }}
      >
        <span style={{ fontWeight: 700 }}>Dis</span>
        <span style={{ textAlign: 'center', fontWeight: 600 }}>{fmtPct1(disPct)}</span>
      </div>

      {/* Ligne Eff (# et % #/Q) */}
      <div
        onClick={() => kills > 0 && onSelectActions && onSelectActions(`${key} — Attaques gagnantes # (${kills})`, killActions)}
        title={kills > 0 ? 'Cliquer pour inspecter les attaques gagnantes (#)' : ''}
        style={{
          display: 'grid',
          gridTemplateColumns: '34% 28% 38%',
          alignItems: 'center',
          padding: '1.5px 3px',
          cursor: kills > 0 && onSelectActions ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontWeight: 700 }}>Eff</span>
        <span style={{ textAlign: 'center', fontWeight: 800, color: effColor }}>{q > 0 ? kills : ''}</span>
        <span style={{ textAlign: 'right', fontWeight: 800, color: effColor }}>{q > 0 ? fmtPctInt(effPct) : '0%'}</span>
      </div>
    </div>
  );
}

/** Demi-terrain de distribution (utilisé dans les Sections 1, 3, 4, 5, 6, 7). */
export function ExcelDistributionCourtCard({
  courtStats,
  noteKeyPrefix = '',
  customNotes = {},
  onSaveNote,
  excelTheme = true,
  onSelectActions,
}) {
  const {
    id,
    title,
    watermark,
    frontBoxes = EXCEL_FRONT_BOXES,
    stripPosition,
    setterPos,
    boxes,
    totalActions,
    totalKills,
    totalEffPct,
    possessions,
    autoNote,
  } = courtStats;

  const frontSet = new Set(frontBoxes);
  const noteKey = `${noteKeyPrefix}_${id}`;

  const frameBg = excelTheme ? '#bfbfbf' : '#141418';
  const frameBorder = excelTheme ? '#808080' : '#27272a';
  const frameText = excelTheme ? '#000000' : '#f4f4f5';
  const courtBg = excelTheme ? '#a9d18e' : '#0d261c';
  const courtBorder = excelTheme ? '#000000' : '#10b981';
  const footerBg = excelTheme ? '#c5e0b4' : '#18181b';
  const footerText = excelTheme ? '#000000' : '#f4f4f5';
  const footerCellBorder = excelTheme ? '1px solid rgba(0,0,0,0.4)' : '1px solid #27272a';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: frameBg,
        border: `1px solid ${frameBorder}`,
        color: frameText,
        boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
      }}
    >
      {/* Titre supérieur du terrain */}
      <div
        style={{
          padding: '4px 6px',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={title}
      >
        {title}
      </div>

      {/* Demi-terrain intérieur avec marges latérales grises comme dans l'Excel */}
      <div style={{ padding: '0 9px' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: courtBg,
            border: `1.5px solid ${courtBorder}`,
          }}
        >
          {/* Couloir vertical vert foncé de réception (Section 4 : 1-9-2 / 6-8-3 / 5-7-4) */}
          {stripPosition && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: '33.333%',
                left: stripPosition === 'left' ? '0%' : stripPosition === 'center' ? '33.333%' : '66.666%',
                background: excelTheme ? '#548235' : 'rgba(16, 185, 129, 0.28)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 18,
                zIndex: 1,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 900,
                  color: '#ffffff',
                  userSelect: 'none',
                  textShadow: '0 1px 3px rgba(0,0,0,0.35)',
                }}
              >
                R
              </span>
            </div>
          )}

          {/* Pastille du passeur (Sections 5, 6, 7 : 13 zones de passe) */}
          {setterPos && <SetterAvatarBadge x={setterPos.x} y={setterPos.y} />}

          {/* Bulle tactique bleue en haut à droite */}
          <TacticalNoteBubble
            noteKey={noteKey}
            defaultText={autoNote}
            customNotes={customNotes}
            onSaveNote={onSaveNote}
          />

          {/* Zone Arrière (au-dessus de la ligne des 3m) */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 146,
              paddingTop: 10,
            }}
          >
            {/* Filigrane central (ZP1..ZP2, GLOBAL, Base 1..0) */}
            <div
              style={{
                minHeight: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
              }}
            >
              {watermark && (
                <span
                  style={{
                    fontSize: 34,
                    fontWeight: 900,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    userSelect: 'none',
                    textShadow: '0 1px 3px rgba(0,0,0,0.22)',
                  }}
                >
                  {watermark}
                </span>
              )}
            </div>

            {/* Ligne des 3 boîtes arrière : EN 1 (col 1), PIPE (col 3), autres (col 5) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                alignItems: 'end',
              }}
            >
              <div>
                <CourtAttackBox
                  boxData={boxes['EN 1']}
                  excelTheme={excelTheme}
                  onSelectActions={onSelectActions}
                />
              </div>
              <div />
              <div>
                <CourtAttackBox
                  boxData={boxes['PIPE']}
                  excelTheme={excelTheme}
                  onSelectActions={onSelectActions}
                />
              </div>
              <div />
              <div>
                <CourtAttackBox
                  boxData={boxes['autres']}
                  excelTheme={excelTheme}
                  onSelectActions={onSelectActions}
                />
              </div>
            </div>
          </div>

          {/* Ligne des 3 mètres */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              borderTop: `2px solid ${courtBorder}`,
            }}
          />

          {/* Zone Avant (entre la ligne des 3m et le filet en bas) */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              paddingTop: 18,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                alignItems: 'end',
              }}
            >
              {EXCEL_FRONT_BOXES.map((boxKey) => (
                <div key={boxKey}>
                  {frontSet.has(boxKey) ? (
                    <CourtAttackBox
                      boxData={boxes[boxKey]}
                      excelTheme={excelTheme}
                      onSelectActions={onSelectActions}
                    />
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bandeau vert de pied de terrain : TOTAL ACTIONS | N | ACTIONS # | K | EFF | % */}
      <div
        onClick={() =>
          totalActions > 0 &&
          onSelectActions &&
          onSelectActions(`${title} ${watermark} — Toutes les actions (${totalActions})`, possessions)
        }
        style={{
          display: 'grid',
          gridTemplateColumns: '34% 11% 24% 10% 9% 12%',
          alignItems: 'center',
          background: footerBg,
          color: footerText,
          borderTop: `1.5px solid ${courtBorder}`,
          fontSize: 9.5,
          fontWeight: 800,
          cursor: totalActions > 0 && onSelectActions ? 'pointer' : 'default',
        }}
      >
        <div style={{ padding: '3px 4px', borderRight: footerCellBorder, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          TOTAL ACTIONS
        </div>
        <div style={{ padding: '3px 2px', textAlign: 'center', borderRight: footerCellBorder }}>
          {totalActions}
        </div>
        <div style={{ padding: '3px 3px', textAlign: 'center', borderRight: footerCellBorder, whiteSpace: 'nowrap' }}>
          ACTIONS #
        </div>
        <div style={{ padding: '3px 2px', textAlign: 'center', borderRight: footerCellBorder }}>
          {totalKills}
        </div>
        <div style={{ padding: '3px 2px', textAlign: 'center', borderRight: footerCellBorder }}>
          EFF
        </div>
        <div style={{ padding: '3px 3px', textAlign: 'right' }}>{fmtPct1(totalEffPct)}</div>
      </div>
    </div>
  );
}

/** Mini-tableau d'une Base (`BASE 0`, `BASE 2`, `BASE 1`, `BASE 7`) dans « Organisation offensive ». */
function OrgaBaseMiniTable({ baseData, colKeys, colLabels, excelTheme, onSelectActions, watermark }) {
  if (!baseData) return null;
  const { label, q, pctOfRotation, killPct, cols, actions } = baseData;

  const borderCol = excelTheme ? '#000000' : '#3f3f46';
  const topGreenBg = excelTheme ? '#c5e0b4' : '#0f291e';
  const topGreenText = excelTheme ? '#000000' : '#f4f4f5';
  const headerGreyBg = excelTheme ? '#d9d9d9' : '#1c1c22';
  const rowGreyBg = excelTheme ? '#a6a6a6' : '#111115';
  const rowText = excelTheme ? '#000000' : '#e4e4e7';
  const greenValColor = excelTheme ? '#275317' : '#10b981';
  const cellBorder = excelTheme ? '1px solid rgba(0,0,0,0.35)' : '1px solid #27272a';

  return (
    <div
      style={{
        width: '100%',
        border: `1px solid ${borderCol}`,
        fontSize: 9,
        lineHeight: 1.15,
        userSelect: 'none',
      }}
    >
      {/* Ligne 1 : BASE X | % d'utilisation dans la rotation */}
      <div
        onClick={() => q > 0 && onSelectActions && onSelectActions(`${watermark} ${label} (${q} act.)`, actions)}
        style={{
          display: 'grid',
          gridTemplateColumns: '60% 40%',
          background: topGreenBg,
          color: topGreenText,
          borderBottom: cellBorder,
          fontWeight: 800,
          cursor: q > 0 && onSelectActions ? 'pointer' : 'default',
        }}
      >
        <div style={{ padding: '2px 2px', textAlign: 'center', borderRight: cellBorder }}>{label}</div>
        <div style={{ padding: '2px 2px', textAlign: 'center', color: greenValColor }}>{fmtPctInt(pctOfRotation)}</div>
      </div>

      {/* Ligne 2 : Q | <q> | % # | <killPct>% */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '20% 20% 25% 35%',
          background: topGreenBg,
          color: topGreenText,
          borderBottom: cellBorder,
          fontWeight: 700,
        }}
      >
        <div style={{ padding: '1.5px 1px', textAlign: 'center', borderRight: cellBorder, fontWeight: 800 }}>Q</div>
        <div style={{ padding: '1.5px 1px', textAlign: 'center', borderRight: cellBorder }}>{q}</div>
        <div style={{ padding: '1.5px 1px', textAlign: 'center', borderRight: cellBorder, fontWeight: 800 }}>% #</div>
        <div style={{ padding: '1.5px 1px', textAlign: 'center', color: greenValColor, fontWeight: 800 }}>
          {q > 0 ? fmtPctInt(killPct) : '0%'}
        </div>
      </div>

      {/* Ligne 3 : En-têtes des 5 cibles (2/1 | C | 4 | PIPE | DIV) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          background: headerGreyBg,
          color: topGreenText,
          borderBottom: cellBorder,
          fontWeight: 800,
          fontSize: 8.5,
        }}
      >
        {colLabels.map((cLab, i) => (
          <div
            key={i}
            style={{
              padding: '1.5px 1px',
              textAlign: 'center',
              borderRight: i < 4 ? cellBorder : 'none',
            }}
          >
            {cLab}
          </div>
        ))}
      </div>

      {/* Ligne 4 : Q par cible */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          background: rowGreyBg,
          color: rowText,
          borderBottom: cellBorder,
          minHeight: 15,
        }}
      >
        {colKeys.map((cKey, i) => {
          const cell = cols[cKey];
          return (
            <div
              key={cKey}
              onClick={() =>
                cell.q > 0 &&
                onSelectActions &&
                onSelectActions(`${watermark} ${label} → ${colLabels[i]} (${cell.q})`, cell.actions)
              }
              style={{
                padding: '1.5px 1px',
                textAlign: 'center',
                fontWeight: 700,
                borderRight: i < 4 ? cellBorder : 'none',
                cursor: cell.q > 0 && onSelectActions ? 'pointer' : 'default',
              }}
            >
              {cell.q > 0 ? cell.q : ''}
            </div>
          );
        })}
      </div>

      {/* Ligne 5 : # (points gagnants) par cible */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          background: rowGreyBg,
          minHeight: 15,
        }}
      >
        {colKeys.map((cKey, i) => {
          const cell = cols[cKey];
          return (
            <div
              key={cKey}
              onClick={() =>
                cell.kills > 0 &&
                onSelectActions &&
                onSelectActions(`${watermark} ${label} → ${colLabels[i]} # (${cell.kills})`, cell.killActions)
              }
              style={{
                padding: '1.5px 1px',
                textAlign: 'center',
                fontWeight: 800,
                color: greenValColor,
                borderRight: i < 4 ? cellBorder : 'none',
                cursor: cell.kills > 0 && onSelectActions ? 'pointer' : 'default',
              }}
            >
              {cell.q > 0 ? cell.kills : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Demi-terrain « Organisation offensive » (Section 2 : ZP1..ZP2). */
export function ExcelOffensiveOrgCourtCard({
  orgaStats,
  noteKeyPrefix = '',
  customNotes = {},
  onSaveNote,
  excelTheme = true,
  onSelectActions,
}) {
  const {
    id,
    title,
    watermark,
    colKeys,
    colLabels,
    bases,
    totalActions,
    totalKills,
    totalEffPct,
    autoNote,
  } = orgaStats;

  const noteKey = `${noteKeyPrefix}_${id}`;

  const frameBg = excelTheme ? '#bfbfbf' : '#141418';
  const frameBorder = excelTheme ? '#808080' : '#27272a';
  const frameText = excelTheme ? '#000000' : '#f4f4f5';
  const courtBg = excelTheme ? '#a9d18e' : '#0d261c';
  const courtBorder = excelTheme ? '#000000' : '#10b981';
  const footerBg = excelTheme ? '#c5e0b4' : '#18181b';
  const footerText = excelTheme ? '#000000' : '#f4f4f5';
  const footerCellBorder = excelTheme ? '1px solid rgba(0,0,0,0.4)' : '1px solid #27272a';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: frameBg,
        border: `1px solid ${frameBorder}`,
        color: frameText,
        boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          padding: '4px 6px',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div style={{ padding: '0 9px' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: courtBg,
            border: `1.5px solid ${courtBorder}`,
          }}
        >
          <TacticalNoteBubble
            noteKey={noteKey}
            defaultText={autoNote}
            customNotes={customNotes}
            onSaveNote={onSaveNote}
          />

          {/* Zone Arrière : Filigrane ZP + BASE 0 centrée au-dessus des 3m */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 156,
              paddingTop: 8,
            }}
          >
            <div
              style={{
                minHeight: 46,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 900,
                  color: '#ffffff',
                  userSelect: 'none',
                  textShadow: '0 1px 3px rgba(0,0,0,0.22)',
                }}
              >
                {watermark}
              </span>
            </div>

            <div style={{ width: '44%', margin: '0 auto' }}>
              <OrgaBaseMiniTable
                baseData={bases['0']}
                colKeys={colKeys}
                colLabels={colLabels}
                excelTheme={excelTheme}
                onSelectActions={onSelectActions}
                watermark={watermark}
              />
            </div>
          </div>

          {/* Ligne des 3m */}
          <div style={{ borderTop: `2px solid ${courtBorder}` }} />

          {/* Zone Avant : BASE 2 (gauche) | BASE 1 (centre) | BASE 7 (droite) */}
          <div style={{ paddingTop: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 3,
                alignItems: 'end',
              }}
            >
              <OrgaBaseMiniTable
                baseData={bases['2']}
                colKeys={colKeys}
                colLabels={colLabels}
                excelTheme={excelTheme}
                onSelectActions={onSelectActions}
                watermark={watermark}
              />
              <OrgaBaseMiniTable
                baseData={bases['1']}
                colKeys={colKeys}
                colLabels={colLabels}
                excelTheme={excelTheme}
                onSelectActions={onSelectActions}
                watermark={watermark}
              />
              <OrgaBaseMiniTable
                baseData={bases['7']}
                colKeys={colKeys}
                colLabels={colLabels}
                excelTheme={excelTheme}
                onSelectActions={onSelectActions}
                watermark={watermark}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bandeau de pied */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '34% 11% 24% 10% 9% 12%',
          alignItems: 'center',
          background: footerBg,
          color: footerText,
          borderTop: `1.5px solid ${courtBorder}`,
          fontSize: 9.5,
          fontWeight: 800,
        }}
      >
        <div style={{ padding: '3px 4px', borderRight: footerCellBorder, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          TOTAL ACTIONS
        </div>
        <div style={{ padding: '3px 2px', textAlign: 'center', borderRight: footerCellBorder }}>
          {totalActions}
        </div>
        <div style={{ padding: '3px 3px', textAlign: 'center', borderRight: footerCellBorder, whiteSpace: 'nowrap' }}>
          ACTIONS #
        </div>
        <div style={{ padding: '3px 2px', textAlign: 'center', borderRight: footerCellBorder }}>
          {totalKills}
        </div>
        <div style={{ padding: '3px 2px', textAlign: 'center', borderRight: footerCellBorder }}>
          EFF
        </div>
        <div style={{ padding: '3px 3px', textAlign: 'right' }}>{fmtPct1(totalEffPct)}</div>
      </div>
    </div>
  );
}

/** Carte des 13 sous-zones de passe (reproduction exacte de `zone de PASSE` dans la feuille `saisie`). */
export function ExcelPassZone13MapCard({ saisieSummary, excelTheme = true, onSelectActions }) {
  const { passZoneCounts, totalWithPassZone, totalKillsWithPassZone } = saisieSummary;
  const totalEff = totalWithPassZone > 0 ? (totalKillsWithPassZone / totalWithPassZone) * 100 : 0;

  const frameBg = excelTheme ? '#bfbfbf' : '#141418';
  const frameBorder = excelTheme ? '#808080' : '#27272a';
  const frameText = excelTheme ? '#000000' : '#f4f4f5';
  const courtBg = excelTheme ? '#a9d18e' : '#0d261c';
  const courtBorder = excelTheme ? '#000000' : '#10b981';
  const footerBg = excelTheme ? '#c5e0b4' : '#18181b';
  const footerText = excelTheme ? '#000000' : '#f4f4f5';
  const footerCellBorder = excelTheme ? '1px solid rgba(0,0,0,0.4)' : '1px solid #27272a';

  const renderZoneCell = (zKey) => {
    const item = passZoneCounts[zKey] || { q: 0, pct: 0, actions: [] };
    return (
      <div
        key={zKey}
        onClick={() =>
          item.q > 0 &&
          onSelectActions &&
          onSelectActions(`Zone de passe ${zKey} (${item.q} passes)`, item.actions)
        }
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${courtBorder}`,
          background: courtBg,
          color: frameText,
          padding: '14px 6px',
          textAlign: 'center',
          cursor: item.q > 0 && onSelectActions ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            lineHeight: 1,
            color: '#ffffff',
            textShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        >
          {zKey}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800 }}>{item.q}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700 }}>{fmtPct1(item.pct)}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: frameBg,
        border: `1px solid ${frameBorder}`,
        color: frameText,
        boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
      }}
    >
      <div style={{ padding: '6px 8px', textAlign: 'center', fontSize: 12, fontWeight: 800 }}>
        zone de PASSE
      </div>
      <div style={{ padding: '0 12px', flex: 1 }}>
        <div style={{ border: `1.5px solid ${courtBorder}` }}>
          {/* Bande supérieure : Situation Mini (1 | 6 | 5) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {['1', '6', '5'].map(renderZoneCell)}
          </div>
          {/* Bande médiane : Situation Moyenne (9 | 8A | 8 | 8C | 7) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {['9', '8A', '8', '8C', '7'].map(renderZoneCell)}
          </div>
          {/* Bande inférieure (filet) : Bonne Situation (2 | 3A | 3 | 3C | 4) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {['2', '3A', '3', '3C', '4'].map(renderZoneCell)}
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '34% 14% 24% 10% 8% 10%',
          alignItems: 'center',
          background: footerBg,
          color: footerText,
          borderTop: `1.5px solid ${courtBorder}`,
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        <div style={{ padding: '5px 8px', borderRight: footerCellBorder }}>TOTAL ACTIONS</div>
        <div style={{ padding: '5px 4px', textAlign: 'center', borderRight: footerCellBorder }}>
          {totalWithPassZone}
        </div>
        <div style={{ padding: '5px 6px', textAlign: 'center', borderRight: footerCellBorder }}>
          ACTIONS #
        </div>
        <div style={{ padding: '5px 4px', textAlign: 'center', borderRight: footerCellBorder }}>
          {totalKillsWithPassZone}
        </div>
        <div style={{ padding: '5px 4px', textAlign: 'center', borderRight: footerCellBorder }}>EFF</div>
        <div style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtPct1(totalEff)}</div>
      </div>
    </div>
  );
}

/** Graphique circulaire SVG léger pour les synthèses de la feuille `saisie`. */
function SimplePieCard({ title, items }) {
  const total = items.reduce((s, x) => s + (x.count || 0), 0);
  const palette = ['#3b82f6', '#f97316', '#94a3b8', '#eab308', '#06b6d4', '#10b981', '#a855f7', '#ec4899'];

  let cumulative = 0;
  const slices = items
    .filter((it) => it.count > 0)
    .map((it, idx) => {
      const frac = total > 0 ? it.count / total : 0;
      const startAngle = cumulative * 2 * Math.PI;
      cumulative += frac;
      const endAngle = cumulative * 2 * Math.PI;
      return {
        ...it,
        frac,
        startAngle,
        endAngle,
        color: it.color || palette[idx % palette.length],
      };
    });

  const arcPath = (start, end, r = 42) => {
    if (end - start >= 2 * Math.PI - 0.001) {
      return `M 50 ${50 - r} A ${r} ${r} 0 1 1 49.99 ${50 - r} Z`;
    }
    const x1 = 50 + r * Math.sin(start);
    const y1 = 50 - r * Math.cos(start);
    const x2 = 50 + r * Math.sin(end);
    const y2 = 50 - r * Math.cos(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M 50 50 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div
      style={{
        background: '#141418',
        border: '1px solid #27272a',
        padding: 16,
      }}
    >
      <h4
        style={{
          margin: '0 0 12px 0',
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#e4e4e7',
        }}
      >
        {title}
      </h4>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg viewBox="0 0 100 100" style={{ width: 120, height: 120, flexShrink: 0 }}>
          {slices.length === 0 ? (
            <circle cx="50" cy="50" r="40" fill="#1e293b" />
          ) : (
            slices.map((s, i) => (
              <path key={i} d={arcPath(s.startAngle, s.endAngle)} fill={s.color} stroke="#09090b" strokeWidth="1" />
            ))
          )}
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: it.color || palette[i % palette.length],
                  }}
                />
                <span style={{ fontWeight: 600, color: '#d4d4d8' }}>{it.label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', color: '#f4f4f5' }}>
                <strong>{it.count}</strong>{' '}
                <span style={{ color: '#a1a1aa' }}>({fmtPctInt(it.pct)})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Composant Principal : ExcelDistributionReport
// ============================================================================

export default function ExcelDistributionReport({
  report,
  teamName = 'Équipe',
  setterLabel = 'Tous les passeurs',
  onSelectActionsForVideo = null,
}) {
  const [excelTheme, setExcelTheme] = useState(true);
  const [activeSection, setActiveSection] = useState('ALL');
  const [colsCount, setColsCount] = useState(6); // 6 | 3 | 2
  const [saisieSearch, setSaisieSearch] = useState('');
  const [inspectedGroup, setInspectedGroup] = useState(null);

  const [customNotes, setCustomNotes] = useState(() => {
    try {
      const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const handleSaveNote = (key, text) => {
    setCustomNotes((prev) => {
      const next = { ...prev };
      if (text === undefined) delete next[key];
      else next[key] = text;
      try {
        window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const noteKeyPrefix = `${teamName}_${setterLabel}`.replace(/\s+/g, '_');

  const handleSelectActions = (title, actions) => {
    if (!actions || !actions.length) return;
    setInspectedGroup({ title, actions });
    if (onSelectActionsForVideo) {
      onSelectActionsForVideo(title, actions);
    }
  };

  const handleExportCSV = () => {
    if (!report?.filteredPossessions?.length) return;
    const csv = exportPossessionsToSaisieCSV(report.filteredPossessions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `distribution_${teamName}_${setterLabel}.csv`.replace(/\s+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTableRows = useMemo(() => {
    const list = report?.filteredPossessions || [];
    const q = saisieSearch.trim().toUpperCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        String(p.matchLabel || '').toUpperCase().includes(q) ||
        String(p.passZone || '').toUpperCase().includes(q) ||
        String(p.distribBox || '').toUpperCase().includes(q) ||
        String(p.attackerNumber || '').toUpperCase().includes(q)
    );
  }, [report?.filteredPossessions, saisieSearch]);

  if (!report) return null;

  const {
    byRotation,
    offensiveOrg,
    globalCourt,
    baseCourts,
    byReceptionGroup,
    passZonesMini,
    passZonesMoyenne,
    passZonesBonne,
    saisieSummary,
  } = report;

  const grid6Style = {
    display: 'grid',
    gridTemplateColumns:
      colsCount === 6
        ? 'repeat(auto-fit, minmax(265px, 1fr))'
        : colsCount === 3
        ? 'repeat(auto-fit, minmax(380px, 1fr))'
        : 'repeat(auto-fit, minmax(520px, 1fr))',
    gap: 12,
  };

  const grid5Style = {
    display: 'grid',
    gridTemplateColumns:
      colsCount === 6
        ? 'repeat(auto-fit, minmax(290px, 1fr))'
        : colsCount === 3
        ? 'repeat(auto-fit, minmax(380px, 1fr))'
        : 'repeat(auto-fit, minmax(520px, 1fr))',
    gap: 12,
  };

  const grid3Style = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: 16,
  };

  const sectionTitleStyle = {
    margin: '0 0 10px 0',
    fontSize: 13,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#c8a165',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Barre d'outils du Rapport de Distribution */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          background: '#141418',
          border: '1px solid #27272a',
        }}
      >
        {/* Sous-sections rapides */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {[
            { id: 'ALL', label: 'Rapport Complet (Feuille Passeur)' },
            { id: 'ROT_ORGA', label: '1. ZP1..ZP2 & Orga Offensive' },
            { id: 'GLOBAL_BASES', label: '2. Global & Bases (1, 2, 7, 0)' },
            { id: 'REC', label: '3. Zones Réception (1-9-2 / 6-8-3 / 5-7-4)' },
            { id: 'PASS_ZONES', label: '4. 13 Zones de Passe (Mini / Moy / Bonne)' },
            { id: 'SAISIE', label: '5. Synthèse & Feuille Saisie' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${activeSection === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contrôles d'affichage et d'export */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: '#09090b', border: '1px solid #27272a', padding: 2, gap: 2 }}>
            <button
              type="button"
              className={`btn btn-xs ${excelTheme ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setExcelTheme(true)}
            >
              Terrain Excel Officiel
            </button>
            <button
              type="button"
              className={`btn btn-xs ${!excelTheme ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setExcelTheme(false)}
            >
              Thème Pancake Dark
            </button>
          </div>

          <div style={{ display: 'flex', background: '#09090b', border: '1px solid #27272a', padding: 2, gap: 2 }}>
            {[
              { id: 6, label: 'Compact (6)' },
              { id: 3, label: 'Confort (3)' },
              { id: 2, label: 'Large (2)' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                className={`btn btn-xs ${colsCount === d.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setColsCount(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
            Exporter CSV (Saisie)
          </button>

          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            Imprimer / PDF
          </button>
        </div>
      </div>

      {/* SECTION 1 & 2 : Distribution par Rotation (ZP1..ZP2) + Organisation Offensive (ZP1..ZP2) */}
      {(activeSection === 'ALL' || activeSection === 'ROT_ORGA') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
              Distribution par Rotation (ZP1, ZP6, ZP5, ZP4, ZP3, ZP2)
            </h3>
            <span style={{ fontSize: 11.5, color: '#a1a1aa' }}>
              Astuce : Cliquez sur une bulle bleue pour modifier l'annotation ou sur un chiffre Q / # pour inspecter les actions
            </span>
          </div>

          <div style={grid6Style}>
            {byRotation.map((court) => (
              <ExcelDistributionCourtCard
                key={court.id}
                courtStats={court}
                noteKeyPrefix={noteKeyPrefix}
                customNotes={customNotes}
                onSaveNote={handleSaveNote}
                excelTheme={excelTheme}
                onSelectActions={handleSelectActions}
              />
            ))}
          </div>

          <h3 style={{ ...sectionTitleStyle, marginTop: 8 }}>
            Organisation Offensive par Rotation (BASE 0 / BASE 2 / BASE 1 / BASE 7)
          </h3>
          <div style={grid6Style}>
            {offensiveOrg.map((orga) => (
              <ExcelOffensiveOrgCourtCard
                key={orga.id}
                orgaStats={orga}
                noteKeyPrefix={noteKeyPrefix}
                customNotes={customNotes}
                onSaveNote={handleSaveNote}
                excelTheme={excelTheme}
                onSelectActions={handleSelectActions}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3 : Distribution Globale & Par Annonce du Central (Base 1, Base 2, Base 7, Base 0) */}
      {(activeSection === 'ALL' || activeSection === 'GLOBAL_BASES') && (
        <div>
          <h3 style={sectionTitleStyle}>
            Distribution Globale &amp; Par Annonce du Central (Base 1, Base 2, Base 7, Base 0)
          </h3>
          <div style={grid5Style}>
            <ExcelDistributionCourtCard
              courtStats={globalCourt}
              noteKeyPrefix={noteKeyPrefix}
              customNotes={customNotes}
              onSaveNote={handleSaveNote}
              excelTheme={excelTheme}
              onSelectActions={handleSelectActions}
            />
            {baseCourts.map((bCourt) => (
              <ExcelDistributionCourtCard
                key={bCourt.id}
                courtStats={bCourt}
                noteKeyPrefix={noteKeyPrefix}
                customNotes={customNotes}
                onSaveNote={handleSaveNote}
                excelTheme={excelTheme}
                onSelectActions={handleSelectActions}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECTION 4 : Distribution selon le couloir de Réception (Gauche 1-9-2, Centre 6-8-3, Droite 5-7-4) */}
      {(activeSection === 'ALL' || activeSection === 'REC') && (
        <div>
          <h3 style={sectionTitleStyle}>
            Distribution selon la Zone de Réception (Gauche 1-9-2 | Centre 6-8-3 | Droite 5-7-4)
          </h3>
          <div style={grid3Style}>
            {byReceptionGroup.map((rCourt) => (
              <ExcelDistributionCourtCard
                key={rCourt.id}
                courtStats={rCourt}
                noteKeyPrefix={noteKeyPrefix}
                customNotes={customNotes}
                onSaveNote={handleSaveNote}
                excelTheme={excelTheme}
                onSelectActions={handleSelectActions}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECTIONS 5, 6, 7 : Les 13 Zones de Passe (Situation Mini, Situation Moyenne, Bonne Situation) */}
      {(activeSection === 'ALL' || activeSection === 'PASS_ZONES') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <h3 style={sectionTitleStyle}>Situation Mini — Zone de Passe en 1, 6, 5</h3>
            <div style={grid3Style}>
              {passZonesMini.map((pzCourt) => (
                <ExcelDistributionCourtCard
                  key={pzCourt.id}
                  courtStats={pzCourt}
                  noteKeyPrefix={noteKeyPrefix}
                  customNotes={customNotes}
                  onSaveNote={handleSaveNote}
                  excelTheme={excelTheme}
                  onSelectActions={handleSelectActions}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 style={sectionTitleStyle}>Situation Moyenne — Zone de Passe en 9, 8A, 8, 8C, 7</h3>
            <div style={grid5Style}>
              {passZonesMoyenne.map((pzCourt) => (
                <ExcelDistributionCourtCard
                  key={pzCourt.id}
                  courtStats={pzCourt}
                  noteKeyPrefix={noteKeyPrefix}
                  customNotes={customNotes}
                  onSaveNote={handleSaveNote}
                  excelTheme={excelTheme}
                  onSelectActions={handleSelectActions}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 style={sectionTitleStyle}>Bonne Situation — Zone de Passe en 2, 3A, 3, 3C, 4</h3>
            <div style={grid5Style}>
              {passZonesBonne.map((pzCourt) => (
                <ExcelDistributionCourtCard
                  key={pzCourt.id}
                  courtStats={pzCourt}
                  noteKeyPrefix={noteKeyPrefix}
                  customNotes={customNotes}
                  onSaveNote={handleSaveNote}
                  excelTheme={excelTheme}
                  onSelectActions={handleSelectActions}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 8 : Synthèse Feuille « Saisie » (Carte 13 Zones + Graphiques + Tableau des actions) */}
      {(activeSection === 'ALL' || activeSection === 'SAISIE') && saisieSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, borderTop: '1px solid #27272a', paddingTop: 20 }}>
          <h3 style={sectionTitleStyle}>
            Synthèse Globale &amp; Données « Saisie » (Carte 13 Zones de Passe &amp; Graphiques)
          </h3>

          {/* Côte-à-côte : Carte 13 zones de passe + Terrain Distribution globale */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
            <ExcelPassZone13MapCard
              saisieSummary={saisieSummary}
              excelTheme={excelTheme}
              onSelectActions={handleSelectActions}
            />
            <ExcelDistributionCourtCard
              courtStats={globalCourt}
              noteKeyPrefix={noteKeyPrefix}
              customNotes={customNotes}
              onSaveNote={handleSaveNote}
              excelTheme={excelTheme}
              onSelectActions={handleSelectActions}
            />
          </div>

          {/* Les 5 Camemberts de synthèse de la feuille saisie + Classement Attaquants */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14 }}>
            <SimplePieCard title="TEMPS DE JEU DE P" items={saisieSummary.setterBreakdown} />
            <SimplePieCard title="ORGA OFFENSIVE" items={saisieSummary.orgaBreakdown} />
            <SimplePieCard title="QUALITÉ DE RÉC" items={saisieSummary.receptionQualityBreakdown} />
            <SimplePieCard title="% DE ROTATIONS" items={saisieSummary.rotationBreakdown} />
            <SimplePieCard title="RÉS ATT" items={saisieSummary.attackResultBreakdown} />

            <div style={{ background: '#141418', border: '1px solid #27272a', padding: 16 }}>
              <h4
                style={{
                  margin: '0 0 12px 0',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#e4e4e7',
                }}
              >
                RÉPARTITION PAR ATTAQUANT (N° JOUEUR)
              </h4>
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {saisieSummary.attackerBreakdown.map((att) => (
                  <div
                    key={att.number}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 10px',
                      background: '#09090b',
                      border: '1px solid #27272a',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#c8a165' }}>
                      N° {att.number} {att.name ? `— ${att.name}` : ''}
                    </span>
                    <div style={{ fontFamily: 'var(--font-mono)', color: '#e4e4e7' }}>
                      <strong>{att.q}</strong> ballons ({fmtPctInt(att.pctOfTeam)}) ·{' '}
                      <strong style={{ color: '#10b981' }}>
                        {att.kills}# ({fmtPctInt(att.killPct)})
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tableau complet des possessions (colonnes A à K de la feuille saisie) */}
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 16 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f4f4f5' }}>
                  Tableau des Possessions (« Feuille Saisie » — {filteredTableRows.length} lignes)
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
                  Colonnes identiques au fichier Excel : MATCH, ROTATION, N° P, SERVICE, ZONE R, QUALITE R, ZONE P, BASE OFF, DISTRIB P, N° JOUEUR, RES ATT
                </p>
              </div>
              <input
                type="text"
                value={saisieSearch}
                onChange={(e) => setSaisieSearch(e.target.value)}
                placeholder="Filtrer par match, zone, joueur..."
                style={{ minWidth: 250, padding: '6px 10px' }}
              />
            </div>

            <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid #27272a', background: '#09090b' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: 12 }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    background: '#1c1c22',
                    color: '#e4e4e7',
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  <tr>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #27272a' }}>MATCH</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>ROTATION</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>N° P</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>SERVICE</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>ZONE R</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>QUALITE R</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>ZONE P</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>BASE OFF</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>DISTRIB P</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>BOÎTE</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>N° JOUEUR</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid #27272a' }}>RES ATT</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableRows.slice(0, 400).map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => row.videoId && handleSelectActions(`Action ${row.matchLabel}`, [row])}
                      style={{
                        borderBottom: '1px solid #1c1c22',
                        cursor: row.videoId ? 'pointer' : 'default',
                      }}
                    >
                      <td style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#e8c98f' }}>
                        {row.matchLabel}
                      </td>
                      <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>ZP{row.rotation}</td>
                      <td style={{ padding: '6px', fontWeight: 800, color: '#38bdf8' }}>{row.setterNumber}</td>
                      <td style={{ padding: '6px' }}>{row.serviceType}</td>
                      <td style={{ padding: '6px' }}>{row.receptionZone}</td>
                      <td style={{ padding: '6px', fontWeight: 700 }}>{row.receptionQuality}</td>
                      <td style={{ padding: '6px', fontWeight: 800, color: '#10b981' }}>{row.passZone}</td>
                      <td style={{ padding: '6px' }}>Base {row.baseOff}</td>
                      <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>{row.distribCode}</td>
                      <td style={{ padding: '6px', color: '#a1a1aa' }}>{row.distribBox}</td>
                      <td style={{ padding: '6px', fontWeight: 700 }}>{row.attackerNumber}</td>
                      <td
                        style={{
                          padding: '6px',
                          fontWeight: 800,
                          color:
                            row.attackResult === '#'
                              ? '#10b981'
                              : row.attackResult === 'ERR' || row.attackResult === '/'
                              ? '#fb7185'
                              : '#d4d4d8',
                        }}
                      >
                        {row.attackResult}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Fenêtre d'inspection des actions quand on clique sur un chiffre Q ou # d'un terrain */}
      {inspectedGroup && (
        <div
          onClick={() => setInspectedGroup(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.78)',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 820,
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#141418',
              border: '1px solid #3f3f46',
              boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderBottom: '1px solid #27272a',
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#c8a165' }}>
                  {inspectedGroup.title}
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
                  Détail des possessions comptabilisées dans cette cellule
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInspectedGroup(null)}>
                Fermer
              </button>
            </div>
            <div style={{ padding: 14, overflow: 'auto', maxHeight: '65vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: 12 }}>
                <thead style={{ background: '#1c1c22', color: '#d4d4d8', fontSize: 11, fontWeight: 800 }}>
                  <tr>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Match</th>
                    <th style={{ padding: '6px' }}>Rot.</th>
                    <th style={{ padding: '6px' }}>N° P</th>
                    <th style={{ padding: '6px' }}>Serv.</th>
                    <th style={{ padding: '6px' }}>Zone R</th>
                    <th style={{ padding: '6px' }}>Qual R</th>
                    <th style={{ padding: '6px' }}>Zone P</th>
                    <th style={{ padding: '6px' }}>Base</th>
                    <th style={{ padding: '6px' }}>Distrib</th>
                    <th style={{ padding: '6px' }}>Attaquant</th>
                    <th style={{ padding: '6px' }}>Rés.</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectedGroup.actions.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#e8c98f' }}>
                        {row.matchLabel}
                      </td>
                      <td style={{ padding: '6px' }}>ZP{row.rotation}</td>
                      <td style={{ padding: '6px', fontWeight: 700, color: '#38bdf8' }}>{row.setterNumber}</td>
                      <td style={{ padding: '6px' }}>{row.serviceType}</td>
                      <td style={{ padding: '6px' }}>{row.receptionZone}</td>
                      <td style={{ padding: '6px' }}>{row.receptionQuality}</td>
                      <td style={{ padding: '6px', fontWeight: 800, color: '#10b981' }}>{row.passZone}</td>
                      <td style={{ padding: '6px' }}>Base {row.baseOff}</td>
                      <td style={{ padding: '6px' }}>
                        {row.distribBox} ({row.distribCode})
                      </td>
                      <td style={{ padding: '6px', fontWeight: 700 }}>#{row.attackerNumber}</td>
                      <td style={{ padding: '6px', fontWeight: 800, color: '#10b981' }}>{row.attackResult}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
