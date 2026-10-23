// ============================================================================
// Routes API pour les montages vidéo (Chantier 5)
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');
const config = require('../config');
const montageEngine = require('../montageEngine');
const { emitCollectionChanged } = require('../socket');

const router = express.Router({ mergeParams: true });

function verifyVideoOwnership(req, res, callback) {
  const videoId = req.params.videoId || req.body.videoId;
  db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [videoId, req.user.id], (err, video) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    callback(video);
  });
}

// 1. Lister tous les montages d'une vidéo
router.get('/:videoId/montages', authenticateToken, (req, res) => {
  const { videoId } = req.params;
  verifyVideoOwnership(req, res, (video) => {
    db.all(
      `SELECT * FROM video_montages 
        WHERE video_id = ? AND user_id = ? 
        ORDER BY created_at DESC`,
      [videoId, req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ montages: rows });
      }
    );
  });
});

// 2. Récupérer un montage spécifique (pour le polling de progression)
router.get('/:videoId/montages/:montageId', authenticateToken, (req, res) => {
  const { videoId, montageId } = req.params;
  db.get(
    'SELECT * FROM video_montages WHERE id = ? AND video_id = ? AND user_id = ?',
    [montageId, videoId, req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Montage not found' });
      res.json({ montage: row });
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

  verifyVideoOwnership(req, res, (video) => {
    // Vérifier l'existence physique du fichier vidéo source
    const videoSourcePath = video.filepath;
    if (!fs.existsSync(videoSourcePath)) {
      return res.status(404).json({ error: 'Fichier vidéo source introuvable sur le disque.' });
    }

    const montageId = uuidv4();
    const montageTitle = title ? String(title).trim() : `Montage ${new Date().toLocaleDateString('fr-FR')}`;

    db.run(
      `INSERT INTO video_montages 
        (id, video_id, user_id, title, description, status, progress, progress_step, clip_count, settings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        montageId,
        videoId,
        req.user.id,
        montageTitle,
        description || '',
        'pending',
        0,
        'Initialisation...',
        clips.length,
        JSON.stringify(options || {}),
      ],
      (insertErr) => {
        if (insertErr) {
          return res.status(500).json({ error: 'Erreur lors de la création du montage en base.' });
        }

        // Lancer la génération asynchrone en arrière-plan
        montageEngine
          .startMontage({
            montageId,
            videoPath: videoSourcePath,
            clips,
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
    'SELECT * FROM video_montages WHERE id = ? AND video_id = ? AND user_id = ?',
    [montageId, videoId, req.user.id],
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
    'SELECT * FROM video_montages WHERE id = ? AND video_id = ? AND user_id = ?',
    [montageId, videoId, req.user.id],
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
