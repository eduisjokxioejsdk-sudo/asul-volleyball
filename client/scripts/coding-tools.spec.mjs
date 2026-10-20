// Vérifie les outils des 4 modes de codage (Saisie · Consultation · Correction ·
// Analyse) : rotation au moment d'une action, recherche dans les codes, contrôle
// des codes, fenêtre de commandes, lecture sans les temps morts, corrections et
// descente d'un chiffre d'analyse vers les actions.
// Exécution : node client/scripts/coding-tools.spec.mjs
import {
  ACCORDION_CLOSED,
  accordionReduce,
  actionShortLabel,
  applyDirection,
  attackDirectionRows,
  attacksWithoutDirection,
  autoOpenPoint,
  buildPointSegments,
  codeIssues,
  commandToEvent,
  countByAction,
  countIssuesByType,
  deadTimeGaps,
  directionOf,
  drillDown,
  filterIssues,
  findAction,
  firstServeAnchor,
  groupByPoint,
  hasUsableSegments,
  insertCodeAt,
  isPointOpen,
  issuesByUid,
  matchCodePattern,
  moveAction,
  nextIssue,
  parseCommand,
  pointIndexAt,
  positionLabel,
  removeAction,
  reviewTotals,
  rotationAt,
  rotationByAction,
  rotationNumber,
  searchCodes,
  setActionTimecode,
  shiftTimecode,
  situationByAction,
  skippedTime,
  stepPoint,
  FUNCTION_EVALUATIONS,
} from '../src/utils/codingTools.js';
import { groupActionsIntoRallies, makeAction } from '../src/utils/datavolley.js';
import { buildScoutLine } from '../src/utils/dvw.js';
import { computeMatchState } from '../src/utils/rotation.js';

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

/** Action de test : code, temps vidéo, index (comme un codage réel). */
function mk(code, timecode, index, setNumber = 1) {
  const a = makeAction(code, timecode);
  a.action_index = index;
  a.set_number = setNumber;
  return a;
}

const LINEUP_HOME = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 };
const LINEUP_AWAY = { P1: 11, P2: 12, P3: 13, P4: 14, P5: 15, P6: 16 };
const SETUPS = {
  1: {
    first_server: 'team1',
    home_setter_pos: 'P1',
    away_setter_pos: 'P4',
    home_lineup: LINEUP_HOME,
    away_lineup: LINEUP_AWAY,
  },
};

// Point 1 : ace domicile. Point 2 : le visiteur gagne en réception (il tourne).
// Point 3 : ace domicile (personne ne tourne).
const ACTIONS = [
  mk('*01S#', 10, 1),
  mk('*02S+', 30, 2),
  mk('a03R#', 32, 3),
  mk('a04E+', 35, 4),
  mk('a05A#', 38, 5),
  mk('*06S#', 60, 6),
];
const RALLIES = groupActionsIntoRallies(ACTIONS);
const MATCH_STATE = computeMatchState(RALLIES, SETUPS);
const SEGMENTS = buildPointSegments(RALLIES, { syncOffset: 0, leadIn: 4, leadOut: 3 });

console.log('\n== Rotation au moment d une action ==');
eq('poste P1 → rotation 1', rotationNumber('P1'), 1);
eq('poste P4 → rotation 4', rotationNumber('P4'), 4);
eq('poste inconnu → aucune rotation', rotationNumber(null), null);
eq('libellé du poste', positionLabel('P4'), 'P4 — Avant gauche');
eq('libellé sans poste', positionLabel(null), '—');

const at1 = rotationAt(RALLIES, MATCH_STATE, 1);
eq('point 1 : set', at1.setNumber, 1);
eq('point 1 : score avant le point', at1.score, { team1: 0, team2: 0 });
eq('point 1 : serveur domicile', at1.server, 'team1');
eq('point 1 : rotation domicile', at1.homeRotation, 1);
eq('point 1 : rotation extérieure', at1.awayRotation, 4);
eq('point 1 : équipe de l action', at1.team, 'home');
eq('point 1 : rotation affichée = celle qui joue', at1.rotation, 1);
eq('point 1 : six domicile', at1.homeLineup.P3, 3);

const at5 = rotationAt(RALLIES, MATCH_STATE, 5);
eq('point 2 : score avant le point', at5.score, { team1: 1, team2: 0 });
eq('point 2 : action du visiteur', at5.team, 'away');
eq('point 2 : rotation extérieure avant le point', at5.rotation, 4);

const at6 = rotationAt(RALLIES, MATCH_STATE, 6);
eq('point 3 : le visiteur a tourné après son point', at6.awayRotation, 3);
eq('point 3 : le domicile n a pas tourné', at6.homeRotation, 1);
eq('point 3 : score avant le point', at6.score, { team1: 1, team2: 1 });
eq('action inconnue → null', rotationAt(RALLIES, MATCH_STATE, 999), null);

console.log('\n== Recherche dans les codes ==');
check('motif vide : tout passe', matchCodePattern('*01S#', ''));
check('recherche simple', matchCodePattern('*01S#', '01s'));
check('joker * en tête', matchCodePattern('a03R#', '*3R*'));
check('joker * et ? combinés', matchCodePattern('a03R#', 'a?3R#'));
check('motif qui ne correspond pas', !matchCodePattern('a03R#', '*9A'));
check('joker * accepte le vide', matchCodePattern('a3R#', 'a*3R#'));

eq('sans filtre : tout', searchCodes(ACTIONS, {}).length, 6);
eq('filtre équipe extérieure', searchCodes(ACTIONS, { team: 'away' }).length, 3);
eq('filtre joueur', searchCodes(ACTIONS, { player: 3 }).map((a) => a.code), ['a03R#']);
eq('filtre action', searchCodes(ACTIONS, { action: 'S' }).length, 3);
eq('filtre évaluation', searchCodes(ACTIONS, { evaluation: '#' }).length, 4);
eq('filtre zone', searchCodes([mk('*01A45#', 1, 1)], { zone: '4' }).length, 1);
eq('filtre zone absente', searchCodes(ACTIONS, { zone: '7' }).length, 0);
eq('filtre par set fourni', searchCodes(ACTIONS, { set: 2 }, { setOf: (a) => (a.action_index > 3 ? 2 : 1) }).length, 3);
eq('recherche libre', searchCodes(ACTIONS, { query: '*0?S*' }).length, 3);
eq('filtres combinés', searchCodes(ACTIONS, { team: 'home', action: 'S', evaluation: '#' }).length, 2);
eq('aucun résultat', searchCodes(ACTIONS, { team: 'away', action: 'B' }).length, 0);
eq('comptage par action', countByAction(ACTIONS), { S: 3, R: 1, E: 1, A: 1 });

console.log('\n== Contrôle des codes (correction) ==');
const badCode = mk('*01X#', 5, 1);
const badEval = { ...mk('*01S#', 5, 1), evaluation: 'Z' };
const noTime = { ...mk('*01S#', null, 1), timecode: null };
const served = [mk('*01S+', 10, 1), mk('*02S+', 20, 2)];
const issuesInvalid = codeIssues([badCode]);
eq('code non conforme signalé', issuesInvalid.map((i) => i.issue), ['invalid_code']);
check('gravité « erreur »', issuesInvalid[0].severity === 'error');
eq('évaluation interdite signalée', codeIssues([badEval]).map((i) => i.issue), ['bad_evaluation']);
eq('action sans temps signalée', codeIssues([noTime], { requireTimecode: true }).map((i) => i.issue), ['no_timecode']);
eq('évaluation absente signalée', codeIssues([{ ...mk('*01S#', 5, 1), evaluation: null }], { requireEvaluation: true }).map((i) => i.issue), ['no_evaluation']);
eq(
  'joueur absent de la fiche signalé',
  codeIssues([mk('*09S#', 5, 1)], { roster: { home: [1, 2] } }).map((i) => i.issue),
  ['unknown_player']
);
eq(
  'joueur présent : rien à signaler',
  codeIssues([mk('*01S#', 5, 1)], { roster: { home: [1, 2] } }).length,
  0
);
eq(
  'point sans fin de point',
  codeIssues(served).map((i) => i.issue),
  ['point_open']
);
eq(
  'le dernier point en cours n est pas une anomalie',
  codeIssues([mk('*01S+', 10, 1)]).length,
  0
);
eq(
  'point qui ne commence pas par un service',
  codeIssues([mk('*01A#', 5, 1)]).map((i) => i.issue),
  ['missing_serve']
);
eq(
  'réception qui ne suit pas un service',
  codeIssues([mk('*01A-', 5, 1), mk('a03R#', 6, 2)]).map((i) => i.issue),
  ['missing_serve', 'reception_without_serve']
);
const codeIssueList = codeIssues([mk('*01X#', 5, 1), mk('*02X#', 9, 2)]);
eq('index par uid', [...issuesByUid(codeIssueList).values()].length, 2);
eq('prochaine anomalie après 1', nextIssue(codeIssueList, 1)?.action_index, 2);
eq('prochaine anomalie cyclique', nextIssue(codeIssueList, 2)?.action_index, 1);
eq('aucune anomalie → null', nextIssue([], 0), null);

console.log('\n== Fenêtre de commandes ==');
eq('commande vide', parseCommand('').kind, 'none');
eq('temps mort domicile', parseCommand('T'), { kind: 'timeout', team: 'home' });
eq('temps mort minuscule', parseCommand('t').kind, 'timeout');
eq('temps mort extérieur', parseCommand('aT'), { kind: 'timeout', team: 'away' });
eq('temps mort extérieur majuscule', parseCommand('AT').team, 'away');
eq('remplacement domicile', parseCommand('C5.12'), { kind: 'substitution', team: 'home', out: 5, in: 12 });
eq('remplacement extérieur', parseCommand('aC5.12'), { kind: 'substitution', team: 'away', out: 5, in: 12 });
eq('remplacement tolérant', parseCommand('c 5 - 12'), { kind: 'substitution', team: 'home', out: 5, in: 12 });
check('même joueur refusé', parseCommand('C5.5').kind === 'unknown' && !!parseCommand('C5.5').error);
check('numéro nul refusé', parseCommand('C0.5').kind === 'unknown');
check('commande inconnue', parseCommand('X9').kind === 'unknown');
eq('code libre', parseCommand('>redcard'), { kind: 'note', text: 'REDCA', team: 'home' });
check('code libre vide refusé', parseCommand('>').kind === 'unknown');

eq(
  'temps mort → événement',
  commandToEvent(parseCommand('aT'), { setNumber: 2, pointNumber: 7 }),
  { set_number: 2, point_number: 7, team: 'away', kind: 'timeout' }
);
eq(
  'remplacement → événement',
  commandToEvent(parseCommand('C5.12'), { setNumber: 1, pointNumber: 3 }),
  { set_number: 1, point_number: 3, team: 'home', kind: 'substitution', payload: { out: 5, in: 12 } }
);
eq('commande invalide → aucun événement', commandToEvent(parseCommand('X9'), {}), null);
eq('commande vide → aucun événement', commandToEvent(parseCommand(''), {}), null);


console.log('\n== Lecture sans les temps morts ==');
eq('segments : un par point', SEGMENTS.length, 3);
eq('point 1 : début (marge de 4 s)', SEGMENTS[0].segmentStart, 6);
eq('point 1 : fin (marge de 3 s)', SEGMENTS[0].segmentEnd, 13);
eq('point 2 : début', SEGMENTS[1].segmentStart, 26);
eq('point 2 : fin', SEGMENTS[1].segmentEnd, 41);
eq('point 3 : début', SEGMENTS[2].segmentStart, 56);
eq('point lu à 10 s', pointIndexAt(SEGMENTS, 10), 0);
eq('temps mort à 20 s', pointIndexAt(SEGMENTS, 20), -1);
eq('point lu à 40 s', pointIndexAt(SEGMENTS, 40), 1);
eq('point lu à 62 s', pointIndexAt(SEGMENTS, 62), 2);
eq('instant illisible', pointIndexAt(SEGMENTS, NaN), -1);
eq('point suivant depuis le début', stepPoint(SEGMENTS, -1, 1), 0);
eq('point suivant', stepPoint(SEGMENTS, 0, 1), 1);
eq('borné à la fin', stepPoint(SEGMENTS, 2, 1), 2);
eq('point précédent', stepPoint(SEGMENTS, 1, -1), 0);
eq('borné au début', stepPoint(SEGMENTS, 0, -1), 0);
eq('précédent depuis aucun point', stepPoint(SEGMENTS, -1, -1), 2);
eq('aucun segment', stepPoint([], 0, 1), -1);

const gaps = deadTimeGaps(SEGMENTS, 70);
eq('trois temps morts (dont le début de vidéo)', gaps.length, 3);
eq('temps mort entre les points 1 et 2', gaps[1], { start: 13, end: 26, duration: 13 });
eq('temps mort évité au total', skippedTime(SEGMENTS, 70), 34);
eq(
  'totaux de consultation',
  reviewTotals(SEGMENTS, 70),
  { points: 3, played: 29, skipped: 34, full: 70 }
);
check('segments exploitables', hasUsableSegments(SEGMENTS));
check('segments vides inexploitables', !hasUsableSegments([]));

console.log('\n== Correction ==');
const anchor = firstServeAnchor(ACTIONS, 1005, { lead_in: 4 });
eq('calage : service d ancre', anchor.action.code, '*01S#');
eq('calage : décalage calculé', anchor.offset, 1005 - ACTIONS[0].system_time);
check('calage : synchronisation complète', anchor.sync.sync_offset === anchor.offset && anchor.sync.lead_in === 4);
check('calage impossible sans service', !!firstServeAnchor([mk('*01A#', 5, 1)], 10).error);

const uid5 = ACTIONS[4].uid;
eq('décalage du temps', shiftTimecode(ACTIONS, uid5, 2.5).find((a) => a.uid === uid5).timecode, 40.5);
eq('décalage négatif borné à zéro', shiftTimecode(ACTIONS, uid5, -999).find((a) => a.uid === uid5).timecode, 0);
eq('temps fixé depuis la vidéo', setActionTimecode(ACTIONS, uid5, 42.25).find((a) => a.uid === uid5).timecode, 42.25);
check('les autres actions ne bougent pas', shiftTimecode(ACTIONS, uid5, 2.5)[0].timecode === 10);
check('action retrouvée par uid', findAction(ACTIONS, uid5).code === 'a05A#');
check('uid inconnu → aucune action', findAction(ACTIONS, 'nope') === null);

const removed = removeAction(ACTIONS, uid5);
eq('suppression : une action en moins', removed.length, ACTIONS.length - 1);
eq('suppression : index recalculés', removed.map((a) => a.action_index), [0, 1, 2, 3, 4]);
const moved = moveAction(ACTIONS, uid5, -1);
eq('déplacement : nouvel ordre', moved.map((a) => a.code)[3], 'a05A#');
eq('déplacement : index recalculés', moved.map((a) => a.action_index), [0, 1, 2, 3, 4, 5]);
eq('déplacement hors limites : inchangé', moveAction(ACTIONS, ACTIONS[0].uid, -1).map((a) => a.code)[0], '*01S#');

const inserted = insertCodeAt(ACTIONS, 2, 'a07B#', { timecode: 31, setNumber: 1 });
eq('insertion : action ajoutée', inserted.actions.length, ACTIONS.length + 1);
eq('insertion : à la bonne place', inserted.actions[2].code, 'a07B#');
eq('insertion : temps conservé', inserted.actions[2].timecode, 31);
eq('insertion : index recalculés', inserted.actions.map((a) => a.action_index), [0, 1, 2, 3, 4, 5, 6]);
check('insertion refusée si code invalide', !!insertCodeAt(ACTIONS, 0, '*01X#').error);
eq('insertion refusée : liste inchangée', insertCodeAt(ACTIONS, 0, '*01X#').actions.length, ACTIONS.length);

console.log('\n== Analyse : d un chiffre vers les actions ==');
eq('descente : attaques du visiteur', drillDown(ACTIONS, { action: 'A' }).map((a) => a.code), ['a05A#']);
eq('descente : services gagnants domicile', drillDown(ACTIONS, { team: 'home', action: 'S', evaluation: '#' }).length, 2);
eq('descente : par joueur', drillDown(ACTIONS, { player: 4 }).map((a) => a.code), ['a04E+']);
eq('descente : par zone', drillDown([mk('*01A45#', 1, 1), mk('*02A12#', 2, 2)], { zone: '4' }).length, 1);
eq(
  'descente : par situation de réception',
  drillDown(ACTIONS, { situation: '+' }, { situationOf: (a) => (a.action === 'R' ? '+' : 0) }).map((a) => a.code),
  ['a03R#']
);
eq(
  'descente : par rotation',
  drillDown(ACTIONS, { rotation: 4 }, { rotationOf: (a) => (a.action_index === 5 ? 4 : 1) }).map((a) => a.code),
  ['a05A#']
);
eq(
  'descente : par point',
  drillDown(ACTIONS, { pointNumbers: [3] }, { pointOf: (a) => (a.action_index > 5 ? 3 : 1) }).map((a) => a.code),
  ['*06S#']
);
eq('descente : aucun résultat', drillDown(ACTIONS, { team: 'away', action: 'B' }).length, 0);
eq(
  'regroupement par point',
  groupByPoint(ACTIONS, { pointOf: (a) => (a.action_index <= 1 ? 1 : a.action_index <= 5 ? 2 : 3) }).map((g) => g.actions.length),
  [1, 4, 1]
);

console.log('\n== Liste des actions en accordéon (3.1.0) ==');
let acc = ACCORDION_CLOSED;
check('départ : aucun point ouvert', !isPointOpen(acc, 1) && !acc.all);
acc = accordionReduce(acc, { type: 'toggle', pointNumber: 2 });
eq('un clic ouvre le point', acc.open, 2);
acc = accordionReduce(acc, { type: 'toggle', pointNumber: 3 });
eq('ouvrir un point referme le précédent', acc.open, 3);
check('l’ancien point est replié', !isPointOpen(acc, 2) && isPointOpen(acc, 3));
acc = accordionReduce(acc, { type: 'toggle', pointNumber: 3 });
eq('re-cliquer referme', acc.open, null);
acc = accordionReduce(acc, { type: 'expandAll' });
check('« tout déplier » ouvre tous les points', isPointOpen(acc, 1) && isPointOpen(acc, 42) && acc.all);
acc = accordionReduce(acc, { type: 'toggle', pointNumber: 5 });
check('un clic après « tout déplier » isole le point', acc.open === 5 && acc.all === false && !isPointOpen(acc, 1));
acc = accordionReduce(acc, { type: 'collapseAll' });
check('« tout replier » referme tout', acc.open === null && !acc.all && !isPointOpen(acc, 5));
eq(
  'ouverture auto en Consultation : point lu',
  accordionReduce(ACCORDION_CLOSED, { type: 'auto', pointNumber: 7, follow: true }).open,
  7
);
eq(
  'suivi désactivé : l’accordéon ne bouge pas',
  accordionReduce({ open: 1, all: false }, { type: 'auto', pointNumber: 7, follow: false }).open,
  1
);
eq('mode Saisie : dernier point codé', autoOpenPoint('saisie', { lastPointNumber: 12 }), 12);
eq('mode Correction : point de l’action sélectionnée', autoOpenPoint('correction', { selectedPointNumber: 4 }), 4);
eq('mode Consultation : point en cours de lecture', autoOpenPoint('consultation', { activePointNumber: 9 }), 9);

console.log('\n== Filtres rotation et situation (3.1.0) ==');
const ROT_BY_ACTION = rotationByAction(RALLIES, MATCH_STATE);
eq('rotation de la 1re action (domicile en P1)', ROT_BY_ACTION.get(ACTIONS[0].uid), 1);
eq('rotation de l’attaque extérieure du point 2', ROT_BY_ACTION.get(ACTIONS[4].uid), 4);
eq('rotation du service domicile du point 3', ROT_BY_ACTION.get(ACTIONS[5].uid), 1);

const SIT_ACTIONS = [
  mk('*01S#', 10, 1),
  mk('a03R-', 12, 2),
  mk('a04A#', 14, 3),
  mk('a05A45#', 16, 4),
];
const SIT_MAP = situationByAction(SIT_ACTIONS);
eq('réception négative classée « − »', SIT_MAP.get(SIT_ACTIONS[1].uid), '-');
eq('attaque après réception négative classée « − »', SIT_MAP.get(SIT_ACTIONS[2].uid), '-');
eq(
  'filtre Situation « − » : réception + attaque',
  searchCodes(SIT_ACTIONS, { situation: '-' }, { situationOf: (a) => SIT_MAP.get(a.uid) }).length,
  2
);
eq(
  'filtre Rotation 4',
  searchCodes(SIT_ACTIONS, { rotation: 4 }, { rotationOf: (a) => (a.action === 'A' ? 4 : 1) }).length,
  2
);
eq(
  'filtre Rotation : aucune action en rotation 6',
  searchCodes(SIT_ACTIONS, { rotation: 6 }, { rotationOf: () => 1 }).length,
  0
);
const POS_R_ACTIONS = [mk('*01S#', 10, 1), mk('a03R+', 12, 2), mk('a04A#', 14, 3)];
const POS_R_MAP = situationByAction(POS_R_ACTIONS);
eq('réception positive → attaque classée « + »', POS_R_MAP.get(POS_R_ACTIONS[2].uid), '+');

console.log('\n== Contrôles enrichis (3.1.0) ==');
// 1. Joueur absent du six : l'action porte un numéro hors du six enregistré.
const SIX_ACTIONS = [mk('*09S5#', 10, 1)];
const SIX_STATE = computeMatchState(groupActionsIntoRallies(SIX_ACTIONS), SETUPS);
check(
  '1. joueur absent du six signalé',
  codeIssues(SIX_ACTIONS, { enriched: true, matchState: SIX_STATE }).some((i) => i.issue === 'player_not_in_six')
);
check(
  '1. contrôle désactivé sans six enregistré',
  !codeIssues(SIX_ACTIONS, { enriched: true }).some((i) => i.issue === 'player_not_in_six')
);

// 2. Serveur attendu : le visiteur sert alors que la rotation désigne le domicile.
const SERVER_ACTIONS = [mk('*01S5#', 10, 1), mk('a03S1#', 30, 2)];
const SERVER_STATE = computeMatchState(groupActionsIntoRallies(SERVER_ACTIONS), SETUPS);
check(
  '2. service par une équipe qui n’avait pas le service',
  codeIssues(SERVER_ACTIONS, { enriched: true, matchState: SERVER_STATE }).some((i) => i.issue === 'wrong_server')
);

// 3. Remplacement sans sortant sur le terrain.
const SUB_STATE = computeMatchState(groupActionsIntoRallies(SIX_ACTIONS), SETUPS);
const SUB_EVENTS = [{ kind: 'substitution', set_number: 1, point_number: 0, team: 'home', payload: { out: 9, in: 12 } }];
check(
  '3. remplacement sans sortant signalé',
  codeIssues(SIX_ACTIONS, { enriched: true, matchState: SUB_STATE, events: SUB_EVENTS }).some(
    (i) => i.issue === 'sub_without_out'
  )
);

// 4. Attaque sans direction.
check(
  '4. attaque sans direction signalée',
  codeIssues([mk('*04A#', 10, 1)], { enriched: true }).some((i) => i.issue === 'attack_without_direction')
);
// 5. Service sans direction.
check(
  '5. service sans direction signalé',
  codeIssues([mk('*01S#', 10, 1)], { enriched: true }).some((i) => i.issue === 'serve_without_direction')
);
// 6. Point non clos en fin de set (le set change au point suivant).
const SET_END_ACTIONS = [mk('*01S', 10, 1, 1), mk('a03S1#', 30, 2, 2)];
check(
  '6. point non clos en fin de set',
  codeIssues(SET_END_ACTIONS, { enriched: true }).some((i) => i.issue === 'point_not_closed')
);
// 7. Set manquant : le set 2 n'existe pas.
const MISSING_SET_ACTIONS = [mk('*01S5#', 10, 1, 1), mk('a03S1#', 30, 2, 3)];
check(
  '7. set manquant signalé',
  codeIssues(MISSING_SET_ACTIONS, { enriched: true }).some((i) => i.issue === 'missing_set')
);
const ENRICHED = codeIssues([mk('*01S#', 10, 1), mk('a02S1#', 12, 2)], { enriched: true });
check(
  'les contrôles enrichis sont des avertissements',
  ENRICHED.length > 0 && ENRICHED.every((i) => i.severity === 'warning')
);
eq(
  'compteurs par type d’anomalie',
  countIssuesByType([{ issue: 'a' }, { issue: 'a' }, { issue: 'b' }]),
  { a: 2, b: 1 }
);
eq('filtre « erreurs »', filterIssues([{ severity: 'error' }, { severity: 'warning' }], 'error').length, 1);

console.log('\n== Directions d’attaque (3.1.0) ==');
const DIR_TARGET = mk('*04A#', 10, 1);
const WITH_DIR = applyDirection([DIR_TARGET], DIR_TARGET.uid, '4', '5');
eq('code réécrit avec les 2 zones', WITH_DIR[0].code, '*04A45#');
eq('zone de départ conservée', WITH_DIR[0].start_zone, '4');
eq('zone d’arrivée conservée', WITH_DIR[0].end_zone, '5');
check('aucune action perdue', WITH_DIR.length === 1 && WITH_DIR[0].uid === DIR_TARGET.uid);
eq('direction lisible', directionOf(WITH_DIR[0]).key, '4 → 5');
eq('export .dvw : code avec les 2 zones', buildScoutLine(WITH_DIR[0]).split(';')[0], '*04A45#');
const DIR_ACTIONS = [mk('*04A45#', 10, 1), mk('*05A45#', 12, 2), mk('*06A54#', 14, 3), mk('*08A12#', 18, 5), mk('*07A#', 16, 4)];
const DIR_ROWS = attackDirectionRows(DIR_ACTIONS);
eq('agrégat « 4 → 5 » : volume', DIR_ROWS.find((r) => r.key === '4 → 5')?.total, 2);
eq('agrégat « 4 → 5 » : libellé', DIR_ROWS[0].key, '4 → 5');
eq('attaques sans direction', attacksWithoutDirection(DIR_ACTIONS).length, 1);
eq('pas de perte : une ligne par direction', DIR_ROWS.length, 3);

console.log('\n== Divers ==');


eq('six évaluations par les touches F', FUNCTION_EVALUATIONS.length, 6);
eq('F1 = faute', FUNCTION_EVALUATIONS[0], { key: 'F1', sym: '=' });
eq('F6 = point gagnant', FUNCTION_EVALUATIONS[5], { key: 'F6', sym: '#' });
eq('libellé court d une attaque', actionShortLabel('A'), 'Att');
eq('libellé court d une action inconnue', actionShortLabel('Z'), 'Z');

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

