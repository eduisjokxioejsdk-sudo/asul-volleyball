// ============================================================================
// Mode Entraînement — logique pure (sans React, testable).
// Génère le contenu des jeux à partir du catalogue DataVolley (datavolley.js) :
//   • catalogue de paires « code ↔ signification » (association / memory) ;
//   • distribution de cartes pour un jeu de paires ;
//   • génération de phrases à traduire en code (jeu chronométré) ;
//   • validation des réponses et calcul de score.
// ============================================================================

import {
  DV_ACTIONS,
  DV_EVALUATIONS,
  DV_TYPES,
  DV_ZONE_KEYS,
  DV_ZONE_LABELS,
  DV_ATTACK_COMBOS,
  DV_SETTER_CALLS,
  describeCode,
  formatCode,
  parseSequence,
} from './datavolley.js';

/** Mélange une copie du tableau (Fisher-Yates) avec un générateur injectable. */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, rng = Math.random) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** Groupes proposés dans les jeux d'association / memory. */
export const TRAINING_GROUPS = [
  { id: 'actions', label: 'Actions (S R A B D E F)' },
  { id: 'evaluations', label: 'Évaluations (# + ! − / =)' },
  { id: 'types', label: 'Types de geste' },
  { id: 'zones', label: 'Zones (1-9)' },
  { id: 'combos', label: 'Combinaisons d’attaque' },
  { id: 'calls', label: 'Appels passeur' },
  { id: 'team', label: 'Équipe (* / a)' },
];

/**
 * Catalogue complet des paires « code ↔ signification » (matière des jeux).
 * @returns {Array<{group:string, code:string, label:string, desc?:string}>}
 */
export function buildPairCatalog() {
  const pairs = [];
  for (const a of DV_ACTIONS) pairs.push({ group: 'actions', code: a.code, label: a.label, desc: a.desc });
  for (const [act, list] of Object.entries(DV_EVALUATIONS)) {
    for (const e of list) {
      pairs.push({ group: 'evaluations', code: e.sym, label: `${e.label} (${act})`, desc: e.desc });
    }
  }
  for (const [act, list] of Object.entries(DV_TYPES)) {
    for (const t of list) {
      pairs.push({ group: 'types', code: t.sym, label: `${t.label} (${act})`, desc: t.desc });
    }
  }
  for (const z of DV_ZONE_KEYS) pairs.push({ group: 'zones', code: z, label: DV_ZONE_LABELS[z] });
  for (const c of DV_ATTACK_COMBOS) pairs.push({ group: 'combos', code: c.code, label: c.label, desc: c.desc });
  for (const k of DV_SETTER_CALLS) pairs.push({ group: 'calls', code: k.code, label: k.label });
  pairs.push({ group: 'team', code: '*', label: 'Domicile' });
  pairs.push({ group: 'team', code: 'a', label: 'Extérieur' });
  return pairs;
}

/** Paires filtrées par groupes sélectionnés (liste vide = tous). */
export function catalogForGroups(catalog, groupIds) {
  const set = new Set(groupIds || []);
  if (set.size === 0) return catalog.slice();
  return catalog.filter((p) => set.has(p.group));
}

/**
 * Distribue `count` paires : renvoie les cartes mélangées (code + libellé).
 * Chaque carte connaît sa paire (`pairId`) et son côté (`code` | `label`).
 * @returns {{cards:Array, pairs:Array, solution:Object}}
 */
export function dealPairs(catalog, count = 6, rng = Math.random) {
  const chosen = shuffle(catalog, rng).slice(0, Math.max(1, count));
  const cards = [];
  const solution = {};
  chosen.forEach((p, idx) => {
    solution[idx] = { code: p.code, label: p.label };
    cards.push({ id: `p${idx}c`, pairId: idx, side: 'code', text: p.code });
    cards.push({ id: `p${idx}l`, pairId: idx, side: 'label', text: p.label });
  });
  return { cards: shuffle(cards, rng), pairs: chosen, solution };
}

/** Vrai si deux cartes forment une paire (même paire, côtés opposés). */
export function isPair(cardA, cardB) {
  return !!cardA && !!cardB && cardA.id !== cardB.id && cardA.pairId === cardB.pairId && cardA.side !== cardB.side;
}

/**
 * Distribue un jeu « relier » : colonne de codes (gauche) + colonne de libellés
 * (droite, mélangés). `solution[pairId]` donne la bonne correspondance.
 * @returns {{left:Array, right:Array, pairs:Array, solution:Object}}
 */
export function dealMatching(catalog, count = 5, rng = Math.random) {
  const chosen = shuffle(catalog, rng).slice(0, Math.max(2, count));
  const left = chosen.map((p, i) => ({ id: i, pairId: i, text: p.code }));
  const right = shuffle(
    chosen.map((p, i) => ({ id: i, pairId: i, text: p.label, desc: p.desc || '' })),
    rng
  );
  const solution = {};
  chosen.forEach((p, i) => {
    solution[i] = { code: p.code, label: p.label };
  });
  return { left, right, pairs: chosen, solution };
}

/**
 * Question à choix multiples : une formule (code) s'affiche, 3 propositions de
 * sens (dont une correcte). Les leurres viennent de la même famille.
 * @returns {{prompt:string, promptDesc:string, options:string[], correctIndex:number, group:string}}
 */
export function generateQuiz(catalog, rng = Math.random) {
  const target = pick(catalog, rng);
  let pool = catalog.filter((p) => p.group === target.group && p.label !== target.label);
  if (pool.length < 2) pool = catalog.filter((p) => p.label !== target.label);
  const decoys = shuffle(pool, rng).slice(0, 2).map((p) => p.label);
  const options = shuffle([target.label, ...decoys], rng);
  return {
    prompt: target.code,
    promptDesc: target.desc || '',
    options,
    correctIndex: options.indexOf(target.label),
    group: target.group,
  };
}

/**
 * Génère un code DataVolley aléatoire CONFORME + sa description française.
 * Options : { skills:[...], withCombo:bool, withZones:bool }
 * @returns {{code:string, desc:string, fields:Object}}
 */
export function generateTranslation(rng = Math.random, opts = {}) {
  const skills = opts.skills && opts.skills.length ? opts.skills : ['S', 'R', 'A', 'B', 'D', 'E', 'F'];
  const action = pick(skills, rng);
  const teamKey = pick(['*', 'a'], rng);
  const playerNumber = 1 + Math.floor(rng() * 99);
  const fields = { teamKey, player_number: playerNumber, action };

  if (action === 'A' && opts.withCombo !== false && rng() < 0.75) {
    fields.combo = pick(DV_ATTACK_COMBOS, rng).code;
  } else if (action === 'E' && rng() < 0.6) {
    fields.call = pick(DV_SETTER_CALLS, rng).code;
  } else if (DV_TYPES[action] && rng() < 0.55) {
    fields.type = pick(DV_TYPES[action], rng).sym;
  }

  if (opts.withZones !== false && !fields.call) {
    if (action === 'S') {
      if (rng() < 0.6) fields.end_zone = pick(DV_ZONE_KEYS, rng);
    } else if (!fields.combo) {
      if (rng() < 0.5) fields.start_zone = pick(DV_ZONE_KEYS, rng);
      if (rng() < 0.4) fields.end_zone = pick(DV_ZONE_KEYS, rng);
    }
  }

  const evals = DV_EVALUATIONS[action] || [];
  fields.evaluation = pick(evals, rng).sym;

  const code = formatCode(fields);
  return { code, desc: describeCode(code), fields };
}

/** Normalise une réponse : forme canonique d'un code unique valide, ou null. */
export function normalizeAnswer(input) {
  const items = parseSequence(input || '');
  if (items.length === 1 && items[0].valid) return items[0].code;
  return null;
}

/** Vrai si la réponse correspond au code attendu (comparaison canonique). */
export function checkAnswer(input, expected) {
  const norm = normalizeAnswer(input);
  if (!norm) return false;
  return norm.toUpperCase() === String(expected || '').toUpperCase();
}

/**
 * Met à jour le score après une réponse.
 * @returns {{score:number, streak:number, best:number}}
 */
export function applyAnswer(state, correct) {
  const prev = state.streak || 0;
  const streak = correct ? prev + 1 : 0;
  return {
    score: (state.score || 0) + (correct ? 10 + Math.min(prev, 10) : 0),
    streak,
    best: Math.max(state.best || 0, streak),
  };
}
