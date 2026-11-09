// Vérifie la politique de focus du champ de codage.
// Exécution : node client/scripts/focusPolicy.spec.mjs
import {
  isEditableTarget,
  isDialogTarget,
  shouldRestoreCodingFocus,
  restoreCodingFocus,
} from '../src/utils/focusPolicy.js';

let bad = 0;
const check = (label, ok) => { if (!ok) bad += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); };
const input = { tagName: 'INPUT', isContentEditable: false, closest: () => null, focus() { this.focused = true; } };
const video = { tagName: 'VIDEO', closest: () => null };
const iframe = { tagName: 'IFRAME', closest: () => null };
const button = { tagName: 'BUTTON', closest: () => null };
const body = { tagName: 'BODY', closest: () => null };
const select = { tagName: 'SELECT', closest: () => null };
const textarea = { tagName: 'TEXTAREA', closest: () => null };
const rich = { tagName: 'DIV', isContentEditable: true, closest: () => null };
const modalInput = { tagName: 'INPUT', isContentEditable: false, closest: (sel) => (sel.includes('modal') ? {} : null) };

check('champ texte volontaire conservé', isEditableTarget(input) && !shouldRestoreCodingFocus(input, input));
check('liste déroulante conservée', !shouldRestoreCodingFocus(select, input));
check('zone de texte conservée', !shouldRestoreCodingFocus(textarea, input));
check('texte riche conservé', !shouldRestoreCodingFocus(rich, input));
check('champ d’une fenêtre de dialogue conservé', !shouldRestoreCodingFocus(modalInput, input) && isDialogTarget(modalInput));
check('vidéo : focus repris', shouldRestoreCodingFocus(video, input));
check('iframe vidéo : focus repris', shouldRestoreCodingFocus(iframe, input));
check('bouton : focus repris', shouldRestoreCodingFocus(button, input));
check('fond de page : focus repris', shouldRestoreCodingFocus(body, input));
check('élément nul : focus repris', shouldRestoreCodingFocus(null, input));
check('déjà dans le champ : aucun changement', !restoreCodingFocus(input, input));
input.focused = false;
check('restauration réelle après clic vidéo', restoreCodingFocus(input, video) && input.focused === true);
input.focused = false;
check('aucune restauration depuis un champ de formulaire', !restoreCodingFocus(input, select) && input.focused === false);

if (bad) { console.log(`${bad} échec(s)`); process.exit(1); }
console.log('TOUT EST OK');
