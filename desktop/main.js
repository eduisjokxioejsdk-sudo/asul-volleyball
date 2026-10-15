// ============================================================================
// ASUL — coquille Electron (poste statisticien Windows)
//
// Principe : l'application contient le backend Node complet et le frontend
// buildé. Au démarrage, l'app lance le serveur (Express + Socket.IO) puis
// affiche l'interface déjà existante dans une fenêtre Electron, servie en
// http://localhost:<port> (mono-origine, comme aujourd'hui).
//
// Deux modes d'utilisation :
//   • « Hôte »    : ce PC lance le serveur ; les autres statisticiens du réseau
//                   local s'y connectent (navigateur ou autre poste ASUL).
//   • « Rejoindre » : ce PC ne lance rien et se connecte à un poste hôte.
//
// Données : %APPDATA%\ASUL\data (base SQLite + vidéos + découpes). Elles ne
// sont jamais touchées par une mise à jour ou une réinstallation.
// ============================================================================

const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

app.setName('ASUL');
// Emplacement utilisateur déterministe (identique en développement et après
// installation) : %APPDATA%\ASUL
app.setPath('userData', path.join(app.getPath('appData'), 'ASUL'));

const USER_DIR = app.getPath('userData');
const DATA_DIR = path.join(USER_DIR, 'data');
const LOG_DIR = path.join(USER_DIR, 'logs');
const CONFIG_FILE = path.join(USER_DIR, 'config.json');
const SERVER_LOG = path.join(LOG_DIR, 'server.log');

// En installation : server/ client/ ffmpeg/ sont copiés dans resources/.
// En développement : ils sont lus directement dans le dépôt.
const SERVER_ENTRY = app.isPackaged
  ? path.join(process.resourcesPath, 'server', 'src', 'index.js')
  : path.join(__dirname, '..', 'server', 'src', 'index.js');
const SERVER_CWD = app.isPackaged
  ? path.join(process.resourcesPath, 'server')
  : path.join(__dirname, '..');
const CLIENT_DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'client', 'dist')
  : path.join(__dirname, '..', 'client', 'dist');
const FFMPEG_BIN = app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  : path.join(__dirname, 'resources', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
// Configuration Supabase pré-remplie embarquée dans l'installeur (copiée au
// premier lancement si l'utilisateur n'a encore rien configuré).
const SEED_SYNC = app.isPackaged
  ? path.join(process.resourcesPath, 'sync.json')
  : path.join(__dirname, 'resources', 'sync.json');

const DEFAULT_CONFIG = { mode: null, host: '', port: 3001 };
const FORCE_CHOOSE = process.argv.includes('--choose-mode');

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverRestarts = 0;
let quitting = false;
// Arrêt volontaire (redémarrage manuel, changement de mode, restauration) :
// empêche la relance automatique de s'appliquer à un arrêt demandé.
let intentionalStop = false;
let sleepBlockerId = null;
let currentBaseUrl = '';
const serverLogs = [];


// ---------------------------------------------------------------------------
// Configuration persistante (%APPDATA%\ASUL\config.json)
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Écriture de config.json impossible :', err.message);
  }
}

// Copie la configuration Supabase embarquée dans l'installeur vers le dossier
// de données, UNIQUEMENT si aucune configuration n'existe déjà (jamais écrasé).
function seedSyncConfig() {
  const target = path.join(DATA_DIR, 'sync.json');
  try {
    if (fs.existsSync(target)) return;
    if (!fs.existsSync(SEED_SYNC)) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(SEED_SYNC, target);
    appendLog('Configuration Supabase pré-remplie depuis l’installeur.');
  } catch (err) {
    console.error('Pré-remplissage de sync.json impossible :', err.message);
  }
}

// ---------------------------------------------------------------------------
// Journal du serveur (mémoire pour l'écran d'erreur + fichier pour le support)
// ---------------------------------------------------------------------------

function appendLog(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  serverLogs.push(stamped);
  if (serverLogs.length > 400) serverLogs.splice(0, serverLogs.length - 400);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(SERVER_LOG, `${stamped}\n`, 'utf8');
  } catch (err) {
    /* le journal disque est optionnel */
  }
}

function tailLogs(count = 12) {
  return serverLogs.slice(-count).join('\n');
}

// ---------------------------------------------------------------------------
// Utilitaires réseau
// ---------------------------------------------------------------------------

/** Le port est-il libre sur toutes les interfaces ? */
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '0.0.0.0');
  });
}

/** Premier port libre à partir de `start` (utile si 3001 est déjà pris). */
async function findFreePort(start) {
  for (let port = start; port < start + 20; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Aucun port libre entre ${start} et ${start + 19}`);
}

/** Requête HTTP simple renvoyant le corps JSON (ou null en cas d'échec). */
function httpJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
    request.on('error', () => resolve(null));
  });
}

/** Attend que le serveur ASUL réponde sur /api/health. */
async function waitForServer(port, timeoutMs = 40000, onTick) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const health = await httpJson(`http://127.0.0.1:${port}/api/health`, 1500);
    if (health && health.status === 'ok') return true;
    attempt += 1;
    if (onTick) onTick(attempt);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Serveur ASUL (processus fils Node, isolé de l'interface)
// ---------------------------------------------------------------------------

function startServer(port) {
  if (serverProcess) return;

  // Pré-remplit la config Supabase embarquée (premier lancement uniquement).
  seedSyncConfig();

  // On transmet explicitement tous les chemins au serveur : dans une
  // installation, ils sont dans resources/ et ne peuvent pas être devinés.
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(port),
    HOST: '0.0.0.0', // accessible aux autres postes du réseau local
    DATA_DIR,
    CLIENT_DIST,
    FFMPEG_PATH: FFMPEG_BIN,
    ASUL_DESKTOP: '1',
  };

  appendLog(`Démarrage du serveur (port ${port}) : ${SERVER_ENTRY}`);
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_CWD,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const forward = (stream, prefix) => {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) appendLog(`${prefix}${line}`);
      }
    });
  };
  forward(serverProcess.stdout, '');
  forward(serverProcess.stderr, '[err] ');

  serverProcess.on('exit', (code, signal) => {
    appendLog(`Serveur arrêté (code ${code}${signal ? `, signal ${signal}` : ''})`);
    serverProcess = null;
    if (quitting) return;
    // Arrêt demandé par l'application (redémarrage, changement de mode…) :
    // on ne relance pas, c'est l'appelant qui décide de la suite.
    if (intentionalStop) {
      intentionalStop = false;
      return;
    }
    if (serverRestarts < 5) {
      serverRestarts += 1;
      appendLog(`Redémarrage automatique (${serverRestarts}/5)...`);
      setTimeout(() => startServer(port), 1500);
      if (!mainWindow) setSplashState({ screen: 'loading', message: 'Redémarrage du serveur…' });
    } else if (!mainWindow) {
      setSplashState({
        screen: 'error',
        message: 'Le serveur ASUL s’est arrêté plusieurs fois.',
        detail: tailLogs(),
      });
    }
  });

  serverProcess.on('error', (err) => {
    appendLog(`Erreur de lancement du serveur : ${err.message}`);
  });
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  intentionalStop = true;
  try {
    child.kill();
  } catch (err) {
    /* déjà terminé */
  }
}

/** Arrête le serveur, laisse le port se libérer, puis le relance. */
async function restartServerProcess(port) {
  stopServer();
  await new Promise((resolve) => setTimeout(resolve, 700));
  serverRestarts = 0;
  startServer(port);
}

// ---------------------------------------------------------------------------
// Fenêtres
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mise à jour automatique (installeur Windows publié sur GitHub Releases).
//
// electron-updater n'agit que dans l'application installée : en développement
// la recherche est simplement ignorée. L'état est diffusé à l'interface, qui
// affiche « Mise à jour nécessaire », la progression puis propose de redémarrer.
// ---------------------------------------------------------------------------

const UPDATE_INTERVAL = 30 * 60 * 1000;

// Flux de mise à jour personnalisé (tests hors ligne ou hébergement interne) :
//   ASUL_UPDATE_FEED=http://127.0.0.1:8099/
// Sans cette variable, le flux est celui de la Release GitHub (voir
// electron-builder.yml) : rien à configurer pour les utilisateurs.
const UPDATE_FEED = String(process.env.ASUL_UPDATE_FEED || '').trim();

let updateStatus = { status: 'idle', version: null, percent: 0, error: null };
let updateTimer = null;

function sendUpdateEvent(type, payload = {}) {
  const event = { type, ...payload };
  for (const win of [mainWindow, splashWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('asul:update', event);
  }
}

/** Charge electron-updater à la demande (absent en mode développement). */
function requireAutoUpdater() {
  try {
    return require('electron-updater').autoUpdater;
  } catch (err) {
    appendLog(`Mise à jour automatique indisponible : ${err.message}`);
    return null;
  }
}

/** Prépare la mise à jour automatique (appelé au démarrage de l'application). */
function setUpAutoUpdater() {
  const updater = requireAutoUpdater();
  if (!updater) return;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  if (UPDATE_FEED) {
    // Flux local (test) : latest.yml + installeur servis en HTTP.
    updater.setFeedURL({ provider: 'generic', url: UPDATE_FEED });
    appendLog(`Flux de mise à jour personnalisé : ${UPDATE_FEED}`);
  }

  updater.on('checking-for-update', () => {
    updateStatus = { ...updateStatus, status: 'checking', error: null };
    sendUpdateEvent('checking');
  });

  updater.on('update-available', (info) => {
    updateStatus = { status: 'available', version: info?.version || null, percent: 0, error: null };
    appendLog(`Mise à jour ${info?.version} disponible : téléchargement en cours`);
    sendUpdateEvent('available', { version: info?.version || null });
  });

  updater.on('update-not-available', () => {
    updateStatus = { ...updateStatus, status: 'up-to-date' };
    sendUpdateEvent('not-available', { version: app.getVersion() });
  });

  updater.on('download-progress', (progress) => {
    updateStatus = { ...updateStatus, status: 'downloading', percent: Math.round(progress?.percent || 0) };
    sendUpdateEvent('progress', { percent: updateStatus.percent });
  });

  updater.on('update-downloaded', (info) => {
    updateStatus = { status: 'downloaded', version: info?.version || null, percent: 100, error: null };
    appendLog(`Mise à jour ${info?.version} téléchargée`);
    sendUpdateEvent('downloaded', { version: info?.version || null });
    promptInstall(info?.version);
  });

  updater.on('error', (err) => {
    updateStatus = { status: 'error', version: null, percent: 0, error: err?.message || String(err) };
    appendLog(`Échec de la mise à jour : ${updateStatus.error}`);
    sendUpdateEvent('error', { message: updateStatus.error });
  });
}

/** Propose d'installer la mise à jour qui vient d'être téléchargée. */
function promptInstall(version) {
  const answer = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'question',
    buttons: ['Redémarrer et installer', 'Plus tard'],
    defaultId: 0,
    cancelId: 1,
    title: 'Mise à jour ASUL',
    message: `La version ${version || ''} est prête.`,
    detail:
      'ASUL va redémarrer pour installer la mise à jour. Vos données, vos vidéos et vos comptes sont conservés.',
  });
  if (answer === 0) installUpdate();
}

/** Recherche une mise à jour (manual = demandé depuis le menu « Aide »). */
function checkForUpdates(manual = false) {
  const updater = requireAutoUpdater();
  if (!updater || !app.isPackaged) {
    if (manual) {
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: 'Mise à jour ASUL',
        message: `ASUL ${app.getVersion()}`,
        detail: app.isPackaged
          ? 'Le module de mise à jour n’a pas pu être chargé.'
          : 'La mise à jour automatique agit dans l’application installée (pas en mode développement).',
      });
    }
    return;
  }
  updater.checkForUpdates().catch((err) => {
    updateStatus = { status: 'error', version: null, percent: 0, error: err?.message || String(err) };
    appendLog(`Recherche de mise à jour impossible : ${updateStatus.error}`);
    sendUpdateEvent('error', { message: updateStatus.error });
  });
}

/** Ferme ASUL puis installe la mise à jour déjà téléchargée. */
function installUpdate() {
  const updater = requireAutoUpdater();
  if (!updater) return;
  quitting = true;
  stopServer();
  setImmediate(() => updater.quitAndInstall(false, true));
}

/** Contrôle différé puis périodique (jamais pendant l'ouverture). */
function scheduleUpdateChecks() {
  setTimeout(() => checkForUpdates(false), 8000);
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(() => checkForUpdates(false), UPDATE_INTERVAL);
  if (updateTimer.unref) updateTimer.unref();
}

let splashState = { screen: 'loading', message: 'Démarrage d’ASUL…', detail: '' };

function setSplashState(state) {
  splashState = { ...splashState, ...state };
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('asul:state', splashState);
  }
}

function createSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;
  splashWindow = new BrowserWindow({
    width: 460,
    height: 520,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    backgroundColor: '#151311',
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow;
}

function appIcon() {
  const candidates = [
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, '..', 'client', 'public', 'logo.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function openMainWindow(url) {
  currentBaseUrl = url;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(url);
    mainWindow.show();
    mainWindow.focus();
    if (splashWindow) splashWindow.close();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#151311',
    icon: appIcon(),
    title: 'ASUL — Analyse volleyball',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // Le codage en direct doit continuer même si la fenêtre perd le focus.
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
    if (splashWindow) splashWindow.close();
    // Le PC hôte ne doit pas se mettre en veille pendant un match.
    if (sleepBlockerId === null) {
      sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (sleepBlockerId !== null) {
      powerSaveBlocker.stop(sleepBlockerId);
      sleepBlockerId = null;
    }
  });

  // Les liens externes (documents, partages) s'ouvrent dans le navigateur.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith('http://localhost') && !target.startsWith(currentBaseUrl)) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('did-fail-load', (event, code, description) => {
    appendLog(`Échec de chargement de l’interface (${code} ${description})`);
  });
}


// ---------------------------------------------------------------------------
// Démarrage : mode hôte (serveur local) ou mode client (rejoindre un hôte)
// ---------------------------------------------------------------------------

async function boot(options = {}) {
  const config = loadConfig();
  const needChoose = FORCE_CHOOSE || options.choose === true || !config.mode;

  // Le menu dépend du mode (l'entrée « Redémarrer le serveur » n'a de sens
  // qu'en hôte) : on le régénère à chaque démarrage.
  buildMenu();

  if (needChoose) {
    setSplashState({
      screen: 'choose',
      mode: config.mode || 'host',
      host: config.host || '',
      port: config.port || DEFAULT_CONFIG.port,
      dataDir: DATA_DIR,
    });
    return;
  }

  if (config.mode === 'client') {
    const url = `http://${config.host}:${config.port}`;
    setSplashState({ screen: 'loading', message: `Connexion à ${config.host}…` });
    const health = await httpJson(`${url}/api/health`, 5000);
    if (!health || health.status !== 'ok') {
      setSplashState({
        screen: 'error',
        message: `Aucun poste ASUL ne répond sur ${config.host}:${config.port}.`,
        detail:
          'Vérifiez que le PC hôte est allumé, que l’application y est lancée en mode « Hôte », ' +
          'et que les deux postes sont bien sur le même réseau (Wi-Fi ou partage de connexion).',
      });
      return;
    }
    openMainWindow(url);
    return;
  }

  // Mode hôte : ce PC héberge le serveur et les données du match.
  setSplashState({ screen: 'loading', message: 'Préparation du serveur ASUL…' });
  try {
    const port = await findFreePort(config.port || DEFAULT_CONFIG.port);
    if (port !== config.port) {
      appendLog(`Port ${config.port} occupé : utilisation du port ${port}`);
      config.port = port;
      saveConfig(config);
    }
    serverRestarts = 0;
    startServer(port);

    const ready = await waitForServer(port, 60000, (attempt) => {
      setSplashState({
        screen: 'loading',
        message: attempt < 3 ? 'Démarrage du serveur ASUL…' : `Le serveur démarre (${attempt})…`,
        detail: attempt >= 3 ? tailLogs(3) : '',
      });
    });

    if (!ready) {
      setSplashState({
        screen: 'error',
        message: 'Le serveur ASUL n’a pas répondu dans les temps.',
        detail: tailLogs(10),
      });
      return;
    }

    appendLog(`Serveur prêt sur http://localhost:${port}`);
    openMainWindow(`http://localhost:${port}`);
  } catch (err) {
    setSplashState({ screen: 'error', message: err.message, detail: tailLogs(10) });
  }
}


// ---------------------------------------------------------------------------
// Données : dossier, sauvegarde ZIP, restauration
// ---------------------------------------------------------------------------

/** Charge un module depuis les dépendances embarquées du serveur. */
function requireFromServer(moduleName) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'node_modules')
    : path.join(__dirname, '..', 'server', 'node_modules');
  return require(path.join(base, moduleName));
}

/** Exécute une commande PowerShell (traitement d'archives, diagnostic). */
function runPowerShell(command) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    stdio: 'ignore',
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------
// Pare-feu Windows (match en direct)
//
// La règle autorisant le port du serveur est désormais créée À LA DEMANDE, par
// l'application, uniquement quand ce poste sert d'hôte. L'installeur n'exécute
// plus netsh avec élévation : c'est un comportement que les antivirus et
// SmartScreen surveillent (et qui faisait bloquer l'installation).
// ---------------------------------------------------------------------------

const FIREWALL_RULE = 'ASUL (match en direct)';

/** La règle de pare-feu autorisant le port du serveur existe-t-elle déjà ? */
function firewallRuleExists() {
  try {
    const output = execFileSync(
      'netsh',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`],
      { encoding: 'utf8', windowsHide: true }
    );
    return output.includes(FIREWALL_RULE);
  } catch (err) {
    return false; // netsh renvoie un code d'erreur quand la règle est absente
  }
}

/**
 * Crée (ou met à jour) la règle de pare-feu pour le port du serveur : une seule
 * demande d'élévation, à la demande. Renvoie true si la règle est active.
 */
function applyFirewallRule(port) {
  const script = path.join(DATA_DIR, 'regle-pare-feu.ps1');
  const lines = [
    `$name = '${FIREWALL_RULE}'`,
    'netsh advfirewall firewall delete rule name="$name" | Out-Null',
    `netsh advfirewall firewall add rule name="$name" dir=in action=allow protocol=TCP localport=${port} profile=private,domain`,
    'exit $LASTEXITCODE',
  ];
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(script, lines.join('\r\n'), 'utf8');
    runPowerShell(
      `Start-Process -Verb RunAs -FilePath 'powershell.exe' ` +
        `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${script}' -Wait`
    );
  } catch (err) {
    appendLog(`Règle de pare-feu : élévation refusée ou impossible (${err.message})`);
    return false;
  } finally {
    try {
      fs.unlinkSync(script);
    } catch (err) {
      // fichier déjà supprimé
    }
  }
  return firewallRuleExists();
}

/**
 * Propose d'autoriser le match en direct dans le pare-feu.
 * @param {boolean} force - affiché depuis le menu (résultat expliqué dans tous les cas)
 */
function offerFirewallRule({ force = false } = {}) {
  const config = loadConfig();

  if (config.mode !== 'host') {
    if (force) {
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: 'Pare-feu ASUL',
        message: 'La règle de pare-feu ne concerne que le poste hôte.',
        detail: 'En mode « rejoindre », aucun autre poste ne se connecte à celui-ci.',
      });
    }
    return false;
  }

  if (firewallRuleExists()) {
    if (force) {
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: 'Pare-feu ASUL',
        message: 'Le match en direct est déjà autorisé.',
        detail: `Règle « ${FIREWALL_RULE} » présente (port ${config.port}).`,
      });
    }
    return true;
  }

  const answer = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'question',
    buttons: ['Autoriser', 'Plus tard'],
    defaultId: 0,
    cancelId: 1,
    title: 'Pare-feu Windows',
    message: 'Autoriser les autres postes à se connecter ?',
    detail:
      `Pour que les autres statisticiens rejoignent le match en direct, Windows doit autoriser ` +
      `le port ${config.port} en entrée. Une demande d'élévation va s'afficher (une seule fois).`,
  });
  if (answer !== 0) {
    appendLog('Règle de pare-feu : reportée par l’utilisateur');
    return false;
  }

  const ok = applyFirewallRule(config.port);
  appendLog(`Règle de pare-feu ${ok ? 'créée' : 'NON créée'} (port ${config.port})`);
  dialog.showMessageBox(mainWindow || undefined, {
    type: ok ? 'info' : 'warning',
    title: 'Pare-feu Windows',
    message: ok ? 'Match en direct autorisé.' : 'La règle de pare-feu n’a pas pu être créée.',
    detail: ok
      ? `Règle « ${FIREWALL_RULE} » active sur le port ${config.port}.`
      : `Autorisez ASUL dans le pare-feu, puis réessayez depuis le menu Serveur.`,
  });
  return ok;
}

function openDataFolder() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  shell.openPath(DATA_DIR);
}

/**
 * Sauvegarde base + vidéos dans un ZIP (archiver est déjà embarqué par le
 * serveur). La base est copiée avant archivage pour capturer un état cohérent,
 * y compris les fichiers WAL en cours d'écriture.
 */
async function backupData() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: 'Sauvegarder les données ASUL',
    defaultPath: path.join(app.getPath('documents'), `ASUL-sauvegarde-${stamp}.zip`),
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return;

  try {
    const archiver = requireFromServer('archiver');
    const tempDbDir = path.join(app.getPath('temp'), `asul-db-${Date.now()}`);
    fs.mkdirSync(tempDbDir, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      const source = path.join(DATA_DIR, `asul.db${suffix}`);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(tempDbDir, `asul.db${suffix}`));
    }

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(result.filePath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(tempDbDir, 'db');
      const uploads = path.join(DATA_DIR, 'uploads');
      if (fs.existsSync(uploads)) archive.directory(uploads, 'uploads');
      archive.finalize();
    });

    fs.rmSync(tempDbDir, { recursive: true, force: true });
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: 'Sauvegarde terminée',
      message: 'Données sauvegardées.',
      detail: `Archive créée :\n${result.filePath}\n\nElle contient la base (comptes, matchs, annotations) et les vidéos.`,
    });
  } catch (err) {
    dialog.showErrorBox('Sauvegarde impossible', err.message);
  }
}

/** Restaure une sauvegarde ZIP dans le dossier de données puis redémarre l'app. */
async function restoreData() {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'Restaurer une sauvegarde ASUL',
    properties: ['openFile'],
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePaths.length) return;
  const zipPath = result.filePaths[0];

  const confirm = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'warning',
    buttons: ['Restaurer et redémarrer', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    message: 'Restaurer cette sauvegarde ?',
    detail:
      'Les données actuelles seront remplacées par celles de l’archive. ' +
      'L’application va redémarrer automatiquement.',
  });
  if (confirm !== 0) return;

  try {
    stopServer();
    // Laisse au serveur le temps de libérer la base SQLite avant de la remplacer.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const tempDir = path.join(app.getPath('temp'), `asul-restore-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    runPowerShell(`Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tempDir}' -Force`);

    for (const [folder, target] of [
      ['db', DATA_DIR],
      ['uploads', path.join(DATA_DIR, 'uploads')],
    ]) {
      const source = path.join(tempDir, folder);
      if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, force: true });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });

    app.relaunch();
    app.exit(0);
  } catch (err) {
    dialog.showErrorBox('Restauration impossible', err.message);
  }
}


// ---------------------------------------------------------------------------
// Diagnostic réseau et serveur
// ---------------------------------------------------------------------------

/**
 * Affiche l'adresse à communiquer aux autres statisticiens, avec boutons
 * « copier » et « ouvrir dans le navigateur ». En mode hôte, la liste des
 * adresses vient du serveur local (/api/system/network-info calcule déjà
 * l'adresse la plus adaptée au réseau de salle).
 */
async function showNetworkInfo() {
  const config = loadConfig();

  // Le match en direct ne fonctionne pas sans la règle de pare-feu : on la
  // propose ici, au moment où le statisticien cherche justement l'adresse.
  if (config.mode === 'host' && !firewallRuleExists()) {
    offerFirewallRule();
  }

  let info = null;
  let error = '';

  if (config.mode === 'host') {
    info = await httpJson(`http://127.0.0.1:${config.port}/api/system/network-info`, 2500);
  } else if (config.mode === 'client') {
    info = { url: `http://${config.host}:${config.port}`, mode: 'client', addresses: [] };
  }

  if (!info) {
    error = '\n\nLe serveur ASUL ne répond pas : lancez l’application en mode « Hôte ».';
  }

  const url = info ? info.url : `http://<adresse-du-PC-hote>:${config.port}`;
  const answer = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'info',
    title: 'Adresse de connexion',
    message: `Les autres statisticiens se connectent à :\n${url}`,
    detail:
      'Chaque statisticien ouvre ASUL sur son poste, choisit « Rejoindre un match » et saisit cette adresse ' +
      '(ou l’ouvre directement dans un navigateur). Chaque statisticien crée son propre compte ASUL.' +
      error,
    buttons: ['Copier l’adresse', 'Ouvrir dans le navigateur', 'Fermer'],
    defaultId: 0,
    cancelId: 2,
  });

  if (answer === 0) {
    const { clipboard } = require('electron');
    clipboard.writeText(url);
  } else if (answer === 1 && info) {
    shell.openExternal(url);
  }
}

/** État technique : base, stockage, ffmpeg, nombre de comptes. */
async function showServerStatus() {
  const base = currentBaseUrl || `http://localhost:${loadConfig().port}`;
  // Délai large : le premier appel peut inclure l'analyse antivirus de ffmpeg.
  const status = await httpJson(`${base}/api/system/status`, 120000);
  const health = await httpJson(`${base}/api/health`, 5000);

  if (!status || !health) {
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'warning',
      title: 'Serveur ASUL',
      message: 'Le serveur ne répond pas.',
      detail: tailLogs(12),
    });
    return;
  }

  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: 'Serveur ASUL',
    message: `Serveur en fonctionnement — version ${status.version}`,
    detail: [
      `Mode            : ${status.mode === 'desktop' ? 'application Windows' : 'serveur'}`,
      `Dossier données : ${status.dataDir}`,
      `Comptes ASUL    : ${status.users === null ? '?' : status.users}`,
      `Pare-feu        : ${firewallRuleExists() ? `match en direct autorisé (port ${loadConfig().port})` : 'règle absente → menu Serveur'}`,
      `FFmpeg          : ${status.ffmpegAvailable ? 'disponible' : 'INDISPONIBLE'} (${status.ffmpegPath})`,
      `Interface       : ${status.clientDist}`,
      `Journal         : ${SERVER_LOG}`,
    ].join('\n'),
  });
}

function restartServer() {
  const config = loadConfig();
  if (config.mode !== 'host') return;
  const confirm = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'question',
    buttons: ['Redémarrer', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    message: 'Redémarrer le serveur ASUL ?',
    detail: 'Les autres postes connectés perdront brièvement la connexion au match en direct.',
  });
  if (confirm !== 0) return;

  appendLog('Redémarrage manuel du serveur demandé');
  restartServerProcess(config.port).catch((err) => appendLog(`Redémarrage impossible : ${err.message}`));
}

/** Repasse par l'écran de choix « Hôte » / « Rejoindre ». */
function switchMode() {
  const confirm = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: 'question',
    buttons: ['Changer de mode', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    message: 'Changer le mode d’utilisation ?',
    detail:
      'Si ce PC héberge un match en direct, les autres statisticiens perdront la connexion. ' +
      'Vos données locales restent enregistrées.',
  });
  if (confirm !== 0) return;

  stopServer();
  serverRestarts = 0;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const windowRef = mainWindow;
    mainWindow = null;
    windowRef.destroy();
  }
  const config = loadConfig();
  config.mode = null;
  saveConfig(config);
  createSplash();
  boot({ choose: true });
}


// ---------------------------------------------------------------------------
// Menu de l'application
// ---------------------------------------------------------------------------

function buildMenu() {
  const config = loadConfig();
  const isHost = config.mode === 'host';

  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Ouvrir le dossier des données', accelerator: 'CmdOrCtrl+Shift+D', click: openDataFolder },
        { type: 'separator' },
        { label: 'Sauvegarder les données (ZIP)…', accelerator: 'CmdOrCtrl+Shift+S', click: backupData },
        { label: 'Restaurer une sauvegarde…', click: restoreData },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Serveur',
      submenu: [
        { label: 'Adresse pour les autres statisticiens…', accelerator: 'CmdOrCtrl+Shift+N', click: showNetworkInfo },
        { label: 'Autoriser le match en direct dans le pare-feu…', enabled: isHost, click: () => offerFirewallRule({ force: true }) },
        { label: 'État du serveur…', click: showServerStatus },
        { label: 'Redémarrer le serveur', accelerator: 'CmdOrCtrl+Shift+R', enabled: isHost, click: restartServer },
        { label: 'Ouvrir le journal du serveur', click: () => shell.openPath(SERVER_LOG) },
        { type: 'separator' },
        { label: 'Changer de mode (hôte / rejoindre)…', click: switchMode },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger l’interface', accelerator: 'CmdOrCtrl+R' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Rechercher une mise à jour…', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: 'Outils de développement', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
        {
          label: 'À propos d’ASUL',
          click: () =>
            dialog.showMessageBox(mainWindow || undefined, {
              type: 'info',
              title: 'À propos',
              message: `ASUL — analyse vidéo de volleyball`,
              detail:
                `Version ${app.getVersion()}\n` +
                `Mode : ${isHost ? 'hôte (serveur local)' : isHost === false && config.mode === 'client' ? 'rejoint un hôte' : 'non défini'}\n` +
                `Réseau : port ${config.port}\n` +
                `Données : ${DATA_DIR}\n\n` +
                'Utilisation locale (hors ligne) ou en réseau local pour le codage en direct à plusieurs.',
            }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Échanges avec l'écran de démarrage
// ---------------------------------------------------------------------------

ipcMain.handle('asul:splash-state', () => splashState);
ipcMain.handle('asul:info', () => ({
  version: app.getVersion(),
  mode: loadConfig().mode,
  port: loadConfig().port,
  dataDir: DATA_DIR,
  logsPath: SERVER_LOG,
  baseUrl: currentBaseUrl,
}));

/** Teste la joignabilité d'un poste hôte (bouton « Tester » de l'écran de choix). */
ipcMain.handle('asul:test-host', async (event, payload) => {
  const host = String(payload?.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const port = Number(payload?.port) || DEFAULT_CONFIG.port;
  if (!host) return { ok: false, message: 'Adresse vide.' };
  const health = await httpJson(`http://${host}:${port}/api/health`, 4000);
  if (health && health.status === 'ok') return { ok: true, message: `Poste ASUL trouvé sur ${host}:${port}.` };
  return { ok: false, message: `Aucun poste ASUL ne répond sur ${host}:${port}.` };
});

/** Choix du mode d'utilisation depuis l'écran de démarrage. */
ipcMain.on('asul:choose', (event, payload) => {
  const config = loadConfig();
  config.mode = payload?.mode === 'client' ? 'client' : 'host';
  config.host = String(payload?.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  config.port = Number(payload?.port) || DEFAULT_CONFIG.port;
  saveConfig(config);
  appendLog(`Mode choisi : ${config.mode}${config.mode === 'client' ? ` (${config.host}:${config.port})` : ''}`);
  boot();
});

ipcMain.on('asul:retry', () => boot());
ipcMain.on('asul:choose-mode', () => boot({ choose: true }));

// Mise à jour de l'application (bandeau de l'interface + menu « Aide »).
ipcMain.handle('asul:update-state', () => ({ ...updateStatus }));
ipcMain.on('asul:update-check', () => checkForUpdates(false));
ipcMain.on('asul:update-install', () => installUpdate());
ipcMain.on('asul:open-data-folder', () => openDataFolder());
ipcMain.on('asul:open-logs', () => shell.openPath(SERVER_LOG));
ipcMain.on('asul:quit', () => app.quit());

// ---------------------------------------------------------------------------
// Test d'intégration (option --smoke-test)
//
// Démarre le serveur embarqué sur un port de test, vérifie /api/health et
// /api/system/status (base SQLite chargée sous Electron, ffmpeg embarqué
// détecté), affiche un bilan puis quitte avec le code 0 (succès) ou 1 (échec).
// Utilisé en phase de validation et dans un éventuel contrôle automatisé.
// ---------------------------------------------------------------------------

const SMOKE_TEST = process.argv.includes('--smoke-test');

async function runSmokeTest() {
  const port = await findFreePort(3999);
  const report = (line) => {
    console.log(line);
    // Dupliqué dans le journal : la sortie console n'est pas toujours capturée
    // quand Electron démarre en application graphique sous Windows.
    appendLog(`[smoke] ${line}`);
  };

  report(`démarrage du serveur sur le port ${port}…`);
  startServer(port);

  const ready = await waitForServer(port, 60000);
  // Le premier appel peut durer (analyse antivirus du binaire ffmpeg) : délai large.
  const status = ready ? await httpJson(`http://127.0.0.1:${port}/api/system/status`, 120000) : null;
  const network = ready ? await httpJson(`http://127.0.0.1:${port}/api/system/network-info`, 5000) : null;

  report(`health          : ${ready}`);
  report(`base de données : ${status ? `OK (${status.users} compte(s))` : 'ÉCHEC'}`);
  report(`données         : ${status ? status.dataDir : '-'}`);
  report(`interface       : ${status ? status.clientDist : '-'}`);
  report(`ffmpeg          : ${status ? `${status.ffmpegAvailable} (${status.ffmpegPath})` : '-'}`);
  report(`réseau local    : ${network ? network.url : '-'}`);

  const ok = Boolean(ready && status && status.users !== null && status.ffmpegAvailable);
  report(ok ? 'RÉSULTAT : SUCCÈS' : `RÉSULTAT : ÉCHEC\n${tailLogs(20)}`);

  quitting = true;
  stopServer();
  setTimeout(() => app.exit(ok ? 0 : 1), 500);
}

// ---------------------------------------------------------------------------
// Cycle de vie
// ---------------------------------------------------------------------------

// Une seule instance : sinon deux serveurs se disputeraient le port et la base.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (SMOKE_TEST) {
      await runSmokeTest();
      return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    appendLog(`ASUL ${app.getVersion()} démarré (données : ${DATA_DIR})`);
    buildMenu();
    createSplash();
    setUpAutoUpdater();
    await boot();
    // La recherche de mise à jour ne doit pas retarder l'ouverture de l'écran.
    scheduleUpdateChecks();
  });

  app.on('activate', () => {
    if (!mainWindow && !splashWindow) {
      createSplash();
      boot();
    }
  });

  app.on('window-all-closed', () => {
    // L'application est un poste de travail : fermer la fenêtre doit tout arrêter.
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    quitting = true;
    stopServer();
  });
}
