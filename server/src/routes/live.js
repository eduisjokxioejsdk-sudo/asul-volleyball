const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const { emitToSession, emitCollectionChanged } = require('../socket');
const { getSetups, saveSetups } = require('../setups');
const liveStream = require('../liveStream');
const liveRecord = require('../liveRecord');
const syncHub = require('../syncHub');
const { mountSyncRoutes } = require('./sync');
const dvCode = require('../datavolleyCode');
const { generateProxy } = require('../proxy');

// Dossiers de données (positionnés par config.js ; repli sur server/).
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const uploadsDir = path.join(dataDir, 'uploads');
const proxyDir = path.join(uploadsDir, 'trimmed');

const router = express.Router();

const EVENT_KINDS = ['timeout', 'substitution', 'note', 'message', 'sanction', 'delay', 'challenge', 'point_adjust'];
const EVENT_TEAMS = ['home', 'away'];

// --- Helpers ---------------------------------------------------------------

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const decomposeCode = (code) => dvCode.decomposeCode(code);

function isValidCode(code) {
  return dvCode.isDraftCode(code);
}

function safeParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function safeParsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
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

/**
 * Marque la session live comme modifiée localement et déclenche une
 * synchronisation Supabase immédiate (en tâche de fond).
 */
function touchLiveSession(sessionId, extraDeletedUuids = []) {
  const now = new Date().toISOString();
  const cleanDeleted = (extraDeletedUuids || []).filter(Boolean).map(String);
  if (cleanDeleted.length > 0) {
    db.get('SELECT deleted_items FROM live_sessions WHERE id = ?', [sessionId], (err, row) => {
      const prev = safeParse(row?.deleted_items);
      const merged = Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...cleanDeleted]));
      db.run(
        'UPDATE live_sessions SET dirty = 1, local_updated_at = ?, deleted_items = ? WHERE id = ?',
        [now, JSON.stringify(merged), sessionId],
        () => {
          syncHub.live.syncNow({ reason: 'live-api' }).catch(() => {});
        }
      );
    });
    return;
  }
  db.run(
    'UPDATE live_sessions SET dirty = 1, local_updated_at = ? WHERE id = ?',
    [now, sessionId],
    () => {
      syncHub.live.syncNow({ reason: 'live-api' }).catch(() => {});
    }
  );
}

function loadSession(sessionId, res, callback) {
  db.get('SELECT * FROM live_sessions WHERE id = ? AND COALESCE(deleted, 0) = 0', [sessionId], (err, session) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    callback(session);
  });
}

// Vérifie l'accès à la session ; si la session est partagée (Cloud ou autre poste)
// et que l'utilisateur n'est pas encore inscrit dans live_members, on l'inscrit
// automatiquement comme statisticien pour éviter tout blocage.
function verifyAccess(session, req, res, callback) {
  db.get(
    'SELECT * FROM live_members WHERE session_id = ? AND user_id = ?',
    [session.id, req.user.id],
    (err, member) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      const isOwner =
        session.owner_user_id === req.user.id ||
        Number(session.owner_user_id) === 0 ||
        (member && member.role === 'statistician');

      if (member) {
        return callback(session, isOwner, member);
      }

      const now = new Date().toISOString();
      const memberUuid = uuidv4();
      const nickname = (req.user.name || req.user.email || 'Statisticien').trim();
      db.run(
        `INSERT INTO live_members (session_id, sync_uuid, user_id, nickname, role, assignment, updated_at)
         VALUES (?, ?, ?, ?, 'statistician', '["S","R","A","B","D"]', ?)`,
        [session.id, memberUuid, req.user.id, nickname, now],
        function (insErr) {
          if (insErr) return res.status(500).json({ error: 'Database error' });
          const newMember = {
            id: this.lastID,
            session_id: session.id,
            sync_uuid: memberUuid,
            user_id: req.user.id,
            nickname,
            role: 'statistician',
            assignment: '["S","R","A","B","D"]',
            updated_at: now,
          };
          emitToSession(session.id, 'member:update', {});
          touchLiveSession(session.id);
          callback(session, true, newMember);
        }
      );
    }
  );
}

function loadSessionState(sessionId, res, callback) {
  db.get('SELECT * FROM live_sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    session.current_point = Number(session.current_point) || 1;
    session.point_completed = safeParse(session.point_completed) || [];

    db.all(
      `SELECT m.*, u.email, u.name
         FROM live_members m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.session_id = ?
        ORDER BY m.id ASC`,
      [sessionId],
      (err2, members) => {
        if (err2) return res.status(500).json({ error: 'Database error' });

        db.all(
          'SELECT * FROM live_actions WHERE session_id = ? ORDER BY effective_time ASC, seq ASC, id ASC',
          [sessionId],
          (err3, actions) => {
            if (err3) return res.status(500).json({ error: 'Database error' });
            db.all(
              `SELECT * FROM live_events
                WHERE session_id = ?
                ORDER BY COALESCE(set_number, 1) ASC, COALESCE(point_number, 0) ASC, id ASC`,
              [sessionId],
              (errEv, eventRows) => {
                const events = !errEv && Array.isArray(eventRows) ? eventRows.map(withPayload) : [];
                callback({ session, members, actions, events });
              }
            );
          }
        );
      }
    );
  });
}

// --- Synchronisation d'horloge --------------------------------------------

router.get('/time', (req, res) => {
  res.json({ serverTime: Date.now() });
});

// Routes de synchronisation cloud (POST /sync, GET /sync/status, PUT /sync/config)
mountSyncRoutes(router, syncHub.live);

// --- Sessions ---------------------------------------------------------------

// Créer une session live (le créateur en est propriétaire + membre).
router.post('/', authenticateToken, (req, res) => {
  const { name, team1_name, team2_name, home_team_id, away_team_id } = req.body || {};
  const title = (name || 'Match en direct').trim() || 'Match en direct';
  const id = uuidv4();
  const joinCode = generateJoinCode();
  const now = new Date().toISOString();

  db.all(
    'SELECT id, sync_uuid FROM teams WHERE id IN (?, ?)',
    [home_team_id ? Number(home_team_id) : -1, away_team_id ? Number(away_team_id) : -1],
    (tErr, teamRows) => {
      const byId = new Map((teamRows || []).map((r) => [Number(r.id), r.sync_uuid]));
      const homeTeamUuid = home_team_id ? byId.get(Number(home_team_id)) || null : null;
      const awayTeamUuid = away_team_id ? byId.get(Number(away_team_id)) || null : null;

      db.run(
        `INSERT INTO live_sessions
          (id, sync_uuid, name, team1_name, team2_name, home_team_id, away_team_id,
           home_team_uuid, away_team_uuid, owner_user_id, join_code, dirty, deleted, local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        [
          id,
          id,
          title,
          (team1_name || '').trim() || 'Domicile',
          (team2_name || '').trim() || 'Extérieur',
          home_team_id ? Number(home_team_id) : null,
          away_team_id ? Number(away_team_id) : null,
          homeTeamUuid,
          awayTeamUuid,
          req.user.id,
          joinCode,
          now,
        ],
        function (err) {
          if (err) return res.status(500).json({ error: 'Failed to create session' });

          db.run(
            `INSERT INTO live_members (session_id, sync_uuid, user_id, nickname, role, assignment, updated_at)
             VALUES (?, ?, ?, ?, 'statistician', '["S","R","A","B","D"]', ?)`,
            [id, uuidv4(), req.user.id, req.user.name || 'Créateur', now],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Failed to add owner as member' });
              touchLiveSession(id);
              res.status(201).json({ id, join_code: joinCode, name: title });
            }
          );
        }
      );
    }
  );
});

// Lister toutes les sessions live actives ou terminées (partagées entre tous les postes).
router.get('/mine', authenticateToken, (req, res) => {
  syncHub.live.syncNow({ reason: 'live-list' }).catch(() => {});
  db.all(
    `SELECT s.*
       FROM live_sessions s
      WHERE s.deleted_at IS NULL
        AND COALESCE(s.deleted, 0) = 0
      ORDER BY s.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ sessions: rows || [] });
    }
  );
});

// Corbeille : matchs mis à la corbeille.
router.get('/trash', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM live_sessions
      WHERE deleted_at IS NOT NULL AND COALESCE(deleted, 0) = 0
      ORDER BY deleted_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ sessions: rows || [] });
    }
  );
});

// État complet d'une session (session + membres + actions + événements).
router.get('/:sessionId', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner) => {
      loadSessionState(s.id, res, ({ session: full, members, actions, events }) => {
        const me = members.find((m) => m.user_id === req.user.id) || null;
        res.json({
          session: full,
          members,
          actions,
          events,
          me,
          isOwner: Boolean(isOwner || full.owner_user_id === req.user.id || (me && me.role === 'statistician')),
        });
      });
    });
  });
});

// Rejoindre une session par code (recherche locale puis synchronisation Supabase si absente).
router.post('/join', authenticateToken, (req, res) => {
  const body = typeof req.body === 'string' ? { join_code: req.body } : (req.body || {});
  const { join_code, code: altCode, role, nickname, assignment } = body;
  const code = String(join_code || altCode || '').trim().toUpperCase();

  if (!code) return res.status(400).json({ error: 'Code requis' });

  const proceedWithSession = (session) => {
    const memberRole =
      role === 'viewer' ? 'viewer' : role === 'camera' ? 'camera' : 'statistician';
    const memberNickname = (nickname || req.user.name || 'Membre').trim();
    const memberAssignment = memberRole === 'camera'
      ? '[]'
      : (Array.isArray(assignment) && assignment.length
        ? JSON.stringify(assignment)
        : '["S","R","A","B","D"]');
    const now = new Date().toISOString();

    db.get(
      'SELECT * FROM live_members WHERE session_id = ? AND user_id = ?',
      [session.id, req.user.id],
      (err, existing) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        if (existing) {
          db.run(
            'UPDATE live_members SET sync_uuid = COALESCE(sync_uuid, ?), role = ?, nickname = ?, assignment = ?, updated_at = ? WHERE id = ?',
            [uuidv4(), memberRole, memberNickname, memberAssignment, now, existing.id],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Database error' });
              emitToSession(session.id, 'member:update', {});
              touchLiveSession(session.id);
              res.json({ sessionId: session.id, memberId: existing.id });
            }
          );
          return;
        }

        db.run(
          `INSERT INTO live_members (session_id, sync_uuid, user_id, nickname, role, assignment, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [session.id, uuidv4(), req.user.id, memberNickname, memberRole, memberAssignment, now],
          function (err2) {
            if (err2) return res.status(500).json({ error: 'Database error' });
            emitToSession(session.id, 'member:update', {});
            touchLiveSession(session.id);
            res.json({ sessionId: session.id, memberId: this.lastID });
          }
        );
      }
    );
  };

  db.get(
    'SELECT * FROM live_sessions WHERE join_code = ? AND COALESCE(deleted, 0) = 0',
    [code],
    async (err, session) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (session) return proceedWithSession(session);

      try {
        await Promise.all([
          syncHub.teams.syncNow({ reason: 'live-join' }).catch(() => {}),
          syncHub.live.syncNow({ reason: 'live-join' }).catch(() => {}),
        ]);
      } catch {
        // Ignoré : la vérification SQLite ci-dessous tranchera.
      }

      db.get(
        'SELECT * FROM live_sessions WHERE join_code = ? AND COALESCE(deleted, 0) = 0',
        [code],
        (err2, syncedSession) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          if (!syncedSession) return res.status(404).json({ error: 'Code invalide' });
          proceedWithSession(syncedSession);
        }
      );
    }
  );
});

// Mettre à jour nom / équipes.
router.patch('/:sessionId', authenticateToken, (req, res) => {
  const { name, team1_name, team2_name } = req.body || {};
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.run(
        'UPDATE live_sessions SET name = ?, team1_name = ?, team2_name = ? WHERE id = ?',
        [
          name ?? session.name,
          team1_name ?? session.team1_name,
          team2_name ?? session.team2_name,
          session.id,
        ],
        (err) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          emitToSession(session.id, 'session:update', {});
          touchLiveSession(session.id);
          res.json({ message: 'Session mise à jour' });
        }
      );
    });
  });
});

// Terminer un match.
router.post('/:sessionId/finish', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.run("UPDATE live_sessions SET status = 'finished' WHERE id = ?", [session.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        emitToSession(session.id, 'session:update', {});
        touchLiveSession(session.id);
        res.json({ message: 'Match terminé' });
      });
    });
  });
});

// Rouvrir un match terminé.
router.post('/:sessionId/reopen', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.run("UPDATE live_sessions SET status = 'active' WHERE id = ?", [session.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        emitToSession(session.id, 'session:update', {});
        touchLiveSession(session.id);
        res.json({ message: 'Match rouvert' });
      });
    });
  });
});

// Mettre un match à la corbeille (soft delete).
router.post('/:sessionId/trash', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    db.run(
      'UPDATE live_sessions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [session.id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        emitToSession(session.id, 'session:update', {});
        touchLiveSession(session.id);
        res.json({ message: 'Match mis à la corbeille' });
      }
    );
  });
});

// Restaurer un match depuis la corbeille.
router.post('/:sessionId/restore', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    db.run(
      'UPDATE live_sessions SET deleted_at = NULL WHERE id = ?',
      [session.id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        emitToSession(session.id, 'session:update', {});
        touchLiveSession(session.id);
        res.json({ message: 'Match restauré' });
      }
    );
  });
});

// Supprimer définitivement un match et toutes ses données.
router.delete('/:sessionId', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    const now = new Date().toISOString();
    db.serialize(() => {
      db.run('DELETE FROM live_actions WHERE session_id = ?', [session.id]);
      db.run('DELETE FROM live_events WHERE session_id = ?', [session.id]);
      db.run('DELETE FROM live_members WHERE session_id = ?', [session.id]);
      db.run('DELETE FROM set_setups WHERE match_key = ?', ['session:' + session.id]);
      db.run(
        'UPDATE live_sessions SET deleted = 1, dirty = 1, deleted_at = COALESCE(deleted_at, ?), local_updated_at = ? WHERE id = ?',
        [now, now, session.id],
        (err) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          syncHub.live.syncNow({ reason: 'live-delete' }).catch(() => {});
          res.json({ message: 'Match supprimé définitivement' });
        }
      );
    });
  });
});

// Inviter des comptes par email.
router.post('/:sessionId/invite', authenticateToken, (req, res) => {
  const { emails } = req.body || {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: "Liste d'emails requise" });
  }

  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      const normalized = [
        ...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)),
      ];
      if (normalized.length === 0) {
        return res.status(400).json({ error: 'Aucun email valide' });
      }

      let added = 0;
      let pending = normalized.length;
      const now = new Date().toISOString();

      normalized.forEach((email) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
          if (err || !user) {
            pending -= 1;
            if (pending === 0) finish();
            return;
          }
          db.get(
            'SELECT * FROM live_members WHERE session_id = ? AND user_id = ?',
            [session.id, user.id],
            (err2, existing) => {
              if (existing) {
                pending -= 1;
                if (pending === 0) finish();
                return;
              }
              db.run(
                `INSERT INTO live_members (session_id, sync_uuid, user_id, nickname, role, assignment, updated_at)
                 VALUES (?, ?, ?, ?, 'statistician', '["S","R","A","B","D"]', ?)`,
                [session.id, uuidv4(), user.id, user.name || email, now],
                function (err3) {
                  if (!err3) added += 1;
                  pending -= 1;
                  if (pending === 0) finish();
                }
              );
            }
          );
        });
      });

      function finish() {
        emitToSession(session.id, 'member:update', {});
        touchLiveSession(session.id);
        res.json({ message: `${added} invité(s) ajouté(s)` });
      }
    });
  });
});

// Mettre à jour rôle / assignation d'un membre.
router.put('/:sessionId/members/:memberId', authenticateToken, (req, res) => {
  const { role, nickname, assignment } = req.body || {};
  const memberId = Number(req.params.memberId);

  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner) => {
      db.get(
        'SELECT * FROM live_members WHERE id = ? AND session_id = ?',
        [memberId, session.id],
        (err, member) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          if (!member) return res.status(404).json({ error: 'Membre introuvable' });

          const canManage = isOwner || member.user_id === req.user.id;
          if (!canManage) {
            return res.status(403).json({ error: 'Réservé aux statisticiens' });
          }

          const newRole = ['viewer', 'statistician', 'camera'].includes(role) ? role : member.role;
          const newNickname = nickname ? nickname : member.nickname;
          const newAssignment =
            Array.isArray(assignment) && assignment.length
              ? JSON.stringify(assignment)
              : member.assignment;
          const now = new Date().toISOString();

          db.run(
            'UPDATE live_members SET sync_uuid = COALESCE(sync_uuid, ?), role = ?, nickname = ?, assignment = ?, updated_at = ? WHERE id = ?',
            [uuidv4(), newRole, newNickname, newAssignment, now, memberId],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Database error' });
              emitToSession(session.id, 'member:update', {});
              touchLiveSession(session.id);
              res.json({ message: 'Membre mis à jour' });
            }
          );
        }
      );
    });
  });
});

// --- Actions ----------------------------------------------------------------

router.post('/:sessionId/actions', authenticateToken, (req, res) => {
  const {
    code,
    effective_time,
    system_time,
    assigned,
    attack_zone,
    set_number,
    start_x,
    start_y,
    mid_x,
    mid_y,
    end_x,
    end_y,
    start_subzone,
    end_subzone,
    is_auto,
  } = req.body || {};
  if (!isValidCode(code)) {
    return res.status(400).json({ error: 'Code invalide' });
  }

  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner, member) => {
      const nowSec = Date.now() / 1000;
      const eff =
        typeof effective_time === 'number' && !Number.isNaN(effective_time)
          ? effective_time
          : nowSec;
      const sys = typeof system_time === 'number' ? Math.floor(system_time) : Math.floor(nowSec);
      const codes = dvCode.expandSequence(code);
      const myMember = member && member.user_id === req.user.id ? member : null;

      db.get(
        'SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM live_actions WHERE session_id = ?',
        [session.id],
        (err, row) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          let seq = (row.maxSeq ?? -1) + 1;
          const isAssigned = assigned === false || assigned === 0 ? 0 : 1;
          const setNumber = Number(set_number) > 0 ? Math.round(Number(set_number)) : 1;
          const autoFlag = is_auto ? 1 : 0;
          const created = [];
          let pending = codes.length;

          const done = () => {
            pending -= 1;
            if (pending > 0) return;
            for (const action of created) emitToSession(session.id, 'action:add', { action });
            touchLiveSession(session.id);
            res.status(201).json({ action: created[0], actions: created });
          };

          if (codes.length === 0) return res.status(400).json({ error: 'Code invalide' });
          const nowIso = new Date().toISOString();

          for (const one of codes) {
            const parts = decomposeCode(one);
            const currentSeq = seq;
            const actionUuid = uuidv4();
            seq += 1;
            db.run(
              `INSERT INTO live_actions
                (session_id, sync_uuid, effective_time, seq, member_id, assigned, code, system_time, team, player_number,
                 action, evaluation, type, start_zone, end_zone, start_subzone, end_subzone, attack_zone, set_number,
                 start_x, start_y, mid_x, mid_y, end_x, end_y, is_auto, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                session.id,
                actionUuid,
                eff,
                currentSeq,
                myMember ? myMember.id : null,
                isAssigned,
                one,
                sys,
                parts.team,
                parts.player_number,
                parts.action,
                parts.evaluation,
                parts.type || null,
                parts.start_zone || null,
                parts.end_zone || null,
                start_subzone ?? parts.start_subzone ?? null,
                end_subzone ?? parts.end_subzone ?? null,
                attack_zone ?? parts.start_zone ?? null,
                setNumber,
                start_x ?? null,
                start_y ?? null,
                mid_x ?? null,
                mid_y ?? null,
                end_x ?? null,
                end_y ?? null,
                autoFlag,
                nowIso,
              ],
              function (err2) {
                if (err2) return res.status(500).json({ error: 'Failed to save action' });
                created.push({
                  id: this.lastID,
                  sync_uuid: actionUuid,
                  session_id: session.id,
                  effective_time: eff,
                  seq: currentSeq,
                  member_id: myMember ? myMember.id : null,
                  assigned: isAssigned,
                  code: one,
                  system_time: sys,
                  attack_zone: attack_zone ?? parts.start_zone ?? null,
                  set_number: setNumber,
                  start_x: start_x ?? null,
                  start_y: start_y ?? null,
                  mid_x: mid_x ?? null,
                  mid_y: mid_y ?? null,
                  end_x: end_x ?? null,
                  end_y: end_y ?? null,
                  start_subzone: start_subzone ?? parts.start_subzone ?? null,
                  end_subzone: end_subzone ?? parts.end_subzone ?? null,
                  is_auto: autoFlag,
                  updated_at: nowIso,
                  ...parts,
                });
                done();
              }
            );
          }
        }
      );
    });
  });
});

// Modifier une action.
router.patch('/:sessionId/actions/:actionId', authenticateToken, (req, res) => {
  const {
    code,
    effective_time,
    assigned,
    attack_zone,
    start_x,
    start_y,
    mid_x,
    mid_y,
    end_x,
    end_y,
    start_subzone,
    end_subzone,
  } = req.body || {};
  const actionId = Number(req.params.actionId);

  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.get(
        'SELECT * FROM live_actions WHERE id = ? AND session_id = ?',
        [actionId, session.id],
        (err, existing) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          if (!existing) return res.status(404).json({ error: 'Action introuvable' });

          const newCode = isValidCode(code) ? code : existing.code;
          const newEff =
            typeof effective_time === 'number' && !Number.isNaN(effective_time)
              ? effective_time
              : existing.effective_time;
          const newAssigned =
            assigned === false || assigned === 0
              ? 0
              : assigned === true || assigned === 1
              ? 1
              : existing.assigned;
          const newZone = attack_zone !== undefined ? attack_zone : existing.attack_zone;
          const parts = decomposeCode(newCode);
          const newStartX = start_x !== undefined ? start_x : existing.start_x;
          const newStartY = start_y !== undefined ? start_y : existing.start_y;
          const newMidX = mid_x !== undefined ? mid_x : existing.mid_x;
          const newMidY = mid_y !== undefined ? mid_y : existing.mid_y;
          const newEndX = end_x !== undefined ? end_x : existing.end_x;
          const newEndY = end_y !== undefined ? end_y : existing.end_y;
          const newStartSub = start_subzone !== undefined ? start_subzone : existing.start_subzone;
          const newEndSub =
            end_subzone !== undefined ? end_subzone : parts.end_subzone || existing.end_subzone;

          const nowIso = new Date().toISOString();
          const syncUuid = existing.sync_uuid || uuidv4();

          db.run(
            `UPDATE live_actions
                SET sync_uuid = ?, code = ?, effective_time = ?, assigned = ?, team = ?, player_number = ?, action = ?,
                    evaluation = ?, type = ?, start_zone = ?, end_zone = ?, start_subzone = ?, end_subzone = ?, attack_zone = ?,
                    start_x = ?, start_y = ?, mid_x = ?, mid_y = ?, end_x = ?, end_y = ?, updated_at = ?
              WHERE id = ?`,
            [
              syncUuid,
              newCode,
              newEff,
              newAssigned,
              parts.team,
              parts.player_number,
              parts.action,
              parts.evaluation,
              parts.type || null,
              parts.start_zone || null,
              parts.end_zone || null,
              newStartSub || null,
              newEndSub || null,
              newZone ?? parts.start_zone ?? null,
              newStartX ?? null,
              newStartY ?? null,
              newMidX ?? null,
              newMidY ?? null,
              newEndX ?? null,
              newEndY ?? null,
              nowIso,
              actionId,
            ],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Failed to update action' });
              const action = {
                ...existing,
                sync_uuid: syncUuid,
                code: newCode,
                effective_time: newEff,
                assigned: newAssigned,
                attack_zone: newZone ?? parts.start_zone ?? null,
                start_x: newStartX ?? null,
                start_y: newStartY ?? null,
                mid_x: newMidX ?? null,
                mid_y: newMidY ?? null,
                end_x: newEndX ?? null,
                end_y: newEndY ?? null,
                start_subzone: newStartSub ?? null,
                updated_at: nowIso,
                ...parts,
                end_subzone: newEndSub || parts.end_subzone || null,
              };
              emitToSession(session.id, 'action:update', { action });
              touchLiveSession(session.id);
              res.json({ action });
            }
          );
        }
      );
    });
  });
});

// Supprimer une action.
router.delete('/:sessionId/actions/:actionId', authenticateToken, (req, res) => {
  const actionId = Number(req.params.actionId);
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.get(
        'SELECT sync_uuid FROM live_actions WHERE id = ? AND session_id = ?',
        [actionId, session.id],
        (errG, existing) => {
          if (errG) return res.status(500).json({ error: 'Database error' });
          db.run(
            'DELETE FROM live_actions WHERE id = ? AND session_id = ?',
            [actionId, session.id],
            function (err) {
              if (err) return res.status(500).json({ error: 'Database error' });
              emitToSession(session.id, 'action:delete', { actionId });
              touchLiveSession(session.id, existing?.sync_uuid ? [existing.sync_uuid] : []);
              res.json({ message: 'Action supprimée' });
            }
          );
        }
      );
    });
  });
});

// --- Événements de match en direct ------------------------------------------

router.get('/:sessionId/events', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.all(
        `SELECT * FROM live_events
          WHERE session_id = ?
          ORDER BY COALESCE(set_number, 1) ASC, COALESCE(point_number, 0) ASC, id ASC`,
        [session.id],
        (err, rows) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          res.json({ events: (rows || []).map(withPayload) });
        }
      );
    });
  });
});

router.post('/:sessionId/events', authenticateToken, (req, res) => {
  const { kind, set_number, point_number, team, payload } = req.body || {};
  if (!EVENT_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Type d’événement invalide' });
  }
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
    if (out === inn) {
      return res.status(400).json({ error: 'Le joueur entrant doit être différent du sortant.' });
    }
    cleanPayload = { out, in: inn };
  } else if (kind === 'note') {
    const text = String(payload?.text || '').trim().slice(0, 5).toUpperCase();
    if (!text) return res.status(400).json({ error: 'Code libre vide.' });
    cleanPayload = { text };
  } else if (kind === 'message') {
    const text = String(payload?.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Le message est vide.' });
    cleanPayload = {
      text,
      author: String(req.user?.name || req.user?.email || 'Membre').slice(0, 100),
    };
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

  const setNumber = Number(set_number) > 0 ? Number(set_number) : 1;
  const pointNumber = Number.isFinite(Number(point_number)) ? Number(point_number) : 0;

  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      const nowIso = new Date().toISOString();
      db.run(
        `INSERT INTO live_events (session_id, sync_uuid, kind, set_number, point_number, team, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.id, uuidv4(), kind, setNumber, pointNumber, team || null, JSON.stringify(cleanPayload), nowIso],
        function (err) {
          if (err) return res.status(500).json({ error: 'Failed to save event' });
          db.get('SELECT * FROM live_events WHERE id = ?', [this.lastID], (err2, row) => {
            if (err2 || !row) return res.status(500).json({ error: 'Database error' });
            const event = withPayload(row);
            emitToSession(session.id, 'event:add', { event });
            touchLiveSession(session.id);
            res.status(201).json({ event });
          });
        }
      );
    });
  });
});

router.delete('/:sessionId/events/:eventId', authenticateToken, (req, res) => {
  const eventId = Number(req.params.eventId);
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.get(
        'SELECT sync_uuid FROM live_events WHERE id = ? AND session_id = ?',
        [eventId, session.id],
        (errG, existing) => {
          if (errG) return res.status(500).json({ error: 'Database error' });
          db.run(
            'DELETE FROM live_events WHERE id = ? AND session_id = ?',
            [eventId, session.id],
            function (err) {
              if (err) return res.status(500).json({ error: 'Database error' });
              emitToSession(session.id, 'event:delete', { eventId });
              touchLiveSession(session.id, existing?.sync_uuid ? [existing.sync_uuid] : []);
              res.json({ message: 'Event deleted', deleted: this.changes });
            }
          );
        }
      );
    });
  });
});

// --- Synchronisation du point (statisticiens multiples) -----------------------

router.post('/:sessionId/point/complete', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner, member) => {
      if (!member || member.role === 'viewer' || member.role === 'camera') {
        return res.status(403).json({ error: 'Réservé aux statisticiens' });
      }

      db.all(
        "SELECT id FROM live_members WHERE session_id = ? AND role = 'statistician'",
        [s.id],
        (err, coders) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          const coderIds = (coders || []).map((c) => c.id);
          let completed = safeParse(s.point_completed) || [];
          if (!completed.includes(member.id)) completed.push(member.id);

          let currentPoint = Number(s.current_point) || 1;
          let advanced = false;
          if (coderIds.length > 0 && completed.length >= coderIds.length) {
            currentPoint += 1;
            completed = [];
            advanced = true;
          }

          db.run(
            'UPDATE live_sessions SET current_point = ?, point_completed = ? WHERE id = ?',
            [currentPoint, JSON.stringify(completed), s.id],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Failed to update point' });
              const payload = { current_point: currentPoint, completed, advanced };
              emitToSession(s.id, 'session:point', payload);
              touchLiveSession(s.id);
              res.json(payload);
            }
          );
        }
      );
    });
  });
});

// --- Flux caméra : réglage du délai de rediffusion --------------------------

router.put('/:sessionId/video-delay', authenticateToken, (req, res) => {
  const { delay } = req.body || {};
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner, member) => {
      if (!isOwner && member?.role !== 'camera' && member?.role !== 'statistician') {
        return res.status(403).json({ error: 'Réglage réservé aux statisticiens ou à la caméra' });
      }
      const seconds = liveStream.setDelay(s.id, delay, (event, payload) =>
        emitToSession(s.id, event, payload)
      );
      db.run('UPDATE live_sessions SET video_delay = ? WHERE id = ?', [seconds, s.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        touchLiveSession(s.id);
        res.json({ delay: seconds });
      });
    });
  });
});

router.get('/:sessionId/video-state', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      res.json({
        ...liveStream.streamState(session.id),
        savedDelay: Number(session.video_delay) >= 0 ? Number(session.video_delay) : liveStream.DEFAULT_DELAY_S,
      });
    });
  });
});

// --- Équipes associées (partagées entre les appareils de la session) --------

router.get('/:sessionId/teams', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      db.get(
        'SELECT home_team_id, away_team_id FROM live_sessions WHERE id = ?',
        [session.id],
        (err, row) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          res.json({ home_team_id: row?.home_team_id ?? null, away_team_id: row?.away_team_id ?? null });
        }
      );
    });
  });
});

router.put('/:sessionId/teams', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      const { home_team_id, away_team_id } = req.body || {};
      db.all(
        'SELECT id, sync_uuid FROM teams WHERE id IN (?, ?)',
        [home_team_id ? Number(home_team_id) : -1, away_team_id ? Number(away_team_id) : -1],
        (tErr, teamRows) => {
          const byId = new Map((teamRows || []).map((r) => [Number(r.id), r.sync_uuid]));
          const homeUuid = home_team_id ? byId.get(Number(home_team_id)) || null : null;
          const awayUuid = away_team_id ? byId.get(Number(away_team_id)) || null : null;
          db.run(
            'UPDATE live_sessions SET home_team_id = ?, away_team_id = ?, home_team_uuid = ?, away_team_uuid = ? WHERE id = ?',
            [home_team_id ?? null, away_team_id ?? null, homeUuid, awayUuid, session.id],
            (err) => {
              if (err) return res.status(500).json({ error: 'Failed to save teams' });
              emitToSession(session.id, 'session:teams', {
                home_team_id: home_team_id ?? null,
                away_team_id: away_team_id ?? null,
              });
              touchLiveSession(session.id);
              res.json({ home_team_id: home_team_id ?? null, away_team_id: away_team_id ?? null });
            }
          );
        }
      );
    });
  });
});

// --- Positions de départ par set (partagées) ---------------------------------

router.get('/:sessionId/setups', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      getSetups(`session:${session.id}`, (err, setups) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ setups });
      });
    });
  });
});

router.put('/:sessionId/setups', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, () => {
      const { setups } = req.body || {};
      saveSetups(`session:${session.id}`, setups, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to save setups' });
        emitToSession(session.id, 'session:setups', {});
        touchLiveSession(session.id);
        res.json({ message: 'Setups saved' });
      });
    });
  });
});

// --- Finalisation du match en direct vers DataVolley ------------------------
// Fonctionne AVEC ou SANS enregistrement caméra local (accepte aussi un lien
// YouTube optionnel et synchronise toutes les stats vers Supabase).
router.post('/:sessionId/finalize-recording', authenticateToken, (req, res) => {
  const { sessionId } = req.params;
  const youtubeUrl = req.body?.youtube_url ? String(req.body.youtube_url).trim() || null : null;

  loadSession(sessionId, res, (session) => {
    verifyAccess(session, req, res, async () => {
      const info = liveRecord.lastRecording(sessionId);
      const hasLocalRecording = Boolean(info && fs.existsSync(info.path));

      try {
        let mp4Name = '';
        let mp4Path = '';
        let proxyPath = null;

        if (hasLocalRecording) {
          fs.ensureDirSync(uploadsDir);
          fs.ensureDirSync(proxyDir);
          const ffmpeg = require('fluent-ffmpeg');
          const stamp = Date.now();
          mp4Name = `live_${sessionId}_${stamp}.mp4`;
          mp4Path = path.join(uploadsDir, mp4Name);
          await new Promise((resolve, reject) => {
            ffmpeg(info.path)
              .outputOptions([
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
                '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart',
              ])
              .on('end', resolve)
              .on('error', reject)
              .save(mp4Path);
          });
          const proxyName = `proxy_live_${sessionId}_${stamp}.mp4`;
          proxyPath = path.join(proxyDir, proxyName);
          await generateProxy(mp4Path, proxyPath);
        }

        const actions = await new Promise((resolve, reject) => {
          db.all(
            'SELECT * FROM live_actions WHERE session_id = ? ORDER BY effective_time ASC, seq ASC',
            [sessionId],
            (err, rows) => (err ? reject(err) : resolve(rows || []))
          );
        });

        const delayS = Number(session.video_delay) >= 0 ? Number(session.video_delay) : 0;
        let anchorSystemTime;
        if (hasLocalRecording) {
          anchorSystemTime = Math.floor((info.startedAt + delayS * 1000) / 1000);
        } else {
          const firstRow = actions.find(
            (a) => (typeof a.effective_time === 'number' && a.effective_time > 1e9) || typeof a.system_time === 'number'
          );
          const firstTs = firstRow
            ? typeof firstRow.effective_time === 'number' && firstRow.effective_time > 1e9
              ? firstRow.effective_time
              : firstRow.system_time
            : Date.now() / 1000;
          anchorSystemTime = Math.max(0, Math.floor(firstTs - 5));
        }

        const homeTeamId = session.home_team_id ? Number(session.home_team_id) : null;
        const awayTeamId = session.away_team_id ? Number(session.away_team_id) : null;
        const homeTeamUuid = session.home_team_uuid || null;
        const awayTeamUuid = session.away_team_uuid || null;
        const nowIso = new Date().toISOString();
        const videoSyncUuid = uuidv4();
        const videoStatus = hasLocalRecording || youtubeUrl ? 'uploaded' : 'pending_video';

        db.run(
          `INSERT INTO videos (
             user_id, filename, original_name, display_name, youtube_url, filepath, filepath_proxy,
             team1_name, team2_name, home_team_id, away_team_id, home_team_uuid, away_team_uuid,
             status, sync_uuid, dirty, deleted, local_updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
          [
            req.user.id,
            mp4Name,
            hasLocalRecording ? `${session.name}.mp4` : `Direct — ${session.name}`,
            `Direct — ${session.name}`,
            youtubeUrl,
            mp4Path,
            proxyPath,
            session.team1_name,
            session.team2_name,
            homeTeamId,
            awayTeamId,
            homeTeamUuid,
            awayTeamUuid,
            videoStatus,
            videoSyncUuid,
            nowIso,
          ],
          function (err) {
            if (err) return res.status(500).json({ error: 'Failed to create video' });
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
              [videoId, uuidv4(), homeTeamId, awayTeamId, homeTeamUuid, awayTeamUuid, nowIso],
              () => {}
            );

            db.run(
              `INSERT OR REPLACE INTO volley_sync (video_id, anchor_timecode, anchor_system_time, lead_in, lead_out)
               VALUES (?, 0, ?, 4, 3)`,
              [videoId, anchorSystemTime]
            );
            db.run('UPDATE live_sessions SET video_id = ? WHERE id = ?', [videoId, sessionId]);

            // Copie les six de départ (set_setups) de la session live vers la vidéo.
            getSetups(`session:${sessionId}`, (setupErr, sessionSetups) => {
              if (!setupErr && sessionSetups && Object.keys(sessionSetups).length > 0) {
                saveSetups(`video:${videoId}`, sessionSetups, () => {
                  syncHub.setups.syncNow({ reason: 'live-finalize' }).catch(() => {});
                  emitCollectionChanged('setups');
                });
              }
            });

            // Copie les événements du direct (temps morts, remplacements) vers la vidéo.
            db.all('SELECT * FROM live_events WHERE session_id = ? ORDER BY id ASC', [sessionId], (evErr, evRows) => {
              if (!evErr && Array.isArray(evRows) && evRows.length > 0) {
                for (const ev of evRows) {
                  db.run(
                    `INSERT INTO volley_events
                       (video_id, kind, set_number, point_number, team, payload, sync_uuid, deleted, dirty, local_updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
                    [videoId, ev.kind, ev.set_number, ev.point_number, ev.team, ev.payload, uuidv4(), nowIso],
                    () => {}
                  );
                }
                syncHub.events.syncNow({ reason: 'live-finalize' }).catch(() => {});
                emitCollectionChanged('events');
              }
            });

            emitCollectionChanged('videos');
            emitCollectionChanged('matches');
            syncHub.videos.syncNow({ reason: 'live-finalize' }).catch(() => {});
            syncHub.matches.syncNow({ reason: 'live-finalize' }).catch(() => {});

            if (!actions.length) {
              return res.json({ videoId, actionCount: 0, hasLocalRecording });
            }

            db.run('BEGIN TRANSACTION', () => {
              const stmt = db.prepare(
                `INSERT INTO volley_actions
                  (video_id, action_index, code, timecode, system_time, team, player_number, action, evaluation,
                   type, start_zone, end_zone, start_subzone, end_subzone, set_number, note, attack_zone,
                   start_x, start_y, mid_x, mid_y, end_x, end_y, is_auto, deleted, dirty, local_updated_at, sync_uuid)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
              );
              stmt.on('error', () => {});
              actions.forEach((a, i) => {
                const parts = decomposeCode(a.code);
                const rawTime =
                  typeof a.effective_time === 'number' && a.effective_time > 1e9
                    ? a.effective_time
                    : typeof a.system_time === 'number'
                    ? a.system_time
                    : null;
                const timecode = rawTime != null ? Math.max(0, rawTime - anchorSystemTime) : null;
                const setNumber = Number(a.set_number) > 0 ? Math.round(Number(a.set_number)) : 1;
                stmt.run(
                  videoId,
                  i,
                  a.code,
                  timecode,
                  a.system_time ?? null,
                  a.team || parts.team,
                  a.player_number ?? parts.player_number,
                  a.action || parts.action,
                  a.evaluation || parts.evaluation,
                  parts.type || null,
                  a.start_zone ?? parts.start_zone ?? null,
                  a.end_zone ?? parts.end_zone ?? null,
                  a.start_subzone ?? parts.start_subzone ?? null,
                  a.end_subzone || parts.end_subzone || null,
                  setNumber,
                  null,
                  a.attack_zone ?? parts.start_zone ?? null,
                  a.start_x ?? null,
                  a.start_y ?? null,
                  a.mid_x ?? null,
                  a.mid_y ?? null,
                  a.end_x ?? null,
                  a.end_y ?? null,
                  a.is_auto ? 1 : 0,
                  nowIso,
                  uuidv4()
                );
              });
              stmt.finalize(() =>
                db.run('COMMIT', () => {
                  syncHub.actions.syncNow({ reason: 'live-finalize' }).catch(() => {});
                  emitCollectionChanged('actions');
                  res.json({ videoId, actionCount: actions.length, hasLocalRecording });
                })
              );
            });
          }
        );
      } catch (err) {
        return res.status(500).json({ error: 'Erreur de finalisation : ' + err.message });
      }
    });
  });
});

module.exports = router;
