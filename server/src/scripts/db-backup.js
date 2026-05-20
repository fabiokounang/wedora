#!/usr/bin/env node
/**
 * MySQL backup using mysqldump. Run from server/: npm run db:backup
 * Requires mysqldump in PATH. Output: ../backups/wedding_saas-YYYY-MM-DDTHH-mm-ss.sql.gz (or .sql if gzip missing)
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const host = process.env.DB_HOST || '127.0.0.1';
const port = String(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const pass = process.env.DB_PASS || '';
const database = process.env.DB_NAME || 'wedding_saas';

const outDir = path.resolve(__dirname, '..', '..', 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const baseName = `${database}-${stamp}.sql`;
const sqlPath = path.join(outDir, baseName);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const args = [
  `-h${host}`,
  `-P${port}`,
  `-u${user}`,
  `--single-transaction`,
  `--routines`,
  `--triggers`,
  database,
];

const env = { ...process.env };
if (pass) env.MYSQL_PWD = pass;

const r = spawnSync('mysqldump', args, { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
if (r.error) {
  console.error('[db:backup] mysqldump not found or failed:', r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.error('[db:backup] mysqldump exit', r.status, r.stderr || r.stdout);
  process.exit(1);
}

fs.writeFileSync(sqlPath, r.stdout);
let finalPath = sqlPath;
try {
  const gz = zlib.gzipSync(r.stdout);
  const gzPath = sqlPath + '.gz';
  fs.writeFileSync(gzPath, gz);
  fs.unlinkSync(sqlPath);
  finalPath = gzPath;
} catch {
  // keep .sql
}
console.log('[db:backup] wrote', finalPath);
