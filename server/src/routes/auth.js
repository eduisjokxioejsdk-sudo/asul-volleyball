const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authenticateToken, generateToken, JWT_SECRET } = require('../middleware/auth');
const { DEFAULT_CLUB_ID, listClubs, getClubById, normalizeClubId } = require('../clubs');

const router = express.Router();

// Liste publique des équipes disponibles (configurées dans server/src/clubs.js)
router.get('/clubs', (req, res) => {
  res.json({
    clubs: listClubs(),
    defaultClubId: DEFAULT_CLUB_ID,
  });
});

// Register
router.post('/register', (req, res) => {
  const { email, password, name, club_id } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }

  const initialClubId = normalizeClubId(club_id);

  // Check if user already exists
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (row) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    db.run(
      'INSERT INTO users (email, password, name, club_id) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, name, initialClubId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create user' });
        }

        const user = { id: this.lastID, email, name, club_id: initialClubId };
        const token = generateToken(user);

        res.status(201).json({ user, token });
      }
    );
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const clubId = normalizeClubId(user.club_id);
    const publicUser = { id: user.id, email: user.email, name: user.name, club_id: clubId };
    const token = generateToken(publicUser);
    res.json({
      user: publicUser,
      token,
    });
  });
});

// Get current user
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    db.get('SELECT id, email, name, club_id FROM users WHERE id = ?', [decoded.id], (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const clubId = normalizeClubId(user.club_id);
      res.json({
        user: { id: user.id, email: user.email, name: user.name, club_id: clubId },
        clubs: listClubs(),
      });
    });
  });
});

// Sélection ou changement d'équipe par l'utilisateur connecté (sans code requis)
router.put('/club', authenticateToken, (req, res) => {
  const clubId = normalizeClubId(req.body?.club_id);
  if (!clubId) {
    return res.status(400).json({ error: 'Équipe introuvable' });
  }

  db.run('UPDATE users SET club_id = ? WHERE id = ?', [clubId, req.user.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    const updatedUser = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      club_id: clubId,
    };
    const token = generateToken(updatedUser);
    res.json({
      user: updatedUser,
      club: getClubById(clubId),
      token,
    });
  });
});

module.exports = router;
