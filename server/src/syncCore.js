// ============================================================================
// Logique pure générique de synchronisation (last-write-wins, sans dédup par nom).
//
// Contrairement à teamsSyncCore.js (spécifique équipes : dédup par nom, joueurs),
// ce module sert aux collections « plates » (trajectoires, métadonnées vidéo,
// actions, attributions de sets…) où chaque ligne locale correspond 1:1 à une
// ligne cloud, identifiées par `sync_uuid` dès leur création.
// ============================================================================

const { toTimestamp, isAfter } = require('./teamsSyncCore');

/** Les champs de contenu sont-ils identiques entre une ligne locale et le cloud ? */
function fieldsEqual(local, remote, fields) {
  for (const field of fields) {
    const lv = local == null ? null : local[field];
    const rv = remote == null ? null : remote[field];
    if (JSON.stringify(lv == null ? null : lv) !== JSON.stringify(rv == null ? null : rv)) {
      return false;
    }
  }
  return true;
}

/**
 * Fusion générique : la dernière modification locale non encore envoyée gagne ;
 * sinon le cloud fait foi. Les suppressions passent par `deleted` (tombstone).
 *
 * @returns {{ toPush, toApply, toAdopt, toDelete, toSettle, conflicts }}
 */
function planMergeGeneric({ localRows, remoteRows, lastSyncAt, fields }) {
  const byUuid = new Map();
  for (const row of localRows || []) {
    if (row.sync_uuid) byUuid.set(String(row.sync_uuid), row);
  }

  const usedLocal = new Set();
  const toPush = [];
  const toApply = [];
  const toDelete = [];
  const toSettle = [];
  const conflicts = [];

  for (const remote of remoteRows || []) {
    const uuid = String(remote.sync_uuid);
    const local = byUuid.get(uuid) || null;
    if (local) usedLocal.add(local.id);

    const localDirty = local ? Boolean(Number(local.dirty)) : false;
    const localWins = localDirty && isAfter(local.local_updated_at, lastSyncAt);
    const remoteDeleted = Boolean(remote.deleted);

    if (!local) {
      toApply.push({ localId: null, uuid, deleted: remoteDeleted, cloudUpdatedAt: remote.updated_at || null, ...remote });
      continue;
    }

    if (localWins) {
      if (fieldsEqual(local, remote, fields) && Boolean(local.deleted) === remoteDeleted) {
        toSettle.push({ localId: local.id, cloudUpdatedAt: remote.updated_at || null });
      } else {
        conflicts.push({
          uuid,
          winner: 'local',
          localId: local.id,
          localUpdatedAt: local.local_updated_at || null,
          cloudUpdatedAt: remote.updated_at || null,
        });
        toPush.push(local);
      }
      continue;
    }

    if (fieldsEqual(local, remote, fields) && Boolean(local.deleted) === remoteDeleted) {
      toSettle.push({ localId: local.id, cloudUpdatedAt: remote.updated_at || null });
    } else if (remoteDeleted) {
      toDelete.push(local.id);
    } else {
      toApply.push({ localId: local.id, uuid, deleted: false, cloudUpdatedAt: remote.updated_at || null, ...remote });
    }
  }

  for (const local of localRows || []) {
    if (!Number(local.dirty)) continue;
    if (usedLocal.has(local.id)) continue;
    toPush.push(local);
  }

  return { toPush, toApply, toAdopt: [], toDelete, toSettle, conflicts };
}

module.exports = { fieldsEqual, planMergeGeneric, toTimestamp, isAfter };
