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

// Remplace la liste des joueurs d'une équipe (attributs complets DV4 / FFVB).
function savePlayers(teamId, players, callback) {
  db.run('DELETE FROM team_players WHERE team_id = ?', [teamId], (err) => {
    if (err) return callback(err);
    if (!players || players.length === 0) return callback(null);
    const stmt = db.prepare(
      `INSERT INTO team_players
        (team_id, number, name, role, secondary_role, serve_type, license_number,
         first_name, last_name, height_cm, birth_year, handedness, is_captain, is_libero, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    players.forEach((p) => {
      const fullName =
        (p.name || '').trim() ||
        [p.last_name, p.first_name].filter(Boolean).join(' ').trim() ||
        `N°${p.number}`;
      const isLib = p.is_libero ? 1 : p.role === 'libero' ? 1 : 0;
      stmt.run(
        teamId,
        Number(p.number) || 0,
        fullName,
        p.role || (isLib ? 'libero' : 'universal'),
        p.secondary_role || null,
        p.serve_type || null,
        p.license_number ? String(p.license_number).trim() : null,
        p.first_name ? String(p.first_name).trim() : null,
        p.last_name ? String(p.last_name).trim() : null,
        p.height_cm ? Number(p.height_cm) : null,
        p.birth_year ? Number(p.birth_year) : null,
        p.handedness || 'R',
        p.is_captain ? 1 : 0,
        isLib,
        p.active === false || p.active === 0 ? 0 : 1
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

// Annuaire global des joueurs tous clubs confondus (dédoublonné par licence ou nom).
router.get('/players/directory', authenticateToken, (req, res) => {
  db.all(
    `SELECT tp.*, t.name AS team_name
       FROM team_players tp
       JOIN teams t ON t.id = tp.team_id
      WHERE COALESCE(t.deleted, 0) = 0
      ORDER BY tp.name COLLATE NOCASE ASC, tp.number ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ players: rows || [] });
    }
  );
});

// Importation ou fusion d'une ou deux équipes (depuis Feuille de Match FFVB, .dvw ou CSV)
router.post('/import-batch', authenticateToken, (req, res) => {
  const { teams: incomingTeams } = req.body || {};
  if (!Array.isArray(incomingTeams) || incomingTeams.length === 0) {
    return res.status(400).json({ error: 'Aucune équipe à importer' });
  }

  loadTeams((err, existingTeams) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    let idx = 0;
    const importedIds = [];

    const processNext = () => {
      if (idx >= incomingTeams.length) {
        emitTeamsChanged();
        triggerSync();
        return loadTeams((errFinal, allTeams) => {
          if (errFinal) return res.status(500).json({ error: 'Database error' });
          res.json({
            importedIds,
            teams: allTeams,
          });
        });
      }

      const item = incomingTeams[idx++];
      const tName = String(item?.name || '').trim();
      if (!tName) return processNext();

      const found = (existingTeams || []).find(
        (et) => et.name.trim().toLowerCase() === tName.toLowerCase()
      );

      // Fusionner l'effectif existant avec les nouveaux joueurs (par license_number ou number)
      const mergeRoster = (oldPlayers, newPlayers) => {
        const byNum = new Map();
        for (const op of oldPlayers || []) {
          byNum.set(Number(op.number), { ...op });
        }
        for (const np of newPlayers || []) {
          const num = Number(np.number);
          if (!num) continue;
          const prev = byNum.get(num) || {};
          byNum.set(num, {
            ...prev,
            ...np,
            number: num,
            name: (np.name || prev.name || `N°${num}`).trim(),
            role: np.role || prev.role || (np.is_libero ? 'libero' : 'universal'),
            license_number: np.license_number || prev.license_number || null,
            height_cm: np.height_cm || prev.height_cm || null,
            birth_year: np.birth_year || prev.birth_year || null,
            handedness: np.handedness || prev.handedness || 'R',
            is_captain: np.is_captain ?? prev.is_captain ?? 0,
            is_libero: np.is_libero ?? prev.is_libero ?? 0,
          });
        }
        return Array.from(byNum.values()).sort((a, b) => a.number - b.number);
      };

      if (found) {
        const merged = mergeRoster(found.players, item.players);
        const lib = item.libero ?? found.libero ?? null;
        const libFor = item.libero_for ?? found.libero_for ?? null;
        savePlayers(found.id, merged, () => {
          saveTeamSettings(found.id, lib, libFor, () => {
            touchLocal(found.id);
            importedIds.push(found.id);
            processNext();
          });
        });
      } else {
        db.run(
          'INSERT INTO teams (name, sync_uuid, dirty, deleted, local_updated_at) VALUES (?, ?, 1, 0, ?)',
          [tName, crypto.randomUUID(), new Date().toISOString()],
          function (insErr) {
            if (insErr) return processNext();
            const newId = this.lastID;
            savePlayers(newId, item.players || [], () => {
              saveTeamSettings(newId, item.libero ?? null, item.libero_for ?? null, () => {
                importedIds.push(newId);
                processNext();
              });
            });
          }
        );
      }
    };

    processNext();
  });
});

module.exports = router;
