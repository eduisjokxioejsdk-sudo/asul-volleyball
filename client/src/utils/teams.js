// Nom affiché lorsqu'une équipe a été supprimée mais que ses matchs ou fiches
// de trajectoire existent toujours (voir la réaffectation dans la page Équipes).
export const UNDEFINED_TEAM_NAME = 'Équipe à définir';

export function isUndefinedTeam(name) {
  return String(name || '').trim() === UNDEFINED_TEAM_NAME;
}
