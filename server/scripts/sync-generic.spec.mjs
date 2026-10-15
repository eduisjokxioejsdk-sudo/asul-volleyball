// Vérifie la logique pure générique de synchronisation (server/src/syncCore.js) :
// fusion last-write-wins sans déduplication par nom, tombstone, conflits,
// settle et idempotence — la base des futures collections (trajectoires,
// métadonnées vidéo, actions, attributions de sets…).
//
// Exécution : node server/scripts/sync-generic.spec.mjs
import { fieldsEqual, planMergeGeneric } from '../src/syncCore.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `attendu ${e} — obtenu ${a}`);
}

const FIELDS = ['name', 'status'];
const OLD = '2026-01-01T10:00:00.000Z';
const NEW = '2026-01-02T10:00:00.000Z';

function localRow(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    sync_uuid: overrides.sync_uuid ?? null,
    name: overrides.name ?? 'Fiche',
    status: overrides.status ?? 'open',
    deleted: overrides.deleted ? 1 : 0,
    dirty: overrides.dirty === undefined ? 1 : overrides.dirty ? 1 : 0,
    local_updated_at: overrides.local_updated_at ?? NEW,
    cloud_updated_at: overrides.cloud_updated_at ?? null,
  };
}
function cloudRow(overrides = {}) {
  return {
    sync_uuid: overrides.sync_uuid ?? 'uuid-1',
    name: overrides.name ?? 'Fiche',
    status: overrides.status ?? 'open',
    deleted: Boolean(overrides.deleted),
    updated_at: overrides.updated_at ?? NEW,
  };
}

console.log('\n== Égalité de contenu ==');
check('contenus identiques', fieldsEqual(localRow(), cloudRow(), FIELDS));
check('nom différent détecté', !fieldsEqual(localRow({ name: 'X' }), cloudRow(), FIELDS));
check('null vs valeur', !fieldsEqual({ ...localRow(), status: null }, cloudRow({ status: 'open' }), FIELDS));

console.log('\n== Fusion : cas élémentaires ==');
const neverPushed = planMergeGeneric({
  localRows: [localRow({ sync_uuid: null, dirty: 1 })],
  remoteRows: [],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('ligne locale jamais envoyée → poussée', neverPushed.toPush.length, 1);
eq('aucune écriture locale', neverPushed.toApply.length + neverPushed.toDelete.length, 0);

const remoteOnly = planMergeGeneric({
  localRows: [],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-9', name: 'Distante' })],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('ligne inconnue du cloud → créée ici', remoteOnly.toApply.length, 1);
eq('création sans id local', remoteOnly.toApply[0].localId, null);

const identical = planMergeGeneric({
  localRows: [localRow({ sync_uuid: 'uuid-1', dirty: 0 })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-1' })],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('contenu identique → settle', identical.toSettle.length, 1);
eq('contenu identique → aucun envoi', identical.toPush.length, 0);

const cloudWins = planMergeGeneric({
  localRows: [localRow({ sync_uuid: 'uuid-1', dirty: 0, name: 'Ancien' })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-1', name: 'Nouveau' })],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('ligne non modifiée ici → le cloud gagne', cloudWins.toApply.length, 1);
eq('nouveau nom appliqué', cloudWins.toApply[0].name, 'Nouveau');

const localWins = planMergeGeneric({
  localRows: [localRow({ sync_uuid: 'uuid-1', dirty: 1, name: 'Local', local_updated_at: NEW })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-1', name: 'Nuage', updated_at: OLD })],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('modification locale récente → envoyée', localWins.toPush.length, 1);
eq('conflit consigné', localWins.conflicts.length, 1);
eq('aucune écriture locale', localWins.toApply.length, 0);

console.log('\n== Suppressions (tombstones) ==');
const remoteDeleted = planMergeGeneric({
  localRows: [localRow({ sync_uuid: 'uuid-1', dirty: 0 })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-1', deleted: true })],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('suppression distante → supprimée ici', remoteDeleted.toDelete.length, 1);

const localDeleted = planMergeGeneric({
  localRows: [localRow({ sync_uuid: 'uuid-1', dirty: 1, deleted: 1 })],
  remoteRows: [],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('suppression locale → propagée', localDeleted.toPush.length, 1);
check('pierre tombale envoyée', localDeleted.toPush[0].deleted === 1);

console.log('\n== Idempotence ==');
const settled = planMergeGeneric({
  localRows: [localRow({ sync_uuid: 'uuid-1', dirty: 0 })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-1' })],
  lastSyncAt: OLD,
  fields: FIELDS,
});
eq('un cycle sans changement n’écrit rien', settled.toPush.length + settled.toApply.length + settled.toDelete.length, 0);

console.log('');
if (failures > 0) {
  console.log(`${failures} vérification(s) en échec.\n`);
  process.exit(1);
}
console.log('Toutes les vérifications de la synchronisation générique sont passées.\n');
