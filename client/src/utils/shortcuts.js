// ============================================================================
// Raccourcis clavier — entièrement personnalisables (Paramètres).
// La logique est pure ici (aucun accès React/DOM) pour rester testable :
//   • SHORTCUT_ACTIONS : liste des actions + touche par défaut ;
//   • formatKeyLabel / keyFromEvent : affichage et normalisation des touches ;
//   • findDuplicateKeys : détection des conflits ;
//   • stepSpeed : progression des vitesses de lecture.
// La persistance (localStorage) est assurée par loadShortcuts/saveShortcuts.
// ============================================================================

/** Groupes d'affichage dans l'onglet Paramètres. */
export const SHORTCUT_GROUPS = ['Vidéo', 'Console', 'Affichage', 'Trajectoires'];

/**
 * Actions personnalisables, dans l'ordre d'affichage.
 * `video: true` → n'a de sens que sur un écran avec lecteur vidéo.
 * `page: 'trajectory'` → réglé depuis les fiches de trajectoire (le reste vaut
 * pour les écrans de codage).
 */
export const SHORTCUT_ACTIONS = [
  { id: 'pause', label: 'Lecture / pause', group: 'Vidéo', key: 'k', video: true },
  { id: 'seekBack', label: 'Reculer (−5 s)', group: 'Vidéo', key: 'j', video: true },
  { id: 'seekForward', label: 'Avancer (+5 s)', group: 'Vidéo', key: 'l', video: true },
  // « [ » et « ] » sont réservés à la fin de point (DataVolley) ; « - » et
  // « = » sont des évaluations. La vitesse passe donc par les flèches
  // (haut/bas), libres en saisie comme en consultation.
  { id: 'speedDown', label: 'Ralentir la lecture', group: 'Vidéo', key: 'ArrowDown', video: true },
  { id: 'speedUp', label: 'Accélérer la lecture', group: 'Vidéo', key: 'ArrowUp', video: true },
  { id: 'speedReset', label: 'Vitesse normale (1×)', group: 'Vidéo', key: '\\', video: true },
  { id: 'validate', label: 'Valider le point (tampon)', group: 'Console', key: 'Enter' },
  { id: 'clearBuffer', label: 'Vider le tampon', group: 'Console', key: 'Escape' },
  { id: 'backspace', label: 'Effacer un caractère', group: 'Console', key: 'Backspace' },
  // F2 et non « P » : la lettre P est un type d'attaque valide (Placée) et
  // entrerait en conflit avec la saisie des codes.
  { id: 'togglePanels', label: 'Afficher / masquer les fenêtres', group: 'Affichage', key: 'F2' },
  // Fiches de trajectoire : une seule touche pour passer de Services à Attaque
  // (et inversement) sans lâcher la souris. Aucune saisie de code sur cet
  // écran : les lettres sont donc libres.
  { id: 'toggleKind', label: 'Basculer Services ↔ Attaque', group: 'Trajectoires', key: 't', page: 'trajectory' },
];

/** Vrai si l'action concerne la page demandée ('coding' par défaut). */
export function isActionForPage(action, page = 'coding') {
  return (action?.page || 'coding') === page;
}

/** Vitesses proposées par les raccourcis Ralentir / Accélérer. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/** Touches par défaut, sous forme { id: key }. */
export function defaultShortcuts() {
  return SHORTCUT_ACTIONS.reduce((acc, a) => {
    acc[a.id] = a.key;
    return acc;
  }, {});
}

/** Touches « physiques » non imprimables que l'on documente lisiblement. */
const KEY_LABELS = {
  Enter: 'Entrée',
  Escape: 'Échap',
  Backspace: 'Retour',
  Delete: 'Suppr',
  Space: 'Espace',
  Tab: 'Tab',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Home: 'Origine',
  End: 'Fin',
  PageUp: 'Pg. préc.',
  PageDown: 'Pg. suiv.',
  ',': ',',
  '.': '.',
  '/': '/',
  ';': ';',
  "'": "'",
  '+': '+',
  '-': '−',
  '[': '[',
  ']': ']',
  '\\': '\\',
};

/** Libellé lisible d'une touche normalisée (ex. 'Enter' → 'Entrée'). */
export function formatKeyLabel(key) {
  if (!key) return '—';
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * Normalise une touche d'événement clavier :
 *   ' ' → 'Space' · 'j' → 'j' (minuscule) · 'Enter' → 'Enter'.
 */
export function keyFromEvent(event) {
  const k = event?.key;
  if (!k) return '';
  if (k === ' ') return 'Space';
  if (k.length === 1) return k.toLowerCase();
  return k;
}

/** Vrai si l'événement correspond à la touche attendue (normalisée). */
export function matchesShortcut(event, key) {
  if (!key) return false;
  return keyFromEvent(event) === normalizeKey(key);
}

/** Normalise une touche saisie par l'utilisateur (chaîne quelconque). */
export function normalizeKey(raw) {
  const k = String(raw ?? '');
  if (!k) return '';
  if (k === ' ' || k === 'Space' || k === 'Spacebar') return 'Space';
  if (k.length === 1) return k.toLowerCase();
  return k;
}

/**
 * Conflits : renvoie la liste des touche doublons, avec les actions concernées.
 * `actions` permet de ne comparer que les raccourcis d'une même page (par
 * défaut : toute la liste).
 * @returns {Array<{key: string, ids: string[]}>}
 */
export function findDuplicateKeys(shortcuts, actions = SHORTCUT_ACTIONS) {
  const byKey = new Map();
  for (const a of actions) {
    const key = normalizeKey(shortcuts?.[a.id]);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(a.id);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids }));
}

/** Progression de vitesse : direction > 0 accélère, < 0 ralentit. */
export function stepSpeed(current, direction, speeds = PLAYBACK_SPEEDS) {
  const list = speeds && speeds.length ? speeds : PLAYBACK_SPEEDS;
  const cur = Number(current) || 1;
  let idx = list.findIndex((s) => Math.abs(s - cur) < 1e-6);
  if (idx === -1) {
    // Vitesse hors liste : on se cale sur la plus proche.
    idx = list.reduce((best, s, i) => (Math.abs(s - cur) < Math.abs(list[best] - cur) ? i : best), 0);
  }
  const next = Math.min(list.length - 1, Math.max(0, idx + (direction > 0 ? 1 : -1)));
  return list[next];
}

/** Charge les raccourcis depuis localStorage (fusion avec les valeurs par défaut). */
export function loadShortcuts(storageKey) {
  const base = defaultShortcuts();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const out = { ...base };
    for (const a of SHORTCUT_ACTIONS) {
      if (parsed && typeof parsed[a.id] === 'string' && parsed[a.id]) {
        out[a.id] = normalizeKey(parsed[a.id]);
      }
    }
    return out;
  } catch {
    return base;
  }
}

/** Enregistre les raccourcis (silencieux si le stockage est indisponible). */
export function saveShortcuts(storageKey, shortcuts) {
  try {
    const clean = {};
    for (const a of SHORTCUT_ACTIONS) {
      if (shortcuts?.[a.id]) clean[a.id] = normalizeKey(shortcuts[a.id]);
    }
    localStorage.setItem(storageKey, JSON.stringify(clean));
  } catch {
    // Stockage indisponible : les raccourcis restent valables pour la session.
  }
}
