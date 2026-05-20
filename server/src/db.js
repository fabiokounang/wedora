const mysql = require('mysql2/promise');
const { getMysqlBaseOptions } = require('./dbConfig');

const pool = mysql.createPool({
  ...getMysqlBaseOptions(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  multipleStatements: false,
  dateStrings: true,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function getConnection() {
  return pool.getConnection();
}

module.exports = { pool, query, one, getConnection };
