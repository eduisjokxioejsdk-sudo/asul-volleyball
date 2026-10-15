// ============================================================================
// Bandeau « Mise à jour nécessaire » — affiché en haut de toutes les pages dès
// que l'interface qui tourne est plus ancienne que la version annoncée par le
// serveur.
//   • navigateur / serveur local → « Recharger l'interface » ;
//   • application Windows        → téléchargement puis « Redémarrer et installer ».
// ============================================================================

import { motion } from 'framer-motion';
import { Download, RefreshCw, RotateCcw, Sparkles, X } from './icons';

export default function UpdateBanner({ update }) {
  const {
    outdated,
    bannerHidden,
    clientVersion,
    serverVersion,
    latestTitle,
    desktop,
    desktopAvailable,
    desktopActive,
  } = update;

  // Deux cas à signaler : interface plus ancienne que le serveur, ou mise à jour
  // de l'application Windows en cours / prête à installer.
  if ((!outdated && !desktopActive) || bannerHidden) return null;

  const status = desktop?.status || 'idle';
  const percent = desktop?.percent || 0;
  const downloading = status === 'downloading' || status === 'checking';
  const targetVersion = outdated ? serverVersion : desktop?.version || serverVersion;
  const title = outdated ? 'Mise à jour nécessaire' : 'Mise à jour disponible';

  const renderAction = () => {
    if (!desktopAvailable) {
      return (
        <button type="button" className="btn btn-primary btn-sm" onClick={update.reload}>
          <RefreshCw size={13} /> Recharger l’interface
        </button>
      );
    }
    if (status === 'downloaded') {
      return (
        <button type="button" className="btn btn-primary btn-sm" onClick={update.installNow}>
          <RotateCcw size={13} /> Redémarrer et installer
        </button>
      );
    }
    if (downloading) {
      return (
        <button type="button" className="btn btn-secondary btn-sm" disabled>
          <RefreshCw size={13} />
          {status === 'checking' ? 'Préparation…' : `Téléchargement ${percent} %`}
        </button>
      );
    }
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={update.startDesktopUpdate}>
        <Download size={13} /> Télécharger et installer
      </button>
    );
  };

  return (
    <motion.div
      className="update-banner"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      role="status"
    >
      <span className="update-banner-icon">
        <Sparkles size={16} />
      </span>

      <div className="update-banner-text">
        <strong>
          {title} — v{targetVersion}
          {latestTitle ? ` « ${latestTitle} »` : ''}
        </strong>
        <span className="update-banner-versions">
          Votre interface : {clientVersion} ·{' '}
          {outdated
            ? `version disponible : ${serverVersion}`
            : status === 'downloaded'
              ? 'mise à jour téléchargée, prête à installer'
              : 'mise à jour en cours de téléchargement'}
        </span>
        {status === 'downloading' && (
          <span className="update-banner-progress" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
        {status === 'error' && <span className="update-banner-error">{desktop.error}</span>}
      </div>

      <div className="update-banner-actions">
        {outdated && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={update.openDialog}>
            Voir les nouveautés
          </button>
        )}
        {renderAction()}
        <button
          type="button"
          className="update-banner-close"
          onClick={update.hideBanner}
          title="Masquer ce rappel"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
