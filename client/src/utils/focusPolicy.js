// Politique de focus du codage : le champ DataVolley reprend la main après un
// clic sur la vidéo, un bouton ou le fond de page, mais jamais après un clic dans
// un champ de formulaire ou une fenêtre de dialogue.

const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/** Vrai si l'élément accepte une saisie volontaire (texte, liste, texte riche). */
export function isEditableTarget(element) {
  if (!element) return false;
  if (EDITABLE_TAGS.includes(element.tagName)) return true;
  if (element.isContentEditable) return true;
  return false;
}

/** Vrai si l'élément appartient à une fenêtre de dialogue à préserver. */
export function isDialogTarget(element) {
  if (!element || typeof element.closest !== 'function') return false;
  return !!element.closest('[role="dialog"], .modal-overlay, .modal, [data-keep-focus]');
}

/**
 * Décide si le focus doit revenir au champ des codes après une interaction.
 * @param {Element|null} activeElement élément qui a pris le focus
 * @param {Element|null} input champ de codes
 */
export function shouldRestoreCodingFocus(activeElement, input = null) {
  if (!activeElement) return true;
  if (input && activeElement === input) return false;
  if (isEditableTarget(activeElement)) return false;
  if (isDialogTarget(activeElement)) return false;
  return true;
}

/**
 * Replace le focus sur le champ de codes si la politique l'autorise.
 * @returns {boolean} vrai si le focus a été replacé
 */
export function restoreCodingFocus(input, activeElement = null) {
  if (!input || typeof input.focus !== 'function') return false;
  const active = activeElement || input.ownerDocument?.activeElement || null;
  if (!shouldRestoreCodingFocus(active, input)) return false;
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
  return true;
}
