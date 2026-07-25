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

// GET /api/lines/catalog — {id,name} for the picker, scoped to the caller's firm.
router.get('/catalog', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name FROM lines
        WHERE status IS DISTINCT FROM 'inactive'
          AND (company_id IS NOT DISTINCT FROM $1 OR company_id IS NULL)
        ORDER BY name ASC`, [req.companyId]);
    res.json(r.rows);
  } catch (e) { console.error('[lines/catalog]', e.message); res.status(500).json({ error: e.message }); }
});

// GET /api/lines/represented — the manufacturers this firm represents, with the
// AI profile (products + who buys) that drives the lead finder.
router.get('/represented', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, products, category_hint AS category, target_customers
         FROM lines
        WHERE represented = TRUE AND (company_id IS NOT DISTINCT FROM $1)
        ORDER BY name ASC`, [req.companyId]);
    res.json(r.rows.map(function(row){
      let tc = [];
      try { tc = row.target_customers ? JSON.parse(row.target_customers) : []; } catch(_) {}
      return { id: row.id, name: row.name, products: row.products || '', category: row.category || '', target_customers: tc };
    }));
  } catch (e) { console.error('[lines/represented]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/lines/represent — save a manufacturer the firm represents, together
// with the AI-found products/category/buyers. Upserts by name within the firm.
router.post('/represent', async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'A manufacturer name is required.' });
    const products = String(b.products || '').slice(0, 300);
    const category = String(b.category || '').slice(0, 60);
    const targets  = Array.isArray(b.target_customers)
      ? JSON.stringify(b.target_customers.slice(0, 8).map(function(t){ return String(t).slice(0, 60); }))
      : '[]';
    const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    const existing = await pool.query(
      `SELECT id FROM lines WHERE (company_id IS NOT DISTINCT FROM $1) AND normalized_name = $2 LIMIT 1`,
      [req.companyId, norm]);
    if (existing.rows.length) {
      await pool.query(
        `UPDATE lines SET products=$1, category_hint=$2, target_customers=$3, represented=TRUE, status='active' WHERE id=$4`,
        [products, category, targets, existing.rows[0].id]);
      return res.json({ ok: true, id: existing.rows[0].id, updated: true });
    }
    const ins = await pool.query(
      `INSERT INTO lines (name, normalized_name, company_id, products, category_hint, target_customers, represented, status)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,'active') RETURNING id`,
      [name, norm, req.companyId, products, category, targets]);
    res.json({ ok: true, id: ins.rows[0].id, created: true });
  } catch (e) { console.error('[lines/represent]', e.message); res.status(500).json({ error: e.message }); }
});

// DELETE /api/lines/represent/:id — stop representing a manufacturer.
router.delete('/represent/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id.' });
    await pool.query(
      `UPDATE lines SET represented=FALSE WHERE id=$1 AND (company_id IS NOT DISTINCT FROM $2)`,
      [id, req.companyId]);
    res.json({ ok: true });
  } catch (e) { console.error('[lines/represent DELETE]', e.message); res.status(500).json({ error: e.message }); }
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
