// ============================================================================
// Moteur de Montage Vidéo ASUL (Chantier 5)
//
// Découpe des clips d'actions ou de rallies, incrustation de bandeaux
// contextuels (score, joueur, code DV4), cartons d'intro et concaténation
// instantanée en MP4 diffusable (FastStart).
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const config = require('./config');
const db = require('./database');

// Répertoire des montages finaux et temporaires
const montagesDir = config.montagesDir;

// Police pour drawtext sous Windows
function resolveFontFilter() {
  if (process.platform === 'win32') {
    const winFont = 'C:\\Windows\\Fonts\\arial.ttf';
    if (fs.existsSync(winFont)) return 'fontfile=C\\\\:/Windows/Fonts/arial.ttf';
    const segoe = 'C:\\Windows\\Fonts\\segoeui.ttf';
    if (fs.existsSync(segoe)) return 'fontfile=C\\\\:/Windows/Fonts/segoeui.ttf';
  }
  return 'font=Arial';
}

const FONT_OPT = resolveFontFilter();

// Suivi des jobs en mémoire (pour annulation si besoin)
const activeJobs = new Map();

/**
 * Met à jour l'état d'un montage en base de données.
 */
function updateMontageDb(id, updates) {
  return new Promise((resolve) => {
    const keys = Object.keys(updates);
    if (!keys.length) return resolve();
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const values = [...keys.map((k) => updates[k]), id];
    db.run(`UPDATE video_montages SET ${sets} WHERE id = ?`, values, (err) => {
      if (err) console.error(`[MontageEngine] Erreur update DB ${id}:`, err.message);
      resolve();
    });
  });
}

/**
 * Exécute une commande ffmpeg et renvoie une promesse.
 */
function runFfmpeg(args, jobRef = null, execOpts = {}) {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      config.ffmpegPath,
      args,
      { maxBuffer: 10 * 1024 * 1024, ...execOpts },
      (err, stdout, stderr) => {
        if (jobRef && jobRef.currentProc === proc) jobRef.currentProc = null;
        if (err) {
          return reject(new Error(`FFmpeg error: ${err.message}\n${stderr || ''}`));
        }
        resolve({ stdout, stderr });
      }
    );
    if (jobRef) jobRef.currentProc = proc;
  });
}

/**
 * Crée un carton d'introduction (slide titre de début de montage).
 */
async function generateIntroCard({ tempDir, title, subtitle, duration = 2.2, resolution = '720p', jobRef }) {
  const outputName = 'clip_0000_intro.mp4';
  const t1Name = 'intro_t1.txt';
  const t2Name = 'intro_t2.txt';

  await fs.writeFile(path.join(tempDir, t1Name), String(title || 'ASUL VOLLEYBALL').trim(), 'utf8');
  await fs.writeFile(path.join(tempDir, t2Name), String(subtitle || '').trim(), 'utf8');

  const [w, h] = resolution === '1080p' ? [1920, 1080] : [1280, 720];
  const fs1 = resolution === '1080p' ? 62 : 42;
  const fs2 = resolution === '1080p' ? 34 : 24;

  const args = [
    '-f', 'lavfi', '-i', `color=c=#0f172a:s=${w}x${h}:d=${duration}`,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', `drawtext=${FONT_OPT}:textfile=${t1Name}:fontsize=${fs1}:fontcolor=#38bdf8:x=(w-text_w)/2:y=(h-text_h)/2-35,drawtext=${FONT_OPT}:textfile=${t2Name}:fontsize=${fs2}:fontcolor=#cbd5e1:x=(w-text_w)/2:y=(h-text_h)/2+30`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '25',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-t', String(duration),
    '-shortest',
    '-y', outputName,
  ];

  await runFfmpeg(args, jobRef, { cwd: tempDir });
  return outputName;
}

/**
 * Découpe un clip unitaire depuis la vidéo source avec normalisation vidéo/audio et incrustations.
 */
async function processClip({
  sourceVideoPath,
  clip,
  index,
  tempDir,
  resolution = '720p',
  includeOverlay = true,
  leadIn = 0,
  leadOut = 0,
  jobRef,
}) {
  const outputName = `clip_${String(index).padStart(4, '0')}.mp4`;

  const rawStart = Number(clip.startTime) || 0;
  const rawEnd = Number(clip.endTime) || rawStart + 3;
  const start = Math.max(0, rawStart - leadIn);
  const duration = Math.max(0.5, rawEnd + leadOut - start);

  const [w, h] = resolution === '1080p' ? [1920, 1080] : [1280, 720];

  const vfFilters = [
    `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
    'setsar=1',
  ];

  if (includeOverlay && (clip.title || clip.subtitle)) {
    const boxH = resolution === '1080p' ? 115 : 85;
    const t1Size = resolution === '1080p' ? 36 : 26;
    const t2Size = resolution === '1080p' ? 24 : 18;
    const padX = resolution === '1080p' ? 40 : 25;
    const y1 = `h-${boxH - 12}`;
    const y2 = `h-${Math.round(boxH / 2 - 8)}`;

    vfFilters.push(`drawbox=y=ih-${boxH}:color=black@0.75:width=iw:height=${boxH}:t=fill`);

    if (clip.title) {
      const t1Name = `clip_${index}_t1.txt`;
      await fs.writeFile(path.join(tempDir, t1Name), clip.title.trim(), 'utf8');
      vfFilters.push(
        `drawtext=${FONT_OPT}:textfile=${t1Name}:fontsize=${t1Size}:fontcolor=white:x=${padX}:y=${y1}`
      );
    }

    if (clip.subtitle) {
      const t2Name = `clip_${index}_t2.txt`;
      await fs.writeFile(path.join(tempDir, t2Name), clip.subtitle.trim(), 'utf8');
      vfFilters.push(
        `drawtext=${FONT_OPT}:textfile=${t2Name}:fontsize=${t2Size}:fontcolor=#38bdf8:x=${padX}:y=${y2}`
      );
    }
  }

  const args = [
    '-ss', String(start),
    '-t', String(duration),
    '-i', sourceVideoPath,
    '-vf', vfFilters.join(','),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-r', '25',
    '-c:a', 'aac',
    '-ar', '44100',
    '-ac', '2',
    '-y', outputName,
  ];

  await runFfmpeg(args, jobRef, { cwd: tempDir });

  // Replay au ralenti (0.5x) si demandé pour ce clip
  if (clip.slowMo) {
    const slowName = `clip_${String(index).padStart(4, '0')}_slow.mp4`;
    const slowFilters = [`setpts=2.0*PTS`, ...vfFilters];

    // Marqueur visuel [RALENTI]
    const tagSize = resolution === '1080p' ? 26 : 20;
    slowFilters.push(
      `drawtext=${FONT_OPT}:text='RALENTI (0.5x)':fontsize=${tagSize}:fontcolor=#facc15:x=w-text_w-30:y=30:box=1:boxcolor=black@0.8:boxborderw=8`
    );

    const slowArgs = [
      '-ss', String(start),
      '-t', String(duration),
      '-i', sourceVideoPath,
      '-vf', slowFilters.join(','),
      '-af', 'atempo=0.5',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-r', '25',
      '-c:a', 'aac',
      '-ar', '44100',
      '-ac', '2',
      '-y', slowName,
    ];

    await runFfmpeg(slowArgs, jobRef, { cwd: tempDir });
    return [outputName, slowName];
  }

  return [outputName];
}

/**
 * Lance le job de génération du montage vidéo en arrière-plan.
 */
async function startMontage({ montageId, videoPath, clips = [], options = {}, onProgress = null }) {
  const jobRef = { cancelled: false, currentProc: null };
  activeJobs.set(montageId, jobRef);

  const tempDir = path.join(montagesDir, `temp_${montageId}`);
  await fs.ensureDir(tempDir);
  await fs.ensureDir(montagesDir);

  const reportProgress = async (pct, step) => {
    if (jobRef.cancelled) return;
    await updateMontageDb(montageId, {
      status: 'processing',
      progress: Math.min(99, Math.max(1, Math.round(pct))),
      progress_step: step,
    });
    if (typeof onProgress === 'function') {
      onProgress({ montageId, progress: pct, step, status: 'processing' });
    }
  };

  try {
    await reportProgress(5, 'Préparation des clips...');

    const clipNames = [];
    const resolution = options.resolution === '1080p' ? '1080p' : '720p';
    const leadIn = Number(options.leadIn ?? 0);
    const leadOut = Number(options.leadOut ?? 0);

    // 1. Carton d'introduction
    if (options.introCard) {
      await reportProgress(8, "Génération du carton d'introduction...");
      const introName = await generateIntroCard({
        tempDir,
        title: options.title || 'ASUL VOLLEYBALL',
        subtitle: options.introSubtitle || `${clips.length} actions sélectionnées`,
        duration: 2.2,
        resolution,
        jobRef,
      });
      clipNames.push(introName);
    }

    // 2. Découpe et traitement unitaire des clips
    const total = clips.length;
    for (let i = 0; i < total; i += 1) {
      if (jobRef.cancelled) throw new Error('Montage annulé par l’utilisateur.');

      const clip = clips[i];
      const pct = 10 + Math.round(((i + 1) / total) * 75);
      await reportProgress(pct, `Traitement du clip ${i + 1} / ${total} : ${clip.title || ''}...`);

      const outputs = await processClip({
        sourceVideoPath: videoPath,
        clip: {
          ...clip,
          slowMo: clip.slowMo || options.slowMotionMode === 'all',
        },
        index: i + 1,
        tempDir,
        resolution,
        includeOverlay: options.includeOverlay !== false,
        leadIn,
        leadOut,
        jobRef,
      });

      clipNames.push(...outputs);
    }

    if (clipNames.length === 0) {
      throw new Error('Aucun clip valide à exporter.');
    }

    // 3. Concaténation finale
    await reportProgress(88, 'Assemblage final du montage MP4...');

    const listFile = path.join(tempDir, 'concat_list.txt');
    const listContent = clipNames.map((name) => `file '${name}'`).join('\n');
    await fs.writeFile(listFile, listContent, 'utf8');

    const outputFilename = `montage_${montageId}.mp4`;
    const outputPath = path.join(montagesDir, outputFilename);

    const concatArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', outputPath,
    ];

    await runFfmpeg(concatArgs, jobRef, { cwd: tempDir });

    // 4. Calcul de taille et finalisation
    const stat = await fs.stat(outputPath);
    await reportProgress(100, 'Montage terminé !');

    await updateMontageDb(montageId, {
      status: 'completed',
      progress: 100,
      progress_step: 'Prêt',
      output_filename: outputFilename,
      output_filepath: outputPath,
      file_size: stat.size,
      completed_at: new Date().toISOString(),
    });

    if (typeof onProgress === 'function') {
      onProgress({ montageId, progress: 100, step: 'Terminé', status: 'completed', filename: outputFilename });
    }

    // Nettoyage dossier temporaire
    await fs.remove(tempDir).catch(() => {});
    activeJobs.delete(montageId);
    return { success: true, outputPath, filename: outputFilename };
  } catch (err) {
    console.error(`[MontageEngine] Erreur job ${montageId}:`, err);
    await fs.remove(tempDir).catch(() => {});
    activeJobs.delete(montageId);

    await updateMontageDb(montageId, {
      status: 'error',
      progress_step: 'Erreur',
      error_message: err.message,
    });

    if (typeof onProgress === 'function') {
      onProgress({ montageId, progress: 0, step: 'Erreur', status: 'error', error: err.message });
    }
    throw err;
  }
}

/**
 * Annule un montage en cours.
 */
function cancelMontage(montageId) {
  const job = activeJobs.get(montageId);
  if (job) {
    job.cancelled = true;
    if (job.currentProc) {
      try {
        job.currentProc.kill('SIGKILL');
      } catch (e) {}
    }
    activeJobs.delete(montageId);
    updateMontageDb(montageId, {
      status: 'error',
      error_message: 'Montage annulé par l’utilisateur',
    });
    return true;
  }
  return false;
}

module.exports = {
  startMontage,
  cancelMontage,
};
