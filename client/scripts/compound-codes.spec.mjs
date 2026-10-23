// ============================================================================
// TEST : ENGINE CODES AUTOMATIQUES & MACROS CLAVIER (Points 10 & 11)
// Exécution : node client/scripts/compound-codes.spec.mjs
// ============================================================================

import {
  applyCompoundAutoCodes,
  simulateCompoundExpansion,
  matchMacroShortcut,
  DEFAULT_AUTO_CODES_CONFIG,
  DEFAULT_KEYBOARD_MACROS,
} from '../src/utils/compoundCodes.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Test 1 : Simulation Formules Combinées S.R (Service ↔ Réception) ==');

// Saisie combinée S.R : *04SM5.06# -> Service *04SM5- et Réception adverse a06R5#
const simSR = simulateCompoundExpansion('*04SM5.06#');
check('Développe 2 actions distinctes depuis la formule combinée S.R', simSR.length === 2, `obtenu: ${simSR.length}`);
check('Calcule l’évaluation du service déduite de la réception', simSR[0].code.includes('-') || simSR[0].code.includes('/'));
check('Génère la réception adverse avec badge isAuto', simSR[1].isAuto === true && simSR[1].code.includes('a06R') && simSR[1].code.includes('#'));

console.log('\n== Test 2 : Simulation Formules Combinées A.B (Attaque ↔ Contre + Auto-Setter) ==');

// Saisie combinée A.B : *09A4.12= -> Auto-Setter *07E# + Attaque *09A4# + Contre adverse a12B=
const simAB = simulateCompoundExpansion('*09A4.12=');
check('Développe Passe Auto-Setter + Attaque + Contre', simAB.length === 3, `obtenu: ${simAB.length}`);
check('Passe du passeur insérée automatiquement', simAB[0].code.includes('E') && simAB[0].code.includes('#') && simAB[0].isAuto === true);
check('Contre adverse marqué comme automatique', simAB[2].isAuto === true && simAB[2].code.includes('B='));

console.log('\n== Test 3 : Auto-Setter (E → A) via applyCompoundAutoCodes ==');

// Attaque précédée d’aucune passe -> insère la passe du passeur n°7
const rawActions = [
  { uid: 'a1', team: 'home', player_number: 9, action: 'A', start_zone: '4', evaluation: '#', code: '*09A4#' },
];

const expanded = applyCompoundAutoCodes(rawActions, {
  homeSetter: 7,
  config: { ...DEFAULT_AUTO_CODES_CONFIG, autoSetterBeforeAttack: true, enabled: true },
});

check('Insère automatiquement la passe avant l’attaque', expanded.length === 2, `obtenu: ${expanded.length}`);
check('La première action est la passe du passeur n°7', expanded[0].action === 'E' && expanded[0].player_number === 7 && expanded[0].is_auto === 1);
check('La deuxième action est l’attaque du joueur n°9', expanded[1].action === 'A' && expanded[1].player_number === 9);

console.log('\n== Test 4 : Macros Clavier (Alt+1 à Alt+0) ==');

const macroAlt1 = matchMacroShortcut({ key: '1', altKey: true, ctrlKey: false, shiftKey: false });
check('Raccourci Alt+1 correspond à la macro Appel K1', macroAlt1 !== null && macroAlt1.snippet === 'EK1#');

const macroAlt5 = matchMacroShortcut({ key: '5', altKey: true, ctrlKey: false, shiftKey: false });
check('Raccourci Alt+5 correspond à la macro Attaque AV5#', macroAlt5 !== null && macroAlt5.snippet === 'AV5#');

const noMacro = matchMacroShortcut({ key: 'k', altKey: false, ctrlKey: false, shiftKey: false });
check('Touche normale ne déclenche pas de macro', noMacro === null);

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) dans le test des codes composés & macros.`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests des codes composés & macros ont réussi !');
}
