const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Dossier de données (positionné par config.js ; repli sur server/ si absent).
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
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

// ---------------------------------------------------------------------------
// Barrière de démarrage
// ---------------------------------------------------------------------------
// sqlite3 exécute les requêtes en parallèle : une requête reçue juste après le
// démarrage peut précéder la création des tables (« no such table: users »).
// `waitReady` attend donc la fin du schéma initial ET des migrations avant que
// le serveur n'accepte des requêtes (voir server/src/index.js).
let pendingMigrations = 7; // équipes + trajectoires + vidéos + matchs + actions + événements + setups
let statementsDrained = false;
let schemaReady = false;
const readyQueue = [];

function markReady() {
  if (schemaReady) return;
  schemaReady = true;
  readyQueue.splice(0).forEach((callback) => {
    try {
      callback();
    } catch (err) {
      console.error('Erreur au démarrage du serveur :', err);
    }
  });
}

function maybeReady() {
  if (statementsDrained && pendingMigrations <= 0) markReady();
}

function migrationDone() {
  pendingMigrations -= 1;
  maybeReady();
}

/**
 * Ajoute les colonnes de synchronisation cloud (sync_uuid, dirty, deleted,
 * local_updated_at, cloud_updated_at) à une table, et attribue un identifiant
 * partagé + un horodatage aux lignes existantes (elles seront envoyées au
 * premier cycle de synchronisation).
 */
function addSyncColumns(tableName, callback, idColumn = 'id') {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) return callback();
    const names = (columns || []).map((c) => c.name);
    if (!names.length) return callback();

    const steps = [];
    if (!names.includes('sync_uuid')) steps.push(`ALTER TABLE ${tableName} ADD COLUMN sync_uuid TEXT`);
    if (!names.includes('dirty')) steps.push(`ALTER TABLE ${tableName} ADD COLUMN dirty INTEGER DEFAULT 1`);
    if (!names.includes('deleted')) steps.push(`ALTER TABLE ${tableName} ADD COLUMN deleted INTEGER DEFAULT 0`);
    if (!names.includes('local_updated_at')) steps.push(`ALTER TABLE ${tableName} ADD COLUMN local_updated_at TEXT`);
    if (!names.includes('cloud_updated_at')) steps.push(`ALTER TABLE ${tableName} ADD COLUMN cloud_updated_at TEXT`);
    steps.push(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_sync_uuid ON ${tableName}(sync_uuid)`);

    const backfill = () => {
      db.all(`SELECT ${idColumn} AS id FROM ${tableName} WHERE sync_uuid IS NULL OR sync_uuid = ''`, (err2, rows) => {
        if (err2 || !rows || rows.length === 0) return callback();
        // Certaines tables (volley_matches, set_setups) n'ont pas de colonne
        // `created_at` : on retombe alors sur `datetime('now')`.
        const since = names.includes('created_at')
          ? "COALESCE(NULLIF(local_updated_at, ''), created_at, datetime('now'))"
          : "COALESCE(NULLIF(local_updated_at, ''), datetime('now'))";
        const stmt = db.prepare(
          `UPDATE ${tableName}
              SET sync_uuid = ?,
                  local_updated_at = ${since},
                  dirty = 1
            WHERE ${idColumn} = ?`
        );
        stmt.on('error', (stmtErr) => console.warn(`Migration ${tableName} : ${stmtErr.message}`));
        rows.forEach((row) => {
          stmt.run(crypto.randomUUID(), row.id, (runErr) => {
            if (runErr) console.warn(`Migration ${tableName} : ${runErr.message}`);
          });
        });
        stmt.finalize(() => callback());
      });
    };

    const runStep = (index) => {
      if (index >= steps.length) return backfill();
      db.run(steps[index], (stepErr) => {
        if (stepErr) console.warn(`Migration ${tableName} : ${stepErr.message}`);
        runStep(index + 1);
      });
    };
    runStep(0);
  });
}

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

  // DataVolley actions table (one row per coded action; rallies are derived)
  db.run(`CREATE TABLE IF NOT EXISTS volley_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    action_index INTEGER NOT NULL,
    code TEXT NOT NULL,
    timecode REAL,
    system_time INTEGER,
    team TEXT NOT NULL,
    player_number INTEGER NOT NULL,
    action TEXT NOT NULL,
    evaluation TEXT NOT NULL,
    type TEXT,
    start_zone TEXT,
    end_zone TEXT,
    end_subzone TEXT,
    set_number INTEGER,
    note TEXT,
    attack_zone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`);

  // Réglages de synchronisation vidéo par match (ancre + décalage + marges).
  db.run(`CREATE TABLE IF NOT EXISTS volley_sync (
    video_id INTEGER PRIMARY KEY,
    sync_offset REAL DEFAULT 0,
    anchor_action_id INTEGER,
    anchor_timecode REAL,
    anchor_system_time INTEGER,
    lead_in REAL DEFAULT 4,
    lead_out REAL DEFAULT 3,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`);

  // DataVolley match state per video (en cours / terminé)
  db.run(`CREATE TABLE IF NOT EXISTS volley_matches (
    video_id INTEGER PRIMARY KEY,
    status TEXT DEFAULT 'coding',
    finished_at DATETIME,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_uuid TEXT,
    away_team_uuid TEXT,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`);

  // Live sessions (codage d'un match en direct, multi-appareils)
  db.run(`CREATE TABLE IF NOT EXISTS live_sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team1_name TEXT DEFAULT 'Domicile',
    team2_name TEXT DEFAULT 'Extérieur',
    owner_user_id INTEGER NOT NULL,
    join_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    video_id INTEGER,
    video_delay REAL DEFAULT 10,
    home_team_id INTEGER,
    away_team_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Membres d'une session live (comptes séparés, rôle + actions assignées)
  db.run(`CREATE TABLE IF NOT EXISTS live_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'statistician',
    assignment TEXT NOT NULL DEFAULT '["S","R","A","B","D"]',
    device_key TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES live_sessions(id)
  )`);

  // Actions codées en direct (ordre canonique par effective_time puis seq)
  db.run(`CREATE TABLE IF NOT EXISTS live_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    effective_time REAL NOT NULL,
    seq INTEGER NOT NULL,
    member_id INTEGER,
    assigned INTEGER DEFAULT 1,
    code TEXT NOT NULL,
    system_time INTEGER,
    team TEXT,
    player_number INTEGER,
    action TEXT,
    evaluation TEXT,
    type TEXT,
    start_zone TEXT,
    end_zone TEXT,
    end_subzone TEXT,
    attack_zone TEXT,
    set_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES live_sessions(id)
  )`);

  // Équipes partagées (globales, accessibles à tous les appareils connectés).
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    libero INTEGER,
    libero_for INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Joueurs d'une équipe (n° de maillot + nom + rôle).
  db.run(`CREATE TABLE IF NOT EXISTS team_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'universal',
    serve_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);

  // État de la synchronisation cloud des équipes (curseur de lecture, dernier
  // horodatage, dernière erreur) — voir server/src/teamsSync.js.
  db.run(`CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Positions de départ par set (six complet + premier serveur).
  // match_key = 'video:<id>' ou 'session:<id>'.
  db.run(`CREATE TABLE IF NOT EXISTS set_setups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_key TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    first_server TEXT,
    home_lineup TEXT,
    away_lineup TEXT,
    UNIQUE(match_key, set_number)
  )`);

  // Événements de match DataVolley : temps morts et remplacements, situés au
  // point (rallye) après lequel ils surviennent. `payload` est un JSON libre
  // (remplacement : { out, in } ; temps mort : {}).
  db.run(`CREATE TABLE IF NOT EXISTS volley_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    set_number INTEGER,
    point_number INTEGER,
    team TEXT,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_volley_events_video ON volley_events (video_id, set_number, point_number)');

  // Attribution de sets (codage collaboratif) : un scout revendique un set d'une
  // vidéo partagée. L'identité du titulaire est embarquée (uuid + nom + email)
  // pour être lisible sur tous les postes, sans table de comptes partagée.
  db.run(`CREATE TABLE IF NOT EXISTS video_set_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_uuid TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    claimed_by_uuid TEXT,
    claimed_by_name TEXT,
    claimed_by_email TEXT,
    claimed_at DATETIME,
    sync_uuid TEXT,
    dirty INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0,
    local_updated_at TEXT,
    cloud_updated_at TEXT,
    UNIQUE(video_uuid, set_number)
  )`);

  // Fiches de trajectoire (outil temporaire, partagé comme les équipes).
  // Un match porte 1 ou 2 équipes de la table teams (away_team_id NULL si une
  // seule équipe) ; les noms sont figés pour rester lisibles si l'équipe est
  // renommée plus tard.
  db.run(`CREATE TABLE IF NOT EXISTS trajectory_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_uuid TEXT,
    away_team_uuid TEXT,
    team1_name TEXT,
    team2_name TEXT,
    status TEXT DEFAULT 'open',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Une flèche = un départ + une arrivée (coordonnées SVG du terrain complet)
  // + l'issue lue sur la popup (ou 'out' automatique hors des lignes).
  db.run(`CREATE TABLE IF NOT EXISTS trajectory_shots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    team_side TEXT NOT NULL,
    player_number INTEGER NOT NULL,
    kind TEXT NOT NULL,
    start_x REAL NOT NULL,
    start_y REAL NOT NULL,
    end_x REAL NOT NULL,
    end_y REAL NOT NULL,
    result TEXT NOT NULL,
    set_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES trajectory_matches(id) ON DELETE CASCADE
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_trajectory_shots_match ON trajectory_shots (match_id, team_side, kind)');

  // Montages vidéo (générateur de compilations d'actions / rallies)
  db.run(`CREATE TABLE IF NOT EXISTS video_montages (
    id TEXT PRIMARY KEY,
    video_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    progress_step TEXT,
    clip_count INTEGER DEFAULT 0,
    output_filename TEXT,
    output_filepath TEXT,
    file_size INTEGER,
    duration REAL,
    error_message TEXT,
    settings TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_video_montages_video ON video_montages (video_id, user_id)');

  // Les playlists de séance (versions 2.1 et 2.2) ont été retirées : le système
  // n'existe plus dans l'application. La table est supprimée des postes qui
  // l'auraient créée, pour ne pas laisser de données orphelines.
  db.run('DROP TABLE IF EXISTS playlists', (err) => {
    if (!err) console.log('[ASUL] Table « playlists » retirée (système supprimé en 3.0.1).');
  });

  // Playlists vidéo persistantes multi-matchs (DataVolley 4 Pro — Point 19)
  db.run(`CREATE TABLE IF NOT EXISTS dv_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS dv_playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    video_id INTEGER NOT NULL,
    action_id INTEGER,
    code TEXT,
    team1_name TEXT,
    team2_name TEXT,
    set_number INTEGER DEFAULT 1,
    timecode REAL NOT NULL DEFAULT 0,
    lead_in REAL DEFAULT 3,
    lead_out REAL DEFAULT 4,
    note TEXT,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES dv_playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_dv_playlist_items_pl ON dv_playlist_items (playlist_id, position)');

  // Mode Entraînement (Point 13 — séances et ateliers sans score ni rotation)
  db.run(`CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_id INTEGER,
    team_name TEXT,
    video_id INTEGER,
    drill_type TEXT DEFAULT 'all',
    notes TEXT,
    session_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS practice_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    action_index INTEGER NOT NULL,
    code TEXT NOT NULL,
    timecode REAL,
    player_number INTEGER,
    action TEXT,
    evaluation TEXT,
    type TEXT,
    start_zone TEXT,
    end_zone TEXT,
    end_subzone TEXT,
    start_x REAL,
    start_y REAL,
    end_x REAL,
    end_y REAL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_practice_actions_session ON practice_actions (session_id, action_index)');

  // Colonnes de partage des trajectoires : `created_by` (email du créateur) et
  // les UUID d'équipe (pour re-lier l'effectif quand l'équipe arrive après la
  // fiche — voir syncCollections.js et relinkTeams.js).
  db.all('PRAGMA table_info(trajectory_matches)', (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (!names.length) return;
    if (!names.includes('created_by')) db.run('ALTER TABLE trajectory_matches ADD COLUMN created_by TEXT');
    if (!names.includes('home_team_uuid')) db.run('ALTER TABLE trajectory_matches ADD COLUMN home_team_uuid TEXT');
    if (!names.includes('away_team_uuid')) db.run('ALTER TABLE trajectory_matches ADD COLUMN away_team_uuid TEXT');
    if (!names.includes('video_id')) db.run('ALTER TABLE trajectory_matches ADD COLUMN video_id INTEGER');
  });

  // Colonnes d'UUID d'équipe sur les matchs (codage DataVolley), pour la même
  // re-liaison que les trajectoires.
  db.all('PRAGMA table_info(volley_matches)', (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (!names.length) return;
    if (!names.includes('home_team_uuid')) db.run('ALTER TABLE volley_matches ADD COLUMN home_team_uuid TEXT');
    if (!names.includes('away_team_uuid')) db.run('ALTER TABLE volley_matches ADD COLUMN away_team_uuid TEXT');
  });

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
    if (!columnNames.includes('filepath_proxy')) {
      db.run('ALTER TABLE videos ADD COLUMN filepath_proxy TEXT');
    }
    if (!columnNames.includes('home_team_id')) {
      db.run('ALTER TABLE videos ADD COLUMN home_team_id INTEGER');
    }
    if (!columnNames.includes('away_team_id')) {
      db.run('ALTER TABLE videos ADD COLUMN away_team_id INTEGER');
    }
    if (!columnNames.includes('filename_angle2')) {
      db.run('ALTER TABLE videos ADD COLUMN filename_angle2 TEXT');
    }
    if (!columnNames.includes('filepath_angle2')) {
      db.run('ALTER TABLE videos ADD COLUMN filepath_angle2 TEXT');
    }
    if (!columnNames.includes('angle2_offset')) {
      db.run('ALTER TABLE videos ADD COLUMN angle2_offset REAL DEFAULT 0');
    }
    // Préparation de la lecture navigateur (voir server/src/proxy.js) :
    //   proxy_status = null | not_needed | processing | ready | error
    //   proxy_error  = raison (fichier non décodable) ou message d'échec.
    if (!columnNames.includes('proxy_status')) {
      db.run('ALTER TABLE videos ADD COLUMN proxy_status TEXT');
    }
    if (!columnNames.includes('proxy_error')) {
      db.run('ALTER TABLE videos ADD COLUMN proxy_error TEXT');
    }
  });

  // Migrate live_sessions: add team association columns if missing
  db.all("PRAGMA table_info(live_sessions)", (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (names.length > 0 && !names.includes('home_team_id')) {
      db.run('ALTER TABLE live_sessions ADD COLUMN home_team_id INTEGER');
    }
    if (names.length > 0 && !names.includes('away_team_id')) {
      db.run('ALTER TABLE live_sessions ADD COLUMN away_team_id INTEGER');
    }
    if (names.length > 0 && !names.includes('deleted_at')) {
      db.run('ALTER TABLE live_sessions ADD COLUMN deleted_at DATETIME');
    }
    if (names.length > 0 && !names.includes('current_point')) {
      db.run('ALTER TABLE live_sessions ADD COLUMN current_point INTEGER DEFAULT 1');
    }
    if (names.length > 0 && !names.includes('point_completed')) {
      db.run('ALTER TABLE live_sessions ADD COLUMN point_completed TEXT');
    }
  });

  // Migrate volley_matches: add team association columns if missing
  db.all("PRAGMA table_info(volley_matches)", (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (names.length > 0 && !names.includes('home_team_id')) {
      db.run('ALTER TABLE volley_matches ADD COLUMN home_team_id INTEGER');
    }
    if (names.length > 0 && !names.includes('away_team_id')) {
      db.run('ALTER TABLE volley_matches ADD COLUMN away_team_id INTEGER');
    }
  });

  // Migrate volley_actions: add attack_zone column if missing
  db.all("PRAGMA table_info(volley_actions)", (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (names.length > 0 && !names.includes('attack_zone')) {
      db.run('ALTER TABLE volley_actions ADD COLUMN attack_zone TEXT');
    }
  });

  // Migrate live_actions: add attack_zone column if missing
  db.all("PRAGMA table_info(live_actions)", (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (names.length > 0 && !names.includes('attack_zone')) {
      db.run('ALTER TABLE live_actions ADD COLUMN attack_zone TEXT');
    }
  });

  // Migrate set_setups: add setter number columns if missing
  db.all("PRAGMA table_info(set_setups)", (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (names.length > 0 && !names.includes('home_setter')) {
      db.run('ALTER TABLE set_setups ADD COLUMN home_setter INTEGER');
    }
    if (names.length > 0 && !names.includes('away_setter')) {
      db.run('ALTER TABLE set_setups ADD COLUMN away_setter INTEGER');
    }
    if (names.length > 0 && !names.includes('home_setter_pos')) {
      db.run('ALTER TABLE set_setups ADD COLUMN home_setter_pos TEXT');
    }
    if (names.length > 0 && !names.includes('away_setter_pos')) {
      db.run('ALTER TABLE set_setups ADD COLUMN away_setter_pos TEXT');
    }
  });

  // Migrate volley_actions / live_actions : champs étendus du code DataVolley
  // (type de geste + zones départ / arrivée / sous-zone).
  const extendActionTable = (table) => {
    const cols = [
      ['type', 'TEXT'],
      ['start_zone', 'TEXT'],
      ['end_zone', 'TEXT'],
      ['end_subzone', 'TEXT'],
      ['start_x', 'REAL'],
      ['start_y', 'REAL'],
      ['mid_x', 'REAL'],
      ['mid_y', 'REAL'],
      ['end_x', 'REAL'],
      ['end_y', 'REAL'],
      ['is_auto', 'INTEGER DEFAULT 0'],
      ['set_number', 'INTEGER'],
    ];
    db.all(`PRAGMA table_info(${table})`, (err, columns) => {
      if (err) return;
      const names = (columns || []).map((c) => c.name);
      if (!names.length) return;
      for (const [col, type] of cols) {
        if (!names.includes(col)) db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    });
  };
  extendActionTable('volley_actions');
  extendActionTable('live_actions');

  // Migrate team_players : rôle (passeur, pointu, réceptionneur, central, libéro)
  db.all('PRAGMA table_info(team_players)', (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (!names.length) return;
    if (!names.includes('role')) db.run("ALTER TABLE team_players ADD COLUMN role TEXT DEFAULT 'universal'");
    if (!names.includes('serve_type')) db.run('ALTER TABLE team_players ADD COLUMN serve_type TEXT');
    if (!names.includes('license_number')) db.run('ALTER TABLE team_players ADD COLUMN license_number TEXT');
    if (!names.includes('first_name')) db.run('ALTER TABLE team_players ADD COLUMN first_name TEXT');
    if (!names.includes('last_name')) db.run('ALTER TABLE team_players ADD COLUMN last_name TEXT');
    if (!names.includes('secondary_role')) db.run('ALTER TABLE team_players ADD COLUMN secondary_role TEXT');
    if (!names.includes('height_cm')) db.run('ALTER TABLE team_players ADD COLUMN height_cm INTEGER');
    if (!names.includes('birth_year')) db.run('ALTER TABLE team_players ADD COLUMN birth_year INTEGER');
    if (!names.includes('handedness')) db.run("ALTER TABLE team_players ADD COLUMN handedness TEXT DEFAULT 'R'");
    if (!names.includes('is_captain')) db.run('ALTER TABLE team_players ADD COLUMN is_captain INTEGER DEFAULT 0');
    if (!names.includes('is_libero')) db.run('ALTER TABLE team_players ADD COLUMN is_libero INTEGER DEFAULT 0');
    if (!names.includes('active')) db.run('ALTER TABLE team_players ADD COLUMN active INTEGER DEFAULT 1');
  });

  // Migrate volley_sync : offsets vidéo par set (Point 22)
  db.all('PRAGMA table_info(volley_sync)', (err, columns) => {
    if (err) return;
    const names = (columns || []).map((c) => c.name);
    if (!names.length) return;
    if (!names.includes('set_offsets')) db.run("ALTER TABLE volley_sync ADD COLUMN set_offsets TEXT DEFAULT '{}'");
  });

  // Migrate teams : libéro, joueur remplacé, puis colonnes de la synchronisation
  // cloud (voir server/src/teamsSync.js) :
  //   • sync_uuid        : identifiant partagé par tous les postes ;
  //   • dirty            : 1 = modification locale à envoyer au cloud ;
  //   • deleted          : pierre tombale (la suppression doit se propager) ;
  //   • local_updated_at : date de la dernière modification sur ce poste ;
  //   • cloud_updated_at : dernier horodatage serveur connu pour cette équipe.
  //
  // Les étapes sont enchaînées (callback de l'une → suivante) : c'est le seul
  // moyen d'être certain que l'index sur sync_uuid s'exécute APRÈS les ALTER
  // TABLE, quel que soit le mode d'exécution de sqlite3. Chaque appel reçoit un
  // callback pour qu'une erreur soit journalisée au lieu de faire tomber le
  // serveur (« Emitted 'error' event on Statement instance »).
  db.all('PRAGMA table_info(teams)', (err, columns) => {
    if (err) return migrationDone();
    const names = (columns || []).map((c) => c.name);
    if (!names.length) return migrationDone();

    const steps = [];
    if (!names.includes('libero')) steps.push('ALTER TABLE teams ADD COLUMN libero INTEGER');
    if (!names.includes('libero_for')) steps.push('ALTER TABLE teams ADD COLUMN libero_for INTEGER');
    if (!names.includes('sync_uuid')) steps.push('ALTER TABLE teams ADD COLUMN sync_uuid TEXT');
    if (!names.includes('dirty')) steps.push('ALTER TABLE teams ADD COLUMN dirty INTEGER DEFAULT 1');
    if (!names.includes('deleted')) steps.push('ALTER TABLE teams ADD COLUMN deleted INTEGER DEFAULT 0');
    if (!names.includes('local_updated_at')) steps.push('ALTER TABLE teams ADD COLUMN local_updated_at TEXT');
    if (!names.includes('cloud_updated_at')) steps.push('ALTER TABLE teams ADD COLUMN cloud_updated_at TEXT');
    steps.push('CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_sync_uuid ON teams(sync_uuid)');

    // Rattrapage des équipes créées avant l'activation de la synchronisation :
    // un identifiant partagé et une date de modification leur sont attribués,
    // elles seront envoyées au cloud au premier cycle (dirty = 1).
    const backfill = () => {
      db.all("SELECT id FROM teams WHERE sync_uuid IS NULL OR sync_uuid = ''", (err2, rows) => {
        if (err2 || !rows || rows.length === 0) return migrationDone();
        const stmt = db.prepare(
          `UPDATE teams
              SET sync_uuid = ?,
                  local_updated_at = COALESCE(NULLIF(local_updated_at, ''), created_at, datetime('now')),
                  dirty = 1
            WHERE id = ?`
        );
        stmt.on('error', (stmtErr) => console.warn(`Migration teams (rattrapage) : ${stmtErr.message}`));
        rows.forEach((row) => {
          stmt.run(crypto.randomUUID(), row.id, (runErr) => {
            if (runErr) console.warn(`Migration teams (rattrapage) : ${runErr.message}`);
          });
        });
        stmt.finalize(() => migrationDone());
      });
    };

    const runStep = (index) => {
      if (index >= steps.length) return backfill();
      db.run(steps[index], (stepErr) => {
        if (stepErr) console.warn(`Migration teams : ${stepErr.message}`);
        runStep(index + 1);
      });
    };

    runStep(0);
  });

  // Colonnes de synchronisation cloud pour les trajectoires (partage à distance).
  addSyncColumns('trajectory_matches', migrationDone);

  // Codage DataVolley : vidéos (métadonnées), matchs, actions, événements, setups.
  addSyncColumns('videos', migrationDone);
  addSyncColumns('volley_matches', migrationDone, 'video_id');
  addSyncColumns('volley_actions', migrationDone);
  addSyncColumns('volley_events', migrationDone);
  addSyncColumns('set_setups', migrationDone);
});

// Toutes les requêtes du bloc ci-dessus ont été soumises : dès qu'elles sont
// exécutées ET que la migration des équipes est terminée, le serveur peut
// accepter des requêtes (voir waitReady dans index.js).
db.wait(() => {
  statementsDrained = true;
  maybeReady();
});

/**
 * Exécute `callback` dès que le schéma initial et les migrations sont prêts.
 * Renvoie true si la base est déjà prête (le callback est alors appelé
 * immédiatement).
 */
db.waitReady = (callback) => {
  if (typeof callback !== 'function') return schemaReady;
  if (schemaReady) callback();
  else readyQueue.push(callback);
  return schemaReady;
};


module.exports = db;