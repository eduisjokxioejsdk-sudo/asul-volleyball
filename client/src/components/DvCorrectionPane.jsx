// ============================================================================
// MODE CORRECTION — caler la vidéo, réparer les codes, compléter le match.
// À gauche : la vidéo et les outils de synchronisation (calage sur le premier
// service). À droite : les anomalies relevées puis le déroulé modifiable.
// ============================================================================

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, Crosshair, Settings, Target } from './icons';
import DvCodeList from './DvCodeList';
import { DV_ACTIONS, formatTimecode } from '../utils/datavolley';
import { codeIssues, nextIssue } from '../utils/codingTools';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.videoNode
 * @param {Array} props.actions
 * @param {Array} props.rallies
 * @param {Array} [props.issues] - anomalies (codeIssues) ; recalculées si absentes
 * @param {Object} props.sync
 * @param {number} props.videoTime - position courante de la vidéo
 * @param {Function} props.onAnchorHere - () => void (caler sur le premier service)
 * @param {Function} props.onSyncPatch - (patch) => void (marges, fenêtre de synchronisation)
 * @param {Function} props.onSeekAction - (action) => void
 * @param {Function} props.onPickZone - (action) => void (compléter la zone d'attaque)
 * @param {Function} [props.onTimeShift] / [props.onSetTime] / [props.onRemove] / [props.onMove]
 * @param {Object} [props.roster] - { home: [numéros], away: [numéros] } pour le contrôle
 * @param {boolean} [props.disabled]
 * @param {string} [props.selectedUid]
 * @param {Function} [props.onSelect]
 * @param {Function} [props.actionSet]
 */
export default function DvCorrectionPane({
  videoNode,
  actions,
  rallies,
  issues,
  sync = {},
  videoTime = 0,
  onAnchorHere,
  onSyncPatch,
  onSeekAction,
  onPickZone,
  onTimeShift,
  onSetTime,
  onRemove,
  onMove,
  roster,
  disabled = false,
  selectedUid = null,
  onSelect,
  actionSet,
}) {
  const [reviewSkill, setReviewSkill] = useState('A');
  const [reviewIndex, setReviewIndex] = useState(0);

  const issueList = useMemo(
    () => issues || codeIssues(actions, { roster, requireTimecode: false }),
    [issues, actions, roster]
  );
  const errors = issueList.filter((i) => i.severity === 'error').length;
  const warnings = issueList.length - errors;

  // Parcours « compléter un match » : les actions de la compétence choisie,
  // une par une, pour ajouter la zone en cliquant le terrain.
  const reviewList = useMemo(() => (actions || []).filter((a) => a.action === reviewSkill), [actions, reviewSkill]);
  const current = reviewList[Math.min(reviewIndex, Math.max(0, reviewList.length - 1))] || null;

  return (
    <div className="dvx-correct">
      <div className="dvx-main">
        <div className="dvx-stage">{videoNode}</div>
        <SyncTools
          sync={sync}
          videoTime={videoTime}
          disabled={disabled}
          onAnchorHere={onAnchorHere}
          onSyncPatch={onSyncPatch}
        />
        <ReviewTools
          reviewSkill={reviewSkill}
          setReviewSkill={(v) => {
            setReviewSkill(v);
            setReviewIndex(0);
          }}
          reviewIndex={reviewIndex}
          setReviewIndex={setReviewIndex}
          reviewList={reviewList}
          current={current}
          disabled={disabled}
          onSeekAction={onSeekAction}
          onPickZone={onPickZone}
        />
      </div>

      <aside className="dvx-side">
        <IssuePanel issueList={issueList} errors={errors} warnings={warnings} actions={actions} onSeekAction={onSeekAction} current={current} />
        <DvCodeList
          rallies={rallies}
          onSeek={onSeekAction}
          issues={issueList}
          editable
          selectedUid={selectedUid}
          onSelect={onSelect}
          onTimeShift={onTimeShift}
          onSetTime={onSetTime}
          onRemove={onRemove}
          onMove={onMove}
          actionSet={actionSet}
          autoScroll={false}
        />
      </aside>
    </div>
  );
}

/** Outils de calage : ancre sur le premier service, marges de lecture. */
function SyncTools({ sync, videoTime, disabled, onAnchorHere, onSyncPatch }) {
  return (
    <div className="dvx-sync">
      <h5 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Settings size={14} /> Calage de la vidéo
      </h5>
      <p className="dv-hint">
        Cherchez le premier service dans la vidéo, puis <strong>Caler ici</strong> : tout le match se recale d’un seul
        décalage.
      </p>
      <div className="dvx-sync-row">
        <button type="button" className="btn btn-primary btn-sm" onClick={onAnchorHere} disabled={disabled}>
          <Crosshair size={13} /> Caler ici (premier service)
        </button>
        <span className="dvx-offset" title="Décalage appliqué à tous les codes">
          <Clock size={12} /> décalage {Number(sync.sync_offset || 0).toFixed(2)} s · position {formatTimecode(videoTime)}
        </span>
      </div>
      <div className="dvx-sync-row">
        <label className="dvx-filter">
          <span>Marge avant le point (s)</span>
          <input
            type="number"
            step="0.5"
            min="0"
            value={sync.lead_in ?? 4}
            onChange={(e) => onSyncPatch?.({ lead_in: Number(e.target.value) })}
          />
        </label>
        <label className="dvx-filter">
          <span>Marge après le point (s)</span>
          <input
            type="number"
            step="0.5"
            min="0"
            value={sync.lead_out ?? 3}
            onChange={(e) => onSyncPatch?.({ lead_out: Number(e.target.value) })}
          />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSyncPatch?.({ open: true })}>
          Synchronisation…
        </button>
      </div>
    </div>
  );
}

/** Parcours d'une compétence pour compléter le match (zones manquantes). */
function ReviewTools({ reviewSkill, setReviewSkill, reviewIndex, setReviewIndex, reviewList, current, disabled, onSeekAction, onPickZone }) {
  return (
    <div className="dvx-review">
      <h5 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Target size={14} /> Compléter un match
      </h5>
      <p className="dv-hint">
        Reprenez une compétence action par action pour ajouter ce qui manque (la zone se saisit en cliquant le terrain).
      </p>
      <div className="dvx-sync-row">
        <label className="dvx-filter">
          <span>Compétence</span>
          <select value={reviewSkill} onChange={(e) => setReviewSkill(e.target.value)}>
            {DV_ACTIONS.map((a) => (
              <option key={a.code} value={a.code}>{a.label} ({a.code})</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))}
          disabled={reviewIndex <= 0}
          title="Action précédente"
        >
          ◀
        </button>
        <span className="dvx-review-count">
          {reviewList.length ? `${Math.min(reviewIndex + 1, reviewList.length)} / ${reviewList.length}` : 'aucune action'}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setReviewIndex(Math.min(reviewList.length - 1, reviewIndex + 1))}
          disabled={reviewIndex >= reviewList.length - 1}
          title="Action suivante"
        >
          ▶
        </button>
      </div>
      {current ? (
        <div className="dvx-review-current">
          <button type="button" className="dvc-code" onClick={() => onSeekAction?.(current)} title="Voir l’action">
            <span className="dvc-tc">{formatTimecode(current.timecode)}</span>
            <span className="dvc-txt">{current.code}</span>
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPickZone?.(current)} disabled={disabled}>
            <Target size={13} /> Choisir la zone
          </button>
        </div>
      ) : (
        <p className="dv-hint">Aucune action de cette compétence dans le match.</p>
      )}
    </div>
  );
}

/** Anomalies relevées dans le codage (contrôle façon DataVolley). */
function IssuePanel({ issueList, errors, warnings, actions, onSeekAction, current }) {
  return (
    <div className={`dvx-issues ${errors ? 'has-errors' : warnings ? 'has-warnings' : 'clean'}`}>
      <h5 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {issueList.length ? <AlertTriangle size={14} /> : <Check size={14} />} Contrôle des codes
      </h5>
      <p className="dvx-issue-count">
        {issueList.length === 0
          ? 'Aucune anomalie relevée : le codage est cohérent.'
          : `${errors} erreur(s) · ${warnings} avertissement(s)`}
      </p>
      {issueList.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const next = nextIssue(issueList, current?.action_index ?? -1);
              const a = next ? (actions || []).find((x) => x.uid === next.uid) : null;
              if (a) onSeekAction?.(a);
            }}
          >
            <AlertTriangle size={13} /> Code suivant à corriger
          </button>
          <ul className="dvx-issue-list">
            {issueList.slice(0, 40).map((it, i) => (
              <li key={`${it.uid}-${it.issue}-${i}`} className={it.severity}>
                <button
                  type="button"
                  onClick={() => {
                    const a = (actions || []).find((x) => x.uid === it.uid);
                    if (a) onSeekAction?.(a);
                  }}
                >
                  <code>{it.code || '—'}</code>
                  <span>{it.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

