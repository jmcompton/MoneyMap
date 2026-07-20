const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const router = express.Router();

// Every manager query is scoped to req.companyId so a firm only ever sees its own reps.
router.get('/reps', async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.territory, u.created_at,
      (SELECT COUNT(*) FROM prospects WHERE user_id=u.id) as prospect_count,
      (SELECT COUNT(*) FROM calls WHERE user_id=u.id) as call_count,
      (SELECT COUNT(*) FROM calls WHERE user_id=u.id AND call_date >= CURRENT_DATE - INTERVAL '7 days') as calls_this_week,
      (SELECT COUNT(*) FROM prospects WHERE user_id=u.id AND status='Hot') as hot_count
     FROM users u WHERE u.role='rep' AND u.company_id=$1 ORDER BY u.created_at DESC`,
    [req.companyId]);
  res.json(result.rows);
});

router.get('/activity', async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, u.name as rep_name, p.company, p.category, p.city
     FROM calls c JOIN users u ON c.user_id=u.id JOIN prospects p ON c.prospect_id=p.id
     WHERE u.company_id=$1
     ORDER BY c.created_at DESC LIMIT 20`,
    [req.companyId]);
  res.json(result.rows);
});

// Manager adds a rep INTO THEIR OWN COMPANY. company_id is taken from the
// manager's session, never from the request body, so a rep always lands in the
// correct firm and can't be planted into another one.
router.post('/add-rep', async (req, res) => {
  const { name, email, password, territory } = req.body;
  if (!name || !email || !password) return res.json({ error: 'Name, email and password are required' });
  if (password.length < 8) return res.json({ error: 'Password must be at least 8 characters' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, territory, company_id)
       VALUES ($1,$2,$3,'rep',$4,$5) RETURNING id, name, email, territory`,
      [name, email, hash, territory || '', req.companyId]
    );
    res.json({ success: true, rep: result.rows[0] });
  } catch (e) {
    res.json({ error: e.code === '23505' ? 'Email already exists' : e.message });
  }
});

module.exports = router;
