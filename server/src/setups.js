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
    'SELECT * FROM set_setups WHERE match_key = ? ORDER BY set_number ASC',
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

// Remplace les positions de départ d'un match (tableau ou objet clé=set_number).
function saveSetups(matchKey, setups, callback) {
  const entries = Array.isArray(setups) ? setups : Object.values(setups || {});
  const clean = entries.filter((s) => s && Number(s.set_number) >= 1);
  if (clean.length === 0) {
    return db.run('DELETE FROM set_setups WHERE match_key = ?', [matchKey], (err) => callback(err || null));
  }
  db.run('DELETE FROM set_setups WHERE match_key = ?', [matchKey], (err) => {
    if (err) return callback(err);
    const stmt = db.prepare(
      `INSERT INTO set_setups
        (match_key, set_number, first_server, home_setter_pos, away_setter_pos,
         home_setter, away_setter, home_lineup, away_lineup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    clean.forEach((s) => {
      const json = (v) => (v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v)));
      stmt.run(
        matchKey,
        Number(s.set_number),
        s.first_server || null,
        s.home_setter_pos || null,
        s.away_setter_pos || null,
        s.home_setter == null ? null : Number(s.home_setter),
        s.away_setter == null ? null : Number(s.away_setter),
        json(s.home_lineup),
        json(s.away_lineup)
      );
    });
    stmt.finalize((err2) => callback(err2 || null));
  });
}

module.exports = { getSetups, saveSetups };
