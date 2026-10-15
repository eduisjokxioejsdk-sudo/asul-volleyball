// ============================================================================
// Dépose le dernier installeur Windows à la racine du dépôt.
//
//   node scripts/stage-installer.mjs [dossier-de-sortie]   (défaut : dist)
//
// Objectif : après chaque build, le .exe à jour se trouve directement à la
// racine du projet (…\Asulv2\ASUL-Setup-x.y.z.exe), prêt à être envoyé à
// l'autre statisticien — sans avoir à fouiller dans desktop\dist.
//
// Un seul installeur à la racine : les versions précédentes sont supprimées.
// Le fichier n'est jamais versionné (voir .gitignore racine) : c'est un binaire
// de ~200 Mo destiné à un envoi manuel.
//
// Ce module est aussi appelé par scripts/build-installer.mjs (réessais).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DESKTOP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.join(DESKTOP, '..');
const MIN_SIZE = 100 * 1024 * 1024; // 100 Mo : un installeur complet pèse ~160 Mo

/**
 * Copie l'installeur construit vers la racine du projet (et purge les anciens).
 * @param {string} out Dossier de sortie d'electron-builder (défaut : « dist »).
 * @returns {{ destination: string, sizeMb: number, version: string }}
 */
export function stageInstaller(out = 'dist') {
  const version = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')).version;
  const source = path.join(DESKTOP, out, `ASUL-Setup-${version}.exe`);

  if (!fs.existsSync(source) || fs.statSync(source).size <= MIN_SIZE) {
    throw new Error(
      `installeur introuvable ou incomplet : ${path.relative(PROJECT_ROOT, source)}`
    );
  }

  // Un seul installeur à la racine : on retire les versions précédentes.
  for (const entry of fs.readdirSync(PROJECT_ROOT, { withFileTypes: true })) {
    if (entry.isFile() && /^ASUL-Setup-.*\.exe$/i.test(entry.name)) {
      fs.rmSync(path.join(PROJECT_ROOT, entry.name), { force: true });
    }
  }

  const destination = path.join(PROJECT_ROOT, `ASUL-Setup-${version}.exe`);
  fs.copyFileSync(source, destination);
  const sizeMb = Math.round(fs.statSync(destination).size / 1048576);
  return { destination, sizeMb, version };
}

// Exécution directe : node scripts/stage-installer.mjs [dossier-de-sortie]
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const { destination, sizeMb } = stageInstaller(process.argv[2] || 'dist');
    console.log(
      `\nInstalleur à la racine : ${path.relative(PROJECT_ROOT, destination)} (${sizeMb} Mo)`
    );
  } catch (err) {
    console.error(`\nÉCHEC : ${err.message}`);
    process.exit(1);
  }
}
