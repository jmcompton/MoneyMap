'use strict';

// PDF import smoke: read the sample PDF via /preview, then /commit, and confirm
// the alias moat auto-matches the seeded names (Celltech, NCS, A1) on a PDF too.
process.env.TEST_PG_MEM = '1';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
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
  const app = require('../server');
  const server = app.listen(4558);
  const base = 'http://127.0.0.1:4558';

  await call(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@comptonsales.com', password: 'demo1234' }) });

  // preview the sample PDF
  const buf = fs.readFileSync(path.join(__dirname, '..', 'data', 'sample-commission.pdf'));
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), 'sample-commission.pdf');
  const prev = await call(base + '/api/imports/pdf/preview', { method: 'POST', body: fd });
  console.log('preview:', { method: prev.data.method, rows: prev.data.rows.length });
  assert.equal(prev.status, 200, 'preview ok');
  assert.ok(prev.data.rows.length >= 10, 'parsed at least 10 rows from the PDF');
  assert.ok(prev.data.rows.find((r) => /A1 Insulation/i.test(r.raw_name) && Math.abs(r.amount - 4200.5) < 0.01), 'A1 row parsed with correct amount');
  assert.ok(!prev.data.rows.find((r) => /total/i.test(r.raw_name)), 'TOTAL row was skipped');

  // commit the reviewed rows (Soudal = manufacturer 1)
  const commit = await call(base + '/api/imports/commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manufacturer_id: 1, period_label: 'June 2026 (PDF)', filename: 'sample-commission.pdf', rows: prev.data.rows }),
  });
  console.log('commit:', commit.data);
  assert.equal(commit.status, 200, 'commit ok');
  assert.equal(commit.data.total, prev.data.rows.length, 'all rows imported');
  // 3 seeded aliases for Soudal (Celltech, NCS, A1) should auto-match
  assert.ok(commit.data.matched >= 3, 'seeded aliases auto-matched on the PDF import');

  server.close();
  console.log('\nok - PDF import: extract -> preview -> commit -> alias auto-match all pass');
}

run().then(() => process.exit(0)).catch((e) => { console.error('PDF SMOKE FAILED:', e.stack || e.message); process.exit(1); });
