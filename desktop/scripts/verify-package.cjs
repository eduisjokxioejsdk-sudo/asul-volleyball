// ============================================================================
// Contrôle du paquet Electron après copie des fichiers (hook `afterPack`).
//
// Pourquoi ce garde-fou : electron-builder ignore SILENCIEUSEMENT une source
// `extraResources` absente. Un installeur peut donc être construit — et publié
// par la CI — avec `resources/server/node_modules` mais SANS `server/src` :
// l'application s'installe, puis son serveur Node meurt au démarrage avec
//     Error: Cannot find module '…\resources\server\src\index.js'
// et cinq redémarrages automatiques.
//
// Ici, le build ÉCHOUE avec la liste exacte des fichiers manquants : aucune
// version incomplète ne peut plus être publiée.
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');

/** Fichiers/dossiers indispensables dans <appOutDir>/resources. */
function requiredResources(platform) {
  const isWin = platform === 'win32';
  return [
    ['serveur (entrée)', path.join('server', 'src', 'index.js')],
    ['serveur (package.json)', path.join('server', 'package.json')],
    ['dépendances du serveur (express)', path.join('server', 'node_modules', 'express', 'package.json')],
    ['pilote SQLite du serveur', path.join('server', 'node_modules', 'sqlite3', 'package.json')],
    ['interface (index.html)', path.join('client', 'dist', 'index.html')],
    ['configuration Supabase pré-remplie', 'sync.json'],
    ['ffmpeg embarqué', path.join('ffmpeg', isWin ? 'ffmpeg.exe' : 'ffmpeg')],
  ];
}

module.exports = async function verifyPackage(context) {
  const platform = context.electronPlatformName || process.platform;
  const resourcesDir = path.join(context.appOutDir, 'resources');

  const missing = [];
  for (const [label, relative] of requiredResources(platform)) {
    const absolute = path.join(resourcesDir, relative);
    if (!fs.existsSync(absolute)) missing.push(`${label} : ${absolute}`);
  }

  if (missing.length) {
    throw new Error(
      'Paquet incomplet : le serveur Node embarqué (ou un fichier requis) est absent.\n' +
        'L’application installée ne pourrait pas démarrer.\n\n' +
        missing.map((line) => `  - ${line}`).join('\n') +
        '\n\nVérifiez la section `extraResources` de electron-builder.yml ' +
        'et que les dossiers server/src, server/node_modules, client/dist et ' +
        'desktop/resources/ffmpeg existent avant la construction.'
    );
  }

  // `server/src` doit contenir le code, pas seulement le dossier vide.
  const srcDir = path.join(resourcesDir, 'server', 'src');
  const jsFiles = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));
  if (jsFiles.length < 5) {
    throw new Error(
      `Paquet incomplet : ${srcDir} ne contient que ${jsFiles.length} fichier(s) .js ` +
        '(le serveur ne démarrera pas).'
    );
  }

  console.log(`[verify-package] ${jsFiles.length} fichiers serveur + interface + ffmpeg vérifiés.`);
};
