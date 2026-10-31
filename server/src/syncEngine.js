// ============================================================================
// Moteur de synchronisation cloud générique (Supabase, offre gratuite).
//
// Synchronise n'importe quelle « collection » locale (équipes, trajectoires,
// actions DataVolley, attributions de sets…) vers une table Supabase, en
// réutilisant le principe éprouvé pour les équipes :
//   • la base SQLite locale reste la source de vérité (hors ligne = ok) ;
//   • chaque enregistrement porte sync_uuid / dirty / deleted /
//     local_updated_at / cloud_updated_at ;
//   • fusion last-write-wins + pierres tombales (deleted) ;
//   • la clé d'accès cloud ne sort jamais du serveur Node.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const db = require('./database');
const config = require('./config');

const DEFAULT_INTERVAL_MS = 60000;
const MIN_INTERVAL_MS = 15000;
const MAX_INTERVAL_MS = 8 * 60 * 1000;
const STARTUP_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;
const PUSH_BATCH = 50;
const PULL_PAGE = 1000;
const MAX_PULL_PAGES = 20;

// --- Helpers sqlite3 asynchrones --------------------------------------------

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });

/**
 * @param {Object} collection
 * @param {string}  collection.key             clé de la collection (ex. 'teams')
 * @param {string}  collection.name            nom affiché (logs/messages)
 * @param {string}  collection.defaultTable    table Supabase par défaut
 * @param {string}  collection.envPrefix       préfixe env (ex. TEAMS_SYNC)
 * @param {() => Promise<Array>} collection.loadLocal
 * @param {(entry) => Promise<number>} collection.applyRemote
 * @param {(localId, uuid) => Promise<void>} collection.adoptUuid
 * @param {(localId) => Promise<void>} collection.deleteLocal
 * @param {(localId, cloudUpdatedAt) => Promise<void>} collection.settleLocal
 * @param {(uuid, cloudUpdatedAt) => Promise<void>} collection.touchPushed
 * @param {({localRows, remoteRows, lastSyncAt, originId}) => Object} collection.planMerge
 * @param {(row, originId) => Object} collection.rowToCloud
 * @param {() => Promise<number>} collection.pendingCount
 * @param {() => Promise<Object>} collection.statusCounts
 * @param {(applied, removed) => void} [collection.onChanged]
 */
function createSyncEngine(collection) {
  const state = {
    running: false,
    loopStarted: false,
    timer: null,
    failureCount: 0,
    lastSyncAt: null,
    lastError: null,
    lastResult: null,
    clientId: null,
  };

  function configPath() {
    return path.join(config.dataDir, 'sync.json');
  }

  function readConfigFile() {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function normalizeUrl(url) {
    return String(url == null ? '' : url).trim().replace(/\/+$/, '');
  }

  const env = (suffix) => process.env[`${collection.envPrefix}_${suffix}`];

  function getSyncConfig() {
    const file = readConfigFile();
    const fromEnv = Boolean(env('URL') || env('KEY'));
    const url = normalizeUrl(env('URL') || file.url || '');
    const key = String(env('KEY') || file.key || '').trim();
    const configuredTable =
      (file.tables && file.tables[collection.key]) ||
      (collection.key === 'teams' ? file.table : undefined) ||
      collection.defaultTable;
    const table =
      String(env('TABLE') || configuredTable).trim() || collection.defaultTable;
    const intervalRaw = Number(env('INTERVAL_MS') || file.intervalMs) || DEFAULT_INTERVAL_MS;

    let enabled;
    const enabledEnv = env('ENABLED');
    if (enabledEnv != null && String(enabledEnv).trim() !== '') {
      enabled = !/^(0|false|non|no|off)$/i.test(String(enabledEnv).trim());
    } else {
      enabled = file.enabled !== false;
    }

    return {
      provider: 'supabase',
      url,
      key,
      table,
      configured: Boolean(url && key),
      enabled: Boolean(enabled && url && key),
      intervalMs: Math.min(Math.max(intervalRaw, MIN_INTERVAL_MS), MAX_INTERVAL_MS),
      source: fromEnv ? 'env' : Object.keys(file).length ? 'file' : 'none',
    };
  }

  function saveSyncConfig(next = {}) {
    const current = readConfigFile();
    const merged = { ...current, provider: 'supabase' };
    if (next.enabled != null) merged.enabled = Boolean(next.enabled);
    if (next.url != null) merged.url = normalizeUrl(next.url);
    if (next.table != null) {
      if (!merged.tables) merged.tables = {};
      merged.tables[collection.key] = String(next.table).trim() || collection.defaultTable;
    }
    if (next.key != null && String(next.key).trim() !== '') merged.key = String(next.key).trim();
    if (next.intervalMs != null && Number(next.intervalMs) > 0) merged.intervalMs = Number(next.intervalMs);
    merged.updatedAt = new Date().toISOString();

    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(configPath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    return getSyncConfig();
  }

  async function readStateAll() {
    const rows = await allAsync('SELECT key, value FROM sync_state', []);
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  // Clé d'état préfixée par collection : chaque collection a son propre curseur
  // et sa propre date de dernière synchronisation, sinon elles s'écraseraient
  // mutuellement (voir syncNow). `origin_id` reste partagé (identité du poste).
  function stateKey(name) {
    return `${collection.key}:${name}`;
  }

  function writeState(key, value) {
    db.run(
      `INSERT INTO sync_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value == null ? null : String(value)],
      () => {}
    );
  }

  async function ensureClientId() {
    if (state.clientId) return state.clientId;
    const stored = await getAsync("SELECT value FROM sync_state WHERE key = 'origin_id'", []);
    if (stored && stored.value) {
      state.clientId = stored.value;
      return state.clientId;
    }
    const label = `${os.hostname() || 'poste'}-${crypto.randomUUID().slice(0, 8)}`;
    await runAsync(
      `INSERT INTO sync_state (key, value) VALUES ('origin_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [label]
    );
    state.clientId = label;
    return label;
  }

  // --- Accès Supabase (PostgREST — fetch natif, aucune dépendance) -----------

  /** Hôte affiché dans les messages (l'URL peut être incomplète). */
  function hostOf(cfg) {
    try {
      return new URL(cfg.url).host || String(cfg.url);
    } catch (err) {
      return String(cfg.url || 'Supabase');
    }
  }

  /**
   * Le fetch natif de Node ne remonte qu'un laconique « fetch failed » : la
   * cause réelle (DNS, connexion refusée, certificat, délai dépassé) se cache
   * dans err.cause. On la traduit en une phrase actionnable pour l'utilisateur,
   * au lieu de laisser « fetch failed » seul dans l'écran Trajectoires.
   */
  function networkError(err, cfg) {
    const host = hostOf(cfg);
    const cause = err && err.cause ? err.cause : null;
    const code = String((cause && (cause.code || cause.errno)) || (err && err.code) || '').trim();
    const causeName = (cause && cause.name) || (err && err.name) || '';
    const seconds = Math.round(REQUEST_TIMEOUT_MS / 1000);

    const wrapped = new Error(''); // le message est posé ci-dessous
    wrapped.cause = err;

    if (causeName === 'AbortError' || code === 'ABORT_ERR' || /aborted/i.test(String((err && err.message) || ''))) {
      wrapped.message =
        `Serveur Supabase injoignable : ${host} n'a pas répondu en ${seconds} s. ` +
        'Vérifiez la connexion Internet puis réessayez.';
      return wrapped;
    }

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NONAME') {
      wrapped.message =
        `Adresse Supabase introuvable : « ${host} » ne répond pas au DNS (${code}). ` +
        "Le projet a peut-être été supprimé, mis en pause ou renommé : saisissez l'URL du projet en cours " +
        "dans l'onglet Équipes.";
      return wrapped;
    }

    if (code === 'ECONNREFUSED') {
      wrapped.message =
        `Connexion refusée par ${host} : vérifiez l'URL du projet dans l'onglet Équipes, ` +
        'ainsi que le réseau (pare-feu, proxy).';
      return wrapped;
    }

    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
      wrapped.message =
        `Connexion interrompue avec ${host} (${code}) : vérifiez le réseau puis réessayez.`;
      return wrapped;
    }

    if (/CERT_|certificate|self.signed/i.test(code) || /certificate/i.test(String((cause && cause.message) || ''))) {
      wrapped.message =
        `Certificat HTTPS refusé pour ${host} : un antivirus ou un proxy intercepte la connexion. ` +
        "Autorisez ASUL dans cet outil, puis réessayez.";
      return wrapped;
    }

    const detail = (cause && cause.message) || (err && err.message) || 'erreur inconnue';
    wrapped.message =
      `Échec de la connexion à ${host} (${code || detail}). ` +
      "Vérifiez la connexion Internet et l'URL du projet dans l'onglet Équipes.";
    return wrapped;
  }

  async function supabaseRequest(cfg, query, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    let text;
    try {
      response = await fetch(`${cfg.url}/rest/v1/${query}`, {
        method: options.method || 'GET',
        body: options.body,
        signal: controller.signal,
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      text = await response.text();
    } catch (err) {
      // Réseau / DNS / certificat / délai : message explicite plutôt que
      // « fetch failed » (voir networkError).
      throw networkError(err, cfg);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Supabase ${response.status} : ${(text || '').slice(0, 200)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Réponse Supabase illisible (table ${cfg.table}).`);
    }
  }

  function pullQuery(cfg, cursor) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'updated_at.asc');
    params.set('limit', String(PULL_PAGE));
    if (cursor) params.set('updated_at', `gt.${cursor}`);
    return `${cfg.table}?${params.toString()}`;
  }

  async function pullAll(cfg, cursor) {
    const rows = [];
    let from = cursor || null;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const batch = await supabaseRequest(cfg, pullQuery(cfg, from));
      if (!Array.isArray(batch) || batch.length === 0) break;
      rows.push(...batch);
      if (batch.length < PULL_PAGE) break;
      const last = batch[batch.length - 1];
      if (!last.updated_at || last.updated_at === from) break;
      from = last.updated_at;
    }
    return rows;
  }

  async function pushRows(cfg, rows) {
    const saved = [];
    for (let index = 0; index < rows.length; index += PUSH_BATCH) {
      const batch = rows.slice(index, index + PUSH_BATCH);
      const payload = await supabaseRequest(cfg, `${cfg.table}?on_conflict=sync_uuid`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch),
      });
      if (Array.isArray(payload)) saved.push(...payload);
    }
    return saved;
  }

  async function testConnection(cfg = getSyncConfig()) {
    if (!cfg.configured) throw new Error('URL ou clé Supabase manquante');
    await supabaseRequest(cfg, `${cfg.table}?select=sync_uuid&limit=1`);
    return true;
  }

  async function syncNow(options = {}) {
    const cfg = getSyncConfig();
    if (!cfg.enabled) return { ok: false, skipped: true, reason: 'disabled' };
    if (state.running) return { ok: false, skipped: true, reason: 'busy' };

    state.running = true;
    const startedAt = new Date().toISOString();
    try {
      const originId = await ensureClientId();
      const previous = await readStateAll();
      const cursor = previous[stateKey('cursor')] || null;
      const lastSyncAt = previous[stateKey('last_sync_at')] || null;

      const remoteRows = await pullAll(cfg, cursor);
      const localRows = await collection.loadLocal();
      const plan = collection.planMerge({ localRows, remoteRows, lastSyncAt, originId });

      for (const adopt of plan.toAdopt || []) {
        await collection.adoptUuid(adopt.localId, adopt.uuid);
      }

      let applied = 0;
      let removed = 0;
      for (const entry of plan.toApply) {
        await collection.applyRemote(entry);
        if (entry.deleted) removed += 1;
        else applied += 1;
      }
      for (const localId of plan.toDelete) {
        await collection.deleteLocal(localId);
        removed += 1;
      }
      for (const settle of plan.toSettle) {
        await collection.settleLocal(settle.localId, settle.cloudUpdatedAt);
      }

      let pushed = 0;
      const pushedTimestamps = [];
      if (plan.toPush.length) {
        const payload = [];
        for (const row of plan.toPush) {
          if (!row.sync_uuid) {
            row.sync_uuid = crypto.randomUUID();
            await collection.adoptUuid(row.id, row.sync_uuid);
          }
          payload.push(collection.rowToCloud(row, originId));
        }
        const saved = await pushRows(cfg, payload);
        const byUuid = new Map((saved || []).map((r) => [String(r.sync_uuid), r]));
        for (const row of payload) {
          const echo = byUuid.get(String(row.sync_uuid));
          const cloudUpdatedAt = (echo && echo.updated_at) || new Date().toISOString();
          if (echo && echo.updated_at) pushedTimestamps.push(echo.updated_at);
          await collection.touchPushed(row.sync_uuid, cloudUpdatedAt);
          pushed += 1;
        }
      }

      let nextCursor = cursor || null;
      for (const stamp of [...remoteRows.map((row) => row.updated_at), ...pushedTimestamps]) {
        if (stamp && (!nextCursor || stamp > nextCursor)) nextCursor = stamp;
      }

      const result = {
        ok: true,
        reason: options.reason || 'manual',
        pulled: remoteRows.length,
        applied,
        removed,
        pushed,
        settled: plan.toSettle.length,
        conflicts: plan.conflicts.length,
        at: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      };

      writeState(stateKey('cursor'), nextCursor);
      writeState(stateKey('last_sync_at'), result.at);
      writeState(stateKey('last_error'), '');
      writeState(stateKey('last_result'), JSON.stringify(result));
      if (plan.conflicts.length) {
        console.warn(
          `${collection.name} : ${plan.conflicts.length} conflit(s) résolu(s) en faveur de ce poste.`
        );
      }

      state.failureCount = 0;
      state.lastError = null;
      state.lastSyncAt = result.at;
      state.lastResult = result;

      if (collection.onChanged) collection.onChanged(applied, removed);
      return result;
    } catch (err) {
      state.failureCount += 1;
      state.lastError = err.message;
      writeState(stateKey('last_error'), err.message);
      console.warn(
        `${collection.name} : synchronisation cloud impossible (${err.message}) — travail local inchangé.`
      );
      return { ok: false, error: err.message, reason: options.reason || 'manual', at: new Date().toISOString() };
    } finally {
      state.running = false;
    }
  }

  function nextDelay(cfg) {
    if (state.failureCount === 0) return cfg.intervalMs;
    return Math.min(cfg.intervalMs * 2 ** Math.min(state.failureCount, 4), MAX_INTERVAL_MS);
  }

  function schedule(delayMs) {
    if (!state.loopStarted) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      await syncNow({ reason: 'loop' });
      schedule(nextDelay(getSyncConfig()));
    }, delayMs);
    if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
  }

  function startSyncLoop() {
    if (state.loopStarted) return false;
    state.loopStarted = true;
    const cfg = getSyncConfig();
    if (!cfg.enabled) {
      console.log(
        cfg.configured
          ? `${collection.name} : synchronisation cloud désactivée (${collection.envPrefix}_ENABLED ou sync.json).`
          : `${collection.name} : synchronisation cloud désactivée — à renseigner dans l'interface (ou ${collection.envPrefix}_URL / ${collection.envPrefix}_KEY).`
      );
      return false;
    }
    console.log(
      `${collection.name} : synchronisation cloud activée (${cfg.provider}, ${cfg.url}, toutes les ${Math.round(
        cfg.intervalMs / 1000
      )} s)`
    );
    schedule(STARTUP_DELAY_MS);
    return true;
  }

  function restartSyncLoop() {
    state.loopStarted = false;
    state.failureCount = 0;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    return startSyncLoop();
  }

  function parseLastResult(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  async function getSyncStatus() {
    const cfg = getSyncConfig();
    const stored = await readStateAll();
    const pending = await collection.pendingCount();
    const counts = await collection.statusCounts();
    const storedError = stored[stateKey('last_error')] || null;
    return {
      configured: cfg.configured,
      enabled: cfg.enabled,
      provider: cfg.provider,
      url: cfg.url,
      hasKey: Boolean(cfg.key),
      table: cfg.table,
      intervalMs: cfg.intervalMs,
      source: cfg.source,
      configPath: configPath(),
      running: state.running,
      lastSyncAt: stored[stateKey('last_sync_at')] || null,
      // Les versions précédentes enregistraient le message brut de Node
      // (« fetch failed ») : on le rend lisible sans attendre le prochain essai.
      lastError:
        storedError === 'fetch failed'
          ? `Échec de la connexion à ${hostOf(cfg)} : vérifiez la connexion Internet et l'URL du projet dans l'onglet Équipes.`
          : storedError,
      lastResult: parseLastResult(stored[stateKey('last_result')]),
      pending,
      ...counts,
    };
  }

  return {
    startSyncLoop,
    restartSyncLoop,
    syncNow,
    getSyncStatus,
    getSyncConfig,
    saveSyncConfig,
    testConnection,
    configPath,
  };
}

module.exports = { createSyncEngine };
