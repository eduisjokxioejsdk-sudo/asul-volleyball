// ============================================================================
// Nettoyage des vidéos locales.
//
// Depuis la version 3.10.0, une vidéo de match est TOUJOURS un lien YouTube :
// tous les comptes et tous les postes voient donc exactement la même
// bibliothèque, sans transfert de fichier.
//
// Ce module retire les fichiers vidéo présents sur le poste (dossier
// `uploads/` et versions de lecture `uploads/trimmed/`) puis retire de la base
// — avec une pierre tombale synchronisée — les vidéos qui n'ont pas de lien
// YouTube. Les dossiers `uploads/montages/` ne sont pas touchés : les clips
// déjà exportés et partagés restent consultables.
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const config = require('./config');
const { emitCollectionChanged } = require('./socket');

const proxyDir = path.join(config.uploadsDir, 'trimmed');

/** Extensions des fichiers vidéo importés autrefois depuis un poste. */
const LOCAL_VIDEO_EXTENSIONS = new Set(['.mp4', '.mpeg', '.mpg', '.mov', '.avi', '.mkv', '.webm', '.m4v']);

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

/** Vrai si la valeur est un lien YouTube exploitable (ID brut accepté). */
function hasYoutubeLink(value) {
  return String(value || '').trim().length > 0;
}

/** Supprime les fichiers vidéo d'un dossier (sans toucher aux sous-dossiers). */
async function removeVideoFilesIn(dir) {
  let removed = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!LOCAL_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    try {
      await fs.remove(path.join(dir, entry.name));
      removed += 1;
    } catch {
      // Fichier verrouillé par un autre programme : il sera repris au
      // prochain démarrage, sans bloquer le serveur.
    }
  }
  return removed;
}

/**
 * Vide les vidéos locales du poste.
 *
 * - tous les fichiers vidéo importés sont effacés (le codage reste intact) ;
 * - une vidéo sans lien YouTube est supprimée de la bibliothèque (pierre
 *   tombale) pour que la suppression se propage aux autres postes ;
 * - une vidéo avec lien YouTube conserve son lien, ses équipes, son codage et
 *   ses réglages, et perd seulement ses références à un fichier local.
 *
 * @returns {Promise<{videosRemoved:number, videosCleaned:number, filesRemoved:number}>}
 */
async function purgeLocalVideos() {
  const rows = await allAsync('SELECT * FROM videos', []);
  const nowIso = new Date().toISOString();
  let videosRemoved = 0;
  let videosCleaned = 0;
  let filesRemoved = 0;

  for (const row of rows) {
    for (const filePath of [row.filepath, row.filepath_proxy, row.filepath_angle2]) {
      if (!filePath) continue;
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          filesRemoved += 1;
        }
      } catch {
        // Fichier déjà absent ou verrouillé.
      }
    }

    if (!hasYoutubeLink(row.youtube_url)) {
      if (!Number(row.deleted)) videosRemoved += 1;
      await runAsync(
        `UPDATE videos
            SET sync_uuid = ?, deleted = 1, dirty = 1, local_updated_at = ?,
                filename = '', filepath = '', filepath_proxy = NULL,
                proxy_status = NULL, proxy_error = NULL,
                filename_angle2 = NULL, filepath_angle2 = NULL
          WHERE id = ?`,
        [row.sync_uuid || uuidv4(), nowIso, row.id]
      );
      await runAsync(
        `UPDATE volley_matches
            SET deleted = 1, dirty = 1, local_updated_at = ?
          WHERE video_id = ? AND COALESCE(deleted, 0) = 0`,
        [nowIso, row.id]
      );
      continue;
    }

    const hadLocalFile = Boolean(
      row.filename || row.filepath || row.filepath_proxy || row.filename_angle2 || row.filepath_angle2 || row.proxy_status
    );
    if (!hadLocalFile) continue;
    videosCleaned += 1;
    await runAsync(
      `UPDATE videos
          SET filename = '', filepath = '', filepath_proxy = NULL,
              proxy_status = NULL, proxy_error = NULL,
              filename_angle2 = NULL, filepath_angle2 = NULL
        WHERE id = ?`,
      [row.id]
    );
  }

  // Fichiers orphelins (import interrompu, ancienne version en cache…).
  filesRemoved += await removeVideoFilesIn(config.uploadsDir);
  filesRemoved += await removeVideoFilesIn(proxyDir);

  if (videosRemoved || videosCleaned || filesRemoved) emitCollectionChanged('videos');
  return { videosRemoved, videosCleaned, filesRemoved };
}

module.exports = { purgeLocalVideos, hasYoutubeLink };
