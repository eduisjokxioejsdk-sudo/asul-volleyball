// ============================================================================
// Export de clips MP4 (mode « Playlists »).
//
// Une playlist de séance est une suite d'actions (début/fin en secondes) qui
// peuvent venir de PLUSIEURS matchs. L'export produit des MP4 prêts à projeter :
//   • un fichier par groupe — toute la playlist, un joueur, un poste de départ
//     (4, 3, 2, arrière) ou un joueur × un poste ;
//   • et, en option, un fichier par action (clips individuels).
//
// Un groupe n'est JAMAIS découpé entre plusieurs matchs : le démultiplexeur
// « concat » de ffmpeg exige des flux identiques, donc chaque fichier ne
// rassemble que des extraits d'une même vidéo source. Un groupe qui couvre
// plusieurs matchs donne donc un fichier par match.
//
// Deux modes :
//   • 'copy'    : copie de flux, aucun réencodage — très rapide, mais les coupes
//                 tombent sur les images-clés (jusqu'à ~2 s d'écart) ;
//   • 'precise' : réencodage H.264 — coupes exactes, nettement plus long.
//
// Le travail tourne en tâche de fond (job en mémoire) : le client suit
// l'avancement puis télécharge un dossier ZIP (clips + feuille de séance CSV).
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const config = require('./config');

/** Dossier des exports (temporaires, purgés au démarrage et après TTL). */
const exportsDir = path.join(config.dataDir, 'exports');

/** Durée de conservation d'un export terminé (2 h). */
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers purs (testables sans ffmpeg)
// ---------------------------------------------------------------------------

/** Libellés de poste (mêmes groupes que la fiche de trajectoire partagée). */
const POSTE_SLUGS = { 4: 'poste4', 3: 'poste3', 2: 'poste2', arriere: 'arriere' };
const POSTE_TITLES = {
  4: 'Poste 4 (aile gauche)',
  3: 'Poste 3 (centre)',
  2: 'Poste 2 (aile droite)',
  arriere: 'Arrière',
};

/** Retire une extension de fichier (« R1 ASUL.mp4 » → « R1 ASUL »). */
function stripExtension(value) {
  return String(value == null ? '' : value).replace(/\.[A-Za-z0-9]{1,5}$/, '');
}

/** Fragment de nom de fichier sûr (sans accent ni caractère interdit). */
function sanitizeLabel(value, maxLength = 40) {
  const base = String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (base || '').slice(0, maxLength);
}

/** Numéro de joueur sur 2 chiffres (0 → '00'). */
function playerTag(item) {
  const number = Number(item?.player_number) || 0;
  return `n${String(number).padStart(2, '0')}`;
}

/** Poste de départ d'une entrée, sous forme de slug de fichier. */
function posteSlug(item) {
  const poste = item?.poste;
  return POSTE_SLUGS[poste] || (poste ? sanitizeLabel(poste, 12) : 'sansposte');
}

/**
 * Clé de regroupement d'une entrée, avec le match : deux extraits de vidéos
 * différentes ne peuvent pas être concaténés.
 * @param {Object} item entrée de playlist (video_id, player_number, poste…)
 * @param {'playlist'|'player'|'poste'|'player-poste'} groupBy
 */
function groupKey(item, groupBy) {
  const video = `v${Number(item?.video_id) || 0}`;
  if (groupBy === 'player') return `${video}|p${playerTag(item)}`;
  if (groupBy === 'poste') return `${video}|${posteSlug(item)}`;
  if (groupBy === 'player-poste') return `${video}|p${playerTag(item)}|${posteSlug(item)}`;
  return `${video}|playlist`;
}

/** Titre lisible d'un groupe (sert de nom de fichier et de libellé d'avancement). */
function groupLabel(item, groupBy) {
  const player = `${playerTag(item)}${item?.player_name ? `_${sanitizeLabel(item.player_name, 20)}` : ''}`;
  if (groupBy === 'player') return player;
  if (groupBy === 'poste') return posteSlug(item);
  if (groupBy === 'player-poste') return `${player}_${posteSlug(item)}`;
  return 'playlist';
}

/**
 * Répartit les entrées en groupes exportables. Les entrées d'un même groupe
 * restent dans l'ordre de la playlist.
 * @returns {Array<{ key, label, videoId, videoLabel, items }>}
 */
function buildGroups(items, groupBy = 'playlist') {
  const groups = new Map();
  for (const item of items || []) {
    const key = groupKey(item, groupBy);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: groupLabel(item, groupBy),
        videoId: Number(item?.video_id) || 0,
        videoLabel: item?.video_label || '',
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

/** Nom du fichier d'un clip individuel : 001_n04_Martin_poste4_a08A4.mp4 */
function clipFileName(index, item) {
  const parts = [
    String(index).padStart(3, '0'),
    playerTag(item),
    item?.player_name ? sanitizeLabel(item.player_name, 20) : '',
    posteSlug(item),
    sanitizeLabel(item?.action_code, 16),
  ].filter(Boolean);
  return `${parts.join('_')}.mp4`;
}

/** Nom du fichier d'un groupe (suffixé du match si le groupe en couvre plusieurs). */
function groupFileName(group, withVideoSuffix = false) {
  const base = sanitizeLabel(group?.label, 48) || 'playlist';
  const video = withVideoSuffix ? sanitizeLabel(stripExtension(group?.videoLabel), 32) : '';
  return `${video ? `${base}_${video}` : base}.mp4`;
}

/** Options ffmpeg d'un clip selon le mode (exporté pour les tests). */
function clipOptions(item, mode = 'copy') {
  const start = Math.max(0, Number(item?.segment_start) || 0);
  const duration = Math.max(0.1, (Number(item?.segment_end) || 0) - start);
  const outputOptions =
    mode === 'precise'
      ? [
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
        ]
      : ['-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart'];
  return { start, duration, outputOptions };
}

// ---------------------------------------------------------------------------
// Travaux ffmpeg
// ---------------------------------------------------------------------------

/** Découpe un extrait (copie de flux ou réencodage) dans un fichier MP4. */
function cutClip(sourcePath, outPath, item, mode) {
  const { start, duration, outputOptions } = clipOptions(item, mode);
  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .seekInput(start)
      .duration(duration)
      .outputOptions(outputOptions)
      .on('end', resolve)
      .on('error', (err) => reject(new Error(`ffmpeg (découpe) : ${err.message}`)))
      .save(outPath);
  });
}

/** Rassemble plusieurs MP4 en un seul (concat sans réencodage). */
function concatClips(clips, outPath) {
  if (clips.length === 1) return fs.copy(clips[0], outPath);
  const dir = path.dirname(outPath);
  const listFile = path.join(dir, `concat_${crypto.randomUUID()}.txt`);
  const body = clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n');
  return fs
    .writeFile(listFile, `${body}\n`, 'utf8')
    .then(
      () =>
        new Promise((resolve, reject) => {
          ffmpeg()
            .input(listFile)
            .inputOptions(['-f', 'concat', '-safe 0'])
            .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
            .on('end', resolve)
            .on('error', (err) => reject(new Error(`ffmpeg (assemblage) : ${err.message}`)))
            .save(outPath);
        })
    )
    .finally(() => fs.remove(listFile).catch(() => {}));
}

/** Feuille de séance (CSV) déposée dans le ZIP, en complément des clips. */
function itemsToCsv(items) {
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = [[
    '#', 'Match', 'Équipe', 'Joueur', 'Poste', 'Set', 'Point', 'Code',
    'Début (s)', 'Fin (s)', 'Durée (s)',
  ]];
  (items || []).forEach((item, index) => {
    const start = Number(item.segment_start) || 0;
    const end = Number(item.segment_end) || 0;
    rows.push([
      index + 1,
      item.video_label,
      item.team_label,
      `${playerTag(item)}${item.player_name ? ` ${item.player_name}` : ''}`,
      POSTE_TITLES[item.poste] || item.poste || '',
      item.set_number ?? '',
      item.point_number ?? '',
      item.action_code,
      Number(start.toFixed(2)),
      Number(end.toFixed(2)),
      Number(Math.max(0, end - start).toFixed(2)),
    ]);
  });
  return `${rows.map((row) => row.map(escape).join(';')).join('\n')}\n`;
}

/** Compresse un dossier en ZIP (stockage : les MP4 ne se compressent pas). */
function zipDirectory(dir, zipPath, exclude = []) {
  const archiver = require('archiver');
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 0 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', { cwd: dir, ignore: ['tmp/**', '**/*.zip', ...exclude] });
    archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Jobs (en mémoire) + travail de fond
// ---------------------------------------------------------------------------

const jobs = new Map();

/** Vide le dossier des exports (au démarrage : rien ne survit au redémarrage). */
async function purgeExports() {
  await fs.remove(exportsDir).catch(() => {});
  await fs.ensureDir(exportsDir).catch(() => {});
}

/** État d'un job, tel qu'exposé au client. */
function publicJob(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    state: job.state,
    progress: Math.round(job.progress),
    step: job.step,
    files: job.files,
    skipped: job.skipped,
    error: job.error || null,
    zipName: job.zipName,
    zipSize: job.zipSize,
    downloadUrl: job.state === 'done' ? `/api/playlists/exports/${job.jobId}/download` : null,
  };
}

/** État d'un export (null si inconnu : redémarrage ou job purgé). */
function getJob(jobId) {
  return publicJob(jobs.get(String(jobId)));
}

/** Supprime un job et ses fichiers temporaires. */
async function cleanupJob(jobId) {
  const job = jobs.get(String(jobId));
  if (!job) return false;
  jobs.delete(String(jobId));
  await fs.remove(job.dir).catch(() => {});
  return true;
}

/** Chemin du ZIP d'un job (null si absent). */
function jobZipPath(jobId) {
  const job = jobs.get(String(jobId));
  if (!job || job.state !== 'done' || !job.zipName) return null;
  const zipPath = path.join(job.dir, job.zipName);
  return fs.existsSync(zipPath) ? zipPath : null;
}

/**
 * Lance un export en tâche de fond (le client suit l'avancement puis télécharge
 * le ZIP). Chaque entrée doit porter `filepath` : le chemin local de la vidéo
 * source (résolu par la route, qui connaît la base).
 *
 * @param {Object} options
 * @param {Array} options.items entrées enrichies de `filepath`
 * @param {'playlist'|'player'|'poste'|'player-poste'} [options.groupBy]
 * @param {'copy'|'precise'} [options.mode]
 * @param {boolean} [options.includeClips] un fichier par action en plus des groupes
 * @param {string} [options.name] nom de la playlist (titre du ZIP)
 * @returns {{ jobId: string }}
 */
function startExport(options = {}) {
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    state: 'running',
    progress: 0,
    step: 'Préparation…',
    files: [],
    skipped: [],
    error: null,
    zipName: '',
    zipSize: 0,
    createdAt: Date.now(),
    dir: path.join(exportsDir, jobId),
  };
  jobs.set(jobId, job);
  runExport(job, options).catch((err) => {
    job.state = 'error';
    job.error = String(err?.message || err);
    job.step = 'Échec de l’export';
    console.warn('Export de clips :', job.error);
  });
  return { jobId };
}

/** Travail effectif : découpe, assemblage par groupe, ZIP. */
async function runExport(job, options) {
  const {
    items = [],
    groupBy = 'playlist',
    mode = 'copy',
    includeClips = false,
    name = 'playlist',
  } = options;

  const usable = [];
  for (const item of items || []) {
    if (item && item.filepath && fs.existsSync(item.filepath)) usable.push(item);
    else {
      job.skipped.push({
        label: `${item?.video_label || 'Match'} — ${item?.action_code || ''}`.trim(),
        reason: 'fichier vidéo absent sur ce poste',
      });
    }
  }
  if (usable.length === 0) {
    throw new Error('Aucune action lisible : les fichiers vidéo de ces matchs sont absents sur ce poste.');
  }

  await fs.ensureDir(job.dir);
  const workDir = path.join(job.dir, 'tmp');
  await fs.ensureDir(workDir);

  const groups = buildGroups(usable, groupBy);
  const labelCounts = {};
  for (const group of groups) labelCounts[group.label] = (labelCounts[group.label] || 0) + 1;

  const total = usable.length + groups.length;
  let done = 0;
  const bump = (step) => {
    done += 1;
    job.progress = total ? (done / total) * 100 : 100;
    job.step = step;
  };

  // 1. Découpe des extraits (un par action, réutilisés pour les groupes).
  const clipPaths = new Map();
  let index = 0;
  for (const group of groups) {
    for (const item of group.items) {
      index += 1;
      const out = path.join(workDir, `src_${String(index).padStart(4, '0')}.mp4`);
      job.step = `Découpe ${index}/${usable.length} — ${item.action_code || ''}`;
      await cutClip(item.filepath, out, item, mode);
      clipPaths.set(index, out);
      bump(job.step);
    }
  }

  // 2. Assemblage : un fichier par groupe (jamais à cheval sur deux matchs).
  index = 0;
  for (const group of groups) {
    const paths = [];
    for (let i = 0; i < group.items.length; i += 1) {
      index += 1;
      paths.push(clipPaths.get(index));
    }
    const outName = groupFileName(group, labelCounts[group.label] > 1);
    const outPath = path.join(job.dir, outName);
    await concatClips(paths, outPath);
    job.files.push({ name: outName, size: (await fs.stat(outPath)).size });
    bump(`Assemblage — ${outName}`);
  }

  // 3. Clips individuels (optionnels) : copie depuis les extraits découpés.
  if (includeClips) {
    const clipDir = path.join(job.dir, 'clips');
    await fs.ensureDir(clipDir);
    let i = 0;
    for (const item of usable) {
      i += 1;
      const clipName = clipFileName(i, item);
      const target = path.join(clipDir, clipName);
      await fs.copy(clipPaths.get(i), target);
      job.files.push({ name: `clips/${clipName}`, size: (await fs.stat(target)).size });
    }
  }

  // 4. Feuille de séance + ZIP.
  job.step = 'Compression du dossier…';
  const csvName = 'feuille_de_seance.csv';
  const csvPath = path.join(job.dir, csvName);
  await fs.writeFile(csvPath, itemsToCsv(usable), 'utf8');
  job.files.push({ name: csvName, size: (await fs.stat(csvPath)).size });

  const zipName = `${sanitizeLabel(name, 40) || 'playlist'}_clips.zip`;
  const zipPath = path.join(job.dir, zipName);
  await zipDirectory(job.dir, zipPath);
  job.zipName = zipName;
  job.zipSize = (await fs.stat(zipPath)).size;
  job.progress = 100;
  job.state = 'done';
  job.step = `${job.files.length} fichier(s) · ${(job.zipSize / (1024 * 1024)).toFixed(1)} Mo`;

  await fs.remove(workDir).catch(() => {});
}

/** Supprime les exports terminés depuis plus de 2 h. */
function sweepExpired(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) cleanupJob(id).catch(() => {});
  }
}

// Nettoyage périodique (n'empêche pas l'arrêt du serveur).
setInterval(() => sweepExpired(), 30 * 60 * 1000).unref();

module.exports = {
  POSTE_TITLES,
  buildGroups,
  clipFileName,
  clipOptions,
  concatClips,
  cutClip,
  exportsDir,
  getJob,
  groupFileName,
  groupKey,
  groupLabel,
  itemsToCsv,
  jobZipPath,
  cleanupJob,
  posteSlug,
  purgeExports,
  sanitizeLabel,
  startExport,
  sweepExpired,
};



