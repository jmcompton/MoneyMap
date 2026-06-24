'use strict';

// White whale: a flagged target account surfaces on the homepage, and the
// toggle endpoint can set/clear the flag.
process.env.TEST_PG_MEM = '1';
const assert = require('assert');
const { migrate } = require('../scripts/migrate');
const { seed } = require('../scripts/seed');

let cookie = '';
async function call(url, opts = {}) {
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers, cookie ? { Cookie: cookie } : {});
  const res = await fetch(url, opts);
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function run() {
  await migrate();
  await seed();
  const app = require('../server');
  const server = app.listen(4575);
  const base = 'http://127.0.0.1:4575';

  await call(base + '/api/login', { method: 'POST', body: JSON.stringify({ email: 'admin@comptonsales.com', password: 'demo1234' }) });

  // Seeded white whale shows on the homepage.
  const home = await call(base + '/api/home');
  assert.ok(home.data.white_whale, 'home returns a white whale');
  console.log('white whale:', home.data.white_whale.name, '$' + home.data.white_whale.target_value, home.data.white_whale.days_since + 'd quiet');
  assert.ok(home.data.white_whale.target_value > 0, 'white whale has a target value');
  assert.ok(home.data.white_whale.days_since >= 1, 'white whale shows days quiet');
  const whaleId = home.data.white_whale.account_id;

  // Account detail reflects the flag.
  const detail = await call(base + '/api/accounts/' + whaleId);
  assert.equal(detail.data.account.is_target, true, 'flagged account reports is_target true');

  // Flag a different account, then it should win the homepage slot if higher value.
  const accts = await call(base + '/api/accounts');
  const other = accts.data.accounts.find((a) => a.account_id !== whaleId);
  await call(base + '/api/accounts/' + other.account_id + '/target', { method: 'POST', body: JSON.stringify({ is_target: true, target_value: 250000 }) });
  const home2 = await call(base + '/api/home');
  assert.equal(home2.data.white_whale.account_id, other.account_id, 'higher-value target becomes the white whale');

  // Unflag it, original whale returns.
  await call(base + '/api/accounts/' + other.account_id + '/target', { method: 'POST', body: JSON.stringify({ is_target: false }) });
  const home3 = await call(base + '/api/home');
  assert.equal(home3.data.white_whale.account_id, whaleId, 'unflagging restores the original white whale');

  server.close();
  console.log('\nok - white whale: seeded, surfaced on home, toggle + ranking by value all pass');
}

run().then(() => process.exit(0)).catch((e) => { console.error('WHALE SMOKE FAILED:', e.stack || e.message); process.exit(1); });
