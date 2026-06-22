'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../db');

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }
  const result = await query(
    `SELECT id, org_id, email, password_hash, name, role FROM users WHERE email = $1`,
    [String(email).toLowerCase().trim()]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  req.session.user = {
    id: user.id,
    org_id: user.org_id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  res.json({ ok: true, user: req.session.user });
}

function logout(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

function me(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: req.session.user });
}

// Gate for API routes: requires a session, exposes req.user.
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
  req.user = req.session.user;
  next();
}

module.exports = { login, logout, me, requireAuth };
