// ============================================================================
// Liste des points/actions codés — « Actions codées » — partagée (vidéo + live).
// Les codes restent cliquables pour corriger la zone d'une action.
// ============================================================================

import { Fragment } from 'react';
import { Plus } from './icons';

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
 * @param {Function} [props.onAddToPlaylist] - (action) => void (ajout d'une action)
 * @param {Function} [props.onAddRallyToPlaylist] - (rallye) => void (ajout du point entier)
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
  onAddToPlaylist,
  onAddRallyToPlaylist,
  disabled,
}) {
  const list = rallies || [];

  const addBtnStyle = {
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    color: 'var(--text-muted)',
    borderRadius: 999,
    width: 18,
    height: 18,
    lineHeight: 1,
    padding: 0,
    cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

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
                  {onAddRallyToPlaylist && (
                    <button
                      type="button"
                      title="Ajouter tout le point à une playlist"
                      disabled={disabled}
                      onClick={() => onAddRallyToPlaylist(r)}
                      style={{ ...addBtnStyle, width: 'auto', padding: '0 6px', gap: 3, fontSize: 11 }}
                    >
                      <Plus size={11} /> Point
                    </button>
                  )}
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
                    {onAddToPlaylist && (
                      <button
                        type="button"
                        title="Ajouter cette action à une playlist"
                        disabled={disabled}
                        onClick={() => onAddToPlaylist(a)}
                        style={addBtnStyle}
                      >
                        <Plus size={11} />
                      </button>
                    )}
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
