// ============================================================================
// Routes API pour les montages vidéo (Chantier 5)
// ============================================================================

const express = require('express');
const fs = require('fs-extra');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const montageEngine = require('../montageEngine');
const { emitCollectionChanged } = require('../socket');

const router = express.Router({ mergeParams: true });

function parseClips(raw) {
  try {
    const clips = JSON.parse(raw || '[]');
    return Array.isArray(clips) ? clips : [];
  } catch {
    return [];
  }
}

function streamFile(req, res, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier vidéo introuvable.' });
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(filePath).pipe(res);
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return res.status(416).end();
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
  if (start > end || start >= stat.size) return res.status(416).end();
  res.writeHead(206, {
    'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': 'video/mp4',
  });
  return fs.createReadStream(filePath, { start, end }).pipe(res);
}

router.get('/share/:token', (req, res) => {
  db.get(
    "SELECT m.title, m.description, m.clips_json, v.team1_name, v.team2_name FROM video_montages m JOIN videos v ON v.id = m.video_id WHERE m.share_token = ? AND m.status = 'completed'",
    [req.params.token],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Partage introuvable ou non terminé.' });
      res.json({ share: {
        title: row.title,
        description: row.description || '',
        teams: [row.team1_name || 'Domicile', row.team2_name || 'Extérieur'],
        clips: parseClips(row.clips_json),
        streamUrl: '/api/videos/share/' + encodeURIComponent(req.params.token) + '/stream',
      } });
    }
  );
});

router.get('/share/:token/stream', (req, res) => {
  db.get(
    "SELECT output_filepath FROM video_montages WHERE share_token = ? AND status = 'completed'",
    [req.params.token],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Partage introuvable ou non terminé.' });
      return streamFile(req, res, row.output_filepath);
    }
  );
});

function verifyVideoOwnership(req, res, callback) {
  const videoId = req.params.videoId || req.body.videoId;
  db.get('SELECT * FROM videos WHERE id = ? AND COALESCE(deleted, 0) = 0', [videoId], (err, video) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    callback(video);
  });
}

// 1. Lister tous les montages d'une vidéo
router.get('/:videoId/montages', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  verifyVideoOwnership(req, res, () => {
    db.all(
      `SELECT * FROM video_montages 
        WHERE video_id = ? 
        ORDER BY created_at DESC`,
      [videoId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ montages: rows || [] });
      }
    );
  });
});

// 2. Récupérer un montage spécifique (pour le polling de progression)
router.get('/:videoId/montages/:montageId', authenticateToken, (req, res) => {
  const { videoId, montageId } = req.params;
  db.get(
    'SELECT * FROM video_montages WHERE id = ? AND video_id = ?',
    [montageId, videoId],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Montage not found' });
      res.json({ montage: row });
    }
  );
});

router.delete('/:videoId/montages/:montageId/share', authenticateToken, (req, res) => {
  const { videoId, montageId } = req.params;
  db.run(
    'UPDATE video_montages SET share_token = NULL WHERE id = ? AND video_id = ? AND user_id = ?',
    [montageId, videoId, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!this.changes) return res.status(404).json({ error: 'Montage introuvable.' });
      emitCollectionChanged('montages');
      res.json({ message: 'Lien de partage révoqué.' });
    }
  );
});

// 3. Lancer la création d'un nouveau montage
router.post('/:videoId/montages', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  const { title, description, clips, options } = req.body;

  if (!Array.isArray(clips) || clips.length === 0) {
    return res.status(400).json({ error: 'La liste des clips est vide.' });
  }
  const safeClips = clips.map((clip) => ({
    ...clip,
    startTime: Math.max(0, Number(clip.startTime) || 0),
    endTime: Math.max(0.5, Number(clip.endTime) || 0.5),
    title: String(clip.title || '').slice(0, 200),
    subtitle: String(clip.subtitle || '').slice(0, 300),
    note: String(clip.note || '').slice(0, 1000),
  }));

  verifyVideoOwnership(req, res, (video) => {
    const videoSourcePath = video.filepath;
    if (!videoSourcePath || !fs.existsSync(videoSourcePath)) {
      return res.status(404).json({ error: 'Fichier vidéo source introuvable sur le disque (le découpage MP4 nécessite un fichier vidéo local).' });
    }

    const montageId = uuidv4();
    const shareToken = crypto.randomBytes(24).toString('hex');
    const montageTitle = title ? String(title).trim() : `Montage ${new Date().toLocaleDateString('fr-FR')}`;

    db.run(
      `INSERT INTO video_montages 
        (id, video_id, user_id, title, description, status, progress, progress_step, clip_count, settings, share_token, clips_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        montageId,
        videoId,
        req.user.id,
        montageTitle,
        description || '',
        'pending',
        0,
        'Initialisation...',
        safeClips.length,
        JSON.stringify(options || {}),
        shareToken,
        JSON.stringify(safeClips),
      ],
      (insertErr) => {
        if (insertErr) {
          return res.status(500).json({ error: 'Erreur lors de la création du montage en base.' });
        }

        montageEngine
          .startMontage({
            montageId,
            videoPath: videoSourcePath,
            clips: safeClips,
            options: {
              title: montageTitle,
              introSubtitle: `${video.team1_name || 'Équipe 1'} vs ${video.team2_name || 'Équipe 2'} • ${clips.length} actions`,
              ...(options || {}),
            },
            onProgress: () => {
              emitCollectionChanged('montages');
            },
          })
          .then(() => {
            emitCollectionChanged('montages');
          })
          .catch((err) => {
            console.error(`[Montage] Échec du job ${montageId}:`, err);
            emitCollectionChanged('montages');
          });

        res.status(202).json({
          message: 'Génération du montage lancée',
          montageId,
          shareToken,
          status: 'pending',
        });
      }
    );
  });
});

// 4. Télécharger le fichier MP4 du montage
router.get('/:videoId/montages/:montageId/download', authenticateToken, (req, res) => {
  const { videoId, montageId } = req.params;
  db.get(
    'SELECT * FROM video_montages WHERE id = ? AND video_id = ?',
    [montageId, videoId],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row || !row.output_filepath) return res.status(404).json({ error: 'Montage non trouvé ou non terminé' });

      if (!fs.existsSync(row.output_filepath)) {
        return res.status(404).json({ error: 'Le fichier vidéo n’existe plus sur le disque' });
      }

      const downloadName = `${(row.title || 'montage').replace(/[^a-zA-Z0-9_\-]/g, '_')}.mp4`;
      res.download(row.output_filepath, downloadName);
    }
  );
});

// 5. Visionner le montage (Stream HTTP avec support des partial content / ranges)
router.get('/:videoId/montages/:montageId/stream', (req, res) => {
  const { montageId } = req.params;
  db.get('SELECT * FROM video_montages WHERE id = ?', [montageId], (err, row) => {
    if (err || !row || !row.output_filepath) {
      return res.status(404).json({ error: 'Montage not found' });
    }

    const filePath = row.output_filepath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

// 6. Supprimer un montage
router.delete('/:videoId/montages/:montageId', authenticateToken, (req, res) => {
  const { videoId, montageId } = req.params;
  db.get(
    'SELECT * FROM video_montages WHERE id = ? AND video_id = ?',
    [montageId, videoId],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Montage non trouvé' });

      if (row.output_filepath) {
        fs.remove(row.output_filepath).catch(() => {});
      }

      db.run('DELETE FROM video_montages WHERE id = ?', [montageId], (delErr) => {
        if (delErr) return res.status(500).json({ error: 'Erreur suppression base' });
        emitCollectionChanged('montages');
        res.json({ message: 'Montage supprimé avec succès' });
      });
    }
  );
});

// 7. Annuler un montage en cours
router.post('/:videoId/montages/:montageId/cancel', authenticateToken, (req, res) => {
  const { montageId } = req.params;
  const ok = montageEngine.cancelMontage(montageId);
  res.json({ success: ok, message: ok ? 'Montage annulé' : 'Montage non trouvé ou déjà terminé' });
});

module.exports = router;
