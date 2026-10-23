// ============================================================================
// FENÊTRE DE COMMANDES (touche Échap) — tout ce qui n'est pas un jeu : temps
// morts, remplacements, sanctions (carton jaune/rouge/expulsion/disqualif.),
// retard de jeu, Video Check (Challenge), point d'arbitre, code libre.
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
export default function DvCommandWindow({
  open,
  onClose,
  onSubmit,
  team1 = 'Domicile',
  team2 = 'Extérieur',
  disabled = false,
}) {
  const [text, setText] = useState('');
  const [activeTeam, setActiveTeam] = useState('home');
  const [playerNum, setPlayerNum] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      setPlayerNum('');
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const parsed = parseCommand(text);
  const teamLabel = (t) => (t === 'away' ? team2 : team1);

  const preview = () => {
    if (parsed.kind === 'none') return 'Saisissez une commande ou cliquez sur un bouton rapide ci-dessous.';
    if (parsed.kind === 'unknown') return parsed.error;
    if (parsed.kind === 'timeout') return `Temps mort — ${teamLabel(parsed.team)}`;
    if (parsed.kind === 'substitution') {
      return `Remplacement ${teamLabel(parsed.team)} : n°${parsed.out} sort, n°${parsed.in} entre`;
    }
    if (parsed.kind === 'sanction') {
      const cardNames = {
        Y: 'Carton Jaune (avertissement)',
        R: 'Carton Rouge (pénalité : +1 pt & service à l’adversaire)',
        E: 'Expulsion (set)',
        D: 'Disqualification (match)',
      };
      const who = parsed.player ? `joueur n°${parsed.player}` : 'banc / coach';
      return `Sanction ${teamLabel(parsed.team)} (${who}) — ${cardNames[parsed.card] || parsed.card}`;
    }
    if (parsed.kind === 'delay') {
      const desc =
        parsed.card === 'R'
          ? 'Pénalité retard de jeu (+1 pt & service à l’adversaire)'
          : 'Avertissement retard de jeu';
      return `${desc} — ${teamLabel(parsed.team)}`;
    }
    if (parsed.kind === 'challenge') {
      const outMap = { won: 'Challenge GAGNÉ (+)', lost: 'Challenge PERDU (-)', replay: 'Balle à REJOUER (R)' };
      return `Video Check (${teamLabel(parsed.team)}) — ${outMap[parsed.outcome] || parsed.outcome}`;
    }
    if (parsed.kind === 'point_adjust') {
      return `Point d’arbitre attribué à ${teamLabel(parsed.team)} (+1 pt & service)`;
    }
    return `Code libre : ${parsed.text}`;
  };

  const submit = (overrideCmd = null, overrideRaw = null) => {
    const cmd = overrideCmd || parsed;
    const raw = overrideRaw ?? text;
    if (!cmd || cmd.kind === 'none' || cmd.kind === 'unknown') return;
    onSubmit?.(cmd, raw);
    onClose?.();
  };

  const prefix = activeTeam === 'away' ? 'a' : '*';
  const numSuffix = playerNum ? String(playerNum).padStart(2, '0') : '';

  const fillOrTrigger = (cmdCode) => {
    setText(cmdCode);
    inputRef.current?.focus();
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
        style={{ maxWidth: 640, width: '95%' }}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
      >
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Keyboard size={18} /> Commandes & Arbitrage (DataVolley 4)
        </h2>
        <p className="dv-hint">
          Temps morts, remplacements, cartons, retards de jeu, Video Check et points d’arbitre. Validez par{' '}
          <strong>Entrée</strong>, fermez par <strong>Échap</strong>.
        </p>

        {/* Barre rapide de sélection d'équipe + n° joueur pour les boutons rapides */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="dv-seg" style={{ display: 'inline-flex' }}>
            <button
              type="button"
              className={activeTeam === 'home' ? 'active' : ''}
              onClick={() => setActiveTeam('home')}
            >
              * {team1}
            </button>
            <button
              type="button"
              className={activeTeam === 'away' ? 'active' : ''}
              onClick={() => setActiveTeam('away')}
            >
              a {team2}
            </button>
          </div>
          <input
            type="number"
            min="1"
            max="99"
            placeholder="N° joueur (opt.)"
            value={playerNum}
            onChange={(e) => setPlayerNum(e.target.value)}
            style={{ width: 130, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Boutons d'actions rapides Point 4 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginBottom: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${activeTeam === 'away' ? 'a' : ''}T`)}>
            ⏱ Temps mort ({activeTeam === 'away' ? 'aT' : 'T'})
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${prefix}CY${numSuffix}`)}>
            🟨 Carton Jaune ({prefix}CY{numSuffix})
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(239,68,68,0.5)' }} onClick={() => fillOrTrigger(`${prefix}CR${numSuffix}`)}>
            🟥 Carton Rouge +1pt ({prefix}CR{numSuffix})
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${prefix}CE${numSuffix}`)}>
            🚫 Expulsion ({prefix}CE{numSuffix})
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${prefix}DY`)}>
            ⏳ Retard Jaune ({prefix}DY)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(239,68,68,0.5)' }} onClick={() => fillOrTrigger(`${prefix}DR`)}>
            ⏳🟥 Retard Rouge +1pt ({prefix}DR)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${prefix}VC+`)}>
            📹 Challenge Gagné ({prefix}VC+)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${prefix}VC-`)}>
            📹 Challenge Perdu ({prefix}VC-)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillOrTrigger(`${prefix}VCR`)}>
            🔄 Balle à rejouer ({prefix}VCR)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(34,197,94,0.5)' }} onClick={() => fillOrTrigger(`${prefix}P`)}>
            ⚖️ Point Arbitre +1pt ({prefix}P)
          </button>
        </div>

        <input
          ref={inputRef}
          className="dv-command-input"
          type="text"
          value={text}
          placeholder="T, aT, C5.12, *CY07, *CR07, *DY, *VC+, *P, >TEXTE"
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
            onClick={() => submit()}
            disabled={disabled || parsed.kind === 'none' || parsed.kind === 'unknown'}
          >
            Enregistrer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
