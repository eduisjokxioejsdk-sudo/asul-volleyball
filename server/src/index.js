require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const cuttingRoutes = require('./routes/cutting');
const pointsRoutes = require('./routes/points');
const r2 = require('./r2');

const app = express();
const PORT = process.env.PORT || 3001;

// En production (Railway), utiliser le volume persistant /data si disponible
const dataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..'));
const uploadsDir = path.join(dataDir, 'uploads');

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
app.use('/api/cutting', cuttingRoutes);
app.use('/api/points', pointsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ASUL Server is running' });
});

// Serve static files from the React frontend build (production)
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
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

app.listen(PORT, () => {
  console.log(`ASUL Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Cloudflare R2 storage: ${r2.R2_ENABLED() ? 'enabled' : 'disabled (using local storage)'}`);
});
