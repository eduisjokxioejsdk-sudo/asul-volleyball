// ============================================================================
// Fabrique de collections « plates » + collections concrètes (trajectoires…).
//
// Une collection plate = une table locale dont chaque ligne correspond 1:1 à
// une ligne cloud, identifiée par `sync_uuid`. La fabrique fournit tous les
// accès génériques (lecture, upsert, marquage, fusion) ; une collection peut
// surcharger `loadLocal`, `applyRemote` et `rowToCloud` pour des cas
// particuliers (ex. trajectoires : flèches embarquées en jsonb + id d'équipe
// traduit en sync_uuid).
// ============================================================================

const db = require('./database');
const { planMergeGeneric } = require('./syncCore');
const { emitCollectionChanged } = require('./socket');

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });

/** Colonnes de synchronisation communes à toutes les collections. */
const SYNC_COLUMNS = ['sync_uuid', 'dirty', 'deleted', 'local_updated_at', 'cloud_updated_at'];

/**
 * @param {Object} spec
 * @param {string} spec.key            clé (ex. 'trajectories')
 * @param {string} spec.name           nom affiché
 * @param {string} spec.defaultTable   table Supabase par défaut
 * @param {string} spec.table          table SQLite locale
 * @param {string[]} spec.fields       champs de contenu synchronisés
 * @param {() => Promise<Array>} [spec.loadLocal]
 * @param {(entry) => Promise<number>} [spec.applyRemote]
 * @param {(row, originId) => Object} [spec.rowToCloud]
 * @param {() => Promise<Object>} [spec.statusCounts]
 * @param {(applied, removed) => void} [spec.onChanged]
 */
function makeFlatCollection(spec) {
  const table = spec.table;
  const fields = spec.fields;

  const loadLocal =
    spec.loadLocal || (() => allAsync(`SELECT * FROM ${table} ORDER BY id ASC`, []));

  const adoptUuid = (localId, uuid) =>
    runAsync(`UPDATE ${table} SET sync_uuid = ? WHERE id = ?`, [uuid, localId]);

  const deleteLocal = (localId) =>
    runAsync(`UPDATE ${table} SET deleted = 1, dirty = 0 WHERE id = ?`, [localId]);

  const settleLocal = (localId, cloudUpdatedAt) =>
    runAsync(`UPDATE ${table} SET dirty = 0, cloud_updated_at = ? WHERE id = ?`, [cloudUpdatedAt, localId]);

  const touchPushed = (uuid, cloudUpdatedAt) =>
    runAsync(`UPDATE ${table} SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ?`, [cloudUpdatedAt, uuid]);

  const rowToCloud =
    spec.rowToCloud ||
    ((row, originId) => {
      const cloud = { sync_uuid: row.sync_uuid, deleted: Boolean(Number(row.deleted)) };
      for (const f of fields) cloud[f] = row[f];
      cloud.origin_id = originId;
      return cloud;
    });

  const applyRemote =
    spec.applyRemote ||
    (async (entry) => {
      const now = new Date().toISOString();
      const deleted = entry.deleted ? 1 : 0;
      const assignments = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => entry[f]);
      if (entry.localId) {
        await runAsync(
          `UPDATE ${table} SET sync_uuid = ?, ${assignments}, deleted = ?, dirty = 0, cloud_updated_at = ? WHERE id = ?`,
          [entry.uuid, ...values, deleted, entry.cloudUpdatedAt || now, entry.localId]
        );
        return entry.localId;
      }
      const cols = ['sync_uuid', ...fields, 'deleted', 'dirty', 'cloud_updated_at', 'local_updated_at'];
      const result = await runAsync(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        [entry.uuid, ...values, deleted, 0, entry.cloudUpdatedAt || now, now]
      );
      return result.lastID;
    });

  const planMerge = ({ localRows, remoteRows, lastSyncAt }) =>
    planMergeGeneric({ localRows, remoteRows, lastSyncAt, fields });

  const pendingCount = async () => {
    const row = await getAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE dirty = 1`, []);
    return row ? row.n : 0;
  };

  const statusCounts =
    spec.statusCounts ||
    (async () => {
      const active = await getAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted = 0`, []);
      const tombstones = await getAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted = 1`, []);
      return { active: active ? active.n : 0, tombstones: tombstones ? tombstones.n : 0 };
    });

  return {
    key: spec.key,
    name: spec.name,
    defaultTable: spec.defaultTable,
    envPrefix: 'TEAMS_SYNC', // connexion Supabase partagée (URL/clé communes)
    loadLocal,
    applyRemote,
    adoptUuid,
    deleteLocal,
    settleLocal,
    touchPushed,
    planMerge,
    rowToCloud,
    pendingCount,
    statusCounts,
    onChanged: spec.onChanged,
  };
}

// ---------------------------------------------------------------------------
// Trajectoires : match = ligne cloud, flèches embarquées en jsonb, équipes
// référencées par leur sync_uuid (partagé) plutôt que par leur id local.
// ---------------------------------------------------------------------------

/** id d'équipe local → sync_uuid. */
async function teamIdToUuid() {
  const rows = await allAsync('SELECT id, sync_uuid FROM teams', []);
  const map = new Map();
  for (const row of rows) map.set(Number(row.id), row.sync_uuid);
  return map;
}

/** sync_uuid → id d'équipe local. */
async function teamUuidToId() {
  const rows = await allAsync('SELECT id, sync_uuid FROM teams WHERE sync_uuid IS NOT NULL', []);
  const map = new Map();
  for (const row of rows) map.set(String(row.sync_uuid), Number(row.id));
  return map;
}

const trajectoriesCollection = makeFlatCollection({
  key: 'trajectories',
  name: 'Trajectoires',
  defaultTable: 'asul_trajectories',
  table: 'trajectory_matches',
  fields: ['name', 'team1_name', 'team2_name', 'status'],

  loadLocal: async () => {
    const matches = await allAsync('SELECT * FROM trajectory_matches ORDER BY id ASC', []);
    if (!matches.length) return [];
    const idToUuid = await teamIdToUuid();
    const shots = await allAsync('SELECT * FROM trajectory_shots ORDER BY match_id ASC, id ASC', []);
    const byMatch = new Map();
    for (const shot of shots) {
      const key = Number(shot.match_id);
      if (!byMatch.has(key)) byMatch.set(key, []);
      byMatch.get(key).push({
        team_side: shot.team_side,
        player_number: shot.player_number,
        kind: shot.kind,
        start_x: shot.start_x,
        start_y: shot.start_y,
        end_x: shot.end_x,
        end_y: shot.end_y,
        result: shot.result,
        set_number: shot.set_number,
      });
    }
    return matches.map((m) => ({
      ...m,
      home_team_uuid: m.home_team_uuid || (m.home_team_id ? idToUuid.get(Number(m.home_team_id)) || null : null),
      away_team_uuid: m.away_team_uuid || (m.away_team_id ? idToUuid.get(Number(m.away_team_id)) || null : null),
      shots: byMatch.get(Number(m.id)) || [],
    }));
  },

  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    name: row.name,
    home_team_uuid: row.home_team_uuid || null,
    away_team_uuid: row.away_team_uuid || null,
    team1_name: row.team1_name,
    team2_name: row.team2_name,
    status: row.status,
    created_by: row.created_by || null,
    shots: row.shots || [],
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),

  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const deleted = entry.deleted ? 1 : 0;
    const uuidToId = await teamUuidToId();
    const homeTeamId = entry.home_team_uuid ? uuidToId.get(String(entry.home_team_uuid)) || null : null;
    const awayTeamId = entry.away_team_uuid ? uuidToId.get(String(entry.away_team_uuid)) || null : null;

    let localId = entry.localId;
    if (localId) {
      await runAsync(
        `UPDATE trajectory_matches
            SET sync_uuid = ?, name = ?, home_team_id = ?, away_team_id = ?,
                home_team_uuid = ?, away_team_uuid = ?,
                team1_name = ?, team2_name = ?, status = ?, created_by = ?, deleted = ?,
                dirty = 0, cloud_updated_at = ?
          WHERE id = ?`,
        [entry.uuid, entry.name, homeTeamId, awayTeamId, entry.home_team_uuid || null, entry.away_team_uuid || null, entry.team1_name, entry.team2_name, entry.status, entry.created_by, deleted, entry.cloudUpdatedAt || now, localId]
      );
    } else {
      const result = await runAsync(
        `INSERT INTO trajectory_matches
            (sync_uuid, name, home_team_id, away_team_id, home_team_uuid, away_team_uuid, team1_name, team2_name, status, created_by, deleted, dirty, cloud_updated_at, local_updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`,
        [entry.uuid, entry.name, homeTeamId, awayTeamId, entry.home_team_uuid || null, entry.away_team_uuid || null, entry.team1_name, entry.team2_name, entry.status, entry.created_by, deleted, entry.cloudUpdatedAt || now, now]
      );
      localId = result.lastID;
    }

    await runAsync('DELETE FROM trajectory_shots WHERE match_id = ?', [localId]);
    const shots = entry.shots || [];
    if (shots.length) {
      const stmt = db.prepare(
        `INSERT INTO trajectory_shots
            (match_id, team_side, player_number, kind, start_x, start_y, end_x, end_y, result, set_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const shot of shots) {
        stmt.run(
          localId,
          shot.team_side,
          Number(shot.player_number),
          shot.kind,
          Number(shot.start_x),
          Number(shot.start_y),
          Number(shot.end_x),
          Number(shot.end_y),
          shot.result,
          shot.set_number == null ? null : Number(shot.set_number)
        );
      }
      await new Promise((resolve, reject) => stmt.finalize((err) => (err ? reject(err) : resolve())));
    }
    return localId;
  },
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('trajectories');
  },
});

// ---------------------------------------------------------------------------
// Helpers vidéo : id local ↔ sync_uuid (les fichiers restent locaux, seule la
// métadonnée est partagée ; une vidéo distante reçoit une coquille sans fichier).
// ---------------------------------------------------------------------------

async function videoIdToUuid() {
  const rows = await allAsync('SELECT id, sync_uuid FROM videos WHERE sync_uuid IS NOT NULL', []);
  const map = new Map();
  for (const r of rows) map.set(Number(r.id), r.sync_uuid);
  return map;
}

async function ensureVideoByUuid(uuid) {
  const row = await getAsync('SELECT id FROM videos WHERE sync_uuid = ?', [uuid]);
  if (row) return Number(row.id);
  const result = await runAsync(
    `INSERT INTO videos (sync_uuid, user_id, filename, original_name, filepath, status, dirty, deleted, local_updated_at)
     VALUES (?, 0, '', '', '', 'uploaded', 0, 0, ?)`,
    [uuid, new Date().toISOString()]
  );
  return result.lastID;
}

/**
 * Collection référençant une vidéo : convertit `video_id` (local) en `video_uuid`
 * (partagé) à l'export, et inversement à l'import.
 */
function makeVideoRefCollection(spec) {
  const base = makeFlatCollection(spec);
  return {
    ...base,
    loadLocal: async () => {
      const rows = await base.loadLocal();
      const idToUuid = await videoIdToUuid();
      return rows.map((r) => ({
        ...r,
        video_uuid: r.video_id ? idToUuid.get(Number(r.video_id)) || null : null,
      }));
    },
    rowToCloud: (row, originId) => {
      const cloud = { sync_uuid: row.sync_uuid, deleted: Boolean(Number(row.deleted)) };
      for (const f of spec.fields) cloud[f] = row[f];
      cloud.video_uuid = row.video_uuid || null;
      cloud.origin_id = originId;
      return cloud;
    },
    applyRemote: async (entry) => {
      const now = new Date().toISOString();
      const deleted = entry.deleted ? 1 : 0;
      const videoId = entry.video_uuid ? await ensureVideoByUuid(entry.video_uuid) : null;
      const assignments = spec.fields.map((f) => `${f} = ?`).join(', ');
      const values = spec.fields.map((f) => entry[f]);
      if (entry.localId) {
        await runAsync(
          `UPDATE ${spec.table} SET sync_uuid = ?, video_id = ?, ${assignments}, deleted = ?, dirty = 0, cloud_updated_at = ? WHERE id = ?`,
          [entry.uuid, videoId, ...values, deleted, entry.cloudUpdatedAt || now, entry.localId]
        );
        return entry.localId;
      }
      const cols = ['sync_uuid', 'video_id', ...spec.fields, 'deleted', 'dirty', 'cloud_updated_at', 'local_updated_at'];
      const result = await runAsync(
        `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        [entry.uuid, videoId, ...values, deleted, 0, entry.cloudUpdatedAt || now, now]
      );
      return result.lastID;
    },
  };
}

// ---------------------------------------------------------------------------
// Vidéos (métadonnées seules — jamais filepath/filename)
// ---------------------------------------------------------------------------

const videosCollection = makeFlatCollection({
  key: 'videos',
  name: 'Vidéos',
  defaultTable: 'asul_videos',
  table: 'videos',
  fields: ['original_name', 'display_name', 'team1_name', 'team2_name', 'duration', 'status', 'color'],
  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const deleted = entry.deleted ? 1 : 0;
    if (entry.localId) {
      await runAsync(
        `UPDATE videos SET sync_uuid = ?, original_name = ?, display_name = ?, team1_name = ?, team2_name = ?,
                duration = ?, status = ?, color = ?, deleted = ?, dirty = 0, cloud_updated_at = ? WHERE id = ?`,
        [entry.uuid, entry.original_name, entry.display_name, entry.team1_name, entry.team2_name, entry.duration, entry.status, entry.color, deleted, entry.cloudUpdatedAt || now, entry.localId]
      );
      return entry.localId;
    }
    const result = await runAsync(
      `INSERT INTO videos (sync_uuid, user_id, filename, original_name, display_name, filepath, team1_name, team2_name, duration, status, color, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, 0, '', ?, ?, '', ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [entry.uuid, entry.original_name || '', entry.display_name || null, entry.team1_name, entry.team2_name, entry.duration, entry.status, entry.color, deleted, entry.cloudUpdatedAt || now, now]
    );
    return result.lastID;
  },
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('videos');
  },
});

// ---------------------------------------------------------------------------
// Actions DataVolley (codage) + événements (temps morts / remplacements)
// ---------------------------------------------------------------------------

const actionsCollection = makeVideoRefCollection({
  key: 'actions',
  name: 'Actions DataVolley',
  defaultTable: 'asul_actions',
  table: 'volley_actions',
  fields: ['action_index', 'code', 'timecode', 'system_time', 'team', 'player_number', 'action', 'evaluation', 'type', 'start_zone', 'end_zone', 'end_subzone', 'set_number', 'note', 'attack_zone', 'start_x', 'start_y', 'mid_x', 'mid_y', 'end_x', 'end_y', 'is_auto'],
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('actions');
  },
});

const eventsCollection = makeVideoRefCollection({
  key: 'events',
  name: 'Événements de match',
  defaultTable: 'asul_events',
  table: 'volley_events',
  fields: ['kind', 'set_number', 'point_number', 'team', 'payload'],
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('events');
  },
});

// ---------------------------------------------------------------------------
// Attribution de sets (codage collaboratif) — identité du titulaire embarquée.
// ---------------------------------------------------------------------------

const claimsCollection = makeFlatCollection({
  key: 'claims',
  name: 'Attributions de sets',
  defaultTable: 'asul_set_claims',
  table: 'video_set_claims',
  fields: ['video_uuid', 'set_number', 'claimed_by_uuid', 'claimed_by_name', 'claimed_by_email', 'claimed_at'],
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('claims');
  },
});

// ---------------------------------------------------------------------------
// État du match (vidéo terminée/en cours, équipes) — clé primaire = video_id.
// ---------------------------------------------------------------------------

const MATCH_FIELDS = ['status', 'finished_at', 'home_team_uuid', 'away_team_uuid'];

const matchesCollection = {
  key: 'matches',
  name: 'Matchs',
  defaultTable: 'asul_matches',
  envPrefix: 'TEAMS_SYNC',
  loadLocal: async () => {
    const rows = await allAsync('SELECT *, video_id AS id FROM volley_matches', []);
    const idToUuid = await videoIdToUuid();
    const teamMap = await teamIdToUuid();
    return rows.map((r) => ({
      ...r,
      video_uuid: r.video_id ? idToUuid.get(Number(r.video_id)) || null : null,
      home_team_uuid: r.home_team_uuid || (r.home_team_id ? teamMap.get(Number(r.home_team_id)) || null : null),
      away_team_uuid: r.away_team_uuid || (r.away_team_id ? teamMap.get(Number(r.away_team_id)) || null : null),
    }));
  },
  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    video_uuid: row.video_uuid || null,
    status: row.status,
    finished_at: row.finished_at,
    home_team_uuid: row.home_team_uuid || null,
    away_team_uuid: row.away_team_uuid || null,
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),
  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const videoId = entry.video_uuid ? await ensureVideoByUuid(entry.video_uuid) : null;
    const teamMap = await teamUuidToId();
    const homeTeamId = entry.home_team_uuid ? teamMap.get(String(entry.home_team_uuid)) || null : null;
    const awayTeamId = entry.away_team_uuid ? teamMap.get(String(entry.away_team_uuid)) || null : null;
    await runAsync(
      `INSERT INTO volley_matches (video_id, sync_uuid, status, finished_at, home_team_id, away_team_id, home_team_uuid, away_team_uuid, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET
         sync_uuid = excluded.sync_uuid, status = excluded.status, finished_at = excluded.finished_at,
         home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
         home_team_uuid = excluded.home_team_uuid, away_team_uuid = excluded.away_team_uuid,
         deleted = excluded.deleted, dirty = 0, cloud_updated_at = excluded.cloud_updated_at`,
      [videoId, entry.uuid, entry.status, entry.finished_at, homeTeamId, awayTeamId, entry.home_team_uuid || null, entry.away_team_uuid || null, entry.deleted ? 1 : 0, entry.cloudUpdatedAt || now, now]
    );
    return videoId;
  },
  adoptUuid: (localId, uuid) => runAsync('UPDATE volley_matches SET sync_uuid = ? WHERE video_id = ?', [uuid, localId]),
  deleteLocal: (localId) => runAsync('UPDATE volley_matches SET deleted = 1, dirty = 0 WHERE video_id = ?', [localId]),
  settleLocal: (localId, cloudUpdatedAt) => runAsync('UPDATE volley_matches SET dirty = 0, cloud_updated_at = ? WHERE video_id = ?', [cloudUpdatedAt, localId]),
  touchPushed: (uuid, cloudUpdatedAt) => runAsync('UPDATE volley_matches SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ?', [cloudUpdatedAt, uuid]),
  planMerge: ({ localRows, remoteRows, lastSyncAt }) => planMergeGeneric({ localRows, remoteRows, lastSyncAt, fields: MATCH_FIELDS }),
  pendingCount: async () => {
    const r = await getAsync('SELECT COUNT(*) AS n FROM volley_matches WHERE dirty = 1', []);
    return r ? r.n : 0;
  },
  statusCounts: async () => ({ active: 0, tombstones: 0 }),
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('matches');
  },
};

// ---------------------------------------------------------------------------
// Six de départ par set (match_key 'video:<id>' → video_uuid partagé).
// ---------------------------------------------------------------------------

const SETUP_FIELDS = ['set_number', 'first_server', 'home_lineup', 'away_lineup'];

const setupsCollection = {
  key: 'setups',
  name: 'Six de départ',
  defaultTable: 'asul_setups',
  envPrefix: 'TEAMS_SYNC',
  loadLocal: async () => {
    const rows = await allAsync("SELECT * FROM set_setups WHERE match_key LIKE 'video:%'", []);
    const idToUuid = await videoIdToUuid();
    return rows.map((r) => {
      const videoId = Number(String(r.match_key).slice('video:'.length));
      return { ...r, video_id: videoId, video_uuid: idToUuid.get(videoId) || null };
    });
  },
  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    video_uuid: row.video_uuid || null,
    set_number: row.set_number,
    first_server: row.first_server,
    home_lineup: row.home_lineup,
    away_lineup: row.away_lineup,
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),
  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const videoId = entry.video_uuid ? await ensureVideoByUuid(entry.video_uuid) : null;
    const matchKey = `video:${videoId}`;
    await runAsync(
      `INSERT INTO set_setups (match_key, set_number, first_server, home_lineup, away_lineup, sync_uuid, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(match_key, set_number) DO UPDATE SET
         first_server = excluded.first_server, home_lineup = excluded.home_lineup,
         away_lineup = excluded.away_lineup, sync_uuid = excluded.sync_uuid,
         deleted = excluded.deleted, dirty = 0, cloud_updated_at = excluded.cloud_updated_at`,
      [matchKey, entry.set_number, entry.first_server, entry.home_lineup, entry.away_lineup, entry.uuid, entry.deleted ? 1 : 0, entry.cloudUpdatedAt || now, now]
    );
    return entry.localId || null;
  },
  adoptUuid: (localId, uuid) => runAsync('UPDATE set_setups SET sync_uuid = ? WHERE id = ?', [uuid, localId]),
  deleteLocal: (localId) => runAsync('UPDATE set_setups SET deleted = 1, dirty = 0 WHERE id = ?', [localId]),
  settleLocal: (localId, cloudUpdatedAt) => runAsync('UPDATE set_setups SET dirty = 0, cloud_updated_at = ? WHERE id = ?', [cloudUpdatedAt, localId]),
  touchPushed: (uuid, cloudUpdatedAt) => runAsync('UPDATE set_setups SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ?', [cloudUpdatedAt, uuid]),
  planMerge: ({ localRows, remoteRows, lastSyncAt }) => planMergeGeneric({ localRows, remoteRows, lastSyncAt, fields: SETUP_FIELDS }),
  pendingCount: async () => {
    const r = await getAsync('SELECT COUNT(*) AS n FROM set_setups WHERE dirty = 1', []);
    return r ? r.n : 0;
  },
  statusCounts: async () => ({ active: 0, tombstones: 0 }),
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('setups');
  },
};

module.exports = {
  makeFlatCollection,
  trajectoriesCollection,
  videosCollection,
  actionsCollection,
  eventsCollection,
  claimsCollection,
  matchesCollection,
  setupsCollection,
};




