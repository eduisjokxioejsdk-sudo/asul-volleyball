// ============================================================================
// BARRE DES MODES DE CODAGE — Saisie · Consultation · Correction · Analyse.
// Reprend l'organisation de DataVolley 4 : on choisit d'abord ce qu'on fait
// (saisir, relire, corriger, analyser), les réglages restant à part.
// ============================================================================

import { ChartColumn, CirclePlay, Keyboard, Pencil, Settings } from './icons';

/** Les 4 modes, dans l'ordre de travail d'un match. */
export const DV_MODES = [
  { key: 'saisie', label: 'Saisie', icon: Keyboard, hint: 'Saisir les codes pendant le match' },
  { key: 'consultation', label: 'Consultation', icon: CirclePlay, hint: 'Relire les points enchaînés, sans les temps morts' },
  { key: 'correction', label: 'Correction', icon: Pencil, hint: 'Caler la vidéo, corriger les codes, compléter le match' },
  { key: 'analyse', label: 'Analyse', icon: ChartColumn, hint: 'Feuille de match, compétences, rotations, zones, distribution' },
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
        const Icon = m.icon;
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
            <Icon size={13} /> {m.label}
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
          className={`dvm-btn dvm-icon ${settingsOpen ? 'active' : ''}`}
          onClick={onSettings}
          title="Paramètres (raccourcis clavier, fenêtres de codage)"
          aria-pressed={settingsOpen}
        >
          <Settings size={14} />
        </button>
      )}
    </div>
  );
}
