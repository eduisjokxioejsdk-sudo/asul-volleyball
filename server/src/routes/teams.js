const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const { emitTeamsChanged } = require('../socket');
const teamsSync = require('../teamsSync');

const router = express.Router();

// Équipes partagées (globales) : accessibles à tous les appareils connectés,
// quel que soit l'utilisateur. La création/modification est diffusée en temps
// réel aux appareils connectés via Socket.IO et, si elle est configurée,
// synchronisée avec le cloud (Supabase) pour être partagée à distance —
// voir server/src/teamsSync.js.

/** Marque une équipe comme modifiée localement (à envoyer au cloud). */
function touchLocal(teamId) {
  db.run(
    'UPDATE teams SET dirty = 1, local_updated_at = ? WHERE id = ?',
    [new Date().toISOString(), teamId],
    () => {}
  );
}

/**
 * Lance un cycle de synchronisation sans jamais faire attendre la réponse HTTP :
 * si le cloud est injoignable, l'écriture locale reste valable et sera envoyée
 * au cycle suivant.
 */
function triggerSync() {
  teamsSync.syncNow({ reason: 'api' }).catch((err) => {
    console.warn('Synchronisation des équipes :', err.message);
  });
}

function loadTeams(callback) {
  db.all(
    'SELECT * FROM teams WHERE COALESCE(deleted, 0) = 0 ORDER BY name COLLATE NOCASE ASC, id ASC',
    (err, teams) => {
      if (err) return callback(err);
      if (!teams || teams.length === 0) return callback(null, []);
      let pending = teams.length;
      const result = [];
      for (const team of teams) {
        db.all(
          'SELECT * FROM team_players WHERE team_id = ? ORDER BY number ASC, id ASC',
          [team.id],
          (err2, players) => {
            result.push({ ...team, players: players || [] });
            pending -= 1;
            if (pending === 0) {
              result.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id - b.id);
              callback(null, result);
            }
          }
        );
      }
    }
  );
}

// Récupère la liste complète des équipes (avec leurs joueurs).
router.get('/', authenticateToken, (req, res) => {
  loadTeams((err, teams) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ teams });
  });
});

// Remplace la liste des joueurs d'une équipe (n° + nom + rôle).
function savePlayers(teamId, players, callback) {
  db.run('DELETE FROM team_players WHERE team_id = ?', [teamId], (err) => {
    if (err) return callback(err);
    if (!players || players.length === 0) return callback(null);
    const stmt = db.prepare(
      'INSERT INTO team_players (team_id, number, name, role, serve_type) VALUES (?, ?, ?, ?, ?)'
    );
    players.forEach((p) => {
      stmt.run(
        teamId,
        Number(p.number) || 0,
        (p.name || '').trim() || `N°${p.number}`,
        p.role || 'universal',
        p.serve_type || null
      );
    });
    stmt.finalize((err2) => callback(err2 || null));
  });
}

// Enregistre les réglages d'équipe (libéro + joueur remplacé).
function saveTeamSettings(teamId, libero, liberoFor, callback) {
  db.run(
    'UPDATE teams SET libero = ?, libero_for = ? WHERE id = ?',
    [libero == null || libero === '' ? null : Number(libero), liberoFor == null || liberoFor === '' ? null : Number(liberoFor), teamId],
    (err) => callback(err || null)
  );
}

// Crée une équipe (nom + joueurs + libéro).
router.post('/', authenticateToken, (req, res) => {
  const { name, players, libero, libero_for } = req.body || {};
  const teamName = (name || '').trim();
  if (!teamName) return res.status(400).json({ error: 'Le nom de l’équipe est requis' });

  // Identifiant partagé posé dès la création : l'équipe pourra être reconnue
  // par les autres postes lors de la synchronisation cloud.
  db.run(
    'INSERT INTO teams (name, sync_uuid, dirty, deleted, local_updated_at) VALUES (?, ?, 1, 0, ?)',
    [teamName, crypto.randomUUID(), new Date().toISOString()],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      const teamId = this.lastID;
      savePlayers(teamId, players, (err2) => {
        if (err2) return res.status(500).json({ error: 'Failed to save players' });
        saveTeamSettings(teamId, libero, libero_for, (err3) => {
          if (err3) return res.status(500).json({ error: 'Failed to save team settings' });
          emitTeamsChanged();
          triggerSync();
          loadTeams((err4, teams) => {
            if (err4) return res.status(500).json({ error: 'Database error' });
            res.status(201).json({ team: teams.find((t) => t.id === teamId), teams });
          });
        });
      });
    }
  );
});

// Met à jour une équipe (nom + joueurs + libéro).
router.patch('/:id', authenticateToken, (req, res) => {
  const teamId = Number(req.params.id);
  const { name, players, libero, libero_for } = req.body || {};
  const teamName = (name || '').trim();

  db.get('SELECT * FROM teams WHERE id = ?', [teamId], (err, team) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

    const apply = () => {
      savePlayers(teamId, players, (err2) => {
        if (err2) return res.status(500).json({ error: 'Failed to save players' });
        saveTeamSettings(teamId, libero, libero_for, (err3) => {
          if (err3) return res.status(500).json({ error: 'Failed to save team settings' });
          touchLocal(teamId);
          emitTeamsChanged();
          triggerSync();
          loadTeams((err4, teams) => {
            if (err4) return res.status(500).json({ error: 'Database error' });
            res.json({ team: teams.find((t) => t.id === teamId), teams });
          });
        });
      });
    };

    if (teamName && teamName !== team.name) {
      db.run('UPDATE teams SET name = ? WHERE id = ?', [teamName, teamId], (err4) => {
        if (err4) return res.status(500).json({ error: 'Database error' });
        apply();
      });
    } else {
      apply();
    }
  });
});

// Supprime une équipe : pierre tombale (deleted = 1) et non effacement réel,
// afin que la suppression soit propagée aux autres postes par le cloud.
router.delete('/:id', authenticateToken, (req, res) => {
  const teamId = Number(req.params.id);
  db.run(
    'UPDATE teams SET deleted = 1, dirty = 1, local_updated_at = ? WHERE id = ?',
    [new Date().toISOString(), teamId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      emitTeamsChanged();
      triggerSync();
      res.json({ message: 'Équipe supprimée' });
    }
  );
});

// ---------------------------------------------------------------------------
// Partage à distance (synchronisation cloud)
// ---------------------------------------------------------------------------

// Synchronise immédiatement (bouton « Synchroniser maintenant »).
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const result = await teamsSync.syncNow({ reason: 'manual' });
    const status = await teamsSync.getSyncStatus();
    res.json({ result, status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// État de la synchronisation cloud (utilisé par la page « Équipes »).
router.get('/sync/status', authenticateToken, async (req, res) => {
  try {
    res.json(await teamsSync.getSyncStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enregistre la configuration cloud (URL + clé Supabase) puis relance la boucle.
router.put('/sync/config', authenticateToken, async (req, res) => {
  const { enabled, url, key, table } = req.body || {};
  const cleanUrl = url == null ? null : String(url).trim();
  if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
    return res.status(400).json({ error: 'L’URL doit commencer par https://' });
  }
  try {
    teamsSync.saveSyncConfig({ enabled, url: cleanUrl, key, table });
    teamsSync.restartSyncLoop();

    const cfg = teamsSync.getSyncConfig();
    let check = { ok: false, error: null };
    if (cfg.enabled) {
      try {
        await teamsSync.testConnection(cfg);
        check = { ok: true, error: null };
      } catch (err) {
        check = { ok: false, error: err.message };
      }
    }
    res.json({
      config: {
        configured: cfg.configured,
        enabled: cfg.enabled,
        url: cfg.url,
        hasKey: Boolean(cfg.key),
        table: cfg.table,
      },
      check,
      status: await teamsSync.getSyncStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
