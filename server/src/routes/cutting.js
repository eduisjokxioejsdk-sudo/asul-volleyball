const express = require('express');
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


// Save cut segments from video trimming (Onglet A)
router.post('/segments/:videoId', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { segments } = req.body; // array of { start_time, end_time, point_index }

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: 'Segments array is required' });
  }

  // Verify the video belongs to this user
  db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id], (err, video) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Save segments to database
    const stmt = db.prepare('INSERT INTO cut_segments (video_id, start_time, end_time, point_index) VALUES (?, ?, ?, ?)');
    
    db.run('DELETE FROM cut_segments WHERE video_id = ?', [videoId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to clear old segments' });
      }

      segments.forEach((seg, index) => {
        stmt.run(videoId, seg.start_time, seg.end_time, index);
      });
      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to save segments' });
        }

        // Update video status
        db.run('UPDATE videos SET status = ? WHERE id = ?', ['cut_ready', videoId]);

        res.json({ message: 'Segments saved successfully', count: segments.length });
      });
    });
  });
});

// Get cut segments for a video
router.get('/segments/:videoId', authenticateToken, (req, res) => {
  const { videoId } = req.params;

  db.all(
    'SELECT * FROM cut_segments WHERE video_id = ? ORDER BY point_index ASC',
    [videoId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ segments: rows });
    }
  );
});

// Generate trimmed video from segments
router.post('/generate/:videoId', authenticateToken, async (req, res) => {
  const { videoId } = req.params;

  try {
    const video = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const segments = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM cut_segments WHERE video_id = ? ORDER BY point_index ASC', [videoId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (segments.length === 0) {
      return res.status(400).json({ error: 'No segments found. Please cut the video first.' });
    }

    const inputPath = video.filepath;
    const outputFilename = `trimmed_${uuidv4()}.mp4`;
    const outputPath = path.join(trimmedDir, outputFilename);

    // Use fluent-ffmpeg to concatenate segments
    const ffmpeg = require('fluent-ffmpeg');

    // Create a concat file list for ffmpeg
    const concatContent = segments.map(seg => {
      const duration = seg.end_time - seg.start_time;
      return `file '${inputPath.replace(/'/g, "'\\''")}'\ninpoint ${seg.start_time}\noutpoint ${seg.end_time}`;
    }).join('\n');

    const concatFilePath = path.join(trimmedDir, `concat_${uuidv4()}.txt`);
    fs.writeFileSync(concatFilePath, concatContent);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .on('end', async () => {
          // Clean up concat file
          fs.remove(concatFilePath).catch(() => {});

          // Update video record
          db.run('UPDATE videos SET filepath_trimmed = ?, status = ? WHERE id = ?',
            [outputPath, 'trimmed', videoId]);

          res.json({
            message: 'Trimmed video generated successfully',
            trimmed_filename: outputFilename,
            trimmed_filepath: outputPath
          });
          resolve();
        })
        .on('error', (err) => {
          fs.remove(concatFilePath).catch(() => {});
          reject(err);
        })
        .save(outputPath);
    }).catch(err => {
      return res.status(500).json({ error: 'Failed to generate trimmed video: ' + err.message });
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;