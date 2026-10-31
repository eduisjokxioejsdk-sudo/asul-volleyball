// Vérifie que les raccourcis de codage sont bien partagés par TOUS les modes
// (Data Volley, Direct, Entraînement, Académie) :
//   • une seule clé de stockage (`dv.shortcuts`) ;
//   • reprise automatique des anciennes clés par match / session ;
//   • fusion avec les valeurs par défaut (une touche oubliée garde son défaut).
// Exécution : node client/scripts/coding-shortcuts.spec.mjs
import {
  CODING_SHORTCUTS_KEY,
  defaultShortcuts,
  loadCodingShortcuts,
  saveShortcuts,
} from '../src/utils/shortcuts.js';
import { handleCodeFieldKeyDown } from '../src/utils/keyboardRemap.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `attendu ${e} — obtenu ${a}`);
}

/** Stockage mémoire (localStorage simulé). */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => map,
  };
}

const store = memoryStorage();
globalThis.localStorage = store;

const defaults = defaultShortcuts();

console.log('\n== Test 1 : aucune sauvegarde → valeurs par défaut ==');
eq('Touches par défaut', loadCodingShortcuts(), defaults);
check('Clé commune attendue', CODING_SHORTCUTS_KEY === 'dv.shortcuts', CODING_SHORTCUTS_KEY);

console.log('\n== Test 2 : reprise d’une ancienne clé par match ==');
store.removeItem(CODING_SHORTCUTS_KEY);
store.setItem('dv.shortcuts.video.42', JSON.stringify({ validate: 'Tab', clearBuffer: 'Delete' }));
const migrated = loadCodingShortcuts(['dv.shortcuts.video.42']);
eq('Réglage du match repris', { validate: migrated.validate, clearBuffer: migrated.clearBuffer }, {
  validate: 'Tab',
  clearBuffer: 'Delete',
});
check('Réglage copié dans la clé commune', store.getItem(CODING_SHORTCUTS_KEY) !== null);
eq('Les autres touches gardent leur défaut', migrated.pause, defaults.pause);

console.log('\n== Test 3 : la clé commune est prioritaire ==');
store.setItem('dv.shortcuts.live.7', JSON.stringify({ validate: 'F8' }));
eq(
  'Une modification ultérieure d’une ancienne clé est ignorée',
  loadCodingShortcuts(['dv.shortcuts.live.7']).validate,
  'Tab'
);

console.log('\n== Test 4 : enregistrement partagé entre modes ==');
saveShortcuts(CODING_SHORTCUTS_KEY, { ...defaults, validate: 'Enter', pause: 'p', inconnu: 'x' });
const shared = loadCodingShortcuts(['dv.shortcuts.video.42']);
eq('Nouvelle touche enregistrée', shared.pause, 'p');
check('Identifiant inconnu ignoré', shared.inconnu === undefined);

console.log('\n== Test 5 : réglage partiel (ancien format) ==');
store.setItem(CODING_SHORTCUTS_KEY, JSON.stringify({ speedUp: 'PageUp' }));
const partial = loadCodingShortcuts();
eq('Touche personnalisée conservée', partial.speedUp, 'PageUp');
eq('Touches absentes = défaut', partial.validate, defaults.validate);
eq('Touches absentes = défaut (navigation)', partial.backspace, defaults.backspace);

console.log('\n== Test 6 : champ de code — validation par le raccourci commun ==');
/** Événement clavier simulé (comme un vrai KeyboardEvent). */
function keyEvent(props = {}) {
  const event = {
    key: props.key || '',
    code: props.code || '',
    ctrlKey: Boolean(props.ctrlKey),
    metaKey: false,
    altKey: false,
    prevented: false,
    stopPropagation() {},
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}
const sharedShortcuts = defaultShortcuts();

let submitted = 0;
let cancelled = 0;
let fieldValue = '';
const fieldOptions = {
  value: '*09A4',
  onChange: (next) => { fieldValue = next; },
  onSubmit: () => { submitted += 1; },
  onCancel: () => { cancelled += 1; },
  profile: null,
  shortcuts: sharedShortcuts,
};

const enter = keyEvent({ key: 'Enter', code: 'Enter' });
check('Entrée traitée', handleCodeFieldKeyDown(enter, fieldOptions));
check('Entrée → validation', submitted === 1, `submitted=${submitted}`);
check('Entrée → comportement natif bloqué', enter.prevented);

console.log('\n== Test 7 : champ de code — remapping AZERTY Scout ==');
fieldValue = '';
const digit1 = keyEvent({ key: '&', code: 'Digit1' });
check('Digit1 traité', handleCodeFieldKeyDown(digit1, { ...fieldOptions, value: '*09A4' }));
eq('Digit1 insère « # » au lieu de « & »', fieldValue, '*09A4#');
check('La macro n’a pas validé', submitted === 1, `submitted=${submitted}`);

console.log('\n== Test 8 : champ de code — annulation ==');
const escape = keyEvent({ key: 'Escape', code: 'Escape' });
check('Échap traité', handleCodeFieldKeyDown(escape, fieldOptions));
check('Échap → annulation', cancelled === 1, `cancelled=${cancelled}`);

const custom = { ...sharedShortcuts, validate: 'Tab', clearBuffer: 'F9' };
submitted = 0;
const tab = keyEvent({ key: 'Tab', code: 'Tab' });
check('Touche de validation personnalisée reconnue', handleCodeFieldKeyDown(tab, { ...fieldOptions, shortcuts: custom }));
check('Tab → validation', submitted === 1, `submitted=${submitted}`);
check('Échap reste une annulation', handleCodeFieldKeyDown(keyEvent({ key: 'Escape', code: 'Escape' }), { ...fieldOptions, shortcuts: custom }));

console.log('\n== Test 9 : macro auto-validante (flèche → ap) ==');
let macroSubmits = 0;
let macroValue = '';
const arrow = keyEvent({ key: 'ArrowRight', code: 'ArrowRight' });
handleCodeFieldKeyDown(arrow, {
  value: '*09A4',
  onChange: (next) => { macroValue = next; },
  onSubmit: () => { macroSubmits += 1; },
  shortcuts: sharedShortcuts,
});
eq('Flèche droite insère « ap »', macroValue, '*09A4ap');
check('Sans commitOnMacro, aucune validation automatique', macroSubmits === 0, `submits=${macroSubmits}`);
handleCodeFieldKeyDown(keyEvent({ key: 'ArrowRight', code: 'ArrowRight' }), {
  value: '*09A4',
  onChange: (next) => { macroValue = next; },
  onSubmit: () => { macroSubmits += 1; },
  shortcuts: sharedShortcuts,
  commitOnMacro: true,
});
check('Avec commitOnMacro, la macro valide', macroSubmits === 1, `submits=${macroSubmits}`);

if (failures) {
  console.log(`\n${failures} test(s) en échec.`);
  process.exit(1);
}
console.log('\n✅ Tous les tests des raccourcis partagés ont réussi !');
