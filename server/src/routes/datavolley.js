const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const { getSetups, saveSetups } = require('../setups');
const dvCode = require('../datavolleyCode');
const syncHub = require('../syncHub');
const { emitCollectionChanged } = require('../socket');
const { mountSyncRoutes } = require('./sync');

const router = express.Router();

// Partage à distance du codage DataVolley (actions).
mountSyncRoutes(router, syncHub.actions);

// Les codes « en cours de saisie » (préfixe valide, évaluation manquante) sont
// acceptés afin d'être corrigés ensuite dans l'onglet « Séquences ». Seules les
// saisies absurdes (vide, caractère inconnu, trop longues) sont refusées.
function isValidCode(code) {
  return dvCode.isDraftCode(code);
}

function verifyVideo(req, res, callback) {
  const { videoId } = req.params;
  db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id], (err, video) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    callback(video);
  });
}

// Liste des matchs terminés (pour l'écran d'accueil « Matchs finis »).
router.get('/finished', authenticateToken, (req, res) => {
  db.all(
    `SELECT v.id, v.display_name, v.original_name, v.team1_name, v.team2_name,
            m.status AS match_status, m.finished_at
       FROM volley_matches m
       JOIN videos v ON v.id = m.video_id
      WHERE m.status = 'finished' AND v.user_id = ?
      ORDER BY m.finished_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ matches: rows });
    }
  );
});

// Get all coded actions for a video
router.get('/:videoId/actions', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  db.all(
    'SELECT * FROM volley_actions WHERE video_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY action_index ASC',
    [videoId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ actions: rows });
    }
  );
});

// Replace all coded actions for a video (transaction)
router.post('/:videoId/actions', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { actions } = req.body;

  if (!actions || !Array.isArray(actions)) {
    return res.status(400).json({ error: 'Actions array is required' });
  }

  verifyVideo(req, res, (video) => {
    for (const a of actions) {
      if (!isValidCode(a.code)) {
        return res.status(400).json({ error: `Code invalide : "${a.code}"` });
      }
    }

    // Expand les formules combinées (a04SM.06# -> service + réception).
    const rows = [];
    for (const a of actions) {
      for (const code of dvCode.expandSequence(a.code)) {
        rows.push({ ...a, code });
      }
    }

    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(500).json({ error: 'Failed to start transaction' });

      db.run('DELETE FROM volley_actions WHERE video_id = ?', [videoId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to clear old actions' });
        }

        if (rows.length === 0) {
          db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: 'Failed to commit transaction' });
            return res.json({ message: 'Actions cleared successfully', count: 0 });
          });
          return;
        }

        const stmt = db.prepare(
          `INSERT INTO volley_actions
            (video_id, action_index, code, timecode, system_time, team, player_number, action, evaluation,
             type, start_zone, end_zone, end_subzone, set_number, note, attack_zone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        rows.forEach((a, i) => {
          const code = a.code;
          const parts = dvCode.decomposeCode(code);
          stmt.run(
            videoId,
            typeof a.action_index === 'number' ? a.action_index : i,
            code,
            a.timecode ?? null,
            a.system_time ?? null,
            a.team || parts.team,
            a.player_number ?? parts.player_number,
            a.action || parts.action,
            a.evaluation || parts.evaluation,
            parts.type || null,
            parts.start_zone || null,
            parts.end_zone || null,
            parts.end_subzone || null,
            a.set_number ?? null,
            a.note ?? null,
            a.attack_zone ?? parts.start_zone ?? null
          );
        });

        stmt.finalize((err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to save actions' });
          }
          db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: 'Failed to commit transaction' });
            syncHub.actions.syncNow({ reason: 'api' }).catch(() => {});
            emitCollectionChanged('actions');
            res.json({ message: 'Actions saved successfully', count: rows.length });
          });
        });
      });
    });
  });
});

// Remplace les actions d'UN SEUL set (codage collaboratif) : les autres sets
// restent intacts. Les actions retirées du set deviennent des pierres tombales
// (deleted = 1) pour être propagées au cloud, jamais effacées brutalement.
router.post('/:videoId/actions/set/:setNumber', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const setNumber = Number(req.params.setNumber);
  const { actions } = req.body;

  if (!Number.isInteger(setNumber) || setNumber <= 0) {
    return res.status(400).json({ error: 'Numéro de set invalide' });
  }
  if (!actions || !Array.isArray(actions)) {
    return res.status(400).json({ error: 'Actions array is required' });
  }

  verifyVideo(req, res, (video) => {
    for (const a of actions) {
      if (!isValidCode(a.code)) {
        return res.status(400).json({ error: `Code invalide : "${a.code}"` });
      }
    }

    const rows = [];
    for (const a of actions) {
      for (const code of dvCode.expandSequence(a.code)) {
        rows.push({ ...a, code });
      }
    }

    const now = new Date().toISOString();
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(500).json({ error: 'Failed to start transaction' });

      // Pierre tombale pour les actions existantes de ce set.
      db.run(
        'UPDATE volley_actions SET deleted = 1, dirty = 1, local_updated_at = ? WHERE video_id = ? AND COALESCE(set_number, 1) = ?',
        [now, videoId, setNumber],
        (err2) => {
          if (err2) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to clear old actions' });
          }

          if (rows.length === 0) {
            return db.run('COMMIT', (err3) => {
              if (err3) return res.status(500).json({ error: 'Failed to commit transaction' });
              syncHub.actions.syncNow({ reason: 'api' }).catch(() => {});
              emitCollectionChanged('actions');
              return res.json({ message: 'Actions du set effacées', count: 0 });
            });
          }

          const stmt = db.prepare(
            `INSERT INTO volley_actions
              (video_id, action_index, code, timecode, system_time, team, player_number, action, evaluation,
               type, start_zone, end_zone, end_subzone, set_number, note, attack_zone, deleted, dirty, local_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`
          );

          rows.forEach((a, i) => {
            const code = a.code;
            const parts = dvCode.decomposeCode(code);
            stmt.run(
              videoId,
              typeof a.action_index === 'number' ? a.action_index : i,
              code,
              a.timecode ?? null,
              a.system_time ?? null,
              a.team || parts.team,
              a.player_number ?? parts.player_number,
              a.action || parts.action,
              a.evaluation || parts.evaluation,
              parts.type || null,
              parts.start_zone || null,
              parts.end_zone || null,
              parts.end_subzone || null,
              a.set_number ?? setNumber,
              a.note ?? null,
              a.attack_zone ?? parts.start_zone ?? null,
              now
            );
          });

          stmt.finalize((err3) => {
            if (err3) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to save actions' });
            }
            db.run('COMMIT', (err4) => {
              if (err4) return res.status(500).json({ error: 'Failed to commit transaction' });
              syncHub.actions.syncNow({ reason: 'api' }).catch(() => {});
              emitCollectionChanged('actions');
              res.json({ message: 'Actions du set enregistrées', count: rows.length });
            });
          });
        }
      );
    });
  });
});

// Delete all coded actions for a video
router.delete('/:videoId/actions', authenticateToken, (req, res) => {
  verifyVideo(req, res, (video) => {
    db.run('DELETE FROM volley_actions WHERE video_id = ?', [req.params.videoId], function (err) {
      if (err) return res.status(500).json({ error: 'Failed to delete actions' });
      res.json({ message: 'Actions deleted successfully' });
    });
  });
});

// Get sync settings for a video (returns defaults if none yet)
router.get('/:videoId/sync', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  db.get('SELECT * FROM volley_sync WHERE video_id = ?', [videoId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) {
      return res.json({
        sync: {
          video_id: Number(videoId),
          sync_offset: 0,
          anchor_action_id: null,
          anchor_timecode: null,
          anchor_system_time: null,
          lead_in: 4,
          lead_out: 3,
        },
      });
    }
    res.json({ sync: row });
  });
});

// Save sync settings for a video (upsert)
router.put('/:videoId/sync', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { sync_offset, anchor_action_id, anchor_timecode, anchor_system_time, lead_in, lead_out } = req.body || {};

  verifyVideo(req, res, (video) => {
    db.run(
      `INSERT OR REPLACE INTO volley_sync
        (video_id, sync_offset, anchor_action_id, anchor_timecode, anchor_system_time, lead_in, lead_out)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        videoId,
        sync_offset ?? 0,
        anchor_action_id ?? null,
        anchor_timecode ?? null,
        anchor_system_time ?? null,
        lead_in ?? 4,
        lead_out ?? 3,
      ],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to save sync' });
        db.get('SELECT * FROM volley_sync WHERE video_id = ?', [videoId], (err, row) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          res.json({ sync: row });
        });
      }
    );
  });
});

// --- État du match (en cours / terminé) -------------------------------------

// Renvoie l'état du match (valeurs par défaut si aucun enregistrement n'existe).
router.get('/:videoId/match', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  db.get('SELECT * FROM volley_matches WHERE video_id = ?', [videoId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) {
      return res.json({ match: { video_id: Number(videoId), status: 'coding', finished_at: null } });
    }
    res.json({ match: row });
  });
});

// Marque le match comme terminé (le conserve en mémoire, en lecture seule).
router.post('/:videoId/finish', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  verifyVideo(req, res, () => {
    db.run(
      `INSERT INTO volley_matches (video_id, status, finished_at)
       VALUES (?, 'finished', CURRENT_TIMESTAMP)
       ON CONFLICT(video_id) DO UPDATE SET status = 'finished', finished_at = CURRENT_TIMESTAMP`,
      [videoId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to finish match' });
        db.get('SELECT * FROM volley_matches WHERE video_id = ?', [videoId], (err2, row) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({ match: row });
        });
      }
    );
  });
});

// Rouvre un match terminé pour reprendre le codage.
router.post('/:videoId/reopen', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  verifyVideo(req, res, () => {
    db.run(
      `INSERT INTO volley_matches (video_id, status, finished_at)
       VALUES (?, 'coding', NULL)
       ON CONFLICT(video_id) DO UPDATE SET status = 'coding', finished_at = NULL`,
      [videoId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to reopen match' });
        db.get('SELECT * FROM volley_matches WHERE video_id = ?', [videoId], (err2, row) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({ match: row });
        });
      }
    );
  });
});

// --- Équipes associées (domicile / extérieur) -------------------------------

router.get('/:videoId/teams', authenticateToken, (req, res) => {
  db.get(
    'SELECT home_team_id, away_team_id FROM volley_matches WHERE video_id = ?',
    [req.params.videoId],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ home_team_id: row?.home_team_id ?? null, away_team_id: row?.away_team_id ?? null });
    }
  );
});

router.put('/:videoId/teams', authenticateToken, (req, res) => {
  const { home_team_id, away_team_id } = req.body || {};
  verifyVideo(req, res, () => {
    db.run(
      `INSERT INTO volley_matches (video_id, home_team_id, away_team_id)
       VALUES (?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET home_team_id = ?, away_team_id = ?`,
      [req.params.videoId, home_team_id ?? null, away_team_id ?? null, home_team_id ?? null, away_team_id ?? null],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to save teams' });
        res.json({ home_team_id: home_team_id ?? null, away_team_id: away_team_id ?? null });
      }
    );
  });
});

// --- Positions de départ par set -------------------------------------------

router.get('/:videoId/setups', authenticateToken, (req, res) => {
  getSetups(`video:${req.params.videoId}`, (err, setups) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ setups });
  });
});

router.put('/:videoId/setups', authenticateToken, (req, res) => {
  const { setups } = req.body || {};
  verifyVideo(req, res, () => {
    saveSetups(`video:${req.params.videoId}`, setups, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to save setups' });
      res.json({ message: 'Setups saved' });
    });
  });
});

// --- Événements de match : temps morts et remplacements --------------------

const EVENT_KINDS = ['timeout', 'substitution', 'note'];
const EVENT_TEAMS = ['home', 'away'];

function safeParsePayload(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function withPayload(row) {
  return row ? { ...row, payload: safeParsePayload(row.payload) } : row;
}

router.get('/:videoId/events', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM volley_events
      WHERE video_id = ?
      ORDER BY COALESCE(set_number, 1) ASC, COALESCE(point_number, 0) ASC, id ASC`,
    [req.params.videoId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ events: (rows || []).map(withPayload) });
    }
  );
});

// Enregistre un temps mort ou un remplacement, situé au point (rallye) après
// lequel il survient. Le remplacement porte { out, in } dans `payload`.
router.post('/:videoId/events', authenticateToken, (req, res) => {
  const { kind, set_number, point_number, team, payload } = req.body || {};

  if (!EVENT_KINDS.includes(kind)) return res.status(400).json({ error: 'Type d’événement invalide' });
  if (team != null && team !== '' && !EVENT_TEAMS.includes(team)) {
    return res.status(400).json({ error: 'Équipe invalide' });
  }

  let cleanPayload = {};
  if (kind === 'substitution') {
    const out = Number(payload?.out);
    const inn = Number(payload?.in);
    if (!Number.isInteger(out) || out <= 0 || !Number.isInteger(inn) || inn <= 0) {
      return res.status(400).json({ error: 'Remplacement incomplet : joueur sortant et entrant requis.' });
    }
    if (out === inn) return res.status(400).json({ error: 'Le joueur entrant doit être différent du sortant.' });
    cleanPayload = { out, in: inn };
  } else if (kind === 'note') {
    // Code libre (façon DataVolley « >TEXTE ») : 5 caractères au maximum.
    const text = String(payload?.text || '').trim().slice(0, 5).toUpperCase();
    if (!text) return res.status(400).json({ error: 'Code libre vide.' });
    cleanPayload = { text };
  }

  const setNumber = Number(set_number) > 0 ? Number(set_number) : null;
  const pointNumber = Number.isFinite(Number(point_number)) ? Number(point_number) : null;

  verifyVideo(req, res, (video) => {
    db.run(
      `INSERT INTO volley_events (video_id, kind, set_number, point_number, team, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [video.id, kind, setNumber, pointNumber, team || null, JSON.stringify(cleanPayload)],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to save event' });
        db.get('SELECT * FROM volley_events WHERE id = ?', [this.lastID], (err2, row) => {
          if (err2 || !row) return res.status(500).json({ error: 'Database error' });
          res.json({ event: withPayload(row) });
        });
      }
    );
  });
});

router.delete('/:videoId/events/:eventId', authenticateToken, (req, res) => {
  verifyVideo(req, res, (video) => {
    db.run(
      'DELETE FROM volley_events WHERE id = ? AND video_id = ?',
      [req.params.eventId, video.id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to delete event' });
        res.json({ message: 'Event deleted', deleted: this.changes });
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Attribution de sets (codage collaboratif) — partagée via Supabase.
// ---------------------------------------------------------------------------

function getVideoSyncUuid(videoId, callback) {
  db.get('SELECT sync_uuid FROM videos WHERE id = ?', [videoId], (err, row) => {
    if (err) return callback(err);
    if (!row || !row.sync_uuid) return callback(new Error('Vidéo sans identifiant partagé'));
    callback(null, row.sync_uuid);
  });
}

// Liste des sets revendiqués pour une vidéo.
router.get('/:videoId/claims', authenticateToken, (req, res) => {
  getVideoSyncUuid(req.params.videoId, (err, videoUuid) => {
    if (err) return res.status(404).json({ error: err.message });
    db.all(
      'SELECT * FROM video_set_claims WHERE video_uuid = ? AND COALESCE(deleted, 0) = 0 ORDER BY set_number ASC',
      [videoUuid],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.json({ claims: rows || [] });
      }
    );
  });
});

// Revendique un set (ou le reprend s'il est déjà à soi).
router.post('/:videoId/claims', authenticateToken, (req, res) => {
  const setNumber = Number(req.body?.set_number);
  if (!Number.isInteger(setNumber) || setNumber <= 0) {
    return res.status(400).json({ error: 'Numéro de set invalide' });
  }
  getVideoSyncUuid(req.params.videoId, (err, videoUuid) => {
    if (err) return res.status(404).json({ error: err.message });
    const now = new Date().toISOString();
    const email = req.user.email || `user-${req.user.id}`;
    db.get(
      'SELECT * FROM video_set_claims WHERE video_uuid = ? AND set_number = ? AND COALESCE(deleted, 0) = 0',
      [videoUuid, setNumber],
      (err2, existing) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        if (existing && existing.claimed_by_email && existing.claimed_by_email !== email) {
          return res.status(409).json({ error: 'Ce set est déjà revendiqué par un autre statisticien', claimed_by: existing.claimed_by_name });
        }
        const sql = existing
          ? `UPDATE video_set_claims SET claimed_by_uuid = ?, claimed_by_name = ?, claimed_by_email = ?, claimed_at = ?, deleted = 0, dirty = 1, local_updated_at = ? WHERE id = ?`
          : `INSERT INTO video_set_claims (video_uuid, set_number, claimed_by_uuid, claimed_by_name, claimed_by_email, claimed_at, dirty, local_updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`;
        const params = existing
          ? [email, req.user.name, email, now, now, existing.id]
          : [videoUuid, setNumber, email, req.user.name, email, now, now];
        db.run(sql, params, function (err3) {
          if (err3) return res.status(500).json({ error: 'Database error' });
          syncHub.claims.syncNow({ reason: 'api' }).catch(() => {});
          emitCollectionChanged('claims');
          db.get('SELECT * FROM video_set_claims WHERE id = ?', [existing ? existing.id : this.lastID], (err4, claim) => {
            if (err4) return res.status(500).json({ error: 'Database error' });
            res.status(existing ? 200 : 201).json({ claim });
          });
        });
      }
    );
  });
});

// Libère un set (pierre tombale, propagée au cloud).
router.delete('/:videoId/claims/:setNumber', authenticateToken, (req, res) => {
  const setNumber = Number(req.params.setNumber);
  getVideoSyncUuid(req.params.videoId, (err, videoUuid) => {
    if (err) return res.status(404).json({ error: err.message });
    db.run(
      'UPDATE video_set_claims SET deleted = 1, dirty = 1, local_updated_at = ? WHERE video_uuid = ? AND set_number = ? AND COALESCE(deleted, 0) = 0',
      [new Date().toISOString(), videoUuid, setNumber],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Database error' });
        syncHub.claims.syncNow({ reason: 'api' }).catch(() => {});
        emitCollectionChanged('claims');
        res.json({ message: 'Set libéré', released: this.changes });
      }
    );
  });
});

module.exports = router;
