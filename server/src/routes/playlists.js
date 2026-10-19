// ============================================================================
// Playlists de séance (mode « Playlists »).
//
// Une playlist réunit des actions choisies à la main, éventuellement issues de
// plusieurs matchs : une ligne en base, les entrées embarquées en JSON (même
// principe que les flèches des trajectoires). Chaque entrée garde la référence
// du match (video_id + video_uuid) et un instantané lisible (libellés, code,
// timecodes du segment), afin de rester jouable même si le codage évolue.
//
// Version locale : aucune synchronisation cloud n'est encore branchée, mais la
// table porte déjà les colonnes de partage (sync_uuid, dirty, deleted…) et les
// autres postes du réseau local sont prévenus en temps réel.
// ============================================================================

const express = require('express');
const crypto = require('crypto');
const fs = require('fs-extra');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const clipExport = require('../clipExport');
const { emitCollectionChanged } = require('../socket');

const router = express.Router();

/** Prévient les autres postes (réseau local) qu'une playlist a changé. */
function emitChanged() {
  emitCollectionChanged('playlists');
}

/** Entrées d'une playlist, quel que soit leur format en base (TEXT JSON). */
function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Sérialise les entrées reçues du client (tableau uniquement). */
function serializeItems(items) {
  if (!Array.isArray(items)) return null;
  return JSON.stringify(items);
}

/** Playlist exposée au client : entrées déjà analysées. */
function publicPlaylist(row) {
  if (!row) return null;
  const { items, ...rest } = row;
  return { ...rest, items: parseItems(items) };
}

/** Playlist non supprimée. */
function getPlaylist(id, callback) {
  db.get('SELECT * FROM playlists WHERE id = ? AND COALESCE(deleted, 0) = 0', [id], (err, row) => {
    if (err) return callback(err);
    callback(null, row || null);
  });
}

/** Marque une playlist comme modifiée localement (et à envoyer au cloud). */
function touchLocal(id, callback) {
  db.run(
    'UPDATE playlists SET dirty = 1, local_updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id],
    (err) => {
      if (callback) callback(err);
    }
  );
}

// Matchs proposés au parcours : les vidéos qui ont au moins une action codée.
// Le fichier vidéo reste local ; `filename` indique s'il est lisible ici.
router.get('/sources', authenticateToken, (req, res) => {
  db.all(
    `SELECT v.id, v.display_name, v.original_name, v.filename, v.sync_uuid,
            v.team1_name, v.team2_name, v.duration, v.created_at,
            COUNT(a.id) AS action_count
       FROM videos v
       JOIN volley_actions a ON a.video_id = v.id AND COALESCE(a.deleted, 0) = 0
      WHERE v.user_id = ? AND COALESCE(v.deleted, 0) = 0
      GROUP BY v.id
      ORDER BY v.created_at DESC, v.id DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ sources: rows || [] });
    }
  );
});

// Liste des playlists (entrées incluses : la liste affiche les compteurs).
router.get('/', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM playlists
      WHERE COALESCE(deleted, 0) = 0
      ORDER BY COALESCE(local_updated_at, created_at) DESC, id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ playlists: (rows || []).map(publicPlaylist) });
    }
  );
});

// Création : nom + entrées (facultatives à la création).
router.post('/', authenticateToken, (req, res) => {
  const { name, description, items } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Le nom de la playlist est requis.' });
  const serialized = serializeItems(items || []);
  if (serialized == null) return res.status(400).json({ error: 'Entrées invalides.' });

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO playlists (user_id, name, description, items, created_by, sync_uuid, dirty, deleted, local_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    [req.user.id, cleanName, description || null, serialized, req.user.email || null, crypto.randomUUID(), now],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      getPlaylist(this.lastID, (err2, row) => {
        if (err2 || !row) return res.status(500).json({ error: 'Database error' });
        emitChanged();
        res.status(201).json({ playlist: publicPlaylist(row) });
      });
    }
  );
});

// ============================================================================
// EXPORT DE CLIPS MP4 (mode « Playlists »).
//
// Les extraits sont découpés par ffmpeg (embarqué dans l'application) puis
// rassemblés : un fichier par groupe (playlist entière, joueur, poste de départ,
// ou joueur × poste), et en option un fichier par action. Le tout est livré dans
// un dossier ZIP avec la feuille de séance (CSV).
//
// Le travail tourne en tâche de fond : POST /:id/export renvoie un identifiant,
// le client interroge /exports/:jobId puis télécharge /exports/:jobId/download.
// ============================================================================

const GROUP_BY_OPTIONS = ['playlist', 'player', 'poste', 'player-poste'];
const EXPORT_MODES = ['copy', 'precise'];

/** Chemins locaux des vidéos d'une playlist (les fichiers absents sont ignorés). */
function resolveVideoFilepaths(items, callback) {
  const ids = [...new Set((items || []).map((it) => Number(it.video_id)).filter((n) => n > 0))];
  if (ids.length === 0) return callback(null, new Map());
  const placeholders = ids.map(() => '?').join(', ');
  db.all(
    `SELECT id, filepath FROM videos WHERE id IN (${placeholders}) AND COALESCE(deleted, 0) = 0`,
    ids,
    (err, rows) => {
      if (err) return callback(err);
      const map = new Map();
      for (const row of rows || []) {
        if (row.filepath && fs.existsSync(row.filepath)) map.set(Number(row.id), row.filepath);
      }
      callback(null, map);
    }
  );
}

// Lance l'export d'une playlist (tâche de fond).
router.post('/:id/export', authenticateToken, (req, res) => {
  const { groupBy = 'playlist', mode = 'copy', includeClips = false } = req.body || {};
  if (!GROUP_BY_OPTIONS.includes(groupBy)) {
    return res.status(400).json({ error: 'Groupement inconnu.' });
  }
  if (!EXPORT_MODES.includes(mode)) {
    return res.status(400).json({ error: 'Mode d’export inconnu.' });
  }

  getPlaylist(req.params.id, (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Playlist introuvable.' });

    const items = parseItems(row.items);
    if (items.length === 0) return res.status(400).json({ error: 'Cette playlist est vide.' });

    resolveVideoFilepaths(items, (err2, paths) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      const enriched = items.map((it) => ({ ...it, filepath: paths.get(Number(it.video_id)) || null }));
      const { jobId } = clipExport.startExport({
        items: enriched,
        groupBy,
        mode,
        includeClips: Boolean(includeClips),
        name: row.name,
      });
      res.status(202).json({ job: clipExport.getJob(jobId) });
    });
  });
});

// Avancement d'un export.
router.get('/exports/:jobId', authenticateToken, (req, res) => {
  const job = clipExport.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Export inconnu (le serveur a peut-être redémarré).' });
  }
  res.json({ job });
});

// Téléchargement du ZIP. Identifiant aléatoire, comme les fichiers vidéo servis
// par /api/videos/file/:filename : mêmes fichiers locaux, même poste.
router.get('/exports/:jobId/download', (req, res) => {
  const zipPath = clipExport.jobZipPath(req.params.jobId);
  if (!zipPath) return res.status(404).json({ error: 'Export indisponible.' });
  const job = clipExport.getJob(req.params.jobId);
  res.download(zipPath, job?.zipName || 'playlist_clips.zip', (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Téléchargement impossible.' });
  });
});

// Abandon d'un export (libère les fichiers temporaires).
router.delete('/exports/:jobId', authenticateToken, async (req, res) => {
  const removed = await clipExport.cleanupJob(req.params.jobId);
  res.json({ removed });
});

// Une playlist précise (entrées analysées).
router.get('/:id', authenticateToken, (req, res) => {
  getPlaylist(req.params.id, (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Playlist introuvable.' });
    res.json({ playlist: publicPlaylist(row) });
  });
});

// Modification : nom, description et/ou entrées (mise à jour partielle).
router.patch('/:id', authenticateToken, (req, res) => {
  const { name, description, items } = req.body || {};
  getPlaylist(req.params.id, (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Playlist introuvable.' });

    const fields = [];
    const values = [];
    if (name != null) {
      const cleanName = String(name).trim();
      if (!cleanName) return res.status(400).json({ error: 'Le nom de la playlist est requis.' });
      fields.push('name = ?');
      values.push(cleanName);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description || null);
    }
    if (items !== undefined) {
      const serialized = serializeItems(items);
      if (serialized == null) return res.status(400).json({ error: 'Entrées invalides.' });
      fields.push('items = ?');
      values.push(serialized);
    }
    if (fields.length === 0) return res.json({ playlist: publicPlaylist(row) });

    values.push(req.params.id);
    db.run(`UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`, values, (err2) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      touchLocal(req.params.id, (err3) => {
        if (err3) return res.status(500).json({ error: 'Database error' });
        getPlaylist(req.params.id, (err4, updated) => {
          if (err4 || !updated) return res.status(500).json({ error: 'Database error' });
          emitChanged();
          res.json({ playlist: publicPlaylist(updated) });
        });
      });
    });
  });
});

// Suppression : pierre tombale (la suppression pourra se propager au cloud).
router.delete('/:id', authenticateToken, (req, res) => {
  getPlaylist(req.params.id, (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Playlist introuvable.' });
    db.run(
      'UPDATE playlists SET deleted = 1, dirty = 1, local_updated_at = ? WHERE id = ?',
      [new Date().toISOString(), req.params.id],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        emitChanged();
        res.json({ message: 'Playlist supprimée.' });
      }
    );
  });
});

module.exports = router;


