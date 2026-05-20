const q = require('../models/queries');
const { hashRawToken, generateRawToken } = require('../utils/accountToken');
const mail = require('./mail');

function publicBase(req) {
  return (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function sendPasswordResetEmail(userRow, rawToken, req) {
  const base = publicBase(req);
  const url = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
  mail.recordTestCapture('password_reset', url);
  await mail.sendMail({
    to: userRow.email,
    subject: 'Reset password — Undangan Digital',
    text: `Reset password Anda dengan membuka tautan berikut (berlaku ±1 jam):\n\n${url}\n\nJika Anda tidak meminta reset, abaikan email ini.`,
  });
}

/** Insert token row and send email. */
async function issuePasswordResetForUser(userId, req) {
  const user = await q.getUserById(userId);
  if (!user || !user.email) return;
  const raw = generateRawToken();
  const hash = hashRawToken(raw);
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await q.deletePendingUserTokens(userId, 'password_reset');
  await q.insertUserToken(userId, 'password_reset', hash, expires);
  await sendPasswordResetEmail(user, raw, req);
}

async function sendEmailVerification(userId, email, req) {
  const raw = generateRawToken();
  const hash = hashRawToken(raw);
  const expires = new Date(Date.now() + 48 * 3600 * 1000);
  await q.deletePendingUserTokens(userId, 'email_verify');
  await q.insertUserToken(userId, 'email_verify', hash, expires);
  const base = publicBase(req);
  const url = `${base}/auth/verify-email?token=${encodeURIComponent(raw)}`;
  mail.recordTestCapture('email_verify', url);
  await mail.sendMail({
    to: email,
    subject: 'Verifikasi email — Undangan Digital',
    text: `Verifikasi alamat email Anda:\n\n${url}\n\nTautan berlaku ±48 jam.`,
  });
}

module.exports = {
  issuePasswordResetForUser,
  sendEmailVerification,
};
