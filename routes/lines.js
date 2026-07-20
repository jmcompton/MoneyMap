'use strict';

// ── Manufacturer "lines" API ─────────────────────────────────────────────────
// Thin HTTP layer over lib/lines-store. account_id = prospects(id).
// Reps can view the catalog and manage which manufacturer lines an account
// carries; destructive maintenance (backfill/merge) stays manager-only.

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const linesStore = require('../lib/lines-store');

function isManager(req){ return req.session.user && req.session.user.role === 'manager'; }

// Confirm the account belongs to the caller's company — guards cross-firm access.
async function accountInCompany(accountId, companyId){
  const r = await pool.query(
    `SELECT 1 FROM prospects p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id=$1 AND ($2::int IS NULL OR u.company_id=$2 OR p.company_id=$2) LIMIT 1`,
    [accountId, companyId]);
  return r.rows.length > 0;
}

// GET /api/lines — all lines with revenue rollup (sorted by sales desc).
router.get('/', async (req, res) => {
  try { res.json(await linesStore.linesWithRollup(pool)); }
  catch (e) { console.error('[lines]', e.message); res.status(500).json({ error: e.message }); }
});

// GET /api/lines/catalog — simple {id,name} list for the "add a manufacturer" picker.
router.get('/catalog', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name FROM lines WHERE status IS DISTINCT FROM 'inactive' ORDER BY name ASC`);
    res.json(r.rows);
  } catch (e) { console.error('[lines/catalog]', e.message); res.status(500).json({ error: e.message }); }
});

// GET /api/lines/account/:id — the manufacturer lines a given account carries.
router.get('/account/:id', async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    if (!Number.isFinite(accountId)) return res.status(400).json({ error: 'Invalid account id.' });
    if (!await accountInCompany(accountId, req.companyId)) return res.status(404).json({ error: 'Account not found.' });
    res.json(await linesStore.linesForAccount(pool, accountId));
  } catch (e) { console.error('[lines/account]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/lines/account/:id { name } — attach a manufacturer line to an account.
// Finds the line in the catalog (fuzzy match) or creates it, then links it.
router.post('/account/:id', async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const name = String((req.body && req.body.name) || '').trim();
    if (!Number.isFinite(accountId)) return res.status(400).json({ error: 'Invalid account id.' });
    if (!name) return res.status(400).json({ error: 'A manufacturer name is required.' });
    if (!await accountInCompany(accountId, req.companyId)) return res.status(404).json({ error: 'Account not found.' });
    const lineId = await linesStore.resolveLine(pool, name);
    if (!lineId) return res.status(400).json({ error: 'Could not resolve that manufacturer.' });
    await pool.query(
      `INSERT INTO account_lines (account_id, line_id, company_id)
       VALUES ($1,$2,$3) ON CONFLICT (account_id, line_id) DO NOTHING`,
      [accountId, lineId, req.companyId]);
    const r = await pool.query(`SELECT id, name FROM lines WHERE id=$1`, [lineId]);
    res.json({ success: true, line: r.rows[0] });
  } catch (e) { console.error('[lines/account POST]', e.message); res.status(500).json({ error: e.message }); }
});

// DELETE /api/lines/account/:id/line/:lineId — unlink a line from an account.
router.delete('/account/:id/line/:lineId', async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    if (!Number.isFinite(accountId) || !Number.isFinite(lineId)) return res.status(400).json({ error: 'Invalid id.' });
    if (!await accountInCompany(accountId, req.companyId)) return res.status(404).json({ error: 'Account not found.' });
    await pool.query(`DELETE FROM account_lines WHERE account_id=$1 AND line_id=$2`, [accountId, lineId]);
    res.json({ success: true });
  } catch (e) { console.error('[lines/account DELETE]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/lines/backfill — (re)resolve + rebuild across confirmed lines. Manager-only.
router.post('/backfill', async (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'Manager access required' });
  try { res.json(await linesStore.backfillAllLines(pool)); }
  catch (e) { console.error('[lines/backfill]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/lines/merge { from_line_id, into_line_id } — roll one line into another. Manager-only.
router.post('/merge', async (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'Manager access required' });
  try {
    const { from_line_id, into_line_id } = req.body || {};
    res.json(await linesStore.mergeLines(pool, from_line_id, into_line_id));
  } catch (e) { console.error('[lines/merge]', e.message); res.status(400).json({ error: e.message }); }
});

module.exports = router;
