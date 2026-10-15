// Génération d'une version « proxy » basse résolution d'une vidéo, utilisée
// uniquement pour la lecture / navigation (l'original reste la source des
// exports). Le timecode est conservé à l'identique.

const PROXY_OPTIONS = [
  '-map 0:v:0',
  '-map 0:a:0?',
  '-vf scale=-2:480',
  '-c:v libx264',
  '-preset veryfast',
  '-crf 30',
  '-c:a aac',
  '-b:a 96k',
  '-movflags +faststart',
];

/**
 * Génère une version proxy légère (480p) de `inputPath` dans `outputPath`.
 * @returns {Promise<void>} résolue en fin d'encodage, rejetée en cas d'erreur.
 */
function generateProxy(inputPath, outputPath) {
  const ffmpeg = require('fluent-ffmpeg');
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(PROXY_OPTIONS)
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

module.exports = { generateProxy };
