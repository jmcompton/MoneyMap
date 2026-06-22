'use strict';

// Single source of truth for the DB pool.
// Production / Railway: connects to Postgres via DATABASE_URL.
// Tests: when TEST_PG_MEM=1, uses an in-memory Postgres (pg-mem) so the
// full app can be exercised without a running database.

let pool;

function buildRealPool() {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. On Railway, add a PostgreSQL plugin and it is provided automatically.');
  }
  // SSL rules that work across Railway environments without manual config:
  //  - localhost / 127.0.0.1            -> no SSL (local dev)
  //  - *.railway.internal (the app)     -> no SSL (private network)
  //  - public proxy host (seeding/CLI)  -> SSL, accept Railway's cert
  let ssl = { rejectUnauthorized: false };
  try {
    const host = new URL(connectionString).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) {
      ssl = false;
    }
  } catch (_) { /* fall back to ssl on */ }
  if (process.env.PGSSL === 'disable') ssl = false;
  if (process.env.PGSSL === 'require') ssl = { rejectUnauthorized: false };
  return new Pool({ connectionString, ssl });
}

function buildMemPool() {
  const { newDb } = require('pg-mem');
  const db = newDb();
  // pg-mem needs a few functions registered to behave like Postgres.
  db.public.registerFunction({
    name: 'now',
    returns: require('pg-mem').DataType.timestamp,
    implementation: () => new Date(),
  });
  const pgAdapter = db.adapters.createPg();
  return new pgAdapter.Pool();
}

function getPool() {
  if (!pool) {
    pool = process.env.TEST_PG_MEM === '1' ? buildMemPool() : buildRealPool();
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, query };
