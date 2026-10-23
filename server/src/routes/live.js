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
const dvCode = require('../datavolleyCode');
const { generateProxy } = require('../proxy');

// Dossiers de données (positionnés par config.js ; repli sur server/).
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const uploadsDir = path.join(dataDir, 'uploads');
const proxyDir = path.join(uploadsDir, 'trimmed');

const router = express.Router();

// --- Helpers ---------------------------------------------------------------

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Décomposition d'un code DataVolley (déléguée au module partagé).
const decomposeCode = (code) => dvCode.decomposeCode(code);

function isValidCode(code) {
  return dvCode.isDraftCode(code);
}

function safeParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function loadSession(sessionId, res, callback) {
  db.get('SELECT * FROM live_sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    callback(session);
  });
}

// Vérifie que l'utilisateur est propriétaire OU membre de la session.
function verifyAccess(session, req, res, callback) {
  const isOwner = session.owner_user_id === req.user.id;
  db.get(
    'SELECT * FROM live_members WHERE session_id = ? AND user_id = ?',
    [session.id, req.user.id],
    (err, member) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!isOwner && !member) return res.status(403).json({ error: 'Accès refusé à cette session' });
      callback(session, isOwner, member);
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
      (err, members) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        db.all(
          'SELECT * FROM live_actions WHERE session_id = ? ORDER BY effective_time ASC, seq ASC, id ASC',
          [sessionId],
          (err, actions) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            callback({ session, members, actions });
          }
        );
      }
    );
  });
}

// --- Synchronisation d'horloge --------------------------------------------

// Renvoie l'heure du serveur (ms). Le client estime son offset via aller-retour.
router.get('/time', (req, res) => {
  res.json({ serverTime: Date.now() });
});

// --- Sessions ---------------------------------------------------------------

// Créer une session live (le créateur en est propriétaire + membre).
router.post('/', authenticateToken, (req, res) => {
  const { name, team1_name, team2_name, home_team_id, away_team_id } = req.body || {};
  const title = (name || 'Match en direct').trim() || 'Match en direct';
  const id = uuidv4();
  const joinCode = generateJoinCode();

  db.run(
    `INSERT INTO live_sessions (id, name, team1_name, team2_name, home_team_id, away_team_id, owner_user_id, join_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title,
      (team1_name || '').trim() || 'Domicile',
      (team2_name || '').trim() || 'Extérieur',
      home_team_id ? Number(home_team_id) : null,
      away_team_id ? Number(away_team_id) : null,
      req.user.id,
      joinCode,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create session' });

      db.run(
        `INSERT INTO live_members (session_id, user_id, nickname, role, assignment)
         VALUES (?, ?, ?, 'statistician', '["S","R","A","B","D"]')`,
        [id, req.user.id, req.user.name || 'Créateur'],
        (err2) => {
          if (err2) return res.status(500).json({ error: 'Failed to add owner as member' });
          res.status(201).json({ id, join_code: joinCode, name: title });
        }
      );
    }
  );
});

// Lister les sessions auxquelles l'utilisateur participe.
router.get('/mine', authenticateToken, (req, res) => {
  db.all(
    `SELECT DISTINCT s.*
       FROM live_sessions s
       LEFT JOIN live_members m ON m.session_id = s.id AND m.user_id = ?
      WHERE (s.owner_user_id = ? OR m.id IS NOT NULL)
        AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC`,
    [req.user.id, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ sessions: rows });
    }
  );
});

// Corbeille : matchs mis à la corbeille par l'utilisateur (propriétaire).
router.get('/trash', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM live_sessions
      WHERE owner_user_id = ? AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ sessions: rows });
    }
  );
});

// État complet d'une session (session + membres + actions).
router.get('/:sessionId', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s) => {
      loadSessionState(s.id, res, ({ session: full, members, actions }) => {
        const me = members.find((m) => m.user_id === req.user.id) || null;
        res.json({
          session: full,
          members,
          actions,
          me,
          isOwner: full.owner_user_id === req.user.id,
        });
      });
    });
  });
});

// Rejoindre une session par code.
router.post('/join', authenticateToken, (req, res) => {
  const { join_code, role, nickname, assignment } = req.body || {};
  const code = (join_code || '').trim().toUpperCase();

  if (!code) return res.status(400).json({ error: 'Code requis' });

  db.get('SELECT * FROM live_sessions WHERE join_code = ?', [code], (err, session) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!session) return res.status(404).json({ error: 'Code invalide' });

    // Rôles : statisticien (code), observateur (lecture seule) et caméra
    // (le téléphone qui filme : ni codage, ni assignation).
    const memberRole =
      role === 'viewer' ? 'viewer' : role === 'camera' ? 'camera' : 'statistician';
    const memberNickname = (nickname || req.user.name || 'Membre').trim();
    const memberAssignment = memberRole === 'camera'
      ? '[]'
      : (Array.isArray(assignment) && assignment.length
        ? JSON.stringify(assignment)
        : '["S","R","A","B","D"]');

    db.get(
      'SELECT * FROM live_members WHERE session_id = ? AND user_id = ?',
      [session.id, req.user.id],
      (err, existing) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        if (existing) {
          db.run(
            'UPDATE live_members SET role = ?, nickname = ?, assignment = ? WHERE id = ?',
            [memberRole, memberNickname, memberAssignment, existing.id],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Database error' });
              emitToSession(session.id, 'member:update', {});
              res.json({ sessionId: session.id, memberId: existing.id });
            }
          );
          return;
        }

        db.run(
          `INSERT INTO live_members (session_id, user_id, nickname, role, assignment)
           VALUES (?, ?, ?, ?, ?)`,
          [session.id, req.user.id, memberNickname, memberRole, memberAssignment],
          function (err2) {
            if (err2) return res.status(500).json({ error: 'Database error' });
            emitToSession(session.id, 'member:update', {});
            res.json({ sessionId: session.id, memberId: this.lastID });
          }
        );
      }
    );
  });
});

// Mettre à jour nom / équipes (propriétaire uniquement).
router.patch('/:sessionId', authenticateToken, (req, res) => {
  const { name, team1_name, team2_name } = req.body || {};
  loadSession(req.params.sessionId, res, (session) => {
    if (session.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Réservé au propriétaire' });
    }
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
        res.json({ message: 'Session mise à jour' });
      }
    );
  });
});

// Terminer un match (propriétaire uniquement).
router.post('/:sessionId/finish', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    if (session.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Réservé au propriétaire' });
    }
    db.run("UPDATE live_sessions SET status = 'finished' WHERE id = ?", [session.id], (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      emitToSession(session.id, 'session:update', {});
      res.json({ message: 'Match terminé' });
    });
  });
});

// Mettre un match à la corbeille (soft delete, propriétaire uniquement).
router.post('/:sessionId/trash', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    if (session.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Réservé au propriétaire' });
    }
    db.run(
      'UPDATE live_sessions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [session.id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        emitToSession(session.id, 'session:update', {});
        res.json({ message: 'Match mis à la corbeille' });
      }
    );
  });
});

// Restaurer un match depuis la corbeille (propriétaire uniquement).
router.post('/:sessionId/restore', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    if (session.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Réservé au propriétaire' });
    }
    db.run(
      'UPDATE live_sessions SET deleted_at = NULL WHERE id = ?',
      [session.id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        emitToSession(session.id, 'session:update', {});
        res.json({ message: 'Match restauré' });
      }
    );
  });
});

// Supprimer définitivement un match et toutes ses données (propriétaire uniquement).
router.delete('/:sessionId', authenticateToken, (req, res) => {
  loadSession(req.params.sessionId, res, (session) => {
    if (session.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Réservé au propriétaire' });
    }
    db.serialize(() => {
      db.run('DELETE FROM live_actions WHERE session_id = ?', [session.id]);
      db.run('DELETE FROM live_members WHERE session_id = ?', [session.id]);
      db.run('DELETE FROM set_setups WHERE match_key = ?', ['session:' + session.id]);
      db.run('DELETE FROM live_sessions WHERE id = ?', [session.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Match supprimé définitivement' });
      });
    });
  });
});

// Inviter des comptes par email (propriétaire uniquement).
router.post('/:sessionId/invite', authenticateToken, (req, res) => {
  const { emails } = req.body || {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'Liste d\'emails requise' });
  }

  loadSession(req.params.sessionId, res, (session) => {
    if (session.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Réservé au propriétaire' });
    }

    const normalized = [...new Set(
      emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    )];
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'Aucun email valide' });
    }

    let added = 0;
    let pending = normalized.length;

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
          (err, existing) => {
            if (existing) {
              pending -= 1;
              if (pending === 0) finish();
              return;
            }
            db.run(
              `INSERT INTO live_members (session_id, user_id, nickname, role, assignment)
               VALUES (?, ?, ?, 'statistician', '["S","R","A","B","D"]')`,
              [session.id, user.id, user.name || email],
              function (err2) {
                if (!err2) added += 1;
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
      res.json({ message: `${added} invité(s) ajouté(s)` });
    }
  });
});

// Mettre à jour rôle / assignation d'un membre.
router.put('/:sessionId/members/:memberId', authenticateToken, (req, res) => {
  const { role, nickname, assignment } = req.body || {};
  const memberId = Number(req.params.memberId);

  loadSession(req.params.sessionId, res, (session) => {
    db.get(
      'SELECT * FROM live_members WHERE id = ? AND session_id = ?',
      [memberId, session.id],
      (err, member) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!member) return res.status(404).json({ error: 'Membre introuvable' });

        const isOwner = session.owner_user_id === req.user.id;
        if (!isOwner && member.user_id !== req.user.id) {
          return res.status(403).json({ error: 'Réservé au propriétaire' });
        }

        const newRole = isOwner && ['viewer', 'statistician', 'camera'].includes(role) ? role : member.role;
        const newNickname = isOwner && nickname ? nickname : member.nickname;
        const newAssignment = Array.isArray(assignment) && assignment.length
          ? JSON.stringify(assignment)
          : member.assignment;

        db.run(
          'UPDATE live_members SET role = ?, nickname = ?, assignment = ? WHERE id = ?',
          [newRole, newNickname, newAssignment, memberId],
          (err2) => {
            if (err2) return res.status(500).json({ error: 'Database error' });
            emitToSession(session.id, 'member:update', {});
            res.json({ message: 'Membre mis à jour' });
          }
        );
      }
    );
  });
});

// --- Actions ----------------------------------------------------------------

// Ajouter une action (broadcast aux autres appareils).
// Une formule combinée (`a04SM.06#`) crée DEUX actions : le service puis la
// réception adverse, avec la même estampille temporelle.
router.post('/:sessionId/actions', authenticateToken, (req, res) => {
  const { code, effective_time, system_time, assigned, attack_zone, set_number } = req.body || {};
  if (!isValidCode(code)) {
    return res.status(400).json({ error: 'Code invalide' });
  }

  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner, member) => {
      const nowSec = Date.now() / 1000;
      const eff = typeof effective_time === 'number' && !Number.isNaN(effective_time)
        ? effective_time
        : nowSec;
      const sys = typeof system_time === 'number' ? system_time : Math.floor(nowSec);
      const codes = dvCode.expandSequence(code);
      const myMember = member && member.user_id === req.user.id ? member : null;

      db.get(
        'SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM live_actions WHERE session_id = ?',
        [session.id],
        (err, row) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          let seq = (row.maxSeq ?? -1) + 1;
          const isAssigned = assigned === false || assigned === 0 ? 0 : 1;
          // Numéro de set (1 par défaut) : indispensable pour retrouver les
          // stats par set dans le replay finalisé.
          const setNumber = Number(set_number) > 0 ? Math.round(Number(set_number)) : 1;
          const created = [];
          let pending = codes.length;

          const done = () => {
            pending -= 1;
            if (pending > 0) return;
            for (const action of created) emitToSession(session.id, 'action:add', { action });
            res.status(201).json({ action: created[0], actions: created });
          };

          if (codes.length === 0) return res.status(400).json({ error: 'Code invalide' });

          for (const one of codes) {
            const parts = decomposeCode(one);
            const currentSeq = seq;
            seq += 1;
            db.run(
              `INSERT INTO live_actions
                (session_id, effective_time, seq, member_id, assigned, code, system_time, team, player_number,
                 action, evaluation, type, start_zone, end_zone, end_subzone, attack_zone, set_number)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                session.id,
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
                parts.end_subzone || null,
                attack_zone ?? parts.start_zone ?? null,
                setNumber,
              ],
              function (err2) {
                if (err2) return res.status(500).json({ error: 'Failed to save action' });
                created.push({
                  id: this.lastID,
                  session_id: session.id,
                  effective_time: eff,
                  seq: currentSeq,
                  member_id: myMember ? myMember.id : null,
                  assigned: isAssigned,
                  code: one,
                  system_time: sys,
                  attack_zone: attack_zone ?? parts.start_zone ?? null,
                  // Le set est celui du codage au moment de la saisie : il fait
                  // foi partout ensuite (replay, rapport, conversion DataVolley).
                  set_number: setNumber,
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

// Modifier une action (code + effective_time + assigned).
router.patch('/:sessionId/actions/:actionId', authenticateToken, (req, res) => {
  const { code, effective_time, assigned, attack_zone } = req.body || {};
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
          const newEff = typeof effective_time === 'number' && !Number.isNaN(effective_time)
            ? effective_time
            : existing.effective_time;
          const newAssigned = (assigned === false || assigned === 0)
            ? 0
            : (assigned === true || assigned === 1 ? 1 : existing.assigned);
          const newZone = attack_zone !== undefined ? attack_zone : existing.attack_zone;
          const parts = decomposeCode(newCode);

          db.run(
            `UPDATE live_actions
                SET code = ?, effective_time = ?, assigned = ?, team = ?, player_number = ?, action = ?,
                    evaluation = ?, type = ?, start_zone = ?, end_zone = ?, end_subzone = ?, attack_zone = ?
              WHERE id = ?`,
            [
              newCode, newEff, newAssigned, parts.team, parts.player_number, parts.action,
              parts.evaluation, parts.type || null, parts.start_zone || null, parts.end_zone || null,
              parts.end_subzone || null, newZone ?? parts.start_zone ?? null, actionId,
            ],
            (err2) => {
              if (err2) return res.status(500).json({ error: 'Failed to update action' });
              const action = { ...existing, code: newCode, effective_time: newEff, assigned: newAssigned, attack_zone: newZone, ...parts };
              emitToSession(session.id, 'action:update', { action });
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
      db.run(
        'DELETE FROM live_actions WHERE id = ? AND session_id = ?',
        [actionId, session.id],
        function (err) {
          if (err) return res.status(500).json({ error: 'Database error' });
          emitToSession(session.id, 'action:delete', { actionId });
          res.json({ message: 'Action supprimée' });
        }
      );
    });
  });
});

// --- Synchronisation du point (statisticiens multiples) -----------------------

// Marque le point comme terminé par le statisticien courant. Quand tous les
// statisticiens ont terminé le point en cours, le numéro de point avance.
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
              res.json(payload);
            }
          );
        }
      );
    });
  });
});

// --- Flux caméra : réglage du délai de rediffusion --------------------------

// Le délai (en secondes) est commun à tous les appareils de la session : il
// détermine de combien la vidéo arrive en retard sur la réalité, ce qui laisse
// aux statisticiens le temps de coder le point avant de le revoir à l'écran.
router.put('/:sessionId/video-delay', authenticateToken, (req, res) => {
  const { delay } = req.body || {};
  loadSession(req.params.sessionId, res, (session) => {
    verifyAccess(session, req, res, (s, isOwner, member) => {
      // Le délai est commun à tous les appareils : seul l'organisateur du match
      // (ou le téléphone qui filme) le règle.
      if (!isOwner && member?.role !== 'camera') {
        return res.status(403).json({ error: 'Réglage réservé à l’organisateur ou à la caméra' });
      }
      const seconds = liveStream.setDelay(s.id, delay, (event, payload) =>
        emitToSession(s.id, event, payload)
      );
      db.run('UPDATE live_sessions SET video_delay = ? WHERE id = ?', [seconds, s.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ delay: seconds });
      });
    });
  });
});

// État du flux caméra (utilisé à l'ouverture de l'écran).
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
      db.run(
        'UPDATE live_sessions SET home_team_id = ?, away_team_id = ? WHERE id = ?',
        [home_team_id ?? null, away_team_id ?? null, session.id],
        (err) => {
          if (err) return res.status(500).json({ error: 'Failed to save teams' });
          emitToSession(session.id, 'session:teams', {
            home_team_id: home_team_id ?? null,
            away_team_id: away_team_id ?? null,
          });
          res.json({ home_team_id: home_team_id ?? null, away_team_id: away_team_id ?? null });
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
        res.json({ message: 'Setups saved' });
      });
    });
  });
});

// --- Finalisation de l'enregistrement du direct (replay ancré) --------------
// Transcode la piste enregistrée en MP4 (+ proxy), crée la vidéo, ancre le
// temps système de la session sur la piste, et recopie les actions codées en
// live vers les actions de la vidéo (avec leur timecode ancré).
router.post('/:sessionId/finalize-recording', authenticateToken, (req, res) => {
  const { sessionId } = req.params;
  loadSession(sessionId, res, (session) => {
    verifyAccess(session, req, res, async () => {
      const info = liveRecord.lastRecording(sessionId);
      if (!info || !fs.existsSync(info.path)) {
        return res.status(404).json({ error: "Aucun enregistrement à finaliser pour cette session." });
      }
      try {
        fs.ensureDirSync(uploadsDir);
        fs.ensureDirSync(proxyDir);
        const ffmpeg = require('fluent-ffmpeg');
        const stamp = Date.now();
        const mp4Name = `live_${sessionId}_${stamp}.mp4`;
        const mp4Path = path.join(uploadsDir, mp4Name);
        await new Promise((resolve, reject) => {
          ffmpeg(info.path)
            .outputOptions(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'])
            .on('end', resolve)
            .on('error', reject)
            .save(mp4Path);
        });
        const proxyName = `proxy_live_${sessionId}_${stamp}.mp4`;
        const proxyPath = path.join(proxyDir, proxyName);
        await generateProxy(mp4Path, proxyPath);

        const delayS = Number(session.video_delay) >= 0 ? Number(session.video_delay) : 0;
        const anchorSystemTime = Math.floor((info.startedAt + delayS * 1000) / 1000);
        // Équipes choisies pour le direct : elles deviennent celles du match
        // Data Volley (filtres du Centre Vidéo, rapports par équipe).
        const homeTeamId = session.home_team_id ? Number(session.home_team_id) : null;
        const awayTeamId = session.away_team_id ? Number(session.away_team_id) : null;

        db.run(
          `INSERT INTO videos (user_id, filename, original_name, display_name, filepath, filepath_proxy,
             team1_name, team2_name, home_team_id, away_team_id, status, sync_uuid, dirty, local_updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, 1, ?)`,
          [
            req.user.id,
            mp4Name,
            `${session.name}.mp4`,
            `Direct — ${session.name}`,
            mp4Path,
            proxyPath,
            session.team1_name,
            session.team2_name,
            homeTeamId,
            awayTeamId,
            uuidv4(),
            new Date().toISOString(),
          ],
          function (err) {
            if (err) return res.status(500).json({ error: 'Failed to create video' });
            const videoId = this.lastID;
            if (homeTeamId || awayTeamId) {
              db.run(
                'INSERT OR REPLACE INTO volley_matches (video_id, home_team_id, away_team_id) VALUES (?, ?, ?)',
                [videoId, homeTeamId, awayTeamId],
                () => {}
              );
            }
            db.run(
              `INSERT OR REPLACE INTO volley_sync (video_id, anchor_timecode, anchor_system_time, lead_in, lead_out) VALUES (?, 0, ?, 4, 3)`,
              [videoId, anchorSystemTime]
            );
            db.run('UPDATE live_sessions SET video_id = ? WHERE id = ?', [videoId, sessionId]);
            // La nouvelle vidéo doit apparaître sans rechargement dans le Centre
            // Vidéo et dans la liste Data Volley (et partir vers le cloud si la
            // synchronisation est configurée, comme un upload classique).
            emitCollectionChanged('videos');
            syncHub.videos.syncNow({ reason: 'live-finalize' }).catch(() => {});

            db.all('SELECT * FROM live_actions WHERE session_id = ? ORDER BY effective_time ASC, seq ASC', [sessionId], (err2, actions) => {
              if (err2) return res.status(500).json({ error: 'Database error' });
              const rows = actions || [];
              if (!rows.length) return res.json({ videoId, actionCount: 0 });
              db.run('BEGIN TRANSACTION', () => {
                const stmt = db.prepare(
                  `INSERT INTO volley_actions (video_id, action_index, code, timecode, system_time, team, player_number, action, evaluation, type, start_zone, end_zone, end_subzone, set_number, note, attack_zone)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );
                stmt.on('error', () => {});
                rows.forEach((a, i) => {
                  const parts = decomposeCode(a.code);
                  const timecode = typeof a.system_time === 'number' ? a.system_time - anchorSystemTime : null;
                  // Le numéro de set saisi pendant le direct est recopié tel quel :
                  // c'est la référence unique pour regrouper replay et rapports.
                  const setNumber = Number(a.set_number) > 0 ? Math.round(Number(a.set_number)) : 1;
                  stmt.run(
                    videoId, i, a.code, timecode, a.system_time ?? null,
                    a.team || parts.team, a.player_number ?? parts.player_number, a.action || parts.action,
                    a.evaluation || parts.evaluation, parts.type || null, parts.start_zone || null,
                    parts.end_zone || null, parts.end_subzone || null, setNumber, null,
                    a.attack_zone ?? parts.start_zone ?? null
                  );
                });
                stmt.finalize(() => db.run('COMMIT', () => {
                  // Les actions copiées alimentent le codage Data Volley du replay.
                  emitCollectionChanged('actions');
                  res.json({ videoId, actionCount: rows.length });
                }));
              });
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
