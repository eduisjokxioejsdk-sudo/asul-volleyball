// Vérifie la logique de version et la cohérence des fichiers de version.
// Exécution : node client/scripts/version.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  changelogSince,
  compareVersions,
  formatNoteDate,
  normalizeVersion,
  parseVersion,
  updateState,
  whatsNewNotes,
} from '../src/utils/version.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

console.log('\n== Lecture des versions ==');
eq('version simple', normalizeVersion('1.2.3'), '1.2.3');
eq('préfixe v accepté', normalizeVersion('v2.0.1'), '2.0.1');
eq('suffixe ignoré', normalizeVersion('1.2.3-beta.4'), '1.2.3');
eq('zéros de tête nettoyés', normalizeVersion('01.02.003'), '1.2.3');
eq('chaîne vide refusée', normalizeVersion(''), null);
eq('texte refusé', normalizeVersion('version 2'), null);
eq('null refusé', normalizeVersion(null), null);
eq('découpage', parseVersion('3.4.5'), { major: 3, minor: 4, patch: 5, value: '3.4.5' });
eq('illisible', parseVersion('x'), null);

console.log('\n== Comparaison ==');
check('1.2.0 > 1.1.9', compareVersions('1.2.0', '1.1.9') === 1);
check('1.10.0 > 1.9.0 (comparaison numérique)', compareVersions('1.10.0', '1.9.0') === 1);
check('2.0.0 > 1.99.99', compareVersions('2.0.0', '1.99.99') === 1);
check('identiques', compareVersions('1.2.0', 'v1.2.0') === 0);
check('plus ancienne', compareVersions('1.0.0', '1.0.1') === -1);
check('version absente = la plus ancienne', compareVersions(null, '1.0.0') === -1);
check('deux versions absentes', compareVersions(null, null) === 0);

const notes = [
  { version: '1.2.0', date: '2026-09-29', title: 'Fiches de trajectoire', items: ['a'] },
  { version: '1.1.0', date: '2026-08-01', title: 'Match en direct', items: ['b'] },
  { version: '1.0.0', date: '2026-06-01', title: 'Première version', items: ['c'] },
];

console.log('\n== Journal depuis une version ==');
eq('depuis 1.0.1 → 1.2.0 et 1.1.0', changelogSince('1.0.1', notes).map((n) => n.version), ['1.2.0', '1.1.0']);
eq('depuis 1.2.0 → rien', changelogSince('1.2.0', notes).length, 0);
eq('depuis 0.9.0 → tout', changelogSince('0.9.0', notes).length, 3);
eq('version inconnue → tout', changelogSince(null, notes).length, 3);
eq('journal absent → vide', changelogSince('1.0.0', null).length, 0);

console.log('\n== Nouveautés par appareil ==');
eq(
  'déjà vu 1.1.0 → seule 1.2.0',
  whatsNewNotes({ seenVersion: '1.1.0', currentVersion: '1.2.0', notes }).map((n) => n.version),
  ['1.2.0']
);
eq(
  'jamais rien vu → version courante seulement',
  whatsNewNotes({ seenVersion: null, currentVersion: '1.2.0', notes }).map((n) => n.version),
  ['1.2.0']
);
eq(
  'jamais rien vu et courant = 1.0.0',
  whatsNewNotes({ seenVersion: null, currentVersion: '1.0.0', notes }).map((n) => n.version),
  ['1.0.0']
);

console.log('\n== État de mise à jour ==');
const outOfDate = updateState({ clientVersion: '1.0.1', serverVersion: '1.2.0', notes, downloadUrl: 'https://exemple.fr' });
check('interface en retard détectée', outOfDate.outdated === true);
check('version d’interface conservée', outOfDate.clientVersion === '1.0.1');
check('version serveur conservée', outOfDate.serverVersion === '1.2.0');
check('titre de la mise à jour en tête de journal', outOfDate.latestTitle === 'Fiches de trajectoire', `${outOfDate.latestTitle}`);
eq('nouveautés manquantes', outOfDate.missing.map((n) => n.version), ['1.2.0', '1.1.0']);

const upToDate = updateState({ clientVersion: '1.2.0', serverVersion: '1.2.0', notes });
check('interface à jour : aucun bandeau', upToDate.outdated === false);
eq('à jour : aucune nouveauté manquante', upToDate.missing.length, 0);

const serverBehind = updateState({ clientVersion: '1.2.0', serverVersion: '1.1.0', notes });
check('serveur plus ancien : pas de bandeau « nécessaire »', serverBehind.outdated === false);

const unknown = updateState({ clientVersion: null, serverVersion: '1.2.0', notes });
check('version d’interface inconnue : pas de bandeau (silencieux)', unknown.ready === false && unknown.outdated === false);

console.log('\n== Dates ==');
check('date formatée en français', formatNoteDate('2026-09-29').includes('2026'), formatNoteDate('2026-09-29'));
eq('date absente', formatNoteDate(null), '');
eq('date illisible laissée telle quelle', formatNoteDate('bientôt'), 'bientôt');

console.log('\n== Cohérence des fichiers de version ==');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const source = readJson('version.json');
const interfaceVersion = readJson(path.join('client', 'public', 'version.json'));
const apiVersion = readJson(path.join('server', 'src', 'version.json'));
const clientPkg = readJson(path.join('client', 'package.json'));
const serverPkg = readJson(path.join('server', 'package.json'));
const desktopPkg = readJson(path.join('desktop', 'package.json'));

check('version.json : version exploitable', !!normalizeVersion(source.version), `${source.version}`);
eq('interface = source', interfaceVersion.version, source.version);
eq('API = source', apiVersion.version, source.version);
eq('client/package.json = source', clientPkg.version, source.version);
eq('server/package.json = source', serverPkg.version, source.version);
eq('desktop/package.json = source', desktopPkg.version, source.version);
check('1ʳᵉ entrée du journal = version courante', source.notes[0].version === source.version, `${source.notes[0].version}`);
check('chaque entrée décrit au moins une nouveauté', source.notes.every((n) => n.title && n.items.length > 0));
check('la dernière mise à jour est décrite en détail', source.notes[0].items.length >= 3, `${source.notes[0].items.length}`);
check('lien de téléchargement présent', /^https?:\/\//.test(source.downloadUrl || ''), `${source.downloadUrl}`);
check('le journal de l’API contient les descriptions', apiVersion.notes.length === source.notes.length);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
