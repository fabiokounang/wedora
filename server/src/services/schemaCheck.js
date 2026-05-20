const fs = require('fs');
const path = require('path');
const { one, query } = require('../db');

async function listExpectedMigrations() {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function hasMigrationsTable(dbName) {
  const row = await one(
    `SELECT COUNT(1) AS n
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'schema_migrations'`,
    [dbName]
  );
  return !!(row && Number(row.n) > 0);
}

async function checkSchemaUpToDate() {
  const dbName = process.env.DB_NAME || 'wedding_saas';
  const expected = await listExpectedMigrations();
  const tableExists = await hasMigrationsTable(dbName);
  if (!tableExists) {
    return {
      ok: false,
      reason: 'schema_migrations table missing',
      pending: expected,
    };
  }

  const rows = await query('SELECT filename FROM schema_migrations ORDER BY filename');
  const applied = new Set(rows.map((r) => r.filename));
  const pending = expected.filter((f) => !applied.has(f));
  return {
    ok: pending.length === 0,
    reason: pending.length ? 'pending migrations' : null,
    pending,
  };
}

module.exports = { checkSchemaUpToDate };

