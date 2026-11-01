// ============================================================================
// Re-liaison des références d'équipe et de vidéo (id local ↔ sync_uuid partagé).
//
// Quand une fiche de trajectoire (ou un match / une vidéo) arrive d'un autre
// poste AVANT l'équipe ou la vidéo qu'elle référence, son `home_team_id` /
// `away_team_id` / `video_id` reste NULL (le uuid n'a pas encore d'équivalent
// local). Ce module re-résout ces identifiants dès que l'entité est présente,
// en s'appuyant sur l'UUID partagé stocké, avec un repli par nom pour les
// équipes. Appelé à chaque synchronisation : idempotent et rapide.
// ============================================================================

const db = require('./database');

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });

const SIDE_NAME = { home: 'team1_name', away: 'team2_name' };

/** Re-lie un côté par UUID quand l'id manque mais que l'uuid est connu. */
function relinkSideByUuid(table, side) {
  const idCol = `${side}_team_id`;
  const uuidCol = `${side}_team_uuid`;
  return runAsync(
    `UPDATE ${table} SET ${idCol} = (
        SELECT id FROM teams
         WHERE sync_uuid = ${table}.${uuidCol} AND COALESCE(deleted, 0) = 0
         LIMIT 1
      )
     WHERE ${idCol} IS NULL AND ${uuidCol} IS NOT NULL`
  );
}

/** Repli par nom pour les fiches/vidéos sans UUID stocké. */
function relinkSideByName(table, side) {
  const idCol = `${side}_team_id`;
  const uuidCol = `${side}_team_uuid`;
  const nameCol = SIDE_NAME[side];
  return runAsync(
    `UPDATE ${table} SET ${idCol} = (
        SELECT id FROM teams
         WHERE LOWER(name) = LOWER(${table}.${nameCol}) AND COALESCE(deleted, 0) = 0
         LIMIT 1
      )
     WHERE ${idCol} IS NULL AND ${uuidCol} IS NULL AND ${nameCol} IS NOT NULL`
  );
}

/** Re-lie video_id sur trajectory_matches à partir de video_uuid. */
function relinkTrajectoryVideoByUuid() {
  return runAsync(
    `UPDATE trajectory_matches SET video_id = (
        SELECT id FROM videos
         WHERE sync_uuid = trajectory_matches.video_uuid AND COALESCE(deleted, 0) = 0
         LIMIT 1
      )
     WHERE video_id IS NULL AND video_uuid IS NOT NULL`
  );
}

/** Re-résout les références d'équipe et de vidéo manquantes. */
async function relinkTeamReferences() {
  const tHome = await relinkSideByUuid('trajectory_matches', 'home');
  const tAway = await relinkSideByUuid('trajectory_matches', 'away');
  const mHome = await relinkSideByUuid('volley_matches', 'home');
  const mAway = await relinkSideByUuid('volley_matches', 'away');
  const vHome = await relinkSideByUuid('videos', 'home');
  const vAway = await relinkSideByUuid('videos', 'away');
  const lHome = await relinkSideByUuid('live_sessions', 'home');
  const lAway = await relinkSideByUuid('live_sessions', 'away');
  const tHomeName = await relinkSideByName('trajectory_matches', 'home');
  const tAwayName = await relinkSideByName('trajectory_matches', 'away');
  const vHomeName = await relinkSideByName('videos', 'home');
  const vAwayName = await relinkSideByName('videos', 'away');
  const lHomeName = await relinkSideByName('live_sessions', 'home');
  const lAwayName = await relinkSideByName('live_sessions', 'away');
  const tVid = await relinkTrajectoryVideoByUuid();
  return {
    trajectories: tHome + tAway + tHomeName + tAwayName + tVid,
    matches: mHome + mAway,
    videos: vHome + vAway + vHomeName + vAwayName,
    live: lHome + lAway + lHomeName + lAwayName,
  };
}

module.exports = { relinkTeamReferences };
