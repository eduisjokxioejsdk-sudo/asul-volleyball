// ============================================================================
// Hub de synchronisation cloud : orchestre toutes les collections partagées
// (équipes, trajectoires, métadonnées vidéo, actions DataVolley, attributions
// de sets, matchs en direct…). Chaque collection tourne dans sa propre boucle
// de fond, sur la même connexion Supabase (URL/clé partagées dans sync.json).
// ============================================================================

const { createSyncEngine } = require('./syncEngine');
const teams = require('./teamsSync');
const { hasActiveLiveWatchers } = require('./socket');
const {
  trajectoriesCollection,
  videosCollection,
  actionsCollection,
  eventsCollection,
  claimsCollection,
  matchesCollection,
  setupsCollection,
  liveCollection,
} = require('./syncCollections');

const trajectories = createSyncEngine(trajectoriesCollection);
const videos = createSyncEngine(videosCollection);
const actions = createSyncEngine(actionsCollection);
const events = createSyncEngine(eventsCollection);
const claims = createSyncEngine(claimsCollection);
const matches = createSyncEngine(matchesCollection);
const setups = createSyncEngine(setupsCollection);
const live = createSyncEngine(liveCollection);

const engines = { teams, trajectories, videos, actions, events, claims, matches, setups, live };

let liveWatchTimer = null;

/** Démarre les boucles de fond de toutes les collections (non bloquant). */
function startAll() {
  for (const engine of Object.values(engines)) engine.startSyncLoop();
  if (!liveWatchTimer) {
    liveWatchTimer = setInterval(() => {
      if (hasActiveLiveWatchers()) {
        live.syncNow({ reason: 'live-watch' }).catch(() => {});
      }
    }, 2500);
    if (liveWatchTimer && typeof liveWatchTimer.unref === 'function') {
      liveWatchTimer.unref();
    }
  }
}

/** Relance toutes les boucles de synchronisation après modification de sync.json. */
function restartAll() {
  for (const engine of Object.values(engines)) engine.restartSyncLoop();
}

module.exports = {
  engines,
  startAll,
  restartAll,
  teams,
  trajectories,
  videos,
  actions,
  events,
  claims,
  matches,
  setups,
  live,
};
