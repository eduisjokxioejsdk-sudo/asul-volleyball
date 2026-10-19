// ============================================================================
// Boîte « Exporter les clips (MP4) » — depuis une playlist de séance.
//
// L'export tourne côté serveur (ffmpeg) : on choisit le regroupement (toute la
// playlist, un fichier par joueur, par poste de départ, ou par joueur × poste)
// et la finesse des coupes, puis on suit l'avancement et on télécharge un ZIP
// contenant les MP4 + la feuille de séance (CSV).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { playlistAPI, systemAPI } from '../services/api';
import { playlistStats } from '../utils/playlists.js';
import { CircleAlert, FileDown, Film, Loader, Pause } from './icons';

/** Groupements proposés (libellés + description). */
const GROUP_OPTIONS = [
  { id: 'playlist', label: 'Toute la playlist (un seul fichier)' },
  { id: 'player', label: 'Un fichier par joueur' },
  { id: 'poste', label: 'Un fichier par poste de départ (4, 3, 2, arrière)' },
  { id: 'player-poste', label: 'Un fichier par joueur et par poste' },
];

const sizeLabel = (bytes) => `${(Number(bytes || 0) / (1024 * 1024)).toFixed(1)} Mo`;

/**
 * @param {Object} props
 * @param {Object} props.playlist playlist enregistrée ({ id, name })
 * @param {Array} props.items entrées de la playlist
 * @param {() => void} props.onClose
 * @param {(ok:boolean, text:string) => void} [props.onNotify]
 */
export default function ExportClipsDialog({ playlist, items, onClose, onNotify }) {
  const [groupBy, setGroupBy] = useState('player-poste');
  const [mode, setMode] = useState('copy');
  const [includeClips, setIncludeClips] = useState(false);
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [ffmpegOk, setFfmpegOk] = useState(true);

  const stats = playlistStats(items || []);

  // ffmpeg est embarqué dans l'application : on prévient s'il est absent.
  useEffect(() => {
    let cancelled = false;
    systemAPI
      .getStatus()
      .then((res) => {
        if (!cancelled) setFfmpegOk(res.data?.ffmpegAvailable !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Suivi de l'export tant qu'il tourne.
  useEffect(() => {
    if (!job || job.state !== 'running') return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await playlistAPI.getExport(job.jobId);
        setJob(res.data.job);
      } catch (err) {
        setError(err.response?.data?.error || 'Suivi de l’export impossible.');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [job]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await playlistAPI.exportClips(playlist.id, { groupBy, mode, includeClips });
      setJob(res.data.job);
      if (onNotify) onNotify(true, 'Export lancé : la préparation des clips est en cours.');
    } catch (err) {
      setError(err.response?.data?.error || 'Export impossible.');
    } finally {
      setStarting(false);
    }
  };

  const close = useCallback(async () => {
    // Un export encore en cours est abandonné (les fichiers temporaires sont libérés).
    if (job && job.state === 'running') {
      try {
        await playlistAPI.cancelExport(job.jobId);
      } catch {
        /* l'export est peut-être déjà terminé */
      }
    }
    onClose?.();
  }, [job, onClose]);

  const running = job?.state === 'running';
  const done = job?.state === 'done';

  return (
    <motion.div
      className="modal-overlay"
      onClick={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        style={{ maxWidth: 560 }}
      >
        <h2>
          <Film size={18} /> Exporter les clips (MP4)
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          {stats.count} action(s) · {stats.matches} match(s). Les extraits sont découpés puis rassemblés en
          fichiers MP4, avec la feuille de séance (CSV), dans un dossier ZIP.
        </p>

        {!ffmpegOk && (
          <div className="dv-flash err">
            <CircleAlert size={13} /> ffmpeg est introuvable sur ce poste : l’export de clips est
            indisponible.
          </div>
        )}
        {error && <div className="dv-flash err">{error}</div>}

        <div className="plp-export-form">
          <label className="pl-filter">
            Regroupement
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} disabled={running}>
              {GROUP_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="pl-filter">
            Coupes
            <select value={mode} onChange={(event) => setMode(event.target.value)} disabled={running}>
              <option value="copy">Rapides — copie, sans réencodage</option>
              <option value="precise">Précises — réencodage, plus lent</option>
            </select>
          </label>
          <label className="plp-check">
            <input
              type="checkbox"
              checked={includeClips}
              onChange={(event) => setIncludeClips(event.target.checked)}
              disabled={running}
            />
            Ajouter un fichier par action
          </label>
          <p className="dv-hint">
            Un fichier ne rassemble jamais deux matchs différents : un groupe qui couvre plusieurs matchs
            donne un fichier par match. En mode rapide, les coupes tombent sur les images-clés (jusqu’à
            environ 2 s d’écart) ; le mode précis réencode pour des coupes exactes.
          </p>
        </div>

        {job && (
          <div className="plp-export-job">
            <div className="plp-export-bar">
              <div className="plp-export-bar-fill" style={{ width: `${job.progress}%` }} />
            </div>
            <span className="plp-export-state">
              {running && <Loader size={12} />}
              {running ? 'En cours' : done ? 'Terminé' : job.state === 'error' ? 'Erreur' : job.state} ·{' '}
              {job.step}
            </span>
            {job.error && <div className="dv-flash err">{job.error}</div>}
            {job.files.length > 0 && (
              <ul className="plp-export-files">
                {job.files.map((file) => (
                  <li key={file.name}>
                    <span className="plp-export-file-name">{file.name}</span>
                    <span className="plp-export-file-size">{sizeLabel(file.size)}</span>
                  </li>
                ))}
              </ul>
            )}
            {job.skipped.length > 0 && (
              <p className="dv-hint">
                {job.skipped.length} action(s) ignorée(s) — fichier vidéo absent sur ce poste :{' '}
                {job.skipped.map((entry) => entry.label).join(', ')}
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          {done ? (
            <a
              className="btn btn-primary"
              href={playlistAPI.getExportDownloadUrl(job.jobId)}
              download={job.zipName}
              onClick={() => {
                if (onNotify) onNotify(true, 'Téléchargement du dossier ZIP…');
              }}
            >
              <FileDown size={13} /> Télécharger le ZIP ({sizeLabel(job.zipSize)})
            </a>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={start}
              disabled={starting || running || !ffmpegOk || stats.count === 0}
            >
              {running ? (
                <>
                  <Loader size={13} /> Export en cours…
                </>
              ) : (
                <>
                  <Film size={13} /> {starting ? 'Démarrage…' : 'Lancer l’export'}
                </>
              )}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={close}>
            {running ? (
              <>
                <Pause size={13} /> Abandonner
              </>
            ) : (
              'Fermer'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
