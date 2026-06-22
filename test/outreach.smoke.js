'use strict';

// Outreach smoke: manufacturer lists build from commission data, recipients
// resolve to contact emails, and the draft returns a usable email even with no
// API key (fallback path).
process.env.TEST_PG_MEM = '1';
delete process.env.ANTHROPIC_API_KEY; // force the fallback draft path
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
  const server = app.listen(4559);
  const base = 'http://127.0.0.1:4559';

  await call(base + '/api/login', { method: 'POST', body: JSON.stringify({ email: 'admin@comptonsales.com', password: 'demo1234' }) });

  const seg = await call(base + '/api/outreach/segments');
  console.log('segments:', seg.data.segments.map((s) => `${s.name}:${s.account_count}a/${s.email_account_count}e`).join('  '));
  assert.ok(seg.data.segments.length >= 1, 'at least one manufacturer list built from commissions');
  const soudal = seg.data.segments.find((s) => /soudal/i.test(s.name)) || seg.data.segments[0];
  assert.ok(soudal.account_count > 0, 'list has buyer accounts');

  const rec = await call(base + '/api/outreach/recipients?manufacturer_id=' + soudal.manufacturer_id);
  console.log('recipients:', rec.data.recipients.length, '| missing email:', rec.data.missing.length);
  assert.ok(rec.data.recipients.length >= 1, 'at least one emailable recipient');
  assert.ok(rec.data.recipients.every((r) => /@/.test(r.email)), 'every recipient has a real email');

  const draft = await call(base + '/api/outreach/draft', { method: 'POST', body: JSON.stringify({ manufacturer_id: soudal.manufacturer_id, promo: 'Fortress 231 promo' }) });
  console.log('draft ai:', draft.data.ai, '| subject:', JSON.stringify(draft.data.subject));
  assert.equal(draft.data.ai, false, 'fallback path used with no key');
  assert.ok(draft.data.subject && draft.data.body.length > 40, 'draft has a subject and a real body');
  assert.ok(!/—/.test(draft.data.body), 'no em dashes in the draft');

  server.close();
  console.log('\nok - outreach: segments from commissions, email recipients, voice draft fallback all pass');
}

run().then(() => process.exit(0)).catch((e) => { console.error('OUTREACH SMOKE FAILED:', e.stack || e.message); process.exit(1); });
