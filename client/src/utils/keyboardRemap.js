// ============================================================================
// KEYBOARD REMAPPING & MACROS ENGINE (Standard AZERTY Scout — DataVolley / PureVolley)
//
// Ce module gère :
//   1. La structure de données normalisée (JSON / TypeScript JSDoc) d'un profil
//      de remapping clavier 1-to-Many (1 touche physique = 1 ou N caractères).
//   2. Le profil par défaut « Standard AZERTY Scout » (Digit1..6 -> # + ! - / =,
//      ArrowLeft -> *p, ArrowRight -> ap, KeyV -> B, KeyG -> H, KeyC -> M).
//   3. L'interception propre d'un événement `keydown` (`handleRemappedKeyDown`),
//      le blocage des comportements natifs (`event.preventDefault()`), l'insertion
//      exacte à la position du curseur (`selectionStart`..`selectionEnd`) et
//      l'option d'auto-validation immédiate (`autoEnter: true`).
//   4. La persistance dans `localStorage` et l'import/export de profils `.json`.
// ============================================================================

import { matchesShortcut } from './shortcuts.js';

export const KEYBOARD_REMAP_STORAGE_KEY = 'purevolley_keyboard_remap_v1';
export const KEYBOARD_REMAP_EVENT = 'purevolley:keymap-updated';

/**
 * @typedef {'yellow' | 'green' | 'orange' | 'red' | 'blue' | 'purple'} KeyColorCategory
 *
 * @typedef {Object} KeyMappingEntry
 * @property {string} id - Identifiant unique du raccourci
 * @property {string} code - Identifiant physique KeyboardEvent.code (ex: 'Digit1', 'ArrowRight', 'KeyV')
 * @property {string} [key] - Touche logique KeyboardEvent.key indicative (ex: '&', 'ArrowRight', 'v')
 * @property {string} label - Description lisible du raccourci (ex: 'Point extérieur (ap)')
 * @property {string} output - Chaîne de 1 ou plusieurs caractères injectée au curseur (ex: '#', 'ap', '*p', 'X5')
 * @property {KeyColorCategory} color - Couleur de la gommette visuelle sur le clavier
 * @property {boolean} autoEnter - Si true, déclenche immédiatement la validation (Enter) après insertion
 * @property {boolean} enabled - Permet d'activer/désactiver individuellement ce raccourci
 *
 * @typedef {Object} KeyboardRemapProfile
 * @property {number} version - Version du schéma JSON (1)
 * @property {string} name - Nom du profil (ex: 'Standard AZERTY Scout')
 * @property {boolean} enabled - Active ou désactive globalement le remapping clavier
 * @property {string} updatedAt - Date ISO de dernière modification
 * @property {Record<string, KeyMappingEntry>} mappings - Dictionnaire indexé par `code` physique
 */

/** Gommettes visuelles disponibles pour catégoriser les touches sur le clavier. */
export const KEY_COLOR_CATEGORIES = [
  {
    id: 'yellow',
    label: 'Jaune — Fondamental',
    shortLabel: 'Fondamental',
    desc: 'Actions de base (Service S, Réception R, Attaque A, Contre B, Défense D, Passe E)',
    hex: '#eab308',
    bg: 'rgba(234, 179, 8, 0.18)',
    border: '#eab308',
    text: '#fde047',
  },
  {
    id: 'green',
    label: 'Vert — Évaluation Positive',
    shortLabel: 'Éval. + / #',
    desc: 'Évaluations gagnantes ou positives (# Parfait/Ace/Kill, + Positif)',
    hex: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.18)',
    border: '#22c55e',
    text: '#86efac',
  },
  {
    id: 'orange',
    label: 'Orange — Évaluation Neutre / Négative',
    shortLabel: 'Éval. ! / -',
    desc: 'Évaluations de continuité ou négatives (! OK/Neutre, - Négatif)',
    hex: '#f97316',
    bg: 'rgba(249, 115, 22, 0.18)',
    border: '#f97316',
    text: '#fdba74',
  },
  {
    id: 'red',
    label: 'Rouge — Évaluation Faute / Contré',
    shortLabel: 'Éval. = / /',
    desc: 'Fautes directes ou attaques contrées (= Faute, / Contré ou Overpass)',
    hex: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.18)',
    border: '#ef4444',
    text: '#fca5a5',
  },
  {
    id: 'blue',
    label: 'Bleu — Équipe / Point',
    shortLabel: 'Équipe / Point',
    desc: 'Préfixes d’équipe et macros de conclusion de point (*, a, *p, ap)',
    hex: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.18)',
    border: '#3b82f6',
    text: '#93c5fd',
  },
  {
    id: 'purple',
    label: 'Violet — Tempo / Combinaison',
    shortLabel: 'Tempo / Combo',
    desc: 'Types de frappe, appels passeur et combinaisons d’attaque (H, M, Q, X5, V5, K1…)',
    hex: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.18)',
    border: '#a855f7',
    text: '#d8b4fe',
  },
];

export const KEY_COLOR_MAP = KEY_COLOR_CATEGORIES.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

/**
 * Profil par défaut « Standard AZERTY Scout » :
 * - Évaluations sur les touches numériques du haut (sans Shift sur un clavier AZERTY)
 * - Macros de conclusion de point sur les flèches gauche/droite avec Auto-Validation
 * - Ergonomie main gauche pour les fondamentaux et tempos
 *
 * @type {KeyboardRemapProfile}
 */
export const DEFAULT_AZERTY_SCOUT_PROFILE = {
  version: 1,
  name: 'Standard AZERTY Scout',
  enabled: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
  mappings: {
    Digit1: {
      id: 'map_digit1',
      code: 'Digit1',
      key: '&',
      label: 'Évaluation Parfaite / Point (#)',
      output: '#',
      color: 'green',
      autoEnter: false,
      enabled: true,
    },
    Digit2: {
      id: 'map_digit2',
      code: 'Digit2',
      key: 'é',
      label: 'Évaluation Positive (+)',
      output: '+',
      color: 'green',
      autoEnter: false,
      enabled: true,
    },
    Digit3: {
      id: 'map_digit3',
      code: 'Digit3',
      key: '"',
      label: 'Évaluation Neutre / OK (!)',
      output: '!',
      color: 'orange',
      autoEnter: false,
      enabled: true,
    },
    Digit4: {
      id: 'map_digit4',
      code: 'Digit4',
      key: "'",
      label: 'Évaluation Négative (-)',
      output: '-',
      color: 'orange',
      autoEnter: false,
      enabled: true,
    },
    Digit5: {
      id: 'map_digit5',
      code: 'Digit5',
      key: '(',
      label: 'Évaluation Contré / Overpass (/)',
      output: '/',
      color: 'red',
      autoEnter: false,
      enabled: true,
    },
    Digit6: {
      id: 'map_digit6',
      code: 'Digit6',
      key: '-',
      label: 'Évaluation Faute directe (=)',
      output: '=',
      color: 'red',
      autoEnter: false,
      enabled: true,
    },
    ArrowLeft: {
      id: 'map_arrow_left',
      code: 'ArrowLeft',
      key: 'ArrowLeft',
      label: 'Point équipe domicile (*p)',
      output: '*p',
      color: 'blue',
      autoEnter: true,
      enabled: true,
    },
    ArrowRight: {
      id: 'map_arrow_right',
      code: 'ArrowRight',
      key: 'ArrowRight',
      label: 'Point équipe extérieure (ap)',
      output: 'ap',
      color: 'blue',
      autoEnter: true,
      enabled: true,
    },
    KeyV: {
      id: 'map_key_v',
      code: 'KeyV',
      key: 'v',
      label: 'Contre / Block (B)',
      output: 'B',
      color: 'yellow',
      autoEnter: false,
      enabled: true,
    },
    KeyG: {
      id: 'map_key_g',
      code: 'KeyG',
      key: 'g',
      label: 'Balle Haute / Hard (H)',
      output: 'H',
      color: 'purple',
      autoEnter: false,
      enabled: true,
    },
    KeyC: {
      id: 'map_key_c',
      code: 'KeyC',
      key: 'c',
      label: 'Service Smashé / Tempo Medium (M)',
      output: 'M',
      color: 'purple',
      autoEnter: false,
      enabled: true,
    },
  },
};

/** Libellés lisibles pour l'affichage des codes physiques (`event.code`) sur un clavier AZERTY. */
export const PHYSICAL_KEY_LABELS = {
  Digit1: '1 (&)',
  Digit2: '2 (é)',
  Digit3: '3 (")',
  Digit4: "4 (')",
  Digit5: '5 (()',
  Digit6: '6 (-)',
  Digit7: '7 (è)',
  Digit8: '8 (_)',
  Digit9: '9 (ç)',
  Digit0: '0 (à)',
  Minus: ') (°)',
  Equal: '= (+)',
  KeyQ: 'A (KeyQ)',
  KeyW: 'Z (KeyW)',
  KeyE: 'E',
  KeyR: 'R',
  KeyT: 'T',
  KeyY: 'Y',
  KeyU: 'U',
  KeyI: 'I',
  KeyO: 'O',
  KeyP: 'P',
  KeyA: 'Q (KeyA)',
  KeyS: 'S',
  KeyD: 'D',
  KeyF: 'F',
  KeyG: 'G',
  KeyH: 'H',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  Semicolon: 'M (Semicolon)',
  KeyZ: 'W (KeyZ)',
  KeyX: 'X',
  KeyC: 'C',
  KeyV: 'V',
  KeyB: 'B',
  KeyN: 'N',
  KeyM: ', (KeyM)',
  ArrowLeft: '← Flèche Gauche',
  ArrowRight: '→ Flèche Droite',
  ArrowUp: '↑ Flèche Haut',
  ArrowDown: '↓ Flèche Bas',
  PageUp: 'Page Préc.',
  PageDown: 'Page Suiv.',
  Home: 'Origine (Home)',
  End: 'Fin (End)',
  Tab: 'Tab ⇥',
  Space: 'Espace',
  Numpad0: 'Pavé 0',
  Numpad1: 'Pavé 1',
  Numpad2: 'Pavé 2',
  Numpad3: 'Pavé 3',
  Numpad4: 'Pavé 4',
  Numpad5: 'Pavé 5',
  Numpad6: 'Pavé 6',
  Numpad7: 'Pavé 7',
  Numpad8: 'Pavé 8',
  Numpad9: 'Pavé 9',
  NumpadAdd: 'Pavé +',
  NumpadSubtract: 'Pavé -',
  NumpadMultiply: 'Pavé *',
  NumpadDivide: 'Pavé /',
  NumpadDecimal: 'Pavé .',
  NumpadEnter: 'Pavé Entrée',
};

/**
 * Retourne un libellé lisible pour un `code` physique ou `key`.
 * @param {string} code
 * @param {string} [key]
 * @returns {string}
 */
export function formatPhysicalKey(code, key = '') {
  if (!code && !key) return '—';
  if (code && PHYSICAL_KEY_LABELS[code]) return PHYSICAL_KEY_LABELS[code];
  if (code && code.startsWith('Key') && code.length === 4) {
    const letter = code.slice(3);
    if (key && key.length === 1 && key.toUpperCase() !== letter) {
      return `${key.toUpperCase()} (${code})`;
    }
    return letter;
  }
  if (code && code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  return code || key;
}

/**
 * Clone profondément le profil par défaut.
 * @returns {KeyboardRemapProfile}
 */
export function getDefaultKeyboardProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_AZERTY_SCOUT_PROFILE));
}

/**
 * Normalise et valide une entrée de mapping individuelle.
 * @param {Object} raw
 * @param {string} [fallbackCode]
 * @returns {KeyMappingEntry | null}
 */
export function sanitizeMappingEntry(raw, fallbackCode = '') {
  if (!raw || typeof raw !== 'object') return null;
  const code = String(raw.code || fallbackCode || '').trim();
  const output = String(raw.output ?? '');
  if (!code || !output.length) return null;
  const color = KEY_COLOR_MAP[raw.color] ? raw.color : 'yellow';
  return {
    id: String(raw.id || `map_${code.toLowerCase()}`),
    code,
    key: raw.key ? String(raw.key) : '',
    label: String(raw.label || `Touche ${code} → ${output}`).trim(),
    output,
    color,
    autoEnter: Boolean(raw.autoEnter),
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
  };
}

/**
 * Normalise un objet profil complet (provenant du localStorage ou d'un fichier JSON importé).
 * @param {any} raw
 * @returns {KeyboardRemapProfile}
 */
export function normalizeKeyboardProfile(raw) {
  const base = getDefaultKeyboardProfile();
  if (!raw || typeof raw !== 'object') return base;

  const mappings = {};
  const sourceMappings = raw.mappings && typeof raw.mappings === 'object' ? raw.mappings : {};

  if (Array.isArray(sourceMappings)) {
    for (const item of sourceMappings) {
      const clean = sanitizeMappingEntry(item);
      if (clean) mappings[clean.code] = clean;
    }
  } else {
    for (const [k, item] of Object.entries(sourceMappings)) {
      const clean = sanitizeMappingEntry(item, k);
      if (clean) mappings[clean.code] = clean;
    }
  }

  return {
    version: 1,
    name: String(raw.name || base.name).trim() || base.name,
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    mappings,
  };
}

/**
 * Charge le profil de remapping depuis `localStorage` (ou renvoie le profil AZERTY Scout par défaut).
 * @param {string} [storageKey]
 * @returns {KeyboardRemapProfile}
 */
export function loadKeyboardProfile(storageKey = KEYBOARD_REMAP_STORAGE_KEY) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return getDefaultKeyboardProfile();
    }
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return getDefaultKeyboardProfile();
    const parsed = JSON.parse(raw);
    return normalizeKeyboardProfile(parsed);
  } catch {
    return getDefaultKeyboardProfile();
  }
}

/**
 * Sauvegarde le profil de remapping dans `localStorage` et notifie les composants abonnés.
 * @param {KeyboardRemapProfile} profile
 * @param {string} [storageKey]
 * @returns {KeyboardRemapProfile}
 */
export function saveKeyboardProfile(profile, storageKey = KEYBOARD_REMAP_STORAGE_KEY) {
  const normalized = normalizeKeyboardProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(storageKey, JSON.stringify(normalized));
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(KEYBOARD_REMAP_EVENT, { detail: normalized }));
      }
    }
  } catch {
    // Stockage local indisponible : le profil reste en mémoire.
  }
  return normalized;
}

/**
 * Réinitialise le profil au standard AZERTY Scout par défaut.
 * @param {string} [storageKey]
 * @returns {KeyboardRemapProfile}
 */
export function resetKeyboardProfile(storageKey = KEYBOARD_REMAP_STORAGE_KEY) {
  const fresh = getDefaultKeyboardProfile();
  return saveKeyboardProfile(fresh, storageKey);
}

/**
 * Exporte un profil sous forme de chaîne JSON indentée prête à être téléchargée.
 * @param {KeyboardRemapProfile} [profile]
 * @returns {string}
 */
export function exportProfileToJson(profile = null) {
  const target = profile ? normalizeKeyboardProfile(profile) : loadKeyboardProfile();
  return JSON.stringify(target, null, 2);
}

/**
 * Valide et importe une chaîne JSON de profil clavier.
 * Lève une erreur explicite si le fichier n'est pas un JSON de profil valide.
 * @param {string} jsonString
 * @param {string} [storageKey]
 * @returns {KeyboardRemapProfile}
 */
export function validateAndImportProfileJson(jsonString, storageKey = KEYBOARD_REMAP_STORAGE_KEY) {
  let parsed;
  try {
    parsed = JSON.parse(String(jsonString || ''));
  } catch {
    throw new Error('Le fichier sélectionné n’est pas un fichier JSON valide.');
  }
  if (!parsed || typeof parsed !== 'object' || (!parsed.mappings && !Array.isArray(parsed))) {
    throw new Error('Structure JSON invalide : la propriété "mappings" est manquante.');
  }
  const source = Array.isArray(parsed) ? { name: 'Profil importé', mappings: parsed } : parsed;
  const normalized = normalizeKeyboardProfile(source);
  if (Object.keys(normalized.mappings).length === 0) {
    throw new Error('Aucun raccourci valide trouvé dans ce profil JSON.');
  }
  return saveKeyboardProfile(normalized, storageKey);
}

/**
 * Recherche si un événement `keydown` correspond à une touche mappée active.
 * Priorise `event.code` (identifiant physique indépendant de la langue/verr. maj),
 * avec repli sur `event.key`.
 *
 * Ignore les combinaisons avec `Ctrl` ou `Meta` (ex: Ctrl+C, Ctrl+V, Ctrl+A)
 * pour ne jamais bloquer les raccourcis d'édition système.
 *
 * @param {KeyboardEvent | {code?: string, key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} event
 * @param {KeyboardRemapProfile} [profile]
 * @returns {KeyMappingEntry | null}
 */
export function findMatchingMapping(event, profile = null) {
  if (!event) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  const activeProfile = profile || loadKeyboardProfile();
  if (!activeProfile || !activeProfile.enabled || !activeProfile.mappings) return null;

  const code = String(event.code || '').trim();
  const key = String(event.key || '');

  // 1. Recherche directe par code physique (ex: 'Digit1', 'ArrowRight', 'KeyV')
  if (code && activeProfile.mappings[code]) {
    const entry = activeProfile.mappings[code];
    if (entry && entry.enabled && entry.output) return entry;
  }

  // 2. Recherche insensible à la casse sur `code` ou repli sur `key` (utile si event.code est absent)
  for (const entry of Object.values(activeProfile.mappings)) {
    if (!entry || !entry.enabled || !entry.output) continue;
    if (code && entry.code.toLowerCase() === code.toLowerCase()) {
      return entry;
    }
    if (!code && key && entry.key && entry.key.toLowerCase() === key.toLowerCase()) {
      return entry;
    }
    if (!code && key && entry.code.toLowerCase() === key.toLowerCase()) {
      return entry;
    }
  }

  return null;
}

/**
 * Insère une chaîne de 1 ou plusieurs caractères (`output`) dans `currentValue`
 * à la position exacte du curseur (`selectionStart`..`selectionEnd`).
 *
 * @param {string} currentValue - Texte actuel du champ de saisie
 * @param {string} output - Chaîne à injecter (ex: '#', 'ap', '*p', 'X5')
 * @param {number | null | undefined} [selectionStart] - Début de sélection (défaut: fin de chaîne)
 * @param {number | null | undefined} [selectionEnd] - Fin de sélection (défaut: selectionStart)
 * @returns {{ nextValue: string, nextCursorPos: number }}
 */
export function insertAtCursor(currentValue, output, selectionStart = null, selectionEnd = null) {
  const val = String(currentValue ?? '');
  const snippet = String(output ?? '');
  const len = val.length;

  const start =
    typeof selectionStart === 'number' && !Number.isNaN(selectionStart)
      ? Math.max(0, Math.min(len, selectionStart))
      : len;
  const end =
    typeof selectionEnd === 'number' && !Number.isNaN(selectionEnd)
      ? Math.max(start, Math.min(len, selectionEnd))
      : start;

  const nextValue = val.slice(0, start) + snippet + val.slice(end);
  const nextCursorPos = start + snippet.length;
  return { nextValue, nextCursorPos };
}

/**
 * Gestionnaire d'événements clavier (`handleKeyDown`) complet pour intercepter
 * les touches mappées, bloquer le comportement natif du navigateur (`preventDefault()`),
 * injecter la chaîne multi-caractères au curseur et déclencher l'auto-validation (`autoEnter`).
 *
 * @param {KeyboardEvent} event - Événement clavier natif ou synthétique React
 * @param {Object} options
 * @param {string} options.value - Valeur courante du champ
 * @param {(nextValue: string, meta: { mapping: KeyMappingEntry, cursorPos: number }) => void} options.onChange - Callback de mise à jour
 * @param {(finalValue: string, mapping: KeyMappingEntry) => void} [options.onCommit] - Callback de validation (appelé si `autoEnter` est true)
 * @param {HTMLInputElement | HTMLTextAreaElement | null} [options.inputElement] - Élément DOM cible (défaut: event.currentTarget)
 * @param {number | null} [options.selectionStart] - Position de début explicite (si pas d'inputElement)
 * @param {number | null} [options.selectionEnd] - Position de fin explicite
 * @param {KeyboardRemapProfile} [options.profile] - Profil de mapping actif
 * @param {number} [options.maxLength] - Longueur maximale autorisée (défaut: 120)
 * @returns {{ handled: boolean, mapping: KeyMappingEntry | null, nextValue: string, nextCursorPos: number, autoCommitted: boolean }}
 */
export function handleRemappedKeyDown(event, options = {}) {
  const {
    value = '',
    onChange,
    onCommit,
    inputElement = null,
    selectionStart = null,
    selectionEnd = null,
    profile = null,
    maxLength = 120,
  } = options;

  const mapping = findMatchingMapping(event, profile);
  if (!mapping) {
    return {
      handled: false,
      mapping: null,
      nextValue: String(value ?? ''),
      nextCursorPos: typeof selectionStart === 'number' ? selectionStart : String(value ?? '').length,
      autoCommitted: false,
    };
  }

  // Bloque systématiquement le comportement par défaut du navigateur
  // (déplacement du curseur pour ArrowLeft/ArrowRight, scroll pour PageUp/PageDown,
  // changement de focus pour Tab, raccourcis navigateur pour F1-F12, saisie native, etc.)
  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();

  const targetEl =
    inputElement ||
    (event && event.currentTarget && typeof event.currentTarget.selectionStart === 'number'
      ? event.currentTarget
      : null);

  const start =
    selectionStart !== null && selectionStart !== undefined
      ? selectionStart
      : targetEl && typeof targetEl.selectionStart === 'number'
        ? targetEl.selectionStart
        : String(value ?? '').length;

  const end =
    selectionEnd !== null && selectionEnd !== undefined
      ? selectionEnd
      : targetEl && typeof targetEl.selectionEnd === 'number'
        ? targetEl.selectionEnd
        : start;

  const { nextValue, nextCursorPos } = insertAtCursor(value, mapping.output, start, end);

  if (maxLength && nextValue.length > maxLength) {
    return {
      handled: true,
      mapping,
      nextValue: String(value ?? ''),
      nextCursorPos: start,
      autoCommitted: false,
    };
  }

  if (typeof onChange === 'function') {
    onChange(nextValue, { mapping, cursorPos: nextCursorPos });
  }

  // Si un champ input DOM est attaché et qu'on ne vide pas immédiatement par autoEnter,
  // repositionne le curseur juste après la chaîne injectée.
  let autoCommitted = false;
  if (mapping.autoEnter && typeof onCommit === 'function') {
    autoCommitted = true;
    onCommit(nextValue, mapping);
  } else if (targetEl && typeof targetEl.setSelectionRange === 'function') {
    const applyCursor = () => {
      try {
        targetEl.setSelectionRange(nextCursorPos, nextCursorPos);
      } catch {
        // Ignore si l'input ne supporte pas setSelectionRange
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(applyCursor);
    } else {
      applyCursor();
    }
  }

  return {
    handled: true,
    mapping,
    nextValue,
    nextCursorPos,
    autoCommitted,
  };
}

/**
 * Touche pressée dans un champ qui saisit un code DataVolley (console, édition
 * d'une action, édition d'une séquence de point, exercice d'académie…) :
 * applique d'abord le Keyboard Remapping, puis le raccourci de validation
 * commun. Utilisable hors composant (aucun hook), pour les champs créés dans
 * une boucle de rendu.
 *
 * @param {KeyboardEvent} event
 * @param {Object} options
 * @param {string} options.value valeur courante du champ
 * @param {(next:string)=>void} [options.onChange] insertion remappée
 * @param {(finalValue?:string)=>void} [options.onSubmit] validation
 * @param {()=>void} [options.onCancel] annulation (Échap / « vider le tampon »)
 * @param {KeyboardRemapProfile} [options.profile] profil actif
 * @param {Object} [options.shortcuts] raccourcis partagés (utils/shortcuts)
 * @param {boolean} [options.commitOnMacro] laisse une macro auto-valider
 * @returns {boolean} vrai si la touche a été traitée
 */
export function handleCodeFieldKeyDown(event, options = {}) {
  const {
    value = '',
    onChange,
    onSubmit,
    onCancel = null,
    profile = null,
    shortcuts = null,
    commitOnMacro = false,
  } = options;

  const remapRes = handleRemappedKeyDown(event, {
    value,
    profile,
    onChange,
    onCommit: commitOnMacro ? onSubmit : undefined,
  });
  if (remapRes.handled) return true;

  if (shortcuts && matchesShortcut(event, shortcuts.validate)) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof onSubmit === 'function') onSubmit();
    return true;
  }

  if (
    onCancel &&
    (event.key === 'Escape' || (shortcuts && matchesShortcut(event, shortcuts.clearBuffer)))
  ) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    onCancel();
    return true;
  }

  return false;
}
