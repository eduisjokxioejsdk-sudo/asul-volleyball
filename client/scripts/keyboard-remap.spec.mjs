// ============================================================================
// TEST : KEYBOARD REMAPPING (STANDARD AZERTY SCOUT) & MACROS 1-TO-MANY
// Exécution : node client/scripts/keyboard-remap.spec.mjs
// ============================================================================

import {
  DEFAULT_AZERTY_SCOUT_PROFILE,
  KEY_COLOR_CATEGORIES,
  getDefaultKeyboardProfile,
  findMatchingMapping,
  insertAtCursor,
  handleRemappedKeyDown,
  exportProfileToJson,
  validateAndImportProfileJson,
} from '../src/utils/keyboardRemap.js';
import {
  parseSequence,
  validateAction,
  describeCode,
  makeActions,
} from '../src/utils/datavolley.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail ? `(${detail})` : ''}`);
  }
}

console.log('\n== Test 1 : Profil par défaut Standard AZERTY Scout ==');
const def = getDefaultKeyboardProfile();
check('Profil activé par défaut', def.enabled === true);
check('Digit1 -> # (Vert)', def.mappings.Digit1?.output === '#' && def.mappings.Digit1?.color === 'green');
check('Digit2 -> + (Vert)', def.mappings.Digit2?.output === '+' && def.mappings.Digit2?.color === 'green');
check('Digit3 -> ! (Orange)', def.mappings.Digit3?.output === '!' && def.mappings.Digit3?.color === 'orange');
check('Digit4 -> - (Orange)', def.mappings.Digit4?.output === '-' && def.mappings.Digit4?.color === 'orange');
check('Digit5 -> / (Rouge)', def.mappings.Digit5?.output === '/' && def.mappings.Digit5?.color === 'red');
check('Digit6 -> = (Rouge)', def.mappings.Digit6?.output === '=' && def.mappings.Digit6?.color === 'red');
check(
  'ArrowLeft -> *p (Bleu + Auto-Validation)',
  def.mappings.ArrowLeft?.output === '*p' && def.mappings.ArrowLeft?.color === 'blue' && def.mappings.ArrowLeft?.autoEnter === true
);
check(
  'ArrowRight -> ap (Bleu + Auto-Validation)',
  def.mappings.ArrowRight?.output === 'ap' && def.mappings.ArrowRight?.color === 'blue' && def.mappings.ArrowRight?.autoEnter === true
);
check('KeyV -> B (Jaune - Fondamental)', def.mappings.KeyV?.output === 'B' && def.mappings.KeyV?.color === 'yellow');
check('KeyG -> H (Violet - Tempo)', def.mappings.KeyG?.output === 'H' && def.mappings.KeyG?.color === 'purple');
check('KeyC -> M (Violet - Tempo)', def.mappings.KeyC?.output === 'M' && def.mappings.KeyC?.color === 'purple');
check('Gommettes visuelles disponibles (Jaune, Vert, Orange, Rouge, Bleu, Violet)', KEY_COLOR_CATEGORIES.length === 6);

console.log('\n== Test 2 : Insertion au curseur (1-to-1 et 1-to-Many) ==');
const insEnd = insertAtCursor('*09A4', '#', 5, 5);
check('Insertion en fin de chaîne (*09A4 + # -> *09A4#)', insEnd.nextValue === '*09A4#' && insEnd.nextCursorPos === 6);

const insMid = insertAtCursor('*09A4#', 'V5', 4, 4);
check(
  'Insertion multi-caractères au milieu du texte à la position du curseur (*09A|4# + V5 -> *09AV54#)',
  insMid.nextValue === '*09AV54#' && insMid.nextCursorPos === 6,
  `obtenu: ${insMid.nextValue} @ ${insMid.nextCursorPos}`
);

const insReplace = insertAtCursor('*09AX14#', 'V5', 4, 6);
check(
  'Remplacement d’une sélection au curseur (*09A[X1]4# -> *09AV54#)',
  insReplace.nextValue === '*09AV54#' && insReplace.nextCursorPos === 6
);

console.log('\n== Test 3 : Gestionnaire handleRemappedKeyDown (preventDefault & Auto-Enter) ==');
let prevented = false;
let changedVal = null;
let committedVal = null;

const resDigit1 = handleRemappedKeyDown(
  {
    code: 'Digit1',
    key: '&',
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {},
  },
  {
    value: '*09A4',
    selectionStart: 5,
    selectionEnd: 5,
    profile: DEFAULT_AZERTY_SCOUT_PROFILE,
    onChange: (v) => { changedVal = v; },
    onCommit: (v) => { committedVal = v; },
  }
);

check('Digit1 intercepté et preventDefault() appelé', resDigit1.handled === true && prevented === true);
check('Digit1 injecte "#" -> "*09A4#" sans auto-validation', changedVal === '*09A4#' && committedVal === null);

prevented = false;
changedVal = null;
committedVal = null;

const resArrowRight = handleRemappedKeyDown(
  {
    code: 'ArrowRight',
    key: 'ArrowRight',
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {},
  },
  {
    value: '*09A4',
    selectionStart: 5,
    selectionEnd: 5,
    profile: DEFAULT_AZERTY_SCOUT_PROFILE,
    onChange: (v) => { changedVal = v; },
    onCommit: (v) => { committedVal = v; },
  }
);

check('ArrowRight intercepté et preventDefault() appelé', resArrowRight.handled === true && prevented === true);
check('ArrowRight injecte "ap" -> "*09A4ap"', changedVal === '*09A4ap');
check('ArrowRight déclenche immédiatement onCommit("*09A4ap") grâce à autoEnter: true', committedVal === '*09A4ap' && resArrowRight.autoCommitted === true);

// Vérifie que Ctrl+C n'est pas intercepté même si KeyC est mappé
const resCtrlC = findMatchingMapping({ code: 'KeyC', key: 'c', ctrlKey: true }, DEFAULT_AZERTY_SCOUT_PROFILE);
check('Ctrl+C n’est pas intercepté par le mapping de KeyC', resCtrlC === null);

console.log('\n== Test 4 : Export et Import de profil (.json) ==');
const customProfile = getDefaultKeyboardProfile();
customProfile.name = 'Mon Profil Pro';
customProfile.mappings.F7 = {
  id: 'map_f7',
  code: 'F7',
  key: 'F7',
  label: 'Attaque Super 4 (X5)',
  output: 'X5',
  color: 'purple',
  autoEnter: false,
  enabled: true,
};
const exportedJson = exportProfileToJson(customProfile);
const reimported = validateAndImportProfileJson(exportedJson);
check('Export / Import JSON conserve le nom du profil', reimported.name === 'Mon Profil Pro');
check('Export / Import JSON conserve la macro personnalisée F7 -> X5', reimported.mappings.F7?.output === 'X5');

console.log('\n== Test 5 : Support natif de *p et ap dans le parseur DataVolley ==');
check('*p seul est valide', validateAction('*p').valid === true);
check('ap seul est valide', validateAction('ap').valid === true);
check('Description de *p mentionne équipe à domicile', describeCode('*p').includes('domicile'));
check('Description de ap mentionne équipe extérieure', describeCode('ap').includes('extérieure'));

const seqHomeWin = parseSequence('*09A4*p');
check('*09A4*p résout l’attaque en gagnante (*09A4#)', seqHomeWin.length === 1 && seqHomeWin[0].code === '*09A4#' && seqHomeWin[0].valid === true);

const seqAwayWin = parseSequence('*09A4ap');
check('*09A4ap résout l’attaque domicile en faute (*09A4=)', seqAwayWin.length === 1 && seqAwayWin[0].code === '*09A4=' && seqAwayWin[0].valid === true);

const seqAfterEval = parseSequence('*01S+a06R#*09A4+ap');
const made = makeActions(seqAfterEval);
check('Séquence complète terminée par ap met à jour la dernière action en faute (=)', made.length === 3 && made[2].code === '*09A4=');

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) dans keyboard-remap.spec.mjs`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests Keyboard Remapping & Macros ont réussi !');
}
