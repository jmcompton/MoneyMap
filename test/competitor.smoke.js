'use strict';

// Competitor analysis (Layer 1): an account buying other lines but not a given
// manufacturer shows up as a conquest gap for that manufacturer, ranked by
// total spend with us.
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
  const server = app.listen(4574);
  const base = 'http://127.0.0.1:4574';

  await call(base + '/api/login', { method: 'POST', body: JSON.stringify({ email: 'admin@comptonsales.com', password: 'demo1234' }) });

  const lines = await call(base + '/api/competitor/lines');
  console.log('lines:', lines.data.lines.map((l) => `${l.name}:${l.gap_count}gaps/$${l.gap_value}`).join('  '));
  assert.ok(lines.data.lines.length >= 1, 'at least one manufacturer line');
  const withGaps = lines.data.lines.find((l) => l.gap_count > 0);
  assert.ok(withGaps, 'at least one line has conquest gaps');

  const gaps = await call(base + '/api/competitor/gaps?manufacturer_id=' + withGaps.manufacturer_id);
  console.log(`gaps for ${gaps.data.manufacturer.name}:`, gaps.data.gaps.map((g) => `${g.name}($${g.total}, buys ${g.lines.join('/')})`).slice(0, 4).join('  '));
  assert.ok(gaps.data.gaps.length >= 1, 'gap list is non-empty');
  // every gap account buys at least one OTHER line and not the target line
  assert.ok(gaps.data.gaps.every((g) => g.lines.length >= 1), 'every gap account buys at least one other line');
  assert.ok(gaps.data.gaps.every((g) => !g.lines.includes(gaps.data.manufacturer.name)), 'no gap account already buys the target line');
  // ranked by total desc
  const totals = gaps.data.gaps.map((g) => g.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a), 'gaps ranked by spend with us, biggest first');

  server.close();
  console.log('\nok - competitor analysis: conquest gaps computed and ranked correctly');
}

run().then(() => process.exit(0)).catch((e) => { console.error('COMPETITOR SMOKE FAILED:', e.stack || e.message); process.exit(1); });
