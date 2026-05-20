const crypto = require('crypto');

function hashRawToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashRawToken, generateRawToken };
