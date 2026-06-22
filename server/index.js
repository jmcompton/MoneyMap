'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const auth = require('./auth');
const api = require('./routes/api');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// Auth endpoints (public).
app.post('/api/login', (req, res, next) => auth.login(req, res).catch(next));
app.post('/api/logout', auth.logout);
app.get('/api/me', auth.me);

// Everything else under /api requires a session.
app.use('/api', auth.requireAuth, api);

// Guard the app pages: bounce to login if there's no session.
const PROTECTED = ['/', '/index.html', '/accounts.html', '/account.html', '/import.html', '/unmatched.html', '/coming-soon.html'];
app.get(PROTECTED, (req, res, next) => {
  if (!req.session.user) return res.redirect('/login.html');
  next();
});

// Static assets (login page, css, js, manifest, service worker, icons).
app.use(express.static(PUBLIC_DIR));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// JSON error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`MoneyMap running on :${PORT}`));
}

module.exports = app;
