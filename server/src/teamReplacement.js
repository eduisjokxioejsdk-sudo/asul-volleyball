const crypto = require('crypto');
const db = require('./database');

// Nom affiché partout où l'équipe d'un match a été supprimée. Les identifiants
// (et UUID) sont conservés pour pouvoir réaffecter les données plus tard.
const UNDEFINED_TEAM_NAME = 'Équipe à définir';

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mappedNumber(numberMap, value) {
  const n = numberOrNull(value);
  if (!n) return null;
  const target = Object.prototype.hasOwnProperty.call(numberMap || {}, String(n))
    ? numberOrNull(numberMap[String(n)])
    : null;
  return target || n;
}

// Le numéro de joueur est encodé juste après la clé d'équipe dans un code
// DataVolley (`*07S...` / `a12R...`). On ne remplace que ce premier numéro :
// les parties combinées peuvent concerner un autre joueur.
function remapCodePlayer(code, oldNumber, newNumber) {
  if (!code || Number(oldNumber) === Number(newNumber)) return code;
  const match = String(code).match(/^([*a])(\d{1,2})/);
  if (!match || Number(match[2]) !== Number(oldNumber)) return code;
  return `${match[1]}${String(newNumber).padStart(2, '0')}${String(code).slice(match[0].length)}`;
}

// Remplace les numéros dans le six de départ enregistré (set_setups).
function remapSavedLineup(parsed, numberMap) {
  if (!parsed || typeof parsed !== 'object') return { value: parsed, changed: false };
  const clone = JSON.parse(JSON.stringify(parsed));
  let changed = false;
  const map = (value) => {
    const n = numberOrNull(value);
    if (!n) return value;
    const next = mappedNumber(numberMap, n);
    if (next !== n) changed = true;
    return next;
  };
  const lineup = clone.start && typeof clone.start === 'object' ? clone.start : clone;
  Object.keys(lineup).forEach((key) => {
    if (/^P[1-6]$/i.test(key) || key === 'setter' || key === 'libero' || key === 'liberoFor') {
      lineup[key] = map(lineup[key]);
    }
  });
  if (Array.isArray(clone.roster)) {
    clone.roster = clone.roster.map((p) => {
      if (!p || typeof p !== 'object') return p;
      const number = map(p.number);
      return { ...p, number };
    });
  }
  if (clone.libero != null) clone.libero = map(clone.libero);
  if (clone.liberoFor != null) clone.liberoFor = map(clone.liberoFor);
  return { value: clone, changed };
}

async function loadTeam(teamId) {
  return get('SELECT * FROM teams WHERE id = ?', [teamId]);
}

async function loadPlayers(teamId) {
  return all('SELECT * FROM team_players WHERE team_id = ? ORDER BY number ASC, id ASC', [teamId]);
}

// Supprime logiquement une équipe : toutes ses apparitions deviennent
// « Équipe à définir », sans toucher aux actions ni aux trajectoires.
async function markTeamReferencesUndefined(teamId) {
  const now = new Date().toISOString();
  const v1 = await run(
    'UPDATE videos SET team1_name = ?, dirty = 1, local_updated_at = ? WHERE home_team_id = ?',
    [UNDEFINED_TEAM_NAME, now, teamId]
  );
  const v2 = await run(
    'UPDATE videos SET team2_name = ?, dirty = 1, local_updated_at = ? WHERE away_team_id = ?',
    [UNDEFINED_TEAM_NAME, now, teamId]
  );
  const t1 = await run(
    'UPDATE trajectory_matches SET team1_name = ?, dirty = 1, local_updated_at = ? WHERE home_team_id = ?',
    [UNDEFINED_TEAM_NAME, now, teamId]
  );
  const t2 = await run(
    'UPDATE trajectory_matches SET team2_name = ?, dirty = 1, local_updated_at = ? WHERE away_team_id = ?',
    [UNDEFINED_TEAM_NAME, now, teamId]
  );

  return {
    videos: Number(v1.changes || 0) + Number(v2.changes || 0),
    trajectories: Number(t1.changes || 0) + Number(t2.changes || 0),
    liveSessions: 0,
  };
}
async function deletedTeamsWithUsage() {
  const rows = await all(
    `SELECT t.id, t.name, t.created_at,
            (SELECT COUNT(*) FROM videos v
              WHERE COALESCE(v.deleted, 0) = 0
                AND (v.home_team_id = t.id OR v.away_team_id = t.id)) AS video_count,
            (SELECT COUNT(*) FROM trajectory_matches m
              WHERE COALESCE(m.deleted, 0) = 0
                AND (m.home_team_id = t.id OR m.away_team_id = t.id)) AS trajectory_count
       FROM teams t
      WHERE COALESCE(t.deleted, 0) = 1
      ORDER BY t.name COLLATE NOCASE ASC`
  );
  return rows.map((r) => ({
    ...r,
    live_count: 0,
    total_count: Number(r.video_count || 0) + Number(r.trajectory_count || 0),
  }));
}

async function affectedMatches(teamId) {
  const videos = await all(
    `SELECT id, display_name, original_name, team1_name, team2_name,
            home_team_id, away_team_id,
            CASE WHEN home_team_id = ? THEN 'home' ELSE 'away' END AS side
       FROM videos
      WHERE COALESCE(deleted, 0) = 0
        AND (home_team_id = ? OR away_team_id = ?)
      ORDER BY id ASC`,
    [teamId, teamId, teamId]
  );
  const trajectories = await all(
    `SELECT id, name, team1_name, team2_name, home_team_id, away_team_id,
            CASE WHEN home_team_id = ? THEN 'home' ELSE 'away' END AS side
       FROM trajectory_matches
      WHERE COALESCE(deleted, 0) = 0
        AND (home_team_id = ? OR away_team_id = ?)
      ORDER BY id ASC`,
    [teamId, teamId, teamId]
  );
  const liveSessions = [];
  return { videos, trajectories, liveSessions };
}


async function usageByNumber(matches) {
  const usage = new Map();
  const add = (number, field) => {
    const n = numberOrNull(number);
    if (!n) return;
    const row = usage.get(n) || { number: n, actions: 0, shots: 0, lineups: 0 };
    row[field] += 1;
    usage.set(n, row);
  };

  for (const video of matches.videos) {
    const actions = await all(
      `SELECT player_number FROM volley_actions
        WHERE video_id = ? AND team = ? AND COALESCE(deleted, 0) = 0`,
      [video.id, video.side]
    );
    actions.forEach((a) => add(a.player_number, 'actions'));

    const setups = await all('SELECT * FROM set_setups WHERE match_key = ?', [`video:${video.id}`]);
    for (const setup of setups) {
      const parsed = parseJson(video.side === 'home' ? setup.home_lineup : setup.away_lineup);
      if (!parsed) continue;
      const lineup = parsed.start && typeof parsed.start === 'object' ? parsed.start : parsed;
      Object.keys(lineup || {}).forEach((key) => {
        if (/^P[1-6]$/i.test(key) || key === 'libero' || key === 'liberoFor') add(lineup[key], 'lineups');
      });
      if (parsed.libero != null) add(parsed.libero, 'lineups');
      if (parsed.liberoFor != null) add(parsed.liberoFor, 'lineups');
      const setter = video.side === 'home' ? setup.home_setter : setup.away_setter;
      if (setter != null) add(setter, 'lineups');
    }
  }

  for (const match of matches.trajectories) {
    const shots = await all(
      'SELECT player_number FROM trajectory_shots WHERE match_id = ? AND team_side = ?',
      [match.id, match.side]
    );
    shots.forEach((s) => add(s.player_number, 'shots'));
  }

  return usage;
}

async function getReplacementPreview(teamId) {
  const team = await loadTeam(teamId);
  if (!team) return null;
  const players = await loadPlayers(teamId);
  const matches = await affectedMatches(teamId);
  const usage = await usageByNumber(matches);
  const byNumber = new Map(players.map((p) => [Number(p.number), p]));
  const numbers = [...usage.values()]
    .sort((a, b) => a.number - b.number)
    .map((row) => ({
      ...row,
      name: byNumber.get(row.number)?.name || `N°${row.number}`,
      role: byNumber.get(row.number)?.role || 'universal',
    }));

  return {
    team: { ...team, players },
    numbers,
    videos: matches.videos,
    trajectories: matches.trajectories,
    liveSessions: matches.liveSessions,
  };
}


// Réaffecte toutes les références de l'équipe `oldTeamId` (supprimée) vers
// `targetTeamId`, en appliquant la correspondance des numéros aux actions, aux
// tirs de trajectoire, aux six de départ et aux remplacements.
async function replaceTeamReferences(oldTeamId, targetTeamId, options = {}) {
  const oldTeam = await loadTeam(oldTeamId);
  const targetTeam = await loadTeam(targetTeamId);
  if (!oldTeam || Number(oldTeam.deleted) !== 1) {
    const err = new Error('Équipe supprimée introuvable.');
    err.status = 404;
    throw err;
  }
  if (!targetTeam || Number(targetTeam.deleted) === 1) {
    const err = new Error('Équipe de remplacement introuvable.');
    err.status = 404;
    throw err;
  }
  if (Number(oldTeamId) === Number(targetTeamId)) {
    const err = new Error('Choisissez une autre équipe que l’équipe supprimée.');
    err.status = 400;
    throw err;
  }
  let targetUuid = targetTeam.sync_uuid;
  if (!targetUuid) {
    targetUuid = crypto.randomUUID();
    await run('UPDATE teams SET sync_uuid = ?, dirty = 1, local_updated_at = ? WHERE id = ?', [
      targetUuid,
      new Date().toISOString(),
      targetTeamId,
    ]);
  }

  const numberMap = {};
  Object.entries(options.number_map || {}).forEach(([from, to]) => {
    const a = numberOrNull(from);
    const b = numberOrNull(to);
    if (a && b) numberMap[String(a)] = String(b);
  });

  const matches = await affectedMatches(oldTeamId);
  if (!matches.videos.length && !matches.trajectories.length && !matches.liveSessions.length) {
    const err = new Error('Aucun match ni fiche de trajectoire à réaffecter.');
    err.status = 400;
    throw err;
  }

  const conflicts = [];
  for (const video of matches.videos) {
    const other = Number(video.side === 'home' ? video.away_team_id : video.home_team_id);
    if (other === Number(targetTeamId)) {
      conflicts.push({
        kind: 'video',
        id: video.id,
        label: video.display_name || video.original_name || `Vidéo ${video.id}`,
      });
    }
  }
  for (const match of matches.trajectories) {
    const other = Number(match.side === 'home' ? match.away_team_id : match.home_team_id);
    if (other === Number(targetTeamId)) {
      conflicts.push({ kind: 'trajectory', id: match.id, label: match.name || `Fiche ${match.id}` });
    }
  }
  if (conflicts.length) {
    const err = new Error(
      `Impossible de réaffecter vers « ${targetTeam.name} » : cette équipe est déjà l’adversaire dans ${conflicts.length} rencontre(s).`
    );
    err.status = 409;
    err.details = { conflicts };
    throw err;
  }

  const targetPlayers = await loadPlayers(targetTeamId);
  const targetNumbers = new Set(targetPlayers.map((p) => Number(p.number)));
  const toCreate = [];
  for (const raw of options.create_players || []) {
    const number = numberOrNull(raw && raw.number);
    if (!number) continue;
    if (targetNumbers.has(number)) continue;
    if (toCreate.some((p) => p.number === number)) continue;
    toCreate.push({
      number,
      name: String((raw && raw.name) || '').trim() || `N°${number}`,
      role: (raw && raw.role) || 'universal',
    });
    targetNumbers.add(number);
  }
  const allTargetPlayers = [...targetPlayers, ...toCreate];
  const usage = await usageByNumber(matches);
  const missing = [];
  for (const [oldNumber] of usage.entries()) {
    const newNumber = mappedNumber(numberMap, oldNumber);
    if (!targetNumbers.has(Number(newNumber))) {
      missing.push({ number: oldNumber, target: newNumber });
    }
  }
  if (missing.length) {
    const err = new Error(
      `Certains numéros n’existent pas dans « ${targetTeam.name} ». Choisissez un autre numéro ou créez le joueur.`
    );
    err.status = 400;
    err.details = { missing };
    throw err;
  }

  const now = new Date().toISOString();
  let actionsUpdated = 0;
  let shotsUpdated = 0;
  let lineupsUpdated = 0;
  let eventsUpdated = 0;


  await run('BEGIN');
  try {
    for (const p of toCreate) {
      await run(
        'INSERT INTO team_players (team_id, number, name, role, is_libero, active) VALUES (?, ?, ?, ?, ?, 1)',
        [targetTeamId, p.number, p.name, p.role, p.role === 'libero' ? 1 : 0]
      );
    }
    if (toCreate.length) {
      await run('UPDATE teams SET dirty = 1, local_updated_at = ? WHERE id = ?', [now, targetTeamId]);
    }

    for (const video of matches.videos) {
      if (video.side === 'home') {
        await run(
          `UPDATE videos SET home_team_id = ?, home_team_uuid = ?, team1_name = ?,
                  dirty = 1, local_updated_at = ? WHERE id = ?`,
          [targetTeamId, targetUuid, targetTeam.name, now, video.id]
        );
      } else {
        await run(
          `UPDATE videos SET away_team_id = ?, away_team_uuid = ?, team2_name = ?,
                  dirty = 1, local_updated_at = ? WHERE id = ?`,
          [targetTeamId, targetUuid, targetTeam.name, now, video.id]
        );
      }

      const actions = await all(
        `SELECT id, code, player_number FROM volley_actions
          WHERE video_id = ? AND team = ? AND COALESCE(deleted, 0) = 0`,
        [video.id, video.side]
      );
      for (const action of actions) {
        const oldNumber = numberOrNull(action.player_number);
        if (!oldNumber) continue;
        const newNumber = mappedNumber(numberMap, oldNumber);
        if (newNumber === oldNumber) continue;
        await run(
          'UPDATE volley_actions SET player_number = ?, code = ?, dirty = 1, local_updated_at = ? WHERE id = ?',
          [newNumber, remapCodePlayer(action.code, oldNumber, newNumber), now, action.id]
        );
        actionsUpdated += 1;
      }

      const setups = await all('SELECT * FROM set_setups WHERE match_key = ?', [`video:${video.id}`]);
      for (const setup of setups) {
        const column = video.side === 'home' ? 'home_lineup' : 'away_lineup';
        const setterColumn = video.side === 'home' ? 'home_setter' : 'away_setter';
        const parsed = parseJson(setup[column]);
        const remapped = remapSavedLineup(parsed, numberMap);
        let lineupChanged = remapped.changed;
        if (remapped.value && Array.isArray(remapped.value.roster)) {
          remapped.value.roster = remapped.value.roster.map((p) => {
            const target = allTargetPlayers.find((x) => Number(x.number) === Number(p.number));
            if (!target) return p;
            if (target.name && target.name !== p.name) lineupChanged = true;
            return { ...p, name: target.name || p.name, role: target.role || p.role };
          });
        }
        const oldSetter = numberOrNull(setup[setterColumn]);
        const newSetter = oldSetter ? mappedNumber(numberMap, oldSetter) : null;
        if (lineupChanged || newSetter !== oldSetter) {
          await run(
            `UPDATE set_setups SET ${column} = ?, ${setterColumn} = ?, dirty = 1, local_updated_at = ? WHERE id = ?`,
            [remapped.value ? JSON.stringify(remapped.value) : setup[column], newSetter, now, setup.id]
          );
          lineupsUpdated += 1;
        }
      }

      const events = await all('SELECT id, payload FROM volley_events WHERE video_id = ? AND team = ?', [
        video.id,
        video.side,
      ]);
      for (const event of events) {
        const payload = parseJson(event.payload);
        if (!payload || typeof payload !== 'object') continue;
        let changed = false;
        for (const key of ['out', 'in']) {
          if (payload[key] == null) continue;
          const oldNumber = numberOrNull(payload[key]);
          if (!oldNumber) continue;
          const newNumber = mappedNumber(numberMap, oldNumber);
          if (newNumber !== oldNumber) {
            payload[key] = newNumber;
            changed = true;
          }
        }
        if (changed) {
          await run('UPDATE volley_events SET payload = ? WHERE id = ?', [JSON.stringify(payload), event.id]);
          eventsUpdated += 1;
        }
      }
    }


    for (const match of matches.trajectories) {
      if (match.side === 'home') {
        await run(
          `UPDATE trajectory_matches SET home_team_id = ?, home_team_uuid = ?, team1_name = ?,
                  dirty = 1, local_updated_at = ? WHERE id = ?`,
          [targetTeamId, targetUuid, targetTeam.name, now, match.id]
        );
      } else {
        await run(
          `UPDATE trajectory_matches SET away_team_id = ?, away_team_uuid = ?, team2_name = ?,
                  dirty = 1, local_updated_at = ? WHERE id = ?`,
          [targetTeamId, targetUuid, targetTeam.name, now, match.id]
        );
      }
      const shots = await all(
        'SELECT id, player_number FROM trajectory_shots WHERE match_id = ? AND team_side = ?',
        [match.id, match.side]
      );
      for (const shot of shots) {
        const oldNumber = numberOrNull(shot.player_number);
        if (!oldNumber) continue;
        const newNumber = mappedNumber(numberMap, oldNumber);
        if (newNumber === oldNumber) continue;
        await run('UPDATE trajectory_shots SET player_number = ? WHERE id = ?', [newNumber, shot.id]);
        shotsUpdated += 1;
      }
    }

    await run('UPDATE volley_matches SET home_team_id = ?, home_team_uuid = ? WHERE home_team_id = ?', [
      targetTeamId,
      targetUuid,
      oldTeamId,
    ]);
    await run('UPDATE volley_matches SET away_team_id = ?, away_team_uuid = ? WHERE away_team_id = ?', [
      targetTeamId,
      targetUuid,
      oldTeamId,
    ]);

    // Les sessions live actives et les séances d'entraînement ne sont pas
    // remappées : elles gardent leur équipe d'origine pour ne pas altérer un
    // codage ou une séance en cours.
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }

  return {
    targetTeam,
    videosUpdated: matches.videos.length,
    trajectoriesUpdated: matches.trajectories.length,
    actionsUpdated,
    shotsUpdated,
    lineupsUpdated,
    eventsUpdated,
    playersCreated: toCreate.length,
  };
}

module.exports = {
  UNDEFINED_TEAM_NAME,
  markTeamReferencesUndefined,
  deletedTeamsWithUsage,
  getReplacementPreview,
  replaceTeamReferences,
  remapCodePlayer,
  remapSavedLineup,
};

