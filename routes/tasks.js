const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/tasks — open tasks for the rep (they roll over until checked off).
// Overdue first, then due today, then no-date, newest last.
router.get('/', async (req, res) => {
  const uid = req.session.user.id;
  const accountId = req.query.account_id ? parseInt(req.query.account_id, 10) : null;
  const includeAll = req.query.all === '1' || req.query.all === 'true';
  try {
    const conds = ['t.user_id = $1'];
    const params = [uid];
    if (!includeAll) conds.push('t.done = FALSE');
    if (accountId) { params.push(accountId); conds.push('t.account_id = $' + params.length); }
    const rows = (await pool.query(
      `SELECT t.id, t.body, t.due_date, t.done, t.done_at, t.created_at, t.account_id, p.company AS account_name,
              (t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND t.done = FALSE) AS overdue,
              (CURRENT_DATE - t.due_date) AS days_over
         FROM tasks t
         LEFT JOIN prospects p ON t.account_id = p.id
        WHERE ${conds.join(' AND ')}
        ORDER BY t.done ASC, (t.due_date IS NULL) ASC, t.due_date ASC, t.created_at ASC`,
      params
    )).rows;
    res.json({ tasks: rows });
  } catch (e) {
    console.error('[tasks get]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks  { body, account_id?, due_date? }
router.post('/', async (req, res) => {
  const uid = req.session.user.id;
  const companyId = req.session.user.company_id || null;
  try {
    const body = String((req.body && req.body.body) || '').trim().slice(0, 300);
    if (!body) return res.status(400).json({ error: 'Task text required' });
    const accountId = req.body && req.body.account_id ? parseInt(req.body.account_id, 10) : null;
    const dueDate = req.body && req.body.due_date ? String(req.body.due_date).slice(0, 10) : null;
    const row = (await pool.query(
      `INSERT INTO tasks (user_id, account_id, body, due_date, company_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, body, due_date, account_id`,
      [uid, accountId, body, dueDate, companyId]
    )).rows[0];
    res.json({ ok: true, task: row });
  } catch (e) {
    console.error('[tasks post]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tasks/:id  { done }  — check off (or un-check) a task.
router.patch('/:id', async (req, res) => {
  const uid = req.session.user.id;
  try {
    const id = parseInt(req.params.id, 10);
    const done = !!(req.body && req.body.done);
    await pool.query(
      `UPDATE tasks SET done=$1, done_at = CASE WHEN $1 THEN NOW() ELSE NULL END
        WHERE id=$2 AND user_id=$3`,
      [done, id, uid]
    );
    res.json({ ok: true, id, done });
  } catch (e) {
    console.error('[tasks patch]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
