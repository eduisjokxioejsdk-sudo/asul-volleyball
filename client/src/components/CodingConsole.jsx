// ============================================================================
// Console de codage DataVolley partagée (vidéo + live).
// La "zone de codage" placée sous la vidéo : champ de saisie avec curseur et
// interception Keyboard Remapping (AZERTY Scout), tampon visuel en blocs,
// aperçu décodé, pré-remplissage du serveur, clavier virtuel, aide-mémoire
// et bouton de validation.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { DvKeyPad, DvSyntaxHelp } from './DvKeypad';
import KeyboardRemapModal from './KeyboardRemapModal';
import { Keyboard } from './icons';
import { describeCode, describeIssues, validateAction } from '../utils/datavolley';
import {
  KEYBOARD_REMAP_EVENT,
  loadKeyboardProfile,
  handleRemappedKeyDown,
} from '../utils/keyboardRemap';

const describeDefault = (it) => {
  if (it.valid) return describeCode(it.code);
  const val = validateAction(it.code);
  return `✗ ${describeIssues(val.issues)}`;
};

/**
 * @param {Object} props
 * @param {React.ReactNode} props.hint - texte d'aide sous le titre
 * @param {string} [props.buffer] - chaîne brute du tampon
 * @param {(next:string)=>void} [props.onChangeBuffer] - mise à jour directe du tampon (pour édition au curseur)
 * @param {Array} props.bufferChunks - résultat de parseSequence(buffer)
 * @param {Function} [props.describe] - (item) => texte de la ligne d'aperçu
 * @param {Function} [props.blockClassFor] - (item) => classe du bloc (ex. 'error')
 * @param {Function} [props.lineClassFor] - (item) => classe de la ligne d'aperçu
 * @param {Function} [props.lineAfter] - (item) => contenu après la ligne d'aperçu
 * @param {boolean} props.aides - Mode Aide : affiche clavier + aide-mémoire
 * @param {boolean} props.autoServe - pré-remplissage auto du serveur
 * @param {Function} props.onToggleAutoServe
 * @param {string} props.nextServe - service attendu à insérer
 * @param {Function} props.onInsertNextServe
 * @param {boolean} props.showKeypad
 * @param {Function} props.onToggleKeypad
 * @param {boolean} props.showHelp
 * @param {Function} props.onToggleHelp
 * @param {Function} props.onKey - (char) => void (clavier virtuel)
 * @param {Function} props.onBackspace
 * @param {Function} props.onClear
 * @param {Function} props.onCommit - (overrideBuffer?: string) => void
 * @param {boolean} [props.disabled]
 * @param {React.ReactNode} props.commitLabel - contenu du bouton de validation
 * @param {React.ReactNode} [props.warnings]
 * @param {React.ReactNode} [props.aftermath]
 */
export default function CodingConsole({
  hint,
  buffer,
  onChangeBuffer,
  bufferChunks,
  describe = describeDefault,
  blockClassFor = () => '',
  lineClassFor = () => '',
  lineAfter = () => null,
  aides,
  autoServe,
  onToggleAutoServe,
  nextServe,
  onInsertNextServe,
  showKeypad,
  onToggleKeypad,
  showHelp,
  onToggleHelp,
  onKey,
  onBackspace,
  onClear,
  onCommit,
  disabled,
  commitLabel,
  warnings,
  aftermath,
}) {
  const chunks = bufferChunks || [];
  const rawValue = buffer !== undefined ? buffer : chunks.map((c) => c.code).join('');
  const inputRef = useRef(null);
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const [keymapProfile, setKeymapProfile] = useState(() => loadKeyboardProfile());

  useEffect(() => {
    const onProfileUpdated = () => setKeymapProfile(loadKeyboardProfile());
    window.addEventListener(KEYBOARD_REMAP_EVENT, onProfileUpdated);
    return () => window.removeEventListener(KEYBOARD_REMAP_EVENT, onProfileUpdated);
  }, []);

  const handleInputKeyDown = (e) => {
    if (disabled) return;

    // 1. Interception via le moteur de Keyboard Remapping (1-to-Many + Auto-Enter)
    const remapResult = handleRemappedKeyDown(e, {
      value: rawValue,
      profile: keymapProfile,
      inputElement: inputRef.current,
      onChange: (nextVal) => {
        onChangeBuffer?.(nextVal);
      },
      onCommit: (finalVal) => {
        onCommit?.(finalVal);
      },
    });

    if (remapResult.handled) {
      return;
    }

    // 2. Touches de contrôle standard dans le champ de saisie
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onCommit?.(rawValue);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onChangeBuffer) onChangeBuffer('');
      else onClear?.();
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h4 style={{ margin: 0 }}>Play-by-Play · Saisie</h4>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#a1a1aa' }}>
          <span>Valider</span><kbd>Entrée</kbd>
          <span>Effacer</span><kbd>⌫</kbd>
          <span>Vider</span><kbd>Échap</kbd>
        </span>
      </div>
      {hint}

      {/* Champ de saisie interactif avec support du curseur et remapping clavier */}
      {onChangeBuffer && (
        <div style={{ marginBottom: 6 }}>
          <input
            ref={inputRef}
            type="text"
            className="dv-buffer-input"
            value={rawValue}
            disabled={disabled}
            onChange={(e) => onChangeBuffer(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Saisissez le code DataVolley (ex: *09A4# ou utilisez les raccourcis AZERTY Scout)..."
            aria-label="Champ de saisie de code DataVolley"
            style={{
              width: '100%',
              padding: '7px 10px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 6,
              background: '#09090b',
              border: '1px solid var(--border-color, #27272a)',
              color: '#fbbf24',
            }}
          />
        </div>
      )}

      <div
        className="dv-buffer"
        role="log"
        aria-live="polite"
        aria-label="Tampon de saisie"
        onClick={() => inputRef.current?.focus()}
        style={{ cursor: onChangeBuffer ? 'text' : undefined }}
      >
        {chunks.length === 0 ? (
          <span className="dv-buffer-code" aria-hidden="true">·</span>
        ) : (
          chunks.map((it, i) => (
            <span key={i} className={`dv-buffer-block ${blockClassFor(it)}`}>{it.code}</span>
          ))
        )}
      </div>
      {chunks.length > 0 && (
        <div className="dv-buffer-preview">
          {chunks.map((it, i) => (
            <div key={i} className={`dv-preview-line ${lineClassFor(it)}`}>
              <code>{it.code}</code>{' '}
              {describe(it)}
              {lineAfter(it)}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          title="Insérer le code attendu dans le tampon"
          onClick={onInsertNextServe}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          disabled={disabled}
        >
          Attendu : <span className="pk-mono">{nextServe || '—'}</span>
        </button>
        <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <input type="checkbox" checked={autoServe} onChange={onToggleAutoServe} disabled={disabled} />
          Pré-remplir le serveur
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setRemapModalOpen(true)}
          title="Configurer le Keyboard Remapping & les Macros (Standard AZERTY Scout)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            borderColor: keymapProfile?.enabled ? 'rgba(34, 197, 94, 0.45)' : undefined,
          }}
        >
          <Keyboard size={12} /> Clavier Scout
        </button>
        {aides && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleKeypad} aria-expanded={showKeypad} disabled={disabled}>
              Clavier
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleHelp} aria-expanded={showHelp} disabled={disabled}>
              Aide-mémoire
            </button>
          </>
        )}
      </div>
      {aides && showKeypad && (
        <DvKeyPad
          buffer={rawValue}
          disabled={disabled}
          onKey={onKey}
          onBackspace={onBackspace}
          onClear={onClear}
          onCommit={() => onCommit?.()}
        />
      )}
      {aides && showHelp && <DvSyntaxHelp />}
      <button className="btn btn-primary btn-block" onClick={() => onCommit?.()} disabled={disabled || chunks.length === 0}>
        {commitLabel} <kbd>Entrée</kbd>
      </button>
      {warnings}
      {aftermath}

      <KeyboardRemapModal
        isModal
        open={remapModalOpen}
        onClose={() => setRemapModalOpen(false)}
        onProfileChange={(next) => setKeymapProfile(next)}
      />
    </>
  );
}
