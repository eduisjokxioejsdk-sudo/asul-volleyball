// Vérifie que les feuilles de style se parsent (accolades équilibrées).
//
// Une accolade manquante ou superflue n'arrête pas Vite : le navigateur ignore
// silencieusement les règles suivantes, ce qui rend l'écran illisible.
//
// Usage : node scripts/check-css.cjs
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const FILES = ['src/App.css', 'src/viewer/viewer.css'];

let failed = 0;
for (const rel of FILES) {
  const full = path.join(__dirname, '..', rel);
  if (!fs.existsSync(full)) continue;
  try {
    const root = postcss.parse(fs.readFileSync(full, 'utf8'), { from: full });
    let nodes = 0;
    root.walk(() => { nodes += 1; });
    console.log(`OK    ${rel} (${nodes} nœuds)`);
  } catch (err) {
    failed += 1;
    console.log(`ERREUR ${rel} : ${err.message}`);
  }
}

if (failed) {
  console.log(`\n${failed} feuille(s) de style illisible(s).`);
  process.exitCode = 1;
} else {
  console.log('OK — toutes les feuilles de style se parsent.');
}
