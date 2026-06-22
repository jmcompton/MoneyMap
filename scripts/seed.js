'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { normalizeName } = require('../lib/helpers');

const PASSWORD = 'demo1234';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function seed() {
  const pool = getPool();

  for (const t of [
    'tasks', 'route_stops', 'leads', 'deals',
    'commission_line_items', 'commission_imports', 'account_aliases',
    'contacts', 'accounts', 'manufacturers', 'users', 'organizations',
  ]) {
    await pool.query(`DELETE FROM ${t}`);
  }

  const org = (await pool.query(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`, ['Compton Sales']
  )).rows[0];

  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = {};
  for (const u of [
    { email: 'admin@comptonsales.com', name: 'JohnMark Compton', role: 'admin' },
    { email: 'keith@comptonsales.com', name: 'Keith Compton', role: 'manager' },
    { email: 'daniel@comptonsales.com', name: 'Daniel Compton', role: 'rep' },
  ]) {
    const row = (await pool.query(
      `INSERT INTO users (org_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [org.id, u.email, hash, u.name, u.role]
    )).rows[0];
    users[u.email] = row.id;
  }
  const danId = users['daniel@comptonsales.com'];

  const mfrs = {};
  for (const name of ['Soudal', 'ShurTape', 'Fortress', 'Closet Maid']) {
    const row = (await pool.query(
      `INSERT INTO manufacturers (org_id, name) VALUES ($1,$2) RETURNING id`, [org.id, name]
    )).rows[0];
    mfrs[name] = row.id;
  }
  const soudal = mfrs['Soudal'];

  const accountDefs = [
    { key: 'a1', name: 'A1 Insulation', type: 'contractor', city: 'Gadsden', last: 8 },
    { key: 'alpha', name: 'Alpha Lumber', type: 'dealer', city: 'Cullman', last: 52 },
    { key: 'celltech', name: 'Celltech Industries', type: 'two_step', city: 'Birmingham', last: 12 },
    { key: 'gadsden', name: 'Gadsden Building Supply', type: 'dealer', city: 'Gadsden', last: 67 },
    { key: 'huntsville', name: 'Huntsville Drywall', type: 'contractor', city: 'Huntsville', last: 5 },
    { key: 'redstone', name: 'Redstone Contractors', type: 'contractor', city: 'Huntsville', last: 41 },
    { key: 'ncs', name: 'National Coatings Supply', type: 'two_step', city: 'Decatur', last: 80 },
    { key: 'bham', name: 'Birmingham Wholesale', type: 'one_step', city: 'Birmingham', last: 20 },
    { key: 'cullman', name: 'Cullman Lumber', type: 'dealer', city: 'Cullman', last: 95 },
    { key: 'decatur', name: 'Decatur Supply', type: 'dealer', city: 'Decatur', last: 30 },
    { key: 'madison', name: 'Madison Roofing', type: 'contractor', city: 'Madison', last: 110 },
  ];
  const acct = {};
  for (const a of accountDefs) {
    const row = (await pool.query(
      `INSERT INTO accounts (org_id, name, account_type, city, state, assigned_user_id, last_contact_at)
       VALUES ($1,$2,$3,$4,'AL',$5,$6) RETURNING id`,
      [org.id, a.name, a.type, a.city, danId, daysAgo(a.last)]
    )).rows[0];
    acct[a.key] = row.id;
  }

  for (const [raw, key] of [['Celltech', 'celltech'], ['NCS', 'ncs'], ['A1 Insulation', 'a1']]) {
    await pool.query(
      `INSERT INTO account_aliases (org_id, manufacturer_id, raw_name, account_id) VALUES ($1,$2,$3,$4)`,
      [org.id, soudal, normalizeName(raw), acct[key]]
    );
  }

  const imp = (await pool.query(
    `INSERT INTO commission_imports (org_id, manufacturer_id, uploaded_by, period_label, source_filename, row_count, status)
     VALUES ($1,$2,$3,'May 2026','seed-may-2026.csv',11,'processed') RETURNING id`,
    [org.id, soudal, users['admin@comptonsales.com']]
  )).rows[0];
  const resolved = [
    ['a1', 4200], ['alpha', 3100], ['celltech', 2750], ['gadsden', 1900], ['huntsville', 1500],
    ['redstone', 1200], ['ncs', 980], ['bham', 640], ['cullman', 510], ['decatur', 300], ['madison', 150],
  ];
  for (const [key, amount] of resolved) {
    await pool.query(
      `INSERT INTO commission_line_items
        (import_id, org_id, manufacturer_id, raw_account_name, amount, period_label, resolved_account_id, match_status)
       VALUES ($1,$2,$3,$4,$5,'May 2026',$6,'matched')`,
      [imp.id, org.id, soudal, accountDefs.find((a) => a.key === key).name, amount, acct[key]]
    );
  }

  for (const d of [
    { account: 'gadsden', name: 'Riverside Townhomes', mfr: 'Closet Maid', value: 42000, stage: 'Proposal', close: 9 },
    { account: 'a1', name: 'Northgate Apartments', mfr: 'Soudal', value: 18500, stage: 'Negotiation', close: 21 },
    { account: 'cullman', name: 'Cullman Retail Build', mfr: 'Fortress', value: 9500, stage: 'Quote sent', close: 5 },
  ]) {
    await pool.query(
      `INSERT INTO deals (org_id, account_id, name, manufacturer, value, stage, close_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [org.id, acct[d.account], d.name, d.mfr, d.value, d.stage, daysFromNow(d.close)]
    );
  }

  for (const l of [
    { name: 'Summit Spray Foam', city: 'Gadsden', reason: 'Buys Soudal from a competitor, 0.4 mi from your A1 stop', est: 15000, dist: 0.4 },
    { name: 'Lakeview Lumber', city: 'Cullman', reason: 'Large dealer near Cullman Lumber with no rep on file', est: 22000, dist: 1.2 },
    { name: 'Ridgeline Contractors', city: 'Huntsville', reason: 'Active Fortress buyer that matches your top accounts', est: 8000, dist: 0.8 },
  ]) {
    await pool.query(
      `INSERT INTO leads (org_id, name, city, reason, est_value, distance_mi) VALUES ($1,$2,$3,$4,$5,$6)`,
      [org.id, l.name, l.city, l.reason, l.est, l.dist]
    );
  }

  const stops = [
    { account: 'a1', label: 'A1 Insulation', city: 'Gadsden', time: '7:30 AM', status: 'done' },
    { account: 'gadsden', label: 'Gadsden Building Supply', city: 'Gadsden', time: '9:15 AM', status: 'planned' },
    { account: 'redstone', label: 'Redstone Contractors', city: 'Huntsville', time: '11:00 AM', status: 'planned' },
    { account: 'huntsville', label: 'Huntsville Drywall', city: 'Huntsville', time: '1:30 PM', status: 'planned' },
  ];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    await pool.query(
      `INSERT INTO route_stops (org_id, user_id, account_id, label, city, arrival_time, position, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [org.id, danId, acct[s.account], s.label, s.city, s.time, i + 1, s.status]
    );
  }

  for (const t of [
    { account: 'gadsden', title: 'Call Gadsden Building Supply about the Fortress 231 promo', due: 0 },
    { account: null, title: 'Send Closet Maid holiday cutoff schedule to all dealers', due: 1 },
    { account: 'gadsden', title: 'Follow up on the Riverside Townhomes quote', due: 2 },
  ]) {
    await pool.query(
      `INSERT INTO tasks (org_id, user_id, account_id, title, due_date) VALUES ($1,$2,$3,$4,$5)`,
      [org.id, danId, t.account ? acct[t.account] : null, t.title, daysFromNow(t.due)]
    );
  }

  console.log('seed complete. login: admin@comptonsales.com / ' + PASSWORD);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => { console.error('seed failed:', err.message); process.exit(1); });
}

module.exports = { seed };
