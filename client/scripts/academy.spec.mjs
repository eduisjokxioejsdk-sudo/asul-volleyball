// Contrôle la couverture du programme de l'Académie par rapport au parseur DataVolley.
// Exécution : node client/scripts/academy.spec.mjs
import assert from 'node:assert/strict';
import {
  DV_ACTIONS, DV_EVALUATIONS, DV_TYPES, DV_TYPE_ALIASES, DV_ZONE_KEYS, DV_ZONE_LABELS, DV_SUBZONE_KEYS,
  DV_ATTACK_COMBOS_DEFAULT, DV_SETTER_CALLS, DV_BLOCKER_COUNTS,
  DV_EXTENDED_HIT_TYPES, DV_EXTENDED_SPECIALS, parseSequence,
} from '../src/utils/datavolley.js';
import { ACADEMY_WORLDS, ACADEMY_UNITS, ACADEMY_COVERAGE_ITEMS, validateAcademyAnswer } from '../src/utils/academy.js';

const keys = new Set(ACADEMY_COVERAGE_ITEMS.map((item) => item.key));
const ids = new Set(ACADEMY_UNITS.map((unit) => unit.id));
assert.equal(ids.size, ACADEMY_UNITS.length, 'les identifiants de niveaux sont uniques');

for (const action of DV_ACTIONS) assert(keys.has(`action:${action.code}`), `action absente: ${action.code}`);
for (const [action, evaluations] of Object.entries(DV_EVALUATIONS)) {
  for (const evaluation of evaluations) assert(keys.has(`evaluation:${action}:${evaluation.sym}`), `évaluation absente: ${action}${evaluation.sym}`);
}
for (const [action, types] of Object.entries(DV_TYPES)) {
  for (const type of types) assert(keys.has(`type:${action}:${type.sym}`), `type absent: ${action}${type.sym}`);
}
for (const [action, aliases] of Object.entries(DV_TYPE_ALIASES)) {
  for (const alias of Object.keys(aliases)) assert(keys.has(`type-alias:${action}:${alias}`), `alias absent: ${action}${alias}`);
}
for (const zone of DV_ZONE_KEYS) {
  assert(keys.has(`zone:${zone}`), `zone absente: ${zone}`);
  assert(DV_ZONE_LABELS[zone], `zone sans description: ${zone}`);
}
for (const subzone of DV_SUBZONE_KEYS) assert(keys.has(`subzone:${subzone}`), `sous-zone absente: ${subzone}`);
for (const combo of DV_ATTACK_COMBOS_DEFAULT) assert(keys.has(`combo:${combo.code}`), `combinaison absente: ${combo.code}`);
for (const call of DV_SETTER_CALLS) assert(keys.has(`setter:${call.code}`), `appel passeur absent: ${call.code}`);
for (const item of DV_BLOCKER_COUNTS) assert(keys.has(`blockers:${item.code}`), `nombre de contreurs absent: ${item.code}`);
for (const item of DV_EXTENDED_HIT_TYPES) assert(keys.has(`hit:${item.code}`), `type de frappe absent: ${item.code}`);
for (const item of DV_EXTENDED_SPECIALS) assert(keys.has(`special:${item.code}`), `code spécial absent: ${item.code}`);

for (const item of ACADEMY_COVERAGE_ITEMS) {
  assert(item.explanation?.trim(), `${item.key}: explication manquante`);
  assert(item.example?.trim(), `${item.key}: exemple manquant`);
  assert(item.exercise?.prompt?.trim(), `${item.key}: exercice manquant`);
  assert(item.exercise?.answer?.trim(), `${item.key}: réponse manquante`);
  const parsed = item.exercise.answer.trim().split(/\s+/).flatMap((part) => parseSequence(part));
  assert(parsed.length > 0 && parsed.every((part) => part.valid), `${item.key}: exemple d'exercice refusé (${item.exercise.answer})`);
  assert(validateAcademyAnswer(item.exercise.answer, item.exercise.answer), `${item.key}: réponse attendue rejetée`);
}

for (const unit of ACADEMY_UNITS) {
  if (unit.kind === 'tutorial') {
    assert(unit.path?.startsWith('/'), `${unit.id}: route de tutoriel absente`);
    assert(unit.steps?.length >= 3, `${unit.id}: étapes interactives insuffisantes`);
  }
  if (unit.kind === 'simulation') {
    assert(unit.scenario && unit.questions?.length, `${unit.id}: simulation incomplète`);
    for (const question of unit.questions) {
      const parsed = question.answer.trim().split(/\s+/).flatMap((part) => parseSequence(part));
      assert(parsed.length > 0 && parsed.every((part) => part.valid), `${unit.id}: réponse de simulation invalide (${question.answer})`);
    }
  }
}

assert(ACADEMY_WORLDS.some((world) => world.units.some((unit) => unit.kind === 'tutorial')), 'mondes de tutoriels présents');
assert(ACADEMY_WORLDS.some((world) => world.units.some((unit) => unit.kind === 'simulation')), 'mondes de simulations présents');
assert(!validateAcademyAnswer('*04S+', '*04S#'), 'une mauvaise évaluation est refusée');
console.log(`Académie OK — ${ACADEMY_WORLDS.length} mondes, ${ACADEMY_UNITS.length} niveaux, ${ACADEMY_COVERAGE_ITEMS.length} notions couvertes.`);
