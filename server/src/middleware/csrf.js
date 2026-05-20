const crypto = require('crypto');

const CSRF_COOKIE = '_csrf_tok';
const CSRF_FIELD = '_csrf';
const CSRF_HEADER = 'x-csrf-token';

const SKIP_PATHS = new Set([
  '/payments/midtrans/webhook',
  '/vendor/midtrans/webhook',
]);

function isApiJson(req) {
  return req.path.startsWith('/api/');
}

function csrfProtection(req, res, next) {
  if (SKIP_PATHS.has(req.path)) return next();
  if (isApiJson(req)) return next();

  const secure = String(process.env.COOKIE_SECURE || 'false') === 'true';

  let token = req.cookies && req.cookies[CSRF_COOKIE];
  if (!token || token.length < 32) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  res.locals.csrfToken = token;

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const submitted =
    (req.body && req.body[CSRF_FIELD]) ||
    req.get(CSRF_HEADER) ||
    (req.query && req.query[CSRF_FIELD]) ||
    '';

  if (!submitted || submitted !== token) {
    if (req.accepts('html') && !req.xhr) {
      return res.status(403).render('errors/403', {
        title: '403 — CSRF token invalid',
        user: req.user || null,
        adminPath: req.path || '',
      });
    }
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }

  next();
}

module.exports = { csrfProtection };
