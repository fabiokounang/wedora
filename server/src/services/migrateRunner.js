const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getDbName, getMysqlBaseOptions } = require('../dbConfig');

function hashSql(sql) {
  let h = 2166136261;
  for (let i = 0; i < sql.length; i++) {
    h ^= sql.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function skipCreateDatabase() {
  const v = process.env.DB_SKIP_CREATE_DATABASE;
  return v === 'true' || v === '1';
}

async function ensureDatabase(admin, dbName) {
  if (skipCreateDatabase()) {
    console.log(`> skip CREATE DATABASE (DB_SKIP_CREATE_DATABASE); using ${dbName}`);
    return;
  }

  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`> database ${dbName} ready (created or already existed)`);
  } catch (err) {
    const msg = err.message || '';
    const noPrivilege =
      err.errno === 1044 ||
      err.code === 'ER_DBACCESS_DENIED_ERROR' ||
      err.code === 'ER_ACCESS_DENIED_ERROR' ||
      /create database|access denied/i.test(msg);
    if (noPrivilege) {
      console.warn(
        `> CREATE DATABASE skipped (${msg}). Using existing database "${dbName}" — pastikan DB sudah dibuat di panel TiDB.`
      );
      return;
    }
    throw err;
  }
}

async function useDatabase(admin, dbName) {
  try {
    await admin.query(`USE \`${dbName}\``);
  } catch (err) {
    throw new Error(
      `Cannot USE database "${dbName}". Buat database di TiDB panel atau set DB_NAME. Original: ${err.message}`
    );
  }
}

/** Idempotent: buat DB (jika boleh), lalu jalankan file migrasi yang belum applied. */
async function runMigrations() {
  const dbName = getDbName();

  const admin = await mysql.createConnection(
    getMysqlBaseOptions({ database: false, multipleStatements: true })
  );

  await ensureDatabase(admin, dbName);
  await useDatabase(admin, dbName);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const [doneRows] = await admin.query('SELECT filename, checksum FROM schema_migrations');
  const doneMap = new Map(doneRows.map((r) => [r.filename, r.checksum]));

  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const checksum = hashSql(raw);
    const prev = doneMap.get(file);
    if (prev && prev === checksum) {
      console.log(`> skip migration ${file} (already applied)`);
      skipped += 1;
      continue;
    }
    if (prev && prev !== checksum) {
      throw new Error(
        `Migration drift detected for ${file}. File changed after apply (old checksum=${prev}, new=${checksum}).`
      );
    }

    console.log(`> running migration ${file}`);
    const stripped = raw.replace(/--[^\r\n]*/g, '');
    const statements = stripped
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      try {
        await admin.query(stmt + ';');
      } catch (err) {
        const ignorable =
          err.code === 'ER_DUP_FIELDNAME' ||
          err.code === 'ER_DUP_KEYNAME' ||
          err.code === 'ER_TABLE_EXISTS_ERROR' ||
          err.errno === 1060 ||
          err.errno === 1061;
        if (ignorable) {
          console.warn(`  (skip, already applied) ${err.sqlMessage || err.message}`);
          continue;
        }
        throw err;
      }
    }
    await admin.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [file, checksum]);
    applied += 1;
  }

  await admin.end();
  console.log(`migrations done. (${applied} baru, ${skipped} sudah ada, ${files.length} file total)`);
}

module.exports = { runMigrations };
