// ============================================================================
// Préparation des vidéos pour la lecture dans le navigateur.
//
// Un fichier uploadé n'est PAS forcément lisible par un élément <video> :
//   - codec non décodable (HEVC, MPEG-4 ASP, WMV…) ;
//   - conteneur « fragmenté » : plusieurs en-têtes MP4 (ftyp + moov) concaténés,
//     typiquement un enregistrement / téléchargement en segments DASH recollés
//     sans remuxage. ffmpeg le lit, mais le démultiplexeur MP4 du navigateur
//     s'arrête sur le premier moov et le lecteur tourne alors à l'infini ;
//   - index (moov) placé en fin de fichier : sans requêtes partielles le
//     navigateur doit tout télécharger avant de démarrer.
//
// Ce module détecte ces cas (`inspectVideo`) et produit une version lisible
// (`ensurePlayable`) : un simple REMUX sans ré-encodage quand les codecs sont
// déjà supportés (rapide et sans perte, timecode strictement identique), sinon
// un transcodage en proxy H.264/AAC 480p.
// ============================================================================

const { execFile } = require('child_process');
const fs = require('fs');

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

// Codecs décodables nativement par Chromium (Electron / Chrome / Edge).
const BROWSER_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const BROWSER_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

/** Chemin du binaire ffmpeg résolu par config.js (repli sur le PATH). */
function ffmpegBin() {
  try {
    return require('./config').ffmpegPath;
  } catch {
    return process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  }
}

/** Exécute ffmpeg et renvoie sa sortie (ffmpeg écrit ses informations sur stderr). */
function runFfmpeg(args, timeoutMs = 1800000) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegBin(),
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const text = `${stderr || ''}\n${stdout || ''}`;
        if (err) {
          const failure = new Error(lastFfmpegError(text) || err.message);
          failure.output = text;
          return reject(failure);
        }
        resolve(text);
      }
    );
  });
}

/** Dernière ligne d'erreur exploitable de ffmpeg (ses logs sont très verbeux). */
function lastFfmpegError(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/^(frame=|Press \[q\]|Stream mapping|Output #|Input #|Metadata:|\[)/.test(line)) continue;
    if (/error|invalid|failed|no such|not supported|unable/i.test(line)) return line;
  }
  return lines[lines.length - 1] || '';
}

/**
 * Lit les métadonnées d'une vidéo via `ffmpeg -i` (ffprobe n'est pas embarqué).
 * @returns {Promise<{videoCodec:string|null,audioCodec:string|null,width:number,height:number,durationSec:number,duplicatedMoov:number}>}
 */
async function probeMedia(inputPath) {
  let text = '';
  try {
    // `-i` seul échoue volontairement (« At least one output file… ») mais
    // affiche toutes les informations : c'est la sonde la plus rapide.
    text = await runFfmpeg(['-hide_banner', '-i', inputPath], 120000);
  } catch (err) {
    text = err && err.output ? err.output : String((err && err.message) || '');
  }

  const video = text.match(/Stream #\d+:\d+[^:]*:\s*Video:\s*([a-z0-9_]+)/i);
  const audio = text.match(/Stream #\d+:\d+[^:]*:\s*Audio:\s*([a-z0-9_]+)/i);
  const size = text.match(/Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})/i);
  const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  // « Found duplicated MOOV Atom » répété N fois = segments MP4 recollés.
  let duplicatedMoov = /duplicated MOOV/i.test(text) ? 1 : 0;
  const repeated = text.match(/duplicated MOOV[\s\S]{0,200}?Last message repeated (\d+) times/i);
  if (repeated) duplicatedMoov += Number(repeated[1]) || 0;

  return {
    videoCodec: video ? video[1].toLowerCase() : null,
    audioCodec: audio ? audio[1].toLowerCase() : null,
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    durationSec: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0,
    duplicatedMoov,
  };
}

/**
 * Parcourt les boîtes (atomes) de premier niveau d'un MP4 pour vérifier sa
 * structure. Lecture d'en-têtes uniquement : quelques millisecondes même sur
 * un fichier de plusieurs Go. On s'arrête dès la preuve d'une fragmentation
 * (deuxième moov / deuxième ftyp) ou après `maxBoxes` boîtes.
 * @returns {{valid:boolean,moovCount:number,moovBeforeMdat:boolean,fragmented:boolean,boxes:number}}
 */
function inspectContainer(filePath, maxBoxes = 20000) {
  const result = { valid: true, moovCount: 0, moovBeforeMdat: false, fragmented: false, boxes: 0 };
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(16);
    let offset = 0;
    let mdatOffset = -1;
    let firstMoovOffset = -1;

    while (offset + 8 <= size && result.boxes < maxBoxes) {
      fs.readSync(fd, buf, 0, 16, offset);
      let boxSize = buf.readUInt32BE(0);
      const type = buf.toString('latin1', 4, 8);
      let header = 8;
      if (boxSize === 1) {
        boxSize = Number(buf.readBigUInt64BE(8)); // taille étendue sur 64 bits
        header = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset; // dernière boîte : s'étend jusqu'à la fin
      }
      if (!/^[a-zA-Z0-9 ]{4}$/.test(type) || !Number.isFinite(boxSize) || boxSize < header) {
        result.valid = false;
        break;
      }
      result.boxes += 1;
      if (type === 'moov') {
        result.moovCount += 1;
        if (firstMoovOffset < 0) firstMoovOffset = offset;
      } else if (type === 'mdat' && mdatOffset < 0) {
        mdatOffset = offset;
      } else if (type === 'ftyp' && result.boxes > 1) {
        result.fragmented = true; // second ftyp : segments MP4 recollés
        break;
      }
      if (result.moovCount > 1) {
        result.fragmented = true;
        break;
      }
      offset += boxSize;
    }

    result.moovBeforeMdat = firstMoovOffset >= 0 && (mdatOffset < 0 || firstMoovOffset < mdatOffset);
    if (result.moovCount === 0) result.valid = false;
  } catch {
    result.valid = false;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* déjà fermé */ }
    }
  }
  return result;
}

/**
 * Diagnose complet : la vidéo est-elle lisible telle quelle par le navigateur ?
 * @returns {Promise<{playable:boolean,reason:string|null,probe:object,container:object,copyPossible:boolean}>}
 */
async function inspectVideo(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    return {
      playable: false,
      reason: 'Fichier source introuvable sur le disque.',
      probe: { videoCodec: null, audioCodec: null, width: 0, height: 0, durationSec: 0, duplicatedMoov: 0 },
      container: { valid: false, moovCount: 0, moovBeforeMdat: false, fragmented: false, boxes: 0 },
      copyPossible: false,
    };
  }

  const probe = await probeMedia(inputPath);
  const container = inspectContainer(inputPath);

  let reason = null;
  if (!probe.videoCodec) {
    reason = 'Aucun flux vidéo détecté dans le fichier.';
  } else if (!BROWSER_VIDEO_CODECS.has(probe.videoCodec)) {
    reason = `Codec vidéo « ${probe.videoCodec} » non décodable par le navigateur.`;
  } else if (probe.audioCodec && !BROWSER_AUDIO_CODECS.has(probe.audioCodec)) {
    reason = `Codec audio « ${probe.audioCodec} » non décodable par le navigateur.`;
  } else if (!container.valid) {
    reason = 'Structure du fichier MP4 invalide ou illisible.';
  } else if (container.fragmented || container.moovCount > 1) {
    const n = container.moovCount > 1 ? container.moovCount : 'plusieurs';
    reason = `Fichier fragmenté : ${n} en-tête(s) MP4 concaténé(s), le navigateur ne sait pas les enchaîner.`;
  } else if (!container.moovBeforeMdat) {
    reason = 'Index de la vidéo (atome moov) placé en fin de fichier.';
  }

  // Le remux sans ré-encodage n'est possible que si les codecs sont déjà
  // compatibles et le fichier structurellement lisible par ffmpeg.
  const copyPossible = Boolean(
    probe.videoCodec &&
    BROWSER_VIDEO_CODECS.has(probe.videoCodec) &&
    (!probe.audioCodec || BROWSER_AUDIO_CODECS.has(probe.audioCodec)) &&
    container.valid
  );

  return { playable: reason === null, reason, probe, container, copyPossible };
}

/** Supprime un fichier sans lever d'erreur s'il est absent. */
function removeQuiet(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch { /* absent ou verrouillé */ }
}

/**
 * Remuxe sans ré-encodage en MP4 progressif avec l'index en tête (`faststart`).
 * Rapide (copie des flux) et sans perte : le timecode est strictement conservé,
 * ce qui préserve la synchronisation du codage déjà effectué.
 * @returns {Promise<void>}
 */
async function remuxFastStart(inputPath, outputPath) {
  removeQuiet(outputPath);
  await runFfmpeg([
    '-hide_banner',
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

/**
 * Génère une version proxy légère (480p) de `inputPath` dans `outputPath`.
 * @returns {Promise<void>} résolue en fin d'encodage, rejetée en cas d'erreur.
 */
function generateProxy(inputPath, outputPath) {
  const ffmpeg = require('fluent-ffmpeg');
  removeQuiet(outputPath);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(PROXY_OPTIONS)
      .on('end', resolve)
      .on('error', (err) => reject(new Error((err && err.message) || 'Échec du transcodage proxy')))
      .save(outputPath);
  });
}

/**
 * Produit dans `outputPath` une version de `inputPath` lisible par le navigateur.
 *
 * Stratégie : remux sans ré-encodage si les codecs sont déjà supportés (le
 * problème ne vient alors que du conteneur), sinon transcodage proxy 480p.
 *
 * @param {string} inputPath fichier source.
 * @param {string} outputPath fichier à produire.
 * @param {object|null} [knownVerdict] verdict déjà calculé par `inspectVideo` :
 *   le transmettre évite une seconde sonde, ce qui compte sur des fichiers de
 *   plusieurs Go (le diagnostic est mis en cache côté routes).
 * @returns {Promise<{needed:boolean,mode:'none'|'remux'|'transcode',reason:string|null,probe:object}>}
 */
async function ensurePlayable(inputPath, outputPath, knownVerdict = null) {
  const usable = knownVerdict && knownVerdict.probe && typeof knownVerdict.copyPossible === 'boolean';
  const verdict = usable ? knownVerdict : await inspectVideo(inputPath);
  if (verdict.playable) return { needed: false, mode: 'none', reason: null, probe: verdict.probe };

  if (verdict.copyPossible) {
    try {
      await remuxFastStart(inputPath, outputPath);
      return { needed: true, mode: 'remux', reason: verdict.reason, probe: verdict.probe };
    } catch (err) {
      // Remux refusé (flux non multiplexable en MP4…) : on transcode.
      console.warn('[ASUL] Remux impossible, transcodage proxy :', err.message);
    }
  }

  await generateProxy(inputPath, outputPath);
  return { needed: true, mode: 'transcode', reason: verdict.reason, probe: verdict.probe };
}

module.exports = {
  PROXY_OPTIONS,
  BROWSER_VIDEO_CODECS,
  BROWSER_AUDIO_CODECS,
  probeMedia,
  inspectContainer,
  inspectVideo,
  remuxFastStart,
  generateProxy,
  ensurePlayable,
};

