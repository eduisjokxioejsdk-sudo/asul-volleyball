// ============================================================================
// Réglage des raccourcis clavier (onglet Paramètres) : liste des actions par
// groupe, capture de la nouvelle touche, détection des conflits et remise à
// zéro (globale ou par action).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  defaultShortcuts,
  findDuplicateKeys,
  formatKeyLabel,
  isActionForPage,
  keyFromEvent,
  normalizeKey,
} from '../utils/shortcuts';
import { AlertTriangle, Check, CircleHelp, Keyboard, RotateCcw, Target } from './icons';
import KeyboardRemapModal from './KeyboardRemapModal';

/**
 * @param {Object} props
 * @param {Object} props.shortcuts - { id: key }
 * @param {(next:Object)=>void} props.onChange
 * @param {boolean} [props.video] - affiche (ou non) les raccourcis vidéo
 * @param {'coding'|'trajectory'} [props.page] - écran concerné par les réglages
 */
export default function ShortcutSettings({ shortcuts, onChange, video = true, page = 'coding' }) {
  const [capturing, setCapturing] = useState(null);
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const timerRef = useRef(null);

  const defaults = defaultShortcuts();
  const actions = SHORTCUT_ACTIONS.filter((a) => isActionForPage(a, page) && (video || !a.video));
  const duplicates = findDuplicateKeys(shortcuts, actions);
  const duplicateIds = new Set(duplicates.flatMap((d) => d.ids));

  // Capture de la touche pressée.
  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && capturing !== 'clearBuffer') {
        setCapturing(null);
        return;
      }
      const key = keyFromEvent(e);
      if (!key) return;
      onChange({ ...shortcuts, [capturing]: key });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, onChange, shortcuts]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const setKey = (id, key) => onChange({ ...shortcuts, [id]: normalizeKey(key) });

  return (
    <div className="sc-settings">
      <p className="dv-hint">
        <CircleHelp size={13} /> Cliquez sur une touche puis appuyez sur la nouvelle combinaison. Les raccourcis sont
        enregistrés pour cet appareil.
      </p>

      {duplicates.length > 0 && (
        <p className="dv-hint sc-conflict">
          <AlertTriangle size={13} /> Touche utilisée deux fois :{' '}
          {duplicates.map((d) => `${formatKeyLabel(d.key)} → ${d.ids.map((id) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.label || id).join(' / ')}`).join(' · ')}
        </p>
      )}

      {SHORTCUT_GROUPS.map((group) => {
        const items = actions.filter((a) => a.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="sc-group">
            <h5>{group}</h5>
            <div className="sc-list">
              {items.map((a) => {
                const key = normalizeKey(shortcuts?.[a.id]) || defaults[a.id];
                const isDefault = key === defaults[a.id];
                const isConflict = duplicateIds.has(a.id);
                return (
                  <div key={a.id} className={`sc-row${isConflict ? ' conflict' : ''}`}>
                    <span className="sc-label">{a.label}</span>
                    <button
                      type="button"
                      className={`btn btn-sm sc-key${capturing === a.id ? ' capturing' : ''}`}
                      onClick={() => setCapturing(a.id)}
                      title="Cliquez puis appuyez sur la touche souhaitée"
                    >
                      {capturing === a.id ? (
                        <>
                          <Target size={12} /> Appuyez sur une touche…
                        </>
                      ) : (
                        <kbd className="dv-key">{formatKeyLabel(key)}</kbd>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setKey(a.id, defaults[a.id])}
                      disabled={isDefault}
                      title={isDefault ? 'Déjà la touche par défaut' : `Revenir à ${formatKeyLabel(defaults[a.id])}`}
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(defaultShortcuts())}>
          <Check size={13} /> Tout remettre par défaut
        </button>
        {page === 'coding' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setRemapModalOpen(true)}
          >
            <Keyboard size={13} /> Configurer le Keyboard Remapping &amp; Macros (AZERTY Scout)
          </button>
        )}
      </div>

      <KeyboardRemapModal
        isModal
        open={remapModalOpen}
        onClose={() => setRemapModalOpen(false)}
      />
    </div>
  );
}
