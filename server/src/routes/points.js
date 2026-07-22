const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

const router = express.Router();

// Get all points for a video
router.get('/:videoId', authenticateToken, (req, res) => {
  const { videoId } = req.params;

  db.all(
    'SELECT * FROM points WHERE video_id = ? ORDER BY point_number ASC',
    [videoId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ points: rows });
    }
  );
});

// Save all annotations for a video (Onglet B)
router.post('/:videoId', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { points } = req.body;

  if (!points || !Array.isArray(points)) {
    return res.status(400).json({ error: 'Points array is required' });
  }

  // Verify video belongs to user
  db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id], (err, video) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Clear old points and insert new ones
    db.run('DELETE FROM points WHERE video_id = ?', [videoId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to clear old points' });
      }

      if (points.length === 0) {
        return res.json({ message: 'Points cleared successfully', count: 0 });
      }

      const stmt = db.prepare(
        'INSERT INTO points (video_id, point_number, start_time, end_time, winner, serving_team, receiving_team, team1_position, team2_position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );

      points.forEach((point) => {
        stmt.run(
          videoId,
          point.point_number,
          point.start_time || 0,
          point.end_time || 0,
          point.winner || null,
          point.serving_team || null,
          point.receiving_team || null,
          point.team1_position || null,
          point.team2_position || null
        );
      });

      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to save points' });
        }

        // Update video status
        db.run('UPDATE videos SET status = ? WHERE id = ?', ['annotated', videoId]);

        res.json({ message: 'Points saved successfully', count: points.length });
      });
    });
  });
});

module.exports = router;