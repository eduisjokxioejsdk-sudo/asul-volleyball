const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

const router = express.Router();

// En production (Railway), utiliser le volume persistant /data si disponible
const dataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '..'));
const uploadsDir = path.join(dataDir, 'uploads');
const trimmedDir = path.join(uploadsDir, 'trimmed');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(trimmedDir);


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

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Only mp4, mpeg, mov, avi, mkv are allowed.'));
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Upload a video
router.post('/upload', authenticateToken, (req, res) => {
  console.log('Upload attempt - Headers:', req.headers);
  console.log('Upload attempt - Body:', req.body);
  console.log('Upload attempt - File:', req.file);
  
  upload.single('video')(req, res, (err) => {
    console.log('Multer callback - Error:', err);
    console.log('Multer callback - File:', req.file);
    
    if (err) {
      console.error('Multer error:', err);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ error: 'No video file provided' });
    }

    const team1_name = req.body.team1_name || 'Équipe 1';
    const team2_name = req.body.team2_name || 'Équipe 2';

    const video = {
      user_id: req.user.id,
      filename: req.file.filename,
      original_name: req.file.originalname,
      filepath: req.file.path,
      team1_name,
      team2_name,
      status: 'uploaded'
    };

    db.run(
      'INSERT INTO videos (user_id, filename, original_name, filepath, team1_name, team2_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [video.user_id, video.filename, video.original_name, video.filepath, video.team1_name, video.team2_name, video.status],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to save video metadata' });
        }

        res.status(201).json({
          id: this.lastID,
          ...video,
          filepath_trimmed: null,
          duration: null
        });
      }
    );
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

      // Delete associated files
      fs.remove(video.filepath).catch(() => {});
      if (video.filepath_trimmed) {
        fs.remove(video.filepath_trimmed).catch(() => {});
      }

      // Delete database records
      db.run('DELETE FROM points WHERE video_id = ?', [video.id]);
      db.run('DELETE FROM cut_segments WHERE video_id = ?', [video.id]);
      db.run('DELETE FROM videos WHERE id = ?', [video.id], function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete video' });
        }
        res.json({ message: 'Video deleted successfully' });
      });
    }
  );
});

// Stream video file
router.get('/file/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    // Check in trimmed directory
    const trimmedPath = path.join(trimmedDir, req.params.filename);
    if (!fs.existsSync(trimmedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(trimmedPath);
  } else {
    res.sendFile(filePath);
  }
});

// Stream trimmed video file
router.get('/trimmed/:filename', (req, res) => {
  const filePath = path.join(trimmedDir, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Trimmed file not found' });
  }
  res.sendFile(filePath);
});

// Update video (rename, color)
router.patch('/:id', authenticateToken, (req, res) => {
  const { display_name, color } = req.body;
  
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
          console.log(`Found ${videos.length} videos in folder ${req.params.id}`);
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
