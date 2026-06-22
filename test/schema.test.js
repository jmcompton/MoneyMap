'use strict';

process.env.TEST_PG_MEM = '1';
const assert = require('assert');
const { getPool } = require('../db');
const { migrate } = require('../scripts/migrate');
const { seed } = require('../scripts/seed');
const { computeTiers } = require('../lib/helpers');

async function run() {
  const pool = getPool();
  await migrate();
  await seed();

  // 1. All tables exist.
  for (const t of [
    'organizations', 'users', 'manufacturers', 'accounts', 'contacts',
    'account_aliases', 'commission_imports', 'commission_line_items',
  ]) {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    assert.ok(Number.isInteger(r.rows[0].c), `table ${t} should be queryable`);
  }

  // 2. The alias unique constraint actually enforces.
  const mfr = (await pool.query(`SELECT id FROM manufacturers LIMIT 1`)).rows[0].id;
  const org = (await pool.query(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
  const acc = (await pool.query(`SELECT id FROM accounts LIMIT 1`)).rows[0].id;
  let threw = false;
  try {
    await pool.query(
      `INSERT INTO account_aliases (org_id, manufacturer_id, raw_name, account_id) VALUES ($1,$2,'celltech',$3)`,
      [org, mfr, acc]
    );
  } catch (_) { threw = true; }
  assert.ok(threw, 'duplicate alias (org+manufacturer+raw_name) must be rejected');

  // 3. The 80/20 engine tiers the seeded book correctly.
  const rows = (
    await pool.query(
      `SELECT a.id AS account_id, a.name, COALESCE(SUM(cli.amount),0) AS commission
         FROM commission_line_items cli JOIN accounts a ON a.id = cli.resolved_account_id
        WHERE cli.match_status='matched' GROUP BY a.id, a.name`
    )
  ).rows;
  const tiers = computeTiers(rows);
  assert.ok(tiers[0].name === 'A1 Insulation', 'top account by commission should be A1 Insulation');
  assert.ok(tiers.filter((t) => t.tier === 'A').length >= 1, 'there must be Tier A accounts');
  assert.ok(tiers.every((t) => ['A', 'B', 'C'].includes(t.tier)), 'every account gets a tier');

  console.log('ok - schema, alias constraint, and 80/20 engine all pass');
}

run().then(() => process.exit(0)).catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
