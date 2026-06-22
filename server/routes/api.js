'use strict';

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { query, getPool } = require('../../db');
const { normalizeName, computeTiers } = require('../../lib/helpers');
const { computeRecoveries } = require('../../lib/reconcile');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = express.Router();

// --- shared: compute tiered accounts for an org from resolved commission ---
async function tieredAccounts(orgId) {
  // "Current" commission = each manufacturer's most recent statement, summed.
  const { rows } = await query(
    `SELECT a.id AS account_id, a.name AS name,
            COALESCE(SUM(cli.amount), 0) AS commission
       FROM commission_line_items cli
       JOIN commission_imports ci ON ci.id = cli.import_id
       JOIN accounts a ON a.id = cli.resolved_account_id
       JOIN (
         SELECT manufacturer_id, MAX(period_start) AS mx
           FROM commission_imports
          WHERE org_id = $1 AND period_start IS NOT NULL
          GROUP BY manufacturer_id
       ) latest ON latest.manufacturer_id = ci.manufacturer_id AND ci.period_start = latest.mx
      WHERE cli.org_id = $1 AND cli.match_status = 'matched'
      GROUP BY a.id, a.name`,
    [orgId]
  );
  return computeTiers(rows);
}

router.get('/manufacturers', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name FROM manufacturers WHERE org_id = $1 ORDER BY name`,
      [req.user.org_id]
    );
    res.json({ manufacturers: rows });
  } catch (e) { next(e); }
});

const daysBetween = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const daysUntil = (d) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const round2cents = (n) => Math.round(n * 100) / 100;

// The money map: the full homepage in one payload.
router.get('/home', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const tiers = await tieredAccounts(orgId);
    const tierById = new Map(tiers.map((t) => [t.account_id, t]));
    const totalCommission = tiers.reduce((s, r) => s + r.commission, 0);

    // At-risk: accounts gone quiet, weighted toward key (Tier A) accounts.
    const accRows = (await query(
      `SELECT id, name, city, last_contact_at FROM accounts WHERE org_id = $1 AND last_contact_at IS NOT NULL`,
      [orgId]
    )).rows;
    const atRisk = accRows
      .map((a) => {
        const t = tierById.get(a.id);
        return {
          account_id: a.id, name: a.name, city: a.city,
          days_since: daysBetween(a.last_contact_at),
          commission: t ? t.commission : 0,
          tier: t ? t.tier : 'C',
        };
      })
      .filter((a) => a.days_since >= 30)
      .sort((x, y) => (x.tier === 'A' ? 0 : 1) - (y.tier === 'A' ? 0 : 1) || y.commission - x.commission || y.days_since - x.days_since)
      .slice(0, 4);

    const route = (await query(
      `SELECT label, city, arrival_time, status FROM route_stops WHERE org_id = $1 ORDER BY position`,
      [orgId]
    )).rows;

    const leads = (await query(
      `SELECT name, city, reason, est_value, distance_mi FROM leads WHERE org_id = $1 ORDER BY est_value DESC`,
      [orgId]
    )).rows.map((l) => ({ ...l, est_value: Number(l.est_value), distance_mi: Number(l.distance_mi) }));

    const dealRows = (await query(
      `SELECT d.name, d.manufacturer, d.value, d.stage, d.close_date, a.name AS account_name
         FROM deals d LEFT JOIN accounts a ON a.id = d.account_id
        WHERE d.org_id = $1 ORDER BY d.close_date ASC`,
      [orgId]
    )).rows.map((d) => ({
      name: d.name, manufacturer: d.manufacturer, account_name: d.account_name,
      value: Number(d.value), stage: d.stage, days_to_close: daysUntil(d.close_date),
    }));
    const pipeline = dealRows.reduce((s, d) => s + d.value, 0);

    const tasks = (await query(
      `SELECT title, due_date FROM tasks WHERE org_id = $1 AND done = false ORDER BY due_date ASC`,
      [orgId]
    )).rows.map((t) => ({ title: t.title, days_to_due: daysUntil(t.due_date) }));

    // found money headline (open + claimed gaps)
    let foundTotal = 0; let foundCount = 0;
    try {
      const recItems = await computeRecoveries(orgId);
      const statuses = await recoveryStatusMap(orgId);
      for (const it of recItems) {
        const s = statuses.get(it.key);
        const st = s ? s.status : 'open';
        if (st === 'open' || st === 'claimed') { foundTotal += it.gap; foundCount += 1; }
      }
    } catch (_) { /* non-fatal */ }

    const first = req.user.name.split(' ')[0];
    const riskKey = atRisk.filter((a) => a.tier === 'A').length;
    const closingDeals = dealRows.filter((d) => d.days_to_close <= 14);
    const closingValue = closingDeals.reduce((s, d) => s + d.value, 0);
    const brief = `${first}, you have ${route.filter((r) => r.status !== 'done').length} stops left today. `
      + `${riskKey} key account${riskKey === 1 ? '' : 's'} ${riskKey === 1 ? 'has' : 'have'} gone quiet, and `
      + `${closingDeals.length} deal${closingDeals.length === 1 ? '' : 's'} worth ${'$' + closingValue.toLocaleString('en-US')} ${closingDeals.length === 1 ? 'is' : 'are'} closing within two weeks.`;

    res.json({
      user: req.user,
      brief,
      summary: {
        total_commission: Math.round(totalCommission * 100) / 100,
        key_account_count: tiers.filter((t) => t.tier === 'A').length,
        at_risk_count: atRisk.length,
        pipeline_value: pipeline,
        found_total: round2cents(foundTotal),
        found_count: foundCount,
      },
      today_route: route,
      at_risk: atRisk,
      leads,
      deals: dealRows,
      tasks,
      key_accounts: tiers.filter((t) => t.tier === 'A'),
    });
  } catch (e) { next(e); }
});

// Accounts list, Zoho-style: search, filter, sort, with last-touch + value.
router.get('/accounts', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const tiers = await tieredAccounts(orgId);
    const tmap = new Map(tiers.map((t) => [t.account_id, t]));
    const rows = (await query(
      `SELECT id, name, account_type, city, last_contact_at, last_order_at FROM accounts WHERE org_id = $1`,
      [orgId]
    )).rows;
    let list = rows.map((a) => {
      const t = tmap.get(a.id);
      return {
        account_id: a.id, name: a.name, account_type: a.account_type, city: a.city,
        days_since_contact: a.last_contact_at ? daysBetween(a.last_contact_at) : null,
        days_since_order: a.last_order_at ? daysBetween(a.last_order_at) : null,
        commission: t ? t.commission : 0, tier: t ? t.tier : '—', rank: t ? t.rank : null,
      };
    });
    const q = String(req.query.q || '').toLowerCase().trim();
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q) || String(a.city || '').toLowerCase().includes(q));
    const tier = req.query.tier;
    if (tier === 'at_risk') list = list.filter((a) => a.days_since_contact != null && a.days_since_contact >= 30);
    else if (tier) list = list.filter((a) => a.tier === String(tier).toUpperCase());

    const sort = req.query.sort || 'last_contact';
    if (sort === 'commission') list.sort((a, b) => b.commission - a.commission);
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'overdue') list.sort((a, b) => (b.days_since_contact ?? -1) - (a.days_since_contact ?? -1));
    else list.sort((a, b) => (a.days_since_contact ?? 99999) - (b.days_since_contact ?? 99999));

    res.json({ accounts: list });
  } catch (e) { next(e); }
});

// Full account detail: contacts, deals, quotes, activity timeline.
router.get('/accounts/:id', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const id = Number(req.params.id);
    const a = (await query(`SELECT * FROM accounts WHERE id = $1 AND org_id = $2`, [id, orgId])).rows[0];
    if (!a) return res.status(404).json({ error: 'Account not found.' });
    const tiers = await tieredAccounts(orgId);
    const t = tiers.find((x) => x.account_id === id);
    const contacts = (await query(`SELECT name, title, phone, email FROM contacts WHERE account_id = $1 ORDER BY id`, [id])).rows;
    const deals = (await query(`SELECT name, manufacturer, value, stage, close_date FROM deals WHERE account_id = $1 ORDER BY close_date`, [id])).rows
      .map((d) => ({ name: d.name, manufacturer: d.manufacturer, value: Number(d.value), stage: d.stage, days_to_close: daysUntil(d.close_date) }));
    const quotes = (await query(`SELECT title, manufacturer, amount, status, file_label, created_at FROM quotes WHERE account_id = $1 ORDER BY created_at DESC`, [id])).rows
      .map((q) => ({ title: q.title, manufacturer: q.manufacturer, amount: Number(q.amount), status: q.status, file_label: q.file_label, days_ago: daysBetween(q.created_at) }));
    const acts = (await query(`SELECT type, body, created_at FROM activities WHERE account_id = $1 ORDER BY created_at DESC`, [id])).rows
      .map((x) => ({ type: x.type, body: x.body, days_ago: daysBetween(x.created_at) }));
    res.json({
      account: {
        id: a.id, name: a.name, account_type: a.account_type, city: a.city, state: a.state,
        days_since_contact: a.last_contact_at ? daysBetween(a.last_contact_at) : null,
        days_since_order: a.last_order_at ? daysBetween(a.last_order_at) : null,
        commission: t ? t.commission : 0, tier: t ? t.tier : '—', rank: t ? t.rank : null,
      },
      contacts, deals, quotes, activities: acts,
    });
  } catch (e) { next(e); }
});

// Log a call / note. Updates last contact, like logging in the field.
router.post('/accounts/:id/activity', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const id = Number(req.params.id);
    const { type, body } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Note text is required.' });
    await query(`INSERT INTO activities (org_id, account_id, user_id, type, body) VALUES ($1,$2,$3,$4,$5)`,
      [orgId, id, req.user.id, type || 'note', String(body).trim()]);
    await query(`UPDATE accounts SET last_contact_at = now() WHERE id = $1 AND org_id = $2`, [id, orgId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Import a commission CSV. Columns are mapped by the caller (account_col, amount_col).
router.post('/imports', upload.single('file'), async (req, res, next) => {
  try {
    const { manufacturer_id, period_label, account_col, amount_col } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!manufacturer_id || !period_label) {
      return res.status(400).json({ error: 'manufacturer_id and period_label are required.' });
    }
    const accCol = account_col || 'Account';
    const amtCol = amount_col || 'Commission';

    let records;
    try {
      records = parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (e) {
      return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
    }
    if (!records.length) return res.status(400).json({ error: 'CSV had no rows.' });
    if (!(accCol in records[0]) || !(amtCol in records[0])) {
      return res.status(400).json({
        error: `Columns not found. Available: ${Object.keys(records[0]).join(', ')}`,
      });
    }

    const orgId = req.user.org_id;
    const mfrId = Number(manufacturer_id);

    const imp = (
      await query(
        `INSERT INTO commission_imports
           (org_id, manufacturer_id, uploaded_by, period_label, period_start, source_filename, row_count, status)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'processed') RETURNING id`,
        [orgId, mfrId, req.user.id, period_label, req.file.originalname || 'upload.csv', records.length]
      )
    ).rows[0];

    // Preload aliases for this manufacturer for fast matching.
    const aliasRows = (
      await query(
        `SELECT raw_name, account_id FROM account_aliases WHERE org_id = $1 AND manufacturer_id = $2`,
        [orgId, mfrId]
      )
    ).rows;
    const aliasMap = new Map(aliasRows.map((r) => [r.raw_name, r.account_id]));

    let matched = 0;
    let unmatched = 0;
    for (const row of records) {
      const rawName = String(row[accCol] || '').trim();
      const amount = Number(String(row[amtCol] || '0').replace(/[^0-9.\-]/g, '')) || 0;
      if (!rawName) continue;
      const key = normalizeName(rawName);
      const resolvedId = aliasMap.get(key) || null;
      if (resolvedId) matched++; else unmatched++;
      await query(
        `INSERT INTO commission_line_items
           (import_id, org_id, manufacturer_id, raw_account_name, amount, period_label, resolved_account_id, match_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [imp.id, orgId, mfrId, rawName, amount, period_label, resolvedId, resolvedId ? 'matched' : 'unmatched']
      );
    }

    res.json({ import_id: imp.id, total: records.length, matched, unmatched });
  } catch (e) { next(e); }
});

// Distinct unmatched raw names for an import (the resolve worklist).
router.get('/imports/:id/unmatched', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT manufacturer_id, raw_account_name,
              COUNT(*) AS line_count, COALESCE(SUM(amount),0) AS amount
         FROM commission_line_items
        WHERE org_id = $1 AND import_id = $2 AND match_status = 'unmatched'
        GROUP BY manufacturer_id, raw_account_name
        ORDER BY amount DESC`,
      [req.user.org_id, Number(req.params.id)]
    );
    const accounts = (
      await query(`SELECT id, name FROM accounts WHERE org_id = $1 ORDER BY name`, [req.user.org_id])
    ).rows;
    res.json({
      unmatched: rows.map((r) => ({
        manufacturer_id: r.manufacturer_id,
        raw_account_name: r.raw_account_name,
        line_count: Number(r.line_count),
        amount: Math.round(Number(r.amount) * 100) / 100,
      })),
      accounts,
    });
  } catch (e) { next(e); }
});

// Resolve an unmatched name: pick an existing account or create one, write the
// alias (so it's remembered forever), and resolve every matching line item.
router.post('/resolve', async (req, res, next) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { manufacturer_id, raw_name, account_id, new_account_name } = req.body || {};
    if (!manufacturer_id || !raw_name) {
      return res.status(400).json({ error: 'manufacturer_id and raw_name required.' });
    }
    const orgId = req.user.org_id;
    const mfrId = Number(manufacturer_id);
    await client.query('BEGIN');

    let targetId = account_id ? Number(account_id) : null;
    if (!targetId) {
      if (!new_account_name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Pick an account or provide new_account_name.' });
      }
      targetId = (
        await client.query(
          `INSERT INTO accounts (org_id, name, account_type) VALUES ($1,$2,'other') RETURNING id`,
          [orgId, String(new_account_name).trim()]
        )
      ).rows[0].id;
    }

    const key = normalizeName(raw_name);
    // Upsert-ish: ignore if the alias already exists.
    const existing = await client.query(
      `SELECT id FROM account_aliases WHERE org_id=$1 AND manufacturer_id=$2 AND raw_name=$3`,
      [orgId, mfrId, key]
    );
    if (!existing.rows.length) {
      await client.query(
        `INSERT INTO account_aliases (org_id, manufacturer_id, raw_name, account_id) VALUES ($1,$2,$3,$4)`,
        [orgId, mfrId, key, targetId]
      );
    }

    // Resolve every matching unmatched line for this org + manufacturer.
    const all = await client.query(
      `SELECT id, raw_account_name FROM commission_line_items
        WHERE org_id=$1 AND manufacturer_id=$2 AND match_status='unmatched'`,
      [orgId, mfrId]
    );
    let resolved = 0;
    for (const li of all.rows) {
      if (normalizeName(li.raw_account_name) === key) {
        await client.query(
          `UPDATE commission_line_items SET resolved_account_id=$1, match_status='matched' WHERE id=$2`,
          [targetId, li.id]
        );
        resolved++;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, account_id: targetId, resolved_count: resolved });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(e);
  } finally {
    client.release();
  }
});

// Polish a raw voice memo into a clean call-log entry. Uses Anthropic if a key
// is set; otherwise returns the transcript unchanged so it always works.
router.post('/ai/polish', async (req, res, next) => {
  try {
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: 'No text to polish.' });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.json({ polished: text, ai: false });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Turn this rough voice memo from a building-materials sales rep into a clean, concise call-log note. Plain spoken language, first person, a few sentences at most. Keep every fact, drop the filler, no preamble, no made-up details.\n\nMemo: ${text}` }],
      }),
    });
    const data = await r.json();
    const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    res.json({ polished: out || text, ai: !!out });
  } catch (e) {
    res.json({ polished: String((req.body || {}).text || '').trim(), ai: false });
  }
});
// Found money: discrepancies on the latest statements, with recovery status.
const OPEN_STATUSES = ['open', 'claimed'];
async function recoveryStatusMap(orgId) {
  const { rows } = await query(`SELECT account_id, manufacturer_id, period_label, type, status, note FROM recoveries WHERE org_id = $1`, [orgId]);
  const map = new Map();
  for (const r of rows) map.set(`${r.account_id}:${r.manufacturer_id}:${r.period_label}:${r.type}`, r);
  return map;
}

router.get('/reconcile', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const items = await computeRecoveries(orgId);
    const statuses = await recoveryStatusMap(orgId);
    const merged = items.map((it) => {
      const s = statuses.get(it.key);
      return { ...it, status: s ? s.status : 'open', note: s ? s.note : null };
    });
    const sum = (pred) => merged.filter(pred).reduce((s, x) => s + x.gap, 0);
    res.json({
      summary: {
        found_total: round2cents(sum((x) => OPEN_STATUSES.includes(x.status))),
        open_count: merged.filter((x) => OPEN_STATUSES.includes(x.status)).length,
        recovered_total: round2cents(sum((x) => x.status === 'recovered')),
        recovered_count: merged.filter((x) => x.status === 'recovered').length,
        dismissed_count: merged.filter((x) => x.status === 'dismissed').length,
        flagged_count: merged.length,
      },
      items: merged,
    });
  } catch (e) { next(e); }
});

router.post('/reconcile/resolve', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const { account_id, manufacturer_id, period_label, type, gap, status, note } = req.body || {};
    const allowed = ['open', 'claimed', 'recovered', 'dismissed'];
    if (!account_id || !manufacturer_id || !period_label || !type || !allowed.includes(status)) {
      return res.status(400).json({ error: 'Missing or invalid recovery fields.' });
    }
    const existing = (await query(
      `SELECT id FROM recoveries WHERE org_id=$1 AND account_id=$2 AND manufacturer_id=$3 AND period_label=$4 AND type=$5`,
      [orgId, account_id, manufacturer_id, period_label, type]
    )).rows[0];
    if (existing) {
      await query(`UPDATE recoveries SET status=$1, note=$2, gap=$3, updated_at=now() WHERE id=$4`,
        [status, note || null, gap || 0, existing.id]);
    } else {
      await query(
        `INSERT INTO recoveries (org_id, account_id, manufacturer_id, period_label, type, gap, status, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [orgId, account_id, manufacturer_id, period_label, type, gap || 0, status, note || null]
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
