#!/usr/bin/env node
/**
 * Restore MySQL from .sql or .sql.gz. Run from server/:
 *   npm run db:restore -- path/to/backup.sql
 * DANGEROUS: overwrites DB_NAME. Set DB_RESTORE_CONFIRM=yes to allow.
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

if (String(process.env.DB_RESTORE_CONFIRM || '') !== 'yes') {
  console.error('[db:restore] Set DB_RESTORE_CONFIRM=yes in environment to run (destructive).');
  process.exit(1);
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('[db:restore] Usage: npm run db:restore -- <backup.sql|.sql.gz>');
  process.exit(1);
}

const host = process.env.DB_HOST || '127.0.0.1';
const port = String(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const pass = process.env.DB_PASS || '';
const database = process.env.DB_NAME || 'wedding_saas';

let sql;
if (file.endsWith('.gz')) {
  const buf = fs.readFileSync(file);
  sql = zlib.gunzipSync(buf).toString('utf8');
} else {
  sql = fs.readFileSync(file, 'utf8');
}

const env = { ...process.env };
if (pass) env.MYSQL_PWD = pass;

const r = spawnSync('mysql', [`-h${host}`, `-P${port}`, `-u${user}`, database], {
  input: sql,
  env,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
if (r.error) {
  console.error('[db:restore] mysql failed:', r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.error('[db:restore] mysql exit', r.status, r.stderr || r.stdout);
  process.exit(1);
}
console.log('[db:restore] restored into', database, 'from', path.basename(file));
