// ============================================================================
// LISTE DES CODES — Grille tabulaire DataVolley 4 Pro (Point 25).
//
// Propose deux vues complémentaires :
//   • Vue Tabulaire DV4 (par défaut) : grille monospace haute densité
//     (`Pt | Code | Set | Score | Rot | Zones/Coords | Timecode | Statut`)
//     avec barre de filtres rapides (Équipe, Geste S/R/E/A/B/D/F, Anomalies, AUTO)
//     + badges d'actions générées automatiquement (`AUTO`) et coordonnées 100×100.
//   • Vue Accordéon par Point : repli/dépli point par point.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Check, ChevronDown, ChevronRight, Clock, Trash, X } from './icons';
import { formatTimecode, validateAction, DV_ACTION_KEYS } from '../utils/datavolley';
import { handleCodeFieldKeyDown } from '../utils/keyboardRemap';
import useCodingKeyboard from '../hooks/useCodingKeyboard';
import {
  ACCORDION_CLOSED,
  accordionReduce,
  autoOpenPoint,
  isPointOpen,
  issuesByUid,
} from '../utils/codingTools';

export default function DvCodeList({
  rallies,
  mode = 'saisie',
  activeIndex = null,
  onSeek,
  onSeekPoint,
  issues = [],
  editable = false,
  selectedUid = null,
  onSelect,
  onTimeShift,
  onSetTime,
  onRemove,
  onMove,
  actionSet,
  emptyText = 'Aucune action. Un point commence par un service (S).',
  autoScroll = true,
  follow = true,
  onFollowChange,
  directionMissing = 0,
  onDirectionMissing,
  onEditCode,
  matchState = null,
}) {
  const list = rallies || [];
  const issueMap = useMemo(() => issuesByUid(issues), [issues]);
  const containerRef = useRef(null);
  // Clavier commun à tous les modes de codage (remapping + raccourcis).
  const { shortcuts, keymapProfile } = useCodingKeyboard();
  const [accordion, setAccordion] = useState(ACCORDION_CLOSED);
  const [following, setFollowing] = useState(follow);
  const [viewStyle, setViewStyle] = useState(mode === 'consultation' ? 'accordion' : 'dv4'); // 'dv4' | 'accordion'
  const [skillFilter, setSkillFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [onlyIssues, setOnlyIssues] = useState(false);

  useEffect(() => {
    setFollowing(follow);
  }, [follow]);

  const activePointNumber = useMemo(() => {
    if (activeIndex == null) return null;
    const r = list.find((x) => (x.actions || []).some((a) => a.action_index === activeIndex));
    return r ? r.pointNumber : null;
  }, [list, activeIndex]);

  const selectedPointNumber = useMemo(() => {
    if (!selectedUid) return null;
    const r = list.find((x) => (x.actions || []).some((a) => a.uid === selectedUid));
    return r ? r.pointNumber : null;
  }, [list, selectedUid]);

  const lastPointNumber = list.length ? list[list.length - 1].pointNumber : null;

  useEffect(() => {
    const target = autoOpenPoint(mode, { activePointNumber, selectedPointNumber, lastPointNumber });
    setAccordion((prev) => accordionReduce(prev, { type: 'auto', pointNumber: target, follow: following }));
  }, [mode, activePointNumber, selectedPointNumber, lastPointNumber, following]);

  useEffect(() => {
    if (!autoScroll || !following || activePointNumber == null || !containerRef.current) return;
    const node = containerRef.current.querySelector(`[data-point="${activePointNumber}"]`);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }, [activePointNumber, autoScroll, following, accordion, viewStyle]);

  const severityOf = (uid) => {
    const found = issueMap.get(uid);
    if (!found || !found.length) return '';
    return found.some((i) => i.severity === 'error') ? 'error' : 'warning';
  };

  const toggleHeader = (rally) => {
    const wasOpen = isPointOpen(accordion, rally.pointNumber);
    setAccordion((prev) => accordionReduce(prev, { type: 'toggle', pointNumber: rally.pointNumber }));
    if (!wasOpen && (mode === 'consultation' || mode === 'analyse')) onSeekPoint?.(rally);
  };

  const toggleFollow = () => {
    const next = !following;
    setFollowing(next);
    onFollowChange?.(next);
  };

  const [editingUid, setEditingUid] = useState(null);
  const [draftCode, setDraftCode] = useState('');
  const [editError, setEditError] = useState('');
  const canEdit = typeof onEditCode === 'function';

  useEffect(() => {
    if (editingUid == null) return;
    const exists = list.some((r) => (r.actions || []).some((a) => a.uid === editingUid));
    if (!exists) {
      setEditingUid(null);
      setDraftCode('');
      setEditError('');
    }
  }, [list, editingUid]);

  const startEdit = (action) => {
    if (!canEdit || !action?.uid) return;
    setEditingUid(action.uid);
    setDraftCode(action.code);
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingUid(null);
    setDraftCode('');
    setEditError('');
  };

  const saveEdit = (action) => {
    const code = draftCode.replace(/\s+/g, '').trim();
    const check = validateAction(code);
    if (!check.valid) {
      setEditError(check.labels || 'Code incomplet ou invalide.');
      return;
    }
    onEditCode(action, code);
    cancelEdit();
  };

  // Index des snapshots par pointNumber pour afficher Score et Rotation dans la grille DV4
  const stateByPoint = useMemo(() => {
    const map = new Map();
    for (const st of matchState?.states || []) {
      map.set(Number(st.pointNumber), st);
    }
    return map;
  }, [matchState]);

  // Liste aplatie filtrée pour la vue tabulaire DV4
  const flatRows = useMemo(() => {
    const rows = [];
    for (const r of list) {
      const snap = stateByPoint.get(Number(r.pointNumber));
      const setNum = actionSet ? actionSet(r.actions?.[0]) : (r.actions?.[0]?.set_number ?? snap?.setNumber ?? 1);
      const scoreTxt = snap?.scoreBefore ? `${snap.scoreBefore.team1}-${snap.scoreBefore.team2}` : '—';
      for (const a of r.actions || []) {
        const sev = severityOf(a.uid);
        if (teamFilter !== 'all' && a.team !== teamFilter) continue;
        if (skillFilter !== 'all' && a.action !== skillFilter) continue;
        if (onlyIssues && !sev) continue;
        const setterPos = a.team === 'away' ? snap?.awaySetterPos : snap?.homeSetterPos;
        rows.push({
          rally: r,
          action: a,
          pointNumber: r.pointNumber,
          setNum,
          scoreTxt,
          setterPos: setterPos || '—',
          severity: sev,
          issueLabels: (issueMap.get(a.uid) || []).map((i) => i.label),
          isActivePoint: r.pointNumber === activePointNumber,
          isActiveAction: a.action_index === activeIndex,
        });
      }
    }
    return rows;
  }, [list, stateByPoint, actionSet, teamFilter, skillFilter, onlyIssues, issueMap, activePointNumber, activeIndex]);

  return (
    <div className="dvc" ref={containerRef}>
      {/* Barre de filtres rapides et sélecteur de vue DataVolley 4 */}
      {list.length > 0 && (
        <div
          className="dvc-filter-bar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(15,23,42,0.45)',
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="dv-seg" style={{ display: 'inline-flex' }}>
              <button
                type="button"
                className={viewStyle === 'dv4' ? 'active' : ''}
                onClick={() => setViewStyle('dv4')}
                title="Grille tabulaire monospace DataVolley 4"
              >
                Grille DV4
              </button>
              <button
                type="button"
                className={viewStyle === 'accordion' ? 'active' : ''}
                onClick={() => setViewStyle('accordion')}
                title="Vue par point repliable"
              >
                Par point
              </button>
            </div>

            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11 }}
              aria-label="Filtrer par équipe"
            >
              <option value="all">Équipes: Toutes</option>
              <option value="home">* Domicile</option>
              <option value="away">a Extérieur</option>
            </select>

            <select
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11 }}
              aria-label="Filtrer par geste"
            >
              <option value="all">Geste: Tous</option>
              {DV_ACTION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
              />
              Anomalies ({issues.length})
            </label>
          </div>
        </div>
      )}

      {list.length === 0 && <p className="dv-empty">{emptyText}</p>}

      {/* VUE 1 : GRILLE TABULAIRE MONOSPACE DATAVOLLEY 4 (Point 25) */}
      {list.length > 0 && viewStyle === 'dv4' && (
        <div className="dvc-dv4-grid-wrap" style={{ overflowX: 'auto' }}>
          <table className="dv-table dvc-dv4-table" style={{ width: '100%', fontSize: 12, fontFamily: 'monospace' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 6px' }}>Pt</th>
                <th style={{ padding: '4px 6px' }}>Code DV4</th>
                <th style={{ padding: '4px 6px' }}>Set</th>
                <th style={{ padding: '4px 6px' }}>Score</th>
                <th style={{ padding: '4px 6px' }}>Rot</th>
                <th style={{ padding: '4px 6px' }}>Zones/XY</th>
                <th style={{ padding: '4px 6px' }}>Temps</th>
                <th style={{ padding: '4px 6px' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map(({ rally, action: a, pointNumber, setNum, scoreTxt, setterPos, severity, issueLabels, isActivePoint, isActiveAction }) => {
                const isSelected = editable && a.uid === selectedUid;
                const isEditing = canEdit && a.uid === editingUid;
                const zoneTxt =
                  a.start_zone || a.end_zone
                    ? `${a.start_zone || '?'}→${a.end_zone || '?'}${a.end_subzone || ''}`
                    : '—';
                const hasXY = a.start_x != null && a.end_x != null;

                return (
                  <tr
                    key={a.uid || a.action_index}
                    data-point={pointNumber}
                    className={`dvc-dv4-row ${severity} ${isSelected ? 'selected' : ''} ${isActiveAction || isActivePoint ? 'active' : ''}`}
                    style={{
                      cursor: 'pointer',
                      background: isSelected
                        ? 'rgba(249,115,22,0.22)'
                        : isActiveAction
                        ? 'rgba(56,189,248,0.18)'
                        : severity === 'error'
                        ? 'rgba(239,68,68,0.12)'
                        : severity === 'warning'
                        ? 'rgba(245,158,11,0.10)'
                        : undefined,
                    }}
                    onClick={() => {
                      if (editable && onSelect) onSelect(a);
                      if (onSeek) onSeek(a);
                    }}
                    onDoubleClick={(e) => {
                      if (!canEdit) return;
                      e.preventDefault();
                      e.stopPropagation();
                      startEdit(a);
                    }}
                  >
                    <td style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>#{pointNumber}</td>
                    <td style={{ padding: '4px 6px', fontWeight: 700 }}>
                      {isEditing ? (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            className="dvc-edit-input"
                            value={draftCode}
                            autoFocus
                            spellCheck={false}
                            onChange={(e) => setDraftCode(e.target.value)}
                            onKeyDown={(e) => {
                              handleCodeFieldKeyDown(e, {
                                value: draftCode,
                                onChange: setDraftCode,
                                onSubmit: () => saveEdit(a),
                                onCancel: cancelEdit,
                                profile: keymapProfile,
                                shortcuts,
                              });
                            }}
                            style={{ width: 105, padding: '2px 4px', fontFamily: 'monospace' }}
                          />
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(a)}>
                            <Check size={11} />
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                            <X size={11} />
                          </button>
                        </span>
                      ) : (
                        <span style={{ color: a.team === 'away' ? '#fb923c' : '#38bdf8' }}>
                          {a.code}
                          {Boolean(a.is_auto) && (
                            <span
                              className="badge"
                              style={{ marginLeft: 5, fontSize: 9, padding: '1px 4px', background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}
                              title="Code généré automatiquement (Compound Code)"
                            >
                              AUTO
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '4px 6px' }}>S{setNum || 1}</td>
                    <td style={{ padding: '4px 6px' }}>{scoreTxt}</td>
                    <td style={{ padding: '4px 6px' }}>{setterPos}</td>
                    <td style={{ padding: '4px 6px', fontSize: 11 }}>
                      {zoneTxt}
                      {hasXY && (
                        <span style={{ color: '#38bdf8', marginLeft: 4 }} title={`XY: ${a.start_x},${a.start_y} → ${a.end_x},${a.end_y}`}>
                          ⌖
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '4px 6px' }}>{formatTimecode(a.timecode)}</td>
                    <td style={{ padding: '4px 6px' }}>
                      {severity ? (
                        <span className={`dvc-flag ${severity}`} title={issueLabels.join(' · ')} style={{ color: severity === 'error' ? '#f87171' : '#fbbf24' }}>
                          <AlertTriangle size={12} />
                        </span>
                      ) : (
                        <span style={{ color: '#4ade80' }}>✓</span>
                      )}
                      {isSelected && editable && (
                        <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTimeShift?.(a, -0.5)}>-0.5</button>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onSetTime?.(a)}>=vid</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTimeShift?.(a, 0.5)}>+0.5</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove?.(a)}><Trash size={11} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editError && <p className="dvc-edit-error" style={{ padding: '4px 8px' }}>{editError}</p>}
        </div>
      )}

      {/* VUE 2 : VUE ACCORDÉON PAR POINT (Compatibilité existante) */}
      {list.length > 0 && viewStyle === 'accordion' && list.map((r) => {
        const actions = r.actions || [];
        const set = actionSet ? actionSet(actions[0]) : actions[0]?.set_number;
        const isActive = r.pointNumber === activePointNumber;
        const opened = isPointOpen(accordion, r.pointNumber);
        const anomalyCount = actions.reduce((n, a) => n + (issueMap.get(a.uid)?.length || 0), 0);
        const severity = actions.some((a) => severityOf(a.uid) === 'error')
          ? 'error'
          : anomalyCount
          ? 'warning'
          : '';
        return (
          <div key={r.pointNumber} data-point={r.pointNumber} className={`dvc-point ${isActive ? 'active' : ''}`}>
            <button
              type="button"
              className={`dvc-head ${opened ? 'open' : ''}`}
              aria-expanded={opened}
              onClick={() => toggleHeader(r)}
              title={opened ? 'Replier le point' : 'Déplier le point'}
            >
              {opened ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="dvc-point-num">Point {r.pointNumber}</span>
              {set != null && <span className="dvc-set">set {set}</span>}
              <span className="dvc-time">
                <Clock size={10} /> {formatTimecode(actions[0]?.timecode)}
              </span>
              <span className="dvc-actions-count">
                {actions.length} action{actions.length > 1 ? 's' : ''}
              </span>
              {r.winner && <span className={`dvc-win ${r.winner}`}>{r.winner === 'team1' ? '1' : '2'}</span>}
              {anomalyCount > 0 ? (
                <span className={`dvc-badge ${severity}`} title={`${anomalyCount} anomalie(s) sur ce point`}>
                  <AlertTriangle size={10} /> {anomalyCount}
                </span>
              ) : (
                <span className="dvc-badge ok" title="Aucune anomalie">
                  <Check size={10} />
                </span>
              )}
            </button>
            {opened && (
              <div className="dvc-rows">
                {actions.map((a) => (
                  <CodeRow
                    key={a.uid || a.action_index}
                    action={a}
                    severity={severityOf(a.uid)}
                    labels={(issueMap.get(a.uid) || []).map((i) => i.label)}
                    editable={editable}
                    selected={editable && a.uid === selectedUid}
                    onSelect={onSelect}
                    onSeek={onSeek}
                    onTimeShift={onTimeShift}
                    onSetTime={onSetTime}
                    onRemove={onRemove}
                    onMove={onMove}
                    canEdit={canEdit}
                    editing={canEdit && a.uid === editingUid}
                    draftCode={draftCode}
                    editError={editError}
                    onEditStart={() => startEdit(a)}
                    onDraftChange={setDraftCode}
                    onEditSave={() => saveEdit(a)}
                    onEditCancel={cancelEdit}
                    shortcuts={shortcuts}
                    keymapProfile={keymapProfile}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {list.length > 0 && (
        <div className="dvc-tools dvc-toolbar">
          {viewStyle === 'accordion' && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAccordion((prev) => accordionReduce(prev, { type: 'collapseAll' }))}
                title="Replier tous les points"
              >
                Tout replier
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAccordion((prev) => accordionReduce(prev, { type: 'expandAll' }))}
                title="Déplier tous les points"
              >
                Tout déplier
              </button>
            </>
          )}
          <span className="dvc-count">
            {list.length} point{list.length > 1 ? 's' : ''} · {issues.length} anomalie{issues.length > 1 ? 's' : ''}
          </span>
          {canEdit && <span className="dvc-edit-hint">Double-clic sur une action pour modifier</span>}
          {directionMissing > 0 && (
            <button
              type="button"
              className="dvc-missing"
              onClick={() => onDirectionMissing?.()}
              title="Aller à la première attaque sans direction"
            >
              <TargetIcon /> {directionMissing} attaque{directionMissing > 1 ? 's' : ''} sans direction
            </button>
          )}
          <label className="dvc-follow" title="Suit automatiquement le point en cours de lecture">
            <input type="checkbox" checked={following} onChange={toggleFollow} /> suivre la lecture
          </label>
        </div>
      )}
    </div>
  );
}

function TargetIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
  );
}

function CodeRow({
  action,
  severity,
  labels,
  editable,
  selected,
  onSelect,
  onSeek,
  onTimeShift,
  onSetTime,
  onRemove,
  onMove,
  canEdit = false,
  editing = false,
  draftCode = '',
  editError = '',
  onEditStart,
  onDraftChange,
  onEditSave,
  onEditCancel,
  // Réglages clavier communs (fournis par DvCodeList : un seul abonnement pour
  // toute la liste, plutôt qu'un par ligne).
  shortcuts = null,
  keymapProfile = null,
}) {
  if (editing) {
    return (
      <div className={`dvc-row editing ${severity}`}>
        <div className="dvc-edit">
          <span className="dvc-tc">{formatTimecode(action.timecode)}</span>
          <input
            className="dvc-edit-input"
            value={draftCode}
            autoFocus
            spellCheck={false}
            aria-label={`Modifier le code ${action.code}`}
            onChange={(e) => onDraftChange?.(e.target.value)}
            onKeyDown={(e) => {
              handleCodeFieldKeyDown(e, {
                value: draftCode,
                onChange: (next) => onDraftChange?.(next),
                onSubmit: () => onEditSave?.(),
                onCancel: () => onEditCancel?.(),
                profile: keymapProfile,
                shortcuts,
              });
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onEditSave?.()} title="Valider le code (Entrée)">
            <Check size={12} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditCancel?.()} title="Annuler (Échap)">
            <X size={12} />
          </button>
        </div>
        {editError && <p className="dvc-edit-error">{editError}</p>}
      </div>
    );
  }
  return (
    <div className={`dvc-row ${severity} ${selected ? 'selected' : ''}`}>
      <button
        type="button"
        className="dvc-code"
        onClick={() => {
          if (editable && onSelect) onSelect(action);
          if (onSeek) onSeek(action);
        }}
        onDoubleClick={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          e.stopPropagation();
          onEditStart?.();
        }}
        title={`${action.code} — aller à ${formatTimecode(action.timecode)}${
          canEdit ? ' · double-clic pour modifier le code' : ''
        }`}
      >
        <span className="dvc-tc">{formatTimecode(action.timecode)}</span>
        <span className="dvc-team">{action.team === 'away' ? 'a' : '*'}</span>
        <span className="dvc-txt">
          {action.code}
          {Boolean(action.is_auto) && (
            <span className="badge" style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>
              AUTO
            </span>
          )}
        </span>
        {severity && (
          <span className="dvc-flag" title={labels.join(' · ')}>
            <AlertTriangle size={11} />
          </span>
        )}
      </button>
      {selected && editable && (
        <div className="dvc-tools">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTimeShift?.(action, -1)} title="Reculer d’une seconde">−1 s</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTimeShift?.(action, -0.1)} title="Reculer d’un dixième">−0,1</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onSetTime?.(action)} title="Prendre la position actuelle de la vidéo">= vidéo</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTimeShift?.(action, 0.1)} title="Avancer d’un dixième">+0,1</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTimeShift?.(action, 1)} title="Avancer d’une seconde">+1 s</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove?.(action, -1)} title="Monter l’action d’un cran"><ArrowDownUp size={12} /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove?.(action, 1)} title="Descendre l’action d’un cran"><ArrowDownUp size={12} /></button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove?.(action)} title="Supprimer cette action"><Trash size={12} /></button>
        </div>
      )}
    </div>
  );
}
