// Vérifie l'horodatage « par code » façon DataVolley 4 : chaque bloc de saisie
// garde le temps vidéo de l'instant où il est terminé, même si toute la suite
// est validée d'un seul coup.
// Exécution : node client/scripts/block-timecodes.spec.mjs
import {
  itemTimecodes,
  makeActions,
  nextBlockTimes,
  parseSequence,
  restampPendingBlockTimes,
  splitInputBlocks,
} from '../src/utils/datavolley.js';

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

console.log('\n== Blocs de saisie ==');
eq('tampon vide', splitInputBlocks('').length, 0);
eq('un code = un bloc', splitInputBlocks('*01S5#').length, 1);
eq('deux codes = deux blocs', splitInputBlocks('*01S5#a02R1+').length, 2);
eq(
  'formule combinée = un seul bloc',
  splitInputBlocks('a04SM.06#').map((b) => b.text),
  ['a04SM.06#']
);
eq('la formule combinée produit deux actions', parseSequence('a04SM.06#').length, 2);
eq('texte du dernier bloc', splitInputBlocks('*01S5#a02R1+')[1].text, 'a02R1+');

console.log('\n== Capture du temps, bloc par bloc ==');
eq('premier bloc terminé', nextBlockTimes([], '', '*01S5#', 10), [10]);
eq('nouveau bloc : temps du début de frappe', nextBlockTimes([10], '*01S5#', '*01S5#a', 12), [10, 12]);
eq(
  'bloc complété : temps de la dernière frappe',
  nextBlockTimes([10, 12], '*01S5#a', '*01S5#a02R1+', 14),
  [10, 14]
);
eq(
  'troisième bloc : le deuxième est figé',
  nextBlockTimes([10, 14], '*01S5#a02R1+', '*01S5#a02R1+a', 16),
  [10, 14, 16]
);
eq(
  'retour arrière : le bloc supprimé disparaît',
  nextBlockTimes([10, 14, 16], '*01S5#a02R1+a', '*01S5#a02R1+', 18),
  [10, 14]
);
eq('tampon vidé', nextBlockTimes([10, 14], '*01S5#a02R1+', '', 20), []);
eq(
  'bloc remplacé (pré-remplissage) : nouveau temps',
  nextBlockTimes([10], '*01S5#', 'a02R1+', 30),
  [30]
);
eq(
  'correction du dernier bloc : temps rafraîchi',
  nextBlockTimes([10, 14], '*01S5#a02R1+', '*01S5#a02R1', 32),
  [10, 32]
);
eq('position vidéo inconnue', nextBlockTimes([], '', '*01S5#', null), [null]);
eq('les temps des blocs inchangés sont conservés', nextBlockTimes([7, 8], '*01S5#a02R1+', '*01S5#a02R1+a03A45#', 40), [7, 8, 40]);

console.log('\n== Alignement sur les actions ==');
const TWO = '*01S5#a02R1+';
const timesTwo = nextBlockTimes([], '', '*01S5#', 10);
timesTwo.push(14);
eq('deux blocs → deux temps', itemTimecodes(TWO, timesTwo), [10, 14]);
eq(
  'formule combinée → même temps pour les deux actions',
  itemTimecodes('a04SM.06#', [20]),
  [20, 20]
);
eq(
  'longueur alignée sur parseSequence (formule combinée)',
  itemTimecodes('a04SM.06#', [20]).length,
  parseSequence('a04SM.06#').length
);
eq(
  'bloc invalide : son temps reste aligné',
  itemTimecodes('*0Xa02R1+', [5, 7]),
  [5, 7]
);
eq('temps manquant → null', itemTimecodes(TWO, [10]), [10, null]);

console.log('\n== makeActions avec un temps par action ==');
const ITEMS = [
  { code: '*01S5#', valid: true },
  { code: 'bloc-invalide', valid: false },
  { code: 'a02R1+', valid: true },
];
const actions = makeActions(ITEMS, {
  currentTimecode: 50,
  timecodes: [10, 99, 14],
  startIndex: 5,
  setNumber: 2,
});
eq('deux actions valides', actions.length, 2);
eq('temps de la 1re action', actions[0].timecode, 10);
eq('temps de la 2e action', actions[1].timecode, 14);
eq('index recalculés sans l’item invalide', actions.map((a) => a.action_index), [5, 6]);
eq('set conservé', actions.map((a) => a.set_number), [2, 2]);
const fallback = makeActions(ITEMS, { currentTimecode: 50, timecodes: [null, 99, undefined] });
eq('temps manquant → position vidéo à la validation', fallback.map((a) => a.timecode), [50, 50]);
const legacy = makeActions(ITEMS, { currentTimecode: 50 });
eq('sans tableau de temps : comportement historique', legacy.map((a) => a.timecode), [50, 50]);

console.log('\n== Scénario complet : taper un point puis valider ==');
let times = [];
let previous = '';
const type = (next, now) => {
  times = nextBlockTimes(times, previous, next, now);
  previous = next;
};
type('*01S5', 100);
type('*01S5#', 101);
type('*01S5#a02', 105);
type('*01S5#a02R1+', 107);
type('*01S5#a02R1+a03A45', 110);
type('*01S5#a02R1+a03A45#', 112);
const committed = makeActions(parseSequence(previous), {
  currentTimecode: 999,
  timecodes: itemTimecodes(previous, times),
});
eq('trois actions validées', committed.length, 3);
eq(
  'chaque action a le temps de SON code',
  committed.map((a) => a.timecode),
  [101, 107, 112]
);
eq('les codes sont intacts', committed.map((a) => a.code), ['*01S5#', 'a02R1+', 'a03A45#']);

console.log('\n== Retour en arrière dans la vidéo ==');
const pendingTimes = [390];
eq('les codes en attente reprennent la position courante', restampPendingBlockTimes([390], 360), [360]);
eq(
  'les temps antérieurs (lecture normale) sont conservés',
  restampPendingBlockTimes([100, 108], 120),
  [100, 108]
);
eq(
  'le tableau reçu est renvoyé à l’identique quand rien ne change',
  restampPendingBlockTimes(pendingTimes, 400) === pendingTimes,
  true
);
eq('tolérance : une avance infime est ignorée', restampPendingBlockTimes([120.2], 120), [120.2]);
eq('retour arrière de 30 s sur deux blocs', restampPendingBlockTimes([390, 393], 360), [360, 360]);
eq('position inconnue : rien ne bouge', restampPendingBlockTimes([390], null), [390]);
eq('tampon vide', restampPendingBlockTimes([], 360), []);

console.log('\n== Scénario : revenir en arrière puis valider ==');
let back = [];
let backPrev = '';
const typeBack = (next, now) => {
  back = nextBlockTimes(back, backPrev, next, now);
  backPrev = next;
};
// Le point est codé à 6:30 (390 s)…
typeBack('*01S5#', 390);
typeBack('*01S5#a02R1+', 390);
// … puis on recule la vidéo à 6:00 (360 s) : les codes en attente suivent.
back = restampPendingBlockTimes(back, 360);
eq('blocs ré-horodatés', back, [360, 360]);
const replayed = makeActions(parseSequence(backPrev), {
  currentTimecode: 360,
  timecodes: itemTimecodes(backPrev, back),
});
eq('les actions validées portent la position de l’image', replayed.map((a) => a.timecode), [360, 360]);

console.log('\n== Scénario : serveur pré-rempli du point suivant ==');
const committedPoint = makeActions(parseSequence('*01S5#a02R1+'), {
  currentTimecode: 393,
  timecodes: itemTimecodes('*01S5#a02R1+', [390, 393]),
});
eq('service du point 1', committedPoint[0].timecode, 390);
// Le pré-remplissage repart de zéro (cf. commitBuffer) : le service du point 2
// ne garde pas le temps du point précédent, malgré un code identique.
const next2 = nextBlockTimes([], '*01S5#a02R1+', '*01S5#', 400);
eq('service pré-rempli horodaté à la validation', next2, [400]);
eq('formule alignée après pré-remplissage', itemTimecodes('*01S5#a02R1+', nextBlockTimes(next2, '*01S5#', '*01S5#a02R1+', 404)), [400, 404]);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
