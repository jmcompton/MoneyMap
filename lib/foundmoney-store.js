'use strict';

// ── Found Money: period-over-period commission gap detection ─────────────────
// The idea: every (account × manufacturer) pair that has been buying builds its
// own baseline from prior confirmed commission periods. We compare the most
// recent period against that baseline and flag two things:
//
//   STOPPED  — bought consistently before, bought nothing in the latest period.
//   DROPPED  — still buying, but materially below its own baseline.
//
// Nothing is invented: everything is derived from confirmed commission_imports
// and their commission_lines. If a firm has fewer than two periods of data we
// return an empty, honest result rather than guessing.
//
// Rep scoping mirrors Reconnect: a rep sees their own accounts, a manager sees
// the whole firm. Company scoping is enforced through the owning user.

const FOUND_MONEY_CONFIG = {
  // A pair must appear in at least this many prior periods to have a baseline
  // worth trusting. Below this, a "gap" is just noise.
  minPriorPeriods: 2,
  // Flag a DROPPED pair when the latest period is at or below this share of its
  // baseline (0.60 = came in 40% or more under its own average).
  dropRatio: 0.60,
  // Ignore trivial dollars so the list stays worth reading.
  minBaselineSales: 250,
  minGapDollars: 100,
};

function toNum(v) { return Number(v) || 0; }

// The most recent confirmed period end for this scope, which anchors everything.
async function latestPeriod(pool, where, params) {
  const r = await pool.query(
    `SELECT MAX(cl.period_end) AS latest
       FROM commission_lines cl
       JOIN commission_imports ci ON ci.id = cl.import_id
       LEFT JOIN users u ON u.id = ci.rep_id
      WHERE ci.status = 'confirmed' AND cl.period_end IS NOT NULL ${where}`,
    params);
  return r.rows[0] && r.rows[0].latest ? r.rows[0].latest : null;
}

async function getFoundMoney(pool, opts) {
  const opt = opts || {};
  const scope = opt.scope === 'manager' ? 'manager' : 'rep';
  const cfg = FOUND_MONEY_CONFIG;

  // Build scope filter: company always, plus rep when not a manager.
  const params = [];
  let where = '';
  if (opt.companyId) {
    params.push(opt.companyId);
    where += ` AND (u.company_id = $${params.length} OR u.company_id IS NULL)`;
  }
  if (scope === 'rep' && opt.uid) {
    params.push(opt.uid);
    where += ` AND ci.rep_id = $${params.length}`;
  } else if (scope === 'manager' && opt.repId) {
    params.push(parseInt(opt.repId));
    where += ` AND ci.rep_id = $${params.length}`;
  }

  const latest = await latestPeriod(pool, where, params);
  if (!latest) {
    return {
      ok: true, items: [], periods: 0, latest_period: null,
      summary: { count: 0, total_found: 0, stopped: 0, dropped: 0 },
      config: cfg,
      message: 'No confirmed commission periods yet. Import commission statements to see found money.',
    };
  }

  // Pull every account × manufacturer row, split into "latest period" vs "prior".
  const p = params.slice();
  p.push(latest);
  const latestIdx = p.length;

  const sql = `
    WITH scoped AS (
      SELECT cl.account_id, cl.customer_normalized, cl.customer_raw,
             COALESCE(NULLIF(TRIM(cl.manufacturer), ''), 'Unspecified') AS manufacturer,
             cl.period_end,
             COALESCE(cl.sales_amount, 0)      AS sales,
             COALESCE(cl.commission_amount, 0) AS commission
        FROM commission_lines cl
        JOIN commission_imports ci ON ci.id = cl.import_id
        LEFT JOIN users u ON u.id = ci.rep_id
       WHERE ci.status = 'confirmed'
         AND cl.period_end IS NOT NULL
         AND COALESCE(cl.is_adjustment, FALSE) = FALSE
         ${where}
    ),
    keyed AS (
      SELECT COALESCE(account_id::text, 'raw:' || COALESCE(customer_normalized, customer_raw, '?')) AS pair_key,
             MAX(account_id) AS account_id,
             MAX(COALESCE(customer_raw, customer_normalized)) AS customer_name,
             manufacturer,
             SUM(CASE WHEN period_end =  $${latestIdx} THEN sales      ELSE 0 END) AS latest_sales,
             SUM(CASE WHEN period_end =  $${latestIdx} THEN commission ELSE 0 END) AS latest_commission,
             SUM(CASE WHEN period_end <  $${latestIdx} THEN sales      ELSE 0 END) AS prior_sales,
             SUM(CASE WHEN period_end <  $${latestIdx} THEN commission ELSE 0 END) AS prior_commission,
             COUNT(DISTINCT CASE WHEN period_end < $${latestIdx} THEN period_end END) AS prior_periods,
             MAX(CASE WHEN period_end < $${latestIdx} THEN period_end END) AS last_seen
        FROM scoped
       GROUP BY pair_key, manufacturer
    )
    SELECT * FROM keyed
     WHERE prior_periods >= ${cfg.minPriorPeriods}
     ORDER BY prior_sales DESC`;

  const r = await pool.query(sql, p);

  const items = [];
  for (const row of r.rows) {
    const priorPeriods = toNum(row.prior_periods);
    if (priorPeriods < cfg.minPriorPeriods) continue;

    // Baseline = that pair's own average period, from its own history.
    const baselineSales = toNum(row.prior_sales) / priorPeriods;
    const baselineComm = toNum(row.prior_commission) / priorPeriods;
    if (baselineSales < cfg.minBaselineSales) continue;

    const latestSales = toNum(row.latest_sales);
    const gapSales = baselineSales - latestSales;
    if (gapSales < cfg.minGapDollars) continue; // holding steady or growing

    const ratio = baselineSales > 0 ? latestSales / baselineSales : 0;
    let type = null;
    if (latestSales <= 0) type = 'stopped';
    else if (ratio <= cfg.dropRatio) type = 'dropped';
    if (!type) continue;

    const gapComm = Math.max(0, baselineComm - toNum(row.latest_commission));

    items.push({
      account_id: row.account_id || null,
      customer_name: row.customer_name || 'Unknown account',
      manufacturer: row.manufacturer,
      type,
      baseline_sales: Math.round(baselineSales * 100) / 100,
      latest_sales: Math.round(latestSales * 100) / 100,
      gap_sales: Math.round(gapSales * 100) / 100,
      gap_commission: Math.round(gapComm * 100) / 100,
      prior_periods: priorPeriods,
      last_seen: row.last_seen,
      pct_of_normal: Math.round(ratio * 100),
    });
  }

  // Biggest recoverable dollars first — that's the whole point of the screen.
  items.sort((a, b) => b.gap_sales - a.gap_sales);

  const totalFound = items.reduce((s, i) => s + i.gap_sales, 0);
  const totalComm = items.reduce((s, i) => s + i.gap_commission, 0);

  return {
    ok: true,
    items,
    latest_period: latest,
    summary: {
      count: items.length,
      total_found: Math.round(totalFound * 100) / 100,
      total_commission_at_risk: Math.round(totalComm * 100) / 100,
      stopped: items.filter(i => i.type === 'stopped').length,
      dropped: items.filter(i => i.type === 'dropped').length,
    },
    config: cfg,
  };
}

module.exports = { FOUND_MONEY_CONFIG, getFoundMoney };
