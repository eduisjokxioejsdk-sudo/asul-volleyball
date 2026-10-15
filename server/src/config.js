// ============================================================================
// Configuration centrale du serveur ASUL.
//
// Ce module doit être requis AVANT les routes, la base de données et
// l'authentification : il positionne process.env.DATA_DIR, JWT_SECRET et
// FFMPEG_PATH afin que tous les modules (database.js, videos.js,
// middleware/auth.js) partagent exactement les mêmes chemins,
// le même secret et le même binaire ffmpeg.
//
// Deux contextes d'exécution sont supportés :
//   1. Développement local      : DATA_DIR = server/ (comportement historique)
//   2. Application Windows      : DATA_DIR = %APPDATA%\ASUL\data (fourni par
//      Electron), ffmpeg embarqué dans <resources>/ffmpeg/ffmpeg.exe
// ============================================================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SERVER_DIR = path.join(__dirname, '..');
const IS_DESKTOP = Boolean(process.resourcesPath);

const EXE = process.platform === 'win32' ? '.exe' : '';

/** Dossier de données (base SQLite + vidéos uploadées). */
function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  // Local / desktop : à côté du serveur (server/asul.db + server/uploads).
  return SERVER_DIR;
}

const dataDir = resolveDataDir();
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (err) {
  console.warn(`Impossible de créer le dossier de données ${dataDir}:`, err.message);
}
process.env.DATA_DIR = dataDir;

const uploadsDir = path.join(dataDir, 'uploads');

/**
 * Secret JWT. En installation desktop aucun .env n'est fourni : on génère un
 * secret unique au poste, conservé dans le dossier de données (donc préservé
 * lors des mises à jour de l'application).
 */
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(dataDir, 'jwt-secret.key');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    return generated;
  } catch (err) {
    console.warn('JWT secret persistant indisponible, secret temporaire utilisé :', err.message);
    return crypto.randomBytes(48).toString('hex');
  }
}

const jwtSecret = resolveJwtSecret();
process.env.JWT_SECRET = jwtSecret;

/**
 * Binaire ffmpeg. Priorité au chemin explicite (variable d'environnement posée
 * par Electron ou par server/.env) s'il existe réellement, puis au binaire
 * embarqué dans l'installation desktop, puis au ffmpeg du PATH.
 * Un FFMPEG_PATH obsolète (chemin déplacé) ne bloque donc plus les exports.
 */
function resolveFfmpegPath() {
  const candidates = [process.env.FFMPEG_PATH];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'ffmpeg', `ffmpeg${EXE}`));
  candidates.push(path.join(SERVER_DIR, '..', 'desktop', 'resources', 'ffmpeg', `ffmpeg${EXE}`));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      /* chemin invalide : on essaie le suivant */
    }
  }
  if (process.env.FFMPEG_PATH) {
    console.warn(
      `FFMPEG_PATH défini mais introuvable (${process.env.FFMPEG_PATH}) : utilisation du ffmpeg du PATH.`
    );
  }
  return `ffmpeg${EXE}`;
}

const ffmpegPath = resolveFfmpegPath();
process.env.FFMPEG_PATH = ffmpegPath;

// fluent-ffmpeg lit FFMPEG_PATH, sauf les requêtes déjà lancées avec un chemin
// mis en cache : on force donc explicitement le chemin sur l'instance partagée.
try {
  require('fluent-ffmpeg').setFfmpegPath(ffmpegPath);
} catch (err) {
  /* fluent-ffmpeg absent : la découpe sera simplement indisponible */
}

/** Build du frontend servi par Express (mono-service, donc même origine). */
function resolveClientDist() {
  if (process.env.CLIENT_DIST) return process.env.CLIENT_DIST;
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'client', 'dist'));
  candidates.push(path.join(SERVER_DIR, '..', 'client', 'dist'));
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      /* on essaie le suivant */
    }
  }
  return path.join(SERVER_DIR, '..', 'client', 'dist');
}

const clientDistPath = resolveClientDist();

const PORT = Number(process.env.PORT) || 3001;
// 0.0.0.0 (et non 127.0.0.1) : indispensable pour que les autres postes du
// réseau local puissent coder le match en direct sur le PC hôte.
const HOST = process.env.HOST || '0.0.0.0';

/** Toutes les adresses IPv4 non-loopback de la machine. */
function lanAddresses() {
  const out = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if ((info.family === 'IPv4' || info.family === 4) && !info.internal) {
        out.push({ iface: name, address: info.address });
      }
    }
  }
  return out;
}

/** Adresse IPv4 la plus probable pour un réseau de salle (192.168 > 10 > 172.16-31). */
function bestLanAddress() {
  const list = lanAddresses();
  const preferred =
    list.find((i) => /^192\.168\./.test(i.address)) ||
    list.find((i) => /^10\./.test(i.address)) ||
    list.find((i) => /^172\.(1[6-9]|2\d|3[01])\./.test(i.address)) ||
    list[0];
  return preferred ? preferred.address : 'localhost';
}

module.exports = {
  serverDir: SERVER_DIR,
  isDesktop: IS_DESKTOP,
  dataDir,
  uploadsDir,
  jwtSecret,
  ffmpegPath,
  clientDistPath,
  PORT,
  HOST,
  lanAddresses,
  bestLanAddress,
};
