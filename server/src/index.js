// Configuration centralisée (doit être requise en premier : elle positionne
// DATA_DIR, JWT_SECRET et FFMPEG_PATH pour tous les autres modules).
const config = require('./config');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const datavolleyRoutes = require('./routes/datavolley');
const liveRoutes = require('./routes/live');
const teamsRoutes = require('./routes/teams');
const trajectoryRoutes = require('./routes/trajectories');
const playlistRoutes = require('./routes/playlists');
const systemRoutes = require('./routes/system');
const { initSocket } = require('./socket');
const db = require('./database');

// Filet de sécurité : une exception non gérée dans une route NE doit PAS tuer
// tout le serveur (une erreur de code ne doit pas mettre l'app hors ligne).
process.on('uncaughtException', (err) => {
  console.error('[ASUL] Exception non gérée :', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[ASUL] Rejet de promesse non géré :', reason);
});

const app = express();
const PORT = config.PORT;
const HOST = config.HOST;
const dataDir = config.dataDir;
const uploadsDir = config.uploadsDir;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/datavolley', datavolleyRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/trajectories', trajectoryRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/system', systemRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ASUL Server is running' });
});

// Sert le frontend React buildé (build Vite). En développement cette route est
// inutilisée (Vite sert l'app sur le port 5173 avec un proxy vers /api) ; en
// installation desktop c'est le mode de service principal : une seule origine,
// donc ni CORS ni URL d'API à configurer.
const clientBuildPath = config.clientDistPath;
if (fs.existsSync(clientBuildPath)) {
  console.log('Serving client build from:', clientBuildPath);
  app.use(express.static(clientBuildPath));

  // SPA fallback : pour toute route qui n'est pas /api ou /uploads, renvoyer index.html
  app.get('*', (req, res) => {
    // Ne pas intercepter les requêtes /api ou /uploads
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Vérifie la disponibilité de ffmpeg (découpe serveur et export par position).
// Le test est volontairement ASYNCHRONE : au premier lancement d'une
// installation, l'antivirus peut analyser longuement le binaire ffmpeg
// (140 Mo) ; un test bloquant retarderait l'ouverture de l'interface.
{
  const { execFile } = require('child_process');
  execFile(config.ffmpegPath, ['-version'], { timeout: 60000 }, (err) => {
    if (err) {
      console.warn(
        'FFmpeg: introuvable — la découpe serveur et l\'export par position seront indisponibles. ' +
          'Installez ffmpeg ou définissez FFMPEG_PATH dans server/.env.'
      );
    } else {
      console.log('FFmpeg: disponible (' + config.ffmpegPath + ')');
    }
  });
}

// Le serveur ne commence à répondre qu'une fois le schéma de la base de
// données prêt : sqlite3 exécute les créations de tables en parallèle, et une
// requête reçue juste après le démarrage pouvait précéder la table `users`
// (« no such table: users »). Sans conséquence perceptible au démarrage.
db.waitReady(() => {
  const server = app.listen(PORT, HOST, () => {
    console.log(`ASUL Server running on ${HOST}:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Données : ${dataDir}`);
    // Adresse à communiquer aux autres statisticiens (match en direct en réseau).
    if (config.bestLanAddress() !== 'localhost') {
      console.log(`Réseau local : http://${config.bestLanAddress()}:${PORT}`);
    }
  });

  // Initialise Socket.IO pour le mode "match en direct" (multi-appareils).
  initSocket(server);

  // Exports de clips (mode « Playlists ») : le dossier temporaire est vidé au
  // démarrage (les ZIP d'une session précédente ne sont plus téléchargeables).
  require('./clipExport').purgeExports().catch(() => {});

  // Synchronisation cloud (partage à distance, Supabase) : boucles de fond
  // lancées APRÈS le démarrage, sans jamais le retarder. Sans configuration,
  // elles ne font rien et l'application reste 100 % locale.
  require('./syncHub').startAll();

  // Autoriser les très gros uploads (vidéos de plusieurs Go) :
  // on désactive le timeout de requête de Node.js (5 min par défaut) et le
  // timeout de socket, sinon l'envoi d'un fichier de 12 Go serait coupé.
  server.requestTimeout = 0;
  server.timeout = 0;
});
