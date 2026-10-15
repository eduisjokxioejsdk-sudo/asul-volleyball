// ============================================================================
// Sert un flux de mise à jour local (test, ou hébergement sur le réseau interne).
//
//   node scripts/serve-update-feed.mjs [dossier] [port]
//
// Le dossier doit contenir latest.yml et l'installeur ASUL-Setup-x.y.z.exe tels
// que produits par « npm run dist ». Lancez ensuite l'application en indiquant
// ce flux :
//
//   $env:ASUL_UPDATE_FEED = "http://127.0.0.1:8099/"
//   & "C:\Program Files\ASUL\ASUL.exe"
//
// L'application détecte alors la version la plus récente du dossier, la
// télécharge et propose de redémarrer pour l'installer — exactement comme avec
// GitHub Releases, mais sans publier quoi que ce soit.
// ============================================================================

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(process.argv[2] || path.join(HERE, '..', '..', 'update-feed'));
const PORT = Number(process.argv[3]) || 8099;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent(String(req.url || '/').split('?')[0]);
  const name = raw.replace(/^\/+/, '');
  const file = path.join(FOLDER, name);

  // On ne sert que des fichiers du dossier, et rien en dehors.
  if (!name || !file.startsWith(FOLDER) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Fichier introuvable');
    return;
  }

  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Flux de mise à jour ASUL : http://127.0.0.1:${PORT}/`);
  console.log(`Dossier servi            : ${FOLDER}`);
  const files = fs.existsSync(FOLDER) ? fs.readdirSync(FOLDER) : [];
  console.log(
    files.length
      ? `Fichiers                 : ${files.join(', ')}`
      : 'Dossier vide : lancez « npm run dist » puis copiez latest.yml et l’installeur dans ce dossier.'
  );
  console.log('Arrêt : Ctrl+C');
});
