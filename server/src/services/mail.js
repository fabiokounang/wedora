const nodemailer = require('nodemailer');

const captured = {
  lastPasswordResetUrl: null,
  lastVerifyEmailUrl: null,
};

function resetCapturedLinks() {
  captured.lastPasswordResetUrl = null;
  captured.lastVerifyEmailUrl = null;
}

function getCapturedLinks() {
  return { ...captured };
}

function isSmtpConfigured() {
  return Boolean(process.env.MAIL_SMTP_HOST && process.env.MAIL_FROM);
}

let transporter;
function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (transporter) return transporter;
  const port = Number(process.env.MAIL_SMTP_PORT || 587);
  const secure = String(process.env.MAIL_SMTP_SECURE || 'false') === 'true';
  const requireTLSDefault = port === 587 && !secure;
  const requireTLS =
    String(process.env.MAIL_SMTP_REQUIRE_TLS || (requireTLSDefault ? 'true' : 'false')) === 'true';
  const rejectUnauthorized = String(process.env.MAIL_SMTP_TLS_REJECT_UNAUTHORIZED || 'true') !== 'false';
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST,
    port,
    secure,
    requireTLS,
    connectionTimeout: Number(process.env.MAIL_SMTP_CONNECTION_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.MAIL_SMTP_GREETING_TIMEOUT_MS || 15000),
    tls: { rejectUnauthorized },
    auth:
      process.env.MAIL_SMTP_USER || process.env.MAIL_SMTP_PASS
        ? {
            user: process.env.MAIL_SMTP_USER || '',
            pass: process.env.MAIL_SMTP_PASS || '',
          }
        : undefined,
  });
  return transporter;
}

/** Optional startup check; does not throw (logs only). */
async function verifySmtpOnBoot() {
  if (!isSmtpConfigured()) {
    console.info('[mail] SMTP not set (MAIL_SMTP_HOST + MAIL_FROM); reset/verify emails are skipped until configured.');
    return;
  }
  if (String(process.env.MAIL_VERIFY_ON_START || 'true') !== 'true') return;
  try {
    const t = getTransporter();
    if (!t) return;
    await t.verify();
    console.info('[mail] SMTP OK:', process.env.MAIL_SMTP_HOST, 'port', process.env.MAIL_SMTP_PORT || 587);
  } catch (err) {
    console.warn('[mail] SMTP verify failed:', err.message || err, '— periksa MAIL_* di .env (host, port, user/pass, TLS).');
  }
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendMail(opts) {
  const { to, subject, text, html } = opts;
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[mail] SMTP not configured; skipping send to', to, subject);
    } else {
      console.info('[mail:skipped]', { to, subject, preview: String(text).slice(0, 200) });
    }
    return { skipped: true };
  }
  const from = process.env.MAIL_FROM;
  await t.sendMail({
    from,
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br/>'),
  });
  return { skipped: false };
}

function recordTestCapture(kind, url) {
  if (process.env.NODE_ENV !== 'test' || String(process.env.E2E_CAPTURE_MAIL || '') !== '1') return;
  if (kind === 'password_reset') captured.lastPasswordResetUrl = url;
  if (kind === 'email_verify') captured.lastVerifyEmailUrl = url;
}

module.exports = {
  sendMail,
  isSmtpConfigured,
  verifySmtpOnBoot,
  getCapturedLinks,
  resetCapturedLinks,
  recordTestCapture,
};
