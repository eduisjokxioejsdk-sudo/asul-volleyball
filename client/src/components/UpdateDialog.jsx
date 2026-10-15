// ============================================================================
// Modale « Quoi de neuf » : décrit les mises à jour publiées depuis la dernière
// version vue par cet appareil (ou celles que l'interface en retard n'a pas
// encore). Affichée automatiquement une fois par version, et à la demande
// depuis le bandeau « Mise à jour nécessaire ».
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import { Download, RefreshCw, RotateCcw, Sparkles, X } from './icons';
import { formatNoteDate } from '../utils/version';

export default function UpdateDialog({ update }) {
  const {
    dialogOpen,
    dialogNotes,
    outdated,
    clientVersion,
    serverVersion,
    desktopAvailable,
    desktop,
    closeDialog,
  } = update;

  const downloaded = desktop?.status === 'downloaded';

  const renderAction = () => {
    if (!outdated) return null;
    if (desktopAvailable) {
      if (downloaded) {
        return (
          <button type="button" className="btn btn-primary" onClick={update.installNow}>
            <RotateCcw size={14} /> Redémarrer et installer
          </button>
        );
      }
      return (
        <button type="button" className="btn btn-primary" onClick={update.startDesktopUpdate}>
          <Download size={14} /> Télécharger et installer
        </button>
      );
    }
    return (
      <button type="button" className="btn btn-primary" onClick={update.reload}>
        <RefreshCw size={14} /> Recharger l’interface
      </button>
    );
  };

  return (
    <AnimatePresence>
      {dialogOpen && (
        <motion.div
          className="modal-overlay"
          onClick={closeDialog}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="modal update-dialog"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="update-dialog-head">
              <h2>
                <Sparkles size={18} /> Nouveautés
              </h2>
              <button type="button" className="fp-close" onClick={closeDialog} aria-label="Fermer">
                <X size={15} />
              </button>
            </div>

            {outdated && (
              <p className="update-dialog-lead">
                Votre interface est en version <strong>{clientVersion}</strong> : passez en version{' '}
                <strong>{serverVersion}</strong> pour en profiter.
                {desktop?.version ? ` (téléchargée : ${desktop.version})` : ''}
              </p>
            )}

            <div className="update-dialog-notes">
              {dialogNotes.map((note) => (
                <section key={note.version} className="update-note">
                  <header className="update-note-head">
                    <strong>
                      v{note.version} — {note.title}
                    </strong>
                    <span>{formatNoteDate(note.date)}</span>
                  </header>
                  <ul>
                    {(note.items || []).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div className="update-dialog-actions">
              {renderAction()}
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                Fermer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
