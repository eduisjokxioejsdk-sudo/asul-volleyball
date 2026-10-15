// ============================================================================
// Synchronisation cloud des équipes (Supabase, offre gratuite).
//
// Mince adaptateur autour du moteur générique server/src/syncEngine.js : il
// décrit la collection « équipes » (table locale `teams` + `team_players`,
// table Supabase `asul_teams`, conversion et fusion via teamsSyncCore.js).
// ============================================================================

const db = require('./database');
const core = require('./teamsSyncCore');
const { emitTeamsChanged, emitCollectionChanged } = require('./socket');
const { relinkTeamReferences } = require('./relinkTeams');
const { createSyncEngine } = require('./syncEngine');

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

/** Toutes les équipes locales (avec leurs joueurs), y compris les tombstones. */
async function loadLocalTeams() {
  const teams = await allAsync('SELECT * FROM teams ORDER BY id ASC', []);
  if (!teams.length) return [];
  const players = await allAsync('SELECT * FROM team_players ORDER BY number ASC, id ASC', []);
  const byTeam = new Map();
  for (const player of players) {
    const key = Number(player.team_id);
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(player);
  }
  return teams.map((team) => ({ ...team, players: byTeam.get(Number(team.id)) || [] }));
}

/** Remplace la liste des joueurs d'une équipe (n° + nom + rôle). */
function replacePlayers(teamId, players) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM team_players WHERE team_id = ?', [teamId], (err) => {
      if (err) return reject(err);
      const list = players || [];
      if (!list.length) return resolve();
      const stmt = db.prepare(
        'INSERT INTO team_players (team_id, number, name, role, serve_type) VALUES (?, ?, ?, ?, ?)'
      );
      list.forEach((player) => {
        stmt.run(
          teamId,
          Number(player.number) || 0,
          (player.name || '').trim() || `N°${player.number}`,
          player.role || 'universal',
          player.serve_type || null
        );
      });
      stmt.finalize((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

/** Applique une ligne du cloud : mise à jour de l'équipe appariée ou création. */
async function applyRemoteEntry(entry) {
  const now = new Date().toISOString();
  const cloudUpdatedAt = entry.cloudUpdatedAt || now;
  const deleted = entry.deleted ? 1 : 0;

  let localId = entry.localId;
  if (localId) {
    await runAsync(
      `UPDATE teams
          SET sync_uuid = ?, name = ?, libero = ?, libero_for = ?, deleted = ?,
              dirty = 0, cloud_updated_at = ?
        WHERE id = ?`,
      [entry.uuid, entry.name, entry.libero, entry.libero_for, deleted, cloudUpdatedAt, localId]
    );
  } else {
    const result = await runAsync(
      `INSERT INTO teams (name, libero, libero_for, sync_uuid, deleted, dirty, cloud_updated_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [entry.name, entry.libero, entry.libero_for, entry.uuid, deleted, cloudUpdatedAt, now]
    );
    localId = result.lastID;
  }

  await replacePlayers(localId, entry.players);
  return localId;
}

const teamsCollection = {
  key: 'teams',
  name: 'Équipes',
  defaultTable: 'asul_teams',
  envPrefix: 'TEAMS_SYNC',
  loadLocal: loadLocalTeams,
  applyRemote: applyRemoteEntry,
  adoptUuid: (localId, uuid) =>
    runAsync('UPDATE teams SET sync_uuid = ? WHERE id = ?', [uuid, localId]),
  deleteLocal: (localId) =>
    runAsync('UPDATE teams SET deleted = 1, dirty = 0 WHERE id = ?', [localId]),
  settleLocal: (localId, cloudUpdatedAt) =>
    runAsync('UPDATE teams SET dirty = 0, cloud_updated_at = ? WHERE id = ?', [cloudUpdatedAt, localId]),
  touchPushed: (uuid, cloudUpdatedAt) =>
    runAsync('UPDATE teams SET dirty = 0, cloud_updated_at = ? WHERE sync_uuid = ?', [cloudUpdatedAt, uuid]),
  planMerge: ({ localRows, remoteRows, lastSyncAt, originId }) =>
    core.planMerge({ localTeams: localRows, remoteRows, lastSyncAt, originId }),
  rowToCloud: core.teamRowToCloud,
  pendingCount: async () => {
    const row = await getAsync('SELECT COUNT(*) AS n FROM teams WHERE dirty = 1', []);
    return row ? row.n : 0;
  },
  statusCounts: async () => {
    const active = await getAsync('SELECT COUNT(*) AS n FROM teams WHERE deleted = 0', []);
    const tombstones = await getAsync('SELECT COUNT(*) AS n FROM teams WHERE deleted = 1', []);
    return {
      teams: active ? active.n : 0,
      tombstones: tombstones ? tombstones.n : 0,
    };
  },
  onChanged: (applied, removed) => {
    if (!(applied || removed)) return;
    emitTeamsChanged();
    // Quand une équipe arrive d'un autre poste, re-lie les fiches de trajectoire
    // et les matchs qui la référencent par UUID mais n'ont pas encore d'id local.
    relinkTeamReferences()
      .then((relinked) => {
        if (relinked.trajectories) emitCollectionChanged('trajectories');
        if (relinked.matches) emitCollectionChanged('matches');
      })
      .catch((err) => console.warn('Re-liaison des équipes :', err.message));
  },
};

module.exports = createSyncEngine(teamsCollection);
