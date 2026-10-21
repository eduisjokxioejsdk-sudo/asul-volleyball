// Vérifie la logique du PUPITRE DE SAISIE (façon DataVolley 4) : six cliquable,
// actions attendues, zones et évaluations, et fusion des clics dans le tampon.
// Exécution : node client/scripts/scout-pad.spec.mjs
import {
  PAD_COURT_ROWS,
  PAD_EXPECTED_LABELS,
  padInsert,
  padLineup,
  padState,
  playerToken,
  typedZones,
  withPlayer,
} from '../src/utils/scoutPad.js';

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
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Code joueur ==');
eq('domicile sur 2 chiffres', playerToken('home', 7), '*07');
eq('extérieur sur 2 chiffres', playerToken('away', 12), 'a12');
eq('numéro absent refusé', playerToken('home', 0), '');

console.log('\n== Six sur le terrain ==');
eq('ordre du terrain (filet en haut)', PAD_COURT_ROWS.flat(), ['P4', 'P3', 'P2', 'P5', 'P6', 'P1']);
const roster = [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, name: `Joueur ${n}`, role: 'outside' }));
const config = { roster, libero: 7, liberoFor: 1 };
const six = padLineup({ P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 }, config, 'home');
eq('six postes affichés', six.length, 6);
eq('nom du joueur', six.find((p) => p.position === 'P4').name, 'Joueur 4');
eq('libéro à la place du sortant', six.find((p) => p.position === 'P1').number, 7);
check('libéro signalé', six.find((p) => p.position === 'P1').isLibero === true);
eq('code du joueur', six.find((p) => p.position === 'P4').code, '*04');
const emptySlots = padLineup({ P1: 3 }, config, 'away');
eq('postes vides conservés', emptySlots.filter((p) => !p.number).length, 5);
eq('poste vide : pas de code', emptySlots.find((p) => !p.number).code, '');

console.log('\n== Zones déjà tapées ==');
eq('service : départ + cible', typedZones('*07S17#'), { start: '1', end: '7', sub: null });
eq('attaque : une zone', typedZones('*09A4'), { start: '4', end: null, sub: null });
eq('attaque : deux zones + sous-zone', typedZones('*09A45C'), { start: '4', end: '5', sub: 'C' });
eq('type sauté avant la zone', typedZones('*07SM7'), { start: '7', end: null, sub: null });
eq('sans action : aucune zone', typedZones('*07'), { start: null, end: null, sub: null });

console.log('\n== Ce que propose le pupitre ==');
const start = padState('');
eq('départ : équipe / joueur', start.expected, 'team');
eq('départ : libellé', start.expectedLabel, PAD_EXPECTED_LABELS.team);
check('départ : aucune action possible', start.skills.every((s) => !s.enabled));
check('départ : aucune évaluation possible', start.evaluations.every((e) => !e.enabled));

const player = padState('*07');
eq('joueur saisi : action attendue', player.expected, 'action');
eq('joueur actif', { team: player.activeTeam, number: player.activeNumber }, { team: 'home', number: 7 });
check('les 7 actions sont proposées', player.skills.filter((s) => s.enabled).length === 7);

const serve = padState('a12S');
eq('service : zones et évaluations', serve.expected, 'suffix');
eq('service : action reconnue', serve.action, 'S');
eq('service : équipe extérieure', serve.activeTeam, 'away');
check('service : zones proposées', serve.zoneCells.flat().filter((z) => z.enabled).length === 9);
check('service : évaluations proposées', serve.evaluations.filter((e) => e.enabled).length === 6);
eq('service : rôle de la zone', serve.zoneHint, 'zone de service (1 par défaut)');
eq('service : évaluations nommées', serve.evaluations.find((e) => e.sym === '#').label, 'Ace');

const serveZone = padState('*07S1');
eq('service : zone de départ', serveZone.zones.start, '1');
eq('service : rôle de la 2e zone', serveZone.zoneHint, 'zone cible du service');

const bothZones = padState('*09A45');
eq('attaque : deux zones', [bothZones.zones.start, bothZones.zones.end], ['4', '5']);
check('attaque : sous-zones proposées', bothZones.subzonesEnabled);
eq('attaque : rôle de la sous-zone', bothZones.zoneHint, 'sous-zone d’arrivée (facultative)');

const noEval = padState('*07S', { lightMode: true });
eq('sans évaluation : aucune évaluation', noEval.evaluations.length, 0);

console.log('\n== Clic joueur ==');
eq('tampon vide', withPlayer('', 'home', 7), '*07');
eq('remplace un numéro partiel', withPlayer('*0', 'home', 7), '*07');
eq('remplace un code sans évaluation', withPlayer('*07S', 'away', 12), 'a12');
eq('code évalué : nouveau bloc', withPlayer('*07S#', 'home', 7), '*07S#*07');

console.log('\n== Clics action / évaluation / zone ==');
eq('action', padInsert('*07', 'S'), '*07S');
eq('évaluation', padInsert('*07S', '#'), '*07S#');
eq('zone', padInsert('*07S', '4'), '*07S4');
eq('jeton joueur complet', padInsert('', '*09'), '*09');
eq('jeton refusé', padInsert('*07', 'S4'), null);

console.log('');
if (failures > 0) {
  console.log(`${failures} échec(s).`);
  process.exitCode = 1;
} else {
  console.log('OK — pupitre de saisie conforme.');
}
