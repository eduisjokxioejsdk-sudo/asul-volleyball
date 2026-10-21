// ============================================================================
// MODE CORRECTION — caler la vidéo, réparer les codes, compléter le match.
// À gauche : la vidéo et les outils de synchronisation (calage sur le premier
// service). À droite : les anomalies relevées puis le déroulé modifiable.
// ============================================================================

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, Crosshair, Settings, Target } from './icons';
import DvCodeList from './DvCodeList';
import AttackDirectionCourt from './AttackDirectionCourt';
import { DV_ACTIONS, formatTimecode } from '../utils/datavolley';
import { codeIssues, countIssuesByType, filterIssues, nextIssue } from '../utils/codingTools';

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
  onDirection,
  directionMissing = 0,
  onDirectionMissing,
  onTimeShift,
  onSetTime,
  onRemove,
  onMove,
  roster,
  disabled = false,
  selectedUid = null,
  onSelect,
  actionSet,
  onEditCode,
  team1 = 'Domicile',
  team2 = 'Extérieur',
}) {
  const [reviewSkill, setReviewSkill] = useState('A');
  const [reviewIndex, setReviewIndex] = useState(0);
  // Filtre des anomalies : erreurs / avertissements / tout.
  const [severity, setSeverity] = useState('all');

  const issueList = useMemo(
    () => issues || codeIssues(actions, { roster, requireTimecode: false, enriched: true }),
    [issues, actions, roster]
  );
  const errors = issueList.filter((i) => i.severity === 'error').length;
  const warnings = issueList.length - errors;
  const visibleIssues = useMemo(() => filterIssues(issueList, severity), [issueList, severity]);
  const issueCounts = useMemo(() => countIssuesByType(issueList), [issueList]);

  // Parcours « compléter un match » : les actions de la compétence choisie,
  // une par une, pour ajouter la zone en cliquant le terrain.
  const reviewList = useMemo(() => (actions || []).filter((a) => a.action === reviewSkill), [actions, reviewSkill]);
  const current = reviewList[Math.min(reviewIndex, Math.max(0, reviewList.length - 1))] || null;
  // Action dont on édite la direction : celle sélectionnée dans la liste, sinon
  // l'action en cours du parcours « Compléter un match ».
  const directionAction = useMemo(
    () => (actions || []).find((a) => a.uid === selectedUid) || current || null,
    [actions, selectedUid, current]
  );
  // Attaques précédentes du même joueur : uniquement les trajectoires.
  const directionHistory = useMemo(() => {
    if (!directionAction) return [];
    return (actions || [])
      .filter(
        (a) =>
          a?.action === 'A' &&
          a.team === directionAction.team &&
          Number(a.player_number) === Number(directionAction.player_number) &&
          a.uid !== directionAction.uid &&
          a.start_zone &&
          a.end_zone
      )
      .map((a) => ({ start: String(a.start_zone), end: String(a.end_zone) }));
  }, [actions, directionAction]);

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
        <IssuePanel
          issueList={visibleIssues}
          allIssues={issueList}
          errors={errors}
          warnings={warnings}
          counts={issueCounts}
          severity={severity}
          onSeverity={setSeverity}
          actions={actions}
          onSeekAction={onSeekAction}
          current={current}
        />
        {directionAction && (
          <div className="dvx-direction">
            <h5>
              Direction de l’action <code>{directionAction.code}</code>
            </h5>
            <AttackDirectionCourt
              key={directionAction.uid}
              side={directionAction.team === 'away' ? 'away' : 'home'}
              startZone={directionAction.start_zone}
              endZone={directionAction.end_zone}
              history={directionHistory}
              playerLabel={`n°${String(directionAction.player_number || 0).padStart(2, '0')}`}
              teamName={directionAction.team === 'away' ? team2 : team1}
              opponentName={directionAction.team === 'away' ? team1 : team2}
              disabled={disabled}
              onChange={({ start, end }) => onDirection?.(directionAction, start, end)}
            />
          </div>
        )}
        <DvCodeList
          rallies={rallies}
          mode="correction"
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
          directionMissing={directionMissing}
          onDirectionMissing={onDirectionMissing}
          onEditCode={onEditCode}
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
function IssuePanel({
  issueList,
  allIssues = issueList,
  errors,
  warnings,
  counts = {},
  severity = 'all',
  onSeverity,
  actions,
  onSeekAction,
  current,
}) {
  const types = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const labelOf = (key) => (allIssues || []).find((i) => i.issue === key)?.label || key;
  return (
    <div className={`dvx-issues ${errors ? 'has-errors' : warnings ? 'has-warnings' : 'clean'}`}>
      <h5 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {allIssues.length ? <AlertTriangle size={14} /> : <Check size={14} />} Contrôle des codes
      </h5>
      <p className="dvx-issue-count">
        {allIssues.length === 0
          ? 'Aucune anomalie relevée : le codage est cohérent.'
          : `${errors} erreur(s) · ${warnings} avertissement(s)`}
      </p>
      {allIssues.length > 0 && (
        <div className="dvx-issue-filter">
          {[
            ['all', 'Tout', allIssues.length],
            ['error', 'Erreurs', errors],
            ['warning', 'Avertissements', warnings],
          ].map(([key, label, total]) => (
            <button
              key={key}
              type="button"
              className={`dvm-btn dvm-mini ${severity === key ? 'active' : ''}`}
              onClick={() => onSeverity?.(key)}
              aria-pressed={severity === key}
            >
              {label} ({total})
            </button>
          ))}
        </div>
      )}
      {types.length > 0 && (
        <div className="dvx-issue-types">
          {types.map(([key, total]) => (
            <span key={key} className="dvx-issue-type" title={labelOf(key)}>
              {labelOf(key)} · {total}
            </span>
          ))}
        </div>
      )}
      {allIssues.length > 0 && issueList.length === 0 && (
        <p className="dv-hint">Aucune anomalie pour ce filtre.</p>
      )}
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

