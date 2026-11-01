const crypto = require('crypto');
const db = require('./database');

function safeParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Renvoie les positions de départ d'un match, indexées par numéro de set.
function getSetups(matchKey, callback) {
  db.all(
    'SELECT * FROM set_setups WHERE match_key = ? AND COALESCE(deleted, 0) = 0 ORDER BY set_number ASC',
    [matchKey],
    (err, rows) => {
      if (err) return callback(err);
      const map = {};
      (rows || []).forEach((r) => {
        map[r.set_number] = {
          set_number: r.set_number,
          first_server: r.first_server,
          home_setter_pos: r.home_setter_pos || null,
          away_setter_pos: r.away_setter_pos || null,
          home_setter: r.home_setter ?? null,
          away_setter: r.away_setter ?? null,
          home_lineup: safeParse(r.home_lineup),
          away_lineup: safeParse(r.away_lineup),
        };
      });
      callback(null, map);
    }
  );
}

// Remplace les positions de départ d'un match (tableau ou objet clé=set_number)
// tout en préservant les sync_uuid et les pierres tombales pour la synchro Cloud.
function saveSetups(matchKey, setups, callback) {
  const entries = Array.isArray(setups) ? setups : Object.values(setups || {});
  const clean = entries.filter((s) => s && Number(s.set_number) >= 1);
  const now = new Date().toISOString();

  db.all('SELECT id, set_number, sync_uuid FROM set_setups WHERE match_key = ?', [matchKey], (err, existingRows) => {
    if (err) return callback(err);
    const existingBySet = new Map();
    for (const r of existingRows || []) {
      existingBySet.set(Number(r.set_number), r);
    }

    const keepSetNumbers = new Set(clean.map((s) => Number(s.set_number)));
    const json = (v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));

    db.serialize(() => {
      // Marque en suppression logique les sets retirés
      for (const [setNum, row] of existingBySet.entries()) {
        if (!keepSetNumbers.has(setNum)) {
          const uuid = row.sync_uuid || crypto.randomUUID();
          db.run(
            'UPDATE set_setups SET sync_uuid = ?, deleted = 1, dirty = 1, local_updated_at = ? WHERE id = ?',
            [uuid, now, row.id]
          );
        }
      }

      if (clean.length === 0) {
        return db.get('SELECT 1', [], (e) => callback(e || null));
      }

      const stmt = db.prepare(
        `INSERT INTO set_setups
          (match_key, set_number, first_server, home_setter_pos, away_setter_pos,
           home_setter, away_setter, home_lineup, away_lineup, sync_uuid, deleted, dirty, local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
         ON CONFLICT(match_key, set_number) DO UPDATE SET
           first_server = excluded.first_server,
           home_setter_pos = excluded.home_setter_pos,
           away_setter_pos = excluded.away_setter_pos,
           home_setter = excluded.home_setter,
           away_setter = excluded.away_setter,
           home_lineup = excluded.home_lineup,
           away_lineup = excluded.away_lineup,
           sync_uuid = COALESCE(set_setups.sync_uuid, excluded.sync_uuid),
           deleted = 0,
           dirty = 1,
           local_updated_at = excluded.local_updated_at`
      );
      clean.forEach((s) => {
        const setNum = Number(s.set_number);
        const existing = existingBySet.get(setNum);
        const uuid = (existing && existing.sync_uuid) || s.sync_uuid || crypto.randomUUID();
        stmt.run(
          matchKey,
          setNum,
          s.first_server || null,
          s.home_setter_pos || null,
          s.away_setter_pos || null,
          s.home_setter == null ? null : Number(s.home_setter),
          s.away_setter == null ? null : Number(s.away_setter),
          json(s.home_lineup),
          json(s.away_lineup),
          uuid,
          now
        );
      });
      stmt.finalize((err2) => callback(err2 || null));
    });
  });
}

module.exports = { getSetups, saveSetups };
