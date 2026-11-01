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

const crypto = require('crypto');
const db = require('./database');
const { fieldsEqual, planMergeGeneric, isAfter } = require('./syncCore');
const { emitCollectionChanged, emitToSession } = require('./socket');
const { relinkTeamReferences } = require('./relinkTeams');

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
    spec.loadLocal ||
    (async () => {
      const rows = await allAsync(`SELECT * FROM ${table} ORDER BY id ASC`, []);
      for (const r of rows) {
        if (!r.sync_uuid && r.id != null) {
          r.sync_uuid = crypto.randomUUID();
          await runAsync(`UPDATE ${table} SET sync_uuid = ? WHERE id = ?`, [r.sync_uuid, r.id]);
        }
      }
      return rows;
    });

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
      const active = await getAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE COALESCE(deleted, 0) = 0`, []);
      const tombstones = await getAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE COALESCE(deleted, 0) = 1`, []);
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
// Helpers équipes & vidéos : id local ↔ sync_uuid
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

async function videoIdToUuid() {
  const rows = await allAsync('SELECT id, sync_uuid FROM videos WHERE sync_uuid IS NOT NULL', []);
  const map = new Map();
  for (const r of rows) map.set(Number(r.id), r.sync_uuid);
  return map;
}

async function ensureVideoByUuid(uuid) {
  if (!uuid) return null;
  const row = await getAsync('SELECT id FROM videos WHERE sync_uuid = ?', [uuid]);
  if (row) return Number(row.id);
  const result = await runAsync(
    `INSERT INTO videos (sync_uuid, user_id, filename, original_name, filepath, status, dirty, deleted, local_updated_at)
     VALUES (?, 0, '', '', '', 'uploaded', 0, 0, ?)`,
    [uuid, new Date().toISOString()]
  );
  return result.lastID;
}

// ---------------------------------------------------------------------------
// Trajectoires : match = ligne cloud, flèches embarquées en jsonb, équipes et
// vidéos référencées par leur sync_uuid (partagé) plutôt que par leur id local.
// ---------------------------------------------------------------------------

const trajectoriesCollection = makeFlatCollection({
  key: 'trajectories',
  name: 'Trajectoires',
  defaultTable: 'asul_trajectories',
  table: 'trajectory_matches',
  fields: [
    'name',
    'home_team_uuid',
    'away_team_uuid',
    'video_uuid',
    'team1_name',
    'team2_name',
    'status',
    'created_by',
    'shots',
  ],

  loadLocal: async () => {
    const matches = await allAsync('SELECT * FROM trajectory_matches ORDER BY id ASC', []);
    if (!matches.length) return [];
    const idToUuid = await teamIdToUuid();
    const vidToUuid = await videoIdToUuid();
    const shots = await allAsync('SELECT * FROM trajectory_shots ORDER BY match_id ASC, id ASC', []);
    const byMatch = new Map();
    for (const shot of shots) {
      const key = Number(shot.match_id);
      if (!byMatch.has(key)) byMatch.set(key, []);
      byMatch.get(key).push({
        team_side: shot.team_side,
        player_number: Number(shot.player_number),
        kind: shot.kind,
        start_x: Number(shot.start_x),
        start_y: Number(shot.start_y),
        end_x: Number(shot.end_x),
        end_y: Number(shot.end_y),
        result: shot.result,
        set_number: shot.set_number == null ? null : Number(shot.set_number),
      });
    }
    const out = [];
    for (const m of matches) {
      if (!m.sync_uuid) {
        m.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE trajectory_matches SET sync_uuid = ? WHERE id = ?', [m.sync_uuid, m.id]);
      }
      out.push({
        ...m,
        home_team_uuid: m.home_team_uuid || (m.home_team_id ? idToUuid.get(Number(m.home_team_id)) || null : null),
        away_team_uuid: m.away_team_uuid || (m.away_team_id ? idToUuid.get(Number(m.away_team_id)) || null : null),
        video_uuid: m.video_uuid || (m.video_id ? vidToUuid.get(Number(m.video_id)) || null : null),
        shots: byMatch.get(Number(m.id)) || [],
      });
    }
    return out;
  },

  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    name: row.name,
    home_team_uuid: row.home_team_uuid || null,
    away_team_uuid: row.away_team_uuid || null,
    video_uuid: row.video_uuid || null,
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
    const videoId = entry.video_uuid ? await ensureVideoByUuid(entry.video_uuid) : null;

    let localId = entry.localId;
    if (localId) {
      await runAsync(
        `UPDATE trajectory_matches
            SET sync_uuid = ?, name = ?, home_team_id = COALESCE(?, home_team_id), away_team_id = COALESCE(?, away_team_id),
                home_team_uuid = ?, away_team_uuid = ?,
                video_id = ?, video_uuid = ?,
                team1_name = ?, team2_name = ?, status = ?, created_by = ?, deleted = ?,
                dirty = 0, cloud_updated_at = ?
          WHERE id = ?`,
        [
          entry.uuid,
          entry.name,
          homeTeamId,
          awayTeamId,
          entry.home_team_uuid || null,
          entry.away_team_uuid || null,
          videoId,
          entry.video_uuid || null,
          entry.team1_name,
          entry.team2_name,
          entry.status,
          entry.created_by,
          deleted,
          entry.cloudUpdatedAt || now,
          localId,
        ]
      );
    } else {
      const result = await runAsync(
        `INSERT INTO trajectory_matches
            (sync_uuid, name, home_team_id, away_team_id, home_team_uuid, away_team_uuid, video_id, video_uuid,
             team1_name, team2_name, status, created_by, deleted, dirty, cloud_updated_at, local_updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`,
        [
          entry.uuid,
          entry.name,
          homeTeamId,
          awayTeamId,
          entry.home_team_uuid || null,
          entry.away_team_uuid || null,
          videoId,
          entry.video_uuid || null,
          entry.team1_name,
          entry.team2_name,
          entry.status,
          entry.created_by,
          deleted,
          entry.cloudUpdatedAt || now,
          now,
        ]
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
    if (applied || removed) {
      relinkTeamReferences().catch(() => {});
      emitCollectionChanged('trajectories');
    }
  },
});

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
// Vidéos (métadonnées + lien YouTube + équipes associées — jamais filepath/filename)
// ---------------------------------------------------------------------------

const videosCollection = makeFlatCollection({
  key: 'videos',
  name: 'Vidéos',
  defaultTable: 'asul_videos',
  table: 'videos',
  fields: [
    'original_name',
    'display_name',
    'youtube_url',
    'home_team_uuid',
    'away_team_uuid',
    'team1_name',
    'team2_name',
    'duration',
    'angle2_offset',
    'status',
    'color',
  ],
  loadLocal: async () => {
    const rows = await allAsync('SELECT * FROM videos ORDER BY id ASC', []);
    if (!rows.length) return [];
    const teamMap = await teamIdToUuid();
    const out = [];
    for (const r of rows) {
      if (!r.sync_uuid) {
        r.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE videos SET sync_uuid = ? WHERE id = ?', [r.sync_uuid, r.id]);
      }
      out.push({
        ...r,
        youtube_url: r.youtube_url || null,
        home_team_uuid: r.home_team_uuid || (r.home_team_id ? teamMap.get(Number(r.home_team_id)) || null : null),
        away_team_uuid: r.away_team_uuid || (r.away_team_id ? teamMap.get(Number(r.away_team_id)) || null : null),
        angle2_offset: Number(r.angle2_offset) || 0,
      });
    }
    return out;
  },
  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    original_name: row.original_name || '',
    display_name: row.display_name || null,
    youtube_url: row.youtube_url || null,
    home_team_uuid: row.home_team_uuid || null,
    away_team_uuid: row.away_team_uuid || null,
    team1_name: row.team1_name || null,
    team2_name: row.team2_name || null,
    duration: row.duration == null ? null : Number(row.duration),
    angle2_offset: Number(row.angle2_offset) || 0,
    status: row.status || 'uploaded',
    color: row.color || '#1a73e8',
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),
  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const deleted = entry.deleted ? 1 : 0;
    const teamMap = await teamUuidToId();
    const homeTeamId = entry.home_team_uuid ? teamMap.get(String(entry.home_team_uuid)) || null : null;
    const awayTeamId = entry.away_team_uuid ? teamMap.get(String(entry.away_team_uuid)) || null : null;
    const angle2Offset = Number(entry.angle2_offset) || 0;

    if (entry.localId) {
      await runAsync(
        `UPDATE videos
            SET sync_uuid = ?, original_name = ?, display_name = ?, youtube_url = ?,
                home_team_id = COALESCE(?, home_team_id), away_team_id = COALESCE(?, away_team_id),
                home_team_uuid = ?, away_team_uuid = ?,
                team1_name = ?, team2_name = ?, duration = ?, angle2_offset = ?,
                status = ?, color = ?, deleted = ?, dirty = 0, cloud_updated_at = ?
          WHERE id = ?`,
        [
          entry.uuid,
          entry.original_name || '',
          entry.display_name || null,
          entry.youtube_url || null,
          homeTeamId,
          awayTeamId,
          entry.home_team_uuid || null,
          entry.away_team_uuid || null,
          entry.team1_name || null,
          entry.team2_name || null,
          entry.duration == null ? null : Number(entry.duration),
          angle2Offset,
          entry.status || 'uploaded',
          entry.color || '#1a73e8',
          deleted,
          entry.cloudUpdatedAt || now,
          entry.localId,
        ]
      );
      return entry.localId;
    }
    const result = await runAsync(
      `INSERT INTO videos
          (sync_uuid, user_id, filename, original_name, display_name, youtube_url, filepath,
           home_team_id, away_team_id, home_team_uuid, away_team_uuid,
           team1_name, team2_name, duration, angle2_offset, status, color, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, 0, '', ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        entry.uuid,
        entry.original_name || '',
        entry.display_name || null,
        entry.youtube_url || null,
        homeTeamId,
        awayTeamId,
        entry.home_team_uuid || null,
        entry.away_team_uuid || null,
        entry.team1_name || null,
        entry.team2_name || null,
        entry.duration == null ? null : Number(entry.duration),
        angle2Offset,
        entry.status || 'uploaded',
        entry.color || '#1a73e8',
        deleted,
        entry.cloudUpdatedAt || now,
        now,
      ]
    );
    return result.lastID;
  },
  onChanged: (applied, removed) => {
    if (applied || removed) {
      relinkTeamReferences().catch(() => {});
      emitCollectionChanged('videos');
    }
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
  fields: [
    'action_index',
    'code',
    'timecode',
    'system_time',
    'team',
    'player_number',
    'action',
    'evaluation',
    'type',
    'start_zone',
    'end_zone',
    'start_subzone',
    'end_subzone',
    'set_number',
    'note',
    'attack_zone',
    'start_x',
    'start_y',
    'mid_x',
    'mid_y',
    'end_x',
    'end_y',
    'is_auto',
  ],
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
// État du match (vidéo terminée/en cours, équipes, calibration timecode)
// Clé primaire locale = video_id.
// ---------------------------------------------------------------------------

const MATCH_FIELDS = [
  'status',
  'finished_at',
  'home_team_uuid',
  'away_team_uuid',
  'sync_offset',
  'set_offsets',
  'lead_in',
  'lead_out',
];

const matchesCollection = {
  key: 'matches',
  name: 'Matchs',
  defaultTable: 'asul_matches',
  envPrefix: 'TEAMS_SYNC',
  loadLocal: async () => {
    const rows = await allAsync('SELECT *, video_id AS id FROM volley_matches', []);
    if (!rows.length) return [];
    const idToUuid = await videoIdToUuid();
    const teamMap = await teamIdToUuid();
    const syncRows = await allAsync('SELECT * FROM volley_sync', []);
    const syncByVideo = new Map();
    for (const s of syncRows) syncByVideo.set(Number(s.video_id), s);

    const out = [];
    for (const r of rows) {
      if (!r.sync_uuid) {
        r.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE volley_matches SET sync_uuid = ? WHERE video_id = ?', [r.sync_uuid, r.video_id]);
      }
      const s = syncByVideo.get(Number(r.video_id));
      out.push({
        ...r,
        video_uuid: r.video_id ? idToUuid.get(Number(r.video_id)) || null : null,
        home_team_uuid: r.home_team_uuid || (r.home_team_id ? teamMap.get(Number(r.home_team_id)) || null : null),
        away_team_uuid: r.away_team_uuid || (r.away_team_id ? teamMap.get(Number(r.away_team_id)) || null : null),
        sync_offset: s && s.sync_offset != null ? Number(s.sync_offset) : 0,
        set_offsets: s && s.set_offsets ? String(s.set_offsets) : '{}',
        lead_in: s && s.lead_in != null ? Number(s.lead_in) : 4,
        lead_out: s && s.lead_out != null ? Number(s.lead_out) : 3,
      });
    }
    return out;
  },
  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    video_uuid: row.video_uuid || null,
    status: row.status || 'coding',
    finished_at: row.finished_at || null,
    home_team_uuid: row.home_team_uuid || null,
    away_team_uuid: row.away_team_uuid || null,
    sync_offset: Number(row.sync_offset) || 0,
    set_offsets: row.set_offsets || '{}',
    lead_in: row.lead_in != null ? Number(row.lead_in) : 4,
    lead_out: row.lead_out != null ? Number(row.lead_out) : 3,
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),
  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const videoId = entry.video_uuid ? await ensureVideoByUuid(entry.video_uuid) : entry.localId || null;
    if (!videoId) return null;
    const teamMap = await teamUuidToId();
    const homeTeamId = entry.home_team_uuid ? teamMap.get(String(entry.home_team_uuid)) || null : null;
    const awayTeamId = entry.away_team_uuid ? teamMap.get(String(entry.away_team_uuid)) || null : null;
    await runAsync(
      `INSERT INTO volley_matches (video_id, sync_uuid, status, finished_at, home_team_id, away_team_id, home_team_uuid, away_team_uuid, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET
         sync_uuid = excluded.sync_uuid, status = excluded.status, finished_at = excluded.finished_at,
         home_team_id = COALESCE(excluded.home_team_id, volley_matches.home_team_id),
         away_team_id = COALESCE(excluded.away_team_id, volley_matches.away_team_id),
         home_team_uuid = excluded.home_team_uuid, away_team_uuid = excluded.away_team_uuid,
         deleted = excluded.deleted, dirty = 0, cloud_updated_at = excluded.cloud_updated_at`,
      [
        videoId,
        entry.uuid,
        entry.status || 'coding',
        entry.finished_at || null,
        homeTeamId,
        awayTeamId,
        entry.home_team_uuid || null,
        entry.away_team_uuid || null,
        entry.deleted ? 1 : 0,
        entry.cloudUpdatedAt || now,
        now,
      ]
    );
    await runAsync(
      `INSERT INTO volley_sync (video_id, sync_offset, set_offsets, lead_in, lead_out, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(video_id) DO UPDATE SET
         sync_offset = excluded.sync_offset,
         set_offsets = excluded.set_offsets,
         lead_in = excluded.lead_in,
         lead_out = excluded.lead_out,
         updated_at = CURRENT_TIMESTAMP`,
      [
        videoId,
        Number(entry.sync_offset) || 0,
        entry.set_offsets || '{}',
        entry.lead_in != null ? Number(entry.lead_in) : 4,
        entry.lead_out != null ? Number(entry.lead_out) : 3,
      ]
    );
    if (homeTeamId || awayTeamId || entry.home_team_uuid || entry.away_team_uuid) {
      await runAsync(
        `UPDATE videos
            SET home_team_id = COALESCE(?, home_team_id),
                away_team_id = COALESCE(?, away_team_id),
                home_team_uuid = COALESCE(?, home_team_uuid),
                away_team_uuid = COALESCE(?, away_team_uuid)
          WHERE id = ?`,
        [homeTeamId, awayTeamId, entry.home_team_uuid || null, entry.away_team_uuid || null, videoId]
      );
    }
    return videoId;
  },
  adoptUuid: (localId, uuid) => runAsync('UPDATE volley_matches SET sync_uuid = ? WHERE video_id = ?', [uuid, localId]),
  deleteLocal: (localId) => runAsync('UPDATE volley_matches SET deleted = 1, dirty = 0 WHERE video_id = ?', [localId]),
  settleLocal: (localId, cloudUpdatedAt) =>
    runAsync('UPDATE volley_matches SET dirty = 0, cloud_updated_at = ? WHERE video_id = ?', [cloudUpdatedAt, localId]),
  touchPushed: (uuid, cloudUpdatedAt) =>
    runAsync('UPDATE volley_matches SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ?', [cloudUpdatedAt, uuid]),
  planMerge: ({ localRows, remoteRows, lastSyncAt }) =>
    planMergeGeneric({ localRows, remoteRows, lastSyncAt, fields: MATCH_FIELDS }),
  pendingCount: async () => {
    const r = await getAsync('SELECT COUNT(*) AS n FROM volley_matches WHERE dirty = 1', []);
    return r ? r.n : 0;
  },
  statusCounts: async () => {
    const active = await getAsync('SELECT COUNT(*) AS n FROM volley_matches WHERE COALESCE(deleted, 0) = 0', []);
    const tombstones = await getAsync('SELECT COUNT(*) AS n FROM volley_matches WHERE COALESCE(deleted, 0) = 1', []);
    return { active: active ? active.n : 0, tombstones: tombstones ? tombstones.n : 0 };
  },
  onChanged: (applied, removed) => {
    if (applied || removed) {
      relinkTeamReferences().catch(() => {});
      emitCollectionChanged('matches');
    }
  },
};

// ---------------------------------------------------------------------------
// Six de départ par set (match_key 'video:<id>' → video_uuid partagé).
// ---------------------------------------------------------------------------

const SETUP_FIELDS = [
  'set_number',
  'first_server',
  'home_setter_pos',
  'away_setter_pos',
  'home_setter',
  'away_setter',
  'home_lineup',
  'away_lineup',
];

const setupsCollection = {
  key: 'setups',
  name: 'Six de départ',
  defaultTable: 'asul_setups',
  envPrefix: 'TEAMS_SYNC',
  loadLocal: async () => {
    const rows = await allAsync("SELECT * FROM set_setups WHERE match_key LIKE 'video:%'", []);
    if (!rows.length) return [];
    const idToUuid = await videoIdToUuid();
    const out = [];
    for (const r of rows) {
      if (!r.sync_uuid) {
        r.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE set_setups SET sync_uuid = ? WHERE id = ?', [r.sync_uuid, r.id]);
      }
      const videoId = Number(String(r.match_key).slice('video:'.length));
      out.push({
        ...r,
        video_id: videoId,
        video_uuid: idToUuid.get(videoId) || null,
        home_setter_pos: r.home_setter_pos || null,
        away_setter_pos: r.away_setter_pos || null,
        home_setter: r.home_setter == null ? null : Number(r.home_setter),
        away_setter: r.away_setter == null ? null : Number(r.away_setter),
      });
    }
    return out;
  },
  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid,
    video_uuid: row.video_uuid || null,
    set_number: row.set_number,
    first_server: row.first_server || null,
    home_setter_pos: row.home_setter_pos || null,
    away_setter_pos: row.away_setter_pos || null,
    home_setter: row.home_setter == null ? null : Number(row.home_setter),
    away_setter: row.away_setter == null ? null : Number(row.away_setter),
    home_lineup: row.home_lineup || null,
    away_lineup: row.away_lineup || null,
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),
  applyRemote: async (entry) => {
    const now = new Date().toISOString();
    const videoId = entry.video_uuid ? await ensureVideoByUuid(entry.video_uuid) : null;
    if (!videoId) return entry.localId || null;
    const matchKey = `video:${videoId}`;
    await runAsync(
      `INSERT INTO set_setups
        (match_key, set_number, first_server, home_setter_pos, away_setter_pos,
         home_setter, away_setter, home_lineup, away_lineup, sync_uuid, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(match_key, set_number) DO UPDATE SET
         first_server = excluded.first_server,
         home_setter_pos = excluded.home_setter_pos,
         away_setter_pos = excluded.away_setter_pos,
         home_setter = excluded.home_setter,
         away_setter = excluded.away_setter,
         home_lineup = excluded.home_lineup,
         away_lineup = excluded.away_lineup,
         sync_uuid = excluded.sync_uuid,
         deleted = excluded.deleted,
         dirty = 0,
         cloud_updated_at = excluded.cloud_updated_at`,
      [
        matchKey,
        entry.set_number,
        entry.first_server || null,
        entry.home_setter_pos || null,
        entry.away_setter_pos || null,
        entry.home_setter == null ? null : Number(entry.home_setter),
        entry.away_setter == null ? null : Number(entry.away_setter),
        entry.home_lineup || null,
        entry.away_lineup || null,
        entry.uuid,
        entry.deleted ? 1 : 0,
        entry.cloudUpdatedAt || now,
        now,
      ]
    );
    return entry.localId || null;
  },
  adoptUuid: (localId, uuid) => runAsync('UPDATE set_setups SET sync_uuid = ? WHERE id = ?', [uuid, localId]),
  deleteLocal: (localId) => runAsync('UPDATE set_setups SET deleted = 1, dirty = 0 WHERE id = ?', [localId]),
  settleLocal: (localId, cloudUpdatedAt) =>
    runAsync('UPDATE set_setups SET dirty = 0, cloud_updated_at = ? WHERE id = ?', [cloudUpdatedAt, localId]),
  touchPushed: (uuid, cloudUpdatedAt) =>
    runAsync('UPDATE set_setups SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ?', [cloudUpdatedAt, uuid]),
  planMerge: ({ localRows, remoteRows, lastSyncAt }) =>
    planMergeGeneric({ localRows, remoteRows, lastSyncAt, fields: SETUP_FIELDS }),
  pendingCount: async () => {
    const r = await getAsync('SELECT COUNT(*) AS n FROM set_setups WHERE dirty = 1', []);
    return r ? r.n : 0;
  },
  statusCounts: async () => {
    const active = await getAsync(
      "SELECT COUNT(*) AS n FROM set_setups WHERE match_key LIKE 'video:%' AND COALESCE(deleted, 0) = 0",
      []
    );
    const tombstones = await getAsync(
      "SELECT COUNT(*) AS n FROM set_setups WHERE match_key LIKE 'video:%' AND COALESCE(deleted, 0) = 1",
      []
    );
    return { active: active ? active.n : 0, tombstones: tombstones ? tombstones.n : 0 };
  },
  onChanged: (applied, removed) => {
    if (applied || removed) emitCollectionChanged('setups');
  },
};

// ---------------------------------------------------------------------------
// Matchs en direct (live_sessions + live_members + live_actions + live_events + set_setups)
// Permet de rejoindre un match en direct par son code à 6 caractères depuis
// n'importe quel PC connecté au même projet Supabase et de synchroniser les
// actions, membres, événements et positions en temps réel.
// ---------------------------------------------------------------------------

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const LIVE_COMPARE_FIELDS = [
  'name',
  'team1_name',
  'team2_name',
  'home_team_uuid',
  'away_team_uuid',
  'owner_origin_id',
  'owner_user_id',
  'join_code',
  'status',
  'current_point',
  'point_completed',
  'video_delay',
  'deleted_at',
  'deleted_items',
  'members',
  'actions',
  'events',
  'setups',
];

function mergeByKey(localList, remoteList, keyFn, deletedSet, localWins) {
  const map = new Map();
  for (const item of remoteList || []) {
    if (!item) continue;
    const k = keyFn(item);
    if (!k || (deletedSet && deletedSet.has(String(k)))) continue;
    map.set(String(k), item);
  }
  for (const item of localList || []) {
    if (!item) continue;
    const k = keyFn(item);
    if (!k || (deletedSet && deletedSet.has(String(k)))) continue;
    const key = String(k);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
    } else {
      const localTs = item.updated_at || null;
      const remoteTs = prev.updated_at || null;
      if (localTs && remoteTs && localTs !== remoteTs) {
        if (localTs > remoteTs) map.set(key, item);
      } else if (localWins) {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeLiveSession(local, remote, localWins) {
  const winner = localWins ? local : remote;
  const loser = localWins ? remote : local;
  const deletedItems = Array.from(
    new Set([...parseJsonArray(local.deleted_items), ...parseJsonArray(remote.deleted_items)].map(String))
  ).sort();
  const deletedSet = new Set(deletedItems);

  // Déduplication des membres par sync_uuid ET par (origin_id, user_id)
  const rawMembers = mergeByKey(
    local.members,
    remote.members,
    (m) => m.sync_uuid,
    deletedSet,
    localWins
  );
  const byOriginUser = new Map();
  const mergedMembers = [];
  for (const m of rawMembers) {
    if (m.origin_id && m.user_id != null) {
      const ouKey = `${m.origin_id}:${m.user_id}`;
      const existing = byOriginUser.get(ouKey);
      if (existing) {
        if ((m.updated_at || '') > (existing.updated_at || '')) {
          const idx = mergedMembers.indexOf(existing);
          if (idx >= 0) mergedMembers[idx] = m;
          byOriginUser.set(ouKey, m);
        }
        continue;
      }
      byOriginUser.set(ouKey, m);
    }
    mergedMembers.push(m);
  }
  mergedMembers.sort((a, b) => String(a.sync_uuid || '').localeCompare(String(b.sync_uuid || '')));

  const mergedActions = mergeByKey(
    local.actions,
    remote.actions,
    (a) => a.sync_uuid,
    deletedSet,
    localWins
  ).sort(
    (a, b) =>
      (Number(a.effective_time) || 0) - (Number(b.effective_time) || 0) ||
      (Number(a.seq) || 0) - (Number(b.seq) || 0) ||
      String(a.sync_uuid || '').localeCompare(String(b.sync_uuid || ''))
  );

  const mergedEvents = mergeByKey(
    local.events,
    remote.events,
    (ev) => ev.sync_uuid,
    deletedSet,
    localWins
  ).sort(
    (a, b) =>
      (Number(a.set_number) || 1) - (Number(b.set_number) || 1) ||
      (Number(a.point_number) || 0) - (Number(b.point_number) || 0) ||
      String(a.sync_uuid || '').localeCompare(String(b.sync_uuid || ''))
  );

  const mergedSetups = mergeByKey(
    local.setups,
    remote.setups,
    (s) => s.set_number,
    null,
    localWins
  ).sort((a, b) => (Number(a.set_number) || 1) - (Number(b.set_number) || 1));

  return {
    id: local.id || remote.sync_uuid,
    sync_uuid: String(remote.sync_uuid || local.sync_uuid || local.id),
    name: winner.name || loser.name || 'Match en direct',
    team1_name: winner.team1_name || loser.team1_name || 'Domicile',
    team2_name: winner.team2_name || loser.team2_name || 'Extérieur',
    home_team_uuid: winner.home_team_uuid ?? loser.home_team_uuid ?? null,
    away_team_uuid: winner.away_team_uuid ?? loser.away_team_uuid ?? null,
    owner_origin_id: remote.owner_origin_id || local.owner_origin_id || null,
    owner_user_id:
      remote.owner_user_id != null && Number(remote.owner_user_id) > 0
        ? Number(remote.owner_user_id)
        : Number(local.owner_user_id) || 0,
    join_code: String(winner.join_code || loser.join_code || '').toUpperCase(),
    status: winner.status || loser.status || 'active',
    current_point: Math.max(Number(local.current_point) || 1, Number(remote.current_point) || 1),
    point_completed:
      typeof winner.point_completed === 'string'
        ? winner.point_completed
        : JSON.stringify(parseJsonArray(winner.point_completed)),
    video_delay: Number.isFinite(Number(winner.video_delay)) ? Number(winner.video_delay) : 8,
    deleted_at: winner.deleted_at ?? null,
    created_at: local.created_at || remote.created_at || new Date().toISOString(),
    deleted_items: deletedItems,
    members: mergedMembers,
    actions: mergedActions,
    events: mergedEvents,
    setups: mergedSetups,
    deleted: Boolean(Number(winner.deleted)),
  };
}

const liveCollection = {
  key: 'live',
  name: 'Matchs en direct',
  defaultTable: 'asul_live_sessions',
  envPrefix: 'TEAMS_SYNC',

  loadLocal: async (originId) => {
    const sessions = await allAsync('SELECT * FROM live_sessions ORDER BY created_at ASC', []);
    if (!sessions.length) return [];

    const idToTeamUuid = await teamIdToUuid();
    const members = await allAsync('SELECT * FROM live_members ORDER BY id ASC', []);
    const actions = await allAsync('SELECT * FROM live_actions ORDER BY effective_time ASC, seq ASC, id ASC', []);
    const events = await allAsync('SELECT * FROM live_events ORDER BY COALESCE(set_number, 1) ASC, COALESCE(point_number, 0) ASC, id ASC', []);
    const setups = await allAsync(
      "SELECT * FROM set_setups WHERE match_key LIKE 'session:%' AND COALESCE(deleted, 0) = 0 ORDER BY set_number ASC",
      []
    );

    const memberIdToUuid = new Map();
    const membersBySession = new Map();
    for (const m of members) {
      if (!m.sync_uuid) {
        m.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE live_members SET sync_uuid = ? WHERE id = ?', [m.sync_uuid, m.id]);
      }
      if (!m.origin_id && m.user_id != null && originId) {
        m.origin_id = originId;
        await runAsync('UPDATE live_members SET origin_id = ? WHERE id = ?', [originId, m.id]);
      }
      memberIdToUuid.set(Number(m.id), m.sync_uuid);
      const sid = String(m.session_id);
      if (!membersBySession.has(sid)) membersBySession.set(sid, []);
      membersBySession.get(sid).push({
        sync_uuid: m.sync_uuid,
        origin_id: m.origin_id || originId || null,
        user_id: m.user_id == null ? null : Number(m.user_id),
        nickname: m.nickname || 'Membre',
        role: m.role || 'statistician',
        assignment: m.assignment || '["S","R","A","B","D"]',
        updated_at: m.updated_at || null,
      });
    }

    const actionsBySession = new Map();
    for (const a of actions) {
      if (!a.sync_uuid) {
        a.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE live_actions SET sync_uuid = ? WHERE id = ?', [a.sync_uuid, a.id]);
      }
      const sid = String(a.session_id);
      if (!actionsBySession.has(sid)) actionsBySession.set(sid, []);
      actionsBySession.get(sid).push({
        sync_uuid: a.sync_uuid,
        member_uuid: a.member_id ? memberIdToUuid.get(Number(a.member_id)) || null : null,
        effective_time: Number(a.effective_time) || 0,
        seq: Number(a.seq) || 0,
        assigned: a.assigned == null ? 1 : Number(a.assigned),
        code: a.code,
        system_time: a.system_time == null ? null : Number(a.system_time),
        team: a.team || null,
        player_number: a.player_number == null ? null : Number(a.player_number),
        action: a.action || null,
        evaluation: a.evaluation || null,
        type: a.type || null,
        start_zone: a.start_zone || null,
        end_zone: a.end_zone || null,
        start_subzone: a.start_subzone || null,
        end_subzone: a.end_subzone || null,
        attack_zone: a.attack_zone || null,
        set_number: Number(a.set_number) > 0 ? Number(a.set_number) : 1,
        start_x: a.start_x == null ? null : Number(a.start_x),
        start_y: a.start_y == null ? null : Number(a.start_y),
        mid_x: a.mid_x == null ? null : Number(a.mid_x),
        mid_y: a.mid_y == null ? null : Number(a.mid_y),
        end_x: a.end_x == null ? null : Number(a.end_x),
        end_y: a.end_y == null ? null : Number(a.end_y),
        is_auto: a.is_auto ? 1 : 0,
        updated_at: a.updated_at || null,
      });
    }

    const eventsBySession = new Map();
    for (const ev of events) {
      if (!ev.sync_uuid) {
        ev.sync_uuid = crypto.randomUUID();
        await runAsync('UPDATE live_events SET sync_uuid = ? WHERE id = ?', [ev.sync_uuid, ev.id]);
      }
      const sid = String(ev.session_id);
      if (!eventsBySession.has(sid)) eventsBySession.set(sid, []);
      eventsBySession.get(sid).push({
        sync_uuid: ev.sync_uuid,
        kind: ev.kind,
        set_number: Number(ev.set_number) > 0 ? Number(ev.set_number) : 1,
        point_number: Number(ev.point_number) || 0,
        team: ev.team || null,
        payload: typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload || {}),
        updated_at: ev.updated_at || null,
      });
    }

    const setupsBySession = new Map();
    for (const st of setups) {
      const sid = String(st.match_key).slice('session:'.length);
      if (!setupsBySession.has(sid)) setupsBySession.set(sid, []);
      setupsBySession.get(sid).push({
        set_number: Number(st.set_number) || 1,
        first_server: st.first_server || null,
        home_setter_pos: st.home_setter_pos || null,
        away_setter_pos: st.away_setter_pos || null,
        home_setter: st.home_setter == null ? null : Number(st.home_setter),
        away_setter: st.away_setter == null ? null : Number(st.away_setter),
        home_lineup: st.home_lineup || null,
        away_lineup: st.away_lineup || null,
        updated_at: st.local_updated_at || st.updated_at || null,
      });
    }

    const out = [];
    for (const s of sessions) {
      const sid = String(s.id);
      const syncUuid = s.sync_uuid || sid;
      if (!s.sync_uuid) {
        await runAsync('UPDATE live_sessions SET sync_uuid = ? WHERE id = ?', [syncUuid, sid]);
      }
      let ownerOriginId = s.owner_origin_id || null;
      if (!ownerOriginId && Number(s.owner_user_id) > 0 && originId) {
        ownerOriginId = originId;
        await runAsync('UPDATE live_sessions SET owner_origin_id = ? WHERE id = ?', [originId, sid]);
      }
      const homeTeamUuid =
        s.home_team_uuid || (s.home_team_id ? idToTeamUuid.get(Number(s.home_team_id)) || null : null);
      const awayTeamUuid =
        s.away_team_uuid || (s.away_team_id ? idToTeamUuid.get(Number(s.away_team_id)) || null : null);
      const deletedItems = parseJsonArray(s.deleted_items).map(String).sort();

      const sessMembers = (membersBySession.get(sid) || []).sort((a, b) =>
        String(a.sync_uuid || '').localeCompare(String(b.sync_uuid || ''))
      );
      const sessActions = (actionsBySession.get(sid) || []).sort(
        (a, b) =>
          (Number(a.effective_time) || 0) - (Number(b.effective_time) || 0) ||
          (Number(a.seq) || 0) - (Number(b.seq) || 0) ||
          String(a.sync_uuid || '').localeCompare(String(b.sync_uuid || ''))
      );
      const sessEvents = (eventsBySession.get(sid) || []).sort(
        (a, b) =>
          (Number(a.set_number) || 1) - (Number(b.set_number) || 1) ||
          (Number(a.point_number) || 0) - (Number(b.point_number) || 0) ||
          String(a.sync_uuid || '').localeCompare(String(b.sync_uuid || ''))
      );
      const sessSetups = (setupsBySession.get(sid) || []).sort(
        (a, b) => (Number(a.set_number) || 1) - (Number(b.set_number) || 1)
      );

      out.push({
        ...s,
        id: sid,
        sync_uuid: syncUuid,
        home_team_uuid: homeTeamUuid,
        away_team_uuid: awayTeamUuid,
        owner_origin_id: ownerOriginId,
        owner_user_id: Number(s.owner_user_id) || 0,
        join_code: String(s.join_code || '').toUpperCase(),
        status: s.status || 'active',
        current_point: Number(s.current_point) || 1,
        point_completed:
          typeof s.point_completed === 'string'
            ? s.point_completed
            : JSON.stringify(parseJsonArray(s.point_completed)),
        video_delay: Number.isFinite(Number(s.video_delay)) ? Number(s.video_delay) : 8,
        deleted_at: s.deleted_at || null,
        deleted_items: deletedItems,
        members: sessMembers,
        actions: sessActions,
        events: sessEvents,
        setups: sessSetups,
      });
    }
    return out;
  },

  rowToCloud: (row, originId) => ({
    sync_uuid: row.sync_uuid || row.id,
    name: row.name || 'Match en direct',
    team1_name: row.team1_name || 'Domicile',
    team2_name: row.team2_name || 'Extérieur',
    home_team_uuid: row.home_team_uuid || null,
    away_team_uuid: row.away_team_uuid || null,
    owner_origin_id: row.owner_origin_id || originId || null,
    owner_user_id: Number(row.owner_user_id) || 0,
    join_code: String(row.join_code || '').toUpperCase(),
    status: row.status || 'active',
    current_point: Number(row.current_point) || 1,
    point_completed:
      typeof row.point_completed === 'string'
        ? row.point_completed
        : JSON.stringify(parseJsonArray(row.point_completed)),
    video_delay: Number.isFinite(Number(row.video_delay)) ? Number(row.video_delay) : 8,
    deleted_at: row.deleted_at || null,
    created_at: row.created_at || new Date().toISOString(),
    deleted_items: Array.isArray(row.deleted_items) ? row.deleted_items : parseJsonArray(row.deleted_items),
    members: Array.isArray(row.members) ? row.members : [],
    actions: Array.isArray(row.actions) ? row.actions : [],
    events: Array.isArray(row.events) ? row.events : [],
    setups: Array.isArray(row.setups) ? row.setups : [],
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId,
  }),

  planMerge: ({ localRows, remoteRows, lastSyncAt }) => {
    const byUuid = new Map();
    for (const row of localRows || []) {
      const uuid = String(row.sync_uuid || row.id);
      byUuid.set(uuid, row);
    }

    const usedLocal = new Set();
    const toPush = [];
    const toApply = [];
    const toDelete = [];
    const toSettle = [];
    const conflicts = [];

    for (const rawRemote of remoteRows || []) {
      const uuid = String(rawRemote.sync_uuid);
      const remote = {
        ...rawRemote,
        sync_uuid: uuid,
        owner_user_id: Number(rawRemote.owner_user_id) || 0,
        join_code: String(rawRemote.join_code || '').toUpperCase(),
        status: rawRemote.status || 'active',
        current_point: Number(rawRemote.current_point) || 1,
        point_completed:
          typeof rawRemote.point_completed === 'string'
            ? rawRemote.point_completed
            : JSON.stringify(parseJsonArray(rawRemote.point_completed)),
        video_delay: Number.isFinite(Number(rawRemote.video_delay)) ? Number(rawRemote.video_delay) : 8,
        deleted_at: rawRemote.deleted_at || null,
        deleted_items: parseJsonArray(rawRemote.deleted_items).map(String).sort(),
        members: parseJsonArray(rawRemote.members),
        actions: parseJsonArray(rawRemote.actions),
        events: parseJsonArray(rawRemote.events),
        setups: parseJsonArray(rawRemote.setups),
      };

      const local = byUuid.get(uuid) || null;
      if (local) usedLocal.add(local.id);

      const remoteDeleted = Boolean(remote.deleted);
      if (!local) {
        if (!remoteDeleted) {
          toApply.push({
            localId: null,
            uuid,
            deleted: false,
            cloudUpdatedAt: remote.updated_at || null,
            ...remote,
          });
        }
        continue;
      }

      if (remoteDeleted) {
        toDelete.push(local.id);
        continue;
      }

      const localDirty = Boolean(Number(local.dirty));
      const localWins = localDirty && isAfter(local.local_updated_at, lastSyncAt);
      const merged = mergeLiveSession(local, remote, localWins);

      const localDiffers = !fieldsEqual(local, merged, LIVE_COMPARE_FIELDS);
      const remoteDiffers = !fieldsEqual(remote, merged, LIVE_COMPARE_FIELDS);

      if (localDiffers) {
        toApply.push({
          localId: local.id,
          uuid,
          deleted: false,
          cloudUpdatedAt: remote.updated_at || null,
          ...merged,
        });
      }
      if (remoteDiffers) {
        toPush.push(merged);
      }
      if (!localDiffers && !remoteDiffers) {
        toSettle.push({ localId: local.id, cloudUpdatedAt: remote.updated_at || null });
      }
    }

    for (const local of localRows || []) {
      if (!Number(local.dirty)) continue;
      if (usedLocal.has(local.id)) continue;
      toPush.push(local);
    }

    return { toPush, toApply, toAdopt: [], toDelete, toSettle, conflicts };
  },

  applyRemote: async (entry, originId) => {
    const now = new Date().toISOString();
    const sessionId = String(entry.localId || entry.uuid);
    const deleted = entry.deleted ? 1 : 0;
    const uuidToTeamId = await teamUuidToId();
    const homeTeamId = entry.home_team_uuid ? uuidToTeamId.get(String(entry.home_team_uuid)) || null : null;
    const awayTeamId = entry.away_team_uuid ? uuidToTeamId.get(String(entry.away_team_uuid)) || null : null;

    const existingSession = await getAsync('SELECT * FROM live_sessions WHERE id = ?', [sessionId]);
    const isSameOriginOwner =
      entry.owner_origin_id && originId && String(entry.owner_origin_id) === String(originId);
    const localOwnerUserId = isSameOriginOwner
      ? Number(entry.owner_user_id) || (existingSession ? Number(existingSession.owner_user_id) : 0)
      : existingSession && !entry.owner_origin_id
      ? Number(existingSession.owner_user_id)
      : 0;

    const deletedItemsJson = JSON.stringify(
      Array.isArray(entry.deleted_items) ? entry.deleted_items : parseJsonArray(entry.deleted_items)
    );
    const pointCompletedStr =
      typeof entry.point_completed === 'string'
        ? entry.point_completed
        : JSON.stringify(parseJsonArray(entry.point_completed));

    if (existingSession) {
      await runAsync(
        `UPDATE live_sessions
            SET sync_uuid = ?, name = ?, team1_name = ?, team2_name = ?,
                home_team_id = COALESCE(?, home_team_id), away_team_id = COALESCE(?, away_team_id),
                home_team_uuid = ?, away_team_uuid = ?,
                owner_origin_id = ?, owner_user_id = ?,
                join_code = ?, status = ?, current_point = ?, point_completed = ?,
                video_delay = ?, deleted_at = ?, deleted_items = ?,
                deleted = ?, dirty = 0, cloud_updated_at = ?
          WHERE id = ?`,
        [
          entry.uuid,
          entry.name || 'Match en direct',
          entry.team1_name || 'Domicile',
          entry.team2_name || 'Extérieur',
          homeTeamId,
          awayTeamId,
          entry.home_team_uuid || null,
          entry.away_team_uuid || null,
          entry.owner_origin_id || null,
          localOwnerUserId,
          String(entry.join_code || '').toUpperCase(),
          entry.status || 'active',
          Number(entry.current_point) || 1,
          pointCompletedStr,
          Number.isFinite(Number(entry.video_delay)) ? Number(entry.video_delay) : 8,
          entry.deleted_at || null,
          deletedItemsJson,
          deleted,
          entry.cloudUpdatedAt || now,
          sessionId,
        ]
      );
    } else {
      await runAsync(
        `INSERT INTO live_sessions
            (id, sync_uuid, name, team1_name, team2_name, home_team_id, away_team_id,
             home_team_uuid, away_team_uuid, owner_origin_id, owner_user_id,
             join_code, status, current_point, point_completed, video_delay,
             deleted_at, created_at, deleted_items, deleted, dirty, cloud_updated_at, local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          sessionId,
          entry.uuid,
          entry.name || 'Match en direct',
          entry.team1_name || 'Domicile',
          entry.team2_name || 'Extérieur',
          homeTeamId,
          awayTeamId,
          entry.home_team_uuid || null,
          entry.away_team_uuid || null,
          entry.owner_origin_id || null,
          localOwnerUserId,
          String(entry.join_code || '').toUpperCase(),
          entry.status || 'active',
          Number(entry.current_point) || 1,
          pointCompletedStr,
          Number.isFinite(Number(entry.video_delay)) ? Number(entry.video_delay) : 8,
          entry.deleted_at || null,
          entry.created_at || now,
          deletedItemsJson,
          deleted,
          entry.cloudUpdatedAt || now,
          now,
        ]
      );
    }

    // --- Synchronisation des membres (mise à jour sur place par sync_uuid) ---
    const existingMembers = await allAsync('SELECT * FROM live_members WHERE session_id = ?', [sessionId]);
    const memberByUuid = new Map();
    const memberByOriginUser = new Map();
    for (const m of existingMembers) {
      if (m.sync_uuid) memberByUuid.set(String(m.sync_uuid), m);
      if (m.origin_id && m.user_id != null) {
        memberByOriginUser.set(`${m.origin_id}:${m.user_id}`, m);
      }
    }

    const memberUuidToLocalId = new Map();
    for (const m of parseJsonArray(entry.members)) {
      const mUuid = m.sync_uuid || crypto.randomUUID();
      const isLocalMember = m.origin_id && originId && String(m.origin_id) === String(originId);
      const localUserId = isLocalMember && m.user_id != null ? Number(m.user_id) : null;
      const existing =
        memberByUuid.get(String(mUuid)) ||
        (m.origin_id && m.user_id != null ? memberByOriginUser.get(`${m.origin_id}:${m.user_id}`) : null);

      if (existing) {
        await runAsync(
          `UPDATE live_members
              SET sync_uuid = ?, origin_id = ?, user_id = COALESCE(?, user_id),
                  nickname = ?, role = ?, assignment = ?, updated_at = ?
            WHERE id = ?`,
          [
            mUuid,
            m.origin_id || existing.origin_id || null,
            localUserId,
            m.nickname || existing.nickname || 'Membre',
            m.role || existing.role || 'statistician',
            m.assignment || existing.assignment || '["S","R","A","B","D"]',
            m.updated_at || now,
            existing.id,
          ]
        );
        memberUuidToLocalId.set(String(mUuid), Number(existing.id));
      } else {
        const resM = await runAsync(
          `INSERT INTO live_members (session_id, sync_uuid, origin_id, user_id, nickname, role, assignment, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            mUuid,
            m.origin_id || null,
            localUserId,
            m.nickname || 'Membre',
            m.role || 'statistician',
            m.assignment || '["S","R","A","B","D"]',
            m.updated_at || now,
          ]
        );
        memberUuidToLocalId.set(String(mUuid), Number(resM.lastID));
      }
    }

    // --- Synchronisation des actions (mise à jour sur place par sync_uuid) ---
    const existingActions = await allAsync('SELECT * FROM live_actions WHERE session_id = ?', [sessionId]);
    const actionByUuid = new Map();
    for (const a of existingActions) {
      if (a.sync_uuid) actionByUuid.set(String(a.sync_uuid), a);
    }
    const remoteActions = parseJsonArray(entry.actions);
    const keepActionUuids = new Set(remoteActions.map((a) => String(a.sync_uuid)));
    for (const a of existingActions) {
      if (a.sync_uuid && !keepActionUuids.has(String(a.sync_uuid))) {
        await runAsync('DELETE FROM live_actions WHERE id = ?', [a.id]);
      }
    }
    for (const a of remoteActions) {
      const aUuid = a.sync_uuid || crypto.randomUUID();
      const memberId = a.member_uuid ? memberUuidToLocalId.get(String(a.member_uuid)) || null : null;
      const existing = actionByUuid.get(String(aUuid));
      if (existing) {
        await runAsync(
          `UPDATE live_actions
              SET effective_time = ?, seq = ?, member_id = COALESCE(?, member_id), assigned = ?,
                  code = ?, system_time = ?, team = ?, player_number = ?, action = ?, evaluation = ?,
                  type = ?, start_zone = ?, end_zone = ?, start_subzone = ?, end_subzone = ?,
                  attack_zone = ?, set_number = ?, start_x = ?, start_y = ?, mid_x = ?, mid_y = ?,
                  end_x = ?, end_y = ?, is_auto = ?, updated_at = ?
            WHERE id = ?`,
          [
            Number(a.effective_time) || 0,
            Number(a.seq) || 0,
            memberId,
            a.assigned == null ? 1 : Number(a.assigned),
            a.code,
            a.system_time == null ? null : Number(a.system_time),
            a.team || null,
            a.player_number == null ? null : Number(a.player_number),
            a.action || null,
            a.evaluation || null,
            a.type || null,
            a.start_zone || null,
            a.end_zone || null,
            a.start_subzone || null,
            a.end_subzone || null,
            a.attack_zone || null,
            Number(a.set_number) > 0 ? Number(a.set_number) : 1,
            a.start_x == null ? null : Number(a.start_x),
            a.start_y == null ? null : Number(a.start_y),
            a.mid_x == null ? null : Number(a.mid_x),
            a.mid_y == null ? null : Number(a.mid_y),
            a.end_x == null ? null : Number(a.end_x),
            a.end_y == null ? null : Number(a.end_y),
            a.is_auto ? 1 : 0,
            a.updated_at || now,
            existing.id,
          ]
        );
      } else {
        await runAsync(
          `INSERT INTO live_actions
              (session_id, sync_uuid, effective_time, seq, member_id, assigned, code, system_time,
               team, player_number, action, evaluation, type, start_zone, end_zone, start_subzone,
               end_subzone, attack_zone, set_number, start_x, start_y, mid_x, mid_y, end_x, end_y,
               is_auto, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            aUuid,
            Number(a.effective_time) || 0,
            Number(a.seq) || 0,
            memberId,
            a.assigned == null ? 1 : Number(a.assigned),
            a.code,
            a.system_time == null ? null : Number(a.system_time),
            a.team || null,
            a.player_number == null ? null : Number(a.player_number),
            a.action || null,
            a.evaluation || null,
            a.type || null,
            a.start_zone || null,
            a.end_zone || null,
            a.start_subzone || null,
            a.end_subzone || null,
            a.attack_zone || null,
            Number(a.set_number) > 0 ? Number(a.set_number) : 1,
            a.start_x == null ? null : Number(a.start_x),
            a.start_y == null ? null : Number(a.start_y),
            a.mid_x == null ? null : Number(a.mid_x),
            a.mid_y == null ? null : Number(a.mid_y),
            a.end_x == null ? null : Number(a.end_x),
            a.end_y == null ? null : Number(a.end_y),
            a.is_auto ? 1 : 0,
            a.updated_at || now,
          ]
        );
      }
    }

    // --- Synchronisation des événements (mise à jour sur place par sync_uuid) ---
    const existingEvents = await allAsync('SELECT * FROM live_events WHERE session_id = ?', [sessionId]);
    const eventByUuid = new Map();
    for (const ev of existingEvents) {
      if (ev.sync_uuid) eventByUuid.set(String(ev.sync_uuid), ev);
    }
    const remoteEvents = parseJsonArray(entry.events);
    const keepEventUuids = new Set(remoteEvents.map((ev) => String(ev.sync_uuid)));
    for (const ev of existingEvents) {
      if (ev.sync_uuid && !keepEventUuids.has(String(ev.sync_uuid))) {
        await runAsync('DELETE FROM live_events WHERE id = ?', [ev.id]);
      }
    }
    for (const ev of remoteEvents) {
      const evUuid = ev.sync_uuid || crypto.randomUUID();
      const payloadStr = typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload || {});
      const existing = eventByUuid.get(String(evUuid));
      if (existing) {
        await runAsync(
          `UPDATE live_events
              SET kind = ?, set_number = ?, point_number = ?, team = ?, payload = ?, updated_at = ?
            WHERE id = ?`,
          [
            ev.kind,
            Number(ev.set_number) > 0 ? Number(ev.set_number) : 1,
            Number(ev.point_number) || 0,
            ev.team || null,
            payloadStr,
            ev.updated_at || now,
            existing.id,
          ]
        );
      } else {
        await runAsync(
          `INSERT INTO live_events (session_id, sync_uuid, kind, set_number, point_number, team, payload, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            evUuid,
            ev.kind,
            Number(ev.set_number) > 0 ? Number(ev.set_number) : 1,
            Number(ev.point_number) || 0,
            ev.team || null,
            payloadStr,
            ev.updated_at || now,
          ]
        );
      }
    }

    // --- Synchronisation des positions de départ (set_setups) ---
    const matchKey = `session:${sessionId}`;
    for (const st of parseJsonArray(entry.setups)) {
      const setNum = Number(st.set_number) || 1;
      const homeLineup =
        st.home_lineup == null
          ? null
          : typeof st.home_lineup === 'string'
          ? st.home_lineup
          : JSON.stringify(st.home_lineup);
      const awayLineup =
        st.away_lineup == null
          ? null
          : typeof st.away_lineup === 'string'
          ? st.away_lineup
          : JSON.stringify(st.away_lineup);
      await runAsync(
        `INSERT INTO set_setups
            (match_key, set_number, first_server, home_setter_pos, away_setter_pos,
             home_setter, away_setter, home_lineup, away_lineup, deleted, dirty, local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
         ON CONFLICT(match_key, set_number) DO UPDATE SET
           first_server = excluded.first_server,
           home_setter_pos = excluded.home_setter_pos,
           away_setter_pos = excluded.away_setter_pos,
           home_setter = excluded.home_setter,
           away_setter = excluded.away_setter,
           home_lineup = excluded.home_lineup,
           away_lineup = excluded.away_lineup,
           deleted = 0,
           dirty = 0,
           local_updated_at = excluded.local_updated_at`,
        [
          matchKey,
          setNum,
          st.first_server || null,
          st.home_setter_pos || null,
          st.away_setter_pos || null,
          st.home_setter == null ? null : Number(st.home_setter),
          st.away_setter == null ? null : Number(st.away_setter),
          homeLineup,
          awayLineup,
          st.updated_at || now,
        ]
      );
    }

    emitToSession(sessionId, 'session:update', {});
    emitToSession(sessionId, 'session:setups', {});
    return sessionId;
  },

  adoptUuid: (localId, uuid) =>
    runAsync('UPDATE live_sessions SET sync_uuid = ? WHERE id = ?', [uuid, localId]),
  deleteLocal: (localId) =>
    runAsync('UPDATE live_sessions SET deleted = 1, deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), dirty = 0 WHERE id = ?', [localId]),
  settleLocal: (localId, cloudUpdatedAt) =>
    runAsync('UPDATE live_sessions SET dirty = 0, cloud_updated_at = ? WHERE id = ?', [cloudUpdatedAt, localId]),
  touchPushed: (uuid, cloudUpdatedAt) =>
    runAsync('UPDATE live_sessions SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ? OR id = ?', [cloudUpdatedAt, uuid, uuid]),
  pendingCount: async () => {
    const r = await getAsync('SELECT COUNT(*) AS n FROM live_sessions WHERE dirty = 1', []);
    return r ? r.n : 0;
  },
  statusCounts: async () => {
    const active = await getAsync('SELECT COUNT(*) AS n FROM live_sessions WHERE COALESCE(deleted, 0) = 0 AND deleted_at IS NULL', []);
    const tombstones = await getAsync('SELECT COUNT(*) AS n FROM live_sessions WHERE COALESCE(deleted, 0) = 1 OR deleted_at IS NOT NULL', []);
    return { active: active ? active.n : 0, tombstones: tombstones ? tombstones.n : 0 };
  },
  onChanged: (applied, removed) => {
    if (applied || removed) {
      relinkTeamReferences().catch(() => {});
      emitCollectionChanged('live');
    }
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
  liveCollection,
};
