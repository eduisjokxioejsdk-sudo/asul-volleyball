const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const { DEFAULT_CLUB_ID } = require('../clubs');
const { getSetups, saveSetups } = require('../setups');
const dvCode = require('../datavolleyCode');
const syncHub = require('../syncHub');
const { emitCollectionChanged } = require('../socket');
const { mountSyncRoutes } = require('./sync');

const router = express.Router();

// Partage à distance du codage DataVolley (actions).
mountSyncRoutes(router, syncHub.actions);

function isValidCode(code) {
  return dvCode.isDraftCode(code);
}

function verifyVideo(req, res, callback) {
  const { videoId } = req.params;
  db.get(
    'SELECT * FROM videos WHERE id = ? AND club_id = ? AND COALESCE(deleted, 0) = 0',
    [videoId, req.clubId],
    (err, video) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!video) return res.status(404).json({ error: 'Video not found' });
      callback(video);
    }
  );
}

function touchMatchForSync(videoId, clubId, callback) {
  const now = new Date().toISOString();
  const newUuid = crypto.randomUUID();
  db.run(
    `INSERT INTO volley_matches (video_id, sync_uuid, status, deleted, dirty, local_updated_at)
     VALUES (?, ?, 'coding', 0, 1, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       sync_uuid = COALESCE(volley_matches.sync_uuid, excluded.sync_uuid),
       dirty = 1,
       local_updated_at = excluded.local_updated_at`,
    [videoId, newUuid, now],
    (err) => {
      if (clubId === DEFAULT_CLUB_ID) {
        syncHub.matches.syncNow({ reason: 'api' }).catch(() => {});
      }
      emitCollectionChanged('matches');
      if (callback) callback(err);
    }
  );
}

const AUDIT_FIELDS = [
  'code', 'timecode', 'system_time', 'team', 'player_number', 'action', 'evaluation',
  'type', 'start_zone', 'end_zone', 'start_subzone', 'end_subzone', 'set_number', 'note',
  'attack_zone', 'start_x', 'start_y', 'mid_x', 'mid_y', 'end_x', 'end_y',
];

function actionAuditSnapshot(action) {
  const snapshot = {};
  for (const key of AUDIT_FIELDS) snapshot[key] = action?.[key] ?? null;
  return snapshot;
}

function insertActionAudit(videoId, before, after, user) {
  const keyFor = (action, index) => action?.sync_uuid || `row:${action?.action_index ?? index}:${action?.timecode ?? ''}:${index}`;
  const oldMap = new Map((before || []).map((a, i) => [keyFor(a, i), a]));
  const newMap = new Map((after || []).map((a, i) => [keyFor(a, i), a]));
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const changes = [];
  for (const key of keys) {
    const oldAction = oldMap.get(key);
    const newAction = newMap.get(key);
    const oldSnapshot = oldAction ? actionAuditSnapshot(oldAction) : null;
    const newSnapshot = newAction ? actionAuditSnapshot(newAction) : null;
    if (JSON.stringify(oldSnapshot) === JSON.stringify(newSnapshot)) continue;
    changes.push([
      videoId,
      newAction?.sync_uuid || oldAction?.sync_uuid || null,
      newAction?.action_index ?? oldAction?.action_index ?? null,
      !oldAction ? 'created' : !newAction ? 'deleted' : 'updated',
      oldSnapshot ? JSON.stringify(oldSnapshot) : null,
      newSnapshot ? JSON.stringify(newSnapshot) : null,
      user?.id ?? null,
      user?.name || user?.email || 'Utilisateur',
    ]);
  }
  if (!changes.length) return;
  const stmt = db.prepare(
    `INSERT INTO volley_action_audit
      (video_id, action_uuid, action_index, operation, before_json, after_json, user_id, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const change of changes) {
    // Une erreur d'écriture du journal ne doit jamais casser la sauvegarde,
    // mais elle ne doit pas non plus passer inaperçue.
    stmt.run(change, (err) => {
      if (err) console.warn('Journal des actions non écrit :', err.message);
    });
  }
  stmt.finalize();
}

// ---------------------------------------------------------------------------
// Sauvegarde des actions : MISE À JOUR par sync_uuid (jamais de perte)
// ---------------------------------------------------------------------------
// L'ancienne version marquait TOUTES les actions existantes comme supprimées
// puis les réinsérait. Or `sync_uuid` porte un index UNIQUE : dès qu'une action
// avait déjà son identifiant (après un rechargement de page — cas normal), chaque
// INSERT échouait silencieusement, la transaction validait quand même et le
// match devenait VIDE tout en répondant « succès ».
// On met donc à jour les lignes existantes et on n'insère que les nouvelles :
//   • liste vide refusée si le match contient déjà des actions ;
//   • instantané de secours avant chaque remplacement ;
//   • toute erreur SQL annule la transaction et remonte au client.
// ---------------------------------------------------------------------------

const ACTION_DATA_COLUMNS = [
  'action_index', 'code', 'timecode', 'system_time', 'team', 'player_number', 'action',
  'evaluation', 'type', 'start_zone', 'end_zone', 'start_subzone', 'end_subzone',
  'set_number', 'note', 'attack_zone', 'start_x', 'start_y', 'mid_x', 'mid_y', 'end_x',
  'end_y', 'is_auto',
];

const dbRunAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const dbAllAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

/** Valeurs d'une action dans l'ordre de ACTION_DATA_COLUMNS. */
function actionDataValues(action, fallbackSetNumber = null) {
  const parts = dvCode.decomposeCode(action.code);
  return [
    typeof action.action_index === 'number' ? action.action_index : 0,
    action.code,
    action.timecode ?? null,
    action.system_time ?? null,
    action.team || parts.team,
    action.player_number ?? parts.player_number,
    action.action || parts.action,
    action.evaluation || parts.evaluation,
    parts.type || null,
    action.start_zone ?? parts.start_zone ?? null,
    action.end_zone ?? parts.end_zone ?? null,
    action.start_subzone ?? parts.start_subzone ?? null,
    action.end_subzone ?? parts.end_subzone ?? null,
    action.set_number ?? fallbackSetNumber ?? null,
    action.note ?? null,
    action.attack_zone ?? parts.start_zone ?? null,
    action.start_x ?? null,
    action.start_y ?? null,
    action.mid_x ?? null,
    action.mid_y ?? null,
    action.end_x ?? null,
    action.end_y ?? null,
    action.is_auto ? 1 : 0,
  ];
}

/** Instantané de secours du codage (50 derniers par match). */
function backupActions(videoId, rows, reason, user) {
  return new Promise((resolve) => {
    if (!rows || rows.length === 0) return resolve();
    const payload = JSON.stringify(rows);
    db.run(
      `INSERT INTO volley_action_backups (video_id, reason, action_count, payload, actor_name)
       VALUES (?, ?, ?, ?, ?)`,
      [videoId, reason || 'save', rows.length, payload, user?.name || user?.email || 'Utilisateur'],
      () => {
        db.run(
          `DELETE FROM volley_action_backups
            WHERE video_id = ? AND id NOT IN (
              SELECT id FROM volley_action_backups WHERE video_id = ? ORDER BY id DESC LIMIT 50)`,
          [videoId, videoId],
          () => resolve()
        );
      }
    );
  });
}

function actionSaveError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Remplace les actions d'un match (ou d'un seul set) sans jamais perdre de
 * travail. Renvoie la liste réellement enregistrée (avec son sync_uuid).
 */
async function replaceActions({
  videoId,
  setNumber = null,
  actions,
  user,
  clubId = DEFAULT_CLUB_ID,
  allowEmpty = false,
  reason = 'save',
}) {
  const payloadRows = [];
  for (const action of actions) {
    for (const code of dvCode.expandSequence(action.code)) payloadRows.push({ ...action, code });
  }

  const scope =
    setNumber == null
      ? { sql: 'video_id = ?', params: [videoId] }
      : { sql: 'video_id = ? AND COALESCE(set_number, 1) = ?', params: [videoId, setNumber] };

  const oldRows = await dbAllAsync(
    `SELECT * FROM volley_actions WHERE ${scope.sql} AND COALESCE(deleted, 0) = 0
      ORDER BY action_index ASC, id ASC`,
    scope.params
  );

  // Garde-fou : une liste vide ne doit jamais effacer un match déjà codé.
  if (payloadRows.length === 0 && oldRows.length > 0 && !allowEmpty) {
    throw actionSaveError(
      `Sauvegarde refusée : aucune action reçue alors que ${oldRows.length} action(s) ` +
        'sont déjà enregistrées. Utilisez « Supprimer le codage » pour effacer volontairement.',
      409
    );
  }

  // Second garde-fou : un envoi qui ne référence AUCUNE action existante
  // (aucun sync_uuid connu) et qui est plus court que le match enregistré part
  // d'un état périmé (page restée sur un match vide, autre onglet…). On refuse
  // au lieu de remplacer les actions déjà codées par ce seul envoi partiel.
  const payloadHasKnownAction = payloadRows.some(
    (row) => typeof row.sync_uuid === 'string' && row.sync_uuid.length >= 8
  );
  if (
    payloadRows.length > 0 &&
    oldRows.length >= 5 &&
    payloadRows.length < oldRows.length &&
    !payloadHasKnownAction &&
    !allowEmpty
  ) {
    throw actionSaveError(
      `Sauvegarde refusée : l'envoi ne contient aucune des ${oldRows.length} action(s) déjà ` +
        'enregistrées. Rechargez le match avant de continuer.',
      409
    );
  }

  const now = new Date().toISOString();

  // Toutes les lignes du match (y compris les pierres tombales) : un sync_uuid
  // existant doit être mis à jour, jamais réinséré (index UNIQUE).
  const allRows = await dbAllAsync(
    'SELECT id, video_id, sync_uuid, action_index, code, set_number, deleted FROM volley_actions WHERE video_id = ?',
    [videoId]
  );
  const byUuid = new Map();
  for (const row of allRows) {
    if (row.sync_uuid) byUuid.set(String(row.sync_uuid), row);
  }
  // Correspondance de secours pour les clients qui n'envoient pas de sync_uuid :
  // même position + même code = même action.
  const byKey = new Map();
  for (const row of oldRows) {
    byKey.set(`${row.action_index}|${row.code}|${row.set_number ?? ''}`, row);
  }

  const usedUuids = new Set();
  const planned = [];
  for (const row of payloadRows) {
    let uuid =
      typeof row.sync_uuid === 'string' && row.sync_uuid.length >= 8 ? row.sync_uuid : null;
    let existing = uuid ? byUuid.get(uuid) : null;
    if (existing && Number(existing.video_id) !== Number(videoId)) existing = null;
    if (!existing) {
      const key = `${row.action_index}|${row.code}|${row.set_number ?? (setNumber ?? '')}`;
      const candidate = byKey.get(key);
      if (candidate && candidate.sync_uuid && !usedUuids.has(String(candidate.sync_uuid))) {
        existing = candidate;
        uuid = String(candidate.sync_uuid);
      }
    }
    if (!uuid || usedUuids.has(uuid)) uuid = crypto.randomUUID();
    usedUuids.add(uuid);
    planned.push({ row, uuid, existingId: existing ? existing.id : null });
  }

  await backupActions(videoId, oldRows, reason, user);

  await dbRunAsync('BEGIN TRANSACTION');
  try {
    // 1) Les actions du périmètre absentes de l'envoi deviennent des pierres
    //    tombales (propagées au cloud), jamais des suppressions brutales.
    await dbRunAsync(
      `UPDATE volley_actions SET deleted = 1, dirty = 1, local_updated_at = ?
        WHERE ${scope.sql} AND COALESCE(deleted, 0) = 0`,
      [now, ...scope.params]
    );

    // 2) Mise à jour des actions déjà connues, insertion des nouvelles.
    const assignments = ACTION_DATA_COLUMNS.map((column) => `${column} = ?`).join(', ');
    for (const { row, uuid, existingId } of planned) {
      const values = actionDataValues(row, setNumber);
      if (existingId) {
        await dbRunAsync(
          `UPDATE volley_actions SET sync_uuid = ?, ${assignments}, deleted = 0, dirty = 1, local_updated_at = ?
            WHERE id = ?`,
          [uuid, ...values, now, existingId]
        );
      } else {
        await dbRunAsync(
          `INSERT INTO volley_actions
            (video_id, ${ACTION_DATA_COLUMNS.join(', ')}, deleted, dirty, local_updated_at, sync_uuid)
           VALUES (?, ${ACTION_DATA_COLUMNS.map(() => '?').join(', ')}, 0, 1, ?, ?)`,
          [videoId, ...values, now, uuid]
        );
      }
    }
    await dbRunAsync('COMMIT');
  } catch (err) {
    await dbRunAsync('ROLLBACK').catch(() => {});
    throw err;
  }

  const saved = planned.map(({ row, uuid }) => ({ ...row, sync_uuid: uuid }));
  if (clubId === DEFAULT_CLUB_ID) {
    syncHub.actions.syncNow({ reason: 'api' }).catch(() => {});
  }
  insertActionAudit(videoId, oldRows, saved, user);
  emitCollectionChanged('actions');
  return { actions: saved, count: saved.length };
}

// Liste des matchs terminés du club actif.
router.get('/finished', authenticateToken, (req, res) => {
  db.all(
    `SELECT v.id, v.display_name, v.original_name, v.youtube_url, v.team1_name, v.team2_name,
            m.status AS match_status, m.finished_at
       FROM volley_matches m
       JOIN videos v ON v.id = m.video_id
      WHERE v.club_id = ?
        AND m.status = 'finished'
        AND COALESCE(v.deleted, 0) = 0
        AND COALESCE(m.deleted, 0) = 0
      ORDER BY m.finished_at DESC`,
    [req.clubId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ matches: rows || [] });
    }
  );
});

// Get all coded actions for a video
router.get('/:videoId/actions', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    const { videoId } = req.params;
    db.all(
      'SELECT * FROM volley_actions WHERE video_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY action_index ASC',
      [videoId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ actions: rows || [] });
      }
    );
  });
});

router.get('/:videoId/audit', authenticateToken, (req, res) => {
  const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
  verifyVideo(req, res, () => {
    db.all(
      `SELECT id, action_uuid, action_index, operation, before_json, after_json,
              user_id, actor_name, created_at
         FROM volley_action_audit WHERE video_id = ? ORDER BY id DESC LIMIT ?`,
      [req.params.videoId, limit],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ entries: (rows || []).map((row) => ({
          ...row,
          before: row.before_json ? JSON.parse(row.before_json) : null,
          after: row.after_json ? JSON.parse(row.after_json) : null,
        })) });
      }
    );
  });
});

// Remplace toutes les actions codées d'un match (transaction, sans perte).
router.post('/:videoId/actions', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { actions } = req.body || {};

  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'Actions array is required' });
  }
  for (const action of actions) {
    if (!isValidCode(action.code)) {
      return res.status(400).json({ error: `Code invalide : "${action.code}"` });
    }
  }

  verifyVideo(req, res, async () => {
    try {
      const result = await replaceActions({
        videoId,
        actions,
        user: req.user,
        allowEmpty: req.body?.allowEmpty === true,
        reason: 'replace-all',
        clubId: req.clubId,
      });
      return res.json({
        message: 'Actions saved successfully',
        count: result.count,
        actions: result.actions,
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('Échec de la sauvegarde des actions :', err);
      return res.status(500).json({ error: `Sauvegarde des actions impossible : ${err.message}` });
    }
  });
});

// Remplace les actions d'UN SEUL set (codage collaboratif).
router.post('/:videoId/actions/set/:setNumber', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const setNumber = Number(req.params.setNumber);
  const { actions } = req.body || {};

  if (!Number.isInteger(setNumber) || setNumber <= 0) {
    return res.status(400).json({ error: 'Numéro de set invalide' });
  }
  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'Actions array is required' });
  }
  for (const action of actions) {
    if (!isValidCode(action.code)) {
      return res.status(400).json({ error: `Code invalide : "${action.code}"` });
    }
  }

  // Seules les actions du set revendiqué sont remplacées : les autres sets
  // restent strictement intacts.
  const scoped = actions
    .filter((action) => action.set_number == null || Number(action.set_number) === setNumber)
    .map((action) => ({ ...action, set_number: setNumber }));

  verifyVideo(req, res, async () => {
    try {
      const result = await replaceActions({
        videoId,
        setNumber,
        actions: scoped,
        user: req.user,
        allowEmpty: req.body?.allowEmpty === true,
        reason: `replace-set-${setNumber}`,
        clubId: req.clubId,
      });
      return res.json({
        message: 'Actions du set enregistrées',
        count: result.count,
        actions: result.actions,
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error(`Échec de la sauvegarde des actions du set ${setNumber} :`, err);
      return res.status(500).json({ error: `Sauvegarde des actions impossible : ${err.message}` });
    }
  });
});

// Sauvegardes de secours du codage : liste et restauration.
router.get('/:videoId/actions/backups', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    db.all(
      `SELECT id, video_id, reason, action_count, actor_name, created_at
         FROM volley_action_backups WHERE video_id = ? ORDER BY id DESC LIMIT 50`,
      [req.params.videoId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ backups: rows || [] });
      }
    );
  });
});

router.post('/:videoId/actions/restore/:backupId', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    db.get(
      'SELECT * FROM volley_action_backups WHERE id = ? AND video_id = ?',
      [req.params.backupId, req.params.videoId],
      async (err, backup) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!backup) return res.status(404).json({ error: 'Sauvegarde introuvable' });
        let actions = null;
        try {
          actions = JSON.parse(backup.payload);
        } catch {
          actions = null;
        }
        if (!Array.isArray(actions)) {
          return res.status(400).json({ error: 'Sauvegarde illisible' });
        }
        try {
          const result = await replaceActions({
            videoId: req.params.videoId,
            actions,
            user: req.user,
            allowEmpty: true,
            reason: `restore-${backup.id}`,
            clubId: req.clubId,
          });
          return res.json({
            message: 'Sauvegarde restaurée',
            count: result.count,
            actions: result.actions,
          });
        } catch (restoreErr) {
          console.error('Restauration des actions impossible :', restoreErr);
          return res.status(500).json({ error: 'Restauration impossible' });
        }
      }
    );
  });
});

// Delete all coded actions for a video (pierre tombale propagée au Cloud)
router.delete('/:videoId/actions', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    const now = new Date().toISOString();
    db.all(
      'SELECT * FROM volley_actions WHERE video_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY action_index ASC, id ASC',
      [req.params.videoId],
      (readErr, oldRows) => {
        if (readErr) return res.status(500).json({ error: 'Database error' });
        // Même une suppression volontaire laisse une sauvegarde récupérable.
        backupActions(req.params.videoId, oldRows, 'delete-all', req.user).then(() => {
          db.run(
            'UPDATE volley_actions SET deleted = 1, dirty = 1, local_updated_at = ? WHERE video_id = ?',
            [now, req.params.videoId],
            function (err) {
              if (err) return res.status(500).json({ error: 'Failed to delete actions' });
              insertActionAudit(req.params.videoId, oldRows, [], req.user);
              if (req.clubId === DEFAULT_CLUB_ID) syncHub.actions.syncNow({ reason: 'api' }).catch(() => {});
              emitCollectionChanged('actions');
              res.json({ message: 'Actions deleted successfully' });
            }
          );
        });
      }
    );
  });
});

function parseSetOffsets(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Get sync settings for a video (returns defaults if none yet)
router.get('/:videoId/sync', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    const { videoId } = req.params;
    db.get('SELECT * FROM volley_sync WHERE video_id = ?', [videoId], (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) {
        return res.json({
          sync: {
            video_id: Number(videoId),
            sync_offset: 0,
            set_offsets: {},
            anchor_action_id: null,
            anchor_timecode: null,
            anchor_system_time: null,
            lead_in: 4,
            lead_out: 3,
          },
        });
      }
      res.json({
        sync: {
          ...row,
          set_offsets: parseSetOffsets(row.set_offsets),
        },
      });
    });
  });
});

// Save sync settings for a video (upsert + propagation Cloud via matchesCollection)
router.put('/:videoId/sync', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { sync_offset, set_offsets, anchor_action_id, anchor_timecode, anchor_system_time, lead_in, lead_out } = req.body || {};
  const setOffsetsJson = JSON.stringify(parseSetOffsets(set_offsets));

  verifyVideo(req, res, () => {
    db.run(
      `INSERT OR REPLACE INTO volley_sync
        (video_id, sync_offset, set_offsets, anchor_action_id, anchor_timecode, anchor_system_time, lead_in, lead_out)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        videoId,
        sync_offset ?? 0,
        setOffsetsJson,
        anchor_action_id ?? null,
        anchor_timecode ?? null,
        anchor_system_time ?? null,
        lead_in ?? 4,
        lead_out ?? 3,
      ],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to save sync' });
        touchMatchForSync(videoId, req.clubId);
        db.get('SELECT * FROM volley_sync WHERE video_id = ?', [videoId], (err2, row) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({
            sync: {
              ...row,
              set_offsets: parseSetOffsets(row?.set_offsets),
            },
          });
        });
      }
    );
  });
});

// --- État du match (en cours / terminé) -------------------------------------

router.get('/:videoId/match', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    const { videoId } = req.params;
    db.get('SELECT * FROM volley_matches WHERE video_id = ?', [videoId], (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) {
        return res.json({ match: { video_id: Number(videoId), status: 'coding', finished_at: null } });
      }
      res.json({ match: row });
    });
  });
});

// Marque le match comme terminé (et propage au Cloud).
router.post('/:videoId/finish', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const now = new Date().toISOString();
  const newUuid = crypto.randomUUID();
  verifyVideo(req, res, () => {
    db.run(
      `INSERT INTO volley_matches (video_id, sync_uuid, status, finished_at, deleted, dirty, local_updated_at)
       VALUES (?, ?, 'finished', ?, 0, 1, ?)
       ON CONFLICT(video_id) DO UPDATE SET
         sync_uuid = COALESCE(volley_matches.sync_uuid, excluded.sync_uuid),
         status = 'finished',
         finished_at = excluded.finished_at,
         deleted = 0,
         dirty = 1,
         local_updated_at = excluded.local_updated_at`,
      [videoId, newUuid, now, now],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to finish match' });
        if (req.clubId === DEFAULT_CLUB_ID) {
          syncHub.matches.syncNow({ reason: 'api' }).catch(() => {});
        }
        emitCollectionChanged('matches');
        db.get('SELECT * FROM volley_matches WHERE video_id = ?', [videoId], (err2, row) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({ match: row });
        });
      }
    );
  });
});

// Rouvre un match terminé pour reprendre le codage (et propage au Cloud).
router.post('/:videoId/reopen', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const now = new Date().toISOString();
  const newUuid = crypto.randomUUID();
  verifyVideo(req, res, () => {
    db.run(
      `INSERT INTO volley_matches (video_id, sync_uuid, status, finished_at, deleted, dirty, local_updated_at)
       VALUES (?, ?, 'coding', NULL, 0, 1, ?)
       ON CONFLICT(video_id) DO UPDATE SET
         sync_uuid = COALESCE(volley_matches.sync_uuid, excluded.sync_uuid),
         status = 'coding',
         finished_at = NULL,
         deleted = 0,
         dirty = 1,
         local_updated_at = excluded.local_updated_at`,
      [videoId, newUuid, now],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to reopen match' });
        if (req.clubId === DEFAULT_CLUB_ID) {
          syncHub.matches.syncNow({ reason: 'api' }).catch(() => {});
        }
        emitCollectionChanged('matches');
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
  verifyVideo(req, res, () => {
    db.get(
      `SELECT COALESCE(m.home_team_id, v.home_team_id) AS home_team_id,
              COALESCE(m.away_team_id, v.away_team_id) AS away_team_id
         FROM videos v
         LEFT JOIN volley_matches m ON m.video_id = v.id
        WHERE v.id = ? AND v.club_id = ?`,
      [req.params.videoId, req.clubId],
      (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ home_team_id: row?.home_team_id ?? null, away_team_id: row?.away_team_id ?? null });
      }
    );
  });
});

router.put('/:videoId/teams', authenticateToken, (req, res) => {
  const { home_team_id, away_team_id } = req.body || {};
  const homeId = home_team_id ? Number(home_team_id) : null;
  const awayId = away_team_id ? Number(away_team_id) : null;

  verifyVideo(req, res, (video) => {
    const teamIds = [homeId, awayId].filter(Boolean);
    const resolveTeams = (cb) => {
      if (!teamIds.length) return cb(null, null, null, null);
      db.all(
        `SELECT id, sync_uuid, name FROM teams WHERE id IN (${teamIds.map(() => '?').join(', ')}) AND club_id = ?`,
        [...teamIds, req.clubId],
        (tErr, tRows) => {
          if (tErr) return cb(null, null, null, null);
          const map = new Map((tRows || []).map((r) => [Number(r.id), r]));
          const validHome = homeId && map.has(homeId) ? map.get(homeId) : null;
          const validAway = awayId && map.has(awayId) ? map.get(awayId) : null;
          cb(validHome ? homeId : null, validAway ? awayId : null, validHome, validAway);
        }
      );
    };

    resolveTeams((validHomeId, validAwayId, homeTeam, awayTeam) => {
      const now = new Date().toISOString();
      const newUuid = crypto.randomUUID();
      const homeUuid = homeTeam?.sync_uuid || null;
      const awayUuid = awayTeam?.sync_uuid || null;

      db.run(
        `INSERT INTO volley_matches
          (video_id, sync_uuid, home_team_id, away_team_id, home_team_uuid, away_team_uuid, deleted, dirty, local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
         ON CONFLICT(video_id) DO UPDATE SET
           sync_uuid = COALESCE(volley_matches.sync_uuid, excluded.sync_uuid),
           home_team_id = excluded.home_team_id,
           away_team_id = excluded.away_team_id,
           home_team_uuid = excluded.home_team_uuid,
           away_team_uuid = excluded.away_team_uuid,
           dirty = 1,
           local_updated_at = excluded.local_updated_at`,
        [video.id, newUuid, validHomeId, validAwayId, homeUuid, awayUuid, now],
        function (err) {
          if (err) return res.status(500).json({ error: 'Failed to save teams' });
          db.run(
            `UPDATE videos
                SET home_team_id = ?, away_team_id = ?, home_team_uuid = ?, away_team_uuid = ?,
                    team1_name = COALESCE(?, team1_name), team2_name = COALESCE(?, team2_name),
                    dirty = 1, local_updated_at = ?
              WHERE id = ?`,
            [validHomeId, validAwayId, homeUuid, awayUuid, homeTeam?.name || null, awayTeam?.name || null, now, video.id],
            () => {
              if (req.clubId === DEFAULT_CLUB_ID) {
                syncHub.matches.syncNow({ reason: 'api' }).catch(() => {});
                syncHub.videos.syncNow({ reason: 'api' }).catch(() => {});
              }
              emitCollectionChanged('matches');
              emitCollectionChanged('videos');
            }
          );
          res.json({ home_team_id: validHomeId, away_team_id: validAwayId });
        }
      );
    });
  });
});

// --- Positions de départ par set -------------------------------------------

router.get('/:videoId/setups', authenticateToken, (req, res) => {
  verifyVideo(req, res, () => {
    getSetups(`video:${req.params.videoId}`, (err, setups) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ setups });
    });
  });
});

router.put('/:videoId/setups', authenticateToken, (req, res) => {
  const { setups } = req.body || {};
  verifyVideo(req, res, () => {
    saveSetups(`video:${req.params.videoId}`, setups, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to save setups' });
      if (req.clubId === DEFAULT_CLUB_ID) {
        syncHub.setups.syncNow({ reason: 'api' }).catch(() => {});
      }
      emitCollectionChanged('setups');
      res.json({ message: 'Setups saved' });
    });
  });
});

// --- Événements de match : temps morts et remplacements --------------------

const EVENT_KINDS = ['timeout', 'substitution', 'note', 'sanction', 'challenge', 'delay', 'point_adjust'];
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
  verifyVideo(req, res, () => {
    db.all(
      `SELECT * FROM volley_events
        WHERE video_id = ? AND COALESCE(deleted, 0) = 0
        ORDER BY COALESCE(set_number, 1) ASC, COALESCE(point_number, 0) ASC, id ASC`,
      [req.params.videoId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ events: (rows || []).map(withPayload) });
      }
    );
  });
});

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
    const text = String(payload?.text || '').trim().slice(0, 5).toUpperCase();
    if (!text) return res.status(400).json({ error: 'Code libre vide.' });
    cleanPayload = { text };
  } else if (kind === 'sanction') {
    const card = ['Y', 'R', 'E', 'D'].includes(String(payload?.card || '').toUpperCase())
      ? String(payload.card).toUpperCase()
      : 'Y';
    const player = payload?.player != null && payload.player !== '' ? Number(payload.player) : null;
    cleanPayload = {
      card,
      player,
      reason: String(payload?.reason || '').trim().slice(0, 80),
      awardOpponentPoint: card === 'R',
    };
  } else if (kind === 'delay') {
    const card = String(payload?.card || 'Y').toUpperCase() === 'R' ? 'R' : 'Y';
    cleanPayload = {
      card,
      reason: String(payload?.reason || 'Retard de jeu').trim().slice(0, 80),
      awardOpponentPoint: card === 'R',
    };
  } else if (kind === 'challenge') {
    const outcome = ['won', 'lost', 'replay'].includes(String(payload?.outcome || ''))
      ? String(payload.outcome)
      : 'won';
    cleanPayload = {
      outcome,
      reason: String(payload?.reason || 'Video Check').trim().slice(0, 80),
    };
  } else if (kind === 'point_adjust') {
    const delta = Number(payload?.delta) || 1;
    cleanPayload = {
      delta,
      reason: String(payload?.reason || 'Décision arbitrale').trim().slice(0, 80),
    };
  }

  const setNumber = Number(set_number) > 0 ? Number(set_number) : null;
  const pointNumber = Number.isFinite(Number(point_number)) ? Number(point_number) : null;
  const now = new Date().toISOString();
  const eventUuid = crypto.randomUUID();

  verifyVideo(req, res, (video) => {
    db.run(
      `INSERT INTO volley_events (video_id, kind, set_number, point_number, team, payload, sync_uuid, deleted, dirty, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
      [video.id, kind, setNumber, pointNumber, team || null, JSON.stringify(cleanPayload), eventUuid, now],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to save event' });
        if (req.clubId === DEFAULT_CLUB_ID) {
          syncHub.events.syncNow({ reason: 'api' }).catch(() => {});
        }
        emitCollectionChanged('events');
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
    const now = new Date().toISOString();
    db.run(
      'UPDATE volley_events SET deleted = 1, dirty = 1, local_updated_at = ? WHERE id = ? AND video_id = ?',
      [now, req.params.eventId, video.id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to delete event' });
        if (req.clubId === DEFAULT_CLUB_ID) {
          syncHub.events.syncNow({ reason: 'api' }).catch(() => {});
        }
        emitCollectionChanged('events');
        res.json({ message: 'Event deleted', deleted: this.changes });
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Attribution de sets (codage collaboratif) — partagée via Supabase.
// ---------------------------------------------------------------------------

function getVideoSyncUuid(videoId, clubId, callback) {
  db.get(
    'SELECT id, sync_uuid FROM videos WHERE id = ? AND club_id = ? AND COALESCE(deleted, 0) = 0',
    [videoId, clubId],
    (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error('Vidéo introuvable'));
      if (row.sync_uuid) return callback(null, row.sync_uuid);
      const newUuid = crypto.randomUUID();
      db.run('UPDATE videos SET sync_uuid = ? WHERE id = ?', [newUuid, row.id], (upErr) => {
        if (upErr) return callback(upErr);
        callback(null, newUuid);
      });
    }
  );
}

// Liste des sets revendiqués pour une vidéo.
router.get('/:videoId/claims', authenticateToken, (req, res) => {
  getVideoSyncUuid(req.params.videoId, req.clubId, (err, videoUuid) => {
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
  getVideoSyncUuid(req.params.videoId, req.clubId, (err, videoUuid) => {
    if (err) return res.status(404).json({ error: err.message });
    const now = new Date().toISOString();
    const email = req.user.email || `user-${req.user.id}`;
    db.get(
      'SELECT * FROM video_set_claims WHERE video_uuid = ? AND set_number = ?',
      [videoUuid, setNumber],
      (err2, existing) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        if (existing && Number(existing.deleted) === 0 && existing.claimed_by_email && existing.claimed_by_email !== email) {
          return res.status(409).json({ error: 'Ce set est déjà revendiqué par un autre statisticien', claimed_by: existing.claimed_by_name });
        }
        const claimUuid = existing && existing.sync_uuid ? existing.sync_uuid : crypto.randomUUID();
        const sql = existing
          ? `UPDATE video_set_claims SET claimed_by_uuid = ?, claimed_by_name = ?, claimed_by_email = ?, claimed_at = ?, deleted = 0, dirty = 1, local_updated_at = ?, sync_uuid = COALESCE(sync_uuid, ?) WHERE id = ?`
          : `INSERT INTO video_set_claims (video_uuid, set_number, claimed_by_uuid, claimed_by_name, claimed_by_email, claimed_at, dirty, local_updated_at, sync_uuid) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`;
        const params = existing
          ? [email, req.user.name, email, now, now, claimUuid, existing.id]
          : [videoUuid, setNumber, email, req.user.name, email, now, now, claimUuid];
        db.run(sql, params, function (err3) {
          if (err3) return res.status(500).json({ error: 'Database error' });
          if (req.clubId === DEFAULT_CLUB_ID) {
            syncHub.claims.syncNow({ reason: 'api' }).catch(() => {});
          }
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
  getVideoSyncUuid(req.params.videoId, req.clubId, (err, videoUuid) => {
    if (err) return res.status(404).json({ error: err.message });
    db.run(
      'UPDATE video_set_claims SET deleted = 1, dirty = 1, local_updated_at = ? WHERE video_uuid = ? AND set_number = ? AND COALESCE(deleted, 0) = 0',
      [new Date().toISOString(), videoUuid, setNumber],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Database error' });
        if (req.clubId === DEFAULT_CLUB_ID) {
          syncHub.claims.syncNow({ reason: 'api' }).catch(() => {});
        }
        emitCollectionChanged('claims');
        res.json({ message: 'Set libéré', released: this.changes });
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Analyse Multi-Matchs & Scouting Adversaire (Points 5 & 7)
// ---------------------------------------------------------------------------
router.post('/multi-match-data', authenticateToken, (req, res) => {
  const rawIds = Array.isArray(req.body?.videoIds) ? req.body.videoIds : [];
  const videoIds = rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (videoIds.length === 0) {
    return res.json({ matches: [] });
  }

  const placeholders = videoIds.map(() => '?').join(',');
  db.all(
    `SELECT v.*, m.status AS match_status, m.finished_at,
            COALESCE(m.home_team_id, v.home_team_id) AS resolved_home_team_id,
            COALESCE(m.away_team_id, v.away_team_id) AS resolved_away_team_id
       FROM videos v
       LEFT JOIN volley_matches m ON m.video_id = v.id
      WHERE v.id IN (${placeholders}) AND v.club_id = ? AND COALESCE(v.deleted, 0) = 0
      ORDER BY v.created_at DESC, v.id DESC`,
    [...videoIds, req.clubId],
    (err, videos) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!videos || videos.length === 0) return res.json({ matches: [] });

      const matchedIds = videos.map((v) => Number(v.id));
      const matchedPlaceholders = matchedIds.map(() => '?').join(',');

      db.all(
        `SELECT * FROM volley_actions
          WHERE video_id IN (${matchedPlaceholders}) AND COALESCE(deleted, 0) = 0
          ORDER BY video_id ASC, action_index ASC`,
        matchedIds,
        (err2, allActions) => {
          if (err2) return res.status(500).json({ error: 'Database error' });

          db.all(
            `SELECT * FROM volley_events
              WHERE video_id IN (${matchedPlaceholders}) AND COALESCE(deleted, 0) = 0
              ORDER BY video_id ASC, COALESCE(set_number, 1) ASC, COALESCE(point_number, 0) ASC, id ASC`,
            matchedIds,
            (err3, allEvents) => {
              if (err3) return res.status(500).json({ error: 'Database error' });

              let pending = videos.length;
              const matchesMap = new Map();

              videos.forEach((v) => {
                const vActions = (allActions || []).filter((a) => Number(a.video_id) === Number(v.id));
                const vEvents = (allEvents || [])
                  .filter((ev) => Number(ev.video_id) === Number(v.id))
                  .map(withPayload);

                getSetups(`video:${v.id}`, (errS, setups) => {
                  matchesMap.set(Number(v.id), {
                    video: v,
                    actions: vActions,
                    events: vEvents,
                    setups: setups || {},
                  });
                  pending -= 1;
                  if (pending === 0) {
                    const ordered = videoIds
                      .map((id) => matchesMap.get(id))
                      .filter(Boolean);
                    res.json({ matches: ordered });
                  }
                });
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
