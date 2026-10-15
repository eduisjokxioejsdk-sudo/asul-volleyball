// ============================================================================
// Raccourcis de gestion vidéo — rappel compact affiché sous le lecteur.
// Seuls les raccourcis réellement actifs sont listés :
//   • le lecteur natif (vidéo) : Espace, flèches, M, F ;
//   • la console de codage (capture clavier globale) : Entrée, Échap, Retour.
// L'espace et les flèches ne sont volontairement pas interceptés par le codage :
// ils restent au lecteur (voir la capture clavier de DataVolleyDashboard).
// ============================================================================

import { Keyboard } from './icons';

/** Raccourcis du lecteur vidéo (natifs, une fois la vidéo cliquée). */
const VIDEO_KEYS = [
  { keys: ['Espace'], label: 'lecture / pause' },
  { keys: ['←', '→'], label: '−5 s / +5 s' },
  { keys: ['↑', '↓'], label: 'volume' },
  { keys: ['M'], label: 'muet' },
  { keys: ['F'], label: 'plein écran' },
];

/** Raccourcis de la console de codage (capture clavier de la page). */
const CODING_KEYS = [
  { keys: ['Entrée'], label: 'valider le point' },
  { keys: ['Échap'], label: 'vider le tampon' },
  { keys: ['Retour'], label: 'effacer un caractère' },
];

/** Raccourcis d'affichage (fenêtres de codage). */
const LAYOUT_KEYS = [
  { keys: ['F2'], label: 'afficher / masquer les fenêtres' },
];

/**
 * @param {Object} props
 * @param {boolean} [props.coding] - ajoute les raccourcis de la console
 * @param {boolean} [props.layout] - ajoute les raccourcis d'affichage
 * @param {boolean} [props.video] - inclut les raccourcis vidéo (par défaut oui)
 * @param {string} [props.className]
 */
export default function VideoShortcuts({ coding = false, layout = true, video = true, className = '' }) {
  const items = [
    ...(video ? VIDEO_KEYS : []),
    ...(coding ? CODING_KEYS : []),
    ...(layout ? LAYOUT_KEYS : []),
  ];

  return (
    <div className={`dv-shortcuts${className ? ` ${className}` : ''}`}>
      <span className="dv-shortcuts-title">
        <Keyboard size={12} /> Raccourcis vidéo
      </span>
      <ul className="dv-shortcuts-list">
        {items.map((it) => (
          <li key={it.label} className="dv-shortcut">
            {it.keys.map((k) => (
              <kbd key={k} className="dv-key">{k}</kbd>
            ))}
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
