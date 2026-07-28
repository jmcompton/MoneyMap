const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Resolve which rep we're acting on. A manager may pass ?rep_id / body.rep_id to
// view or set someone else's; otherwise it's the signed-in user's own territory.
function resolveRepId(req) {
  const me = req.session && req.session.user;
  if (!me) return { error: 'Not signed in' };
  const asked = (req.query && req.query.rep_id) || (req.body && req.body.rep_id);
  if (asked && String(asked) !== String(me.id)) {
    if (me.role === 'manager') return { repId: parseInt(asked, 10) };
    return { error: 'Not allowed to view another rep\u2019s territory' };
  }
  return { repId: me.id };
}

// GET /api/territory  → { rep_id, counties: [{fips, name, state}] }
router.get('/', async (req, res) => {
  try {
    const r = resolveRepId(req);
    if (r.error) return res.status(403).json({ error: r.error });
    const rows = (await pool.query(
      `SELECT county_fips, county_name, state_fips
         FROM rep_territories WHERE user_id=$1 ORDER BY county_name`,
      [r.repId]
    )).rows;
    res.json({
      rep_id: r.repId,
      counties: rows.map(x => ({ fips: x.county_fips, name: x.county_name, state: x.state_fips }))
    });
  } catch (e) {
    console.error('[territory get]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/territory  { counties: [{fips, name, state}] }  → replaces the set
router.put('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const r = resolveRepId(req);
    if (r.error) { client.release(); return res.status(403).json({ error: r.error }); }
    const counties = Array.isArray(req.body && req.body.counties) ? req.body.counties : [];
    // Sanitize: 5-digit FIPS only.
    const clean = counties
      .map(c => ({
        fips: String((c && c.fips) || '').replace(/\D/g, '').slice(0, 5),
        name: String((c && c.name) || '').slice(0, 80),
        state: String((c && c.state) || (c && c.fips ? String(c.fips).slice(0, 2) : '')).replace(/\D/g, '').slice(0, 2)
      }))
      .filter(c => c.fips.length === 5);

    await client.query('BEGIN');
    await client.query('DELETE FROM rep_territories WHERE user_id=$1', [r.repId]);
    for (const c of clean) {
      await client.query(
        `INSERT INTO rep_territories (user_id, county_fips, county_name, state_fips)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, county_fips) DO NOTHING`,
        [r.repId, c.fips, c.name, c.state]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, rep_id: r.repId, count: clean.length });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[territory put]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
