'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { normalizeName } = require('../lib/helpers');

const PASSWORD = 'demo1234';

async function seed() {
  const pool = getPool();

  // Clean slate (child -> parent) so seeding is repeatable.
  for (const t of [
    'commission_line_items',
    'commission_imports',
    'account_aliases',
    'contacts',
    'accounts',
    'manufacturers',
    'users',
    'organizations',
  ]) {
    await pool.query(`DELETE FROM ${t}`);
  }

  const org = (
    await pool.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      ['Compton Sales']
    )
  ).rows[0];

  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = {};
  for (const u of [
    { email: 'admin@comptonsales.com', name: 'JohnMark Compton', role: 'admin' },
    { email: 'keith@comptonsales.com', name: 'Keith Compton', role: 'manager' },
    { email: 'daniel@comptonsales.com', name: 'Daniel Compton', role: 'rep' },
  ]) {
    const row = (
      await pool.query(
        `INSERT INTO users (org_id, email, password_hash, name, role)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [org.id, u.email, hash, u.name, u.role]
      )
    ).rows[0];
    users[u.email] = row.id;
  }

  const mfrs = {};
  for (const name of ['Soudal', 'ShurTape', 'Fortress', 'Closet Maid']) {
    const row = (
      await pool.query(
        `INSERT INTO manufacturers (org_id, name) VALUES ($1,$2) RETURNING id`,
        [org.id, name]
      )
    ).rows[0];
    mfrs[name] = row.id;
  }
  const soudal = mfrs['Soudal'];

  // Canonical accounts.
  const accountDefs = [
    { key: 'a1', name: 'A1 Insulation', type: 'contractor', city: 'Gadsden', state: 'AL' },
    { key: 'alpha', name: 'Alpha Lumber', type: 'dealer', city: 'Cullman', state: 'AL' },
    { key: 'celltech', name: 'Celltech Industries', type: 'two_step', city: 'Birmingham', state: 'AL' },
    { key: 'gadsden', name: 'Gadsden Building Supply', type: 'dealer', city: 'Gadsden', state: 'AL' },
    { key: 'huntsville', name: 'Huntsville Drywall', type: 'contractor', city: 'Huntsville', state: 'AL' },
    { key: 'redstone', name: 'Redstone Contractors', type: 'contractor', city: 'Huntsville', state: 'AL' },
    { key: 'ncs', name: 'National Coatings Supply', type: 'two_step', city: 'Decatur', state: 'AL' },
    { key: 'bham', name: 'Birmingham Wholesale', type: 'one_step', city: 'Birmingham', state: 'AL' },
    { key: 'cullman', name: 'Cullman Lumber', type: 'dealer', city: 'Cullman', state: 'AL' },
    { key: 'decatur', name: 'Decatur Supply', type: 'dealer', city: 'Decatur', state: 'AL' },
    { key: 'madison', name: 'Madison Roofing', type: 'contractor', city: 'Madison', state: 'AL' },
  ];
  const acct = {};
  for (const a of accountDefs) {
    const row = (
      await pool.query(
        `INSERT INTO accounts (org_id, name, account_type, city, state, assigned_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [org.id, a.name, a.type, a.city, a.state, users['daniel@comptonsales.com']]
      )
    ).rows[0];
    acct[a.key] = row.id;
  }

  // Aliases (the moat). Normalized raw names off commission reports.
  // These let the sample CSV's "Celltech", "NCS", "A1 Insulation" auto-match.
  for (const [raw, key] of [
    ['Celltech', 'celltech'],
    ['NCS', 'ncs'],
    ['A1 Insulation', 'a1'],
  ]) {
    await pool.query(
      `INSERT INTO account_aliases (org_id, manufacturer_id, raw_name, account_id)
       VALUES ($1,$2,$3,$4)`,
      [org.id, soudal, normalizeName(raw), acct[key]]
    );
  }

  // A pre-resolved import so the money map is populated on first login.
  const imp = (
    await pool.query(
      `INSERT INTO commission_imports (org_id, manufacturer_id, uploaded_by, period_label, source_filename, row_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [org.id, soudal, users['admin@comptonsales.com'], 'May 2026', 'seed-may-2026.csv', 11, 'processed']
    )
  ).rows[0];

  const resolved = [
    ['a1', 4200], ['alpha', 3100], ['celltech', 2750], ['gadsden', 1900],
    ['huntsville', 1500], ['redstone', 1200], ['ncs', 980], ['bham', 640],
    ['cullman', 510], ['decatur', 300], ['madison', 150],
  ];
  for (const [key, amount] of resolved) {
    await pool.query(
      `INSERT INTO commission_line_items
        (import_id, org_id, manufacturer_id, raw_account_name, amount, period_label, resolved_account_id, match_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'matched')`,
      [imp.id, org.id, soudal, accountDefs.find((a) => a.key === key).name, amount, 'May 2026', acct[key]]
    );
  }

  console.log('seed complete.');
  console.log('login with any of:');
  console.log('  admin@comptonsales.com / ' + PASSWORD);
  console.log('  keith@comptonsales.com / ' + PASSWORD);
  console.log('  daniel@comptonsales.com / ' + PASSWORD);
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seed };
