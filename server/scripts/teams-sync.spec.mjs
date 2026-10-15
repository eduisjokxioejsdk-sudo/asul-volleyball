// Vérifie la logique de synchronisation cloud des équipes (module pur
// server/src/teamsSyncCore.js) : normalisation des noms, conversion des lignes,
// fusion équipe par équipe, déduplication par nom et propagation des
// suppressions, puis convergence entre deux postes simulés.
//
// Exécution : node server/scripts/teams-sync.spec.mjs
import core from '../src/teamsSyncCore.js';

const { normalizeName, toTimestamp, isAfter, sameContent, teamRowToCloud, cloudRowToLocal, planMerge } = core;

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `attendu ${e} — obtenu ${a}`);
}

// Horloge monotone : chaque écriture « cloud » avance d'une seconde.
let clock = Date.parse('2026-01-01T08:00:00.000Z');
const tick = (step = 1000) => {
  clock += step;
  return new Date(clock).toISOString();
};

/** Équipe telle que stockée en base locale (SQLite). */
function localTeam(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    sync_uuid: overrides.sync_uuid ?? null,
    name: overrides.name ?? 'Équipe',
    libero: overrides.libero ?? null,
    libero_for: overrides.libero_for ?? null,
    deleted: overrides.deleted ? 1 : 0,
    dirty: overrides.dirty === undefined ? 1 : overrides.dirty ? 1 : 0,
    local_updated_at: overrides.local_updated_at ?? '2026-01-01T09:00:00.000Z',
    cloud_updated_at: overrides.cloud_updated_at ?? null,
    players: overrides.players ?? [{ number: 1, name: 'Joueur', role: 'universal' }],
  };
}

/** Ligne telle que renvoyée par Supabase. */
function cloudRow(overrides = {}) {
  return {
    sync_uuid: overrides.sync_uuid ?? 'uuid-1',
    name: overrides.name ?? 'Équipe',
    libero: overrides.libero ?? null,
    libero_for: overrides.libero_for ?? null,
    players: overrides.players ?? [{ number: 1, name: 'Joueur', role: 'universal' }],
    deleted: Boolean(overrides.deleted),
    updated_at: overrides.updated_at ?? '2026-01-01T10:00:00.000Z',
  };
}

console.log('\n== Normalisation des noms ==');
eq('casse et espaces', normalizeName('ASUL Lyon'), 'asul lyon');
eq('tirets et espaces multiples', normalizeName('  Asul-  Lyon '), 'asul lyon');
eq('accents retirés', normalizeName('Équipe été N°1'), 'equipe ete n 1');
eq('valeur absente', normalizeName(null), '');

console.log('\n== Horodatages ==');
eq('format SQLite (UTC sans suffixe)', toTimestamp('2026-01-01 10:00:00'), '2026-01-01T10:00:00.000Z');
eq('ISO conservé', toTimestamp('2026-01-01T10:00:00.000Z'), '2026-01-01T10:00:00.000Z');
eq('valeur absente', toTimestamp(null), null);
eq('valeur illisible', toTimestamp('hier'), null);
check('postérieur', isAfter('2026-01-01T10:00:00.000Z', '2026-01-01T09:00:00.000Z'));
check('antérieur refusé', !isAfter('2026-01-01T09:00:00.000Z', '2026-01-01T10:00:00.000Z'));
check('comparé à « jamais »', isAfter('2026-01-01T09:00:00.000Z', null));
check('valeur absente jamais postérieure', !isAfter(null, '2026-01-01T09:00:00.000Z'));

console.log('\n== Conversions des lignes ==');
const pushRow = teamRowToCloud(
  localTeam({
    id: 7,
    name: 'ASUL Lyon',
    libero: 12,
    libero_for: 5,
    players: [{ number: '4', name: ' Léa ', role: 'setter' }],
  }),
  'poste-1'
);
eq('libéro numérique', pushRow.libero, 12);
eq('nom du joueur nettoyé', pushRow.players[0].name, 'Léa');
eq('numéro du joueur numérique', pushRow.players[0].number, 4);
eq('poste d’origine conservé', pushRow.origin_id, 'poste-1');
check('non supprimée par défaut', pushRow.deleted === false);

const pulledRow = cloudRowToLocal(
  cloudRow({
    sync_uuid: 'u-1',
    name: 'Visiteurs',
    libero: 3,
    players: [{ number: 2, name: 'Bo', role: 'middle' }],
    updated_at: '2026-01-01T11:00:00.000Z',
  })
);
eq('identifiant repris', pulledRow.uuid, 'u-1');
eq('horodatage serveur repris', pulledRow.cloudUpdatedAt, '2026-01-01T11:00:00.000Z');
eq('joueurs repris', pulledRow.players.length, 1);
check(
  'contenus identiques reconnus',
  sameContent(
    localTeam({ name: 'Visiteurs', libero: 3, players: [{ number: 2, name: 'Bo', role: 'middle' }] }),
    cloudRow({ name: 'Visiteurs', libero: 3, players: [{ number: 2, name: 'Bo', role: 'middle' }] })
  )
);
check(
  'joueur différent détecté',
  !sameContent(
    localTeam({ name: 'Visiteurs', players: [{ number: 2, name: 'Bo', role: 'middle' }] }),
    cloudRow({ name: 'Visiteurs', players: [{ number: 2, name: 'Bob', role: 'middle' }] })
  )
);

console.log('\n== Fusion : cas élémentaires ==');
let plan = planMerge({ localTeams: [localTeam({ id: 1, name: 'ASUL Lyon' })], remoteRows: [], lastSyncAt: null });
eq('équipe locale jamais envoyée → poussée', plan.toPush.length, 1);
eq('aucune écriture locale', plan.toApply.length + plan.toDelete.length, 0);

plan = planMerge({ localTeams: [], remoteRows: [cloudRow({ sync_uuid: 'u-1' })], lastSyncAt: null });
eq('équipe inconnue du cloud → créée ici', plan.toApply.length, 1);
eq('création sans id local', plan.toApply[0].localId, null);
eq('identifiant cloud repris', plan.toApply[0].uuid, 'u-1');

const identicalLocal = localTeam({ id: 3, sync_uuid: 'u-2', name: 'ASUL Lyon', dirty: 0 });
plan = planMerge({
  localTeams: [identicalLocal],
  remoteRows: [cloudRow({ sync_uuid: 'u-2', name: 'ASUL Lyon' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('contenu identique → aucun envoi', plan.toPush.length, 0);
eq('contenu identique → aucune écriture', plan.toApply.length + plan.toDelete.length, 0);
eq('métadonnées réconciliées', plan.toSettle.length, 1);

plan = planMerge({
  localTeams: [localTeam({ id: 4, sync_uuid: 'u-3', name: 'ASUL Lyon', dirty: 0 })],
  remoteRows: [cloudRow({ sync_uuid: 'u-3', name: 'ASUL Lyon B', updated_at: '2026-01-01T10:00:00.000Z' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('équipe non modifiée ici → le cloud gagne', plan.toApply.length, 1);
eq('même ligne locale mise à jour', plan.toApply[0].localId, 4);
eq('nouveau nom appliqué', plan.toApply[0].name, 'ASUL Lyon B');

plan = planMerge({
  localTeams: [
    localTeam({ id: 5, sync_uuid: 'u-4', name: 'ASUL Lyon (édité)', dirty: 1, local_updated_at: '2026-01-01T11:00:00.000Z' }),
  ],
  remoteRows: [cloudRow({ sync_uuid: 'u-4', name: 'ASUL Lyon', updated_at: '2026-01-01T10:00:00.000Z' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('modification locale récente → envoyée', plan.toPush.length, 1);
eq('conflit consigné', plan.conflicts.length, 1);
eq('aucune écriture locale', plan.toApply.length + plan.toDelete.length, 0);

plan = planMerge({
  localTeams: [localTeam({ id: 6, sync_uuid: 'u-5', name: 'Ancienne', dirty: 0 })],
  remoteRows: [cloudRow({ sync_uuid: 'u-5', name: 'Ancienne', deleted: true, updated_at: '2026-01-01T10:30:00.000Z' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('suppression distante → supprimée ici', plan.toDelete.length, 1);
eq('identifiant local visé', plan.toDelete[0], 6);

plan = planMerge({
  localTeams: [localTeam({ id: 7, sync_uuid: 'u-6', name: 'Ancienne', deleted: true, dirty: 1 })],
  remoteRows: [],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('suppression locale → propagée', plan.toPush.length, 1);
check('pierre tombale envoyée', Boolean(plan.toPush[0].deleted));

console.log('\n== Déduplication par nom ==');
const dedup = planMerge({
  localTeams: [localTeam({ id: 8, sync_uuid: 'uuid-local', name: 'Asul  Lyon', dirty: 1 })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-cloud', name: 'ASUL Lyon', updated_at: '2026-01-01T10:00:00.000Z' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('équipe reconnue malgré un identifiant différent', dedup.toApply.length, 1);
eq('identifiant local conservé', dedup.toApply[0].localId, 8);
eq('identifiant du cloud adopté', dedup.toApply[0].uuid, 'uuid-cloud');

const noHijack = planMerge({
  localTeams: [localTeam({ id: 9, sync_uuid: 'uuid-9', name: 'ASUL Lyon', dirty: 0 })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-autre', name: 'ASUL Lyon', updated_at: '2026-01-01T10:00:00.000Z' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('équipe déjà synchronisée non capturée', noHijack.toApply[0].localId, null);
eq('équipe déjà synchronisée non renvoyée', noHijack.toPush.length, 0);

console.log('\n== Adoption de l’identifiant partagé (anti-doublon) ==');
plan = planMerge({
  localTeams: [
    localTeam({
      id: 10,
      sync_uuid: 'uuid-10',
      name: 'ASUL Lyon',
      dirty: 1,
      local_updated_at: '2026-01-01T11:00:00.000Z',
      players: [{ number: 7, name: 'Local', role: 'universal' }],
    }),
  ],
  remoteRows: [
    cloudRow({
      sync_uuid: 'uuid-cloud',
      name: 'ASUL Lyon',
      players: [{ number: 1, name: 'Distant', role: 'universal' }],
      updated_at: '2026-01-01T10:00:00.000Z',
    }),
  ],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('identifiant du cloud adopté', plan.toAdopt.length, 1);
eq('identifiant partagé retenu', plan.toAdopt[0].uuid, 'uuid-cloud');
eq('contenu local renvoyé au cloud', plan.toPush.length, 1);
eq('aucune écriture de contenu en local', plan.toApply.length, 0);

plan = planMerge({
  localTeams: [localTeam({ id: 11, sync_uuid: 'uuid-11', name: 'ASUL Lyon', dirty: 1, local_updated_at: '2026-01-01T11:00:00.000Z' })],
  remoteRows: [cloudRow({ sync_uuid: 'uuid-cloud', name: 'ASUL Lyon', updated_at: '2026-01-01T10:00:00.000Z' })],
  lastSyncAt: '2026-01-01T09:30:00.000Z',
});
eq('contenu identique : identifiant adopté', plan.toAdopt.length, 1);
eq('contenu identique : rien à envoyer', plan.toPush.length, 0);
eq('contenu identique : métadonnées réconciliées', plan.toSettle.length, 1);

// ---------------------------------------------------------------------------
// Simulation de deux postes + un cloud en mémoire : reproduit ce que font
// teamsSync.js (fusion, curseur, envoi) et les routes (dirty, tombstones).
// ---------------------------------------------------------------------------

function createCloud() {
  const rows = new Map();
  const list = () => [...rows.values()].sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
  return {
    rows,
    upsert(row) {
      const saved = { ...row, updated_at: tick() };
      rows.set(String(row.sync_uuid), saved);
      return saved;
    },
    /** Lecture incrémentale : tout ce qui a changé depuis le curseur. */
    since(cursor) {
      return list().filter((row) => !cursor || row.updated_at > cursor);
    },
    all: list,
  };
}

let postCounter = 0;
function createPost(label) {
  postCounter += 1;
  return { label, teams: [], nextId: 0, cursor: null, lastSyncAt: null, namespace: `p${postCounter}` };
}

/** Création d'une équipe (comme POST /api/teams : identifiant + dirty). */
function createTeam(post, options = {}) {
  post.nextId += 1;
  const row = {
    id: post.nextId,
    sync_uuid: `${post.namespace}-${post.nextId}`,
    name: options.name || `${post.label} ${post.nextId}`,
    libero: options.libero ?? null,
    libero_for: options.libero_for ?? null,
    deleted: 0,
    dirty: 1,
    local_updated_at: tick(),
    cloud_updated_at: null,
    players: options.players || [],
  };
  post.teams.push(row);
  return row;
}

function findTeam(post, id) {
  return post.teams.find((team) => team.id === id);
}

/** Modification locale (comme PATCH /api/teams/:id). */
function editTeam(post, id, changes, players) {
  const row = findTeam(post, id);
  Object.assign(row, changes || {});
  if (players) row.players = players;
  row.dirty = 1;
  row.local_updated_at = tick();
  return row;
}

/** Suppression locale (comme DELETE /api/teams/:id : pierre tombale). */
function removeTeam(post, id) {
  const row = findTeam(post, id);
  row.deleted = 1;
  row.dirty = 1;
  row.local_updated_at = tick();
  return row;
}

/** Un cycle complet, comme teamsSync.syncNow(). */
function sync(post, cloud) {
  const remoteRows = cloud.since(post.cursor);
  const cycle = planMerge({ localTeams: post.teams, remoteRows, lastSyncAt: post.lastSyncAt, originId: post.label });

  const adopted = new Map();
  for (const adopt of cycle.toAdopt) {
    adopted.set(adopt.localId, adopt.uuid);
    findTeam(post, adopt.localId).sync_uuid = adopt.uuid;
  }

  let writes = 0;
  for (const entry of cycle.toApply) {
    let target = entry.localId ? findTeam(post, entry.localId) : null;
    if (!target) {
      post.nextId += 1;
      target = { id: post.nextId, players: [] };
      post.teams.push(target);
    }
    Object.assign(target, {
      sync_uuid: entry.uuid,
      name: entry.name,
      libero: entry.libero,
      libero_for: entry.libero_for,
      deleted: entry.deleted ? 1 : 0,
      dirty: 0,
      cloud_updated_at: entry.cloudUpdatedAt,
      local_updated_at: target.local_updated_at || tick(),
      players: entry.players,
    });
    writes += 1;
  }
  for (const localId of cycle.toDelete) {
    const row = findTeam(post, localId);
    row.deleted = 1;
    row.dirty = 0;
    writes += 1;
  }
  for (const settle of cycle.toSettle) {
    const row = findTeam(post, settle.localId);
    row.dirty = 0;
    row.cloud_updated_at = settle.cloudUpdatedAt;
  }
  for (const team of cycle.toPush) {
    const row = findTeam(post, team.id);
    row.sync_uuid = adopted.get(row.id) || row.sync_uuid;
    const saved = cloud.upsert(teamRowToCloud(row, post.label));
    row.sync_uuid = saved.sync_uuid;
    row.dirty = 0;
    row.cloud_updated_at = saved.updated_at;
    writes += 1;
  }

  const stamps = [...remoteRows.map((row) => row.updated_at), ...post.teams.map((row) => row.cloud_updated_at)]
    .filter(Boolean)
    .sort();
  post.cursor = stamps.length ? stamps[stamps.length - 1] : post.cursor;
  post.lastSyncAt = tick();
  return { ...cycle, writes };
}

/** Équipes visibles dans l'application (non supprimées), nom + joueurs. */
function visible(post) {
  return post.teams
    .filter((team) => !team.deleted)
    .map((team) => `${team.name}|${team.players.map((p) => `${p.number}:${p.name}`).join(',')}`)
    .sort();
}

/** Nombre d'équipes en attente d'envoi (comme status.pending de l'interface). */
function pending(post) {
  return post.teams.filter((team) => Number(team.dirty) === 1).length;
}

console.log('\n== Deux postes : création, modification, suppression ==');
const cloud1 = createCloud();
const postA = createPost('Poste A');
const postB = createPost('Poste B');

createTeam(postA, { name: 'ASUL Lyon', players: [{ number: 4, name: 'Léa', role: 'setter' }] });
sync(postA, cloud1);
sync(postB, cloud1);
eq('équipe créée sur A visible sur B', visible(postB), ['ASUL Lyon|4:Léa']);
eq('listes identiques', visible(postA), visible(postB));
eq('rien en attente après synchronisation', pending(postA) + pending(postB), 0);

const teamOnB = postB.teams.find((team) => !team.deleted);
editTeam(postB, teamOnB.id, { libero: 12, libero_for: 4 }, [
  { number: 4, name: 'Léa', role: 'setter' },
  { number: 12, name: 'Nina', role: 'libero' },
]);
sync(postB, cloud1);
sync(postA, cloud1);
check('modification de B arrivée sur A', visible(postA)[0].includes('12:Nina'));
eq('libéro propagé', postA.teams.find((team) => !team.deleted).libero, 12);

removeTeam(postA, postA.teams.find((team) => !team.deleted).id);
sync(postA, cloud1);
sync(postB, cloud1);
eq('suppression propagée à B', visible(postB), []);
eq('pierre tombale conservée en local', postB.teams.filter((team) => team.deleted).length, 1);

console.log('\n== Idempotence : un cycle sans changement n’écrit rien ==');
eq('poste A : aucun envoi', sync(postA, cloud1).writes, 0);
eq('poste B : aucun envoi', sync(postB, cloud1).writes, 0);

console.log('\n== Même équipe créée de son côté sur deux postes ==');
const cloud2 = createCloud();
const postC = createPost('Poste C');
const postD = createPost('Poste D');
createTeam(postC, { name: 'ASUL Lyon', players: [{ number: 4, name: 'Léa', role: 'setter' }] });
createTeam(postD, { name: 'Asul  Lyon', players: [{ number: 4, name: 'Léa', role: 'setter' }] });
sync(postC, cloud2);
sync(postD, cloud2);
sync(postC, cloud2);
eq('une seule équipe visible sur C', visible(postC).length, 1);
eq('une seule équipe visible sur D', visible(postD).length, 1);
eq('identifiant partagé identique', postC.teams[0].sync_uuid, postD.teams[0].sync_uuid);
eq('aucun doublon dans le cloud', cloud2.all().length, 1);

console.log('\n== Même équipe modifiée de son côté sur deux postes ==');
const cloud3 = createCloud();
const postE = createPost('Poste E');
const postF = createPost('Poste F');
createTeam(postE, { name: 'Visiteurs', players: [{ number: 1, name: 'Eva', role: 'universal' }] });
createTeam(postF, { name: 'Visiteurs', players: [{ number: 2, name: 'Flo', role: 'universal' }] });
sync(postE, cloud3);
sync(postF, cloud3);
sync(postE, cloud3);
eq('une seule équipe chez E', visible(postE).length, 1);
eq('une seule équipe chez F', visible(postF).length, 1);
eq('versions identiques après convergence', visible(postE), visible(postF));
eq('aucun doublon dans le cloud', cloud3.all().length, 1);
eq('contenu du dernier écrivain conservé', visible(postE)[0], 'Visiteurs|2:Flo');

console.log('\n== Coupure réseau puis reconnexion ==');
const cloud4 = createCloud();
const postG = createPost('Poste G');
const postH = createPost('Poste H');
createTeam(postG, { name: 'ASUL Lyon' });
sync(postG, cloud4);
sync(postH, cloud4);
createTeam(postH, { name: 'Créée hors ligne' });
eq('équipe créée pendant la coupure conservée', visible(postH).length, 2);
eq('en attente d’envoi', pending(postH), 1);
sync(postH, cloud4);
sync(postG, cloud4);
eq('plus rien en attente après reconnexion', pending(postH), 0);
check('équipe créée hors ligne arrivée sur G', visible(postG).includes('Créée hors ligne|'));

console.log('');
if (failures > 0) {
  console.log(`${failures} vérification(s) en échec.\n`);
  process.exit(1);
}
console.log('Toutes les vérifications de la synchronisation des équipes sont passées.\n');
