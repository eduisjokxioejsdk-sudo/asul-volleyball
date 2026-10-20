//============================================================================
// LISTE DES CODES — colonne de droite de l'écran de codage (façon DataVolley).
// Sert dans les trois modes :
//   • Saisie        : déroulé en direct (lecture seule, surlignage du point lu) ;
//   • Consultation  : liste cliquable, un clic amène la vidéo sur l'action ;
//   • Correction    : liste modifiable (temps vidéo, déplacement, suppression)
//                     avec le repérage des codes incohérents.
//
// Depuis la 3.1.0, chaque point est une ligne repliable (accordéon strict : un
// seul point ouvert à la fois). L'en-tête reste visible replié et porte le
// résumé (« Point 12 · set 2 · 0:42.5 · 3 actions · ✓/anomalie »).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Check, ChevronDown, ChevronRight, Clock, Trash } from './icons';
import { formatTimecode } from '../utils/datavolley';
import {
  ACCORDION_CLOSED,
  accordionReduce,
  autoOpenPoint,
  isPointOpen,
  issuesByUid,
} from '../utils/codingTools';

/**
 * @param {Object} props
 * @param {Array} props.rallies - points (groupActionsIntoRallies)
 * @param {'saisie'|'consultation'|'correction'|'analyse'} [props.mode]
 * @param {number} [props.activeIndex] - action_index du point en cours de lecture
 * @param {Function} [props.onSeek] - (action) => void
 * @param {Function} [props.onSeekPoint] - (rally) => void (début du point)
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
 * @param {boolean} [props.follow] - interrupteur « suivre la lecture »
 * @param {Function} [props.onFollowChange] - (value) => void
 * @param {number} [props.directionMissing] - attaques sans direction
 * @param {Function} [props.onDirectionMissing] - clic sur le compteur
 */
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
}) {
  const list = rallies || [];
  const issueMap = useMemo(() => issuesByUid(issues), [issues]);
  const containerRef = useRef(null);
  const [accordion, setAccordion] = useState(ACCORDION_CLOSED);
  const [following, setFollowing] = useState(follow);

  useEffect(() => {
    setFollowing(follow);
  }, [follow]);

  // Le point en cours de lecture reste visible.
  const activePointNumber = useMemo(() => {
    if (activeIndex == null) return null;
    const r = list.find((x) => (x.actions || []).some((a) => a.action_index === activeIndex));
    return r ? r.pointNumber : null;
  }, [list, activeIndex]);

  // Point de l'action sélectionnée (mode Correction).
  const selectedPointNumber = useMemo(() => {
    if (!selectedUid) return null;
    const r = list.find((x) => (x.actions || []).some((a) => a.uid === selectedUid));
    return r ? r.pointNumber : null;
  }, [list, selectedUid]);

  const lastPointNumber = list.length ? list[list.length - 1].pointNumber : null;

  // Ouverture automatique : Consultation → point lu, Correction → action
  // sélectionnée, Saisie → dernier point codé.
  useEffect(() => {
    const target = autoOpenPoint(mode, { activePointNumber, selectedPointNumber, lastPointNumber });
    setAccordion((prev) => accordionReduce(prev, { type: 'auto', pointNumber: target, follow: following }));
  }, [mode, activePointNumber, selectedPointNumber, lastPointNumber, following]);

  // Le point lu reste visible dans la zone de défilement de la liste.
  useEffect(() => {
    if (!autoScroll || !following || activePointNumber == null || !containerRef.current) return;
    const node = containerRef.current.querySelector(`[data-point="${activePointNumber}"]`);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }, [activePointNumber, autoScroll, following, accordion]);

  const severityOf = (uid) => {
    const found = issueMap.get(uid);
    if (!found || !found.length) return '';
    return found.some((i) => i.severity === 'error') ? 'error' : 'warning';
  };

  const toggleHeader = (rally) => {
    const wasOpen = isPointOpen(accordion, rally.pointNumber);
    setAccordion((prev) => accordionReduce(prev, { type: 'toggle', pointNumber: rally.pointNumber }));
    // Ouvrir un point place la vidéo à son début (Consultation / Analyse) ;
    // en Correction, la vidéo ne bouge pas (on garde l'image à corriger).
    if (!wasOpen && (mode === 'consultation' || mode === 'analyse')) onSeekPoint?.(rally);
  };

  const toggleFollow = () => {
    const next = !following;
    setFollowing(next);
    onFollowChange?.(next);
  };

  return (
    <div className="dvc" ref={containerRef}>
      {list.length === 0 && <p className="dv-empty">{emptyText}</p>}
      {list.map((r) => {
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
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {list.length > 0 && (
        <div className="dvc-tools dvc-toolbar">
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
          <span className="dvc-count">
            {list.length} point{list.length > 1 ? 's' : ''} · {issues.length} anomalie{issues.length > 1 ? 's' : ''}
          </span>
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
          <label className="dvc-follow" title="Ouvre automatiquement le point en cours de lecture">
            <input type="checkbox" checked={following} onChange={toggleFollow} /> suivre la lecture
          </label>
        </div>
      )}
    </div>
  );
}

/** Petite cible dessinée en SVG (aucune dépendance supplémentaire). */
function TargetIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
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

