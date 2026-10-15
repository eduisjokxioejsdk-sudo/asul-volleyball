// ============================================================================
// Re-liaison des références d'équipe (id local ↔ sync_uuid partagé).
//
// Quand une fiche de trajectoire (ou un match) arrive d'un autre poste AVANT
// l'équipe qu'elle référence, son `home_team_id`/`away_team_id` reste NULL (le
// uuid n'a pas encore d'équivalent local). Ce module re-résout ces identifiants
// dès que l'équipe est présente, en s'appuyant sur l'UUID partagé stocké
// (`home_team_uuid`/`away_team_uuid`), avec un repli par nom pour les anciennes
// fiches créées avant l'ajout de ces colonnes. Appelé à chaque synchronisation
// des équipes : idempotent et rapide.
// ============================================================================

const db = require('./database');

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });

// Nom figé de l'équipe selon le côté (uniquement pour les fiches de trajectoire).
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

/** Repli par nom pour les anciennes fiches sans UUID stocké (trajectoires uniquement). */
function relinkSideByName(table, side) {
  const idCol = `${side}_team_id`;
  const uuidCol = `${side}_team_uuid`;
  const nameCol = SIDE_NAME[side];
  return runAsync(
    `UPDATE ${table} SET ${idCol} = (
        SELECT id FROM teams
         WHERE name = ${table}.${nameCol} AND COALESCE(deleted, 0) = 0
         LIMIT 1
      )
     WHERE ${idCol} IS NULL AND ${uuidCol} IS NULL AND ${nameCol} IS NOT NULL`
  );
}

/** Re-résout les références d'équipe manquantes. Retourne le nombre de lignes corrigées. */
async function relinkTeamReferences() {
  const tHome = await relinkSideByUuid('trajectory_matches', 'home');
  const tAway = await relinkSideByUuid('trajectory_matches', 'away');
  const mHome = await relinkSideByUuid('volley_matches', 'home');
  const mAway = await relinkSideByUuid('volley_matches', 'away');
  const tHomeName = await relinkSideByName('trajectory_matches', 'home');
  const tAwayName = await relinkSideByName('trajectory_matches', 'away');
  return {
    trajectories: tHome + tAway + tHomeName + tAwayName,
    matches: mHome + mAway,
  };
}

module.exports = { relinkTeamReferences };
