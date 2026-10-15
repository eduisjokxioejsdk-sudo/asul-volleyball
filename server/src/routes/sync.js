// ============================================================================
// Endpoints de synchronisation cloud génériques (partagés par toutes les
// collections : trajectoires, vidéos, codage DataVolley…). Ils réutilisent le
// moteur commun server/src/syncEngine.js, exactement comme routes/teams.js le
// fait déjà pour les équipes.
// ============================================================================

const { authenticateToken } = require('../middleware/auth');

/**
 * Monte sur un routeur Express les trois routes de partage à distance :
 *   POST /sync        — synchronise immédiatement ;
 *   GET  /sync/status — état (configuré, activé, dernier passage, erreur…) ;
 *   PUT  /sync/config — enregistre la configuration (URL/clé partagées).
 *
 * L'URL et la clé Supabase étant partagées entre toutes les collections, la
 * configuration est commune ; seule la table change (file.tables[collection.key]).
 */
function mountSyncRoutes(router, engine) {
  // Synchronise immédiatement (bouton « Synchroniser maintenant »).
  router.post('/sync', authenticateToken, async (req, res) => {
    try {
      const result = await engine.syncNow({ reason: 'manual' });
      const status = await engine.getSyncStatus();
      res.json({ result, status });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // État de la synchronisation cloud.
  router.get('/sync/status', authenticateToken, async (req, res) => {
    try {
      res.json(await engine.getSyncStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Enregistre la configuration cloud (URL + clé Supabase) puis relance la boucle.
  router.put('/sync/config', authenticateToken, async (req, res) => {
    const { enabled, url, key, table } = req.body || {};
    const cleanUrl = url == null ? null : String(url).trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      return res.status(400).json({ error: 'L’URL doit commencer par https://' });
    }
    try {
      engine.saveSyncConfig({ enabled, url: cleanUrl, key, table });
      engine.restartSyncLoop();

      const cfg = engine.getSyncConfig();
      let check = { ok: false, error: null };
      if (cfg.enabled) {
        try {
          await engine.testConnection(cfg);
          check = { ok: true, error: null };
        } catch (err) {
          check = { ok: false, error: err.message };
        }
      }
      res.json({
        config: {
          configured: cfg.configured,
          enabled: cfg.enabled,
          url: cfg.url,
          hasKey: Boolean(cfg.key),
          table: cfg.table,
        },
        check,
        status: await engine.getSyncStatus(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { mountSyncRoutes };
