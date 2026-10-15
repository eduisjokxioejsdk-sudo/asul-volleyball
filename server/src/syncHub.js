// ============================================================================
// Hub de synchronisation cloud : orchestre toutes les collections partagées
// (équipes, trajectoires, et bientôt métadonnées vidéo, actions DataVolley,
// attributions de sets…). Chaque collection tourne dans sa propre boucle de
// fond, sur la même connexion Supabase (URL/clé partagées dans sync.json).
// ============================================================================

const { createSyncEngine } = require('./syncEngine');
const teams = require('./teamsSync');
const {
  trajectoriesCollection,
  videosCollection,
  actionsCollection,
  eventsCollection,
  claimsCollection,
  matchesCollection,
  setupsCollection,
} = require('./syncCollections');

const trajectories = createSyncEngine(trajectoriesCollection);
const videos = createSyncEngine(videosCollection);
const actions = createSyncEngine(actionsCollection);
const events = createSyncEngine(eventsCollection);
const claims = createSyncEngine(claimsCollection);
const matches = createSyncEngine(matchesCollection);
const setups = createSyncEngine(setupsCollection);

const engines = { teams, trajectories, videos, actions, events, claims, matches, setups };

/** Démarre les boucles de fond de toutes les collections (non bloquant). */
function startAll() {
  for (const engine of Object.values(engines)) engine.startSyncLoop();
}

module.exports = { engines, startAll, teams, trajectories, videos, actions, events, claims, matches, setups };

