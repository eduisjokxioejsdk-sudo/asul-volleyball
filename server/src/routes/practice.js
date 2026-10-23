// ============================================================================
// ROUTES MODE ENTRAÎNEMENT (DataVolley 4 Pro — Point 13)
// Permet de scouter des séances d'entraînement et ateliers (Service/Réception,
// Attaque, Block/Défense, 6v6 libre) sans contrainte de rotation ni de score,
// avec suivi individuel par joueur sur une ou plusieurs séances.
// ============================================================================

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const dvCode = require('../datavolleyCode');

const router = express.Router();

// Liste toutes les séances d'entraînement
router.get('/sessions', authenticateToken, (req, res) => {
  db.all(
    `SELECT ps.*,
            ps.name AS title,
            (SELECT COUNT(*) FROM practice_actions pa WHERE pa.session_id = ps.id) AS action_count
       FROM practice_sessions ps
      WHERE ps.user_id = ?
      ORDER BY ps.session_date DESC, ps.created_at DESC, ps.id DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ sessions: rows || [] });
    }
  );
});

// Récupère une séance avec toutes ses actions codées
router.get('/sessions/:id', authenticateToken, (req, res) => {
  const sessionId = Number(req.params.id);
  db.get(
    'SELECT ps.*, ps.name AS title FROM practice_sessions ps WHERE ps.id = ? AND ps.user_id = ?',
    [sessionId, req.user.id],
    (err, session) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!session) return res.status(404).json({ error: 'Séance introuvable' });

      db.all(
        'SELECT * FROM practice_actions WHERE session_id = ? ORDER BY action_index ASC, id ASC',
        [sessionId],
        (err2, actions) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({ session, actions: actions || [] });
        }
      );
    }
  );
});

// Crée une nouvelle séance d'entraînement
router.post('/sessions', authenticateToken, (req, res) => {
  const { name, title, team_id, team_name, video_id, drill_type, notes, session_date } = req.body || {};
  const cleanName = String(name || title || '').trim();
  if (!cleanName) {
    return res.status(400).json({ error: 'Le nom de la séance est requis' });
  }

  const saveSession = (resolvedTeamName) => {
    db.run(
      `INSERT INTO practice_sessions (user_id, name, team_id, team_name, video_id, drill_type, notes, session_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        cleanName,
        team_id ? Number(team_id) : null,
        resolvedTeamName || (team_name ? String(team_name).trim() : null),
        video_id ? Number(video_id) : null,
        drill_type || 'all',
        notes ? String(notes).trim() : null,
        session_date || new Date().toISOString().slice(0, 10),
      ],
      function (err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.get('SELECT * FROM practice_sessions WHERE id = ?', [this.lastID], (err2, row) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.status(201).json({
            session: {
              ...row,
              title: row.name,
              action_count: 0,
            },
          });
        });
      }
    );
  };

  if (team_id && !team_name) {
    db.get('SELECT name FROM teams WHERE id = ?', [Number(team_id)], (tErr, tRow) => {
      saveSession(tRow ? tRow.name : null);
    });
  } else {
    saveSession(team_name ? String(team_name).trim() : null);
  }
});

// Enregistre les actions d'une séance d'entraînement
router.post('/sessions/:id/actions', authenticateToken, (req, res) => {
  const sessionId = Number(req.params.id);
  const { actions } = req.body || {};
  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'Actions array is required' });
  }

  db.get(
    'SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user.id],
    (err, session) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!session) return res.status(404).json({ error: 'Séance introuvable' });

      db.run('DELETE FROM practice_actions WHERE session_id = ?', [sessionId], (err2) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        if (actions.length === 0) {
          return res.json({ actions: [], count: 0 });
        }

        const stmt = db.prepare(
          `INSERT INTO practice_actions
            (session_id, action_index, code, timecode, player_number, action, evaluation,
             type, start_zone, end_zone, end_subzone, start_x, start_y, end_x, end_y, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        actions.forEach((a, idx) => {
          const code = String(a.code || '').trim();
          const parts = dvCode.decomposeCode(code);
          stmt.run(
            sessionId,
            typeof a.action_index === 'number' ? a.action_index : idx,
            code,
            a.timecode ?? null,
            a.player_number ?? parts.player_number ?? null,
            a.action || parts.action || null,
            a.evaluation || parts.evaluation || null,
            a.type || parts.type || null,
            a.start_zone ?? parts.start_zone ?? null,
            a.end_zone ?? parts.end_zone ?? null,
            a.end_subzone ?? parts.end_subzone ?? null,
            a.start_x ?? null,
            a.start_y ?? null,
            a.end_x ?? null,
            a.end_y ?? null,
            a.note ?? null
          );
        });
        stmt.finalize(() => {
          db.all(
            'SELECT * FROM practice_actions WHERE session_id = ? ORDER BY action_index ASC, id ASC',
            [sessionId],
            (err3, saved) => {
              if (err3) return res.status(500).json({ error: 'Database error' });
              res.json({ actions: saved || [], count: (saved || []).length });
            }
          );
        });
      });
    }
  );
});

// Cumul multi-séances d'entraînement (pour suivre l'évolution d'une équipe / d'un joueur)
router.post('/multi-session-data', authenticateToken, (req, res) => {
  const ids = (Array.isArray(req.body?.sessionIds) ? req.body.sessionIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return res.json({ sessions: [], actions: [] });

  const placeholders = ids.map(() => '?').join(',');
  db.all(
    `SELECT * FROM practice_sessions WHERE id IN (${placeholders}) AND user_id = ? ORDER BY created_at ASC`,
    [...ids, req.user.id],
    (err, sessions) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      db.all(
        `SELECT * FROM practice_actions WHERE session_id IN (${placeholders}) ORDER BY session_id ASC, action_index ASC`,
        ids,
        (err2, actions) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({ sessions: sessions || [], actions: actions || [] });
        }
      );
    }
  );
});

// Met à jour une séance (ex: association vidéo, notes, etc.)
router.put('/sessions/:id', authenticateToken, (req, res) => {
  const sessionId = Number(req.params.id);
  const { name, title, video_id, notes, session_date, team_id, team_name } = req.body || {};
  db.get(
    'SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user.id],
    (err, session) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!session) return res.status(404).json({ error: 'Séance introuvable' });

      const newName = name || title || session.name;
      const newVideoId = video_id !== undefined ? (video_id ? Number(video_id) : null) : session.video_id;
      const newNotes = notes !== undefined ? notes : session.notes;
      const newDate = session_date || session.session_date;
      const newTeamId = team_id !== undefined ? (team_id ? Number(team_id) : null) : session.team_id;
      const newTeamName = team_name !== undefined ? team_name : session.team_name;

      db.run(
        `UPDATE practice_sessions
            SET name = ?, video_id = ?, notes = ?, session_date = ?, team_id = ?, team_name = ?
          WHERE id = ? AND user_id = ?`,
        [newName, newVideoId, newNotes, newDate, newTeamId, newTeamName, sessionId, req.user.id],
        function (err2) {
          if (err2) return res.status(500).json({ error: 'Database error' });
          db.get('SELECT ps.*, ps.name AS title FROM practice_sessions ps WHERE ps.id = ?', [sessionId], (err3, updated) => {
            if (err3) return res.status(500).json({ error: 'Database error' });
            res.json({ session: updated });
          });
        }
      );
    }
  );
});

// Supprime une séance d'entraînement
router.delete('/sessions/:id', authenticateToken, (req, res) => {
  const sessionId = Number(req.params.id);
  db.run(
    'DELETE FROM practice_sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ message: 'Séance supprimée' });
    }
  );
});

module.exports = router;
