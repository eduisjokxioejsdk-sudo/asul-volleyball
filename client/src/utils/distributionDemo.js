// ============================================================================
// MODE DÉMO — Générateur de possessions fictives pour l'onglet Distribution.
//
// Produit un jeu de données local (aucun appel réseau, aucun match réel) au
// format exact des possessions du moteur Excel :
//   matchLabel, rotation, setterNumber, serviceType, receptionZone,
//   receptionQuality, passZone, baseOff, distribCode, attackerNumber,
//   attackResult.
//
// Le générateur est déterministe : une même graine produit le même tableau,
// ce qui rend le mode démo reproductible et testable.
// ============================================================================

import { mapDistribToCourtBox } from './excelDistributionEngine.js';

/** Nom de l'équipe fictive affichée dans l'en-tête du rapport. */
export const DEMO_TEAM_NAME = 'ASUL Volley · Équipe démo';

/** Les deux passeurs fictifs, pour tester les onglets Passeur N°X. */
export const DEMO_SETTERS = [
  { number: '6', name: 'Passeur #6 (démo)' },
  { number: '12', name: 'Passeur #12 (démo)' },
];

/** Joueurs fictifs utilisés comme attaquants (numéro + nom affiché). */
export const DEMO_PLAYERS = [
  { number: '2', name: 'Central #2 (démo)' },
  { number: '9', name: 'Central #9 (démo)' },
  { number: '4', name: 'Réceptionneur #4 (démo)' },
  { number: '7', name: 'Réceptionneur #7 (démo)' },
  { number: '3', name: 'Réceptionneur #3 (démo)' },
  { number: '11', name: 'Opposé #11 (démo)' },
];

/** Les matchs fictifs : le passeur alterne comme dans une vraie rotation d'effectif. */
export const DEMO_MATCHES = [
  { id: 'demo_j1', label: 'J1 · vs Lyon', setterNumber: '6' },
  { id: 'demo_j2', label: 'J2 · à Nantes', setterNumber: '6' },
  { id: 'demo_j3', label: 'J3 · vs Paris', setterNumber: '6' },
  { id: 'demo_j4', label: 'J4 · à Marseille', setterNumber: '12' },
  { id: 'demo_j5', label: 'J5 · vs Bordeaux', setterNumber: '12' },
  { id: 'demo_j6', label: 'J6 · à Toulouse', setterNumber: '6' },
];

/** Zones de réception (1 à 9), pondérées comme une réception réaliste. */
const RECEPTION_ZONES = [
  ['1', 14],
  ['2', 7],
  ['3', 10],
  ['4', 7],
  ['5', 13],
  ['6', 17],
  ['7', 12],
  ['8', 11],
  ['9', 9],
];

/** Qualités de réception du modèle (R#, R+, R0, R!, R-, ERR). */
const RECEPTION_QUALITIES = [
  ['#', 26],
  ['+', 30],
  ['0', 17],
  ['!', 11],
  ['-', 10],
  ['ERR', 6],
];

/** Les 13 sous-zones de passe, regroupées par situation (mini / moyenne / bonne). */
const PASS_ZONE_GROUPS = {
  MINI: [
    ['1', 34],
    ['6', 40],
    ['5', 26],
  ],
  MOYENNE: [
    ['9', 16],
    ['8A', 18],
    ['8', 30],
    ['8C', 18],
    ['7', 18],
  ],
  BONNE: [
    ['2', 30],
    ['3A', 22],
    ['3', 24],
    ['3C', 14],
    ['4', 10],
  ],
};

/** Probabilité de chaque situation de passe selon la qualité de réception. */
const PASS_SITUATION_BY_QUALITY = {
  '#': [['MINI', 70], ['MOYENNE', 28], ['BONNE', 2]],
  '+': [['MINI', 45], ['MOYENNE', 48], ['BONNE', 7]],
  '0': [['MINI', 20], ['MOYENNE', 58], ['BONNE', 22]],
  '!': [['MINI', 8], ['MOYENNE', 50], ['BONNE', 42]],
  '-': [['MINI', 2], ['MOYENNE', 30], ['BONNE', 68]],
  ERR: [['MINI', 2], ['MOYENNE', 30], ['BONNE', 68]],
  CNT: [['MINI', 15], ['MOYENNE', 55], ['BONNE', 30]],
};

/** Probabilité d'une fixation du central selon la situation de passe. */
const SITUATION_BASE_WEIGHTS = {
  MINI: [['FIX', 92], ['NONE', 8]],
  MOYENNE: [['FIX', 82], ['NONE', 18]],
  BONNE: [['FIX', 42], ['NONE', 58]],
};

/** Génère un générateur pseudo-aléatoire reproductible (algorithme mulberry32). */
function createRng(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tire une valeur dans une liste de [valeur, poids]. */
function pickWeighted(rng, items) {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng() * total;
  for (const [value, weight] of items) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return items[items.length - 1][0];
}

/** Situe la zone de passe dans l'une des 3 situations du rapport Excel. */
function passZoneSituation(zone) {
  if (PASS_ZONE_GROUPS.MINI.some(([key]) => key === zone)) return 'MINI';
  if (PASS_ZONE_GROUPS.MOYENNE.some(([key]) => key === zone)) return 'MOYENNE';
  return 'BONNE';
}

/** Le passeur est-il en ligne avant (ZP4, ZP3, ZP2) pour cette rotation ? */
function isSetterFrontRow(rotation) {
  return rotation === 4 || rotation === 3 || rotation === 2;
}

/** Choix de la base offensive (annonce du central), cohérent avec la rotation. */
function pickBaseOff(rng, rotation, situation) {
  const fixation = pickWeighted(rng, SITUATION_BASE_WEIGHTS[situation]) === 'FIX';
  if (!fixation) return '0';

  const options = isSetterFrontRow(rotation)
    ? [
        ['2', 45],
        ['7', 35],
        ['1', 20],
      ]
    : [
        ['1', 45],
        ['7', 35],
        ['2', 20],
      ];
  return pickWeighted(rng, options);
}

/** Code de distribution `DISTRIB P` (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, PM). */
function pickDistribCode(rng, rotation, baseOff) {
  // En ZP1/ZP6/ZP5 le passeur est arrière : l'opposé attaque devant (EN 2).
  // En ZP4/ZP3/ZP2 le passeur est avant : l'opposé attaque derrière (EN 1).
  const oppositeCode = isSetterFrontRow(rotation) ? '8' : '6';

  const options = [
    [oppositeCode, 24],
    ['5', 20], // EN 4 (réceptionneur)
    ['9', 6], // EN 4 variante
    ['10', 12], // PIPE
    ['4', 6], // AUTRES / DIV
    ['PM', 2], // ballon dévié
  ];

  if (baseOff === '1') options.push(['1', 8], ['1C', 4], ['3', 2]);
  else if (baseOff === '2') options.push(['2', 14]);
  else if (baseOff === '7') options.push(['7', 14]);

  return pickWeighted(rng, options);
}

/** Attaquant fictif cohérent avec la zone de distribution. */
function pickAttacker(rng, distribCode) {
  const centralNumbers = ['2', '9'];
  const receiverNumbers = ['4', '7', '3'];
  const oppositeNumbers = ['11'];

  let pool;
  const d = String(distribCode || '').toUpperCase();
  if (d === '1' || d === '1C' || d === '3' || d === '2' || d === '7') {
    pool = centralNumbers;
  } else if (d === '6' || d === '8') {
    pool = oppositeNumbers;
  } else if (d === '5' || d === '9') {
    pool = ['4', '7'];
  } else if (d === '10') {
    pool = ['3', '7'];
  } else {
    pool = receiverNumbers;
  }

  const number = pool[Math.floor(rng() * pool.length)];
  const player = DEMO_PLAYERS.find((p) => p.number === number);
  return { number, name: player?.name || '' };
}

/** Résultat d'attaque du modèle (#, +, 0, /, ERR), un peu plus efficace au centre. */
function pickAttackResult(rng, distribCode) {
  const d = String(distribCode || '').toUpperCase();
  const isCentral = d === '1' || d === '1C' || d === '3' || d === '2' || d === '7';
  if (isCentral) {
    return pickWeighted(rng, [
      ['#', 50],
      ['+', 16],
      ['0', 12],
      ['/', 10],
      ['ERR', 12],
    ]);
  }
  return pickWeighted(rng, [
    ['#', 38],
    ['+', 20],
    ['0', 16],
    ['/', 13],
    ['ERR', 13],
  ]);
}

/**
 * Construit les possessions fictives du mode démo.
 *
 * @param {object} options
 * @param {number} [options.seed=1] Graine : une autre graine = un autre tableau.
 * @param {number} [options.possessionsPerMatch=45] Nombre de possessions par match.
 * @returns {Array<object>} Possessions au format `computeExcelDistributionReport`.
 */
export function buildDemoDistributionPossessions({ seed = 1, possessionsPerMatch = 45 } = {}) {
  const rng = createRng(seed);
  const possessions = [];
  const perMatch = Math.max(6, Number(possessionsPerMatch) || 45);

  DEMO_MATCHES.forEach((match, matchIndex) => {
    for (let i = 0; i < perMatch; i += 1) {
      // Les 6 rotations tournent de façon équilibrée pour alimenter chaque ZP.
      const rotation = ((i + matchIndex) % 6) + 1;

      // Phase : K1 (S + F + T) majoritaire, K2 (C) pour la contre-attaque.
      const serviceType = pickWeighted(rng, [
        ['S', 46],
        ['F', 10],
        ['T', 10],
        ['C', 34],
      ]);
      const isCounterAttack = serviceType === 'C';

      // Contre-attaque : pas de réception ; sinon zone et qualité de réception.
      const receptionZone = isCounterAttack ? '' : pickWeighted(rng, RECEPTION_ZONES);
      const receptionQuality = isCounterAttack ? '' : pickWeighted(rng, RECEPTION_QUALITIES);

      // Zone de passe : corrélée à la qualité de réception.
      const situation = isCounterAttack
        ? pickWeighted(rng, PASS_SITUATION_BY_QUALITY.CNT)
        : pickWeighted(rng, PASS_SITUATION_BY_QUALITY[receptionQuality] || PASS_SITUATION_BY_QUALITY.CNT);
      const passZone = pickWeighted(rng, PASS_ZONE_GROUPS[situation]);

      // La base offensive dépend de la situation de passe (une passe dégradée
      // laisse moins souvent la possibilité de fixer le central).
      const baseOff = pickBaseOff(rng, rotation, passZoneSituation(passZone));

      const distribCode = pickDistribCode(rng, rotation, baseOff);
      const attacker = pickAttacker(rng, distribCode);
      const attackResult = pickAttackResult(rng, distribCode);

      // Un passeur peut être « NP » quand un autre joueur joue le 2e ballon.
      const setterNumber = rng() < 0.06 ? 'NP' : match.setterNumber;

      possessions.push({
        id: `demo_${match.id}_${i + 1}`,
        source: 'demo',
        rowNum: matchIndex * perMatch + i + 16,
        matchId: match.id,
        matchName: match.label,
        matchLabel: match.label,
        setNumber: Math.floor(i / 15) + 1,
        rallyIndex: i + 1,
        rotation,
        setterNumber,
        serviceType,
        receptionZone,
        receptionQuality,
        passZone,
        baseOff,
        distribCode,
        distribBox: mapDistribToCourtBox(distribCode, null) || '',
        attackerNumber: attacker.number,
        attackerName: attacker.name,
        attackResult,
        videoTime: null,
        videoId: null,
        videoUrl: null,
        rawAttackCode: '',
        rawSetCode: '',
      });
    }
  });

  return possessions;
}

export default buildDemoDistributionPossessions;

