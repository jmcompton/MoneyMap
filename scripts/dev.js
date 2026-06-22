'use strict';

// Instant local preview. Uses an in-memory Postgres, so it needs NO database
// setup at all. Migrates, seeds, and starts the app in one process.
// Data resets every restart — this is just for looking at the app locally.
process.env.TEST_PG_MEM = '1';

const { migrate } = require('./migrate');
const { seed } = require('./seed');

(async () => {
  await migrate();
  await seed();
  const app = require('../server');
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log('\n  MoneyMap (local preview, in-memory) running:');
    console.log('  http://localhost:' + port);
    console.log('  login: admin@comptonsales.com / demo1234\n');
  });
})().catch((e) => { console.error(e); process.exit(1); });
