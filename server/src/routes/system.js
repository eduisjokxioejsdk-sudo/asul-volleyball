// ============================================================================
// Informations système et réseau (diagnostic en salle).
// Ces routes ne sont pas authentifiées : elles servent au PC hôte pour
// afficher l'adresse à communiquer aux autres statisticiens, et à l'écran de
// diagnostic de l'application desktop.
// ============================================================================

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const db = require('../database');

const router = express.Router();

// Version applicative + journal des modifications (version.json, copié depuis la
// racine du dépôt par scripts/release.mjs). Lu une seule fois : le serveur est
// redémarré à chaque mise à jour.
let versionInfo = null;

function readVersionInfo() {
  if (versionInfo) return versionInfo;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8');
    const parsed = JSON.parse(raw);
    versionInfo = {
      appVersion: parsed.version || null,
      releasedAt: parsed.releasedAt || null,
      downloadUrl: parsed.downloadUrl || null,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch (err) {
    // Fichier absent ou illisible : on n'empêche pas l'application de tourner.
    versionInfo = { appVersion: null, releasedAt: null, downloadUrl: null, notes: [] };
  }
  return versionInfo;
}

// Vérification de ffmpeg mise en cache sous forme de promesse : le binaire peut
// être long à analyser par l'antivirus au premier appel (140 Mo), et plusieurs
// requêtes de diagnostic ne doivent pas relancer un processus à chaque fois.
let ffmpegCheck = null;

function checkFfmpeg() {
  if (!ffmpegCheck) {
    ffmpegCheck = new Promise((resolve) => {
      execFile(config.ffmpegPath, ['-version'], { timeout: 60000 }, (err) => resolve(!err));
    });
  }
  return ffmpegCheck;
}

/** Nombre de comptes ASUL enregistrés sur ce poste. */
function countUsers() {
  return new Promise((resolve) => {
    db.get('SELECT COUNT(*) AS users FROM users', (err, row) => resolve(err ? null : row.users));
  });
}

// Adresse à utiliser par les autres postes du réseau local.
router.get('/network-info', (req, res) => {
  const address = config.bestLanAddress();
  res.json({
    hostname: os.hostname(),
    port: config.PORT,
    listenHost: config.HOST,
    addresses: config.lanAddresses(),
    url: `http://${address}:${config.PORT}`,
    restartUrl: `http://${os.hostname()}:${config.PORT}`,
    mode: config.isDesktop ? 'desktop' : 'server',
  });
});

// Version applicative et journal des mises à jour.
// L'interface compare cette version à la sienne : si elle est plus ancienne,
// elle affiche « Mise à jour nécessaire » et décrit les nouveautés.
router.get('/version', (req, res) => {
  const info = readVersionInfo();
  res.json({
    serverVersion: require('../../package.json').version,
    appVersion: info.appVersion,
    releasedAt: info.releasedAt,
    downloadUrl: info.downloadUrl,
    notes: info.notes,
    mode: config.isDesktop ? 'desktop' : 'server',
  });
});

// État du serveur : base de données, stockage, ffmpeg, nombre de comptes.
router.get('/status', async (req, res) => {
  const [users, ffmpegAvailable] = await Promise.all([countUsers(), checkFfmpeg()]);
  res.json({
    status: 'ok',
    version: require('../../package.json').version,
    mode: config.isDesktop ? 'desktop' : 'server',
    dataDir: config.dataDir,
    uploadsDir: config.uploadsDir,
    clientDist: config.clientDistPath,
    ffmpegPath: config.ffmpegPath,
    ffmpegAvailable,
    users,
  });
});

module.exports = router;
