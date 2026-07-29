'use strict';

// ── Clear Demo Data (manager-only, scoped) ───────────────────────────────────
// Removes ONLY the sample/demo accounts that came in from the sample commission
// report: prospects WHERE source='Commission Import' AND user_id = the caller.
// NEVER touches any other source and NEVER touches another user's data (the
// user_id scope is the hard guard). Mounted behind requireAuthAPI +
// requireManagerAPI in server.js.

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// The single scoped predicate used by BOTH preview and clear, so they can never
// drift apart. $1 = the caller's user_id.
const SCOPE_WHERE = `source IN ('Commission Import','Demo Data') AND user_id = $1`;

// GET /api/admin/demo-data/preview — exactly what clear would delete.
router.get('/preview', async (req, res) => {
  try {
    const uid = req.session.user.id;
    const r = await pool.query(
      `SELECT company AS name, city, source
         FROM prospects
        WHERE ${SCOPE_WHERE}
        ORDER BY company ASC`, [uid]);
    res.json({ count: r.rows.length, accounts: r.rows });
  } catch (e) {
    console.error('[demo-data/preview]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/demo-data/clear — delete the scoped set in one transaction.
router.post('/clear', async (req, res) => {
  const uid = req.session.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The exact account ids in scope (source + owner). Everything keys off this.
    const idsR = await client.query(
      `SELECT id FROM prospects WHERE ${SCOPE_WHERE}`, [uid]);
    const accountIds = idsR.rows.map(x => x.id);

    if (!accountIds.length) {
      await client.query('COMMIT');
      return res.json({ deleted_accounts: 0, deleted_lines: 0, deleted_opportunities: 0 });
    }

    // Lines these accounts touch — candidates to become orphaned once the
    // accounts (and their account_lines) are gone.
    const candR = await client.query(
      'SELECT DISTINCT line_id FROM account_lines WHERE account_id = ANY($1::int[])',
      [accountIds]);
    const candidateLineIds = candR.rows.map(x => x.line_id).filter(v => v != null);

    // (1) Cross-sell opportunities: derived live from account_lines (no persisted
    //     table), so deleting the account_lines below removes them implicitly.
    //     Count = the rollup rows we're about to drop for these accounts.
    const oppR = await client.query(
      'SELECT COUNT(*)::int AS c FROM account_lines WHERE account_id = ANY($1::int[])',
      [accountIds]);
    const deletedOpportunities = oppR.rows[0].c;

    // (2) Delete the per-account × per-line rollup rows.
    await client.query(
      'DELETE FROM account_lines WHERE account_id = ANY($1::int[])', [accountIds]);

    // (2b) Demo schedule stops and tasks tied to these accounts.
    await client.query('DELETE FROM planner_items WHERE account_id = ANY($1::int[])', [accountIds]);
    await client.query('DELETE FROM tasks WHERE account_id = ANY($1::int[])', [accountIds]);

    // (3) Delete the demo accounts themselves. (commission_customer_map cascades;
    //     commission_lines.account_id is SET NULL — raw facts are preserved.)
    const delAcct = await client.query(
      `DELETE FROM prospects WHERE ${SCOPE_WHERE}`, [uid]);

    // (4) Delete any line that is now orphaned (no remaining account_lines).
    let deletedLines = 0;
    if (candidateLineIds.length) {
      const delLines = await client.query(
        `DELETE FROM lines
           WHERE id = ANY($1::int[])
             AND NOT EXISTS (SELECT 1 FROM account_lines al WHERE al.line_id = lines.id)`,
        [candidateLineIds]);
      deletedLines = delLines.rowCount;
    }

    await client.query('COMMIT');
    res.json({
      deleted_accounts: delAcct.rowCount,
      deleted_lines: deletedLines,
      deleted_opportunities: deletedOpportunities,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[demo-data/clear]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


// ── Seed Demo Data (manager-only, scoped to caller) ──────────────────────────
// Builds a believable firm: manufacturers, accounts, six monthly commission
// periods, and per-account buying patterns. Three deliberate patterns so the
// Reconnect and Found Money screens have a real story to tell:
//   healthy  — buys every period, shows up nowhere (correct)
//   stopped  — bought early periods, went silent → Reconnect + Found Money
//   dropped  — still buying but well under its own normal → Found Money
// Everything is tagged source='Demo Data' so the existing clear endpoint can
// be pointed at it, and it is always scoped to the calling user + company.

const DEMO_LINES = ['Quality Aluminum', 'BOSS Sealants', 'ShurTape', 'Alum-A-Pole', 'Fortress Railing'];

const DEMO_ACCOUNTS = [
  // pattern: healthy | stopped | dropped     scale drives dollar size
  { company: 'Birmingham Building Supply', category: 'Distributor',  city: 'Birmingham', state: 'AL', pattern: 'stopped', scale: 3.2, lines: ['Quality Aluminum', 'BOSS Sealants'] },
  { company: 'Southern Roofing Supply',    category: 'Distributor',  city: 'Hoover',     state: 'AL', pattern: 'dropped', scale: 2.8, lines: ['BOSS Sealants', 'ShurTape'] },
  { company: 'Gulf Coast Lumber',          category: 'Lumber Yard',  city: 'Mobile',     state: 'AL', pattern: 'stopped', scale: 2.4, lines: ['Quality Aluminum'] },
  { company: 'Tri-State Wholesale',        category: 'Distributor',  city: 'Huntsville', state: 'AL', pattern: 'healthy', scale: 3.0, lines: ['Quality Aluminum', 'Fortress Railing'] },
  { company: 'Magnolia Exteriors',         category: 'Contractor',   city: 'Montgomery', state: 'AL', pattern: 'dropped', scale: 1.6, lines: ['Alum-A-Pole', 'ShurTape'] },
  { company: 'Delta Siding & Supply',      category: 'Dealer',       city: 'Tuscaloosa', state: 'AL', pattern: 'stopped', scale: 1.9, lines: ['Quality Aluminum', 'ShurTape'] },
  { company: 'Northside Contractors',      category: 'Contractor',   city: 'Decatur',    state: 'AL', pattern: 'healthy', scale: 1.2, lines: ['BOSS Sealants'] },
  { company: 'Peachtree Building Products',category: 'Distributor',  city: 'Atlanta',    state: 'GA', pattern: 'dropped', scale: 3.6, lines: ['Fortress Railing', 'Quality Aluminum'] },
  { company: 'Cobb County Supply',         category: 'Dealer',       city: 'Marietta',   state: 'GA', pattern: 'stopped', scale: 1.1, lines: ['ShurTape'] },
  { company: 'Savannah Coastal Supply',    category: 'Distributor',  city: 'Savannah',   state: 'GA', pattern: 'healthy', scale: 2.2, lines: ['BOSS Sealants', 'Alum-A-Pole'] },
  { company: 'Volunteer Roofing Supply',   category: 'Distributor',  city: 'Chattanooga',state: 'TN', pattern: 'dropped', scale: 2.0, lines: ['BOSS Sealants'] },
  { company: 'Music City Materials',       category: 'Lumber Yard',  city: 'Nashville',  state: 'TN', pattern: 'stopped', scale: 2.6, lines: ['Quality Aluminum', 'Fortress Railing'] },
  { company: 'Riverbend Supply Co',        category: 'Distributor',  city: 'Knoxville',  state: 'TN', pattern: 'mixed',   scale: 3.4, lines: ['BOSS Sealants', 'Quality Aluminum'] },
  { company: 'Piedmont Building Center',   category: 'Dealer',       city: 'Augusta',    state: 'GA', pattern: 'sliding', scale: 2.7, lines: ['Fortress Railing', 'ShurTape'] },
];

// Month-end date for N months back from the current month.
function monthEnd(monthsBack) {
  const d = new Date();
  const anchor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1));
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
}
function monthStart(monthsBack) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1));
}
function iso(d) { return d.toISOString().slice(0, 10); }

// How much this account bought in a given period index (0 = oldest, 5 = latest).
function salesFor(pattern, idx, scale, lineIdx) {
  const base = 9000 * scale;
  const wobble = 1 + (((idx * 37) % 11) - 5) / 40; // deterministic +/-12%
  if (pattern === 'healthy') return base * wobble;
  if (pattern === 'stopped') return idx <= 2 ? base * wobble : 0;  // silent after period 3
  if (pattern === 'dropped') return idx >= 5 ? base * 0.28 : base * wobble; // latest way down
  // 'mixed': the first line is lost to a competitor while the rest keep buying.
  // This is the most telling case — same account, one line gone.
  if (pattern === 'mixed') {
    if (lineIdx === 0) return idx <= 3 ? base * wobble : 0;
    return base * wobble;
  }
  // 'sliding': a slow four-period decline rather than a hard stop.
  if (pattern === 'sliding') {
    const decay = [1, 1, 0.95, 0.78, 0.6, 0.42][idx] || 1;
    return base * decay;
  }
  return base;
}

// POST /api/admin/demo-data/seed — build the demo firm for the caller.
router.post('/seed', async (req, res) => {
  const uid = req.session.user.id;
  const companyId = req.companyId || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-running the seed must not stack duplicates, so clear any previous demo
    // firm for this user first. Only touches source='Demo Data' rows the caller
    // owns, plus the statements this seeder created.
    const prevAcct = await client.query(
      `SELECT id FROM prospects WHERE source = 'Demo Data' AND user_id = $1`, [uid]);
    const prevIds = prevAcct.rows.map(r => r.id);
    if (prevIds.length) {
      await client.query('DELETE FROM account_lines WHERE account_id = ANY($1::int[])', [prevIds]);
      await client.query(`DELETE FROM prospects WHERE source = 'Demo Data' AND user_id = $1`, [uid]);
    }
    await client.query(
      `DELETE FROM commission_imports WHERE rep_id = $1 AND source_filename LIKE 'demo-statement-%'`,
      [uid]);

    // 1) Manufacturer lines (shared catalog, matched by name).
    const lineIds = {};
    for (const name of DEMO_LINES) {
      const ex = await client.query('SELECT id FROM lines WHERE LOWER(name)=LOWER($1) LIMIT 1', [name]);
      if (ex.rows.length) { lineIds[name] = ex.rows[0].id; continue; }
      const ins = await client.query(
        'INSERT INTO lines (name, company_id) VALUES ($1,$2) RETURNING id', [name, companyId]);
      lineIds[name] = ins.rows[0].id;
    }

    // 2) Six monthly commission periods, oldest → newest, all confirmed.
    const PERIODS = 6;
    const importIds = [];
    for (let i = PERIODS - 1; i >= 0; i--) {
      const ps = monthStart(i + 1), pe = monthEnd(i + 1);
      const imp = await client.query(
        `INSERT INTO commission_imports
           (rep_name, rep_id, period_start, period_end, source_filename, row_count,
            total_sales, total_commission, status, created_by, company_id)
         VALUES ($1,$2,$3,$4,$5,0,0,0,'confirmed',$2,$6) RETURNING id`,
        [req.session.user.name || 'Demo', uid, iso(ps), iso(pe),
         'demo-statement-' + iso(pe) + '.pdf', companyId]);
      importIds.push({ id: imp.rows[0].id, start: ps, end: pe });
    }

    // 3) Accounts + their commission history.
    let accountsMade = 0, linesMade = 0;
    for (const a of DEMO_ACCOUNTS) {
      const pr = await client.query(
        `INSERT INTO prospects
           (user_id, company, category, city, state, phone, status, priority, source, company_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'Customer','Medium','Demo Data',$7, NOW() - INTERVAL '8 months')
         RETURNING id`,
        [uid, a.company, a.category, a.city, a.state,
         '205' + String(5550000 + accountsMade * 137).slice(-7), companyId]);
      const accountId = pr.rows[0].id;
      accountsMade++;

      // Per manufacturer, write a commission line for each period it bought in.
      for (let lineIdx = 0; lineIdx < a.lines.length; lineIdx++) {
        const lineName = a.lines[lineIdx];
        const lineId = lineIds[lineName];
        const share = 1 / a.lines.length;
        let totalSales = 0, totalComm = 0, first = null, last = null, cnt = 0;

        for (let idx = 0; idx < importIds.length; idx++) {
          const imp = importIds[idx];
          const sales = salesFor(a.pattern, idx, a.scale, lineIdx) * share;
          if (sales <= 0) continue;
          const comm = sales * 0.05;
          await client.query(
            `INSERT INTO commission_lines
               (import_id, rep_name, manufacturer, customer_raw, customer_normalized,
                account_id, sales_amount, commission_amount, period_start, period_end, company_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [imp.id, req.session.user.name || 'Demo', lineName, a.company,
             a.company.toLowerCase(), accountId, sales.toFixed(2), comm.toFixed(2),
             iso(imp.start), iso(imp.end), companyId]);
          totalSales += sales; totalComm += comm; cnt++;
          if (!first) first = imp.end;
          last = imp.end;
          linesMade++;
        }

        if (cnt > 0) {
          await client.query(
            `INSERT INTO account_lines
               (account_id, line_id, total_sales, total_commission, line_count,
                first_period, last_period, company_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (account_id, line_id) DO UPDATE SET
               total_sales = EXCLUDED.total_sales,
               total_commission = EXCLUDED.total_commission,
               line_count = EXCLUDED.line_count,
               first_period = EXCLUDED.first_period,
               last_period = EXCLUDED.last_period`,
            [accountId, lineId, totalSales.toFixed(2), totalComm.toFixed(2), cnt,
             iso(first), iso(last), companyId]);
        }
      }
    }

    // 4) Roll the period totals up onto the imports so the numbers tie out.
    for (const imp of importIds) {
      await client.query(
        `UPDATE commission_imports ci
            SET total_sales = s.ts, total_commission = s.tc, row_count = s.rc
           FROM (SELECT COALESCE(SUM(sales_amount),0) ts,
                        COALESCE(SUM(commission_amount),0) tc,
                        COUNT(*) rc
                   FROM commission_lines WHERE import_id = $1) s
          WHERE ci.id = $1`, [imp.id]);
    }

    // 5) Light up Today's schedule + Today's tasks on the home dashboard.
    //    Pull the demo accounts we just made, clear any lingering demo schedule/
    //    tasks (clean re-seed), then plant a few stops, one meeting, and tasks.
    const demoRows = await client.query(
      `SELECT id, company, city FROM prospects WHERE source='Demo Data' AND user_id=$1 ORDER BY id ASC`, [uid]);
    const demo = demoRows.rows;
    const demoIds = demo.map(r => r.id);
    if (demoIds.length) {
      await client.query('DELETE FROM tasks WHERE user_id=$1 AND account_id = ANY($2::int[])', [uid, demoIds]);
      await client.query('DELETE FROM planner_items WHERE rep_id=$1 AND account_id = ANY($2::int[])', [uid, demoIds]);
    }
    const dayISO = (off) => iso(new Date(Date.now() + off * 86400000));
    const todayISO = dayISO(0);
    // Today's stops must sit in ONE metro so the route + home map stay tight and
    // realistic (not Birmingham→Mobile). Prefer the Birmingham cluster.
    const METRO = ['birmingham','hoover','vestavia hills','vestavia','bessemer','trussville','homewood','pelham','alabaster','tuscaloosa'];
    let dayAccts = demo.filter(r => METRO.indexOf(String(r.city || '').toLowerCase()) >= 0);
    if (dayAccts.length < 2) dayAccts = demo.slice(0, 3);
    dayAccts = dayAccts.slice(0, 3);
    let so = 1;
    for (let i = 0; i < dayAccts.length; i++) {
      await client.query(
        `INSERT INTO planner_items (rep_id, planned_date, item_type, account_id, sort_order, source)
         VALUES ($1,$2,'stop',$3,$4,'manual')`,
        [uid, todayISO, dayAccts[i].id, so++]);
    }
    if (dayAccts.length > 1) {
      await client.query(
        `INSERT INTO planner_items (rep_id, planned_date, item_type, account_id, title, appt_time, note, sort_order, source)
         VALUES ($1,$2,'appointment',$3,$4,$5,$6,$7,'manual')`,
        [uid, todayISO, dayAccts[1].id, 'Quarterly review — ' + dayAccts[1].company, '10:30 AM', 'Confirmed with buyer', so++]);
    }
    // Tasks: one overdue, two due today (tied to demo accounts).
    const demoTasks = [
      { body: 'Email pricing to ' + (demo[0] ? demo[0].company : 'a customer'), due: dayISO(-3), acct: demo[0] ? demo[0].id : null },
      { body: 'Send firestop spec to ' + (demo[1] ? demo[1].company : 'a customer'), due: todayISO, acct: demo[1] ? demo[1].id : null },
      { body: 'Follow up on the open quote with ' + (demo[2] ? demo[2].company : 'a customer'), due: todayISO, acct: demo[2] ? demo[2].id : null },
    ];
    for (const t of demoTasks) {
      await client.query(
        `INSERT INTO tasks (user_id, account_id, body, due_date, company_id) VALUES ($1,$2,$3,$4,$5)`,
        [uid, t.acct, t.body, t.due, companyId]);
    }

    await client.query('COMMIT');
    res.json({
      ok: true,
      accounts: accountsMade,
      commission_lines: linesMade,
      periods: importIds.length,
      message: 'Demo firm seeded. Reconnect and Found Money now have data.',
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[demo-data/seed]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
