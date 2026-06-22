'use strict';

// One-shot planner test on in-memory Postgres. Boots the app, exercises the
// week board + route-aware lead search + personal/lead/account stop adds, then exits.
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
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  await migrate();
  await seed();
  const app = require('../server');
  const server = app.listen(4556);
  const base = 'http://127.0.0.1:4556';
  const post = (p, b) => call(base + p, { method: 'POST', body: JSON.stringify(b) });

  await post('/api/login', { email: 'admin@comptonsales.com', password: 'demo1234' });

  // Week loads with Monday's stops + personal end-zone block
  let plan = (await call(base + '/api/plan?offset=0')).data;
  const mon = plan.days.find((x) => x.is_today) || plan.days[0];
  assert.ok(mon.stops.some((s) => s.kind === 'personal'), 'personal block present on a day');
  console.log('week:', plan.week_label, '| mon stops:', mon.stops.length);

  // Route-aware lead search on Monday: morning near first stop, home near endpoint
  const ls = (await call(base + '/api/plan/leadsearch?plan_date=' + mon.date)).data;
  assert.equal(ls.ready, true, 'lead search ready');
  assert.ok(ls.morning.length > 0 && ls.home.length > 0, 'both route buckets populated');
  // nearest morning lead should be <= nearest home lead distance to the morning anchor logic
  assert.ok(ls.morning[0].miles <= 5, 'closest morning lead hugs the first stop');
  assert.ok(ls.home.some((l) => /Birmingham/i.test(l.city)), 'home bucket has a near-endpoint lead');
  console.log('leadsearch morning_city:', ls.morning_city, '-> ', ls.morning.map((l) => l.name + '(' + l.miles + ')').join(', '));
  console.log('leadsearch endpoint_city:', ls.endpoint_city, '-> ', ls.home.map((l) => l.name + '(' + l.miles + ')').join(', '));

  // Turn on Tuesday, add an account stop, a lead stop, and a personal block
  const tue = plan.days[1].date;
  await post('/api/plan/day', { plan_date: tue, working: true, anchor_city: 'Cullman', start_point: 'Home — Birmingham, AL', end_point: 'Home — Birmingham, AL' });
  await post('/api/plan/stop', { plan_date: tue, account_id: 5, label: 'Cullman Lumber', city: 'Cullman' });
  await post('/api/plan/stop', { plan_date: tue, label: 'Lakeview Lumber', city: 'Cullman', kind: 'lead' });
  await post('/api/plan/stop', { plan_date: tue, label: 'Lunch with Keith', kind: 'personal', address: 'Downtown Cullman, AL', arrival_time: '12:00 PM' });
  plan = (await call(base + '/api/plan?offset=0')).data;
  const t = plan.days.find((x) => x.date === tue);
  assert.equal(t.stops.length, 3, 'three stops on Tuesday');
  const kinds = t.stops.map((s) => s.kind).sort().join(',');
  assert.equal(kinds, 'lead,personal,stop', 'account, lead, and personal kinds all stored');
  console.log('tue stops:', t.stops.map((s) => s.kind + ':' + s.label).join(' | '));

  // Reorder Tuesday and confirm
  const ids = t.stops.map((s) => s.id).reverse();
  await post('/api/plan/reorder', { ordered_ids: ids });
  plan = (await call(base + '/api/plan?offset=0')).data;
  const t2 = plan.days.find((x) => x.date === tue);
  assert.deepEqual(t2.stops.map((s) => s.id), ids, 'reorder persisted');

  // Home route still works
  const home = (await call(base + '/api/home')).data;
  assert.ok(Array.isArray(home.today_route), 'home route intact');
  console.log('home route stops:', home.today_route.length);

  server.close();
  console.log('\nok - planner: week board, personal blocks, lead/account adds, route-aware search, reorder all pass');
}

run().then(() => process.exit(0)).catch((e) => { console.error('PLANNER SMOKE FAILED:', e.stack || e.message); process.exit(1); });
