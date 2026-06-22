'use strict';

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { query, getPool } = require('../../db');
const { normalizeName, computeTiers } = require('../../lib/helpers');
const { computeRecoveries } = require('../../lib/reconcile');
const { parsePdfCommission } = require('../../lib/pdf');

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
      `SELECT label, city, arrival_time, status FROM route_stops WHERE org_id = $1 AND stop_date = $2 ORDER BY position`,
      [orgId, ymd(new Date())]
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
// Shared commit path for any source (CSV or PDF). Writes the import + line
// items, auto-resolves each row against the manufacturer's remembered aliases,
// and returns the matched/unmatched summary. This is the single place the
// alias moat is applied, so every source benefits from it.
async function commitCommissionRows(orgId, userId, mfrId, periodLabel, filename, rows) {
  const imp = (
    await query(
      `INSERT INTO commission_imports
         (org_id, manufacturer_id, uploaded_by, period_label, period_start, source_filename, row_count, status)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'processed') RETURNING id`,
      [orgId, mfrId, userId, periodLabel, filename, rows.length]
    )
  ).rows[0];

  const aliasRows = (
    await query(`SELECT raw_name, account_id FROM account_aliases WHERE org_id = $1 AND manufacturer_id = $2`, [orgId, mfrId])
  ).rows;
  const aliasMap = new Map(aliasRows.map((r) => [r.raw_name, r.account_id]));

  let matched = 0; let unmatched = 0;
  for (const row of rows) {
    const rawName = String(row.raw_name || '').trim();
    const amount = Number(String(row.amount || '0').toString().replace(/[^0-9.\-]/g, '')) || 0;
    if (!rawName) continue;
    const key = normalizeName(rawName);
    const resolvedId = aliasMap.get(key) || null;
    if (resolvedId) matched++; else unmatched++;
    await query(
      `INSERT INTO commission_line_items
         (import_id, org_id, manufacturer_id, raw_account_name, amount, period_label, resolved_account_id, match_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [imp.id, orgId, mfrId, rawName, amount, periodLabel, resolvedId, resolvedId ? 'matched' : 'unmatched']
    );
  }
  return { import_id: imp.id, total: rows.length, matched, unmatched };
}

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
      records = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
      return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
    }
    if (!records.length) return res.status(400).json({ error: 'CSV had no rows.' });
    if (!(accCol in records[0]) || !(amtCol in records[0])) {
      return res.status(400).json({ error: `Columns not found. Available: ${Object.keys(records[0]).join(', ')}` });
    }

    const rows = records
      .map((r) => ({ raw_name: String(r[accCol] || '').trim(), amount: Number(String(r[amtCol] || '0').replace(/[^0-9.\-]/g, '')) || 0 }))
      .filter((r) => r.raw_name);
    const out = await commitCommissionRows(req.user.org_id, req.user.id, Number(manufacturer_id), period_label, req.file.originalname || 'upload.csv', rows);
    res.json(out);
  } catch (e) { next(e); }
});

// PDF preview: extract + parse rows, but DON'T write anything. The rep reviews
// and edits the rows, then commits. PDF parsing is fuzzy, so a human checkpoint
// is the right call (and matches the "format varies per manufacturer" reality).
router.post('/imports/pdf/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!/pdf$/i.test(req.file.originalname || '') && req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Please upload a PDF.' });
    }
    let parsed;
    try {
      parsed = await parsePdfCommission(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'Could not read this PDF: ' + e.message });
    }
    res.json({ rows: parsed.rows, method: parsed.method, text_sample: parsed.text_sample, filename: req.file.originalname || 'statement.pdf' });
  } catch (e) { next(e); }
});

// Commit reviewed rows from any source (used by the PDF flow after preview).
router.post('/imports/commit', async (req, res, next) => {
  try {
    const { manufacturer_id, period_label, filename, rows } = req.body || {};
    if (!manufacturer_id || !period_label) return res.status(400).json({ error: 'manufacturer_id and period_label are required.' });
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows to import.' });
    const clean = rows
      .map((r) => ({ raw_name: String(r.raw_name || r.account_name || '').trim(), amount: Number(r.amount) || 0 }))
      .filter((r) => r.raw_name);
    if (!clean.length) return res.status(400).json({ error: 'No valid rows to import.' });
    const out = await commitCommissionRows(req.user.org_id, req.user.id, Number(manufacturer_id), period_label, filename || 'statement.pdf', clean);
    res.json(out);
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

// ---------- Weekly planner ----------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const asDateStr = (v) => (v instanceof Date ? ymd(v) : String(v).slice(0, 10));
function weekMondays(offset) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now); monday.setDate(now.getDate() - dow + offset * 7);
  const days = [];
  for (let i = 0; i < 6; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); days.push(d); }
  return days;
}

router.get('/plan', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const offset = parseInt(req.query.offset || '0', 10) || 0;
    const days = weekMondays(offset);
    const first = ymd(days[0]); const last = ymd(days[days.length - 1]);
    const todayStr = ymd(new Date());

    const dayRows = (await query(`SELECT plan_date, working, anchor_city, start_point, end_point FROM plan_days WHERE org_id = $1 AND plan_date BETWEEN $2 AND $3`, [orgId, first, last])).rows;
    const dayMap = new Map(dayRows.map((r) => [asDateStr(r.plan_date), r]));
    const stopRows = (await query(`SELECT id, account_id, label, city, address, arrival_time, position, status, kind, stop_date FROM route_stops WHERE org_id = $1 AND stop_date BETWEEN $2 AND $3 ORDER BY position`, [orgId, first, last])).rows;
    const stopsByDate = {};
    for (const s of stopRows) { const k = asDateStr(s.stop_date); (stopsByDate[k] = stopsByDate[k] || []).push({ id: s.id, account_id: s.account_id, label: s.label, city: s.city, address: s.address, arrival_time: s.arrival_time, position: s.position, status: s.status, kind: s.kind || 'stop' }); }

    const out = days.map((d) => {
      const ds = ymd(d);
      const settings = dayMap.get(ds) || {};
      return {
        date: ds,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        is_today: ds === todayStr,
        working: !!settings.working,
        anchor_city: settings.anchor_city || '',
        start_point: settings.start_point || '',
        end_point: settings.end_point || '',
        stops: stopsByDate[ds] || [],
      };
    });
    const cities = (await query(`SELECT DISTINCT city FROM accounts WHERE org_id = $1 AND city IS NOT NULL ORDER BY city`, [orgId])).rows.map((r) => r.city);
    res.json({ offset, week_label: `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[5].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, days: out, cities });
  } catch (e) { next(e); }
});

router.post('/plan/day', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const { plan_date, working, anchor_city, start_point, end_point } = req.body || {};
    if (!plan_date) return res.status(400).json({ error: 'plan_date required' });
    const existing = (await query(`SELECT id FROM plan_days WHERE org_id=$1 AND plan_date=$2`, [orgId, plan_date])).rows[0];
    if (existing) {
      await query(`UPDATE plan_days SET working=$1, anchor_city=$2, start_point=$3, end_point=$4, updated_at=now() WHERE id=$5`,
        [working === undefined ? true : !!working, anchor_city || null, start_point || null, end_point || null, existing.id]);
    } else {
      await query(`INSERT INTO plan_days (org_id, user_id, plan_date, working, anchor_city, start_point, end_point) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orgId, req.user.id, plan_date, working === undefined ? true : !!working, anchor_city || null, start_point || null, end_point || null]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/plan/stop', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const { plan_date, account_id, label, city, arrival_time, kind, address } = req.body || {};
    if (!plan_date || !label) return res.status(400).json({ error: 'plan_date and label required' });
    const mx = (await query(`SELECT COALESCE(MAX(position),0) AS m FROM route_stops WHERE org_id=$1 AND stop_date=$2`, [orgId, plan_date])).rows[0].m;
    await query(`INSERT INTO route_stops (org_id, user_id, account_id, label, city, address, arrival_time, position, status, stop_date, kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'planned',$9,$10)`,
      [orgId, req.user.id, account_id || null, label, city || null, address || null, arrival_time || null, Number(mx) + 1, plan_date, kind || 'stop']);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/plan/stop/update', async (req, res, next) => {
  try {
    const { id, arrival_time } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await query(`UPDATE route_stops SET arrival_time=$1 WHERE id=$2 AND org_id=$3`, [arrival_time || null, id, req.user.org_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/plan/stop/delete', async (req, res, next) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await query(`DELETE FROM route_stops WHERE id=$1 AND org_id=$2`, [id, req.user.org_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/plan/reorder', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const ids = (req.body || {}).ordered_ids || [];
    for (let i = 0; i < ids.length; i++) {
      await query(`UPDATE route_stops SET position=$1 WHERE id=$2 AND org_id=$3`, [i + 1, ids[i], orgId]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// AI proposes: candidate stops near the anchor city (at-risk + key accounts + leads).
router.get('/plan/suggest', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const city = String(req.query.city || '').trim();
    const planDate = String(req.query.plan_date || '').trim();
    if (!city) return res.json({ candidates: [] });
    const tiers = await tieredAccounts(orgId);
    const tmap = new Map(tiers.map((t) => [t.account_id, t]));
    const already = new Set((await query(`SELECT account_id FROM route_stops WHERE org_id=$1 AND stop_date=$2 AND account_id IS NOT NULL`, [orgId, planDate])).rows.map((r) => r.account_id));

    const accts = (await query(`SELECT id, name, city, last_contact_at FROM accounts WHERE org_id=$1 AND LOWER(city)=LOWER($2)`, [orgId, city])).rows;
    const acctCands = accts.filter((a) => !already.has(a.id)).map((a) => {
      const t = tmap.get(a.id);
      const tier = t ? t.tier : 'C';
      const commission = t ? t.commission : 0;
      const days = a.last_contact_at ? daysBetween(a.last_contact_at) : null;
      const tierW = tier === 'A' ? 3000 : tier === 'B' ? 2000 : 1000;
      const score = tierW + (days || 0) + commission / 100;
      let reason;
      if (days != null && days >= 30) reason = `${tier === 'A' ? 'Key account' : 'Account'} · ${days}d quiet`;
      else reason = `${tier === 'A' ? 'Key account' : tier + ' account'} here`;
      return { type: 'account', account_id: a.id, label: a.name, city: a.city, reason, commission, score };
    });

    const leads = (await query(`SELECT name, city, reason, est_value, distance_mi FROM leads WHERE org_id=$1 AND LOWER(city)=LOWER($2)`, [orgId, city])).rows
      .map((l) => ({ type: 'lead', label: l.name, city: l.city, reason: `AI lead · ~${'$' + Number(l.est_value).toLocaleString('en-US')}/yr`, score: Number(l.est_value) / 200 }));

    const candidates = [...acctCands, ...leads].sort((a, b) => b.score - a.score).slice(0, 8);
    res.json({ candidates });
  } catch (e) { next(e); }
});

// AI proposes a whole day: add the top candidates as stops in one tap.
router.post('/plan/autofill', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const { plan_date, city } = req.body || {};
    if (!plan_date || !city) return res.status(400).json({ error: 'plan_date and city required' });
    const tiers = await tieredAccounts(orgId);
    const tmap = new Map(tiers.map((t) => [t.account_id, t]));
    const already = new Set((await query(`SELECT account_id FROM route_stops WHERE org_id=$1 AND stop_date=$2 AND account_id IS NOT NULL`, [orgId, plan_date])).rows.map((r) => r.account_id));
    const accts = (await query(`SELECT id, name, city, last_contact_at FROM accounts WHERE org_id=$1 AND LOWER(city)=LOWER($2)`, [orgId, city])).rows
      .filter((a) => !already.has(a.id))
      .map((a) => { const t = tmap.get(a.id); const tierW = t && t.tier === 'A' ? 3000 : t && t.tier === 'B' ? 2000 : 1000; const days = a.last_contact_at ? daysBetween(a.last_contact_at) : 0; return { ...a, score: tierW + days }; })
      .sort((a, b) => b.score - a.score).slice(0, 4);
    let mx = Number((await query(`SELECT COALESCE(MAX(position),0) AS m FROM route_stops WHERE org_id=$1 AND stop_date=$2`, [orgId, plan_date])).rows[0].m);
    for (const a of accts) {
      mx += 1;
      await query(`INSERT INTO route_stops (org_id, user_id, account_id, label, city, position, status, stop_date) VALUES ($1,$2,$3,$4,$5,$6,'planned',$7)`,
        [orgId, req.user.id, a.id, a.name, a.city, mx, plan_date]);
    }
    res.json({ ok: true, added: accts.length });
  } catch (e) { next(e); }
});

// ---------- Route-aware lead search ----------
// City centroids for the territory. Distance is computed city-to-city so the
// search can tell "near your morning stop" from "on your way home" without a
// maps API. Add cities here as the book grows.
const CITY_COORDS = {
  birmingham: [33.5186, -86.8104],
  gadsden: [34.0143, -86.0066],
  cullman: [34.1748, -86.8436],
  huntsville: [34.7304, -86.5861],
  decatur: [34.6059, -86.9833],
  madison: [34.6993, -86.7483],
};
function coordOf(text) {
  if (!text) return null;
  const key = String(text).toLowerCase();
  for (const c in CITY_COORDS) { if (key.includes(c)) return CITY_COORDS[c]; }
  return null;
}
function haversineMi(a, b) {
  if (!a || !b) return 99999;
  const toR = (x) => (x * Math.PI) / 180;
  const dLa = toR(b[0] - a[0]); const dLo = toR(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * 3961 * Math.asin(Math.sqrt(h)));
}

// Given a day's first appointment and its endpoint, split leads into the ones
// to hit right after the morning stop and the ones to catch on the way home.
router.get('/plan/leadsearch', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const planDate = String(req.query.plan_date || '').trim();
    if (!planDate) return res.json({ ready: false, reason: 'no_date', morning: null, home: null });

    const dayRow = (await query(`SELECT anchor_city, start_point, end_point FROM plan_days WHERE org_id=$1 AND plan_date=$2`, [orgId, planDate])).rows[0] || {};
    const stops = (await query(`SELECT label, city, arrival_time, kind FROM route_stops WHERE org_id=$1 AND stop_date=$2 ORDER BY position`, [orgId, planDate])).rows;

    const firstStop = stops.find((s) => s.city);
    const morningAnchor = (firstStop && coordOf(firstStop.city)) || coordOf(dayRow.anchor_city);
    const morningCity = (firstStop && firstStop.city) || dayRow.anchor_city || '';
    const endpointCoord = coordOf(dayRow.end_point) || coordOf(dayRow.start_point) || coordOf(dayRow.anchor_city) || CITY_COORDS.birmingham;
    const endpointCity = (coordOf(dayRow.end_point) && (String(dayRow.end_point).match(/birmingham|gadsden|cullman|huntsville|decatur|madison/i) || [])[0]) || dayRow.anchor_city || 'Birmingham';

    if (!morningAnchor) {
      return res.json({ ready: false, reason: 'no_anchor', morning: null, home: null, endpoint_city: endpointCity });
    }

    const taken = new Set(stops.map((s) => String(s.label || '').toLowerCase()));
    const leads = (await query(`SELECT name, city, reason, est_value FROM leads WHERE org_id=$1`, [orgId])).rows
      .filter((l) => !taken.has(String(l.name).toLowerCase()) && coordOf(l.city));

    const scored = leads.map((l) => {
      const lc = coordOf(l.city);
      const dM = haversineMi(lc, morningAnchor);
      const dE = haversineMi(lc, endpointCoord);
      return { name: l.name, city: l.city, reason: l.reason, est_value: Number(l.est_value) || 0, d_morning: dM, d_home: dE, bucket: dM <= dE ? 'morning' : 'home' };
    });

    const morning = scored.filter((l) => l.bucket === 'morning').sort((a, b) => a.d_morning - b.d_morning).slice(0, 4)
      .map((l) => ({ name: l.name, city: l.city, reason: l.reason, est_value: l.est_value, miles: l.d_morning }));
    const home = scored.filter((l) => l.bucket === 'home').sort((a, b) => a.d_home - b.d_home).slice(0, 4)
      .map((l) => ({ name: l.name, city: l.city, reason: l.reason, est_value: l.est_value, miles: l.d_home }));

    res.json({
      ready: true,
      morning_city: morningCity,
      endpoint_city: endpointCity,
      has_stops: stops.some((s) => s.kind !== 'personal'),
      morning,
      home,
    });
  } catch (e) { next(e); }
});

module.exports = router;
