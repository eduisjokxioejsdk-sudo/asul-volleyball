const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

const router = express.Router();
const EMPTY_PROGRESS = {
  version: 1,
  completed: [],
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  badges: [],
  lastActivityDate: null,
};

function normalizeProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const completed = Array.isArray(value.completed) ? value.completed : [];
  const badges = Array.isArray(value.badges) ? value.badges : [];
  if (completed.length > 300 || badges.length > 100) return null;
  if (completed.some((id) => typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id))) return null;
  if (badges.some((id) => typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id))) return null;
  const integer = (number, min, max) => Number.isInteger(number) && number >= min && number <= max;
  if (!integer(value.xp, 0, 10000000) || !integer(value.level, 1, 100000) ||
      !integer(value.streak, 0, 100000) || !integer(value.bestStreak, 0, 100000)) return null;
  const lastActivityDate = value.lastActivityDate == null ? null : String(value.lastActivityDate);
  if (lastActivityDate && !/^\d{4}-\d{2}-\d{2}$/.test(lastActivityDate)) return null;
  return {
    version: 1,
    completed: [...new Set(completed)],
    xp: value.xp,
    level: value.level,
    streak: value.streak,
    bestStreak: value.bestStreak,
    badges: [...new Set(badges)],
    lastActivityDate,
  };
}

router.get('/progress', authenticateToken, (req, res) => {
  db.get('SELECT progress_json, updated_at FROM academy_progress WHERE user_id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    let progress = EMPTY_PROGRESS;
    if (row?.progress_json) {
      try {
        progress = normalizeProgress(JSON.parse(row.progress_json)) || EMPTY_PROGRESS;
      } catch { progress = EMPTY_PROGRESS; }
    }
    return res.json({ progress, updatedAt: row?.updated_at || null });
  });
});

router.put('/progress', authenticateToken, (req, res) => {
  const progress = normalizeProgress(req.body?.progress);
  if (!progress) return res.status(400).json({ error: 'Invalid academy progress' });
  const json = JSON.stringify(progress);
  db.run(
    `INSERT INTO academy_progress (user_id, progress_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = CURRENT_TIMESTAMP`,
    [req.user.id, json],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      return res.json({ progress });
    },
  );
});

module.exports = router;
