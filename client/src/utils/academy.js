import {
  DV_ACTIONS,
  DV_EVALUATIONS,
  DV_TYPES,
  DV_TYPE_ALIASES,
  DV_ZONE_KEYS,
  DV_ZONE_LABELS,
  DV_SUBZONE_KEYS,
  DV_ATTACK_COMBOS_DEFAULT,
  DV_SETTER_CALLS,
  DV_BLOCKER_COUNTS,
  DV_EXTENDED_HIT_TYPES,
  DV_EXTENDED_SPECIALS,
  parseSequence,
} from './datavolley.js';

const pad = (value) => String(value).padStart(2, '0');

function parseValidInput(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  return parts.flatMap((part) => parseSequence(part));
}

function hasValidCode(code) {
  const parsed = parseValidInput(code);
  return parsed.length > 0 && parsed.every((item) => item.valid);
}

function makeItem(key, title, explanation, example, prompt, answer) {
  return { key, title, explanation, example, exercise: { prompt, answer } };
}

const actionItems = DV_ACTIONS.map((action, index) => {
  const player = pad(index + 1);
  return makeItem(
    `action:${action.code}`,
    `${action.code} · ${action.label}`,
    action.desc,
    `*${player}${action.code}+`,
    `Code un(e) « ${action.label.toLowerCase()} » positive du n°${player}.`,
    `*${player}${action.code}+`,
  );
});

const evaluationItems = DV_ACTIONS.flatMap((action, actionIndex) =>
  (DV_EVALUATIONS[action.code] || []).map((evaluation, evaluationIndex) => {
    const player = pad(1 + ((actionIndex + evaluationIndex) % 12));
    return makeItem(
      `evaluation:${action.code}:${evaluation.sym}`,
      `${action.code}${evaluation.sym} · ${evaluation.label}`,
      evaluation.desc,
      `*${player}${action.code}${evaluation.sym}`,
      `Code « ${evaluation.label.toLowerCase()} » pour ${action.label.toLowerCase()} du n°${player}.`,
      `*${player}${action.code}${evaluation.sym}`,
    );
  }),
);

const typeItems = Object.entries(DV_TYPES).flatMap(([actionCode, types]) =>
  types.map((type, index) => {
    const action = DV_ACTIONS.find((item) => item.code === actionCode);
    const alias = DV_TYPE_ALIASES[actionCode]?.[type.sym];
    return makeItem(
      `type:${actionCode}:${type.sym}`,
      `${actionCode}${type.sym} · ${type.label}`,
      `${type.desc}${alias ? ` Alias de saisie reconnu : ${alias}.` : ''}`,
      `*${pad(index + 1)}${actionCode}${type.sym}+`,
      `Code une action ${action.label.toLowerCase()} de type « ${type.label.toLowerCase()} ».`,
      `*${pad(index + 1)}${actionCode}${type.sym}+`,
    );
  }),
);

const typeAliasItems = Object.entries(DV_TYPE_ALIASES).flatMap(([actionCode, aliases]) =>
  Object.entries(aliases).map(([alias, canonical]) => {
    const canonicalType = (DV_TYPES[actionCode] || []).find((type) => type.sym === canonical);
    return makeItem(
      `type-alias:${actionCode}:${alias}`,
      `Alias ${actionCode}${alias} → ${canonical}`,
      `Le parseur accepte « ${alias} » comme alias de « ${canonical} » pour ${actionCode === 'S' ? 'le service' : 'cette action'}. Le code est normalisé en ${canonicalType?.label || canonical}.`,
      `*01${actionCode}${alias}+`,
      `Essaie l’alias ${alias} pour le type ${canonicalType?.label || canonical}.`,
      `*01${actionCode}${canonical}+`,
    );
  }),
);

const zoneItems = DV_ZONE_KEYS.map((zone) => makeItem(
  `zone:${zone}`,
  `Zone ${zone} · ${DV_ZONE_LABELS[zone]}`,
  `La zone ${zone} correspond à « ${DV_ZONE_LABELS[zone]} ». Les zones se lisent du point de vue de l’équipe qui code.`,
  `*09A${zone}+`,
  `Code une attaque du n°9 depuis la zone ${zone}.`,
  `*09A${zone}+`,
));

const subzoneItems = DV_SUBZONE_KEYS.map((subzone) => makeItem(
  `subzone:${subzone}`,
  `Sous-zone ${subzone}`,
  `La sous-zone ${subzone} affine la direction de l’attaque après les zones de départ et d’arrivée.`,
  `*09A45${subzone}+`,
  `Code une attaque du n°9 de la zone 4 vers la zone 5, sous-zone ${subzone}.`,
  `*09A45${subzone}+`,
));

const comboItems = DV_ATTACK_COMBOS_DEFAULT.map((combo) => makeItem(
  `combo:${combo.code}`,
  `${combo.code} · ${combo.label}`,
  combo.desc,
  `*09A${combo.code}+`,
  `Code une attaque du n°9 avec la combinaison ${combo.code} (${combo.label}).`,
  `*09A${combo.code}+`,
));

const setterItems = DV_SETTER_CALLS.map((call) => makeItem(
  `setter:${call.code}`,
  `${call.code} · ${call.label}`,
  call.desc,
  `*07E${call.code}+`,
  `Code une passe positive du n°7 avec l’appel ${call.code}.`,
  `*07E${call.code}+`,
));

const extensionItems = [
  ...DV_BLOCKER_COUNTS.map((item) => makeItem(
    `blockers:${item.code}`, `${item.code} · ${item.label}`, item.desc,
    `*09A45#${item.code}`, `Ajoute le marqueur « ${item.code} » (${item.label}) à cette attaque gagnante.`, `*09A45#${item.code}`,
  )),
  ...DV_EXTENDED_HIT_TYPES.map((item) => makeItem(
    `hit:${item.code}`, `${item.code} · ${item.label}`, `Type de frappe étendu : ${item.label} (${item.short}).`,
    `*09A45#${item.code}`, `Ajoute le type de frappe étendu ${item.code} à cette attaque.`, `*09A45#${item.code}`,
  )),
  ...DV_EXTENDED_SPECIALS.map((item) => makeItem(
    `special:${item.code}`, `${item.code} · ${item.label}`, item.desc,
    `*09A45#${item.code}`, `Ajoute le marqueur spécial ${item.code} (${item.label}) à cette attaque.`, `*09A45#${item.code}`,
  )),
];

const syntaxItems = [
  makeItem('team:home', 'Équipe domicile · *', 'Le préfixe * désigne l’équipe domicile. Il peut être omis dans une saisie standard.', '*04S#', 'Code un ace du n°4 à domicile.', '*04S#'),
  makeItem('team:away', 'Équipe extérieure · a', 'Le préfixe a désigne l’équipe extérieure.', 'a04S#', 'Code un ace du n°4 à l’extérieur.', 'a04S#'),
  makeItem('team:omitted', 'Équipe omise', 'Dans une saisie standard, le préfixe domicile * peut être omis. Un code commençant par un chiffre désigne l’équipe domicile.', '04S#', 'Code un ace du n°4 en omettant le préfixe domicile.', '*04S#'),
  makeItem('player-number', 'Numéro de joueur', 'Le numéro de maillot comporte un ou deux chiffres; les exemples l’écrivent sur deux chiffres.', '*12S+', 'Code un service positif du n°12.', '*12S+'),
  makeItem('combined:serve-receive', 'Service + réception', 'Un point relie le service et la réception. L’évaluation du service est déduite de celle de la réception.', '*04S.08#', 'Code le service du n°4 suivi d’une réception parfaite du n°8 adverse.', '*04S.08#'),
  makeItem('combined:attack-block', 'Attaque + contre', 'Un point relie l’attaque et la réponse au filet. L’évaluation de l’attaque est déduite de celle du contre.', '*09A45.04#', 'Code l’attaque du n°9 de 4 vers 5 puis le contre gagnant du n°4 adverse.', '*09A45.04#'),
  makeItem('combined:attack-dig', 'Attaque + défense', 'La lettre D après le numéro adverse indique une défense plutôt qu’un contre.', '*09A45.04D+', 'Code l’attaque du n°9 de 4 vers 5 puis une défense positive du n°4 adverse.', '*09A45.04D+'),
  makeItem('point-marker:home', 'Point direct · *p', 'Le marqueur de point direct résout une action précédente si nécessaire.', '*p', 'Saisis le marqueur de point direct domicile.', '*p'),
  makeItem('point-marker:away', 'Point direct · ap', 'Le marqueur de point direct peut désigner le point de l’équipe extérieure.', 'ap', 'Saisis le marqueur de point direct extérieur.', 'ap'),
  makeItem('sequence:spacing', 'Suite d’actions', 'Les actions d’un rallye s’enchaînent dans l’ordre du jeu, séparées par des espaces.', '*04S# a03R+ *07E+ *09A#', 'Saisis un service, une réception, une passe puis une attaque gagnante.', '*04S# a03R+ *07E+ *09A#'),
];

function chunk(items, size = 5) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function unitsFromItems(prefix, items) {
  return chunk(items).map((group, index) => ({
    id: `${prefix}-${index + 1}`,
    title: group.length === 1 ? group[0].title : `${group[0].title} → ${group[group.length - 1].title}`,
    subtitle: `${group.length} notions · explication, exemple et défi`,
    color: ['#a3ff5f', '#55dcff', '#ffca5e', '#ff5aa5', '#b58aff'][index % 5],
    items: group,
    questions: group.map((item) => item.exercise),
    coverageKeys: group.map((item) => item.key),
    kind: 'codes',
  }));
}

const appTutorials = [
  { id: 'app-dashboard', title: 'Ton tableau de bord', subtitle: 'Retrouver les matchs, séances et raccourcis', path: '/dashboard', steps: ['Passe la souris tout en haut de l’écran pour afficher la barre des onglets.', 'Repère tes compteurs et modules depuis le Hub.', 'Utilise les cartes pour ouvrir directement Stats, Direct ou Centre vidéo.'] },
  { id: 'app-teams', title: 'Équipes & effectifs', subtitle: 'Configurer joueurs et numéros de maillot', path: '/teams', steps: ['Choisis ou crée une équipe dans l’espace actif.', 'Ajoute les joueurs avec leurs numéros et postes.', 'Vérifie les titulaires et le libéro avant de coder.'] },
  { id: 'app-create-match', title: 'Préparer un match (Stats)', subtitle: 'Configurer une vidéo YouTube avant le premier service', path: '/datavolley', steps: ['Ouvre l’onglet Stats puis clique sur « Nouveau match YouTube ».', 'Renseigne le lien YouTube et associe les deux équipes du match.', 'Vérifie la journée et les positions de départ puis lance le codage.'] },
  { id: 'app-live', title: 'Coder en direct', subtitle: 'Saisir un rallye rapidement et corriger au besoin', path: '/direct?tab=advanced', steps: ['Ouvre l’onglet Direct puis choisis « Stats en direct avancées ».', 'Crée un match en direct ou rejoins une session grâce au code.', 'Saisis les actions dans l’ordre du rallye et vérifie le score en temps réel.'] },
  { id: 'app-practice', title: 'Séances d’entraînement', subtitle: 'Créer un atelier depuis Stats et consulter son bilan', path: '/practice', steps: ['Dans l’onglet Stats, clique sur « Nouvelles stats d’entraînements ».', 'Crée une séance avec son nom, sa date, son équipe et une vidéo optionnelle.', 'Code les ateliers puis ouvre l’onglet Consultation pour lire le bilan.'] },
  { id: 'app-events', title: 'Événements de match', subtitle: 'Temps morts, remplacements et rotations', path: '/direct?tab=advanced', steps: ['Ouvre une séance dans Direct → Stats en direct avancées ou un match Stats.', 'Utilise les commandes dédiées pour noter temps mort, remplacement, sanction ou challenge.', 'Ces événements sont saisis depuis les commandes de l’app, sans les confondre avec les codes d’action.'] },
  { id: 'app-analysis', title: 'Analyser un match (Stats)', subtitle: 'Lire les statistiques et retrouver les actions', path: '/datavolley', steps: ['Dans Stats, ouvre un match codé (en cours ou terminé).', 'Bascule entre les modes Saisie, Consultation, Correction et Analyse.', 'Filtre les statistiques par équipe, action ou joueuse pour revoir chaque point en vidéo.'] },
  { id: 'app-video', title: 'Centre vidéo & clips', subtitle: 'Retrouver une action dans la vidéo', path: '/video-center', steps: ['Ouvre l’onglet Centre vidéo (via la barre du haut) et choisis un match.', 'Filtre par équipe, joueur, type d’action ou évaluation.', 'Enchaîne les séquences vidéo ou crée un clip/montage puis vérifie ses bornes.'] },
  { id: 'app-trajectories', title: 'Trajectoires', subtitle: 'Saisir et relire les trajectoires de balle', path: '/trajectories', steps: ['Choisis une équipe ou crée une fiche de trajectoires.', 'Enregistre les impacts de service et d’attaque sur la grille du terrain.', 'Consulte le bilan par zone, par joueuse ou par équipe.'] },
  { id: 'app-automation', title: 'Réglages & raccourcis', subtitle: 'Adapter le clavier sans perdre tes automatismes', path: '/datavolley/auto-codes', steps: ['Ouvre Codes Auto depuis la barre du haut.', 'Vérifie le profil clavier AZERTY Scout actif et les codes automatiques.', 'Teste une macro dans le bac à sable avant de l’utiliser en match.'] },
  { id: 'app-clubs', title: 'Équipes cloisonnées (multi-clubs)', subtitle: 'Séparer les données de plusieurs clubs sur le même poste', path: '/dashboard', steps: ['À ta première connexion, choisis l’équipe dans laquelle tu évolues sans aucun code requis.', 'Chaque équipe dispose de son écosystème étanche : matchs, effectifs, dossiers, trajectoires et directs.', 'Pour changer d’équipe à tout moment, passe la souris en haut de l’écran, clique sur ton profil en haut à droite puis sélectionne l’autre équipe.', 'Ta progression dans l’Académie reste personnelle à ton compte quel que soit l’espace actif.'] },
  { id: 'app-direct-easy', title: 'Direct · Stats en direct faciles', subtitle: 'Fast Direct multi-appareils : Stats, Banc et Caméra', path: '/direct', steps: ['Ouvre l’onglet Direct (l’onglet « Stats en direct faciles » est sélectionné par défaut).', 'Crée une session et clique sur « Code » pour partager les liens directs vers l’Appareil Stats, le Banc tablette (P1–P6) ou la Caméra.', 'Suis la distribution, les statistiques rapides et le flux vidéo différé en temps réel sans installation.'] },
  { id: 'app-direct-advanced', title: 'Direct · Stats en direct avancées', subtitle: 'Play-by-Play collaboratif et conversion vers Stats', path: '/direct?tab=advanced', steps: ['Dans Direct, bascule sur l’onglet « Stats en direct avancées ».', 'Associe deux équipes pour héberger un match ou rejoins une session existante par code.', 'Plusieurs statisticiens peuvent coder ensemble puis finaliser le match vers Stats pour l’analyse vidéo.'] },
  { id: 'app-multi-match', title: 'Analyse Multi-Matchs & Plan de jeu', subtitle: 'Cumuler plusieurs matchs et préparer l’adversaire', path: '/datavolley/multi', steps: ['Ouvre Multi-Matchs dans la barre du haut.', 'Coche plusieurs matchs de Stats pour cumuler Side-out, Break Point et efficacité par joueuse.', 'Utilise la vue Plan de jeu adverse pour repérer les tendances de distribution et d’attaque.'] },
  { id: 'app-distribution', title: 'Distribution Passeur', subtitle: 'Analyser les choix de passe par rotation P1–P6', path: '/distribution', steps: ['Ouvre l’onglet Distribution depuis la barre du haut (ou depuis Stats).', 'Sélectionne un ou plusieurs matchs DataVolley ou importe un classeur Excel.', 'Consulte les pourcentages par zone, passeur et rotation, puis exporte le rapport.'] },
  { id: 'app-video-multi', title: 'Centre vidéo & Playlists', subtitle: 'Compilation multi-matchs et playlists réutilisables', path: '/video-center', steps: ['Ouvre Centre vidéo et bascule vers la recherche multi-matchs si besoin.', 'Filtre des séquences précises (ex. réceptions négatives ou attaques en zone 4).', 'Ajoute les clips à une playlist persistante de ton équipe pour préparer la séance vidéo.'] },
];

const simulations = [
  { id: 'sim-compose', title: 'Construis un code', subtitle: 'Choisir équipe, joueuse, action et résultat', kind: 'simulation', scenario: 'Le n°8 extérieur réalise une réception parfaite.', questions: [{ prompt: 'Saisis le code DataVolley correspondant.', answer: 'a08R#' }] },
  { id: 'sim-correct', title: 'Répare le rallye', subtitle: 'Corriger une séquence sans toucher à un vrai match', kind: 'simulation', scenario: 'Le n°4 sert, le n°3 adverse reçoit positivement, le n°7 passe puis le n°9 marque.', initialCode: '*04S# a03R- a07E+ a09A#', questions: [{ prompt: 'La réception a été saisie « − », mais elle était positive. Corrige le code du rallye.', answer: '*04S# a03R+ a07E+ a09A#' }] },
  { id: 'sim-point', title: 'Le point en direct', subtitle: 'Coder chaque contact sous pression', scenario: 'Un point part du service domicile, passe par la réception et la passe extérieure, puis se termine par une attaque gagnante.', kind: 'simulation', questions: [
    { prompt: '1/4 · Le n°4 domicile sert positivement. Code le service.', answer: '*04S+' },
    { prompt: '2/4 · Le n°3 extérieur réalise une réception positive. Code la réception.', answer: 'a03R+' },
    { prompt: '3/4 · Le n°7 extérieur fait une passe positive. Code la passe.', answer: 'a07E+' },
    { prompt: '4/4 · Le n°9 extérieur conclut par une attaque gagnante. Code l’attaque.', answer: 'a09A#' },
  ] },
  { id: 'sim-combined', title: 'Mode frappe rapide', subtitle: 'Utiliser les formules combinées', kind: 'simulation', scenario: 'Le n°4 sert et le n°8 adverse réceptionne parfaitement; puis le n°9 attaque et le contre du n°4 adverse marque.', questions: [{ prompt: 'Saisis les deux formules combinées.', answer: '*04S.08# *09A45.04#' }] },
];

export const ACADEMY_WORLDS = [
  { id: 'world-foundation', title: 'Échauffement des codes', emoji: '🏐', color: '#a3ff5f', units: [
    ...unitsFromItems('syntax', syntaxItems),
    ...unitsFromItems('action', actionItems),
    ...unitsFromItems('evaluation', evaluationItems),
    ...unitsFromItems('type', [...typeItems, ...typeAliasItems]),
  ] },
  { id: 'world-court', title: 'Cartographie du terrain', emoji: '🗺️', color: '#55dcff', units: [
    ...unitsFromItems('zone', zoneItems), ...unitsFromItems('subzone', subzoneItems),
  ] },
  { id: 'world-combinations', title: 'Combinaisons & appels', emoji: '⚡', color: '#ffca5e', units: [
    ...unitsFromItems('combo', comboItems), ...unitsFromItems('setter', setterItems),
  ] },
  { id: 'world-advanced', title: 'Détails qui font la différence', emoji: '🧪', color: '#ff5aa5', units: [
    ...unitsFromItems('extension', extensionItems),
  ] },
  { id: 'world-app', title: 'Maîtrise l’application', emoji: '🎮', color: '#b58aff', units: appTutorials.map((tutorial) => ({
    id: tutorial.id,
    title: tutorial.title,
    subtitle: tutorial.subtitle,
    kind: 'tutorial',
    path: tutorial.path,
    steps: tutorial.steps,
    tutorial,
    coverageKeys: [tutorial.id],
  })) },
  { id: 'world-simulations', title: 'Terrain d’entraînement', emoji: '🔥', color: '#ff805e', units: simulations },
];

export const ACADEMY_UNITS = ACADEMY_WORLDS.flatMap((world) => world.units.map((unit) => ({ ...unit, worldId: world.id, worldTitle: world.title })));
export const ACADEMY_UNIT_BY_ID = Object.fromEntries(ACADEMY_UNITS.map((unit) => [unit.id, unit]));

export const ACADEMY_COVERAGE_ITEMS = [
  ...actionItems, ...evaluationItems, ...typeItems, ...zoneItems, ...subzoneItems,
  ...typeAliasItems, ...comboItems, ...setterItems, ...extensionItems, ...syntaxItems,
];

export function validateAcademyAnswer(input, expected) {
  if (hasValidCode(input) && hasValidCode(expected)) {
    const actual = parseValidInput(input).map((item) => item.code).join(' ');
    const wanted = parseValidInput(expected).map((item) => item.code).join(' ');
    if (actual.toUpperCase() === wanted.toUpperCase()) return true;
  }
  return String(input || '').replace(/\s+/g, ' ').trim().toUpperCase() === String(expected || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

