// ============================================================================
// Langage de codage DataVolley (ASUL) — conforme au standard DataVolley 4.
//
// FORMULE COMPACTE (ce que l'on tape au clavier)
//   [équipe][joueur 1-2 chiffres][action][type?][zones?][évaluation]
//     équipe     : '*' = domicile, 'a' = extérieur
//     joueur     : '1'..'99' (complété à 2 chiffres)
//     action     : S R A B D E F   (voir DV_ACTIONS)
//     type       : lettre facultative, dépend de l'action (voir DV_TYPES)
//     zones      : 1 chiffre = zone de départ ; 2 chiffres = départ + arrivée ;
//                  + lettre A-D = sous-zone d'arrivée (voir DV_ZONE_LABELS)
//     évaluation : # + ! - / =   (voir DV_EVALUATIONS)
//
// FORMULE COMBINÉE (service + réception en une frappe)
//   a04SM.06#  -> service du n°04 extérieur (type M) PUIS réception du n°06
//                 domicile avec l'évaluation '#'. L'évaluation du service est
//                 déduite automatiquement (DV_SERVE_RECEPTION_PAIR).
//
// FORMULE LONGUE ÉQUIVALENTE (ordre des champs du DVW officiel)
//   [équipe][joueur][action][type][combo2][cible1][zone départ][zone arrivée]
//   [sous-zone][évaluation]
// ============================================================================

export const DV_TEAM_KEYS = ['*', 'a'];

// ---------------------------------------------------------------------------
// ACTIONS (champ 4 du DVW officiel : S R A B D E F)
// ATTENTION : 'F' n'est PAS une faute. En DataVolley 'F' = « ballon libre »
// (freeball). Une faute se code avec l'évaluation '=' sur l'action concernée
// (*08S= service faute, a11A= attaque faute, *05B= faute de filet…).
// ---------------------------------------------------------------------------
export const DV_ACTIONS = [
  { code: 'S', label: 'Service', short: 'Srv', desc: "Mise en jeu. Le 1er code d'un point est toujours un service." },
  { code: 'R', label: 'Réception', short: 'Réc', desc: 'Premier contact sur le service adverse.' },
  { code: 'A', label: 'Attaque', short: 'Att', desc: 'Troisième contact offensif (ou 2e après une défense).' },
  { code: 'B', label: 'Contre', short: 'Ctr', desc: 'Bloc au filet : joueur(s) au-dessus de la bande.' },
  { code: 'D', label: 'Défense', short: 'Déf', desc: "Récupération d'une balle attaquée." },
  { code: 'E', label: 'Passe', short: 'Pas', desc: 'Second contact : le passeur distribue.' },
  { code: 'F', label: 'Ballon libre', short: 'Lib', desc: 'Balle renvoyée sans attaque (manchette/passe haute gratuite).' },
];

export const DV_ACTION_KEYS = DV_ACTIONS.map((a) => a.code);

export const DV_EVAL_KEYS = ['#', '+', '!', '-', '/', '='];

/** Fautes : évaluation '=' sur n'importe quelle action (pas d'action « faute »). */
export const DV_FAULT_EVALUATION = '=';

/** Numérotation officielle des zones (3 × 3 depuis son propre camp). */
export const DV_ZONE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const DV_SUBZONE_KEYS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// ÉVALUATIONS officielles PAR ACTION (décodeur standard DataVolley).
// Ordre d'affichage : du meilleur (#) au pire (=).
// ---------------------------------------------------------------------------
export const DV_EVALUATIONS = {
  S: [
    { sym: '#', label: 'Ace', desc: 'Point direct sur le service.' },
    { sym: '+', label: 'Positif', desc: "L'adversaire attaque mais de façon limitée." },
    { sym: '!', label: 'OK', desc: "Pas de 1er tempo possible pour l'adversaire." },
    { sym: '-', label: 'Négatif', desc: "L'adversaire joue une attaque libre." },
    { sym: '/', label: 'Sans attaque', desc: "L'adversaire ne peut pas attaquer (ballon haut ou renvoyé)." },
    { sym: '=', label: 'Faute', desc: 'Service dans le filet ou hors du terrain, point perdu.' },
  ],
  R: [
    { sym: '#', label: 'Parfaite', desc: 'La balle arrive parfaitement sur le passeur.' },
    { sym: '+', label: 'Positive', desc: 'Réception positive, attaque normale possible.' },
    { sym: '!', label: 'OK', desc: 'Pas de 1er tempo possible pour le passeur.' },
    { sym: '-', label: 'Négative', desc: 'Attaque limitée seulement.' },
    { sym: '/', label: 'Mauvaise', desc: "Pas d'attaque possible (overpass : la balle repasse)." },
    { sym: '=', label: 'Erreur', desc: "Réception ratée : ace subi, point pour l'adversaire." },
  ],
  A: [
    { sym: '#', label: 'Point gagnant', desc: 'Attaque gagnante (kill).' },
    { sym: '+', label: 'Positive', desc: "Bonne attaque, l'équipe conserve l'avantage." },
    { sym: '!', label: 'Contrée pour re-attaque', desc: "Contrée mais l'équipe peut rejouer la balle." },
    { sym: '-', label: 'Faible', desc: 'Attaque facilement défendue.' },
    { sym: '/', label: 'Contrée', desc: "Attaque contrée par l'adversaire, point perdu." },
    { sym: '=', label: 'Faute', desc: 'Attaque dehors, dans le filet ou faute technique.' },
  ],
  B: [
    { sym: '#', label: 'Contre gagnant', desc: 'Le contre marque le point.' },
    { sym: '+', label: 'Positive', desc: "Touche du contre : la balle reste jouable pour la défense." },
    { sym: '!', label: 'Faible', desc: "Touche du contre sans avantage : l'adversaire rejoue la balle." },
    { sym: '-', label: 'Faible', desc: "Touche du contre sans avantage : l'adversaire rejoue la balle." },
    { sym: '/', label: 'Invasion / block-out', desc: 'Faute de contre : la balle sort après la touche, point perdu.' },
    { sym: '=', label: 'Faute', desc: 'Faute de contre (filet, invasion, position).' },
  ],
  D: [
    { sym: '#', label: 'Défense parfaite', desc: 'La balle arrive idéalement sur le passeur.' },
    { sym: '+', label: 'Bonne défense', desc: 'Balle défendue, contre-attaque possible.' },
    { sym: '!', label: 'OK', desc: 'Pas de 1er tempo possible.' },
    { sym: '-', label: 'Négative', desc: 'Aucune attaque structurée possible.' },
    { sym: '/', label: 'Mauvaise', desc: "La balle repasse directement chez l'adversaire." },
    { sym: '=', label: 'Erreur', desc: 'Défense ratée sur une balle jouable.' },
  ],
  E: [
    { sym: '#', label: 'Parfaite', desc: 'Passe parfaite, toutes les options ouvertes.' },
    { sym: '+', label: 'Positive', desc: 'Passe jouable, attaque possible.' },
    { sym: '!', label: 'OK', desc: 'Passe correcte sans plus.' },
    { sym: '-', label: 'Faible', desc: 'Passe difficile à exploiter.' },
    { sym: '/', label: 'Faible', desc: 'Passe difficile à exploiter.' },
    { sym: '=', label: 'Erreur', desc: 'Faute de passe (filet, double touche, portée).' },
  ],
  F: [
    { sym: '#', label: 'Parfaite', desc: 'Ballon libre parfait : attaque adverse impossible ou point.' },
    { sym: '+', label: 'Bonne', desc: "Bon ballon libre, l'adversaire doit construire." },
    { sym: '!', label: 'OK', desc: "Pas de 1er tempo possible pour l'adversaire." },
    { sym: '-', label: 'Faible', desc: 'Seule une passe haute est possible.' },
    { sym: '/', label: 'Faible', desc: 'Ballon libre mal joué, sans conséquence.' },
    { sym: '=', label: 'Erreur', desc: 'Faute sur le ballon libre, point perdu.' },
  ],
};

// ---------------------------------------------------------------------------
// Évaluations TERMINALES : elles clôturent le point (le rallye).
// ---------------------------------------------------------------------------
export const DV_TERMINAL_BY_ACTION = {
  S: ['#', '='],
  R: ['='],
  A: ['#', '/', '='],
  B: ['#', '/', '='],
  D: ['='],
  E: ['='],
  F: ['='],
};

/**
 * Actions « conditionnellement terminales » : l'attaque contrée (A/) clôt le
 * point SAUF si le contre qui suit le décrit (B#/B=). Le point est alors celui
 * du contre.
 */
export const DV_CONDITIONAL_TERMINAL = { A: ['/'] };

export function isTerminalEvaluation(action, evaluation) {
  return (DV_TERMINAL_BY_ACTION[action] || []).includes(evaluation);
}

/** Vrai si l'action est terminale « sauf si un contre suit ». */
export function isConditionallyTerminal(action, evaluation) {
  return (DV_CONDITIONAL_TERMINAL[action] || []).includes(evaluation);
}

export const DV_TEAMS = {
  '*': { key: '*', id: 'home', label: 'Domicile' },
  a: { key: 'a', id: 'away', label: 'Extérieur' },
};


// ---------------------------------------------------------------------------
// TYPES (champ 5 du DVW) — lettre facultative juste après l'action.
// Elles décrivent la TECHNIQUE du geste, pas son résultat.
// ---------------------------------------------------------------------------
export const DV_TYPES = {
  S: [
    { sym: 'H', label: 'Haute', desc: 'Service « cloche » : ballon haut et lent, très facile à lire.' },
    { sym: 'Q', label: 'Flottante', desc: 'Service flottant (jump-float) : trajectoire instable, sans rotation.' },
    { sym: 'M', label: 'Smashée', desc: 'Service frappé / jump-spin : trajectoire tendue et rapide, avec rotation.' },
    { sym: 'T', label: 'Tennis', desc: 'Service « tennis » : frappe haute avec effet.' },
  ],
  A: [
    { sym: 'H', label: 'Frappée', desc: 'Attaque en force, plein bras.' },
    { sym: 'P', label: 'Placée', desc: 'Attaque placée / pointue, pour contourner le contre.' },
    { sym: 'T', label: 'Tendue', desc: 'Attaque tendue jouée le long du contre.' },
  ],
};

/** Saisies tolérées pour le type (mnémoniques français). */
export const DV_TYPE_ALIASES = {
  S: { F: 'Q', S: 'M' }, // F = Float (flottante) ; S = Smash (smashée)
};

export function dvTypeKeys(action) {
  return (DV_TYPES[action] || []).map((t) => t.sym);
}

/** Résout une lettre de type (avec alias) pour une action donnée. */
export function resolveTypeAlias(action, char) {
  const up = String(char || '').toUpperCase();
  if (dvTypeKeys(action).includes(up)) return up;
  return (DV_TYPE_ALIASES[action] || {})[up] || null;
}

export function typeLabel(action, sym) {
  const t = (DV_TYPES[action] || []).find((x) => x.sym === sym);
  return t ? t.label : sym;
}

// ---------------------------------------------------------------------------
// CODES DE COMBINAISON D'ATTAQUE (champ « combinaison » DataVolley, positions 7-8).
// Ils décrivent le système offensif : 1re vitesse, pipe, slide, etc. Le code fixe
// la POSITION de l'attaquant (donc la zone de départ) et le type de geste.
//   *09AX1#  -> n°09, attaque « A Quick » (position 3), point gagnant.
// Table par défaut issue du standard openvolley (ov_default_attack_table).
// side : L (aile gauche) · C (centre) · R (aile droite) — set : passe associée.
// ---------------------------------------------------------------------------
export const DV_ATTACK_COMBOS_DEFAULT = [
  { code: 'X1', position: 3, side: 'R', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'A Quick', desc: '1re vitesse au centre devant le passeur (A).', set: 'C' },
  { code: 'X2', position: 2, side: 'L', type: 'Q', tempo: '1st', color: '#f97316', label: 'Quick derrière (B/1p)', desc: '1re vitesse derrière le passeur.', set: 'C' },
  { code: 'X7', position: 3, side: 'R', type: 'Q', tempo: '1st', color: '#eab308', label: 'Tendue 3m (Seven)', desc: '1re vitesse tendue écartée en zone 3/4.', set: 'C' },
  { code: 'X3', position: 3, side: 'L', type: 'M', tempo: '2nd', color: '#38bdf8', label: '3 par attaquant poste 2', desc: 'Attaque en 3 côté droit.', set: 'B' },
  { code: 'XB', position: 8, side: 'C', type: 'M', tempo: '2nd', color: '#a855f7', label: 'B Pipe', desc: 'Pipe après 1re vitesse.', set: 'P' },
  { code: 'XC', position: 3, side: 'R', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'E Quick', desc: '1re vitesse E.', set: 'C' },
  { code: 'XD', position: 3, side: 'R', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'Quick flottant B', desc: '1re vitesse B flottante.', set: 'C' },
  { code: 'XF', position: 2, side: 'L', type: 'N', tempo: '1st', color: '#ec4899', label: 'Slide par l’opposé', desc: 'Slide joué par l’opposé.', set: 'B' },
  { code: 'XG', position: 3, side: 'R', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'Soup ball', desc: 'Balle difficile rejouée en 1re.', set: 'C' },
  { code: 'XL', position: 2, side: 'C', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'A Quick poste 2', desc: '1re vitesse A au poste 2.', set: 'C' },
  { code: 'XM', position: 3, side: 'C', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'B Quick poste 3', desc: '1re vitesse B au centre.', set: 'C' },
  { code: 'XO', position: 2, side: 'L', type: 'Q', tempo: '1st', color: '#f97316', label: 'C Quick par l’opposé', desc: '1re vitesse C par l’opposé.', set: 'B' },
  { code: 'XP', position: 8, side: 'C', type: 'M', tempo: '2nd', color: '#a855f7', label: 'Pipe (6m)', desc: 'Attaque arrière au centre (6 m).', set: 'P' },
  { code: 'XQ', position: 2, side: 'L', type: 'M', tempo: '2nd', color: '#38bdf8', label: 'Mezza Dietro', desc: 'Demi-attaque derrière.', set: 'B' },
  { code: 'XR', position: 8, side: 'C', type: 'M', tempo: '2nd', color: '#a855f7', label: 'C Pipe', desc: 'Pipe côté droit.', set: 'P' },
  { code: 'XS', position: 2, side: 'L', type: 'Q', tempo: '1st', color: '#f97316', label: 'D Quick', desc: '1re vitesse D.', set: 'C' },
  { code: 'XT', position: 3, side: 'R', type: 'M', tempo: '2nd', color: '#38bdf8', label: '3 par attaquant poste 4', desc: 'Attaque en 3 côté gauche.', set: 'F' },
  { code: 'XZ', position: 4, side: 'R', type: 'Q', tempo: '1st', color: '#f59e0b', label: 'B Quick court', desc: '1re vitesse B courte.', set: 'C' },
  { code: 'X0', position: 7, side: 'C', type: 'T', tempo: '2nd', color: '#06b6d4', label: 'Arrière D (Poste 5)', desc: 'Attaque arrière côté gauche.', set: 'F' },
  { code: 'X5', position: 4, side: 'R', type: 'T', tempo: '2nd', color: '#10b981', label: 'Super en 4 (Tendue)', desc: 'Balle accélérée tendue à l’aile gauche (Poste 4).', set: 'F' },
  { code: 'X6', position: 2, side: 'L', type: 'T', tempo: '2nd', color: '#06b6d4', label: 'Super en 2 (Back)', desc: 'Balle accélérée tendue à l’aile droite (Poste 2).', set: 'B' },
  { code: 'X8', position: 9, side: 'C', type: 'T', tempo: '2nd', color: '#06b6d4', label: 'Arrière A (Poste 1)', desc: 'Attaque arrière rapide en zone 1.', set: 'B' },
  { code: 'C0', position: 7, side: 'C', type: 'U', tempo: '2nd', color: '#38bdf8', label: 'Moyenne arrière D', desc: 'Balle moyenne arrière droit.', set: 'F' },
  { code: 'C5', position: 4, side: 'R', type: 'U', tempo: '2nd', color: '#10b981', label: 'Moyenne 4', desc: 'Balle moyenne à l’aile gauche.', set: 'F' },
  { code: 'C6', position: 2, side: 'L', type: 'U', tempo: '2nd', color: '#06b6d4', label: 'Moyenne rouge (2)', desc: 'Balle moyenne côté droit.', set: 'B' },
  { code: 'C8', position: 9, side: 'C', type: 'U', tempo: '2nd', color: '#38bdf8', label: 'Moyenne arrière A (1)', desc: 'Balle moyenne arrière droite.', set: 'B' },
  { code: 'CB', position: 2, side: 'L', type: 'N', tempo: '1st', color: '#ec4899', label: 'Slide près du passeur', desc: 'Slide à côté du passeur.', set: 'C' },
  { code: 'CD', position: 2, side: 'L', type: 'N', tempo: '1st', color: '#ec4899', label: 'Slide loin du passeur', desc: 'Slide éloigné du passeur.', set: 'C' },
  { code: 'CF', position: 2, side: 'L', type: 'N', tempo: '1st', color: '#ec4899', label: 'Slide proche du passeur', desc: 'Slide serré contre le passeur.', set: 'C' },
  { code: 'II', position: 4, side: 'R', type: 'M', tempo: '2nd', color: '#10b981', label: 'Attaque 4 arrière', desc: 'Attaque de l’aile gauche arrière.', set: 'F' },
  { code: 'JJ', position: 2, side: 'L', type: 'M', tempo: '2nd', color: '#06b6d4', label: 'Arrière AW', desc: 'Attaque arrière côté droit.', set: 'B' },
  { code: 'PP', position: 3, side: 'L', type: 'O', tempo: '1st', color: '#fbbf24', label: 'Attaque du passeur (2e main)', desc: 'Le passeur attaque au 2e contact.', set: 'S' },
  { code: 'P2', position: 3, side: 'C', type: 'O', tempo: '1st', color: '#fbbf24', label: 'Attaque 2e contact', desc: 'Attaque jouée sur le 2e contact.', set: '-' },
  { code: 'PR', position: 3, side: 'C', type: 'O', tempo: '1st', color: '#f43f5e', label: 'Overpass frappé', desc: 'Balle de réception frappée directement.', set: '-' },
  { code: 'VB', position: 8, side: 'C', type: 'H', tempo: '3rd', color: '#a855f7', label: 'B Pipe haute', desc: 'Pipe haute au centre.', set: 'P' },
  { code: 'VJ', position: 4, side: 'R', type: 'H', tempo: '3rd', color: '#64748b', label: 'Haute 4 arrière', desc: 'Balle haute aile gauche arrière.', set: 'F' },
  { code: 'VP', position: 8, side: 'C', type: 'H', tempo: '3rd', color: '#a855f7', label: 'Pipe haute', desc: 'Balle haute arrière centre.', set: 'P' },
  { code: 'VR', position: 8, side: 'C', type: 'H', tempo: '3rd', color: '#a855f7', label: 'C Pipe haute', desc: 'Pipe haute côté droit.', set: 'P' },
  { code: 'V0', position: 7, side: 'C', type: 'H', tempo: '3rd', color: '#64748b', label: 'Haute arrière D', desc: 'Balle haute arrière gauche.', set: 'F' },
  { code: 'V3', position: 3, side: 'C', type: 'O', tempo: '3rd', color: '#64748b', label: 'Haute poste 3', desc: 'Balle haute au centre avant.', set: '-' },
  { code: 'V4', position: 2, side: 'L', type: 'H', tempo: '3rd', color: '#64748b', label: 'Haute arrière court', desc: 'Balle haute courte côté droit.', set: 'B' },
  { code: 'V5', position: 4, side: 'R', type: 'H', tempo: '3rd', color: '#10b981', label: 'Haute poste 4', desc: 'Balle haute à l’aile gauche.', set: 'F' },
  { code: 'V6', position: 2, side: 'L', type: 'H', tempo: '3rd', color: '#06b6d4', label: 'Haute poste 2', desc: 'Balle haute côté droit.', set: 'B' },
  { code: 'V8', position: 9, side: 'C', type: 'H', tempo: '3rd', color: '#06b6d4', label: 'Haute arrière A (1)', desc: 'Balle haute arrière droite.', set: 'B' },
];

const CUSTOM_COMBOS_STORAGE_KEY = 'pancake_custom_attack_combos_v1';

function readCustomCombosFromStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(CUSTOM_COMBOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const DV_ATTACK_COMBOS = [...DV_ATTACK_COMBOS_DEFAULT];

/** Index des combinaisons d'attaque par code (majuscules). */
export const DV_ATTACK_COMBO_MAP = {};
export const DV_ATTACK_COMBO_KEYS = [];

export function rebuildAttackComboIndex() {
  const custom = readCustomCombosFromStorage();
  const mergedMap = {};
  for (const c of DV_ATTACK_COMBOS_DEFAULT) {
    mergedMap[String(c.code).toUpperCase()] = { ...c, isCustom: false };
  }
  for (const c of custom) {
    if (!c || !c.code || String(c.code).length !== 2) continue;
    const code = String(c.code).toUpperCase();
    mergedMap[code] = {
      code,
      position: Number(c.position) || 4,
      side: c.side || 'C',
      type: c.type || 'M',
      tempo: c.tempo || '2nd',
      color: c.color || '#f59e0b',
      label: c.label || `Combo ${code}`,
      desc: c.desc || 'Combinaison personnalisée.',
      set: c.set || 'C',
      isCustom: true,
    };
  }
  // Synchronise DV_ATTACK_COMBOS, DV_ATTACK_COMBO_MAP et DV_ATTACK_COMBO_KEYS en place
  DV_ATTACK_COMBOS.length = 0;
  for (const k of Object.keys(DV_ATTACK_COMBO_MAP)) delete DV_ATTACK_COMBO_MAP[k];
  DV_ATTACK_COMBO_KEYS.length = 0;
  for (const item of Object.values(mergedMap)) {
    DV_ATTACK_COMBOS.push(item);
    DV_ATTACK_COMBO_MAP[item.code] = item;
    DV_ATTACK_COMBO_KEYS.push(item.code);
  }
  return DV_ATTACK_COMBOS;
}

rebuildAttackComboIndex();

export function getAttackCombos() {
  return rebuildAttackComboIndex();
}

export function saveCustomAttackCombo(combo) {
  if (!combo || !combo.code || String(combo.code).trim().length !== 2) return DV_ATTACK_COMBOS;
  const code = String(combo.code).trim().toUpperCase();
  const current = readCustomCombosFromStorage().filter((c) => String(c.code).toUpperCase() !== code);
  current.push({
    code,
    position: Number(combo.position) || 4,
    side: combo.side || 'C',
    type: combo.type || 'M',
    tempo: combo.tempo || '2nd',
    color: combo.color || '#f59e0b',
    label: String(combo.label || `Combo ${code}`).trim(),
    desc: String(combo.desc || '').trim(),
    set: combo.set || 'C',
  });
  try {
    window.localStorage.setItem(CUSTOM_COMBOS_STORAGE_KEY, JSON.stringify(current));
  } catch { /* ignore */ }
  return rebuildAttackComboIndex();
}

export function deleteCustomAttackCombo(code) {
  const target = String(code || '').toUpperCase();
  const current = readCustomCombosFromStorage().filter((c) => String(c.code).toUpperCase() !== target);
  try {
    window.localStorage.setItem(CUSTOM_COMBOS_STORAGE_KEY, JSON.stringify(current));
  } catch { /* ignore */ }
  return rebuildAttackComboIndex();
}

/** Infos d'une combinaison d'attaque (ou null). */
export function attackComboInfo(code) {
  return DV_ATTACK_COMBO_MAP[String(code || '').toUpperCase()] || null;
}

/** Vrai si les 2 caractères forment une combinaison d'attaque connue. */
export function isAttackCombo(twoChars) {
  return !!DV_ATTACK_COMBO_MAP[String(twoChars || '').toUpperCase()];
}

// ---------------------------------------------------------------------------
// APPELS PASSEUR (champ « Cmb/Call » DataVolley, positions 7-8) — codes K.
// Le passeur annonce la course de fixation du central. Ils occupent le MÊME
// emplacement que les combinaisons d'attaque, mais se placent après l'action « E » :
//   *07EK1#  -> n°07, passe avec appel « K1 » (Fixation Devant), évaluation « # ».
// ---------------------------------------------------------------------------
export const DV_SETTER_CALLS = [
  { code: 'K1', middlePos: 3, color: '#f59e0b', label: 'Appel 1 (Fixation Devant)', desc: 'Central en 1re vitesse devant le passeur (A Quick / X1).' },
  { code: 'K2', middlePos: 2, color: '#f97316', label: 'Fixation Derrière (K2)', desc: 'Central derrière le passeur / 1 pied (B Quick / Slide / X2).' },
  { code: 'K7', middlePos: 4, color: '#eab308', label: 'Fixation Tendue 3m (K7)', desc: 'Central écarté à 3m devant le passeur (Seven / X7).' },
  { code: 'KE', middlePos: 0, color: '#71717a', label: 'Sans Central (KE)', desc: 'Pas de course du central (central au sol ou hors système).' },
  { code: 'KC', middlePos: 3, color: '#ec4899', label: 'Croix / Combo (KC)', desc: 'Course croisée entre central et ailier.' },
  { code: 'KM', middlePos: 3, color: '#38bdf8', label: 'Fixation Flottante (KM)', desc: 'Central en lecture flottante devant/derrière.' },
  { code: 'KP', middlePos: 3, color: '#a855f7', label: 'Fixation + Pipe (KP)', desc: 'Appel synchronisé central + Pipe en zone 6.' },
  { code: 'K3', middlePos: 3, color: '#06b6d4', label: 'Appel 3 (K3)', desc: 'Troisième appel du passeur.' },
  { code: 'K4', middlePos: 4, color: '#10b981', label: 'Appel 4 (K4)', desc: 'Quatrième appel du passeur.' },
  { code: 'K5', middlePos: 4, color: '#10b981', label: 'Appel 5 (K5)', desc: 'Cinquième appel du passeur.' },
  { code: 'K6', middlePos: 2, color: '#06b6d4', label: 'Appel 6 (K6)', desc: 'Sixième appel du passeur.' },
  { code: 'K8', middlePos: 3, color: '#64748b', label: 'Appel 8 (K8)', desc: 'Huitième appel du passeur.' },
  { code: 'K9', middlePos: 2, color: '#64748b', label: 'Appel 9 (K9)', desc: 'Neuvième appel du passeur.' },
  { code: 'K0', middlePos: 0, color: '#64748b', label: 'Appel 0 (K0)', desc: 'Appel zéro du passeur.' },
];

/** Index des appels passeur par code (majuscules). */
export const DV_SETTER_CALL_MAP = DV_SETTER_CALLS.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {});

/** Infos d'un appel passeur (ou null). */
export function setterCallInfo(code) {
  return DV_SETTER_CALL_MAP[String(code || '').toUpperCase()] || null;
}

/** Clés des appels passeur (ordre d'affichage). */
export const DV_SETTER_CALL_KEYS = DV_SETTER_CALLS.map((c) => c.code);

/** Vrai si les 2 caractères forment un appel passeur connu. */
export function isSetterCall(twoChars) {
  return !!DV_SETTER_CALL_MAP[String(twoChars || '').toUpperCase()];
}

// ---------------------------------------------------------------------------
// CODES ÉTENDUS DATAVOLLEY 4 (positions 9-14, après l'évaluation)
//   1) Nombre de contreurs (0..4) : ex. *09AV54#2 (attaque gagnante contre 2)
//   2) Type de frappe post-éval (H=Frappée, P=Placée/Feinte, T=Tendue/Tip)
//   3) Code spécial (B=Block-out, O=Out/Dehors, N=Filet, Z=Faute ligne/arbitre)
// ---------------------------------------------------------------------------
export const DV_BLOCKER_COUNTS = [
  { code: '0', label: '0 Contreur', short: '0 Ctr', desc: 'Attaque sans contre en face (0 bloc).' },
  { code: '1', label: '1 Contreur (1v1)', short: '1 Ctr', desc: 'Attaque face à 1 seul contreur.' },
  { code: '2', label: '2 Contreurs', short: '2 Ctr', desc: 'Attaque face à un double contre.' },
  { code: '3', label: '3 Contreurs', short: '3 Ctr', desc: 'Attaque face à un triple contre.' },
  { code: '4', label: 'Bloc ouvert (Trou)', short: 'Trou', desc: 'Balle passée dans l’intervalle entre deux contreurs.' },
];

export const DV_BLOCKER_KEYS = DV_BLOCKER_COUNTS.map((b) => b.code);

export const DV_EXTENDED_HIT_TYPES = [
  { code: 'H', label: 'Frappée (Hard)', short: 'Hard' },
  { code: 'P', label: 'Feinte / Placée (Tip)', short: 'Tip' },
  { code: 'T', label: 'Roulette / Tendue', short: 'Roll' },
];

export const DV_EXTENDED_HIT_KEYS = DV_EXTENDED_HIT_TYPES.map((h) => h.code);

export const DV_EXTENDED_SPECIALS = [
  { code: 'B', label: 'Block-Out', short: 'BlkOut', desc: 'Point ou faute via les mains du contre (block-out).' },
  { code: 'O', label: 'Out (Dehors)', short: 'Out', desc: 'Balle envoyée directement hors des limites.' },
  { code: 'N', label: 'Filet (Net)', short: 'Filet', desc: 'Balle dans le filet ou faute de filet.' },
  { code: 'Z', label: 'Ligne / Arbitre', short: 'Ligne', desc: 'Faute de ligne (3m/service) ou décision arbitrale.' },
];

export const DV_EXTENDED_SPECIAL_KEYS = DV_EXTENDED_SPECIALS.map((s) => s.code);

// ---------------------------------------------------------------------------
// ZONES — numérotation officielle DataVolley : grille 3 × 3 depuis son camp,
// le filet en haut. Les zones 7/8/9 sont la bande médiane (autour des 3 m).
//   4  3  2
//   7  8  9
//   5  6  1
// ---------------------------------------------------------------------------
export const DV_ZONE_LABELS = {
  1: 'Arrière droit',
  2: 'Aile droite',
  3: 'Centre avant',
  4: 'Aile gauche',
  5: 'Arrière gauche',
  6: 'Arrière centre (pipe)',
  7: 'Médiane gauche',
  8: 'Médiane centre',
  9: 'Médiane droite',
};

/** Grille d'affichage : 3 lignes (net → fond) × 3 colonnes (gauche → droite). */
export const DV_ZONE_GRID = [
  ['4', '3', '2'],
  ['7', '8', '9'],
  ['5', '6', '1'],
];

export function zoneLabel(zone) {
  const z = String(zone || '');
  return DV_ZONE_LABELS[z] ? `${z} — ${DV_ZONE_LABELS[z]}` : z;
}

/** Rôle de la 1re / 2e zone saisie, selon l'action. */
export function zoneRoleLabel(action, index) {
  const first = index === 0;
  if (action === 'S') return first ? 'zone de service (1 par défaut)' : 'zone cible du service';
  if (action === 'R') return first ? 'zone de réception' : 'zone de passe visée';
  if (action === 'A') return first ? "zone de départ de l'attaquant" : "zone visée par l'attaque";
  if (action === 'B') return first ? 'zone du contre' : 'zone visée';
  if (action === 'D') return first ? 'zone de défense' : 'zone visée';
  if (action === 'E') return first ? 'zone de passe' : 'zone visée';
  return first ? 'zone de départ' : "zone d'arrivée";
}

// ---------------------------------------------------------------------------
// FORMULE COMBINÉE service . réception
// ---------------------------------------------------------------------------
export const DV_COMBINED_SEPARATOR = '.';

/**
 * Correspondance officielle service ⇄ réception : quand on code la réception,
 * DataVolley en déduit l'évaluation du service.
 *   R '=' → S '#'   (ace)          R '/' → S '+'   (l'adversaire n'attaque pas)
 *   R '-' → S '+'   (attaque limitée)  R '!' → S '!'  (pas de 1er tempo)
 *   R '+' → S '-'   (réception positive) R '#' → S '-' (service facile)
 */
export const DV_SERVE_RECEPTION_PAIR = { '=': '#', '/': '+', '-': '+', '!': '!', '+': '-', '#': '-' };

/** Évaluation du service déduite de l'évaluation de la réception. */
export function deriveServeEvaluation(receptionEvaluation) {
  return DV_SERVE_RECEPTION_PAIR[receptionEvaluation] || '';
}

/** Réception la plus probable pour une évaluation de service donnée. */
export const DV_RECEPTION_SERVE_PAIR = { '#': '=', '+': '-', '!': '!', '-': '#', '/': '/' };

export function deriveReceptionEvaluation(serveEvaluation) {
  return DV_RECEPTION_SERVE_PAIR[serveEvaluation] || '';
}

// ---------------------------------------------------------------------------
// FORMULE COMBINÉE ATTAQUE → CONTRE / DÉFENSE
//   *05V66.12#   -> n°05 attaque « V6 » vers la zone 6, contrée par le n°12 (#).
//   *05V66.12D#  -> idem mais le n°12 DÉFEND (D). Sans « D » = contre.
// L'évaluation de l'attaque est déduite de celle du contreur/défenseur (inverse).
// ---------------------------------------------------------------------------
/** Attaque déduite de l'évaluation du contre. */
export const DV_ATTACK_BLOCK_PAIR = { '#': '/', '+': '!', '!': '-', '-': '-', '/': '+', '=': '#' };

/** Attaque déduite de l'évaluation de la défense. */
export const DV_ATTACK_DIG_PAIR = { '#': '-', '+': '-', '!': '/', '-': '/', '/': '+', '=': '#' };

/** Évaluation de l'attaque déduite de celle du contre (kind='block') ou de la défense ('dig'). */
export function deriveAttackEvaluation(defenderEvaluation, kind) {
  const map = kind === 'dig' ? DV_ATTACK_DIG_PAIR : DV_ATTACK_BLOCK_PAIR;
  return map[defenderEvaluation] || '';
}

// ---------------------------------------------------------------------------
// LECTURE / ÉCRITURE D'UN CODE
// ---------------------------------------------------------------------------
function isDigitChar(c) {
  return c >= '0' && c <= '9' && c !== undefined;
}

export function teamIdFromKey(key) {
  return key === 'a' ? 'away' : 'home';
}

export function teamKeyFromId(id) {
  return id === 'away' ? 'a' : '*';
}

export function isKnownAction(action) {
  return DV_ACTION_KEYS.includes(action);
}

export function evaluationAllowed(action, evaluation) {
  return (DV_EVALUATIONS[action] || []).some((e) => e.sym === evaluation);
}

/**
 * Lit UN code à partir de la position `start` — tolérant : renvoie ce qui a pu
 * être compris, la position de fin et la liste des problèmes rencontrés.
 * @returns {{start:number,end:number,team:string|null,teamKey:string,player_number:number,
 *            action:string,type:string,start_zone:string,end_zone:string,
 *            end_subzone:string,evaluation:string,issues:string[],complete:boolean}}
 */
export function scanCode(str, start = 0, opts = {}) {
  const s = String(str || '');
  const out = {
    start,
    end: start,
    team: null,
    teamKey: '',
    player_number: 0,
    action: '',
    type: '',
    combo: '',
    call: '',
    start_zone: '',
    end_zone: '',
    end_subzone: '',
    evaluation: '',
    num_blockers: '',
    kill_type: '',
    special_code: '',
    issues: [],
    complete: false,
  };

  let i = start;
  const first = s[i];
  if (first === '*' || first === 'a') {
    out.teamKey = first;
    out.team = teamIdFromKey(first);
    i += 1;
  } else if (isDigitChar(first)) {
    // Clé d'équipe OMISE : un code commençant par un chiffre est « domicile ».
    // (DataVolley / VolleyStation : `12S.10+` = `*12S.10+`.)
    out.teamKey = '*';
    out.team = 'home';
    // on n'avance pas : le chiffre est le début du numéro de joueur.
  } else {
    out.issues.push('bad_team');
    out.end = i + 1;
    return out;
  }

  let digits = '';
  while (i < s.length && digits.length < 2 && isDigitChar(s[i])) {
    digits += s[i];
    i += 1;
  }
  out.player_number = digits ? parseInt(digits, 10) : 0;
  if (!digits) out.issues.push('missing_player');

  const action = s[i];
  if (!isKnownAction(action)) {
    out.issues.push('bad_action');
    out.end = i + 1;
    // Conserve le caractère fautif pour l'affichage du bloc en rouge.
    if (s[i]) out.raw = s.slice(start, i + 1);
    return out;
  }
  out.action = action;
  i += 1;

  // Combinaison d'attaque (2 caractères) : *09AX1# = attaque « A Quick ».
  // Reconnaît aussi l'appel passeur après une passe : *07EK1#.
  // Reconnu AVANT le type : la combinaison fixe la zone de départ et le type.
  if (action === 'A') {
    const two = s.slice(i, i + 2);
    if (isAttackCombo(two)) {
      out.combo = two.toUpperCase();
      i += 2;
    }
  } else if (action === 'E') {
    const two = s.slice(i, i + 2);
    if (isSetterCall(two)) {
      out.call = two.toUpperCase();
      i += 2;
    }
  }

  // Type éventuel (lettre juste après l'action, alias français acceptés).
  if (!out.combo && !out.call) {
    const ty = resolveTypeAlias(action, s[i]);
    if (ty) {
      out.type = ty;
      i += 1;
    } else if (s[i] && !DV_TEAM_KEYS.includes(s[i]) && /[A-Za-z]/.test(s[i]) && !DV_EVAL_KEYS.includes(s[i])) {
      // Une lettre non-type est une faute, SAUF une clé d'équipe ('a' ou '*') qui
      // démarre le code suivant (indispensable en mode consultation sans évaluation).
      out.issues.push('bad_type');
      i += 1;
    }
  }

  // Zones éventuelles : 1 ou 2 chiffres (1-9), puis sous-zone A-D.
  const zones = [];
  while (i < s.length && zones.length < 2 && /[1-9]/.test(s[i])) {
    zones.push(s[i]);
    i += 1;
  }
  if (zones.length === 2 && i < s.length && DV_SUBZONE_KEYS.includes(s[i].toUpperCase())) {
    out.end_subzone = s[i].toUpperCase();
    i += 1;
  }
  if (out.combo) {
    // La combinaison fixe la zone de départ (position de l'attaquant).
    const info = attackComboInfo(out.combo);
    if (info && info.position) out.start_zone = String(info.position);
    if (zones.length === 1) out.end_zone = zones[0];
    else if (zones.length === 2) {
      [out.start_zone, out.end_zone] = zones;
    }
  } else if (action === 'S' && zones.length === 1) {
    out.start_zone = '1'; // un service part toujours de la zone 1
    out.end_zone = zones[0];
  } else if (zones.length === 2) {
    [out.start_zone, out.end_zone] = zones;
  } else if (zones.length === 1) {
    out.start_zone = zones[0];
  }

  const ev = s[i];
  if (ev && DV_EVAL_KEYS.includes(ev)) {
    out.evaluation = ev;
    i += 1;
    if (evaluationAllowed(action, ev)) {
      out.complete = true;
    } else {
      out.issues.push('bad_eval');
    }
    // Codes étendus DataVolley 4 après l'évaluation (positions 9-14) :
    //   - num_blockers : 0..4 (si ce n'est pas le début d'un nouveau code sans '*')
    //   - kill_type    : H, P, T (type de frappe post-éval)
    //   - special_code : B (block-out), O (out), N (filet), Z (ligne/arbitre)
    if (action === 'A' || action === 'B' || action === 'S') {
      let extGuard = 0;
      while (i < s.length && extGuard < 3) {
        extGuard += 1;
        const ch = s[i];
        if (!ch || ch === '*' || ch === 'a' || ch === DV_COMBINED_SEPARATOR) break;
        const up = ch.toUpperCase();
        if (!out.num_blockers && DV_BLOCKER_KEYS.includes(ch) && !/^\d{1,2}[SRABDEF]/i.test(s.slice(i))) {
          out.num_blockers = ch;
          i += 1;
          continue;
        }
        if (!out.kill_type && DV_EXTENDED_HIT_KEYS.includes(up) && !/^\d{1,2}[SRABDEF]/i.test(s.slice(i))) {
          out.kill_type = up;
          i += 1;
          continue;
        }
        if (!out.special_code && DV_EXTENDED_SPECIAL_KEYS.includes(up) && !/^\d{1,2}[SRABDEF]/i.test(s.slice(i))) {
          out.special_code = up;
          i += 1;
          continue;
        }
        break;
      }
    }
  } else if (opts.evaluationOptional) {
    out.complete = true; // consultation : l'évaluation est facultative
  } else {
    out.issues.push('missing_eval');
  }

  out.end = i;
  return out;
}

/** Vrai si le code est complet ET conforme au standard DataVolley. */
export function isValidCode(code, opts) {
  const sc = scanCode(code, 0, opts);
  return sc.complete && sc.issues.length === 0 && sc.end >= String(code || '').length;
}

/** Reconstruction canonique du code (2 chiffres de joueur, majuscules). */
export function formatCode(fields) {
  const f = fields || {};
  const teamKey = f.teamKey || teamKeyFromId(f.team);
  const num = String(f.player_number || 0).padStart(2, '0');
  const parts = [teamKey, num, f.action || ''];
  if (f.combo) {
    // Combinaison d'attaque : elle remplace le type et la zone de départ
    // (celles-ci sont déduites de la combinaison).
    parts.push(String(f.combo).toUpperCase());
    if (f.end_zone) parts.push(f.end_zone); // zone visée explicite éventuelle
  } else if (f.call) {
    // Appel passeur : placé après l'action (passe), les zones restent possibles.
    parts.push(String(f.call).toUpperCase());
    if (f.start_zone) parts.push(f.start_zone);
    if (f.end_zone) parts.push(f.end_zone);
  } else {
    if (f.type) parts.push(f.type);
    if (f.action === 'S') {
      if (f.end_zone) parts.push(f.end_zone); // la zone 1 de départ est implicite
    } else {
      if (f.start_zone) parts.push(f.start_zone);
      if (f.end_zone) parts.push(f.end_zone);
    }
  }
  if (f.end_subzone) parts.push(f.end_subzone);
  parts.push(f.evaluation || '');
  if (f.num_blockers !== undefined && f.num_blockers !== null && f.num_blockers !== '') {
    parts.push(String(f.num_blockers));
  }
  if (f.kill_type) parts.push(String(f.kill_type).toUpperCase());
  if (f.special_code) parts.push(String(f.special_code).toUpperCase());
  return parts.join('');
}

/** Construit un code canonique à partir de champs séparés. */
export function buildCode({ team, teamKey, playerNumber, action, type, evaluation, startZone, endZone, endSubzone, numBlockers, killType, specialCode }) {
  return formatCode({
    team: team || teamIdFromKey(teamKey),
    teamKey,
    player_number: playerNumber,
    action,
    type: type || '',
    evaluation: evaluation || '',
    start_zone: startZone || '',
    end_zone: endZone || '',
    end_subzone: endSubzone || '',
    num_blockers: numBlockers ?? '',
    kill_type: killType || '',
    special_code: specialCode || '',
  });
}

/** Analyse stricte : renvoie null si le code n'est pas conforme. */
export function parseCode(code) {
  if (!isValidCode(code)) return null;
  const sc = scanCode(code, 0);
  return {
    code,
    team: sc.team,
    teamKey: sc.teamKey,
    playerNumber: sc.player_number,
    player_number: sc.player_number,
    action: sc.action,
    type: sc.type,
    combo: sc.combo,
    call: sc.call,
    startZone: sc.start_zone,
    endZone: sc.end_zone,
    endSubzone: sc.end_subzone,
    start_zone: sc.start_zone,
    end_zone: sc.end_zone,
    end_subzone: sc.end_subzone,
    evaluation: sc.evaluation,
    num_blockers: sc.num_blockers,
    kill_type: sc.kill_type,
    special_code: sc.special_code,
  };
}

/**
 * Décompose un code (même défectueux) en champs, sans lever d'erreur.
 * Sert au stockage local et au regroupement en points.
 */
export function decomposeCode(code) {
  const sc = scanCode(code, 0);
  return {
    team: sc.team,
    player_number: sc.player_number,
    action: sc.action,
    type: sc.type,
    combo: sc.combo,
    call: sc.call,
    start_zone: sc.start_zone,
    end_zone: sc.end_zone,
    end_subzone: sc.end_subzone,
    evaluation: sc.evaluation,
    num_blockers: sc.num_blockers,
    kill_type: sc.kill_type,
    special_code: sc.special_code,
  };
}

// ---------------------------------------------------------------------------
// VALIDATION + DESCRIPTION
// ---------------------------------------------------------------------------
export const DV_ISSUE_LABELS = {
  empty: 'saisie vide',
  bad_team: "l'équipe doit être '*' (domicile) ou 'a' (extérieur)",
  missing_player: 'il manque le numéro de joueur',
  bad_player: 'numéro de joueur invalide (1 à 99)',
  bad_action: 'action inconnue — attendu : S R A B D E F',
  bad_type: 'type inconnu pour cette action',
  bad_eval: 'évaluation inconnue pour cette action',
  missing_eval: "il manque l'évaluation (# + ! - / =)",
  incomplete: 'saisie incomplète',
  trailing: 'caractères en trop à la fin du code',
  bad_combined: 'formule combinée mal formée (attendu : a04SM.06#)',
};

export function describeIssues(issues) {
  const list = (issues || []).map((k) => DV_ISSUE_LABELS[k] || k);
  return list.length ? list.join(' · ') : 'aucun problème';
}

/**
 * Valide un code d'action (formule compacte DataVolley).
 * @returns {{valid:boolean, issues:string[], labels:string[]}}
 */
export function validateAction(code, opts) {
  const s = String(code || '');
  if (!s.length) return { valid: false, issues: ['empty'], labels: describeIssues(['empty']) };

  const sc = scanCode(s, 0, opts);
  const issues = [...sc.issues];
  if (sc.end < s.length) issues.push('trailing');
  if (!sc.complete && !issues.length) issues.push('incomplete');

  return { valid: issues.length === 0, issues, labels: describeIssues(issues) };
}

/**
 * Décrit en français un code d'action (formule compacte).
 * @returns {string}
 */
export function describeCode(code, opts) {
  const sc = scanCode(code, 0, opts);
  if (!sc.complete || sc.issues.length) {
    return `Code non conforme — ${describeIssues(sc.issues)}`;
  }
  const team = sc.team === 'home' ? "l'équipe à domicile" : "l'équipe extérieure";
  const act = DV_ACTIONS.find((a) => a.code === sc.action);
  const ev = (DV_EVALUATIONS[sc.action] || []).find((e) => e.sym === sc.evaluation);

  const gesture = [act ? act.label.toLowerCase() : sc.action];
  if (sc.combo) {
    const ci = attackComboInfo(sc.combo);
    gesture.push(ci ? `« ${ci.label} » (${sc.combo})` : `combinaison ${sc.combo}`);
  }
  if (sc.call) {
    const ki = setterCallInfo(sc.call);
    gesture.push(ki ? `appel « ${ki.label} » (${sc.call})` : `appel ${sc.call}`);
  }
  if (sc.type) gesture.push(typeLabel(sc.action, sc.type).toLowerCase());
  if (sc.action === 'S' && sc.end_zone) {
    gesture.push(`vers la zone ${sc.end_zone}`);
  } else if (sc.start_zone && sc.end_zone) {
    gesture.push(`des zones ${sc.start_zone} → ${sc.end_zone}`);
  } else if (sc.start_zone) {
    gesture.push(`zone ${sc.start_zone}`);
  }
  if (sc.end_subzone) gesture.push(`sous-zone ${sc.end_subzone}`);

  const extDetails = [];
  if (sc.num_blockers !== undefined && sc.num_blockers !== '') {
    const blk = DV_BLOCKER_COUNTS.find((b) => b.code === String(sc.num_blockers));
    extDetails.push(blk ? blk.label : `${sc.num_blockers} contreur(s)`);
  }
  if (sc.kill_type) {
    const kt = DV_EXTENDED_HIT_TYPES.find((h) => h.code === sc.kill_type);
    extDetails.push(kt ? kt.label : sc.kill_type);
  }
  if (sc.special_code) {
    const sp = DV_EXTENDED_SPECIALS.find((x) => x.code === sc.special_code);
    extDetails.push(sp ? sp.label : sc.special_code);
  }

  const who = `n°${String(sc.player_number).padStart(2, '0')} de ${team}`;
  const evalPart = ev
    ? ` « ${ev.label} »${ev.desc ? ' — ' + ev.desc : ''}`
    : sc.evaluation
      ? ` « ${sc.evaluation} »`
      : '';
  const extPart = extDetails.length ? ` [${extDetails.join(' · ')}]` : '';
  return `Le ${who} : ${gesture.join(' ')}${evalPart}${extPart}`;
}

// ---------------------------------------------------------------------------
// DÉCOUPAGE D'UNE SAISIE LIBRE
// ---------------------------------------------------------------------------
function oppositeTeamKey(key) {
  return key === 'a' ? '*' : 'a';
}
export { oppositeTeamKey };

function pad2(n) {
  return String(n || 0).padStart(2, '0');
}

/** Partie « réception » d'une formule combinée : [joueur][évaluation]. */
function scanReceptionPart(s, start) {
  let i = start;
  let digits = '';
  while (i < s.length && digits.length < 2 && isDigitChar(s[i])) {
    digits += s[i];
    i += 1;
  }
  if (!digits) return null;
  const ev = s[i];
  if (!ev || !DV_EVAL_KEYS.includes(ev)) return null;
  return { player_number: parseInt(digits, 10), evaluation: ev, end: i + 1 };
}

/**
 * Partie « contre / défense » d'une formule combinée d'attaque :
 * [joueur][D?][évaluation]. « D » force la défense, sinon c'est un contre.
 */
function scanCombinedDefensePart(s, start) {
  let i = start;
  let digits = '';
  while (i < s.length && digits.length < 2 && isDigitChar(s[i])) {
    digits += s[i];
    i += 1;
  }
  if (!digits) return null;
  let kind = 'block';
  if (s[i] === 'D' || s[i] === 'd') {
    kind = 'dig';
    i += 1;
  }
  const ev = s[i];
  if (!ev || !DV_EVAL_KEYS.includes(ev)) return null;
  return { player_number: parseInt(digits, 10), kind, evaluation: ev, end: i + 1 };
}

/**
 * Analyse une saisie libre et la découpe en codes normalisés.
 * Gère la formule combinée service . réception (`a04SM.06#`), qui produit
 * DEUX actions : le service (évaluation déduite) et la réception adverse.
 * @returns {Array<{code:string, valid:boolean, issues?:string[], combined?:boolean, role?:string}>}
 */
export function parseSequence(str, opts = {}) {
  const s = String(str || '');
  const items = [];
  let i = 0;

  while (i < s.length) {
    const sc = scanCode(s, i, opts);
    if (sc.team === null) {
      items.push({ code: s[i], valid: false, issues: ['bad_team'] });
      i += 1;
      continue;
    }

    // --- Formule combinée : service (sans évaluation) + '.' + réception ---
    if (s[sc.end] === DV_COMBINED_SEPARATOR && sc.action === 'S' && !sc.evaluation) {
      const rc = scanReceptionPart(s, sc.end + 1);
      if (rc) {
        const source = s.slice(i, rc.end);
        const serveCode = formatCode({
          teamKey: sc.teamKey,
          player_number: sc.player_number,
          action: 'S',
          type: sc.type,
          start_zone: sc.start_zone,
          end_zone: sc.end_zone,
          evaluation: deriveServeEvaluation(rc.evaluation),
        });
        const recvCode = `${oppositeTeamKey(sc.teamKey)}${pad2(rc.player_number)}R${rc.evaluation}`;
        items.push({ code: serveCode, valid: true, combined: true, role: 'S', source });
        items.push({ code: recvCode, valid: true, combined: true, role: 'R', source });
        i = rc.end;
        continue;
      }
      items.push({
        code: s.slice(i, sc.end + 1),
        valid: false,
        issues: ['bad_combined'],
      });
      i = sc.end + 1;
      continue;
    }

    // --- Formule combinée d'attaque : attaque (sans éval) + '.' + contre/défense ---
    if (s[sc.end] === DV_COMBINED_SEPARATOR && sc.action === 'A' && !sc.evaluation) {
      const rc = scanCombinedDefensePart(s, sc.end + 1);
      if (rc) {
        const source = s.slice(i, rc.end);
        const attackCode = formatCode({
          teamKey: sc.teamKey,
          player_number: sc.player_number,
          action: 'A',
          combo: sc.combo,
          type: sc.type,
          start_zone: sc.start_zone,
          end_zone: sc.end_zone,
          end_subzone: sc.end_subzone,
          evaluation: deriveAttackEvaluation(rc.evaluation, rc.kind),
        });
        const defAction = rc.kind === 'dig' ? 'D' : 'B';
        const defCode = `${oppositeTeamKey(sc.teamKey)}${pad2(rc.player_number)}${defAction}${rc.evaluation}`;
        items.push({ code: attackCode, valid: true, combined: true, role: 'A', source });
        items.push({ code: defCode, valid: true, combined: true, role: defAction, source });
        i = rc.end;
        continue;
      }
      items.push({
        code: s.slice(i, sc.end + 1),
        valid: false,
        issues: ['bad_combined'],
      });
      i = sc.end + 1;
      continue;
    }

    const valid = sc.complete && sc.issues.length === 0;
    const raw = s.slice(i, sc.end > i ? sc.end : i + 1);
    items.push({ code: valid ? formatCode(sc) : raw, valid, issues: sc.issues, scan: sc });
    i = sc.end > i ? sc.end : i + 1;
  }

  return items;
}

/**
 * Développe une saisie libre en séquence « longue » (utile pour l'aperçu et
 * les exports) : une entrée par action réellement codée.
 */
export function expandCombinedSequence(str) {
  return parseSequence(str).filter((it) => it.valid).map((it) => it.code);
}

/** Découpe brute en blocs (même incomplets) pour l'affichage du buffer. */
export function splitBuffer(buffer) {
  return parseSequence(buffer);
}

/**
 * Découpe le tampon en BLOCS DE SAISIE : un bloc = un code tapé (même
 * incomplet), une formule combinée (`a04SM.06#`) comptant pour un seul bloc
 * bien qu'elle produise deux actions.
 * Sert à horodater chaque code au moment où il est terminé (façon DataVolley).
 * @returns {Array<{text:string,start:number,end:number}>}
 */
export function splitInputBlocks(buffer) {
  const s = String(buffer || '');
  const blocks = [];
  let i = 0;
  while (i < s.length) {
    const start = i;
    const sc = scanCode(s, i);
    let end = sc.end > i ? sc.end : i + 1;
    if (s[end] === DV_COMBINED_SEPARATOR && !sc.evaluation && (sc.action === 'S' || sc.action === 'A')) {
      const rc = sc.action === 'A' ? scanCombinedDefensePart(s, end + 1) : scanReceptionPart(s, end + 1);
      end = rc ? rc.end : end + 1;
    }
    blocks.push({ text: s.slice(start, end), start, end });
    i = end;
  }
  return blocks;
}

/**
 * Entretient les timecodes par bloc de saisie.
 *
 * Principe (comme DataVolley 4) : chaque code reçoit le temps vidéo de
 * l'instant où il est TERMINÉ. On conserve les temps des blocs dont le texte
 * n'a pas changé ; tout bloc nouveau ou modifié reçoit `now`.
 *
 * @param {Array<number|null>} times - temps des blocs du tampon précédent
 * @param {string} previousBuffer - tampon précédent (sans espaces)
 * @param {string} nextBuffer - tampon courant (sans espaces)
 * @param {number|null} now - position vidéo courante
 * @returns {Array<number|null>} un temps par bloc du tampon courant
 */
export function nextBlockTimes(times, previousBuffer, nextBuffer, now) {
  const prev = splitInputBlocks(previousBuffer).map((b) => b.text);
  const next = splitInputBlocks(nextBuffer).map((b) => b.text);
  let common = 0;
  while (common < prev.length && common < next.length && prev[common] === next[common]) common += 1;
  const kept = (Array.isArray(times) ? times : []).slice(0, common);
  const time = typeof now === 'number' && !Number.isNaN(now) ? now : null;
  while (kept.length < next.length) kept.push(time);
  return kept;
}

/**
 * Timecodes alignés sur les items de `parseSequence(buffer)` : un bloc donne
 * une action, sauf une formule combinée qui en donne deux (même temps).
 */
export function itemTimecodes(buffer, blockTimes) {
  const blocks = splitInputBlocks(buffer);
  const times = Array.isArray(blockTimes) ? blockTimes : [];
  const out = [];
  for (let b = 0; b < blocks.length; b += 1) {
    const parsed = parseSequence(blocks[b].text);
    for (let k = 0; k < parsed.length; k += 1) out.push(times[b] ?? null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// AIDE À LA SAISIE (clavier physique ou clavier virtuel)
// ---------------------------------------------------------------------------
export function currentInputBlock(buffer) {
  const blocks = splitInputBlocks(buffer);
  const last = blocks[blocks.length - 1];
  return last ? { text: last.text, start: last.start } : { text: '', start: 0 };
}

function countLeadingDigits(s) {
  let n = 0;
  while (n < 2 && isDigitChar(s[n])) n += 1;
  return n;
}

/**
 * Ce que l'on peut encore taper dans le bloc courant.
 * @returns {{type:'team'|'player'|'action'|'suffix'|'reception', allowed:string[]}}
 */
export function expectedForBuffer(buffer) {
  const { text } = currentInputBlock(buffer);
  const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  // Clé d'équipe facultative : `*`, `a`, ou un chiffre (domicile implicite).
  const teamChoices = [...DV_TEAM_KEYS, ...allDigits];
  if (!text) return { type: 'team', allowed: teamChoices };

  const first = text[0];
  if (first !== '*' && first !== 'a' && !isDigitChar(first)) return { type: 'team', allowed: teamChoices };

  if (text.endsWith(DV_COMBINED_SEPARATOR) && text.includes('S')) {
    return { type: 'reception', allowed: allDigits };
  }

  const nd = countLeadingDigits(text.slice(1));
  const idx = 1 + nd;
  if (idx >= text.length) {
    // 2 chiffres = numéro complet : on attend l'action. Sinon un 2e chiffre.
    return nd >= 2
      ? { type: 'action', allowed: DV_ACTION_KEYS.slice() }
      : { type: 'player', allowed: allDigits };
  }

  const action = text[idx];
  if (!isKnownAction(action)) return { type: 'action', allowed: DV_ACTION_KEYS.slice() };

  const rest = text.slice(idx + 1);
  const sc = scanCode(text, 0);
  if (sc.evaluation) {
    const extAllowed = [];
    if (action === 'A' || action === 'B' || action === 'S') {
      if (!sc.num_blockers) extAllowed.push(...DV_BLOCKER_KEYS);
      if (!sc.kill_type) extAllowed.push(...DV_EXTENDED_HIT_KEYS);
      if (!sc.special_code) extAllowed.push(...DV_EXTENDED_SPECIAL_KEYS);
    }
    return { type: 'suffix', allowed: extAllowed, combos: [], calls: [], hasEvaluation: true };
  }

  const hasComboOrCall = !!(sc.combo || sc.call);
  const hasType = hasComboOrCall || !!resolveTypeAlias(action, rest[0]);
  let zoneCount = 0;
  let k = hasComboOrCall ? 2 : hasType ? 1 : 0;
  while (zoneCount < 2 && /[1-9]/.test(rest[k])) {
    zoneCount += 1;
    k += 1;
  }
  const hasSub = (zoneCount === 2 || (sc.combo && zoneCount === 1)) && DV_SUBZONE_KEYS.includes(String(rest[k] || '').toUpperCase());

  const allowed = [];
  if (!hasType) allowed.push(...dvTypeKeys(action));
  if (!hasSub) {
    const maxZones = sc.combo ? 1 : 2;
    if (zoneCount < maxZones) allowed.push(...DV_ZONE_KEYS);
    if (zoneCount === 2 || (sc.combo && zoneCount === 1)) allowed.push(...DV_SUBZONE_KEYS);
  }
  allowed.push(...DV_EVAL_KEYS);
  if ((action === 'S' || action === 'A') && !DV_EVAL_KEYS.includes(rest[rest.length - 1])) {
    allowed.push(DV_COMBINED_SEPARATOR);
  }
  // Combinaisons d'attaque : proposées juste après l'action, avant tout type/zone.
  const combos = action === 'A' && rest.length === 0 ? DV_ATTACK_COMBO_KEYS.slice() : [];
  // Appels passeur : proposés juste après une passe.
  const calls = action === 'E' && rest.length === 0 ? DV_SETTER_CALL_KEYS.slice() : [];
  return { type: 'suffix', allowed, combos, calls, hasEvaluation: false };
}

/**
 * Ajoute un caractère au buffer si le langage l'autorise.
 * @returns {string|null} nouveau buffer, ou null si refusé
 */
export function tryAppendChar(buffer, char) {
  const s = String(buffer || '');
  if (typeof char !== 'string' || char.length < 1) return null;
  if (s.length >= 120) return null;

  // Combinaison d'attaque ou appel passeur insérés d'un bloc (2 caractères).
  if (char.length === 2) {
    const up = char.toUpperCase();
    const { text } = currentInputBlock(s);
    if (isAttackCombo(up)) return /^[a*]\d{1,2}A$/.test(text) ? s + up : null;
    if (isSetterCall(up)) return /^[a*]\d{1,2}E$/.test(text) ? s + up : null;
    return null;
  }
  if (char.length !== 1) return null;

  if (DV_TEAM_KEYS.includes(char)) return s + char; // démarre un nouveau code

  const exp = expectedForBuffer(s);
  if (exp.type === 'action') {
    const up = char.toUpperCase();
    return DV_ACTION_KEYS.includes(up) ? s + up : null;
  }
  if (exp.allowed.includes(char) || exp.allowed.includes(char.toUpperCase())) return s + char;
  return null;
}

/** Vrai si le buffer contient au moins un code complet et rien d'invalide. */
export function isBufferComplete(buffer) {
  const items = parseSequence(buffer);
  return items.length > 0 && items.every((it) => it.valid);
}

// ---------------------------------------------------------------------------
// TYPE HABITUEL D'UN JOUEUR (appris des actions déjà codées)
// ---------------------------------------------------------------------------
// Un service codé « *33SM# » mémorise le type « M » pour le n°33 (équipe
// domicile). Le type est ensuite proposé d'office : pré-remplissage du service
// suivant (« *33SM ») et complétion pendant la saisie (« *33S » → « *33SM »).
// ---------------------------------------------------------------------------

/** Actions dont le type habituel est proposé automatiquement. */
export const DV_AUTO_TYPE_ACTIONS = ['S'];

/** Clé de mémorisation : « équipe + n° joueur (2 chiffres) + action ». */
export function typeMemoryKey(teamKey, playerNumber, action) {
  return `${teamKey}${pad2(playerNumber)}${String(action || '').toUpperCase()}`;
}

/** Type mémorisé pour un joueur sur une action, ou null. */
function learnedType(types, teamKey, playerNumber, action) {
  const t = (types || {})[typeMemoryKey(teamKey, playerNumber, action)];
  return t ? String(t).toUpperCase() : null;
}

/**
 * Types habituels déduits des actions déjà codées : le dernier type codé pour
 * un joueur (sur une action donnée) gagne. Les codes incomplets sont ignorés.
 * @param {Array} actions actions codées ({ code }) ou codes bruts
 * @returns {Object<string,string>} ex. { '*33S': 'M' }
 */
export function learnActionTypes(actions) {
  const map = {};
  for (const entry of actions || []) {
    const code = typeof entry === 'string' ? entry : entry && entry.code;
    if (!code || !isValidCode(code)) continue;
    const sc = scanCode(code, 0);
    if (!sc.type || !sc.action || !sc.teamKey) continue;
    map[typeMemoryKey(sc.teamKey, sc.player_number, sc.action)] = String(sc.type).toUpperCase();
  }
  return map;
}

/**
 * Ajoute le type habituel à un code de service pré-rempli.
 * @param {string} prefill ex. '*33S' (voir serverPrefill)
 * @param {Object} types mémoire des types (voir learnActionTypes)
 * @returns {string} ex. '*33SM' (zone et évaluation restent à saisir)
 */
export function prefillWithLearnedType(prefill, types) {
  const s = String(prefill || '');
  const m = /^([*a])(\d{1,2})([A-Za-z])$/.exec(s);
  if (!m) return s;
  const action = m[3].toUpperCase();
  if (!DV_AUTO_TYPE_ACTIONS.includes(action)) return s;
  const type = learnedType(types, m[1], m[2], action);
  return type ? `${s}${type}` : s;
}

/**
 * Dernier bloc « équipe + n° joueur + action [+ type] » en fin de tampon.
 * Le type peut comporter jusqu'à deux lettres : le type proposé puis la lettre
 * tapée par l'utilisateur pour le remplacer (ex. « *33SMH »).
 * @returns {{start:number, match:Array}|null}
 */
function lastInputMatch(s) {
  const re = /^([*a])(\d{1,2})([A-Za-z])([A-Za-z]{0,2})$/;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    if (s[i] !== '*' && s[i] !== 'a') continue;
    const match = re.exec(s.slice(i));
    if (match) return { start: i, match };
  }
  return null;
}

/**
 * Complète (ou corrige) le type habituel dans le bloc en cours de saisie :
 *   « *33S »          → « *33SM »   dès que l'action est tapée ;
 *   « *33SM » + « H » → « *33SH »   si une autre lettre de type est tapée.
 * Un bloc déjà muni d'une zone ou d'une évaluation n'est jamais modifié.
 * @param {string} buffer tampon courant (le caractère tapé y est déjà inclus)
 * @param {Object} types mémoire des types (voir learnActionTypes)
 * @returns {string} tampon éventuellement complété
 */
export function autoCompleteType(buffer, types) {
  const s = String(buffer || '');
  const found = lastInputMatch(s);
  if (!found) return s;

  const [, teamKey, digits, actionRaw, typed] = found.match;
  const action = actionRaw.toUpperCase();
  const known = learnedType(types, teamKey, digits, action);
  if (!known || !isKnownAction(action) || !DV_AUTO_TYPE_ACTIONS.includes(action)) return s;

  const head = `${s.slice(0, found.start)}${teamKey}${digits}${action}`;
  if (!typed) return `${head}${known}`;
  // Le type mémorisé est déjà présent : une autre lettre de type le remplace.
  if (typed.length < 2) return s;
  if (resolveTypeAlias(action, typed[0]) !== known) return s;
  const next = resolveTypeAlias(action, typed[1]);
  return next ? `${head}${next}` : s;
}

/**
 * Tampon à afficher après une frappe : le type habituel est complété, sauf si
 * le tampon a rétréci (suppression) — le type proposé reste alors effaçable.
 * @param {string} buffer tampon après la frappe
 * @param {string} previousBuffer tampon avant la frappe
 * @param {Object} types mémoire des types (voir learnActionTypes)
 * @returns {string} tampon à afficher
 */
export function completeBufferAfterTyping(buffer, previousBuffer, types) {
  const s = String(buffer || '');
  if (s.length <= String(previousBuffer || '').length) return s;
  return autoCompleteType(s, types);
}

// ---------------------------------------------------------------------------
// RALLYES / POINTS
// ---------------------------------------------------------------------------

/** Équipe au service d'un rallye : équipe de la première action. */
export function rallyServerTeam(rally) {
  const first = rally?.actions?.[0];
  if (!first) return null;
  return first.team === 'away' ? 'team2' : 'team1';
}

/** Action qui décide du point (dernière action terminale « décidante »). */
export function rallyDecidingAction(rally) {
  const actions = rally?.actions || [];
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const a = actions[i];
    if (!isTerminalEvaluation(a.action, a.evaluation)) continue;
    if (isConditionallyTerminal(a.action, a.evaluation)) {
      const next = actions[i + 1];
      if (next && next.action === 'B' && next.team !== a.team) continue; // le contre décide
    }
    return a;
  }
  return null;
}

/**
 * Vainqueur d'un rallye ('team1' | 'team2') ou null si le point n'est pas fini.
 * Règle DataVolley : l'évaluation '#' donne le point à l'équipe de l'action,
 * toute autre évaluation terminale le donne à l'adversaire.
 */
export function getPointWinner(rally) {
  const dec = rallyDecidingAction(rally);
  if (!dec) return null;
  const winner = dec.evaluation === '#' ? dec.team : (dec.team === 'home' ? 'away' : 'home');
  return winner === 'away' ? 'team2' : 'team1';
}

export function isRallyComplete(rally) {
  return getPointWinner(rally) !== null;
}

/** Alias historique. */
export const rallyWinner = getPointWinner;

/** Libellés des façons de gagner un point (bilan de match standardisé). */
export const DV_WIN_METHODS = {
  ace: 'Ace',
  serve_error: 'Faute de service',
  reception_error: 'Erreur de réception (ace subi)',
  kill: 'Attaque gagnante',
  attack_blocked: 'Attaque contrée',
  attack_error: "Faute d'attaque",
  block: 'Contre gagnant',
  block_error: 'Faute de contre',
  dig_error: 'Erreur de défense',
  set_error: 'Faute de passe',
  freeball_error: 'Faute de ballon libre',
  other: 'Autre',
};

const WIN_METHOD_BY_ACTION = {
  S: { '#': 'ace', '=': 'serve_error' },
  R: { '=': 'reception_error' },
  A: { '#': 'kill', '/': 'attack_blocked', '=': 'attack_error' },
  B: { '#': 'block', '=': 'block_error', '/': 'block_error' },
  D: { '=': 'dig_error' },
  E: { '=': 'set_error' },
  F: { '=': 'freeball_error' },
};

/**
 * Détail de la conclusion d'un point.
 * @returns {{key:string, label:string, action:object|null, winner:string|null}}
 */
export function rallyWinMethod(rally) {
  const dec = rallyDecidingAction(rally);
  const winner = getPointWinner(rally);
  if (!dec) return { key: 'other', label: DV_WIN_METHODS.other, action: null, winner };
  const key = (WIN_METHOD_BY_ACTION[dec.action] || {})[dec.evaluation] || 'other';
  return { key, label: DV_WIN_METHODS[key], action: dec, winner };
}

// ---------------------------------------------------------------------------
// PRÉDICTION DE L'ACTION SUIVANTE (saisie rapide)
// ---------------------------------------------------------------------------
// Enchaînement typique d'un rallye. `opposite` = l'action suivante est jouée par
// l'équipe ADVERSE de la dernière action codée ; sinon par la même équipe.
export const NEXT_SKILL_FLOW = {
  S: { skill: 'R', opposite: true }, // service adverse → réception
  R: { skill: 'E', opposite: false }, // réception → passe
  E: { skill: 'A', opposite: false }, // passe → attaque
  A: { skill: 'B', opposite: true }, // attaque → contre adverse
  B: { skill: 'D', opposite: false }, // contre → défense
  D: { skill: 'E', opposite: false }, // défense → passe
  F: { skill: 'E', opposite: false }, // ballon libre → passe
};

/**
 * Suggère le code de l'action suivante d'un point EN COURS.
 * Renvoie null quand le point est terminé (un nouveau service démarre : voir
 * serverPrefill) ou quand l'action suivante n'est pas prédictible.
 * @param {Object} lastAction dernière action codée ({ action, evaluation, team|teamKey })
 * @param {Object} [opts] - { homeSetter, awaySetter } : numéros de passeur connus,
 *   pour pré-remplir le joueur d'une passe (skill « E »).
 * @returns {{teamKey:string, skill:string, playerNumber:number|null, opposite:boolean, code:string}|null}
 */
export function predictNextAction(lastAction, opts = {}) {
  if (!lastAction || !lastAction.action) return null;
  // Action terminale (hors A/ qui appelle un contre) → nouveau service.
  if (
    isTerminalEvaluation(lastAction.action, lastAction.evaluation) &&
    !isConditionallyTerminal(lastAction.action, lastAction.evaluation)
  ) {
    return null;
  }
  const flow = NEXT_SKILL_FLOW[lastAction.action];
  if (!flow) return null;
  const lastKey = lastAction.teamKey || teamKeyFromId(lastAction.team) || '*';
  const teamKey = flow.opposite ? oppositeTeamKey(lastKey) : lastKey;

  // Passe → on peut pré-remplir le passeur de l'équipe concernée, si connu.
  let playerNumber = null;
  if (flow.skill === 'E') {
    const setter = teamKey === 'a' ? Number(opts.awaySetter) : Number(opts.homeSetter);
    if (Number.isInteger(setter) && setter > 0) playerNumber = setter;
  }
  const code = playerNumber
    ? `${teamKey}${String(playerNumber).padStart(2, '0')}${flow.skill}`
    : `${teamKey}${flow.skill}`;
  return { teamKey, skill: flow.skill, playerNumber, opposite: flow.opposite, code };
}

/**
 * Regroupe une liste d'actions (déjà ordonnée) en points/rallyes.
 * Un point commence toujours par un service et se termine à la première action
 * réellement terminale (A/ n'est terminal que si aucun contre ne le décrit).
 */
export function groupActionsIntoRallies(actions, opts = {}) {
  const list = actions || [];
  const rallies = [];
  let current = null;
  const byService = !!opts.byService;

  const close = () => {
    if (!current) return;
    if (byService) {
      // Consultation : pas d'évaluation — le point se termine à la borne
      // (service suivant ou fin de liste), le gagnant reste inconnu.
      current.winner = null;
      current.complete = true;
    } else {
      current.winner = getPointWinner(current);
      current.complete = current.winner !== null;
    }
    rallies.push(current);
    current = null;
  };

  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.action === 'S' && current && current.actions.length) close();
    if (!current) current = { startIndex: a.action_index, actions: [] };
    current.actions.push(a);

    if (!byService) {
      if (isConditionallyTerminal(a.action, a.evaluation)) {
        const next = list[i + 1];
        const takenOver = next && next.action === 'B' && next.team !== a.team;
        if (!takenOver) close();
      } else if (isTerminalEvaluation(a.action, a.evaluation)) {
        close();
      }
    }
  }
  close();

  rallies.forEach((r, i) => {
    r.index = i + 1;
    r.pointNumber = i + 1;
    r.sequence = r.actions.map((a) => a.code).join('');
  });
  return rallies;
}

/**
 * Temps vidéo effectif d'une action (timecode direct, sinon system_time + offset).
 */
export function effectiveTime(action, syncOffset = 0) {
  if (action == null) return null;
  if (typeof action.timecode === 'number' && action.timecode !== null) return action.timecode;
  if (typeof action.system_time === 'number' && action.system_time !== null) {
    return action.system_time + (syncOffset || 0);
  }
  return null;
}

/**
 * Segments des points « sans les temps morts » : pour chaque point, la plage
 * [début de la 1ʳᵉ action − lead-in ; fin de la dernière action + lead-out].
 * Sert au mode Consultation (lecture enchaînée des points) et à la frise.
 */
export function buildPointSegments(rallies, opts = {}) {
  const { syncOffset = 0, leadIn = 4, leadOut = 3 } = opts;
  return (rallies || [])
    .map((r) => {
      const first = r.actions[0];
      const last = r.actions[r.actions.length - 1];
      const start = effectiveTime(first, syncOffset);
      const end = effectiveTime(last, syncOffset);
      const segmentStart = start != null ? Math.max(0, start - leadIn) : null;
      const segmentEnd = end != null ? end + leadOut : null;
      return { ...r, startTime: start, endTime: end, segmentStart, segmentEnd };
    })
    .filter((p) => p.segmentStart != null && p.segmentEnd != null && p.segmentEnd >= p.segmentStart);
}

export function formatTimecode(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '--:--';
  const s = Math.max(0, Number(seconds));
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenth = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${tenth}`;
}

// ---------------------------------------------------------------------------
// STATISTIQUES AGRÉGÉES
// ---------------------------------------------------------------------------
function emptyActionCounts() {
  const o = {};
  for (const a of DV_ACTION_KEYS) o[a] = 0;
  return o;
}

function emptyEvalCounts() {
  const o = {};
  for (const s of DV_EVAL_KEYS) o[s] = 0;
  return o;
}

function emptyMetrics() {
  return {
    aces: 0,
    serveErrors: 0,
    kills: 0,
    attackErrors: 0,
    attackBlocked: 0,
    blocksWon: 0,
    blockErrors: 0,
    positiveReceptions: 0,
    perfectReceptions: 0,
    receptionErrors: 0,
    digs: 0,
    digErrors: 0,
    setErrors: 0,
    faults: 0,
  };
}

/**
 * Agrège des statistiques par action / évaluation / joueur / équipe.
 * Les actions non conformes sont comptées mais n'alimentent pas les détails.
 */
export function computeCodeStats(actions) {
  const stats = {
    total: 0,
    invalid: 0,
    byAction: emptyActionCounts(),
    byEvaluation: emptyEvalCounts(),
    byTeam: { home: 0, away: 0 },
    byType: {},
    metrics: emptyMetrics(),
    byPlayer: {},
  };

  for (const a of actions || []) {
    if (!a) continue;
    stats.total += 1;
    const ok = a.action && DV_ACTION_KEYS.includes(a.action);
    if (!ok) stats.invalid += 1;
    if (stats.byAction[a.action] != null) stats.byAction[a.action] += 1;
    if (stats.byEvaluation[a.evaluation] != null) stats.byEvaluation[a.evaluation] += 1;
    if (stats.byTeam[a.team] != null) stats.byTeam[a.team] += 1;
    if (a.type) {
      const k = `${a.action}${a.type}`;
      stats.byType[k] = (stats.byType[k] || 0) + 1;
    }

    const m = stats.metrics;
    if (a.action === 'S' && a.evaluation === '#') m.aces += 1;
    if (a.action === 'S' && a.evaluation === '=') m.serveErrors += 1;
    if (a.action === 'A' && a.evaluation === '#') m.kills += 1;
    if (a.action === 'A' && a.evaluation === '=') m.attackErrors += 1;
    if (a.action === 'A' && a.evaluation === '/') m.attackBlocked += 1;
    if (a.action === 'B' && a.evaluation === '#') m.blocksWon += 1;
    if (a.action === 'B' && a.evaluation === '=') m.blockErrors += 1;
    if (a.action === 'R' && (a.evaluation === '#' || a.evaluation === '+')) m.positiveReceptions += 1;
    if (a.action === 'R' && a.evaluation === '#') m.perfectReceptions += 1;
    if (a.action === 'R' && a.evaluation === '=') m.receptionErrors += 1;
    if (a.action === 'D') m.digs += 1;
    if (a.action === 'D' && a.evaluation === '=') m.digErrors += 1;
    if (a.action === 'E' && a.evaluation === '=') m.setErrors += 1;
    if (a.evaluation === DV_FAULT_EVALUATION) m.faults += 1;

    const key = `${a.team}:${a.player_number}`;
    if (!stats.byPlayer[key]) {
      stats.byPlayer[key] = {
        team: a.team,
        playerNumber: a.player_number,
        total: 0,
        byAction: emptyActionCounts(),
        byEvaluation: emptyEvalCounts(),
        ...emptyMetrics(),
      };
    }
    const p = stats.byPlayer[key];
    p.total += 1;
    if (p.byAction[a.action] != null) p.byAction[a.action] += 1;
    if (p.byEvaluation[a.evaluation] != null) p.byEvaluation[a.evaluation] += 1;
    if (a.action === 'S' && a.evaluation === '#') p.aces += 1;
    if (a.action === 'S' && a.evaluation === '=') p.serveErrors += 1;
    if (a.action === 'A' && a.evaluation === '#') p.kills += 1;
    if (a.action === 'A' && a.evaluation === '=') p.attackErrors += 1;
    if (a.action === 'A' && a.evaluation === '/') p.attackBlocked += 1;
    if (a.action === 'B' && a.evaluation === '#') p.blocksWon += 1;
    if (a.action === 'R' && (a.evaluation === '#' || a.evaluation === '+')) p.positiveReceptions += 1;
    if (a.action === 'R' && a.evaluation === '#') p.perfectReceptions += 1;
    if (a.action === 'R' && a.evaluation === '=') p.receptionErrors += 1;
    if (a.action === 'D') p.digs += 1;
    if (a.evaluation === DV_FAULT_EVALUATION) p.faults += 1;
  }

  stats.playerList = Object.values(stats.byPlayer).sort((x, y) =>
    x.team === y.team ? x.playerNumber - y.playerNumber : x.team.localeCompare(y.team)
  );
  return stats;
}

// ---------------------------------------------------------------------------
// VENTILATION PAR ACTION (onglet « Stats par action »)
// ---------------------------------------------------------------------------
export function computeActionBreakdown(actions, actionCode) {
  const empty = () => ({ total: 0, totals: {}, players: {}, playerList: [], totalsPct: {}, types: {} });
  const result = { home: empty(), away: empty() };

  for (const a of actions || []) {
    if (!a || a.action !== actionCode) continue;
    if (!isValidCode(a.code)) continue;
    if (a.team !== 'home' && a.team !== 'away') continue;
    const side = result[a.team];
    side.total += 1;
    side.totals[a.evaluation] = (side.totals[a.evaluation] || 0) + 1;
    if (a.type) side.types[a.type] = (side.types[a.type] || 0) + 1;
    if (!side.players[a.player_number]) {
      side.players[a.player_number] = { playerNumber: a.player_number, total: 0, byEval: {}, byType: {} };
    }
    const p = side.players[a.player_number];
    p.total += 1;
    p.byEval[a.evaluation] = (p.byEval[a.evaluation] || 0) + 1;
    if (a.type) p.byType[a.type] = (p.byType[a.type] || 0) + 1;
  }

  for (const key of ['home', 'away']) {
    const side = result[key];
    side.playerList = Object.values(side.players).sort((x, y) => x.playerNumber - y.playerNumber);
    for (const p of side.playerList) {
      p.pct = {};
      for (const sym of DV_EVAL_KEYS) {
        const n = p.byEval[sym] || 0;
        p.pct[sym] = p.total ? Math.round((n / p.total) * 100) : 0;
      }
    }
    side.totalsPct = {};
    for (const sym of DV_EVAL_KEYS) {
      const n = side.totals[sym] || 0;
      side.totalsPct[sym] = side.total ? Math.round((n / side.total) * 100) : 0;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// CONSTRUCTION / ÉDITION DE LA LISTE D'ACTIONS
// ---------------------------------------------------------------------------
let _uidSeq = 0;

export function makeUid() {
  _uidSeq += 1;
  return `a${Date.now().toString(36)}${_uidSeq}`;
}

/** Ajoute un `uid` aux actions qui n'en ont pas (données chargées du serveur). */
export function ensureUids(actions) {
  return (actions || []).map((a) => (a.uid ? a : { ...a, uid: makeUid() }));
}

/** Réattribue action_index selon l'ordre courant du tableau. */
export function reindexActions(actions) {
  return (actions || []).map((a, i) => ({ ...a, action_index: i }));
}

/**
 * Construit un objet action à partir d'un code (conforme ou non).
 * @param {string} code
 * @param {number|null} currentTimecode
 * @param {object} extra champs additionnels (action_index, set_number, note…)
 */
export function makeAction(code, currentTimecode = null, extra = {}) {
  const hasTime = typeof currentTimecode === 'number' && !Number.isNaN(currentTimecode);
  return {
    uid: makeUid(),
    code,
    timecode: hasTime ? currentTimecode : null,
    system_time: hasTime ? Math.floor(Date.now() / 1000) : null,
    set_number: null,
    note: null,
    ...decomposeCode(code),
    ...extra,
  };
}

/**
 * Transforme les items renvoyés par parseSequence en actions.
 *
 * `opts.timecodes` (optionnel) donne un timecode par ITEM, y compris les items
 * invalides ignorés : c'est ainsi que chaque code garde le temps vidéo de
 * l'instant où il a été terminé (comportement DataVolley 4). Sans temps pour un
 * item, on retombe sur `opts.currentTimecode` (comportement historique).
 *
 * @param {Array<{code:string,valid:boolean}>} items
 * @param {{currentTimecode?:number|null, timecodes?:Array<number|null>,
 *          startIndex?:number, setNumber?:number|null}} opts
 */
export function makeActions(items, opts = {}) {
  const list = items || [];
  const times = Array.isArray(opts.timecodes) ? opts.timecodes : null;
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const it = list[i];
    if (!it.valid) continue;
    const own = times ? times[i] : null;
    const timecode = typeof own === 'number' && !Number.isNaN(own) ? own : opts.currentTimecode ?? null;
    out.push(
      makeAction(it.code, timecode, {
        action_index: (opts.startIndex || 0) + out.length,
        set_number: opts.setNumber ?? null,
      })
    );
  }
  return out;
}

/**
 * Remplace la séquence complète d'un point (rallye).
 * - Les actions dont le code est conservé gardent leur timecode / system_time.
 * - Les actions nouvelles prennent le timecode courant de la vidéo.
 * @returns {Array} nouvelle liste d'actions (réindexée)
 */
export function replaceRallySequence(actions, rally, sequence, opts = {}) {
  const list = actions || [];
  const items = parseSequence(sequence || '', opts).filter((it) => it.valid);
  const oldActions = rally && rally.actions ? rally.actions : [];
  const used = new Set();

  const replacement = items.map((it) => {
    const match = oldActions.find((old) => !used.has(old.uid) && old.code === it.code);
    if (match) {
      used.add(match.uid);
      return { ...match, code: it.code, ...decomposeCode(it.code) };
    }
    return makeAction(it.code, opts.currentTimecode);
  });

  if (!oldActions.length) {
    return reindexActions([...list, ...replacement]);
  }

  const firstUid = oldActions[0].uid;
  const lastUid = oldActions[oldActions.length - 1].uid;
  const startIdx = list.findIndex((a) => a.uid === firstUid);
  const endIdx = list.findIndex((a) => a.uid === lastUid);
  if (startIdx === -1 || endIdx === -1) {
    return reindexActions(list);
  }

  return reindexActions([
    ...list.slice(0, startIdx),
    ...replacement,
    ...list.slice(endIdx + 1),
  ]);
}

/** Ajoute une nouvelle séquence de codes à la fin de la liste (nouveau point). */
export function appendSequence(actions, sequence, opts = {}) {
  const items = parseSequence(sequence || '', opts);
  const added = makeActions(items, { ...opts, startIndex: (actions || []).length });
  return reindexActions([...(actions || []), ...added]);
}







