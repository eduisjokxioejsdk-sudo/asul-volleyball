const jwt = require('jsonwebtoken');
const db = require('../database');
const { DEFAULT_CLUB_ID, normalizeClubId } = require('../clubs');

const JWT_SECRET = process.env.JWT_SECRET || 'asul-secret-key-2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded?.id) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    db.get(
      'SELECT id, email, name, club_id FROM users WHERE id = ?',
      [decoded.id],
      (dbErr, row) => {
        if (dbErr) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!row) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const clubId = normalizeClubId(row.club_id);
        req.user = {
          id: row.id,
          email: row.email,
          name: row.name,
          club_id: clubId,
        };
        req.clubId = clubId || DEFAULT_CLUB_ID;
        next();
      }
    );
  });
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      club_id: normalizeClubId(user.club_id),
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { authenticateToken, generateToken, JWT_SECRET };
