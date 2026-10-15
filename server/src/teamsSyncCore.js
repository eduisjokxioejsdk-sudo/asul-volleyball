// ============================================================================
// Cœur (pur) de la synchronisation cloud des équipes.
//
// Aucun accès au disque, au réseau ou à la base : uniquement des conversions et
// la décision de fusion. C'est ce qui permet de tester la logique seule avec
// `node server/scripts/teams-sync.spec.mjs`.
//
// Principe : chaque équipe porte un identifiant stable (sync_uuid) partagé par
// tous les postes, un horodatage de modification locale (local_updated_at) et
// un drapeau « à pousser » (dirty). La fusion se fait équipe par équipe ; les
// suppressions sont propagées par des pierres tombales (deleted = true) plutôt
// que par une disparition silencieuse.
// ============================================================================

/** Version du format côté cloud (permet de faire évoluer la structure). */
const SYNC_VERSION = 1;

/**
 * Normalise un nom d'équipe pour reconnaître une même équipe créée de son côté
 * sur deux postes différents (« ASUL Lyon » / « asul  lyon » / « Asul-Lyon »).
 */
function normalizeName(name) {
  return String(name == null ? '' : name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Convertit un horodatage en ISO comparable.
 * Accepte ISO (cloud Supabase), `YYYY-MM-DD HH:MM:SS` (SQLite CURRENT_TIMESTAMP,
 * exprimé en UTC mais sans suffixe) et nombre de millisecondes.
 * Renvoie null si la valeur est absente ou illisible.
 */
function toTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const sqlite = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(raw);
  const iso = sqlite ? `${sqlite[1]}T${sqlite[2]}${sqlite[3] || ''}Z` : raw;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * `a` est-il strictement postérieur à `b` ?
 * Un `b` absent (jamais synchronisé) compte comme « infiniment ancien » ;
 * un `a` absent ne peut jamais être postérieur.
 */
function isAfter(a, b) {
  const first = toTimestamp(a);
  if (!first) return false;
  const second = toTimestamp(b);
  if (!second) return true;
  return first > second;
}

/** Liste de joueurs normalisée (n° + nom + rôle + type de service). */
function normalizePlayers(players) {
  return (players || []).map((player) => ({
    number: Number(player.number) || 0,
    name: String(player.name == null ? '' : player.name).trim(),
    role: player.role || 'universal',
    serve_type: player.serve_type || null,
  }));
}

function samePlayers(a, b) {
  return JSON.stringify(normalizePlayers(a)) === JSON.stringify(normalizePlayers(b));
}

/**
 * Le contenu local est-il déjà identique à la ligne du cloud ?
 * Sert à éviter les écritures inutiles (idempotence : un second passage ne
 * produit aucune modification).
 */
function sameContent(localTeam, cloudRow) {
  if (!localTeam || !cloudRow) return false;
  return (
    String(localTeam.name || '') === String(cloudRow.name || '') &&
    (localTeam.libero == null ? null : Number(localTeam.libero)) ===
      (cloudRow.libero == null ? null : Number(cloudRow.libero)) &&
    (localTeam.libero_for == null ? null : Number(localTeam.libero_for)) ===
      (cloudRow.libero_for == null ? null : Number(cloudRow.libero_for)) &&
    Boolean(Number(localTeam.deleted)) === Boolean(cloudRow.deleted) &&
    samePlayers(localTeam.players, cloudRow.players)
  );
}

/** Équipe locale (SQLite) → ligne envoyée au cloud. */
function teamRowToCloud(row, originId) {
  return {
    sync_uuid: row.sync_uuid,
    name: String(row.name || '').trim() || `Équipe ${row.id}`,
    libero: row.libero == null || row.libero === '' ? null : Number(row.libero),
    libero_for: row.libero_for == null || row.libero_for === '' ? null : Number(row.libero_for),
    players: normalizePlayers(row.players),
    deleted: Boolean(Number(row.deleted)),
    origin_id: originId || null,
    sync_version: SYNC_VERSION,
  };
}

/** Ligne du cloud → équipe locale (forme attendue par l'application). */
function cloudRowToLocal(row) {
  return {
    uuid: String(row.sync_uuid),
    name: String(row.name || '').trim(),
    libero: row.libero == null ? null : Number(row.libero),
    libero_for: row.libero_for == null ? null : Number(row.libero_for),
    players: normalizePlayers(row.players),
    deleted: Boolean(row.deleted),
    cloudUpdatedAt: row.updated_at || null,
  };
}

/**
 * Décide de ce qu'il faut faire, sans rien écrire.
 *
 * @param {object} options
 * @param {Array}  options.localTeams  équipes locales (y compris supprimées).
 * @param {Array}  options.remoteRows  lignes renvoyées par le cloud.
 * @param {string} options.lastSyncAt  horodatage local de la dernière synchro réussie.
 * @param {string} options.originId    identifiant du poste (traçabilité).
 * @returns {{toPush:Array,toApply:Array,toDelete:Array,toSettle:Array,conflicts:Array}}
 *   • toPush   : équipes locales à envoyer au cloud ;
 *   • toApply  : lignes du cloud à écrire en local ({ localId|null, ...cloudRowToLocal }) ;
 *   • toAdopt  : identifiants du cloud à adopter par une équipe locale reconnue
 *                par son nom (aucune fusion pour l'instant : l'adoption évite
 *                de créer un doublon) ;
 *   • toDelete : identifiants locaux à marquer supprimés (le cloud a gagné) ;
 *   • toSettle : métadonnées à réconcilier sans changement de contenu ;
 *   • conflicts: conflits détectés (journalisation / diagnostic).
 */
function planMerge({ localTeams, remoteRows, lastSyncAt, originId }) {
  const locals = (localTeams || []).filter(Boolean).map((team) => ({ ...team }));
  const remotes = (remoteRows || []).filter((row) => row && row.sync_uuid);
  const usedLocal = new Set();
  const byUuid = new Map();
  const remoteUuids = new Set(remotes.map((row) => String(row.sync_uuid)));
  for (const team of locals) {
    if (team.sync_uuid) byUuid.set(String(team.sync_uuid), team);
  }

  const toPush = [];
  const toApply = [];
  const toAdopt = [];
  const toDelete = [];
  const toSettle = [];
  const conflicts = [];

  for (const remote of remotes) {
    const uuid = String(remote.sync_uuid);
    let local = byUuid.get(uuid) || null;

    // Déduplication initiale : une équipe créée de son côté sur plusieurs postes
    // n'a pas encore d'identifiant commun → on la reconnaît par son nom et on
    // adopte l'identifiant du cloud. Sont concernées les équipes jamais
    // envoyées (pas d'identifiant, ou identifiant inconnu du cloud alors
    // qu'elles viennent d'être modifiées) : l'id SQLite local est conservé pour
    // ne pas casser les fiches de trajectoire qui le référencent.
    if (!local) {
      const wanted = normalizeName(remote.name);
      local =
        locals.find((team) => {
          if (usedLocal.has(team.id)) return false;
          if (normalizeName(team.name) !== wanted) return false;
          if (!team.sync_uuid) return true;
          return Boolean(Number(team.dirty)) && !remoteUuids.has(String(team.sync_uuid));
        }) || null;
    }
    if (local) usedLocal.add(local.id);

    const localDirty = local ? Boolean(Number(local.dirty)) : false;
    // Modification locale non encore poussée ET postérieure à la dernière
    // synchro réussie : c'est elle qui fait foi (on vient de la saisir ici).
    const localWins = localDirty && isAfter(local.local_updated_at, lastSyncAt);

    if (!local) {
      toApply.push({ localId: null, ...cloudRowToLocal(remote) });
      continue;
    }

    // Équipe reconnue par son nom (identifiant local encore inconnu du cloud) :
    // on adopte l'identifiant partagé pour ne pas créer de doublon.
    const sameUuid = String(local.sync_uuid || '') === uuid;
    if (!sameUuid) toAdopt.push({ localId: local.id, uuid });

    if (localWins) {
      if (sameContent(local, remote)) {
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

    // Le cloud fait foi (l'équipe n'a pas été modifiée ici depuis la dernière
    // synchro, ou sa modification est antérieure à celle du cloud).
    if (sameContent(local, remote)) {
      toSettle.push({ localId: local.id, cloudUpdatedAt: remote.updated_at || null });
    } else if (remote.deleted) {
      toDelete.push(local.id);
    } else {
      toApply.push({ localId: local.id, ...cloudRowToLocal(remote) });
    }
  }

  // Équipes locales absentes du cloud (nouvelles, ou jamais poussées) : elles
  // partent vers le cloud. Celles déjà traitées ci-dessus sont exclues.
  for (const local of locals) {
    if (!Number(local.dirty)) continue;
    if (usedLocal.has(local.id)) continue;
    toPush.push(local);
  }

  return { toPush, toApply, toAdopt, toDelete, toSettle, conflicts, originId: originId || null };
}

module.exports = {
  SYNC_VERSION,
  normalizeName,
  toTimestamp,
  isAfter,
  normalizePlayers,
  samePlayers,
  sameContent,
  teamRowToCloud,
  cloudRowToLocal,
  planMerge,
};
