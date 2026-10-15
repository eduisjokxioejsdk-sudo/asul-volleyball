// ============================================================================
// Publication d'une version d'ASUL (à lancer depuis la racine du dépôt).
//
//   node scripts/release.mjs            → publie la version décrite dans version.json
//   node scripts/release.mjs --check    → vérifie seulement la cohérence (tests / CI)
//
// Le fichier version.json (racine) est LA source unique : il porte la version
// courante, la description des mises à jour (ce que verront les utilisateurs)
// et le lien de téléchargement. Ce script :
//   1. contrôle la cohérence du journal (la 1ʳᵉ entrée = la version courante) ;
//   2. copie version.json dans client/public (version de l'interface servie)
//      et dans server/src (version annoncée par l'API) ;
//   3. aligne le champ "version" de client/, server/ et desktop/package.json
//      (ainsi que la première ligne des package-lock.json) ;
//   4. affiche la marche à suivre pour construire et publier l'installeur Windows.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = path.join(ROOT, 'version.json');
const COPIES = [
  path.join(ROOT, 'client', 'public', 'version.json'),
  path.join(ROOT, 'server', 'src', 'version.json'),
];
const PACKAGES = [
  { dir: path.join(ROOT, 'client'), name: 'asul-client' },
  { dir: path.join(ROOT, 'server'), name: 'asul-server' },
  { dir: path.join(ROOT, 'desktop'), name: 'asul-desktop' },
];
const CHECK_ONLY = process.argv.includes('--check');

let failures = 0;
function report(ok, message) {
  if (ok) {
    console.log(`  ok   ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${message}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Aligne le champ version d'un package.json (sans toucher au reste du fichier). */
function syncPackageJson(dir, version) {
  const file = path.join(dir, 'package.json');
  const raw = fs.readFileSync(file, 'utf8');
  const next = raw.replace(/^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${version}$2`);
  const changed = next !== raw;
  if (changed && !CHECK_ONLY) fs.writeFileSync(file, next, 'utf8');
  const declared = readJson(file).version;
  report(declared === version, `${path.relative(ROOT, file)} → ${declared}${declared === version ? '' : ` (attendu ${version})`}`);
  return changed;
}

/** Aligne la version en tête d'un package-lock.json (best effort). */
function syncLockFile(dir, name, version) {
  const file = path.join(dir, 'package-lock.json');
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`("name":\\s*"${name}",\\r?\\n\\s*"version":\\s*")([^"]+)(")`);
  const match = raw.match(re);
  if (!match) return;
  if (match[2] === version) return;
  if (!CHECK_ONLY) fs.writeFileSync(file, raw.replace(re, `$1${version}$3`), 'utf8');
  console.log(`  maj  ${path.relative(ROOT, file)} : ${match[2]} → ${version}`);
}

// --- 1. Contrôle du journal -------------------------------------------------
const source = readJson(VERSION_FILE);
const version = String(source.version || '').trim();

console.log('\n== Journal des versions ==');
report(/^\d+\.\d+\.\d+$/.test(version), `version courante valide : ${version}`);
report(typeof source.releasedAt === 'string' && source.releasedAt.length > 0, `date de publication : ${source.releasedAt}`);
report(Array.isArray(source.notes) && source.notes.length > 0, 'au moins une entrée de journal');
report(
  Array.isArray(source.notes) && source.notes.length > 0 && source.notes[0].version === version,
  `la 1ʳᵉ entrée du journal correspond à la version courante (${source.notes?.[0]?.version || '—'})`
);
report(
  Array.isArray(source.notes) && source.notes.every((n) => n.version && n.title && Array.isArray(n.items) && n.items.length > 0),
  'chaque entrée porte version + titre + au moins une ligne de description'
);
report(typeof source.downloadUrl === 'string' && source.downloadUrl.startsWith('http'), `lien de téléchargement : ${source.downloadUrl}`);

// --- 2. Copies (interface + serveur) ---------------------------------------
console.log('\n== Copies servies par l’interface et par l’API ==');
for (const target of COPIES) {
  const relative = path.relative(ROOT, target);
  if (!CHECK_ONLY) writeJson(target, source);
  const copied = fs.existsSync(target) ? readJson(target) : null;
  report(!!copied && copied.version === version, `${relative} → ${copied ? copied.version : 'absent'}`);
  report(
    !!copied && JSON.stringify(copied.notes || []) === JSON.stringify(source.notes || []),
    `${relative} : journal identique`
  );
}

// --- 3. Versions des paquets -----------------------------------------------
console.log('\n== Versions des paquets ==');
for (const pkg of PACKAGES) {
  syncPackageJson(pkg.dir, version);
  syncLockFile(pkg.dir, pkg.name, version);
}

if (failures > 0) {
  console.log(`\n${failures} problème(s) : corrigez version.json (ou relancez sans --check pour synchroniser).\n`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log('\nTOUT EST COHÉRENT\n');
  process.exit(0);
}

console.log(`
Version ${version} publiée dans les fichiers.

Étapes suivantes :
  1. cd desktop
  2. npm install                      (une fois, pour installer electron-updater)
  3. set GH_TOKEN=<jeton GitHub>      (jeton avec le droit "repo" — uniquement sur la machine de build)
  4. npm run dist:publish             (construit et publie ASUL-Setup-${version}.exe + latest.yml sur GitHub Releases)
  5. git add -A ; git commit ; git push   (met à jour la source et la page de téléchargement)
`);
