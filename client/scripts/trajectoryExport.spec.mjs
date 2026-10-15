// Vérifie l'export d'une fiche de trajectoire en dossier ZIP autonome :
// données sérialisées (data.js), contenu du ZIP et validité du visualiseur.
// Exécution : node client/scripts/trajectoryExport.spec.mjs
import {
  VIEWER_CSS,
  VIEWER_HTML,
  VIEWER_JS,
  buildTrajectoryData,
  renderDataScript,
  slugify,
  trajectoryZipFiles,
  trajectoryZipName,
} from '../src/utils/trajectoryExport.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Nom de fichier ==');
check('accents et espaces retirés', slugify('ASUL vs Narbonne') === 'asul-vs-narbonne', slugify('ASUL vs Narbonne'));
check('accents translittérés', slugify('Été 2026') === 'ete-2026', slugify('Été 2026'));
check('nom vide accepté', slugify('') === '');
check('nom absent accepté', slugify(undefined) === '');
check(
  'nom du ZIP',
  trajectoryZipName({ name: 'ASUL vs Narbonne' }) === 'trajectoires-asul-vs-narbonne.zip',
  trajectoryZipName({ name: 'ASUL vs Narbonne' })
);
check('ZIP sans nom', trajectoryZipName({}) === 'trajectoires-match.zip', trajectoryZipName({}));

const match = {
  id: 7,
  name: 'ASUL vs Narbonne',
  team1_name: 'ASUL',
  team2_name: 'Narbonne',
  home_team: {
    id: 1,
    name: 'ASUL',
    players: [
      { number: 4, name: 'Jean Dupont', role: 'outside' },
      { number: 9, name: 'Marc Petit', role: 'setter' },
      { number: 0, name: 'Sans numéro' },
    ],
  },
  away_team: { id: 2, name: 'Narbonne', players: [{ number: 12, name: 'Paul Roux', role: 'middle' }] },
};
const shots = [
  { team_side: 'home', player_number: 4, kind: 'serve', start: { x: 1.2, y: 76.5 }, end: { x: 150, y: 12.4 }, result: 'point' },
  { team_side: 'home', player_number: 4, kind: 'attack', start: { x: 30, y: 20 }, end: { x: 60, y: 40 }, result: 'feinte_continuite' },
  { team_side: 'away', player_number: 12, kind: 'serve', start: { x: 180, y: 20 }, end: { x: 5, y: 50 }, result: 'out' },
];

console.log('\n== Données du visualiseur ==');
const data = buildTrajectoryData(match, shots);
check('nom du match repris', data.name === 'ASUL vs Narbonne', data.name);
check('équipe 1 nommée', data.home.name === 'ASUL');
check('équipe 2 nommée', data.away.name === 'Narbonne');
check('joueurs sans numéro écartés', data.home.players.length === 2, `${data.home.players.length}`);
check('effectif trié par numéro', data.home.players.map((p) => p.number).join(',') === '4,9', data.home.players.map((p) => p.number).join(','));
check('toutes les flèches exportées', data.shots.length === 3, `${data.shots.length}`);
check('côté et type conservés', data.shots[1].team_side === 'home' && data.shots[1].kind === 'attack');
check('coordonnées conservées', data.shots[0].start.x === 1.2 && data.shots[0].end.y === 12.4);
check('date de génération présente', typeof data.generatedAt === 'string' && data.generatedAt.length >= 10);

console.log('\n== Flèches en colonnes (compatibilité) ==');
const fromColumns = buildTrajectoryData(match, [
  { team_side: 'home', player_number: 4, kind: 'serve', start_x: 10, start_y: 20, end_x: 30, end_y: 40, result: 'faute' },
]);
check('start_x / end_y lus', fromColumns.shots[0].start.x === 10 && fromColumns.shots[0].end.y === 40, JSON.stringify(fromColumns.shots[0]));
check('champs manquants ramenés à zéro', buildTrajectoryData(match, [{}]).shots[0].start.x === 0);

console.log('\n== Fiche à une seule équipe ==');
const solo = buildTrajectoryData({ name: 'Solo', team1_name: 'ASUL' }, []);
check('pas de deuxième équipe', solo.away === null);
check('équipe 1 présente', solo.home.name === 'ASUL');

console.log('\n== Fichier data.js ==');
const script = renderDataScript(data);
check('variable window.TRAJ_DATA', script.startsWith('window.TRAJ_DATA = '), script.slice(0, 30));
check('script terminé par ;', script.trim().endsWith(';'));
const parsed = JSON.parse(script.replace(/^window\.TRAJ_DATA = /, '').replace(/;\s*$/, ''));
check('JSON relu : 3 flèches', parsed.shots.length === 3, `${parsed.shots.length}`);
check('JSON relu : équipe adverse', parsed.away.name === 'Narbonne');
check('aucune balise fermante injectable', renderDataScript(buildTrajectoryData({ name: '</script>' }, [])).indexOf('</script>') === -1);

console.log('\n== Fichiers du ZIP ==');
const files = trajectoryZipFiles(match, shots);
const names = Object.keys(files).sort();
check('5 fichiers', names.length === 5, names.join(','));
check('trajectoires.html présent', names.includes('trajectoires.html'));
check('trajectoires.css présent', names.includes('trajectoires.css'));
check('trajectoires.js présent', names.includes('trajectoires.js'));
check('data.js présent', names.includes('data.js'));
check('lisez-moi présent', names.includes('lisez-moi.txt'));

console.log('\n== Cohérence du visualiseur ==');
check('la page charge data.js', VIEWER_HTML.includes('<script src="data.js"></script>'));
check('la page charge trajectoires.css', VIEWER_HTML.includes('href="trajectoires.css"'));
check('la page charge trajectoires.js', VIEWER_HTML.includes('<script src="trajectoires.js"></script>'));
check('la page contient la fenêtre d’agrandissement', VIEWER_HTML.includes('id="zoom"'));
check('le CSS garde les teintes du terrain', VIEWER_CSS.includes('.tj-court-field') && VIEWER_CSS.includes('.tj-court-free'));
check('le visualiseur lit window.TRAJ_DATA', VIEWER_JS.includes('window.TRAJ_DATA'));
check('le visualiseur reste en lecture seule', !VIEWER_JS.includes('data-pick') && !VIEWER_JS.includes('onComplete'));
let syntaxOk = true;
try {
  // Compilation seule (aucune exécution) : détecte une erreur de syntaxe.
  new Function(VIEWER_JS);
} catch (err) {
  syntaxOk = false;
  console.log(`       ${err.message}`);
}
check('visualiseur JS syntaxiquement valide', syntaxOk);
check(
  'CSS : accolades équilibrées',
  (VIEWER_CSS.match(/{/g) || []).length === (VIEWER_CSS.match(/}/g) || []).length
);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

