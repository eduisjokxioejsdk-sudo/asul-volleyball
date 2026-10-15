// ============================================================================
// Passerelle de l'écran de démarrage (choix hôte / rejoindre).
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('asulSplash', {
  /** État courant de l'écran de démarrage (utile si l'écran s'ouvre après coup). */
  getState: () => ipcRenderer.invoke('asul:splash-state'),
  /** S'abonne aux changements d'état envoyés par le processus principal. */
  onState: (callback) => {
    ipcRenderer.on('asul:state', (event, state) => callback(state));
  },
  /** Enregistre le mode choisi puis lance le démarrage. */
  choose: (payload) => ipcRenderer.send('asul:choose', payload),
  /** Teste la joignabilité d'un PC hôte. */
  testHost: (payload) => ipcRenderer.invoke('asul:test-host', payload),
  retry: () => ipcRenderer.send('asul:retry'),
  chooseMode: () => ipcRenderer.send('asul:choose-mode'),
  openDataFolder: () => ipcRenderer.send('asul:open-data-folder'),
  openLogs: () => ipcRenderer.send('asul:open-logs'),
  quit: () => ipcRenderer.send('asul:quit'),
});
