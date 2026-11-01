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

// Partage à distance (métadonnées vidéo + liens YouTube, jamais les fichiers lourds).
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
// Journée du championnat (affichée devant le nom du match : « J1 », « J2 »…).
// Un nombre seul (« 3 ») ou un préfixe « J » sont normalisés ; défaut « J0 ».
// ---------------------------------------------------------------------------
function normalizeJournee(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'J0';
  const digits = raw.match(/^(\d{1,2})$/);
  if (digits) return `J${digits[1]}`;
  const prefixed = raw.match(/^j\s*[-_ ]?\s*(\d{1,2})$/i);
  if (prefixed) return `J${prefixed[1]}`;
  return raw.slice(0, 24);
}

// ---------------------------------------------------------------------------
// Préparation des vidéos pour la lecture dans le navigateur.
// ---------------------------------------------------------------------------

const playableJobs = new Map();
let playableQueue = Promise.resolve();
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
    copyPossible: verdict.copyPossible,
    mode: verdict.playable ? 'none' : verdict.copyPossible ? 'remux' : 'transcode',
  };
  playableDiagnoses.set(videoId, result);
  return result;
}

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

  if (!force && video.filepath_proxy && fs.existsSync(video.filepath_proxy)) {
    setProxyStatus(videoId, 'ready', video.proxy_error || null);
    return { status: 'ready', mode: 'cached', reason: video.proxy_error || null };
  }

  const outPath = path.join(proxyDir, `playable_${uuidv4()}.mp4`);
  try {
    const verdict = await diagnoseVideo(videoId, { force });
    const result = await ensurePlayable(video.filepath, outPath, verdict);

    if (!result.needed) {
      fs.remove(outPath).catch(() => {});
      playableDiagnoses.delete(videoId);
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

function preparePlayableVideo(videoId, { force = false } = {}) {
  const existing = playableJobs.get(videoId);
  if (existing) return existing;

  const job = playableQueue.then(() => runPrepare(videoId, force));
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
  },
});

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
  limits: { fileSize: 100 * 1024 * 1024 * 1024 },
});

// Upload a video (or create a match with a YouTube link or 0, 1, or 2 camera angles)
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
    const journee = normalizeJournee(req.body.journee);
    const youtube_url = req.body.youtube_url ? String(req.body.youtube_url).trim() || null : null;
    const home_team_id = req.body.home_team_id ? Number(req.body.home_team_id) : null;
    const away_team_id = req.body.away_team_id ? Number(req.body.away_team_id) : null;
    const angle2_offset = req.body.angle2_offset ? Number(req.body.angle2_offset) : 0;

    const filename = file1 ? file1.filename : '';
    const original_name = file1 ? file1.originalname : display_name;
    const filepath = file1 ? file1.path : '';
    const filename_angle2 = file2 ? file2.filename : null;
    const filepath_angle2 = file2 ? file2.path : null;
    const status = file1 || youtube_url ? 'uploaded' : 'pending_video';
    const nowIso = new Date().toISOString();
    const videoSyncUuid = uuidv4();

    const teamIds = [home_team_id, away_team_id].filter(Boolean);
    const loadTeamUuids = (cb) => {
      if (!teamIds.length) return cb(null, null);
      db.all(
        `SELECT id, sync_uuid FROM teams WHERE id IN (${teamIds.map(() => '?').join(', ')})`,
        teamIds,
        (tErr, tRows) => {
          if (tErr) return cb(null, null);
          const map = new Map((tRows || []).map((r) => [Number(r.id), r.sync_uuid]));
          cb(
            home_team_id ? map.get(home_team_id) || null : null,
            away_team_id ? map.get(away_team_id) || null : null
          );
        }
      );
    };

    loadTeamUuids((home_team_uuid, away_team_uuid) => {
      db.run(
        `INSERT INTO videos (
          user_id, filename, original_name, display_name, journee, youtube_url, filepath,
          filename_angle2, filepath_angle2, angle2_offset,
          team1_name, team2_name, home_team_id, away_team_id, home_team_uuid, away_team_uuid,
          status, sync_uuid, dirty, deleted, local_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        [
          req.user.id,
          filename,
          original_name,
          display_name,
          journee,
          youtube_url,
          filepath,
          filename_angle2,
          filepath_angle2,
          angle2_offset,
          team1_name,
          team2_name,
          home_team_id,
          away_team_id,
          home_team_uuid,
          away_team_uuid,
          status,
          videoSyncUuid,
          nowIso,
        ],
        function (dbErr) {
          if (dbErr) {
            return res.status(500).json({ error: 'Failed to save video metadata' });
          }

          const videoId = this.lastID;

          db.run(
            `INSERT INTO volley_matches
              (video_id, sync_uuid, status, home_team_id, away_team_id, home_team_uuid, away_team_uuid, deleted, dirty, local_updated_at)
             VALUES (?, ?, 'coding', ?, ?, ?, ?, 0, 1, ?)
             ON CONFLICT(video_id) DO UPDATE SET
               home_team_id = excluded.home_team_id,
               away_team_id = excluded.away_team_id,
               home_team_uuid = excluded.home_team_uuid,
               away_team_uuid = excluded.away_team_uuid,
               dirty = 1,
               local_updated_at = excluded.local_updated_at`,
            [videoId, uuidv4(), home_team_id, away_team_id, home_team_uuid, away_team_uuid, nowIso],
            () => {
              syncHub.videos.syncNow({ reason: 'upload' }).catch(() => {});
              syncHub.matches.syncNow({ reason: 'upload' }).catch(() => {});
            }
          );

          emitCollectionChanged('videos');
          emitCollectionChanged('matches');
          if (file1) preparePlayableVideo(videoId).catch(() => {});
          res.status(201).json({
            id: videoId,
            sync_uuid: videoSyncUuid,
            user_id: req.user.id,
            filename,
            original_name,
            display_name,
            journee,
            youtube_url,
            filepath,
            filename_angle2,
            filepath_angle2,
            angle2_offset,
            team1_name,
            team2_name,
            home_team_id,
            away_team_id,
            status,
            duration: null,
          });
        }
      );
    });
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

    db.get('SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0', [req.params.id], (getErr, video) => {
      if (getErr) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      if (angle === '1') {
        if (video.filepath) fs.remove(video.filepath).catch(() => {});
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
            preparePlayableVideo(video.id).catch(() => {});
            syncHub.videos.syncNow({ reason: 'upload-angle' }).catch(() => {});
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
            syncHub.videos.syncNow({ reason: 'upload-angle' }).catch(() => {});
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

// Get all videos (partagées entre tous les utilisateurs et postes)
router.get('/', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM videos WHERE COALESCE(deleted, 0) = 0 ORDER BY created_at DESC, id DESC',
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ videos: rows || [] });
    }
  );
});

// Get a specific video
router.get('/:id', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
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

router.post('/:id/playable/diagnose', authenticateToken, (req, res) => {
  db.get(
    'SELECT id FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });
      diagnoseVideo(video.id, { force: req.body?.force === true })
        .then((verdict) => res.json(verdict))
        .catch((e) => res.status(e.status === 404 ? 404 : 500).json({ error: e.message }));
    }
  );
});

router.get('/:id/playable/status', authenticateToken, (req, res) => {
  db.get(
    'SELECT id, filepath_proxy, proxy_status, proxy_error FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      const hasProxy = Boolean(video.filepath_proxy && fs.existsSync(video.filepath_proxy));
      const running = playableJobs.has(video.id);
      let status = video.proxy_status || (hasProxy ? 'ready' : null);
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

router.post('/:id/playable', authenticateToken, (req, res) => {
  db.get(
    'SELECT id FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });
      const force = req.body?.force === true;
      preparePlayableVideo(video.id, { force }).catch(() => {});
      res.status(202).json({ videoId: video.id, status: 'processing' });
    }
  );
});

// Delete a video (pierre tombale propagée au Cloud + nettoyage des fichiers locaux)
router.delete('/:id', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      if (video.filepath) fs.remove(video.filepath).catch(() => {});
      if (video.filepath_proxy) fs.remove(video.filepath_proxy).catch(() => {});
      if (video.filepath_angle2) fs.remove(video.filepath_angle2).catch(() => {});

      const nowIso = new Date().toISOString();
      const syncUuid = video.sync_uuid || uuidv4();
      db.run(
        `UPDATE videos
            SET sync_uuid = ?, deleted = 1, dirty = 1, local_updated_at = ?,
                filename = '', filepath = '', filepath_proxy = NULL, filename_angle2 = NULL, filepath_angle2 = NULL
          WHERE id = ?`,
        [syncUuid, nowIso, video.id],
        function (delErr) {
          if (delErr) {
            return res.status(500).json({ error: 'Failed to delete video' });
          }
          db.run(
            'UPDATE volley_matches SET deleted = 1, dirty = 1, local_updated_at = ? WHERE video_id = ?',
            [nowIso, video.id],
            () => {
              syncHub.videos.syncNow({ reason: 'delete' }).catch(() => {});
              syncHub.matches.syncNow({ reason: 'delete' }).catch(() => {});
            }
          );
          emitCollectionChanged('videos');
          emitCollectionChanged('matches');
          res.json({ message: 'Video deleted successfully' });
        }
      );
    }
  );
});

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
  const filePath = path.join(uploadsDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath, STREAM_OPTIONS);
});

// Stream proxy video file
router.get('/proxy/:filename', (req, res) => {
  const filePath = path.join(proxyDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Proxy file not found' });
  }
  res.sendFile(filePath, STREAM_OPTIONS);
});

// Update video (rename, color, angle2_offset, youtube_url, teams, duration, journee)
router.patch('/:id', authenticateToken, (req, res) => {
  const { display_name, color, angle2_offset, youtube_url, team1_name, team2_name, duration, status, journee } = req.body || {};

  db.get(
    'SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
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
      if (youtube_url !== undefined) {
        const cleanYt = youtube_url ? String(youtube_url).trim() || null : null;
        updates.push('youtube_url = ?');
        values.push(cleanYt);
        if (cleanYt && video.status === 'pending_video' && status === undefined) {
          updates.push("status = 'uploaded'");
        }
      }
      if (team1_name !== undefined) {
        updates.push('team1_name = ?');
        values.push(team1_name);
      }
      if (team2_name !== undefined) {
        updates.push('team2_name = ?');
        values.push(team2_name);
      }
      if (duration !== undefined) {
        updates.push('duration = ?');
        values.push(duration == null ? null : Number(duration));
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (journee !== undefined) {
        updates.push('journee = ?');
        values.push(normalizeJournee(journee));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      if (!video.sync_uuid) {
        updates.push('sync_uuid = ?');
        values.push(uuidv4());
      }
      updates.push('dirty = 1');
      updates.push('local_updated_at = ?');
      values.push(new Date().toISOString());

      values.push(req.params.id);
      const query = `UPDATE videos SET ${updates.join(', ')} WHERE id = ?`;

      db.run(query, values, function (upErr) {
        if (upErr) {
          return res.status(500).json({ error: 'Failed to update video' });
        }
        syncHub.videos.syncNow({ reason: 'patch' }).catch(() => {});
        emitCollectionChanged('videos');
        db.get(
          'SELECT * FROM videos WHERE id = ?',
          [req.params.id],
          (err2, updatedVideo) => {
            if (err2) {
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
    'SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      db.run(
        'INSERT OR IGNORE INTO video_folders (video_id, folder_id) VALUES (?, ?)',
        [req.params.id, folder_id],
        function (insErr) {
          if (insErr) return res.status(500).json({ error: 'Failed to add video to folder' });
          res.json({ message: 'Video added to folder' });
        }
      );
    }
  );
});

// Remove video from folder
router.delete('/:id/folders/:folderId', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      db.run(
        'DELETE FROM video_folders WHERE video_id = ? AND folder_id = ?',
        [req.params.id, req.params.folderId],
        function (delErr) {
          if (delErr) return res.status(500).json({ error: 'Failed to remove video from folder' });
          res.json({ message: 'Video removed from folder' });
        }
      );
    }
  );
});

// Get folders for a video
router.get('/:id/folders', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [req.params.id],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      db.all(
        `SELECT f.* FROM folders f
         INNER JOIN video_folders vf ON f.id = vf.folder_id
         WHERE vf.video_id = ?
         ORDER BY f.name ASC`,
        [req.params.id],
        (fErr, folders) => {
          if (fErr) return res.status(500).json({ error: 'Database error' });
          res.json({ folders: folders || [] });
        }
      );
    }
  );
});

// Get all folders with video count
router.get('/folders/all', authenticateToken, (req, res) => {
  db.all(
    `SELECT f.*, COUNT(v.id) as video_count 
     FROM folders f
     LEFT JOIN video_folders vf ON f.id = vf.folder_id
     LEFT JOIN videos v ON v.id = vf.video_id AND COALESCE(v.deleted, 0) = 0
     GROUP BY f.id
     ORDER BY f.name ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ folders: rows || [] });
    }
  );
});

// Get videos in a folder
router.get('/folders/:id/videos', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM folders WHERE id = ?',
    [req.params.id],
    (err, folder) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });

      db.all(
        `SELECT v.* FROM videos v
         INNER JOIN video_folders vf ON v.id = vf.video_id
         WHERE vf.folder_id = ? AND COALESCE(v.deleted, 0) = 0
         ORDER BY v.created_at DESC`,
        [req.params.id],
        (vErr, videos) => {
          if (vErr) return res.status(500).json({ error: 'Database error' });
          res.json({ videos: videos || [] });
        }
      );
    }
  );
});

// Create a folder
router.post('/folders', authenticateToken, (req, res) => {
  const { name, color, parent_folder_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });

  db.run(
    'INSERT INTO folders (user_id, name, color, parent_folder_id) VALUES (?, ?, ?, ?)',
    [req.user.id, name, color || '#1a73e8', parent_folder_id || null],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create folder' });
      db.get('SELECT * FROM folders WHERE id = ?', [this.lastID], (err2, folder) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.status(201).json({ folder });
      });
    }
  );
});

// Update a folder
router.patch('/folders/:id', authenticateToken, (req, res) => {
  const { name, color } = req.body;

  db.get('SELECT * FROM folders WHERE id = ?', [req.params.id], (err, folder) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

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
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    values.push(req.params.id);
    db.run(`UPDATE folders SET ${updates.join(', ')} WHERE id = ?`, values, function (upErr) {
      if (upErr) return res.status(500).json({ error: 'Failed to update folder' });
      db.get('SELECT * FROM folders WHERE id = ?', [req.params.id], (err2, updatedFolder) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.json({ folder: updatedFolder });
      });
    });
  });
});

// Delete a folder
router.delete('/folders/:id', authenticateToken, (req, res) => {
  db.get('SELECT * FROM folders WHERE id = ?', [req.params.id], (err, folder) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    db.run('DELETE FROM video_folders WHERE folder_id = ?', [req.params.id], function (delVfErr) {
      if (delVfErr) return res.status(500).json({ error: 'Failed to remove videos from folder' });
      db.run('DELETE FROM folders WHERE id = ?', [req.params.id], function (delFErr) {
        if (delFErr) return res.status(500).json({ error: 'Failed to delete folder' });
        res.json({ message: 'Folder deleted successfully' });
      });
    });
  });
});

module.exports = router;
