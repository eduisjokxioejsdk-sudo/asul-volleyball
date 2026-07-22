const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const cuttingRoutes = require('./routes/cutting');
const pointsRoutes = require('./routes/points');

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


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/cutting', cuttingRoutes);
app.use('/api/points', pointsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ASUL Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ASUL Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});