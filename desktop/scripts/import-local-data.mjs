#!/usr/bin/env node
// ============================================================================
// Importe les données d'une installation ASUL « locale » (version web/dépôt :
// server/asul.db + server/uploads) dans l'application Windows
// (%APPDATA%\ASUL\data).
//
// Ce que fait le script :
//   1. sauvegarde la base actuelle de l'application (par précaution) ;
//   2. remplace la base par celle de l'installation locale ;
//   3. conserve les comptes créés dans l'application (mêmes e-mails) ;
//   4. réécrit les chemins absolus des vidéos vers le dossier de l'application ;
//   5. avec --copy-media : copie les vidéos (originaux) et leurs versions de
//      lecture (proxies) dans le dossier de l'application.
//
// Usage (l'application doit être FERMÉE) :
//   node scripts/import-local-data.mjs                      # base seule
//   node scripts/import-local-data.mjs --copy-media         # base + vidéos
//   node scripts/import-local-data.mjs --source "D:\ASUL\server" --target "%APPDATA%\ASUL\data"
//
// Options :
//   --copy-media    copie les fichiers vidéo référencés par la base
//   --source <dir>  dossier de l'installation locale (défaut : <dépôt>/server)
//   --target <dir>  dossier de données de l'application (défaut : %APPDATA%\ASUL\data)
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DESKTOP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.join(DESKTOP_DIR, '..');
const sqlite3 = require(path.join(REPO_DIR, 'server', 'node_modules', 'sqlite3'));

const DB_FILES = ['asul.db', 'asul.db-wal', 'asul.db-shm'];


// --- Options ---------------------------------------------------------------

const argv = process.argv.slice(2);
const COPY_MEDIA = argv.includes('--copy-media');

function argValue(name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

const DEFAULT_TARGET = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'ASUL', 'data')
  : path.join(DESKTOP_DIR, 'data');

const SOURCE_DIR = path.resolve(argValue('--source', path.join(REPO_DIR, 'server')));
const TARGET_DIR = path.resolve(argValue('--target', DEFAULT_TARGET));
const SOURCE_UPLOADS = path.join(SOURCE_DIR, 'uploads');
const TARGET_UPLOADS = path.join(TARGET_DIR, 'uploads');

// --- Utilitaires -----------------------------------------------------------

const log = (msg) => console.log(`[import] ${msg}`);

function openDb(file) {
  return new sqlite3.Database(file);
}

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ changes: this.changes });
  }));
const close = (db) => new Promise((resolve) => db.close(() => resolve()));

/** Copie un fichier en ignorant ceux déjà présents à l'identique (reprise). */
function copyIfNeeded(sourceFile, targetFile) {
  if (!fs.existsSync(sourceFile)) return { copied: false, missing: true, bytes: 0 };
  const sourceSize = fs.statSync(sourceFile).size;
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).size === sourceSize) {
    return { copied: false, missing: false, bytes: 0, skipped: true };
  }
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
  return { copied: true, missing: false, bytes: sourceSize };
}

const human = (bytes) => `${(bytes / 1073741824).toFixed(2)} Go`;

function totalSize(files) {
  return files.reduce((sum, file) => {
    try {
      return sum + fs.statSync(file).size;
    } catch (err) {
      return sum;
    }
  }, 0);
}

// --- Étapes de l'import -----------------------------------------------------

/** Comptes existants de l'application (id, e-mail, mot de passe, nom). */
async function readUsers(dbFile) {
  const db = openDb(dbFile);
  try {
    return await all(db, 'SELECT id, email, password, name, created_at FROM users');
  } finally {
    await close(db);
  }
}

/**
 * Conserve les comptes de l'application : pour un e-mail déjà présent dans la
 * base importée, on garde le mot de passe et le nom saisis dans l'application
 * (sinon le statisticien ne pourrait plus se connecter avec son mot de passe) ;
 * les comptes absents de la base importée sont ajoutés.
 */
async function ensureAccounts(db, users) {
  for (const user of users) {
    if (!user.email) continue;
    const existing = await all(db, 'SELECT id FROM users WHERE email = ?', [user.email]);
    if (existing.length) {
      await run(db, 'UPDATE users SET name = ?, password = ? WHERE email = ?', [
        user.name,
        user.password,
        user.email,
      ]);
      log(`compte conservé (mot de passe de l'application) : ${user.email}`);
    } else {
      await run(db, 'INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, ?)', [
        user.email,
        user.password,
        user.name,
        user.created_at || new Date().toISOString(),
      ]);
      log(`compte ajouté depuis l'application : ${user.email}`);
    }
  }
}

/** Réécrit les chemins absolus des vidéos vers le dossier de l'application. */
async function rewritePaths(db) {
  const oldPrefix = SOURCE_UPLOADS;
  const newPrefix = TARGET_UPLOADS;
  let total = 0;
  for (const column of ['filepath', 'filepath_proxy']) {
    const { changes } = await run(
      db,
      `UPDATE videos SET ${column} = REPLACE(${column}, ?, ?) WHERE ${column} LIKE ?`,
      [oldPrefix, newPrefix, `${oldPrefix}%`]
    );
    total += changes;
    if (changes) log(`chemins réécrits (${column}) : ${changes}`);
  }
  // Chemins enregistrés hors du dossier source (autre disque…) : signalés.
  const foreign = await all(
    db,
    'SELECT id, filepath FROM videos WHERE filepath NOT LIKE ?',
    [`${newPrefix}%`]
  );
  for (const row of foreign) log(`ATTENTION : la vidéo ${row.id} référence ${row.filepath}`);
  return total;
}

// --- Copie des médias -------------------------------------------------------

async function copyMedia(videos) {
  let copied = 0;
  let skipped = 0;
  let bytes = 0;
  const missing = [];

  const copyOne = (sourceFile, targetFile, label) => {
    const result = copyIfNeeded(sourceFile, targetFile);
    if (result.missing) {
      missing.push(label);
      return;
    }
    if (result.copied) {
      copied += 1;
      bytes += result.bytes;
      log(`copié : ${label} (${(result.bytes / 1048576).toFixed(0)} Mo)`);
    } else {
      skipped += 1;
    }
  };

  for (const video of videos) {
    // Original : chemin enregistré s'il est accessible, sinon nom de fichier
    // dans le dossier uploads de l'installation locale.
    const sourceOriginal = fs.existsSync(video.filepath)
      ? video.filepath
      : path.join(SOURCE_UPLOADS, video.filename);
    copyOne(sourceOriginal, path.join(TARGET_UPLOADS, video.filename), video.filename);

    // Version de lecture légère (proxy) : navigation fluide dans l'interface.
    if (video.filepath_proxy) {
      const proxyName = video.filepath_proxy.split(/[\\/]/).pop();
      const sourceProxy = fs.existsSync(video.filepath_proxy)
        ? video.filepath_proxy
        : path.join(SOURCE_UPLOADS, 'trimmed', proxyName);
      copyOne(sourceProxy, path.join(TARGET_UPLOADS, 'trimmed', proxyName), `trimmed/${proxyName}`);
    }
  }

  log(`médias : ${copied} copié(s) (${human(bytes)}), ${skipped} déjà présent(s)`);
  if (missing.length) log(`ATTENTION : fichier(s) introuvable(s) : ${missing.join(', ')}`);
  return { copied, skipped, bytes, missing };
}

/**
 * Vérifie que chaque fichier référencé par la base existe bien dans
 * l'application. Les références vers des fichiers absents (médias non copiés,
 * par exemple) sont retirées : l'interface ne propose pas un lecteur
 * sans fichier.
 */
async function cleanMissingReferences(db) {
  const videos = await all(
    db,
    'SELECT id, filename, filepath, filepath_proxy FROM videos ORDER BY id'
  );
  const problems = [];

  for (const video of videos) {
    for (const [column, file] of [
      ['filepath', video.filepath],
      ['filepath_proxy', video.filepath_proxy],
    ]) {
      if (!file || fs.existsSync(file)) continue;
      if (column === 'filepath') {
        // Colonne obligatoire : on ne peut pas la vider, on la signale.
        problems.push(`vidéo ${video.id} : fichier original absent (${path.basename(file)})`);
      } else {
        await run(db, `UPDATE videos SET ${column} = NULL WHERE id = ?`, [video.id]);
        log(`référence retirée (fichier absent) : vidéo ${video.id} / ${column}`);
      }
    }
  }
  return problems;
}

// --- Import -----------------------------------------------------------------

async function main() {
  log(`source : ${SOURCE_DIR}`);
  log(`cible  : ${TARGET_DIR}`);

  const sourceDbFile = path.join(SOURCE_DIR, 'asul.db');
  if (!fs.existsSync(sourceDbFile)) throw new Error(`base introuvable : ${sourceDbFile}`);
  if (path.resolve(SOURCE_DIR) === path.resolve(TARGET_DIR)) {
    throw new Error('la source et la cible sont identiques : rien à importer');
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  // 1. Base actuelle de l'application : sauvegarde + comptes à préserver.
  const targetDbFile = path.join(TARGET_DIR, 'asul.db');
  const targetUsers = fs.existsSync(targetDbFile) ? await readUsers(targetDbFile) : [];
  if (fs.existsSync(targetDbFile)) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const backupDir = path.join(path.dirname(TARGET_DIR), `sauvegarde-avant-import-${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    for (const name of DB_FILES) {
      const file = path.join(TARGET_DIR, name);
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupDir, name));
    }
    log(`sauvegarde de la base de l'application : ${backupDir}`);
  }

  // 2. Remplacement de la base par celle de l'installation locale.
  for (const name of DB_FILES) {
    const file = path.join(TARGET_DIR, name);
    if (fs.existsSync(file)) fs.rmSync(file);
    const from = path.join(SOURCE_DIR, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(TARGET_DIR, name));
  }
  log('base importée');

  const db = openDb(path.join(TARGET_DIR, 'asul.db'));
  try {
    await ensureAccounts(db, targetUsers);

    const videos = await all(
      db,
      'SELECT id, filename, filepath, filepath_proxy FROM videos ORDER BY id'
    );
    log(`${videos.length} vidéo(s) référencée(s) dans la base importée`);

    if (COPY_MEDIA && videos.length) {
      await copyMedia(videos);
    } else if (!COPY_MEDIA) {
      log('médias non copiés (utiliser --copy-media pour les copier)');
    }

    await rewritePaths(db);
    const problems = await cleanMissingReferences(db);

    // 3. Bilan.
    const [stats] = await all(
      db,
      `SELECT (SELECT COUNT(*) FROM users) users,
              (SELECT COUNT(*) FROM videos) videos,
              (SELECT COUNT(*) FROM live_sessions) lives,
              (SELECT COUNT(*) FROM teams) teams,
              (SELECT COUNT(*) FROM team_players) players`
    );
    log(
      `bilan : ${stats.users} compte(s), ${stats.videos} vidéo(s), ` +
        `${stats.lives} match(s) en direct, ${stats.teams} équipe(s), ${stats.players} joueur(s)`
    );
    if (problems.length) {
      log('à vérifier :');
      for (const problem of problems) log(`  - ${problem}`);
    }
    log('IMPORT TERMINÉ');
  } finally {
    await close(db);
  }
}

main().catch((err) => {
  console.error(`[import] ERREUR : ${err.message}`);
  process.exit(1);
});




