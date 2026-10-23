// ============================================================================
// BARRE DES MODES DE CODAGE — Saisie · Consultation · Correction · Analyse.
// Reprend l'organisation de DataVolley 4 : on choisit d'abord ce qu'on fait
// (saisir, relire, corriger, analyser), les réglages restant à part.
// ============================================================================

import { ChartColumn, CirclePlay, Keyboard, Pencil, Settings } from './icons';

/** Les 4 modes, dans l'ordre de travail d'un match.
 *  Raccourcis réels : F1 (saisie), F3 (consultation), F4 (correction),
 *  F5 (analyse). F2 reste « afficher / masquer les fenêtres ». */
export const DV_MODES = [
  { key: 'saisie', label: 'Play-by-Play · Saisie', icon: Keyboard, kbd: 'F1', hint: 'Saisir les codes pendant le match' },
  { key: 'consultation', label: 'Banc / Coach', icon: CirclePlay, kbd: 'F3', hint: 'Mode Banc / Coach Tablet : rotation en cours, front d’attaque, alertes tactiques et relecture' },
  { key: 'correction', label: 'Correction', icon: Pencil, kbd: 'F4', hint: 'Caler la vidéo, corriger les codes, compléter le match' },
  { key: 'analyse', label: 'Analyse', icon: ChartColumn, kbd: 'F5', hint: 'Feuille de match, Side-out (SO), Break Point (BP), rotations, zones, Setter Call' },
];

/**
 * @param {Object} props
 * @param {string} props.mode - mode actif ('saisie' par défaut)
 * @param {Function} props.onMode - (mode) => void
 * @param {Function} [props.onSettings] - () => void (ouvre les paramètres)
 * @param {boolean} [props.settingsOpen] - paramètres affichés
 * @param {string} [props.issuesBadge] - nombre d'anomalies à signaler (Correction)
 */
export default function DvModeBar({ mode, onMode, onSettings, settingsOpen = false, issuesBadge = 0 }) {
  return (
    <div className="dvm-bar" role="tablist" aria-label="Modes de codage">
      {DV_MODES.map((m) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`dvm-btn ${active ? 'active' : ''}`}
            onClick={() => onMode(m.key)}
            title={m.hint}
          >
            <span>{m.label}</span>
            {m.kbd && <kbd>{m.kbd}</kbd>}
            {m.key === 'correction' && issuesBadge > 0 && (
              <span className="dvm-badge" title={`${issuesBadge} anomalie(s) à corriger`}>
                {issuesBadge}
              </span>
            )}
          </button>
        );
      })}
      {onSettings && (
        <button
          type="button"
          className={`dvm-btn dvm-settings ${settingsOpen ? 'active' : ''}`}
          onClick={onSettings}
          title="Paramètres et raccourcis"
          aria-pressed={settingsOpen}
        >
          <Settings size={12} /> Paramètres
        </button>
      )}
    </div>
  );
}
