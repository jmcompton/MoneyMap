'use strict';

// ── Found Money: commission gap detection ────────────────────────────────────
// Rep firms get paid on someone else's sales, so the commission statement is the
// only place a lost customer actually shows up. This reads confirmed statements
// and answers the question a principal actually asks: where did the money go?
//
// Analysis runs per account x manufacturer (a line is won or lost individually),
// then rolls up to the ACCOUNT, because that is how a rep thinks and calls.
// The rollup is classified, and the classification IS the sales call:
//
//   ACCOUNT_LOST  every line that used to buy is now at zero -> you got fired.
//   LINES_LOST    some lines gone, others still buying -> a competitor took a
//                 line. Different conversation, different person, same dollars.
//   DECLINING     still buying everything, materially under its own baseline.
//
// Known limitation: the baseline is a trailing average, so a genuinely seasonal
// territory (roofing in January) reads as a decline. Comparing against the same
// period last year is the correct method and needs 12+ months of history.

const FOUND_MONEY_CONFIG = {
  minPriorPeriods: 2,      // below this a "gap" is just noise
  dropRatio: 0.60,         // at/below 60% of its own baseline counts as down
  minBaselineSales: 250,   // ignore trivial lines
  minGapDollars: 100,      // ignore trivial gaps
};

const num = (v) => Number(v) || 0;
const r2 = (n) => Math.round(n * 100) / 100;

async function getFoundMoney(pool, opts) {
  const opt = opts || {};
  const scope = opt.scope === 'manager' ? 'manager' : 'rep';
  const cfg = FOUND_MONEY_CONFIG;

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

  // One row per account x manufacturer x period. Grouping happens in JS so the
  // classification logic stays readable.
  const sql = `
    SELECT cl.account_id,
           COALESCE(NULLIF(TRIM(cl.customer_raw), ''), cl.customer_normalized, 'Unknown account') AS customer_name,
           COALESCE(NULLIF(TRIM(cl.manufacturer), ''), 'Unspecified') AS manufacturer,
           cl.period_end,
           SUM(COALESCE(cl.sales_amount, 0))      AS sales,
           SUM(COALESCE(cl.commission_amount, 0)) AS commission,
           MAX(p.phone)    AS phone,
           MAX(p.city)     AS city,
           MAX(p.category) AS category
      FROM commission_lines cl
      JOIN commission_imports ci ON ci.id = cl.import_id
      LEFT JOIN users u ON u.id = ci.rep_id
      LEFT JOIN prospects p ON p.id = cl.account_id
     WHERE ci.status = 'confirmed'
       AND cl.period_end IS NOT NULL
       AND COALESCE(cl.is_adjustment, FALSE) = FALSE
       ${where}
     GROUP BY cl.account_id, customer_name, manufacturer, cl.period_end
     ORDER BY cl.period_end ASC`;

  const rows = (await pool.query(sql, params)).rows;

  const emptySummary = { count: 0, total_found: 0, total_commission_at_risk: 0,
                         account_lost: 0, lines_lost: 0, declining: 0 };

  if (!rows.length) {
    return { ok: true, items: [], latest_period: null, summary: emptySummary, config: cfg,
      message: 'No confirmed commission periods yet. Import commission statements and this fills in automatically.' };
  }

  const periods = [...new Set(rows.map(r => String(r.period_end)))].sort();
  const latest = periods[periods.length - 1];

  if (periods.length < cfg.minPriorPeriods + 1) {
    return { ok: true, items: [], latest_period: latest, summary: emptySummary, config: cfg,
      message: 'Only ' + periods.length + ' commission period' + (periods.length === 1 ? '' : 's')
             + ' on file. Found Money needs at least ' + (cfg.minPriorPeriods + 1)
             + ' to tell a real drop from normal variation.' };
  }

  // ── Group into accounts -> lines -> per-period series ───────────────────────
  const accounts = new Map();
  for (const row of rows) {
    const key = row.account_id != null ? 'id:' + row.account_id : 'name:' + row.customer_name;
    if (!accounts.has(key)) {
      accounts.set(key, {
        account_id: row.account_id || null,
        customer_name: row.customer_name,
        phone: row.phone || null,
        city: row.city || null,
        category: row.category || null,
        lines: new Map(),
      });
    }
    const acct = accounts.get(key);
    if (!acct.phone && row.phone) acct.phone = row.phone;
    if (!acct.city && row.city) acct.city = row.city;
    if (!acct.lines.has(row.manufacturer)) acct.lines.set(row.manufacturer, new Map());
    const series = acct.lines.get(row.manufacturer);
    const p = String(row.period_end);
    const prev = series.get(p);
    series.set(p, {
      sales: num(row.sales) + (prev ? prev.sales : 0),
      commission: num(row.commission) + (prev ? prev.commission : 0),
    });
  }

  const items = [];

  for (const acct of accounts.values()) {
    const lineResults = [];
    let stillBuying = 0;   // what they DO still buy - context for the call
    let healthyLines = 0;

    for (const [manufacturer, series] of acct.lines) {
      const priorPeriods = periods.filter(p => p !== latest && series.has(p));
      const latestEntry = series.get(latest);
      const latestSales = latestEntry ? latestEntry.sales : 0;
      const latestComm  = latestEntry ? latestEntry.commission : 0;

      if (priorPeriods.length < cfg.minPriorPeriods) {
        stillBuying += latestSales;
        if (latestSales > 0) healthyLines++;
        continue; // too new to judge
      }

      const priorSales = priorPeriods.reduce((s, p) => s + series.get(p).sales, 0);
      const priorComm  = priorPeriods.reduce((s, p) => s + series.get(p).commission, 0);
      const baselineSales = priorSales / priorPeriods.length;
      const baselineComm  = priorComm  / priorPeriods.length;

      const gapSales = baselineSales - latestSales;
      const ratio = baselineSales > 0 ? latestSales / baselineSales : 0;
      const isStopped = latestSales <= 0;
      const isDropped = !isStopped && ratio <= cfg.dropRatio;
      const material = baselineSales >= cfg.minBaselineSales && gapSales >= cfg.minGapDollars;

      if (!material || (!isStopped && !isDropped)) {
        stillBuying += latestSales;
        if (latestSales > 0) healthyLines++;
        continue;
      }

      // Consecutive periods under baseline: a four-month slide and a sudden
      // stop are different problems and get handled differently.
      let sliding = 0;
      for (let i = periods.length - 1; i >= 0; i--) {
        const e = series.get(periods[i]);
        const v = e ? e.sales : 0;
        if (v < baselineSales * 0.9) sliding++; else break;
      }

      let lastBought = null;
      for (let i = periods.length - 1; i >= 0; i--) {
        const e = series.get(periods[i]);
        if (e && e.sales > 0) { lastBought = periods[i]; break; }
      }

      lineResults.push({
        manufacturer,
        type: isStopped ? 'stopped' : 'dropped',
        baseline_sales: r2(baselineSales),
        latest_sales: r2(latestSales),
        gap_sales: r2(gapSales),
        gap_commission: r2(Math.max(0, baselineComm - latestComm)),
        pct_of_normal: Math.round(ratio * 100),
        periods_sliding: sliding,
        last_bought: lastBought,
      });
    }

    if (!lineResults.length) continue;

    const allStopped = lineResults.every(l => l.type === 'stopped');
    let type;
    if (allStopped && healthyLines === 0) type = 'account_lost';
    else if (lineResults.some(l => l.type === 'stopped')) type = 'lines_lost';
    else type = 'declining';

    const gapSales = lineResults.reduce((s, l) => s + l.gap_sales, 0);
    const gapComm  = lineResults.reduce((s, l) => s + l.gap_commission, 0);
    const sliding  = Math.max.apply(null, lineResults.map(l => l.periods_sliding));
    const lastBought = lineResults.map(l => l.last_bought).filter(Boolean).sort().pop() || null;

    items.push({
      account_id: acct.account_id,
      customer_name: acct.customer_name,
      phone: acct.phone,
      city: acct.city,
      category: acct.category,
      type,
      gap_sales: r2(gapSales),
      gap_commission: r2(gapComm),
      still_buying: r2(stillBuying),
      line_count: lineResults.length,
      periods_sliding: sliding,
      last_bought: lastBought,
      lines: lineResults.sort((a, b) => b.gap_sales - a.gap_sales),
    });
  }

  items.sort((a, b) => b.gap_sales - a.gap_sales);

  return {
    ok: true,
    items,
    latest_period: latest,
    periods_on_file: periods.length,
    summary: {
      count: items.length,
      total_found: r2(items.reduce((s, i) => s + i.gap_sales, 0)),
      total_commission_at_risk: r2(items.reduce((s, i) => s + i.gap_commission, 0)),
      account_lost: items.filter(i => i.type === 'account_lost').length,
      lines_lost:   items.filter(i => i.type === 'lines_lost').length,
      declining:    items.filter(i => i.type === 'declining').length,
    },
    config: cfg,
  };
}

module.exports = { FOUND_MONEY_CONFIG, getFoundMoney };
