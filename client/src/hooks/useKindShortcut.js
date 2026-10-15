// ============================================================================
// Raccourci clavier des fiches de trajectoire : une seule touche bascule
// Services ↔ Attaque.
//
// Le réglage est propre à l'appareil (localStorage) et partagé par le mode
// Annotation et le mode Consultation : la même touche fonctionne sur les deux
// écrans. Le hook est volontairement petit : il ne fait que charger/enregistrer
// le raccourci et écouter la touche.
// ============================================================================

import { useEffect, useState } from 'react';
import { loadShortcuts, matchesShortcut, saveShortcuts } from '../utils/shortcuts';

/** Clé de stockage des raccourcis des fiches de trajectoire (par appareil). */
export const TRAJECTORY_SHORTCUTS_KEY = 'tj.shortcuts';

/**
 * @param {Object} options
 * @param {() => void} options.onToggle appelé quand la touche de bascule est pressée.
 * @param {boolean} [options.blocked] suspend le raccourci (popup, saisie, menu…).
 * @returns {{shortcuts:Object, setShortcuts:Function}}
 */
export default function useKindShortcut({ onToggle, blocked = false }) {
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(TRAJECTORY_SHORTCUTS_KEY));

  // Raccourcis enregistrés sur cet appareil (comme les écrans de codage).
  useEffect(() => { saveShortcuts(TRAJECTORY_SHORTCUTS_KEY, shortcuts); }, [shortcuts]);

  useEffect(() => {
    const onKey = (event) => {
      if (blocked) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!matchesShortcut(event, shortcuts.toggleKind)) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts, blocked, onToggle]);

  return { shortcuts, setShortcuts };
}
