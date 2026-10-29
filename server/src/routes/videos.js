const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const syncHub = require('../syncHub');
const { emitCollectionChanged } = require('../socket');
const { mountSyncRoutes } = require('./sync');
const { ensurePlayable, inspectVideo } = require('../proxy');

const router = express.Router();

// Partage à distance (métadonnées vidéo seulement, jamais les fichiers).
mountSyncRoutes(router, syncHub.videos);

// Dossier de données (positionné par config.js ; repli sur server/ si absent).
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const uploadsDir = path.join(dataDir, 'uploads');
// Dossier des versions « proxy » (lecture légère). Le nom « trimmed » est
// conservé pour la compatibilité avec les installations existantes.
const proxyDir = path.join(uploadsDir, 'trimmed');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(proxyDir);

// ---------------------------------------------------------------------------
// Préparation des vidéos pour la lecture dans le navigateur.
//
// Un fichier uploadé n'est pas toujours décodable par un élément <video>
// (conteneur fragmenté, codec exotique, index en fin de fichier). Dans ce cas
// le lecteur tourne à l'infini sans émettre d'erreur. On détecte donc le
// problème puis on produit une version lisible dans uploads/trimmed/, pointée
// par videos.filepath_proxy — que le client utilise déjà en priorité.
// ---------------------------------------------------------------------------

// Préparation en cours, par id de vidéo (le résultat est aussi persisté dans
// videos.proxy_status / videos.proxy_error pour survivre à un redémarrage).
const playableJobs = new Map();
// File d'attente : une seule préparation à la fois pour ne pas saturer le
// disque et le CPU (les fichiers font plusieurs Go).
let playableQueue = Promise.resolve();
// Diagnoses déjà calculés, par id de vidéo (un probe ffmpeg coûte quelques s).
const playableDiagnoses = new Map();

/** Enregistre le statut de préparation d'une vidéo en base. */
function setProxyStatus(videoId, status, message = null) {
  db.run(
    'UPDATE videos SET proxy_status = ?, proxy_error = ? WHERE id = ?',
    [status, message, videoId],
    () => {}
  );
}

/** Récupère une vidéo par son id. @returns {Promise<object|undefined>} */
function getVideoById(videoId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM videos WHERE id = ?', [videoId], (err, row) => (err ? reject(err) : resolve(row)));
  });
}

/**
 * Diagnose (sans rien produire) : la vidéo est-elle lisible telle quelle ?
 * Le résultat est mis en cache car un probe ffmpeg coûte quelques secondes.
 * @returns {Promise<object>} verdict enrichi du mode de correction conseillé.
 */
async function diagnoseVideo(videoId, { force = false } = {}) {
  if (!force && playableDiagnoses.has(videoId)) return playableDiagnoses.get(videoId);
  const video = await getVideoById(videoId);
  if (!video) throw Object.assign(new Error('Video not found'), { status: 404 });
  const verdict = await inspectVideo(video.filepath);
  const result = {
    playable: verdict.playable,
    reason: verdict.reason,
    probe: verdict.probe,
    container: verdict.container,
    // Conservé pour pouvoir réutiliser ce verdict lors de la préparation
    // (évite une seconde sonde ffmpeg sur des fichiers de plusieurs Go).
    copyPossible: verdict.copyPossible,
    // Ce que produirait une préparation : remux (rapide, sans perte) ou
    // transcodage proxy 480p (lent, nécessaire si le codec n'est pas supporté).
    mode: verdict.playable ? 'none' : verdict.copyPossible ? 'remux' : 'transcode',
  };
  playableDiagnoses.set(videoId, result);
  return result;
}

/**
 * Travail de préparation d'une vidéo. Ne rejette jamais : renvoie toujours un
 * objet de statut, pour que la file d'attente et les routes restent simples.
 */
async function runPrepare(videoId, force) {
  let video;
  try {
    video = await getVideoById(videoId);
  } catch {
    return { status: 'error', error: 'Erreur base de données.' };
  }
  if (!video) return { status: 'error', error: 'Vidéo introuvable.' };
  if (!video.filepath) {
    setProxyStatus(videoId, 'error', 'Aucun fichier source associé à cette vidéo.');
    return { status: 'error', error: 'Aucun fichier source associé à cette vidéo.' };
  }
  if (!fs.existsSync(video.filepath)) {
    setProxyStatus(videoId, 'error', 'Fichier source introuvable sur le disque.');
    return { status: 'error', error: 'Fichier source introuvable sur le disque.' };
  }

  setProxyStatus(videoId, 'processing');

  // Une version déjà préparée et toujours présente est réutilisée telle quelle.
  if (!force && video.filepath_proxy && fs.existsSync(video.filepath_proxy)) {
    setProxyStatus(videoId, 'ready', video.proxy_error || null);
    return { status: 'ready', mode: 'cached', reason: video.proxy_error || null };
  }

  const outPath = path.join(proxyDir, `playable_${uuidv4()}.mp4`);
  try {
    // diagnoseVideo met son résultat en cache : une préparation lancée juste
    // après un diagnostic ne resonde pas le fichier (la sonde coûte plusieurs
    // dizaines de secondes sur un fichier de quelques Go). Un `force` resonde,
    // puisque l'utilisateur demande explicitement à tout reprendre.
    const verdict = await diagnoseVideo(videoId, { force });
    const result = await ensurePlayable(video.filepath, outPath, verdict);

    // Rien à faire : le fichier d'origine est déjà lisible par le navigateur.
    if (!result.needed) {
      fs.remove(outPath).catch(() => {});
      playableDiagnoses.delete(videoId);
      // Un proxy devenu inutile (fichier source remplacé depuis) est oublié.
      const staleProxy = video.filepath_proxy && !fs.existsSync(video.filepath_proxy);
      db.run(
        `UPDATE videos SET proxy_status = 'not_needed', proxy_error = NULL${staleProxy ? ', filepath_proxy = NULL' : ''} WHERE id = ?`,
        [videoId],
        () => {}
      );
      emitCollectionChanged('videos');
      return { status: 'not_needed', reason: null };
    }

    if (!fs.existsSync(outPath)) throw new Error('La préparation n’a produit aucun fichier.');

    const previousProxy = video.filepath_proxy;
    db.run(
      'UPDATE videos SET filepath_proxy = ?, proxy_status = ?, proxy_error = ?, local_updated_at = ? WHERE id = ?',
      [outPath, 'ready', result.reason, new Date().toISOString(), videoId],
      () => {}
    );
    // L'ancienne version préparée devient inutile.
    if (previousProxy && previousProxy !== outPath) fs.remove(previousProxy).catch(() => {});
    emitCollectionChanged('videos');
    console.log(`[ASUL] Vidéo ${videoId} préparée (${result.mode}) : ${path.basename(outPath)}`);
    return { status: 'ready', mode: result.mode, reason: result.reason };
  } catch (err) {
    fs.remove(outPath).catch(() => {});
    const message = (err && err.message) || 'Échec de la préparation de la vidéo.';
    setProxyStatus(videoId, 'error', message);
    emitCollectionChanged('videos');
    console.error(`[ASUL] Préparation de la vidéo ${videoId} impossible :`, message);
    return { status: 'error', error: message };
  }
}

/**
 * Lance (ou rejoint) la préparation d'une version lisible pour `videoId`.
 * Les préparations sont sérialisées ; un appel répété rejoint le travail en
 * cours au lieu d'en démarrer un second.
 * @returns {Promise<{status:string,mode?:string,reason?:string,error?:string}>}
 */
function preparePlayableVideo(videoId, { force = false } = {}) {
  const existing = playableJobs.get(videoId);
  if (existing) return existing;

  const job = playableQueue.then(() => runPrepare(videoId, force));
  // La chaîne ne doit jamais se rompre, même si une préparation échoue.
  playableQueue = job.then(() => {}, () => {});
  playableJobs.set(videoId, job);
  job.then(
    () => { if (playableJobs.get(videoId) === job) playableJobs.delete(videoId); },
    () => { if (playableJobs.get(videoId) === job) playableJobs.delete(videoId); }
  );
  return job;
}


// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

// Extensions vidéo acceptées (le filtre MIME seul rejette les .mkv / .avi
// envoyés en « application/octet-stream », très fréquent sous Windows).
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mpeg', '.mpg', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okMime = allowedMimes.includes(file.mimetype);
    const okExt = ALLOWED_VIDEO_EXTENSIONS.includes(ext);
    if (okMime || okExt) {
      cb(null, true);
    } else {
      cb(new Error(`Format vidéo non pris en charge : ${ext || file.mimetype}. Formats acceptés : mp4, mpeg, mov, avi, mkv, webm, m4v.`));
    }
  },
  // Limite de taille : 100 Go max (permet l'upload de très grosses vidéos,
  // ex. fichiers de 12 Go). Passer à Infinity pour supprimer toute limite.
  limits: { fileSize: 100 * 1024 * 1024 * 1024 }
});

// Upload a video (or create a match with 0, 1, or 2 camera angles)
router.post('/upload', authenticateToken, (req, res) => {
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'video_angle2', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const file1 = req.files?.video?.[0] || null;
    const file2 = req.files?.video_angle2?.[0] || null;

    const team1_name = req.body.team1_name || 'Équipe 1';
    const team2_name = req.body.team2_name || 'Équipe 2';
    const display_name = req.body.display_name || `${team1_name} vs ${team2_name}`;
    const home_team_id = req.body.home_team_id ? Number(req.body.home_team_id) : null;
    const away_team_id = req.body.away_team_id ? Number(req.body.away_team_id) : null;
    const angle2_offset = req.body.angle2_offset ? Number(req.body.angle2_offset) : 0;

    const filename = file1 ? file1.filename : '';
    const original_name = file1 ? file1.originalname : display_name;
    const filepath = file1 ? file1.path : '';
    const filename_angle2 = file2 ? file2.filename : null;
    const filepath_angle2 = file2 ? file2.path : null;
    const status = file1 ? 'uploaded' : 'pending_video';

    db.run(
      `INSERT INTO videos (
        user_id, filename, original_name, display_name, filepath,
        filename_angle2, filepath_angle2, angle2_offset,
        team1_name, team2_name, home_team_id, away_team_id,
        status, sync_uuid, dirty, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        req.user.id,
        filename,
        original_name,
        display_name,
        filepath,
        filename_angle2,
        filepath_angle2,
        angle2_offset,
        team1_name,
        team2_name,
        home_team_id,
        away_team_id,
        status,
        uuidv4(),
        new Date().toISOString(),
      ],
      function (dbErr) {
        if (dbErr) {
          return res.status(500).json({ error: 'Failed to save video metadata' });
        }

        const videoId = this.lastID;

        if (home_team_id || away_team_id) {
          db.run(
            'INSERT OR REPLACE INTO volley_matches (video_id, home_team_id, away_team_id) VALUES (?, ?, ?)',
            [this.lastID, home_team_id, away_team_id],
            () => {}
          );
        }
        syncHub.videos.syncNow({ reason: 'upload' }).catch(() => {});
        emitCollectionChanged('videos');
        // Prépare tout de suite une version lisible par le navigateur si le
        // fichier ne l'est pas : sinon le lecteur tournerait à l'infini, sans
        // message d'erreur (conteneur fragmenté, codec non décodable…).
        if (file1) preparePlayableVideo(videoId).catch(() => {});
        res.status(201).json({
          id: this.lastID,
          user_id: req.user.id,
          filename,
          original_name,
          display_name,
          filepath,
          filename_angle2,
          filepath_angle2,
          angle2_offset,
          team1_name,
          team2_name,
          status,
          duration: null,
        });
      }
    );
  });
});

// Upload or replace Angle 1 or Angle 2 after match creation ("après coup")
router.post('/:id/upload-angle', authenticateToken, (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni.' });
    }

    const angle = String(req.body.angle || '2') === '1' ? '1' : '2';
    const nowIso = new Date().toISOString();

    db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (getErr, video) => {
      if (getErr) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      if (angle === '1') {
        if (video.filepath) fs.remove(video.filepath).catch(() => {});
        // La version préparée correspondait à l'ancien fichier : on l'oublie.
        if (video.filepath_proxy) fs.remove(video.filepath_proxy).catch(() => {});
        playableDiagnoses.delete(video.id);
        db.run(
          `UPDATE videos
              SET filename = ?, original_name = COALESCE(NULLIF(original_name, ''), ?), filepath = ?,
                  filepath_proxy = NULL, proxy_status = NULL, proxy_error = NULL,
                  status = 'uploaded', dirty = 1, local_updated_at = ?
            WHERE id = ?`,
          [req.file.filename, req.file.originalname, req.file.path, nowIso, video.id],
          (upErr) => {
            if (upErr) return res.status(500).json({ error: 'Failed to update Angle 1' });
            // Nouvelle source : on relance la préparation d'une version lisible.
            preparePlayableVideo(video.id).catch(() => {});
            db.get('SELECT * FROM videos WHERE id = ?', [video.id], (e2, updated) => {
              emitCollectionChanged('videos');
              res.json({ video: updated });
            });
          }
        );
      } else {
        if (video.filepath_angle2) fs.remove(video.filepath_angle2).catch(() => {});
        const offset = req.body.angle2_offset !== undefined ? Number(req.body.angle2_offset) : (video.angle2_offset || 0);
        db.run(
          `UPDATE videos
              SET filename_angle2 = ?, filepath_angle2 = ?, angle2_offset = ?, dirty = 1, local_updated_at = ?
            WHERE id = ?`,
          [req.file.filename, req.file.path, offset, nowIso, video.id],
          (upErr) => {
            if (upErr) return res.status(500).json({ error: 'Failed to update Angle 2' });
            db.get('SELECT * FROM videos WHERE id = ?', [video.id], (e2, updated) => {
              emitCollectionChanged('videos');
              res.json({ video: updated });
            });
          }
        );
      }
    });
  });
});

// Get all videos for the current user
router.get('/', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ videos: rows });
    }
  );
});

// Get a specific video
router.get('/:id', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }
      res.json({ video });
    }
  );
});

// ---------------------------------------------------------------------------
// Préparation d'une version lisible par le navigateur (voir ../proxy.js)
// ---------------------------------------------------------------------------

// Diagnose : explique pourquoi la vidéo ne démarre pas, sans rien produire.
// Un peu coûteux (sonde ffmpeg) d'où le verbe POST et un cache côté serveur.
router.post('/:id/playable/diagnose', authenticateToken, (req, res) => {
  db.get(
    'SELECT id FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });
      diagnoseVideo(video.id, { force: req.body?.force === true })
        .then((verdict) => res.json(verdict))
        .catch((e) => res.status(e.status === 404 ? 404 : 500).json({ error: e.message }));
    }
  );
});

// État de la préparation. Léger (lecture base + existence du fichier), il est
// donc interrogeable en boucle par le client pendant un remux / transcodage.
router.get('/:id/playable/status', authenticateToken, (req, res) => {
  db.get(
    'SELECT id, filepath_proxy, proxy_status, proxy_error FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      const hasProxy = Boolean(video.filepath_proxy && fs.existsSync(video.filepath_proxy));
      const running = playableJobs.has(video.id);
      let status = video.proxy_status || (hasProxy ? 'ready' : null);
      // Préparation interrompue (redémarrage du serveur) : on repart de zéro.
      if (status === 'processing' && !running) status = null;
      if (running) status = 'processing';

      res.json({
        videoId: video.id,
        status,
        hasProxy,
        queued: playableJobs.size,
        reason: video.proxy_error || null,
      });
    }
  );
});

// Prépare (ou répare) une version lisible. Réponse immédiate (202) : le travail
// peut durer plusieurs minutes, le client suit l'avancement via le statut.
router.post('/:id/playable', authenticateToken, (req, res) => {
  db.get(
    'SELECT id FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });
      const force = req.body?.force === true;
      preparePlayableVideo(video.id, { force }).catch(() => {});
      res.status(202).json({ videoId: video.id, status: 'processing' });
    }
  );
});

// Delete a video
router.delete('/:id', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      // Supprime les fichiers associés (source + proxy + 2e angle).
      if (video.filepath) fs.remove(video.filepath).catch(() => {});
      if (video.filepath_proxy) {
        fs.remove(video.filepath_proxy).catch(() => {});
      }
      // Le 2e angle de caméra : sans cela, le fichier reste orphelin sur le disque.
      if (video.filepath_angle2) {
        fs.remove(video.filepath_angle2).catch(() => {});
      }
      // Delete database records
      db.run('DELETE FROM videos WHERE id = ?', [video.id], function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete video' });
        }
        emitCollectionChanged('videos');
        res.json({ message: 'Video deleted successfully' });
      });
    }
  );
});

// Options de diffusion des vidéos : les requêtes partielles sont indispensables
// (sans `Accept-Ranges`, un fichier de plusieurs Go doit être entièrement
// téléchargé avant le démarrage de la lecture) et le cache est désactivé car le
// contenu peut être remplacé par une version préparée.
const STREAM_OPTIONS = {
  acceptRanges: true,
  cacheControl: false,
  maxAge: 0,
  headers: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
};

// Stream video file (local storage)
router.get('/file/:filename', (req, res) => {
  // path.basename : interdit toute traversée de dossier via le paramètre.
  const filePath = path.join(uploadsDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath, STREAM_OPTIONS);
});

// Stream proxy video file (version légère / préparée pour la lecture)
router.get('/proxy/:filename', (req, res) => {
  const filePath = path.join(proxyDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Proxy file not found' });
  }
  res.sendFile(filePath, STREAM_OPTIONS);
});

// Update video (rename, color, angle2_offset)
router.patch('/:id', authenticateToken, (req, res) => {
  const { display_name, color, angle2_offset } = req.body;
  
  db.get(
    'SELECT * FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const updates = [];
      const values = [];

      if (display_name !== undefined) {
        updates.push('display_name = ?');
        values.push(display_name);
      }
      if (color !== undefined) {
        updates.push('color = ?');
        values.push(color);
      }
      if (angle2_offset !== undefined) {
        updates.push('angle2_offset = ?');
        values.push(Number(angle2_offset) || 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);
      const query = `UPDATE videos SET ${updates.join(', ')} WHERE id = ?`;
      
      db.run(query, values, function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update video' });
        }
        db.get(
          'SELECT * FROM videos WHERE id = ?',
          [req.params.id],
          (err, updatedVideo) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            res.json({ video: updatedVideo });
          }
        );
      });
    }
  );
});

// Add video to folder
router.post('/:id/folders', authenticateToken, (req, res) => {
  const { folder_id } = req.body;
  
  db.get(
    'SELECT * FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      db.run(
        'INSERT OR IGNORE INTO video_folders (video_id, folder_id) VALUES (?, ?)',
        [req.params.id, folder_id],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to add video to folder' });
          }
          res.json({ message: 'Video added to folder' });
        }
      );
    }
  );
});

// Remove video from folder
router.delete('/:id/folders/:folderId', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      db.run(
        'DELETE FROM video_folders WHERE video_id = ? AND folder_id = ?',
        [req.params.id, req.params.folderId],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to remove video from folder' });
          }
          res.json({ message: 'Video removed from folder' });
        }
      );
    }
  );
});

// Get folders for a video
router.get('/:id/folders', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      db.all(
        `SELECT f.* FROM folders f
         INNER JOIN video_folders vf ON f.id = vf.folder_id
         WHERE vf.video_id = ? AND f.user_id = ?
         ORDER BY f.name ASC`,
        [req.params.id, req.user.id],
        (err, folders) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ folders });
        }
      );
    }
  );
});

// Get all folders for the current user with video count
router.get('/folders/all', authenticateToken, (req, res) => {
  db.all(
    `SELECT f.*, COUNT(vf.video_id) as video_count 
     FROM folders f
     LEFT JOIN video_folders vf ON f.id = vf.folder_id
     WHERE f.user_id = ?
     GROUP BY f.id
     ORDER BY f.name ASC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ folders: rows });
    }
  );
});

// Get videos in a folder
router.get('/folders/:id/videos', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM folders WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, folder) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      db.all(
        `SELECT v.* FROM videos v
         INNER JOIN video_folders vf ON v.id = vf.video_id
         WHERE vf.folder_id = ? AND v.user_id = ?
         ORDER BY v.created_at DESC`,
        [req.params.id, req.user.id],
        (err, videos) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ videos });
        }
      );
    }
  );
});

// Create a folder
router.post('/folders', authenticateToken, (req, res) => {
  const { name, color, parent_folder_id } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  db.run(
    'INSERT INTO folders (user_id, name, color, parent_folder_id) VALUES (?, ?, ?, ?)',
    [req.user.id, name, color || '#1a73e8', parent_folder_id || null],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create folder' });
      }
      db.get(
        'SELECT * FROM folders WHERE id = ?',
        [this.lastID],
        (err, folder) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.status(201).json({ folder });
        }
      );
    }
  );
});

// Update a folder
router.patch('/folders/:id', authenticateToken, (req, res) => {
  const { name, color } = req.body;
  
  db.get(
    'SELECT * FROM folders WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, folder) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (color !== undefined) {
        updates.push('color = ?');
        values.push(color);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);
      const query = `UPDATE folders SET ${updates.join(', ')} WHERE id = ?`;
      
      db.run(query, values, function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update folder' });
        }
        db.get(
          'SELECT * FROM folders WHERE id = ?',
          [req.params.id],
          (err, updatedFolder) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            res.json({ folder: updatedFolder });
          }
        );
      });
    }
  );
});

// Delete a folder
router.delete('/folders/:id', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM folders WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, folder) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      // Remove all video-folder relationships for this folder
      db.run('DELETE FROM video_folders WHERE folder_id = ?', [req.params.id], function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to remove videos from folder' });
        }

        // Delete the folder
        db.run('DELETE FROM folders WHERE id = ?', [req.params.id], function (err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete folder' });
          }
          res.json({ message: 'Folder deleted successfully' });
        });
      });
    }
  );
});

module.exports = router;
