'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool } = require('../db');

async function migrate() {
  const pool = getPool();
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
    console.log('migrated:', file);
  }
  console.log('migrations complete');
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
