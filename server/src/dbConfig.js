const fs = require('fs');
const path = require('path');

/**
 * Shared MySQL/TiDB connection options (mysql2).
 * TiDB Cloud: set DB_SSL=true, DB_PORT=4000 (atau dari panel).
 */
function buildMysqlSslOptions() {
  const enabled = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';
  if (!enabled) return undefined;

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ssl = { rejectUnauthorized };

  const caPath = process.env.DB_SSL_CA;
  if (caPath) {
    const resolved = path.isAbsolute(caPath) ? caPath : path.resolve(process.cwd(), caPath);
    ssl.ca = fs.readFileSync(resolved, 'utf8');
  } else if (process.env.DB_SSL_CA_PEM) {
    ssl.ca = process.env.DB_SSL_CA_PEM.replace(/\\n/g, '\n');
  }

  return ssl;
}

function getDbName() {
  return process.env.DB_NAME || 'wedding_saas';
}

/** Base options for mysql2 createConnection / createPool. */
function getMysqlBaseOptions({ database, multipleStatements } = {}) {
  const opts = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    ssl: buildMysqlSslOptions(),
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
  };
  if (database !== false) {
    opts.database = database === undefined ? getDbName() : database;
  }
  if (multipleStatements) opts.multipleStatements = true;
  return opts;
}

module.exports = {
  buildMysqlSslOptions,
  getDbName,
  getMysqlBaseOptions,
};
