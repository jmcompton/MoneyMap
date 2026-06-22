'use strict';

// Full vertical-slice smoke test against the running app on in-memory Postgres.
// Proves: login, commission import, alias auto-match, unmatched resolve, and
// that a resolved name AUTO-MATCHES on the next import (the moat).
process.env.TEST_PG_MEM = '1';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getPool } = require('../db');
const { migrate } = require('../scripts/migrate');
const { seed } = require('../scripts/seed');

let cookie = '';
async function call(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, cookie ? { Cookie: cookie } : {});
  const res = await fetch(url, opts);
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  await migrate();
  await seed();
  const pool = getPool();
  const app = require('../server');
  const server = app.listen(4555);
  const base = 'http://127.0.0.1:4555';

  const soudal = (await pool.query(`SELECT id FROM manufacturers WHERE name='Soudal'`)).rows[0].id;
  const alpha = (await pool.query(`SELECT id FROM accounts WHERE name='Alpha Lumber'`)).rows[0].id;

  // login
  let r = await call(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@comptonsales.com', password: 'demo1234' }),
  });
  assert.equal(r.status, 200, 'login should succeed');

  // homepage money map already populated by seed
  r = await call(base + '/api/home');
  assert.equal(r.data.key_accounts[0].name, 'A1 Insulation', 'top key account is A1 Insulation');
  console.log('home: tracked', r.data.summary.total_commission, '| key accounts', r.data.summary.key_account_count);

  // import the sample CSV
  const csv = fs.readFileSync(path.join(__dirname, '..', 'data', 'sample-commission.csv'));
  const makeForm = () => {
    const f = new FormData();
    f.append('file', new Blob([csv]), 'sample-commission.csv');
    f.append('manufacturer_id', String(soudal));
    f.append('period_label', 'June 2026');
    f.append('account_col', 'Account');
    f.append('amount_col', 'Commission');
    return f;
  };
  r = await call(base + '/api/imports', { method: 'POST', body: makeForm() });
  console.log('import #1:', r.data);
  assert.equal(r.data.matched, 3, 'seeded aliases (A1, Celltech, NCS) auto-match');
  assert.equal(r.data.unmatched, 8, 'the rest are unmatched');
  const importId = r.data.import_id;

  // resolve "Alpha Lumber Co" -> existing "Alpha Lumber" account
  r = await call(base + '/api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manufacturer_id: soudal, raw_name: 'Alpha Lumber Co', account_id: alpha }),
  });
  console.log('resolve:', r.data);
  assert.equal(r.data.resolved_count, 1, 'one line resolved');

  // re-import the SAME csv: Alpha now auto-matches too (the moat)
  r = await call(base + '/api/imports', { method: 'POST', body: makeForm() });
  console.log('import #2 (after teaching it Alpha):', r.data);
  assert.equal(r.data.matched, 4, 'now 4 auto-match because Alpha was remembered');

  server.close();
  console.log('\nok - full slice works: import -> auto-match -> resolve -> remembered on next import');
}

run().then(() => process.exit(0)).catch((e) => { console.error('SMOKE FAILED:', e.stack || e.message); process.exit(1); });
