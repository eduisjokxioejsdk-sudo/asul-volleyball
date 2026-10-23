// ============================================================================
// ROUTES PLAYLISTS VIDÉO PERSISTANTES MULTI-MATCHS (DataVolley 4 Pro — Point 19)
// Permet de sauvegarder des sélections de clips provenant d'un ou plusieurs
// matchs, avec notes, marges lead_in / lead_out et réordonnancement.
// ============================================================================

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

const router = express.Router();

function loadPlaylistsForUser(userId, callback) {
  db.all(
    'SELECT * FROM dv_playlists WHERE user_id = ? ORDER BY updated_at DESC, id DESC',
    [userId],
    (err, playlists) => {
      if (err) return callback(err);
      if (!playlists || playlists.length === 0) return callback(null, []);

      const plIds = playlists.map((p) => p.id);
      const placeholders = plIds.map(() => '?').join(',');
      db.all(
        `SELECT pi.*, pi.code AS action_code, v.filename, v.filepath_proxy, v.display_name, v.original_name,
                COALESCE(v.display_name, v.original_name) AS video_title,
                COALESCE(pi.team1_name, v.team1_name) AS resolved_team1,
                COALESCE(pi.team2_name, v.team2_name) AS resolved_team2
           FROM dv_playlist_items pi
           LEFT JOIN videos v ON v.id = pi.video_id
          WHERE pi.playlist_id IN (${placeholders})
          ORDER BY pi.playlist_id ASC, pi.position ASC, pi.id ASC`,
        plIds,
        (err2, items) => {
          if (err2) return callback(err2);
          const byPl = new Map();
          for (const p of playlists) byPl.set(p.id, []);
          for (const it of items || []) {
            if (byPl.has(it.playlist_id)) byPl.get(it.playlist_id).push(it);
          }
          const enriched = playlists.map((p) => {
            const plItems = byPl.get(p.id) || [];
            return {
              ...p,
              item_count: plItems.length,
              items: plItems,
            };
          });
          callback(null, enriched);
        }
      );
    }
  );
}

// Liste toutes les playlists de l'utilisateur avec leurs clips
router.get('/', authenticateToken, (req, res) => {
  loadPlaylistsForUser(req.user.id, (err, playlists) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ playlists });
  });
});

// Crée une nouvelle playlist (avec clips initiaux optionnels)
router.post('/', authenticateToken, (req, res) => {
  const { name, description, items } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Le nom de la playlist est requis' });

  db.run(
    'INSERT INTO dv_playlists (user_id, name, description) VALUES (?, ?, ?)',
    [req.user.id, cleanName, description ? String(description).trim() : null],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      const playlistId = this.lastID;

      if (!Array.isArray(items) || items.length === 0) {
        return loadPlaylistsForUser(req.user.id, (err2, playlists) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.status(201).json({
            playlist: playlists.find((p) => p.id === playlistId),
            playlists,
          });
        });
      }

      const stmt = db.prepare(
        `INSERT INTO dv_playlist_items
          (playlist_id, video_id, action_id, code, team1_name, team2_name, set_number, timecode, lead_in, lead_out, note, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      items.forEach((it, idx) => {
        stmt.run(
          playlistId,
          Number(it.video_id),
          it.action_id ? Number(it.action_id) : null,
          it.code || it.action_code || null,
          it.team1_name || null,
          it.team2_name || null,
          Number(it.set_number) || 1,
          Number(it.timecode) || 0,
          Number(it.lead_in) || 3,
          Number(it.lead_out) || 4,
          it.note ? String(it.note).trim() : null,
          idx
        );
      });
      stmt.finalize(() => {
        loadPlaylistsForUser(req.user.id, (err2, playlists) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.status(201).json({
            playlist: playlists.find((p) => p.id === playlistId),
            playlists,
          });
        });
      });
    }
  );
});

// Ajoute un ou plusieurs clips à une playlist existante
router.post('/:id/items', authenticateToken, (req, res) => {
  const playlistId = Number(req.params.id);
  const incoming = Array.isArray(req.body?.items)
    ? req.body.items
    : req.body?.item
      ? [req.body.item]
      : [];

  if (incoming.length === 0) {
    return res.status(400).json({ error: 'Aucun clip à ajouter' });
  }

  db.get(
    'SELECT * FROM dv_playlists WHERE id = ? AND user_id = ?',
    [playlistId, req.user.id],
    (err, pl) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!pl) return res.status(404).json({ error: 'Playlist introuvable' });

      db.get(
        'SELECT COALESCE(MAX(position), -1) AS maxPos FROM dv_playlist_items WHERE playlist_id = ?',
        [playlistId],
        (err2, row) => {
          let nextPos = (row?.maxPos ?? -1) + 1;
          const stmt = db.prepare(
            `INSERT INTO dv_playlist_items
              (playlist_id, video_id, action_id, code, team1_name, team2_name, set_number, timecode, lead_in, lead_out, note, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          incoming.forEach((it) => {
            stmt.run(
              playlistId,
              Number(it.video_id),
              it.action_id ? Number(it.action_id) : null,
              it.code || it.action_code || null,
              it.team1_name || null,
              it.team2_name || null,
              Number(it.set_number) || 1,
              Number(it.timecode) || 0,
              Number(it.lead_in) || 3,
              Number(it.lead_out) || 4,
              it.note ? String(it.note).trim() : null,
              nextPos++
            );
          });
          stmt.finalize(() => {
            db.run('UPDATE dv_playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId], () => {
              loadPlaylistsForUser(req.user.id, (err3, playlists) => {
                if (err3) return res.status(500).json({ error: 'Database error' });
                res.json({
                  playlist: playlists.find((p) => p.id === playlistId),
                  playlists,
                });
              });
            });
          });
        }
      );
    }
  );
});

// Met à jour une playlist (nom, description ou ordre/notes des items)
router.put('/:id', authenticateToken, (req, res) => {
  const playlistId = Number(req.params.id);
  const { name, description, items } = req.body || {};

  db.get(
    'SELECT * FROM dv_playlists WHERE id = ? AND user_id = ?',
    [playlistId, req.user.id],
    (err, pl) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!pl) return res.status(404).json({ error: 'Playlist introuvable' });

      const newName = name != null ? String(name).trim() || pl.name : pl.name;
      const newDesc = description !== undefined ? description : pl.description;

      db.run(
        'UPDATE dv_playlists SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newName, newDesc, playlistId],
        (err2) => {
          if (err2) return res.status(500).json({ error: 'Database error' });

          if (!Array.isArray(items)) {
            return loadPlaylistsForUser(req.user.id, (err3, playlists) => {
              if (err3) return res.status(500).json({ error: 'Database error' });
              res.json({
                playlist: playlists.find((p) => p.id === playlistId),
                playlists,
              });
            });
          }

          db.run('DELETE FROM dv_playlist_items WHERE playlist_id = ?', [playlistId], (err3) => {
            if (err3) return res.status(500).json({ error: 'Database error' });
            if (items.length === 0) {
              return loadPlaylistsForUser(req.user.id, (err4, playlists) => {
                if (err4) return res.status(500).json({ error: 'Database error' });
                res.json({
                  playlist: playlists.find((p) => p.id === playlistId),
                  playlists,
                });
              });
            }
            const stmt = db.prepare(
              `INSERT INTO dv_playlist_items
                (playlist_id, video_id, action_id, code, team1_name, team2_name, set_number, timecode, lead_in, lead_out, note, position)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            items.forEach((it, idx) => {
              stmt.run(
                playlistId,
                Number(it.video_id),
                it.action_id ? Number(it.action_id) : null,
                it.code || it.action_code || null,
                it.team1_name || null,
                it.team2_name || null,
                Number(it.set_number) || 1,
                Number(it.timecode) || 0,
                Number(it.lead_in) || 3,
                Number(it.lead_out) || 4,
                it.note ? String(it.note).trim() : null,
                idx
              );
            });
            stmt.finalize(() => {
              loadPlaylistsForUser(req.user.id, (err4, playlists) => {
                if (err4) return res.status(500).json({ error: 'Database error' });
                res.json({
                  playlist: playlists.find((p) => p.id === playlistId),
                  playlists,
                });
              });
            });
          });
        }
      );
    }
  );
});

// Supprime un clip d'une playlist
router.delete('/:id/items/:itemId', authenticateToken, (req, res) => {
  const playlistId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  db.run(
    'DELETE FROM dv_playlist_items WHERE id = ? AND playlist_id = ?',
    [itemId, playlistId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      loadPlaylistsForUser(req.user.id, (err2, playlists) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.json({
          playlist: playlists.find((p) => p.id === playlistId),
          playlists,
        });
      });
    }
  );
});

// Supprime une playlist complète
router.delete('/:id', authenticateToken, (req, res) => {
  const playlistId = Number(req.params.id);
  db.run(
    'DELETE FROM dv_playlists WHERE id = ? AND user_id = ?',
    [playlistId, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      loadPlaylistsForUser(req.user.id, (err2, playlists) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.json({ playlists });
      });
    }
  );
});

module.exports = router;
