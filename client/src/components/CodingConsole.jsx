// ============================================================================
// Console de codage DataVolley partagée (vidéo + live).
// La "zone de codage" placée sous la vidéo : tampon, aperçu, pré-remplissage
// du serveur, clavier virtuel, aide-mémoire et bouton de validation.
// ============================================================================

import { DvKeyPad, DvSyntaxHelp } from './DvKeypad';
import { describeCode, describeIssues, validateAction } from '../utils/datavolley';

const describeDefault = (it) => {
  if (it.valid) return describeCode(it.code);
  const val = validateAction(it.code);
  return `✗ ${describeIssues(val.issues)}`;
};

/**
 * @param {Object} props
 * @param {React.ReactNode} props.hint - texte d'aide sous le titre
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
 * @param {Function} props.onCommit
 * @param {boolean} [props.disabled]
 * @param {React.ReactNode} props.commitLabel - contenu du bouton de validation
 * @param {React.ReactNode} [props.warnings]
 * @param {React.ReactNode} [props.aftermath]
 */
export default function CodingConsole({
  hint,
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
      <div className="dv-buffer" role="log" aria-live="polite" aria-label="Tampon de saisie">
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
          buffer={chunks.map((c) => c.code).join('')}
          disabled={disabled}
          onKey={onKey}
          onBackspace={onBackspace}
          onClear={onClear}
          onCommit={onCommit}
        />
      )}
      {aides && showHelp && <DvSyntaxHelp />}
      <button className="btn btn-primary btn-block" onClick={onCommit} disabled={disabled || chunks.length === 0}>
        {commitLabel} <kbd>Entrée</kbd>
      </button>
      {warnings}
      {aftermath}
    </>
  );
}
