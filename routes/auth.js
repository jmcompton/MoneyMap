const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const router = express.Router();

function slugify(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'firm';
}

router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/app');
  res.sendFile(__dirname + '/../views/login.html');
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !await bcrypt.compare(password, user.password))
      return res.json({ error: 'Invalid email or password' });
    // companyId is carried in the session and used to scope every data query.
    req.session.user = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, territory: user.territory, companyId: user.company_id
    };
    res.json({ success: true, role: user.role });
  } catch (e) {
    res.json({ error: 'Login failed' });
  }
});

// Registration creates a NEW COMPANY and makes the registrant its manager.
// One signup = one firm. Additional reps are added afterward by the firm's
// manager, into the same company. Company name is required so we have a firm to create.
router.post('/register', async (req, res) => {
  const { name, email, password, companyName, territory } = req.body;
  if (!name || !email || !password) return res.json({ error: 'Name, email and password are required' });
  if (!companyName || !companyName.trim()) return res.json({ error: 'Company name is required' });
  if (password.length < 8) return res.json({ error: 'Password must be at least 8 characters' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    const comp = await client.query(
      'INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id',
      [companyName.trim(), slugify(companyName) + '-' + Math.random().toString(36).slice(2, 6)]
    );
    const companyId = comp.rows[0].id;
    const result = await client.query(
      `INSERT INTO users (name, email, password, role, territory, company_id)
       VALUES ($1,$2,$3,'manager',$4,$5) RETURNING *`,
      [name, email, hash, territory || '', companyId]
    );
    await client.query('COMMIT');
    const user = result.rows[0];
    req.session.user = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, territory: user.territory, companyId: user.company_id
    };
    res.json({ success: true, role: user.role });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.json({ error: 'Email already registered' });
    res.json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// Change password — the feature that was missing. Requires the current password.
router.post('/change-password', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.json({ error: 'New password must be at least 8 characters' });
  try {
    const r = await pool.query('SELECT password FROM users WHERE id=$1', [req.session.user.id]);
    const u = r.rows[0];
    if (!u || !await bcrypt.compare(currentPassword || '', u.password))
      return res.json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.session.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ error: 'Could not change password' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

module.exports = router;
