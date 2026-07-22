const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// En production (Railway), utiliser le volume persistant /data si disponible
const dataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..'));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'asul.db');


const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database:', dbPath);
  }
});

// Enable WAL mode for better performance
db.run('PRAGMA journal_mode=WAL;');

db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Folders table
  db.run(`CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#1a73e8',
    parent_folder_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_folder_id) REFERENCES folders(id)
  )`);

  // Videos table
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    display_name TEXT,
    filepath TEXT NOT NULL,
    filepath_trimmed TEXT,
    color TEXT DEFAULT '#1a73e8',
    team1_name TEXT DEFAULT 'Équipe 1',
    team2_name TEXT DEFAULT 'Équipe 2',
    duration REAL,
    status TEXT DEFAULT 'uploaded',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Video-Folder many-to-many relationship
  db.run(`CREATE TABLE IF NOT EXISTS video_folders (
    video_id INTEGER NOT NULL,
    folder_id INTEGER NOT NULL,
    PRIMARY KEY (video_id, folder_id),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
  )`);

  // Points table (for annotations)
  db.run(`CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    point_number INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    winner TEXT,
    serving_team TEXT,
    receiving_team TEXT,
    team1_position TEXT,
    team2_position TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`);

  // Cutting segments table
  db.run(`CREATE TABLE IF NOT EXISTS cut_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    point_index INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`);

  // Migrate existing database if needed
  db.all("PRAGMA table_info(videos)", (err, columns) => {
    if (err) return;
    const columnNames = columns.map(col => col.name);
    
    if (!columnNames.includes('folder_id')) {
      db.run('ALTER TABLE videos ADD COLUMN folder_id INTEGER');
    }
    if (!columnNames.includes('display_name')) {
      db.run('ALTER TABLE videos ADD COLUMN display_name TEXT');
    }
    if (!columnNames.includes('color')) {
      db.run('ALTER TABLE videos ADD COLUMN color TEXT DEFAULT \'#1a73e8\'');
    }
  });
});

module.exports = db;