const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const q = require('../models/queries');
const { signToken, setAuthCookie } = require('../middleware/auth');

const COOKIE_OAUTH = 'google_oauth_ctx';
const COOKIE_MAX = 10 * 60 * 1000;

/** Strip spaces / trailing slashes — Google matches redirect URIs exactly. */
function normalizeGoogleRedirectUri(uri) {
  const s = String(uri || '').trim();
  if (!s) return s;
  return s.replace(/\/+$/, '');
}

function resolveRedirectUri(req) {
  const fromEnv = (process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  if (fromEnv) return normalizeGoogleRedirectUri(fromEnv);
  const base = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return normalizeGoogleRedirectUri(`${base}/auth/google/callback`);
}

/** Log resolved redirect in dev so redirect_uri_mismatch is easier to fix (must match Google Console exactly). */
function logRedirectUriIfDev(redirectUri) {
  if (String(process.env.NODE_ENV || '') === 'production') return;
  console.info('[google-oauth] Using redirect_uri:', redirectUri, '(set GOOGLE_OAUTH_REDIRECT_URI to match Google Console exactly)');
}

function renderOauthError(res, message) {
  const locals = {
    user: res.locals.user || null,
    title: 'Google login',
    errorMessage: message,
    adminPath: '',
  };
  res.status(400).render('errors/google-oauth', locals, (err, body) => {
    if (err) {
      res.status(400).type('text').send(message);
      return;
    }
    res.render('layout', { ...locals, body });
  });
}

function googleConfigured() {
  return Boolean((process.env.GOOGLE_CLIENT_ID || '').trim() && (process.env.GOOGLE_CLIENT_SECRET || '').trim());
}

/** Non-production only: lihat redirect_uri yang dipakai vs env (untuk perbaiki redirect_uri_mismatch). */
function debugGoogleOAuth(req, res) {
  if (String(process.env.NODE_ENV || '') === 'production') {
    return res.status(404).json({ error: 'not found' });
  }
  const fromEnv = (process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  const derivedBase = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const effective = resolveRedirectUri(req);
  let originHint = '';
  try {
    originHint = new URL(effective).origin;
  } catch {
    originHint = '(URL tidak valid — periksa GOOGLE_OAUTH_REDIRECT_URI)';
  }
  return res.json({
    error_help: 'redirect_uri_mismatch = string di bawah harus ada persis di Google Cloud → Credentials → OAuth 2.0 Client (tipe Web) → Authorized redirect URIs',
    effective_redirect_uri: effective,
    sources: {
      GOOGLE_OAUTH_REDIRECT_URI: fromEnv || null,
      used_env_redirect: Boolean(fromEnv),
      PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || null,
      request_protocol: req.protocol,
      request_host: req.get('host'),
      x_forwarded_proto: req.get('x-forwarded-proto') || null,
    },
    google_console: {
      authorized_redirect_uris_must_include: effective,
      authorized_javascript_origins_suggest: originHint,
      client_type: 'Harus "Web application" (bukan Desktop / iOS / Android untuk flow ini).',
    },
  });
}

async function startGoogle(req, res) {
  if (!googleConfigured()) return res.status(503).send('Google OAuth is not configured.');
  const redirectUri = resolveRedirectUri(req);
  logRedirectUriIfDev(redirectUri);
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const secure = String(process.env.COOKIE_SECURE || 'false') === 'true';
  res.cookie(COOKIE_OAUTH, JSON.stringify({ state, nonce }), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: COOKIE_MAX,
    path: '/',
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function googleCallback(req, res, next) {
  try {
    if (!googleConfigured()) return res.status(503).send('Google OAuth is not configured.');
    const redirectUri = resolveRedirectUri(req);
    logRedirectUriIfDev(redirectUri);
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);

    const code = req.query.code ? String(req.query.code) : '';
    const state = req.query.state ? String(req.query.state) : '';
    const raw = req.cookies && req.cookies[COOKIE_OAUTH];
    res.clearCookie(COOKIE_OAUTH, { path: '/' });
    if (!code || !state || !raw) {
      return renderOauthError(res, 'Sesi OAuth tidak valid atau sudah berakhir. Silakan coba lagi dari halaman login.');
    }
    let ctx;
    try {
      ctx = JSON.parse(raw);
    } catch {
      return renderOauthError(res, 'Sesi OAuth tidak valid.');
    }
    if (!ctx || ctx.state !== state) return renderOauthError(res, 'State keamanan tidak cocok. Coba lagi.');

    const { tokens } = await client.getToken({ code });
    if (!tokens.id_token) return renderOauthError(res, 'Google tidak mengembalikan id_token.');

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
      nonce: ctx.nonce,
    });
    const p = ticket.getPayload();
    const sub = p.sub;
    const emailRaw = p.email || '';
    const email = String(emailRaw).trim().toLowerCase();
    const emailVerified = p.email_verified === true;

    if (!sub) return renderOauthError(res, 'Profil Google tidak valid.');

    let user = await q.findUserByGoogleSub(sub);
    if (user) {
      setAuthCookie(res, signToken(user));
      if (user.role === 'client') {
        const paidOrder = await q.getLatestPaidOrderByUser(user.id);
        if (!paidOrder) return res.redirect('/billing');
      }
      return res.redirect('/dashboard');
    }

    if (!email) return renderOauthError(res, 'Akun Google Anda tidak memiliki email yang terbaca. Pilih akun lain.');

    const byEmail = await q.findUserByEmail(email);
    if (byEmail) {
      if (byEmail.google_sub && byEmail.google_sub === sub) {
        user = byEmail;
      } else if (byEmail.auth_provider === 'local' && byEmail.password_hash) {
        return renderOauthError(
          res,
          'Email ini sudah terdaftar dengan password. Silakan masuk dengan email dan password Anda terlebih dahulu.'
        );
      } else {
        user = await q.linkGoogleToUser(byEmail.id, sub, emailVerified);
      }
    } else {
      user = await q.createUserFromGoogle({
        email,
        name: (p.name && String(p.name).trim()) || email.split('@')[0],
        google_sub: sub,
        email_verified: emailVerified,
      });
    }

    setAuthCookie(res, signToken(user));
    if (user.role === 'client') {
      const paidOrder = await q.getLatestPaidOrderByUser(user.id);
      if (!paidOrder) return res.redirect('/billing');
    }
    return res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
}

module.exports = { startGoogle, googleCallback, googleConfigured, debugGoogleOAuth };
