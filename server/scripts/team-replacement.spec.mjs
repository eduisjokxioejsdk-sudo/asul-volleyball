import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-team-replace-'));
process.env.DATA_DIR = dataDir;

const db = require('../src/database.js');
const {
  UNDEFINED_TEAM_NAME,
  markTeamReferencesUndefined,
  deletedTeamsWithUsage,
  getReplacementPreview,
  replaceTeamReferences,
  remapCodePlayer,
  remapSavedLineup,
} = require('../src/teamReplacement.js');

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

await new Promise((resolve) => db.waitReady(resolve));

// Unités de remap.
assert.equal(remapCodePlayer('*12S#', 12, 9), '*09S#');
assert.equal(remapCodePlayer('a07R+', 7, 7), 'a07R+');
const lineup = remapSavedLineup(
  { start: { P1: 1, P2: 7, P3: 12 }, roster: [{ number: 12, name: 'Cara' }], libero: 12 },
  { 12: '9' }
);
assert.equal(lineup.value.start.P3, 9);
assert.equal(lineup.value.libero, 9);
assert.equal(lineup.value.roster[0].number, 9);

// Données de test : ancienne équipe #1, #7, #12, #15 ; cible #1, #7, #9.
const oldTeam = await run(
  "INSERT INTO teams (name, sync_uuid, deleted) VALUES ('ASUL bis', 'old-team-uuid', 0)"
);
const targetTeam = await run(
  "INSERT INTO teams (name, sync_uuid, deleted) VALUES ('ASUL', 'target-team-uuid', 0)"
);
const oldTeamId = oldTeam.lastID;
const targetTeamId = targetTeam.lastID;

for (const p of [
  [1, 'Alice'],
  [7, 'Bob'],
  [12, 'Cara'],
  [15, 'Dora'],
]) {
  await run("INSERT INTO team_players (team_id, number, name, role) VALUES (?, ?, ?, 'universal')", [
    oldTeamId,
    ...p,
  ]);
}
for (const p of [
  [1, 'Alice cible'],
  [7, 'Bob cible'],
  [9, 'Eve'],
]) {
  await run("INSERT INTO team_players (team_id, number, name, role) VALUES (?, ?, ?, 'universal')", [
    targetTeamId,
    ...p,
  ]);
}

const video = await run(
  `INSERT INTO videos
     (user_id, filename, original_name, filepath, youtube_url, team1_name, team2_name,
      home_team_id, away_team_id, home_team_uuid, away_team_uuid)
   VALUES (1, 'match.mp4', 'Match test', 'match.mp4', 'https://youtu.be/abc', 'ASUL bis', 'Adversaire',
           ?, NULL, 'old-team-uuid', NULL)`,
  [oldTeamId]
);
const videoId = video.lastID;
for (const action of [
  [1, '*01S#', 'home', 1, 'S', '#'],
  [2, '*12A#', 'home', 12, 'A', '#'],
  [3, '*15A#', 'home', 15, 'A', '#'],
  [4, 'a05R#', 'away', 5, 'R', '#'],
]) {
  await run(
    `INSERT INTO volley_actions
       (video_id, action_index, code, team, player_number, action, evaluation)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [videoId, ...action]
  );
}
await run(
  `INSERT INTO set_setups
     (match_key, set_number, home_lineup, home_setter, away_lineup)
   VALUES (?, 1, ?, 7, NULL)`,
  [
    `video:${videoId}`,
    JSON.stringify({
      start: { P1: 1, P2: 7, P3: 12, P4: 15, P5: 0, P6: 0 },
      roster: [{ number: 12, name: 'Cara' }],
      libero: 12,
      liberoFor: 7,
    }),
  ]
);
await run(
  "INSERT INTO volley_events (video_id, kind, set_number, point_number, team, payload) VALUES (?, 'sub', 1, 2, 'home', ?)",
  [videoId, JSON.stringify({ out: 12, in: 7 })]
);

const trajectory = await run(
  `INSERT INTO trajectory_matches (user_id, name, home_team_id, away_team_id, home_team_uuid, team1_name, team2_name)
   VALUES (1, 'Fiche test', ?, NULL, 'old-team-uuid', 'ASUL bis', 'Adversaire')`,
  [oldTeamId]
);
const trajectoryId = trajectory.lastID;
for (const number of [1, 12, 15]) {
  await run(
    `INSERT INTO trajectory_shots
       (match_id, team_side, player_number, kind, start_x, start_y, end_x, end_y, result)
     VALUES (?, 'home', ?, 'attack', 10, 10, 20, 20, 'point')`,
    [trajectoryId, number]
  );
}

// Suppression logique : les étiquettes passent en « Équipe à définir ».
const affected = await markTeamReferencesUndefined(oldTeamId);
assert.deepEqual(affected, { videos: 1, trajectories: 1, liveSessions: 0 });
let row = await get('SELECT team1_name FROM videos WHERE id = ?', [videoId]);
assert.equal(row.team1_name, UNDEFINED_TEAM_NAME);
row = await get('SELECT team1_name FROM trajectory_matches WHERE id = ?', [trajectoryId]);
assert.equal(row.team1_name, UNDEFINED_TEAM_NAME);

const preview = await getReplacementPreview(oldTeamId);
assert.ok(preview);
assert.equal(preview.videos.length, 1);
assert.equal(preview.trajectories.length, 1);
assert.deepEqual(
  preview.numbers.map((n) => n.number),
  [1, 7, 12, 15]
);
assert.equal(preview.numbers.find((n) => n.number === 12).actions, 1);
assert.equal(preview.numbers.find((n) => n.number === 12).shots, 1);

// Réaffectation : 12 → 9 (joueur existant), 15 créé dans la cible.
await run('UPDATE teams SET deleted = 1 WHERE id = ?', [oldTeamId]);
const result = await replaceTeamReferences(oldTeamId, targetTeamId, {
  number_map: { 1: 1, 7: 7, 12: 9, 15: 15 },
  create_players: [{ number: 15, name: 'Dora cible', role: 'universal' }],
});
assert.equal(result.videosUpdated, 1);
assert.equal(result.trajectoriesUpdated, 1);
assert.equal(result.actionsUpdated, 1);
assert.equal(result.shotsUpdated, 1);
assert.equal(result.lineupsUpdated, 1);
assert.equal(result.eventsUpdated, 1);
assert.equal(result.playersCreated, 1);

row = await get('SELECT team1_name, home_team_id, home_team_uuid FROM videos WHERE id = ?', [videoId]);
assert.equal(row.team1_name, 'ASUL');
assert.equal(Number(row.home_team_id), targetTeamId);
assert.equal(row.home_team_uuid, 'target-team-uuid');

const actions = await all('SELECT code, player_number, team FROM volley_actions WHERE video_id = ? ORDER BY action_index', [
  videoId,
]);
assert.deepEqual(
  actions.map((a) => [a.team, Number(a.player_number), a.code]),
  [
    ['home', 1, '*01S#'],
    ['home', 9, '*09A#'],
    ['home', 15, '*15A#'],
    ['away', 5, 'a05R#'],
  ]
);
assert.ok(await get('SELECT id FROM team_players WHERE team_id = ? AND number = 15', [targetTeamId]));

const shots = await all('SELECT player_number FROM trajectory_shots WHERE match_id = ? ORDER BY id', [trajectoryId]);
assert.deepEqual(
  shots.map((s) => Number(s.player_number)),
  [1, 9, 15]
);
row = await get('SELECT home_team_id, team1_name FROM trajectory_matches WHERE id = ?', [trajectoryId]);
assert.equal(Number(row.home_team_id), targetTeamId);
assert.equal(row.team1_name, 'ASUL');

row = await get('SELECT home_lineup, home_setter FROM set_setups WHERE match_key = ?', [`video:${videoId}`]);
const saved = JSON.parse(row.home_lineup);
assert.equal(saved.start.P3, 9);
assert.equal(saved.libero, 9);
assert.equal(saved.liberoFor, 7);
assert.equal(Number(row.home_setter), 7);

row = await get('SELECT payload FROM volley_events WHERE video_id = ?', [videoId]);
assert.deepEqual(JSON.parse(row.payload), { out: 9, in: 7 });

const deleted = await deletedTeamsWithUsage();
const oldEntry = deleted.find((t) => Number(t.id) === oldTeamId);
assert.equal(Number(oldEntry.video_count), 0);
assert.equal(Number(oldEntry.trajectory_count), 0);
assert.equal(Number(oldEntry.total_count), 0);

await new Promise((resolve) => db.close(resolve));
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {
  // Nettoyage best-effort sous Windows (fichiers WAL encore verrouillés).
}
console.log('team-replacement.spec: OK');

