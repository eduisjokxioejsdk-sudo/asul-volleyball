// ============================================================================
// Définition manuelle des équipes / clubs cloisonnés.
//
// Pour ajouter un club ou une équipe :
//   ajoutez simplement un objet dans CLUBS ci-dessous (id stable en minuscules
//   et tirets, à ne plus modifier une fois des données enregistrées).
//   Aucun code d'accès n'est demandé pour rejoindre ou changer d'espace.
// ============================================================================

const DEFAULT_CLUB_ID = 'asul';

const CLUBS = [
  {
    id: 'asul',
    name: 'ASUL Lyon',
    shortName: 'ASUL',
    description: 'Espace principal ASUL Lyon Volley',
    color: '#c8a165',
  },
  {
    id: 'club-2',
    name: 'Club 2 (exemple)',
    shortName: 'CLUB2',
    description: 'Second espace cloisonné — modifiable dans server/src/clubs.js',
    color: '#14b8a6',
  },
];

const CLUBS_BY_ID = new Map(CLUBS.map((club) => [club.id, club]));

function listClubs() {
  return CLUBS.map((club) => ({ ...club }));
}

function getClubById(id) {
  if (id == null) return null;
  const key = String(id).trim();
  const found = CLUBS_BY_ID.get(key);
  return found ? { ...found } : null;
}

function isValidClubId(id) {
  if (id == null) return false;
  return CLUBS_BY_ID.has(String(id).trim());
}

function normalizeClubId(id) {
  if (id == null) return null;
  const key = String(id).trim();
  return CLUBS_BY_ID.has(key) ? key : null;
}

module.exports = {
  DEFAULT_CLUB_ID,
  CLUBS,
  listClubs,
  getClubById,
  isValidClubId,
  normalizeClubId,
};
