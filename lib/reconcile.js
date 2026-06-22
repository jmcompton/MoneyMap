'use strict';

const { query } = require('../db');

// Thresholds for what counts as a real discrepancy.
const MIN_BASELINE = 100;   // ignore tiny accounts
const MIN_GAP = 100;        // ignore noise
const DROP_RATIO = 0.6;     // "underpaid" if current < 60% of baseline

const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
const round2 = (n) => Math.round(n * 100) / 100;

// Returns one flag per (account, manufacturer) for the manufacturer's latest
// statement, comparing it to that account's own history.
async function computeRecoveries(orgId) {
  const { rows } = await query(
    `SELECT cli.resolved_account_id AS account_id,
            ci.manufacturer_id AS manufacturer_id,
            ci.period_label AS period_label, ci.period_start AS period_start,
            SUM(cli.amount) AS amount
       FROM commission_line_items cli
       JOIN commission_imports ci ON ci.id = cli.import_id
      WHERE cli.org_id = $1 AND cli.match_status = 'matched' AND ci.period_start IS NOT NULL
        AND cli.resolved_account_id IS NOT NULL
      GROUP BY cli.resolved_account_id, ci.manufacturer_id, ci.period_label, ci.period_start`,
    [orgId]
  );
  const acctNames = new Map((await query(`SELECT id, name FROM accounts WHERE org_id = $1`, [orgId])).rows.map((r) => [r.id, r.name]));
  const mfrNames = new Map((await query(`SELECT id, name FROM manufacturers WHERE org_id = $1`, [orgId])).rows.map((r) => [r.id, r.name]));

  const mfrs = new Map();
  for (const r of rows) {
    const mid = r.manufacturer_id;
    if (!mfrs.has(mid)) mfrs.set(mid, { name: mfrNames.get(mid) || 'Manufacturer', periods: new Map() });
    const m = mfrs.get(mid);
    const pkey = String(r.period_start instanceof Date ? r.period_start.toISOString().slice(0, 10) : r.period_start);
    if (!m.periods.has(pkey)) m.periods.set(pkey, { label: r.period_label, start: pkey, accounts: new Map() });
    m.periods.get(pkey).accounts.set(r.account_id, Number(r.amount));
  }

  const items = [];
  for (const [mid, m] of mfrs) {
    const periods = [...m.periods.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
    if (periods.length < 2) continue;
    const latest = periods[periods.length - 1];
    const priorPeriods = periods.slice(0, -1);

    const accountIds = new Set();
    periods.forEach((p) => p.accounts.forEach((_, id) => accountIds.add(id)));

    for (const accId of accountIds) {
      const priorAmts = priorPeriods.map((p) => p.accounts.get(accId) || 0).filter((n) => n > 0);
      if (priorAmts.length === 0) continue;
      const baseline = avg(priorAmts);
      if (baseline < MIN_BASELINE) continue;
      const current = latest.accounts.get(accId) || 0;
      const gap = baseline - current;
      const isMissing = current === 0;
      const isUnderpaid = current > 0 && current < DROP_RATIO * baseline;
      if (!isMissing && !isUnderpaid) continue;
      if (gap < MIN_GAP) continue;

      const history = periods.map((p) => ({ label: p.label, amount: p.accounts.get(accId) || 0 }));
      items.push({
        key: `${accId}:${mid}:${latest.label}:${isMissing ? 'missing' : 'underpaid'}`,
        account_id: accId,
        account_name: acctNames.get(accId) || 'Account',
        manufacturer_id: mid,
        manufacturer: m.name,
        period_label: latest.label,
        type: isMissing ? 'missing' : 'underpaid',
        baseline: round2(baseline),
        current: round2(current),
        gap: round2(gap),
        history,
      });
    }
  }

  items.sort((a, b) => b.gap - a.gap);
  return items;
}

module.exports = { computeRecoveries };
