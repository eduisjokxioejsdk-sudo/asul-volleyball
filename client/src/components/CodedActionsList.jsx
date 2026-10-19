// ============================================================================
// Liste des points/actions codés — « Actions codées » — partagée (vidéo + live).
// Les codes restent cliquables pour corriger la zone d'une action.
// ============================================================================

import { Fragment } from 'react';

/**
 * @param {Object} props
 * @param {string} props.title - titre de la section
 * @param {Array} props.rallies - rallyes (groupActionsIntoRallies)
 * @param {string} [props.emptyText]
 * @param {Function} props.headTitle - (rallye) => texte de la tête de point
 * @param {Function} props.headTime - (rallye) => texte du temps du point
 * @param {Function} props.itemKey - (rallye, action) => clé React
 * @param {Function} [props.itemClassFor] - (action) => classe du chip
 * @param {Function} [props.itemTitle] - (action) => infobulle du chip
 * @param {Function} props.onPickItem - (action) => void (correction de zone)
 * @param {boolean} [props.disabled]
 */
export default function CodedActionsList({
  title,
  rallies,
  emptyText = 'Aucune action. Un point commence par un service (S).',
  headTitle,
  headTime,
  itemKey,
  itemClassFor = () => '',
  itemTitle = () => '',
  onPickItem,
  disabled,
}) {
  const list = rallies || [];

  return (
    <>
      <h4 style={{ marginTop: 18 }}>{title}</h4>
      <div className="dv-actions-list">
        {list.length === 0 ? (
          <p className="dv-empty">{emptyText}</p>
        ) : (
          list.map((r) => (
            <div key={r.pointNumber ?? r.index} className="dv-rally">
              <div className="dv-rally-head">
                <span>{headTitle(r)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="dv-rally-time">{headTime(r)}</span>
                </span>
              </div>
              <div className="dv-rally-codes">
                {(r.actions || []).map((a) => (
                  <Fragment key={itemKey(r, a)}>
                    <span
                      className={`dv-chip ${itemClassFor(a)}`}
                      title={itemTitle(a)}
                      style={{ cursor: disabled ? 'default' : 'pointer' }}
                      onClick={disabled ? undefined : () => onPickItem?.(a)}
                      onKeyDown={disabled ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickItem?.(a); } }}
                      tabIndex={disabled ? undefined : 0}
                      role={disabled ? undefined : 'button'}
                    >
                      {a.code}
                    </span>
                  </Fragment>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
