'use strict';

// ── Found Money API (requireAuthAPI) ─────────────────────────────────────────
// GET /api/found-money           → accounts whose buying stopped or dropped vs
//                                  their own commission history, ranked by dollars.
// Rep sees their own; manager sees the firm and may filter by rep.

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { getFoundMoney } = require('../lib/foundmoney-store');

router.get('/', async (req, res) => {
  try {
    const out = await getFoundMoney(pool, {
      uid: req.session.user.id,
      scope: req.session.user.role === 'manager' ? 'manager' : 'rep',
      repId: req.query.rep_id,
      companyId: req.companyId,
    });
    res.json(out);
  } catch (e) {
    console.error('[found-money]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
