#!/usr/bin/env node
// ============================================================================
// Récupère le binaire ffmpeg embarqué dans l'installeur ASUL.
//
// Stratégie (dans l'ordre) :
//   1. Si desktop/resources/ffmpeg/ffmpeg.exe existe et fonctionne → rien à faire.
//   2. Copie depuis un ffmpeg déjà installé sur la machine de build :
//        - variable FFMPEG_PATH
//        - `where.exe ffmpeg` (PATH)
//        - paquets WinGet (Gyan.FFmpeg / yt-dlp.FFmpeg)
//   3. Téléchargement d'un build « essentials » puis extraction (PowerShell
//      Expand-Archive, disponible sur Windows 10+). Plusieurs miroirs sont
//      essayés (gyan.dev puis GitHub) avec plusieurs tentatives et un délai
//      d'attente : la CI reconstruit l'installeur à chaque publication et ne
//      doit pas dépendre de la disponibilité d'un seul hébergeur.
//
// Utilisation :
//   node scripts/fetch-ffmpeg.mjs            # idempotent
//   node scripts/fetch-ffmpeg.mjs --force    # remplace le binaire existant
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.join(__dirname, '..');
const TARGET_DIR = path.join(DESKTOP_DIR, 'resources', 'ffmpeg');
const IS_WIN = process.platform === 'win32';
const BIN_NAME = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg';
const TARGET = path.join(TARGET_DIR, BIN_NAME);

// Miroirs essayés dans l'ordre : le build « essentials » de gyan.dev (le plus
// léger, libx264 + aac suffisent à l'application), puis celui publié sur GitHub
// (BtbN/FFmpeg-Builds), dont l'URL « latest » est stable et le service bien
// plus fiable — utile quand la CI doit reconstruire l'installeur.
const MIRRORS = [
  {
    name: 'gyan.dev (essentials)',
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  },
  {
    name: 'GitHub (BtbN/FFmpeg-Builds)',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  },
];
const ATTEMPTS_PER_MIRROR = 3;
const DOWNLOAD_TIMEOUT_MS = 180000;
/** En dessous de cette taille, l'archive reçue est forcément incomplète. */
const MIN_ZIP_BYTES = 10 * 1024 * 1024;
const FORCE = process.argv.includes('--force');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(msg) {
  console.log(`[ffmpeg] ${msg}`);
}

/** Le binaire est-il exécutable (et non un simple fichier tronqué) ? */
function works(bin) {
  if (!bin || !fs.existsSync(bin)) return false;
  try {
    if (fs.statSync(bin).size < 1024 * 1024) return false;
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

/** Cherche un ffmpeg utilisable déjà présent sur la machine de build. */
function findLocal() {
  const candidates = [];

  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);

  if (IS_WIN) {
    try {
      const found = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' });
      for (const line of found.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) candidates.push(trimmed);
      }
    } catch (err) {
      /* ffmpeg absent du PATH */
    }
  }

  // Paquets WinGet : ffmpeg.exe se trouve dans un sous-dossier versionné.
  if (IS_WIN && process.env.LOCALAPPDATA) {
    const packagesDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const pkg of fs.readdirSync(packagesDir)) {
        if (!/ffmpeg/i.test(pkg)) continue;
        const stack = [path.join(packagesDir, pkg)];
        while (stack.length) {
          const dir = stack.pop();
          let entries = [];
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch (err) {
            continue;
          }
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (entry.name.toLowerCase() === 'ffmpeg.exe') candidates.push(full);
          }
        }
      }
    } catch (err) {
      /* aucun paquet WinGet */
    }
  }

  // Parmi les binaires utilisables, prendre le plus léger : un build
  // « essentials » (~90 Mo) suffit largement (libx264 + aac) et allège
  // d'autant l'installeur distribué aux statisticiens.
  const usable = candidates.filter((candidate) => works(candidate));
  if (!usable.length) return null;
  usable.sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);
  return usable[0];
}

/** Télécharge une archive avec délai d'attente (une tentative). */
async function fetchArchive(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < MIN_ZIP_BYTES) throw new Error(`archive incomplète (${buffer.length} octets)`);
  fs.writeFileSync(destination, buffer);
  return buffer.length;
}

/** Extrait ffmpeg.exe d'une archive zip et renvoie son chemin. */
function extractFfmpeg(zipPath, extractDir) {
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`,
    ],
    { stdio: 'inherit' }
  );

  const found = [];
  const stack = [extractDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase() === 'ffmpeg.exe') found.push(full);
    }
  }
  if (!found.length) throw new Error('ffmpeg.exe introuvable dans l’archive téléchargée');
  return found[0];
}

/**
 * Essaie chaque miroir, plusieurs fois, jusqu'à obtenir un ffmpeg.exe utilisable.
 * Un échec réseau ne doit jamais faire échouer la publication d'une version.
 */
async function downloadFfmpeg() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-ffmpeg-'));
  const zipPath = path.join(tmpDir, 'ffmpeg.zip');
  const extractDir = path.join(tmpDir, 'extract');
  let lastError = null;

  for (const mirror of MIRRORS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MIRROR; attempt += 1) {
      try {
        log(`téléchargement depuis ${mirror.name} (tentative ${attempt}/${ATTEMPTS_PER_MIRROR})...`);
        const size = await fetchArchive(mirror.url, zipPath);
        log(`archive reçue (${(size / 1048576).toFixed(1)} Mo), extraction...`);
        return { binary: extractFfmpeg(zipPath, extractDir), tmpDir };
      } catch (err) {
        lastError = err;
        log(`échec : ${err.message}`);
        fs.rmSync(zipPath, { force: true });
        if (attempt < ATTEMPTS_PER_MIRROR) await sleep(3000 * attempt);
      }
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  throw new Error(
    `aucun miroir n’a fourni ffmpeg (dernier échec : ${lastError ? lastError.message : 'inconnu'})`
  );
}

/** Copie le binaire retenu dans resources/ffmpeg (cible de l'installeur). */
function install(localBinary) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  fs.copyFileSync(localBinary, TARGET);
  // ffprobe n'est volontairement pas embarqué : l'application ne l'utilise pas
  // (fluent-ffmpeg n'appelle que ffmpeg) et il pèserait aussi lourd que ffmpeg.
}

async function main() {
  if (!FORCE && works(TARGET)) {
    log(`déjà présent et fonctionnel : ${TARGET}`);
    return;
  }

  const local = findLocal();
  if (local) {
    log(`copie depuis l’installation locale : ${local}`);
    install(local);
  } else {
    let downloaded = null;
    try {
      downloaded = await downloadFfmpeg();
      install(downloaded.binary);
    } finally {
      if (downloaded) fs.rmSync(downloaded.tmpDir, { recursive: true, force: true });
    }
  }

  if (!works(TARGET)) throw new Error(`ffmpeg copié mais non exécutable : ${TARGET}`);
  const sizeMb = (fs.statSync(TARGET).size / 1048576).toFixed(1);
  log(`prêt : ${TARGET} (${sizeMb} Mo)`);
}

main().catch((err) => {
  console.error(`[ffmpeg] ERREUR : ${err.message}`);
  console.error(
    '[ffmpeg] Installez ffmpeg (winget install Gyan.FFmpeg), définissez FFMPEG_PATH, ou relancez ce script avec une connexion internet.'
  );
  process.exit(1);
});

