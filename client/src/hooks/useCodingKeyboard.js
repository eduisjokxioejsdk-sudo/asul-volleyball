// ============================================================================
// Réglages clavier partagés par TOUS les écrans qui codent au clavier :
// Data Volley, Multi-Matchs, Direct, Entraînement et Académie.
//
//   • `shortcuts`     : touches des actions (valider, vider, lecture, panneaux…)
//                       enregistrées dans une clé unique (localStorage) — un
//                       seul réglage pour tous les modes ;
//   • `setShortcuts`  : mise à jour, enregistrée immédiatement ;
//   • `keymapProfile` : profil de Keyboard Remapping (« AZERTY Scout ») actif,
//                       rechargé dès qu'il est modifié (modale de réglages,
//                       import JSON) et transmis tel quel au moteur
//                       `handleRemappedKeyDown`.
//
// Les anciens réglages par match / par session sont repris automatiquement via
// `legacyKeys` (voir loadCodingShortcuts).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { CODING_SHORTCUTS_KEY, loadCodingShortcuts, saveShortcuts } from '../utils/shortcuts';
import { KEYBOARD_REMAP_EVENT, loadKeyboardProfile } from '../utils/keyboardRemap';

/**
 * @param {Object} [options]
 * @param {string[]} [options.legacyKeys] anciennes clés à reprendre si la clé
 *   commune n'existe pas encore (ex. `dv.shortcuts.video.12`).
 * @returns {{shortcuts:Object, setShortcuts:Function, keymapProfile:Object}}
 */
export default function useCodingKeyboard({ legacyKeys = [] } = {}) {
  // Les anciennes clés ne servent qu'au premier chargement : on les fige pour
  // que la migration ne se rejoue pas à chaque rendu.
  const legacyRef = useRef(legacyKeys);
  const [shortcuts, setShortcuts] = useState(() => loadCodingShortcuts(legacyRef.current));
  const [keymapProfile, setKeymapProfile] = useState(() => loadKeyboardProfile());
  const initialShortcutsRef = useRef(shortcuts);

  // Enregistrement seulement après une vraie modification : écrire dès le
  // montage créerait la clé commune avec les valeurs par défaut et empêcherait
  // la reprise ultérieure d'un réglage propre à un match (`dv.shortcuts.video.<id>`).
  // La comparaison d'identité (et non un simple « premier rendu ») reste juste
  // même si React réexécute les effets (mode strict en développement).
  useEffect(() => {
    if (shortcuts === initialShortcutsRef.current) return;
    saveShortcuts(CODING_SHORTCUTS_KEY, shortcuts);
  }, [shortcuts]);

  // Profil de remapping modifié (fenêtre de réglages, import JSON, remise à
  // zéro) : on recharge sans quitter l'écran de codage.
  useEffect(() => {
    const reloadProfile = () => setKeymapProfile(loadKeyboardProfile());
    window.addEventListener(KEYBOARD_REMAP_EVENT, reloadProfile);
    return () => window.removeEventListener(KEYBOARD_REMAP_EVENT, reloadProfile);
  }, []);

  // Réglage modifié depuis un autre onglet / une autre fenêtre de l'application.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== CODING_SHORTCUTS_KEY) return;
      setShortcuts(loadCodingShortcuts());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { shortcuts, setShortcuts, keymapProfile };
}
