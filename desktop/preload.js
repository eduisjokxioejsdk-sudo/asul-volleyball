// ============================================================================
// Passerelle sécurisée entre l'interface ASUL (React) et l'application
// Electron. L'interface reste identique au site web : ce pont n'expose que
// quelques actions propres au poste (dossier de données, diagnostic).
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('asulDesktop', {
  isDesktop: true,
  /** { version, mode, port, dataDir, logsPath, baseUrl } */
  getInfo: () => ipcRenderer.invoke('asul:info'),
  openDataFolder: () => ipcRenderer.send('asul:open-data-folder'),
  openLogs: () => ipcRenderer.send('asul:open-logs'),
  /**
   * Mise à jour de l'application (installeur Windows publié sur GitHub Releases).
   *   • state()    → { status, version, percent, error }
   *   • check()    → recherche et télécharge la mise à jour
   *   • install()  → ferme l'application et installe la mise à jour téléchargée
   *   • onEvent()  → s'abonne aux étapes (checking / available / progress /
   *                  downloaded / not-available / error) et renvoie un
   *                  désabonnement.
   */
  updates: {
    state: () => ipcRenderer.invoke('asul:update-state'),
    check: () => ipcRenderer.send('asul:update-check'),
    install: () => ipcRenderer.send('asul:update-install'),
    onEvent: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('asul:update', handler);
      return () => ipcRenderer.removeListener('asul:update', handler);
    },
  },
});
