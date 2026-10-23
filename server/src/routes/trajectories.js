const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const syncHub = require('../syncHub');
const { emitCollectionChanged } = require('../socket');
const { mountSyncRoutes } = require('./sync');

const router = express.Router();

/** Marque une fiche comme modifiée localement (à envoyer au cloud). */
function touchLocal(matchId) {
  db.run(
    'UPDATE trajectory_matches SET dirty = 1, local_updated_at = ? WHERE id = ?',
    [new Date().toISOString(), matchId],
    () => {}
  );
}

/** Lance un cycle de synchronisation sans jamais bloquer la réponse HTTP. */
function triggerSync() {
  syncHub.trajectories.syncNow({ reason: 'api' }).catch((err) => {
    console.warn('Synchronisation des trajectoires :', err.message);
  });
}

/** Prévient les autres postes qu'une fiche a changé (temps réel). */
function emitChanged() {
  emitCollectionChanged('trajectories');
}

// Partage à distance : état, synchronisation manuelle, configuration.
mountSyncRoutes(router, syncHub.trajectories);

// ============================================================================
// Fiches de trajectoire (outil temporaire de marquage service / attaque).
// Un match porte 1 ou 2 équipes de la table `teams` (partagée) et une liste de
// flèches, une par frappe et par joueur. Les fiches sont partagées comme les
// équipes : tout le monde les voit, seul le créateur peut les supprimer.
// ============================================================================

const TEAM_SIDES = ['home', 'away'];
const SHOT_KINDS = ['serve', 'attack'];
// À garder aligné avec TRAJECTORY_RESULTS (client/src/utils/trajectory.js) :
// « contree » = balle contrée par le contre adverse (attaque uniquement).
const SHOT_RESULTS = ['point', 'feinte_point', 'feinte_continuite', 'continuite', 'faute', 'contree', 'out'];

/** Équipes demandées (avec leurs joueurs), indexées par id. */
function loadTeamsByIds(ids, callback) {
  const wanted = [...new Set(ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
  if (wanted.length === 0) return callback(null, new Map());
  const placeholders = wanted.map(() => '?').join(', ');
  db.all(
    `SELECT * FROM teams WHERE id IN (${placeholders}) AND COALESCE(deleted, 0) = 0`,
    wanted,
    (err, rows) => {
      if (err) return callback(err);
      const teams = rows || [];
      if (teams.length === 0) return callback(null, new Map());
      let pending = teams.length;
      const map = new Map();
      for (const team of teams) {
        db.all(
          'SELECT * FROM team_players WHERE team_id = ? ORDER BY number ASC, id ASC',
          [team.id],
          (err2, players) => {
            if (err2) return callback(err2);
            map.set(Number(team.id), { ...team, players: players || [] });
            pending -= 1;
            if (pending === 0) callback(null, map);
          }
        );
      }
    }
  );
}

/** Équipe exposée au client : identité + effectif (n°, nom, rôle). */
function publicTeam(team) {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    libero: team.libero ?? null,
    libero_for: team.libero_for ?? null,
    players: (team.players || []).map((p) => ({
      number: p.number,
      name: p.name,
      role: p.role || 'universal',
    })),
  };
}

/** Match enrichi des équipes complètes (fiche + joueurs) quand elles existent. */
function decorateMatch(match, teamsMap) {
  const home = match?.home_team_id ? teamsMap.get(Number(match.home_team_id)) : null;
  const away = match?.away_team_id ? teamsMap.get(Number(match.away_team_id)) : null;
  return { ...match, home_team: publicTeam(home), away_team: publicTeam(away) };
}

// Liste des fiches (partagée) avec le nombre de flèches marquées.
router.get('/', authenticateToken, (req, res) => {
  db.all(
    `SELECT m.*,
            (SELECT COUNT(*) FROM trajectory_shots s WHERE s.match_id = m.id) AS shot_count,
            (SELECT COUNT(*) FROM trajectory_shots s
              WHERE s.match_id = m.id AND s.result IN ('faute', 'out')) AS error_count
       v.original_name as video_original_name,
            v.display_name as video_display_name,
            v.filename as video_filename
       FROM trajectory_matches m
       LEFT JOIN videos v ON v.id = m.video_id
      WHERE COALESCE(m.deleted, 0) = 0
      ORDER BY m.created_at DESC, m.id DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ matches: rows || [] });
    }
  );
});

// Crée une fiche : nom + 1 ou 2 équipes de la liste partagée.
router.post('/', authenticateToken, (req, res) => {
  const { name, home_team_id, away_team_id, video_id } = req.body || {};
  const homeId = Number(home_team_id) || null;
  const awayId = Number(away_team_id) || null;
  const videoId = Number(video_id) || null;

  if (!homeId && !awayId) return res.status(400).json({ error: 'Sélectionnez au moins une équipe' });
  if (homeId && awayId && homeId === awayId) {
    return res.status(400).json({ error: 'Choisissez deux équipes différentes' });
  }

  loadTeamsByIds([homeId, awayId], (err, teamsMap) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (homeId && !teamsMap.has(homeId)) return res.status(404).json({ error: 'Équipe 1 introuvable' });
    if (awayId && !teamsMap.has(awayId)) return res.status(404).json({ error: 'Équipe 2 introuvable' });

    const home = homeId ? teamsMap.get(homeId) : null;
    const away = awayId ? teamsMap.get(awayId) : null;
    const pairName = [home?.name, away?.name].filter(Boolean).join(' vs ');
    const finalName = (name || '').trim() || `${pairName} — ${new Date().toLocaleDateString('fr-FR')}`;

    db.run(
      `INSERT INTO trajectory_matches (user_id, name, home_team_id, away_team_id, video_id, team1_name, team2_name, created_by, dirty, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [req.user.id, finalName, homeId, awayId, videoId, home?.name || null, away?.name || null, req.user.email || null, new Date().toISOString()],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Database error' });
        const insertedId = this.lastID;
        db.get('SELECT * FROM trajectory_matches WHERE id = ?', [insertedId], (err3, row) => {
          if (err3) return res.status(500).json({ error: 'Database error' });
          emitChanged();
          triggerSync();
          res.status(201).json({ match: decorateMatch(row, teamsMap) });
        });
      }
    );
  });
});

/** Vérifie une flèche reçue du client. Renvoie un message d'erreur ou null. */
function shotError(shot) {
  if (!shot || typeof shot !== 'object') return 'Flèche invalide';
  if (!TEAM_SIDES.includes(shot.team_side)) return 'Côté d’équipe invalide';
  if (!SHOT_KINDS.includes(shot.kind)) return 'Type de frappe invalide';
  if (!SHOT_RESULTS.includes(shot.result)) return 'Issue invalide';
  const coords = [shot.start?.x, shot.start?.y, shot.end?.x, shot.end?.y];
  if (coords.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return 'Coordonnées invalides';
  const player = Number(shot.player_number);
  if (!Number.isInteger(player) || player <= 0) return 'Numéro de joueur invalide';
  return null;
}

// Rapport global d'une équipe : toutes les flèches de TOUS ses matchs réunies,
// qu'elle ait été marquée comme équipe 1 (home) ou équipe 2 (away). Les côtés
// sont ramenés à 'home' pour que le client affiche l'équipe choisie à gauche,
// comme dans une fiche classique.
router.get('/team/:teamId', authenticateToken, (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'Équipe invalide' });
  }

  loadTeamsByIds([teamId], (err, teamsMap) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const team = teamsMap.get(teamId);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

    db.all(
      `SELECT m.id, m.name, m.created_at,
              CASE WHEN m.home_team_id = ? THEN 'home' ELSE 'away' END AS team_side,
              (SELECT COUNT(*) FROM trajectory_shots s
                WHERE s.match_id = m.id
                  AND s.team_side = CASE WHEN m.home_team_id = ? THEN 'home' ELSE 'away' END) AS shot_count
         FROM trajectory_matches m
        WHERE m.home_team_id = ? OR m.away_team_id = ?
        ORDER BY m.created_at ASC, m.id ASC`,
      [teamId, teamId, teamId, teamId],
      (err2, matches) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        const rows = matches || [];
        if (rows.length === 0) {
          return res.json({ team: publicTeam(team), matches: [], shots: [] });
        }

        const placeholders = rows.map(() => '?').join(', ');
        db.all(
          `SELECT s.*, m.name AS match_name,
                  CASE WHEN m.home_team_id = ? THEN 'home' ELSE 'away' END AS side_of_team
             FROM trajectory_shots s
             JOIN trajectory_matches m ON m.id = s.match_id
            WHERE s.match_id IN (${placeholders})
              AND s.team_side = CASE WHEN m.home_team_id = ? THEN 'home' ELSE 'away' END
            ORDER BY m.created_at ASC, s.id ASC`,
          [teamId, ...rows.map((m) => m.id), teamId],
          (err3, shots) => {
            if (err3) return res.status(500).json({ error: 'Database error' });
            res.json({
              team: publicTeam(team),
              matches: rows,
              // Côté normalisé : l'équipe du rapport occupe toujours la moitié
              // gauche du terrain, quel que soit son côté dans chaque fiche.
              shots: (shots || []).map((shot) => ({ ...shot, team_side: 'home' })),
            });
          }
        );
      }
    );
  });
});

// Détail d'une fiche : match (avec équipes + joueurs) et flèches marquées.
router.get('/:id', authenticateToken, (req, res) => {
  const matchId = Number(req.params.id);
  db.get('SELECT * FROM trajectory_matches WHERE id = ?', [matchId], (err, match) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!match) return res.status(404).json({ error: 'Fiche de trajectoire introuvable' });

    loadTeamsByIds([match.home_team_id, match.away_team_id], (err2, teamsMap) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      db.all(
        'SELECT * FROM trajectory_shots WHERE match_id = ? ORDER BY id ASC',
        [matchId],
        (err3, shots) => {
          if (err3) return res.status(500).json({ error: 'Database error' });
          res.json({ match: decorateMatch(match, teamsMap), shots: shots || [] });
        }
      );
    });
  });
});

// Renomme une fiche (tout le monde peut corriger le libellé, comme pour les
// matchs en direct ; seule la suppression est réservée au créateur).
router.patch('/:id', authenticateToken, (req, res) => {
  const matchId = Number(req.params.id);
  const { name } = req.body || {};
  const newName = (name || '').trim();
  if (!newName) return res.status(400).json({ error: 'Le nom de la fiche est requis' });

  db.run(
    'UPDATE trajectory_matches SET name = ?, dirty = 1, local_updated_at = ? WHERE id = ?',
    [newName, new Date().toISOString(), matchId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Fiche de trajectoire introuvable' });
      db.get('SELECT * FROM trajectory_matches WHERE id = ?', [matchId], (err2, row) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        emitChanged();
        triggerSync();
        res.json({ match: row });
      });
    }
  );
});

// Supprime une fiche (et ses flèches) — réservé à son créateur.
router.delete('/:id', authenticateToken, (req, res) => {
  const matchId = Number(req.params.id);
  db.get('SELECT * FROM trajectory_matches WHERE id = ?', [matchId], (err, match) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!match) return res.status(404).json({ error: 'Fiche de trajectoire introuvable' });
    // Le créateur est reconnu par son email (stable entre postes) quand la fiche
    // vient du cloud, ou par l'id local pour les fiches créées sur ce poste.
    const isCreator =
      (match.created_by && match.created_by === req.user.email) ||
      Number(match.user_id) === Number(req.user.id);
    if (!isCreator) {
      return res.status(403).json({ error: 'Seul le créateur peut supprimer cette fiche' });
    }
    // Pierre tombale (et non effacement) : la suppression est propagée au cloud.
    db.run(
      'UPDATE trajectory_matches SET deleted = 1, dirty = 1, local_updated_at = ? WHERE id = ?',
      [new Date().toISOString(), matchId],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Database error' });
        emitChanged();
        triggerSync();
        res.json({ message: 'Fiche de trajectoire supprimée' });
      }
    );
  });
});

// Remplace toutes les flèches d'une fiche (enregistrement automatique client).
router.post('/:id/shots', authenticateToken, (req, res) => {
  const matchId = Number(req.params.id);
  const { shots } = req.body || {};
  if (!Array.isArray(shots)) return res.status(400).json({ error: 'Tableau de flèches requis' });

  for (const shot of shots) {
    const problem = shotError(shot);
    if (problem) return res.status(400).json({ error: problem });
  }

  db.get('SELECT * FROM trajectory_matches WHERE id = ?', [matchId], (err, match) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!match) return res.status(404).json({ error: 'Fiche de trajectoire introuvable' });

    db.run('BEGIN TRANSACTION', (err2) => {
      if (err2) return res.status(500).json({ error: 'Failed to start transaction' });

      db.run('DELETE FROM trajectory_shots WHERE match_id = ?', [matchId], (err3) => {
        if (err3) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to clear old shots' });
        }

        if (shots.length === 0) {
          return db.run('COMMIT', (err4) => {
            if (err4) return res.status(500).json({ error: 'Failed to commit transaction' });
            touchLocal(matchId);
            emitChanged();
            triggerSync();
            res.json({ message: 'Flèches effacées', count: 0 });
          });
        }

        const stmt = db.prepare(
          `INSERT INTO trajectory_shots
            (match_id, team_side, player_number, kind, start_x, start_y, end_x, end_y, result, set_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        shots.forEach((shot) => {
          stmt.run(
            matchId,
            shot.team_side,
            Number(shot.player_number),
            shot.kind,
            Number(shot.start.x),
            Number(shot.start.y),
            Number(shot.end.x),
            Number(shot.end.y),
            shot.result,
            shot.set_number == null ? null : Number(shot.set_number)
          );
        });

        stmt.finalize((err4) => {
          if (err4) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to save shots' });
          }
          db.run('COMMIT', (err5) => {
            if (err5) return res.status(500).json({ error: 'Failed to commit transaction' });
            touchLocal(matchId);
            emitChanged();
            triggerSync();
            res.json({ message: 'Flèches enregistrées', count: shots.length });
          });
        });
      });
    });
  });
});


// Associe ou dissocie une vidéo DataVolley à une fiche de trajectoire
router.put('/:id/link-video', authenticateToken, (req, res) => {
  const matchId = req.params.id;
  const videoId = req.body.video_id ? Number(req.body.video_id) : null;
  db.run(
    'UPDATE trajectory_matches SET video_id = ?, dirty = 1, local_updated_at = ? WHERE id = ?',
    [videoId, new Date().toISOString(), matchId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      emitChanged();
      res.json({ ok: true, video_id: videoId });
    }
  );
});

module.exports = router;

