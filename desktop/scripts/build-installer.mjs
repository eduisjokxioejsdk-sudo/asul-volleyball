// ============================================================================
// Construit l'installeur Windows (NSIS) avec réessais automatiques.
//
//   node scripts/build-installer.mjs [dossier-de-sortie]   (défaut : dist)
//
// Pourquoi des réessais : certains antivirus analysent chaque exécutable dès
// son écriture, ce qui fait échouer l'étape NSIS de façon intermittente
// (« spawn UNKNOWN », « 7za … Paramètre incorrect »). Une nouvelle tentative
// suffit presque toujours.
// ============================================================================

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageInstaller } from './stage-installer.mjs';

const DESKTOP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || 'dist';
const ATTEMPTS = 5;
const MIN_SIZE = 100 * 1024 * 1024; // 100 Mo : un installeur complet pèse ~160 Mo

const version = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')).version;
const target = path.join(DESKTOP, OUT, `ASUL-Setup-${version}.exe`);

function built() {
  return fs.existsSync(target) && fs.statSync(target).size > MIN_SIZE;
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  console.log(`\n== Installeur ${version} — tentative ${attempt}/${ATTEMPTS} (${OUT})`);
  spawnSync(
    `npm run dist -- --publish never --config.directories.output=${OUT}`,
    { cwd: DESKTOP, stdio: 'inherit', shell: true }
  );

  if (built()) {
    const size = Math.round(fs.statSync(target).size / 1048576);
    console.log(`\nInstalleur prêt : ${path.relative(DESKTOP, target)} (${size} Mo)`);

    // Dernier exe toujours disponible à la racine du projet (envoi manuel).
    try {
      const { destination, sizeMb } = stageInstaller(OUT);
      const root = path.join(DESKTOP, '..');
      console.log(`À la racine du projet : ${path.relative(root, destination)} (${sizeMb} Mo)`);
    } catch (err) {
      console.log(`\nCopie vers la racine du projet impossible : ${err.message}`);
      process.exit(1);
    }

    process.exit(0);
  }

  console.log(`tentative ${attempt} échouée — nouvelle tentative…`);
  try {
    fs.rmSync(target, { force: true });
  } catch (err) {
    // fichier encore verrouillé par l'antivirus : la tentative suivante le remplacera
  }
}

console.log(`\nÉCHEC après ${ATTEMPTS} tentatives. Excluez le dossier du projet de l'antivirus (voir README section 10).`);
process.exit(1);
