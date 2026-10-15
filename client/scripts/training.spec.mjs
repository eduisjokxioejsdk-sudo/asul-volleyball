// Vérifie la logique du mode Entraînement (client/src/utils/training.js).
// Exécution : node client/scripts/training.spec.mjs
import {
  buildPairCatalog,
  catalogForGroups,
  dealPairs,
  isPair,
  dealMatching,
  generateQuiz,
  generateTranslation,
  normalizeAnswer,
  checkAnswer,
  applyAnswer,
} from '../src/utils/training.js';
import { isValidCode } from '../src/utils/datavolley.js';

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

// Générateur déterministe (pour des tests reproductibles).
function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('\n== Catalogue de paires ==');
const catalog = buildPairCatalog();
check('catalogue non vide', catalog.length > 50);
check('actions présentes', catalog.some((p) => p.group === 'actions' && p.code === 'S'));
check('combinaisons présentes', catalog.some((p) => p.group === 'combos' && p.code === 'X1'));
check('zones présentes', catalog.filter((p) => p.group === 'zones').length === 9);
check('filtre par groupe', catalogForGroups(catalog, ['zones']).every((p) => p.group === 'zones'));
check('liste vide = tout', catalogForGroups(catalog, []).length === catalog.length);

console.log('\n== Distribution de paires ==');
const deal = dealPairs(catalog, 6, mulberry32(1));
check('12 cartes pour 6 paires', deal.cards.length === 12);
check('6 paires mémorisées', Object.keys(deal.solution).length === 6);
const codeCard = deal.cards.find((c) => c.side === 'code');
const labelCard = deal.cards.find((c) => c.side === 'label' && c.pairId === codeCard.pairId);
check('isPair : bonne paire', isPair(codeCard, labelCard));
check('isPair : même côté refusé', !isPair(codeCard, deal.cards.find((c) => c.side === 'code' && c.pairId !== codeCard.pairId)));

console.log('\n== Jeu « relier » ==');
const m = dealMatching(catalog, 5, mulberry32(3));
check('5 codes à gauche', m.left.length === 5);
check('5 libellés à droite', m.right.length === 5);
check('solution complète', Object.keys(m.solution).length === 5);
check(
  'chaque code a son libellé',
  m.left.every((l) => m.right.some((r) => r.pairId === l.pairId && r.text === m.solution[l.pairId].label))
);

console.log('\n== QCM ==');
let quizOk = true;
const qrng = mulberry32(99);
for (let i = 0; i < 200; i += 1) {
  const q = generateQuiz(catalog, qrng);
  if (q.options.length !== 3) quizOk = false;
  if (!(q.correctIndex >= 0 && q.correctIndex < q.options.length)) quizOk = false;
  if (!q.prompt) quizOk = false;
}
check('200 QCM : 3 options + bonne réponse valide', quizOk);

console.log('\n== Génération de traduction ==');
let allValid = true;
let withCombo = 0;
const rng = mulberry32(42);
for (let i = 0; i < 400; i += 1) {
  const p = generateTranslation(rng);
  if (!isValidCode(p.code)) allValid = false;
  if (!p.desc || p.desc.startsWith('Code non conforme')) allValid = false;
  if (p.fields.combo) withCombo += 1;
}
check('400 codes générés tous conformes + décrits', allValid);
check('des combinaisons apparaissent', withCombo > 0);

console.log('\n== Validation des réponses ==');
const ex = generateTranslation(mulberry32(7));
check('réponse correcte acceptée', checkAnswer(ex.code, ex.code));
check('réponse fausse refusée', !checkAnswer('a01S=', ex.code));
check('normalisation d’un code', normalizeAnswer('*1A#') === '*01A#');
check('réponse non conforme → null', normalizeAnswer('*09A') === null);

console.log('\n== Score ==');
let s = { score: 0, streak: 0, best: 0 };
s = applyAnswer(s, true);
s = applyAnswer(s, true);
const after2 = s.score;
s = applyAnswer(s, false);
check('bonus de série', after2 === 21 && s.streak === 0 && s.best === 2);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
