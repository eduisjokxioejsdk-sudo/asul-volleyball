// Vérification rapide du moteur DataVolley.
// Exécution : node client/scripts/datavolley.spec.mjs
import {
  getAdaptiveMargins,
  parseSequence,
  validateAction,
  decomposeCode,
  describeCode,
  formatCode,
  groupActionsIntoRallies,
  getPointWinner,
  rallyWinMethod,
  deriveServeEvaluation,
  isValidCode,
  scanCode,
  expectedForBuffer,
  tryAppendChar,
  learnActionTypes,
  prefillWithLearnedType,
  autoCompleteType,
  completeBufferAfterTyping,
  predictNextAction,
} from '../src/utils/datavolley.js';
import { serverPrefill } from '../src/utils/lineup.js';

let failures = 0;
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}\n       attendu ${e}\n       obtenu  ${a}`);
  }
}

console.log('\n== Catalogue officiel ==');
eq('F = ballon libre', decomposeCode('*11F#').action, 'F');
eq('E = passe', decomposeCode('*07E+').action, 'E');
eq('plus d’action « faute »', isValidCode('*08F'), false);

console.log('\n== Service ==');
eq('type M', decomposeCode('*04SM17#').type, 'M');
eq('zone de départ', decomposeCode('*04SM17#').start_zone, '1');
eq('zone cible', decomposeCode('*04SM17#').end_zone, '7');
eq('évaluation', decomposeCode('*04SM17#').evaluation, '#');
eq('canonique', parseSequence('*04SM17#')[0].code, '*04SM7#');
eq('alias F -> flottante', decomposeCode('*04SF#').type, 'Q');
eq('alias S -> smashée', decomposeCode('*04SS#').type, 'M');
eq('*08S= faute de service', isValidCode('*08S='), true);

console.log('\n== Formule combinée ==');
const comb = parseSequence('a04SM.06#');
eq('deux actions', comb.length, 2);
eq('action 1 = service', comb[0].code, 'a04SM-');
eq('action 2 = réception', comb[1].code, '*06R#');
eq('marquage combinaison', comb[0].combined && comb[1].combined, true);
eq('R# -> S-', deriveServeEvaluation('#'), '-');
eq('R= -> S#', deriveServeEvaluation('='), '#');
eq('combinée sans type', parseSequence('a04S.06!')[0].code, 'a04S!');
eq('combinée invalide', parseSequence('a04S.')[0].valid, false);

console.log('\n== Attaque et zones ==');
eq('zone de départ', decomposeCode('*09A4#').start_zone, '4');
eq('type placée', decomposeCode('*09AP4#').type, 'P');
eq('départ/arrivée', [decomposeCode('*09A45#').start_zone, decomposeCode('*09A45#').end_zone], ['4', '5']);
eq('sous-zone', decomposeCode('*09A45B#').end_subzone, 'B');
eq('faute par =', decomposeCode('*09A=').evaluation, '=');
eq('joueur 1 chiffre', parseSequence('*1A#')[0].code, '*01A#');
eq('contre faute de filet', decomposeCode('*05B=').evaluation, '=');

console.log('\n== Combinaisons d’attaque ==');
eq('X1 reconnue', decomposeCode('*09AX1#').combo, 'X1');
eq('X1 → zone de départ 3', decomposeCode('*09AX1#').start_zone, '3');
eq('X2 → zone de départ 2', decomposeCode('*09AX2#').start_zone, '2');
eq('XP → zone de départ 8', decomposeCode('*09AXP#').start_zone, '8');
eq('forme canonique conservée', parseSequence('*09AX1#')[0].code, '*09AX1#');
eq('code combinaison valide', isValidCode('*09AX1#'), true);
eq('combo + zone cible', decomposeCode('*09AX15#').end_zone, '5');
eq('clavier : combo inséré d’un bloc', tryAppendChar('*09A', 'X1'), '*09AX1');
eq('clavier : combo refusé hors attaque', tryAppendChar('*09S', 'X1'), null);
eq('description avec combo', describeCode('*09AX1#').includes('A Quick'), true);
eq('attaque type P non affectée', decomposeCode('*09AP45#').type, 'P');

console.log('\n== Appels passeur ==');
eq('K1 reconnu sur la passe', decomposeCode('*07EK1#').call, 'K1');
eq('passe avec appel valide', isValidCode('*07EK1#'), true);
eq('forme canonique de l’appel', parseSequence('*07EK1#')[0].code, '*07EK1#');
eq('clavier : appel inséré d’un bloc', tryAppendChar('*07E', 'K1'), '*07EK1');
eq('clavier : appel refusé hors passe', tryAppendChar('*09A', 'K1'), null);
eq('description avec appel', describeCode('*07EK1#').includes('Appel 1'), true);

console.log('\n== Formule combinée attaque . contre/défense ==');
const atk = parseSequence('*05AV66.12#');
eq('attaque + contre = 2 actions', atk.length, 2);
eq('attaque déduite (contre # → /)', atk[0].code, '*05AV66/');
eq('contre du n°12 adverse', atk[1].code, 'a12B#');
eq('combinée attaque marquée', atk[0].combined && atk[1].combined, true);
const atkDig = parseSequence('*05AV66.12D#');
eq('attaque + défense = 2 actions', atkDig.length, 2);
eq('attaque déduite (défense # → -)', atkDig[0].code, '*05AV66-');
eq('défense du n°12 (D)', atkDig[1].code, 'a12D#');

console.log('\n== Clé d’équipe omise (domicile implicite) ==');
eq('12S# = domicile', decomposeCode('12S#').team, 'home');
eq('12S# : joueur 12', decomposeCode('12S#').player_number, 12);
eq('canonique ré-ajoute le *', parseSequence('12S#')[0].code, '*12S#');
eq('code sans équipe valide', isValidCode('12S#'), true);
eq('1 chiffre sans équipe', decomposeCode('1A#').player_number, 1);
eq('a reste extérieur', decomposeCode('a12S#').team, 'away');
const noTeamComb = parseSequence('12S.10+');
eq('combinée sans équipe = 2 actions', noTeamComb.length, 2);
eq('service domicile déduit', noTeamComb[0].code, '*12S-');
eq('réception adverse', noTeamComb[1].code, 'a10R+');
eq('attaque sans équipe + contre', parseSequence('05AV66.12#')[0].code, '*05AV66/');

console.log('\n== Prédiction de l’action suivante ==');
eq('service (non terminal) → réception adverse', predictNextAction({ action: 'S', evaluation: '+', team: 'home' }).code, 'aR');
eq('réception → passe (même équipe)', predictNextAction({ action: 'R', evaluation: '#', team: 'away' }).code, 'aE');
eq('passe → attaque', predictNextAction({ action: 'E', evaluation: '+', team: 'home' }).code, '*A');
eq('attaque non terminale → contre adverse', predictNextAction({ action: 'A', evaluation: '+', team: 'home' }).code, 'aB');
eq('attaque contrée (A/) → contre', predictNextAction({ action: 'A', evaluation: '/', team: 'home' }).code, 'aB');
eq('défense → passe', predictNextAction({ action: 'D', evaluation: '+', team: 'home' }).code, '*E');
eq('attaque gagnante → nouveau service', predictNextAction({ action: 'A', evaluation: '#', team: 'home' }), null);
eq('service ace → nouveau service', predictNextAction({ action: 'S', evaluation: '#', team: 'home' }), null);
eq('passeur pré-rempli sur la passe', predictNextAction({ action: 'R', evaluation: '#', team: 'home' }, { homeSetter: 7 }).code, '*07E');
eq('passeur adverse utilisé', predictNextAction({ action: 'D', evaluation: '+', team: 'away' }, { awaySetter: 4 }).code, 'a04E');
eq('sans passeur connu : équipe seule', predictNextAction({ action: 'R', evaluation: '#', team: 'home' }, {}).code, '*E');

console.log('\n== Réception / défense / ballon libre ==');
eq('*06R# parfaite', describeCode('*06R#').includes('Parfaite'), true);
eq('*02D# défense', decomposeCode('*02D#').action, 'D');
eq('*11F+ ballon libre', decomposeCode('*11F+').action, 'F');

console.log('\n== Validation ==');
eq('vide', validateAction('').issues, ['empty']);
eq('équipe seule', validateAction('*').issues, ['missing_player', 'bad_action']);
eq('action inconnue', validateAction('*09X#').issues.includes('bad_action'), true);
eq('évaluation manquante', validateAction('*09A').issues, ['missing_eval']);
eq('type inconnu', validateAction('*09AZ#').issues.includes('bad_type'), true);
eq('ancien code faute rejeté', validateAction('*08F').valid, false);
eq('code conforme', validateAction('*09A4#').valid, true);

console.log('\n== Points / rallyes ==');
const rallyBlock = [
  { code: 'a04SM-', action: 'S', evaluation: '-', team: 'away' },
  { code: '*06R#', action: 'R', evaluation: '#', team: 'home' },
  { code: '*07A/', action: 'A', evaluation: '/', team: 'home' },
  { code: 'a09B#', action: 'B', evaluation: '#', team: 'away' },
];
const grouped = groupActionsIntoRallies(rallyBlock);
eq('un seul point', grouped.length, 1);
eq('contre gagnant extérieur', getPointWinner(grouped[0]), 'team2');
eq('méthode = contre', rallyWinMethod(grouped[0]).key, 'block');

const rallyAce = groupActionsIntoRallies([
  { code: '*01S#', action: 'S', evaluation: '#', team: 'home' },
]);
eq('ace pour le service', getPointWinner(rallyAce[0]), 'team1');
eq('méthode = ace', rallyWinMethod(rallyAce[0]).key, 'ace');

const rallyFault = groupActionsIntoRallies([
  { code: '*01S-', action: 'S', evaluation: '-', team: 'home' },
  { code: 'a08R=', action: 'R', evaluation: '=', team: 'away' },
]);
eq('R= point au service', getPointWinner(rallyFault[0]), 'team1');

const rallyAttack = groupActionsIntoRallies([
  { code: '*01S-', action: 'S', evaluation: '-', team: 'home' },
  { code: 'a08R#', action: 'R', evaluation: '#', team: 'away' },
  { code: 'a09A=', action: 'A', evaluation: '=', team: 'away' },
]);
eq('faute d’attaque', getPointWinner(rallyAttack[0]), 'team1');
eq('méthode = faute d’attaque', rallyWinMethod(rallyAttack[0]).key, 'attack_error');

console.log('\n== Saisie assistée ==');
eq('attendu au début', expectedForBuffer('').type, 'team');
eq('attendu après équipe', expectedForBuffer('*').allowed, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
eq('attendu après joueur', expectedForBuffer('*09').allowed.includes('A'), true);
eq(
  'attendu après service',
  ['Q', 'M', 'H', 'T', '.', '#'].every((c) => expectedForBuffer('*09S').allowed.includes(c)),
  true
);
eq('type accepté', tryAppendChar('*09S', 'Q'), '*09SQ');
eq('caractère refusé', tryAppendChar('*09', 'X'), null);
eq('nouveau code accepté', tryAppendChar('*09A#', 'a'), '*09A#a');
eq('position de fin', scanCode('*09A4#').end, 6);

console.log('\n== Écriture canonique ==');
eq('formatCode', formatCode({ team: 'home', player_number: 9, action: 'A', start_zone: '4', evaluation: '#' }), '*09A4#');
eq(
  'formatCode service',
  formatCode({ team: 'away', player_number: 4, action: 'S', type: 'M', end_zone: '7', evaluation: '#' }),
  'a04SM7#'
);

console.log('\n== Type habituel de service ==');
const learnedTypes = learnActionTypes(['*33SM#', '*33S=', '*07SH#', 'a04SQ#']);
eq('service memorise', learnedTypes['*33S'], 'M');
eq('faute sans type ne remplace pas', learnActionTypes(['*33SM#', '*33S='])['*33S'], 'M');
eq('dernier type code gagne', learnActionTypes(['*33SM#', '*33SH#'])['*33S'], 'H');
eq('equipe adverse', learnedTypes['a04S'], 'Q');
eq('code incomplet ignore', Object.keys(learnActionTypes(['*33S'])).length, 0);
eq('attaque memorisee aussi', learnActionTypes(['*09AH#'])['*09A'], 'H');

eq('pre-remplissage sans type connu', prefillWithLearnedType('*33S', {}), '*33S');
eq('pre-remplissage avec type connu', prefillWithLearnedType('*33S', learnedTypes), '*33SM');
eq('pre-remplissage equipe adverse', prefillWithLearnedType('a04S', learnedTypes), 'a04SQ');
eq('pre-remplissage joueur inconnu', prefillWithLearnedType('*09S', learnedTypes), '*09S');
eq('pre-remplissage equipe seule', prefillWithLearnedType('*', learnedTypes), '*');

const types33 = { '*33S': 'M' };
eq('complete des le service', autoCompleteType('*33S', types33), '*33SM');
eq('complete un numero a 1 chiffre', autoCompleteType('*3S', { '*03S': 'M' }), '*3SM');
eq('rien sans type connu', autoCompleteType('*09S', types33), '*09S');
eq('zone non touchee', autoCompleteType('*33SM5', types33), '*33SM5');
eq('evaluation non touchee', autoCompleteType('*33SM#', types33), '*33SM#');
eq('bloc precedent intact', autoCompleteType('*04A#*33S', types33), '*04A#*33SM');
eq('autre lettre remplace le type', autoCompleteType('*33SMH', types33), '*33SH');
eq('alias remplace et resolu', autoCompleteType('*33SMF', types33), '*33SQ');
eq('type choisi conserve', autoCompleteType('*33ST', types33), '*33ST');
eq('completion idempotente', autoCompleteType('*33SM', types33), '*33SM');
eq('attaque non completee', autoCompleteType('*09AH', { '*09A': 'H' }), '*09AH');
eq('code complete valide', isValidCode(`${autoCompleteType('*33S', types33)}7#`), true);

eq('frappe : type complete', completeBufferAfterTyping('*33S', '*33', types33), '*33SM');
eq('suppression : type effacable', completeBufferAfterTyping('*33S', '*33SM', types33), '*33S');
eq('remplacement a la frappe', completeBufferAfterTyping('*33SMH', '*33SM', types33), '*33SH');
eq('tampon vide', completeBufferAfterTyping('', '*33SM', types33), '');

// Scénario complet : le n°33 sert « *33SM# », le point suivant est pré-rempli.
const apresService = learnActionTypes(['*33SM#']);
eq(
  'service suivant pre-rempli avec le type',
  prefillWithLearnedType(serverPrefill({ server: 'team1', homeLineup: { P1: 33 } }), apresService),
  '*33SM'
);
eq('scenario complet : la frappe aboutit au meme code', autoCompleteType('*33S', apresService), '*33SM');
eq(
  'changement de serveur : type du nouveau joueur',
  prefillWithLearnedType(serverPrefill({ server: 'team2', awayLineup: { P1: 7 } }), learnActionTypes(['a07SQ#'])),
  'a07SQ'
);
eq(
  'joueur qui n a jamais servi : pas de type',
  prefillWithLearnedType(serverPrefill({ server: 'team1', homeLineup: { P1: 9 } }), apresService),
  '*09S'
);

console.log('\n== Mode consultation (évaluation facultative) ==');
const lightOpts = { evaluationOptional: true };
eq('service sans évaluation valide', validateAction('*02S', lightOpts).valid, true);
eq('attaque sans évaluation valide', validateAction('a10A', lightOpts).valid, true);
eq('sans option : évaluation exigée', validateAction('*02S').issues, ['missing_eval']);
eq('sans option : code rejeté', isValidCode('*02S'), false);
eq('avec option : code accepté', isValidCode('*02S', lightOpts), true);

const lightSeq = parseSequence('*02Sa10A*30A', lightOpts);
eq('découpage en 3 codes', lightSeq.length, 3);
eq('codes normalisés', lightSeq.map((it) => it.code), ['*02S', 'a10A', '*30A']);
eq('tous valides', lightSeq.every((it) => it.valid), true);
eq('description sans évaluation', describeCode('*02S', lightOpts).includes('service'), true);

const lightActions = [
  { code: '*02S', action: 'S', evaluation: '', team: 'home', player_number: 2, action_index: 0 },
  { code: 'a10A', action: 'A', evaluation: '', team: 'away', player_number: 10, action_index: 1 },
  { code: '*30A', action: 'A', evaluation: '', team: 'home', player_number: 30, action_index: 2 },
  { code: 'a03S', action: 'S', evaluation: '', team: 'away', player_number: 3, action_index: 3 },
  { code: '*09A', action: 'A', evaluation: '', team: 'home', player_number: 9, action_index: 4 },
];
const lightRallies = groupActionsIntoRallies(lightActions, { byService: true });
eq('découpage par service', lightRallies.length, 2);
eq('point 1 = service + attaques', lightRallies[0].actions.map((a) => a.code), ['*02S', 'a10A', '*30A']);
eq('point 2 = service + attaque', lightRallies[1].actions.map((a) => a.code), ['a03S', '*09A']);
eq('gagnant inconnu', getPointWinner(lightRallies[0]), null);

// Services consécutifs : ace / faute de service = fin de point immédiate.
const aceFault = groupActionsIntoRallies(
  [
    { code: '*01S', action: 'S', evaluation: '', team: 'home', action_index: 0 },
    { code: '*02S', action: 'S', evaluation: '', team: 'home', action_index: 1 },
    { code: '*03S', action: 'S', evaluation: '', team: 'home', action_index: 2 },
  ],
  { byService: true }
);
eq('services consécutifs = 3 points', aceFault.length, 3);
eq('chaque service seul = 1 action', aceFault.every((r) => r.actions.length === 1), true);

console.log('\n== Marges vidéo adaptatives (DataVolley 4 Pro) ==');
eq('service : 4.5s pre-roll', getAdaptiveMargins('S').leadIn, 4.5);
eq('attaque : 2.5s pre-roll', getAdaptiveMargins('A').leadIn, 2.5);
eq('bloc : 2.0s pre-roll', getAdaptiveMargins('B').leadIn, 2.0);
eq('réception : 3.5s pre-roll', getAdaptiveMargins('R').leadIn, 3.5);
eq('déduction depuis code complet *09AH#', getAdaptiveMargins('*09AH#').leadIn, 2.5);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

