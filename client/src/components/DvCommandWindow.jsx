// ============================================================================
// FENÊTRE DE COMMANDES (touche Échap) — tout ce qui n'est pas un jeu : temps
// morts, remplacements, code libre. Reprend la saisie de DataVolley :
//   T / aT        temps mort (domicile / extérieur)
//   C5.12 / aC5.12  remplacement : n°5 sort, n°12 entre
//   >TEXTE        code libre (5 caractères)
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Keyboard } from './icons';
import { COMMAND_HELP, parseCommand } from '../utils/codingTools';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Function} props.onSubmit - (commande analysée, texte brut) => void
 * @param {string} [props.team1]
 * @param {string} [props.team2]
 * @param {boolean} [props.disabled]
 */
export default function DvCommandWindow({ open, onClose, onSubmit, team1 = 'Domicile', team2 = 'Extérieur', disabled = false }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const parsed = parseCommand(text);
  const preview = () => {
    if (parsed.kind === 'none') return 'Saisissez une commande.';
    if (parsed.kind === 'unknown') return parsed.error;
    if (parsed.kind === 'timeout') return `Temps mort — ${parsed.team === 'away' ? team2 : team1}`;
    if (parsed.kind === 'substitution') {
      return `Remplacement ${parsed.team === 'away' ? team2 : team1} : n°${parsed.out} sort, n°${parsed.in} entre`;
    }
    return `Code libre : ${parsed.text}`;
  };

  const submit = () => {
    if (parsed.kind === 'none' || parsed.kind === 'unknown') return;
    onSubmit?.(parsed, text);
    onClose?.();
  };

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal dv-command"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
      >
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Keyboard size={18} /> Commandes
        </h2>
        <p className="dv-hint">
          Ce qui n’est pas un jeu : temps morts, remplacements, remarques. Validez par <strong>Entrée</strong>,
          fermez par <strong>Échap</strong>.
        </p>

        <input
          ref={inputRef}
          className="dv-command-input"
          type="text"
          value={text}
          placeholder="T, aT, C5.12, aC5.12, >TEXTE"
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose?.();
            }
          }}
        />

        <div className={`dv-command-preview ${parsed.kind === 'unknown' ? 'err' : parsed.kind === 'none' ? '' : 'ok'}`}>
          {preview()}
        </div>

        <h5>Aide-mémoire</h5>
        <ul className="dv-command-help">
          {COMMAND_HELP.map((h) => (
            <li key={h.code}>
              <code>{h.code}</code> <span>{h.desc}</span>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={disabled || parsed.kind === 'none' || parsed.kind === 'unknown'}
          >
            Enregistrer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
