// ============================================================================
// Versions de l'application et journal des mises à jour.
//
// L'interface compare SA version (client/public/version.json, livrée avec elle)
// à la version annoncée par le serveur (GET /api/system/version) : si le serveur
// est plus récent, l'interface est en retard → « Mise à jour nécessaire » et
// description des nouveautés.
//
// Toutes les fonctions sont pures (testables hors navigateur).
// ============================================================================

/** Version normalisée « x.y.z » à partir d'une chaîne quelconque. */
export function normalizeVersion(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function parseVersion(value) {
  const normalized = normalizeVersion(value);
  if (!normalized) return null;
  const [major, minor, patch] = normalized.split('.').map(Number);
  return { major, minor, patch, value: normalized };
}

/**
 * Comparaison de versions : -1 (a plus ancienne), 0 (identiques), 1 (a plus
 * récente). Une version illisible est traitée comme absente (la plus ancienne).
 */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va && !vb) return 0;
  if (!va) return -1;
  if (!vb) return 1;
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  return 0;
}

/** Entrées du journal plus récentes que la version donnée (plus récente d'abord). */
export function changelogSince(fromVersion, notes) {
  const list = (notes || []).filter((note) => note && note.version);
  const from = normalizeVersion(fromVersion);
  if (!from) return [...list];
  return list.filter((note) => compareVersions(note.version, from) > 0);
}

/**
 * Nouveautés à présenter à cet appareil : celles publiées depuis la dernière
 * version qu'il a vue, ou seulement la version courante s'il n'a jamais rien vu.
 */
export function whatsNewNotes({ seenVersion, currentVersion, notes }) {
  const list = (notes || []).filter((note) => note && note.version);
  const seen = normalizeVersion(seenVersion);
  if (seen) return changelogSince(seen, list);
  const current = normalizeVersion(currentVersion);
  if (!current) return [...list];
  return list.filter((note) => normalizeVersion(note.version) === current);
}

/** Date d'une entrée de journal, en français. */
export function formatNoteDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * État de mise à jour de l'interface.
 * @returns {{ready:boolean, outdated:boolean, clientVersion:string|null,
 *            serverVersion:string|null, downloadUrl:string|null,
 *            latestTitle:string|null, missing:Array}}
 */
export function updateState({ clientVersion, serverVersion, downloadUrl = null, notes = [] }) {
  const client = normalizeVersion(clientVersion);
  const server = normalizeVersion(serverVersion);
  if (!client || !server) {
    return {
      ready: false,
      outdated: false,
      clientVersion: client,
      serverVersion: server,
      downloadUrl,
      latestTitle: null,
      missing: [],
    };
  }
  const outdated = compareVersions(server, client) > 0;
  return {
    ready: true,
    outdated,
    clientVersion: client,
    serverVersion: server,
    downloadUrl,
    // Titre de la mise à jour en tête de journal (celui de la version publiée).
    latestTitle: (notes || []).filter((note) => note && note.version)[0]?.title || null,
    missing: outdated ? changelogSince(client, notes) : [],
  };
}
