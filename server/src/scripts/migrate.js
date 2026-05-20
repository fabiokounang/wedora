require('dotenv').config();
const { runMigrations } = require('../services/migrateRunner');

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});
