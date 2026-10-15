// Vérifie le contenu des leçons de Formation (client/src/utils/lessons.js).
// Exécution : node client/scripts/lessons.spec.mjs
import { LESSONS, generateRecall, checkLessonAnswer, normalizeLessonAnswer } from '../src/utils/lessons.js';

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

console.log('\n== Leçons ==');
check('11 leçons', LESSONS.length === 11);
for (const l of LESSONS) {
  check(`${l.id} — 5 à 7 diapos`, l.theory.length >= 5 && l.theory.length <= 7);
  check(`${l.id} — 10 évaluations`, l.eval.length === 10);
  check(`${l.id} — 10 formules d’entraînement`, l.practice.length === 10);
  const allSelf = l.eval.every((it) => checkLessonAnswer(it.answer, it.answer));
  check(`${l.id} — réponses cohérentes`, allSelf);
  const practiceOk = l.practice.every((p) => checkLessonAnswer(p.code, p.code));
  check(`${l.id} — formules d’entraînement cohérentes`, practiceOk);
}

console.log('\n== Validation ==');
check('mauvaise réponse rejetée', !checkLessonAnswer('*04S#', '*04S+'));
check('bonne réponse acceptée', checkLessonAnswer('*04S+', '*04S+'));
check('omission du * acceptée', checkLessonAnswer('12S.10+', '*12S.10+'));
check('formule combinée acceptée', checkLessonAnswer('05AV66.12D#', '*05AV66.12D#'));
check('rallye complet accepté', checkLessonAnswer('*07R# *03E+ *09A45#', '*07R# *03E+ *09A45#'));
check('code manuel accepté', checkLessonAnswer('C5:12', 'C5:12'));
check('normalisation sans espace', normalizeLessonAnswer('12S.10+') === normalizeLessonAnswer('*12S.10+'));

console.log('\n== Leçon de rappel ==');
const rec = generateRecall(LESSONS.slice(0, 3).map((l) => l.id), 5, 10);
check('rappel généré', !!rec && rec.theory.length === 5 && rec.eval.length === 10);
check('rappel : une seule leçon → OK', !!generateRecall(['l1'], 5, 10));
check('rappel sans leçon validée → null', generateRecall([], 5, 10) === null);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
