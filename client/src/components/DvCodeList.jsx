// ============================================================================
// LISTE DES CODES — colonne de droite de l'écran de codage (façon DataVolley).
// Sert dans les trois modes :
//   • Saisie        : déroulé en direct (lecture seule, surlignage du point lu) ;
//   • Consultation  : liste cliquable, un clic amène la vidéo sur l'action ;
//   • Correction    : liste modifiable (temps vidéo, déplacement, suppression)
//                     avec le repérage des codes incohérents.
// ============================================================================

import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, ArrowDownUp, Clock, Trash } from './icons';
import { formatTimecode } from '../utils/datavolley';
import { issuesByUid } from '../utils/codingTools';

/**
 * @param {Object} props
 * @param {Array} props.rallies - points (groupActionsIntoRallies)
 * @param {number} [props.activeIndex] - action_index du point en cours de lecture
 * @param {Function} [props.onSeek] - (action) => void
 * @param {Array} [props.issues] - anomalies (codeIssues)
 * @param {boolean} [props.editable] - active les commandes de correction
 * @param {string} [props.selectedUid]
 * @param {Function} [props.onSelect] - (action) => void
 * @param {Function} [props.onTimeShift] - (action, delta) => void
 * @param {Function} [props.onSetTime] - (action) => void (temps = position vidéo)
 * @param {Function} [props.onRemove] - (action) => void
 * @param {Function} [props.onMove] - (action, dir) => void
 * @param {Function} [props.actionSet] - (action) => numéro de set
 * @param {string} [props.emptyText]
 * @param {boolean} [props.autoScroll] - suit le point en cours de lecture
 */
export default function DvCodeList({
  rallies,
  activeIndex = null,
  onSeek,
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
}) {
  const list = rallies || [];
  const issueMap = useMemo(() => issuesByUid(issues), [issues]);
  const containerRef = useRef(null);

  // Le point en cours de lecture reste visible.
  const activePointNumber = useMemo(() => {
    if (activeIndex == null) return null;
    const r = list.find((x) => (x.actions || []).some((a) => a.action_index === activeIndex));
    return r ? r.pointNumber : null;
  }, [list, activeIndex]);

  useEffect(() => {
    if (!autoScroll || activePointNumber == null || !containerRef.current) return;
    const node = containerRef.current.querySelector(`[data-point="${activePointNumber}"]`);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }, [activePointNumber, autoScroll]);

  const severityOf = (uid) => {
    const found = issueMap.get(uid);
    if (!found || !found.length) return '';
    return found.some((i) => i.severity === 'error') ? 'error' : 'warning';
  };

  return (
    <div className="dvc" ref={containerRef}>
      {list.length === 0 && <p className="dv-empty">{emptyText}</p>}
      {list.map((r) => {
        const actions = r.actions || [];
        const set = actionSet ? actionSet(actions[0]) : actions[0]?.set_number;
        const isActive = r.pointNumber === activePointNumber;
        return (
          <div key={r.pointNumber} data-point={r.pointNumber} className={`dvc-point ${isActive ? 'active' : ''}`}>
            <div className="dvc-head">
              <span className="dvc-point-num">Point {r.pointNumber}</span>
              {set != null && <span className="dvc-set">set {set}</span>}
              <span className="dvc-time">
                <Clock size={10} /> {formatTimecode(actions[0]?.timecode)}
              </span>
              {r.winner && <span className={`dvc-win ${r.winner}`}>{r.winner === 'team1' ? '1' : '2'}</span>}
            </div>
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
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Une ligne de code : bouton « temps + code » et, en correction, ses outils. */
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
}) {
  return (
    <div className={`dvc-row ${severity} ${selected ? 'selected' : ''}`}>
      <button
        type="button"
        className="dvc-code"
        onClick={() => {
          if (editable && onSelect) onSelect(action);
          if (onSeek) onSeek(action);
        }}
        title={`${action.code} — aller à ${formatTimecode(action.timecode)}`}
      >
        <span className="dvc-tc">{formatTimecode(action.timecode)}</span>
        <span className="dvc-team">{action.team === 'away' ? 'a' : '*'}</span>
        <span className="dvc-txt">{action.code}</span>
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

