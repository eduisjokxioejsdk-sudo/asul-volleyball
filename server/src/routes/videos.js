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

        if (home_team_id || away_team_id) {
          db.run(
            'INSERT OR REPLACE INTO volley_matches (video_id, home_team_id, away_team_id) VALUES (?, ?, ?)',
            [this.lastID, home_team_id, away_team_id],
            () => {}
          );
        }
        syncHub.videos.syncNow({ reason: 'upload' }).catch(() => {});
        emitCollectionChanged('videos');
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
        db.run(
          `UPDATE videos
              SET filename = ?, original_name = COALESCE(NULLIF(original_name, ''), ?), filepath = ?, status = 'uploaded', dirty = 1, local_updated_at = ?
            WHERE id = ?`,
          [req.file.filename, req.file.originalname, req.file.path, nowIso, video.id],
          (upErr) => {
            if (upErr) return res.status(500).json({ error: 'Failed to update Angle 1' });
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

// Stream video file (local storage)
router.get('/file/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// Stream proxy video file (version légère pour la lecture / navigation)
router.get('/proxy/:filename', (req, res) => {
  const filePath = path.join(proxyDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Proxy file not found' });
  }
  res.sendFile(filePath);
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
