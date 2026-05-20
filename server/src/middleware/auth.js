const jwt = require('jsonwebtoken');
const q = require('../models/queries');

const COOKIE_NAME = process.env.COOKIE_NAME || 'wsaas_token';

function bearerTokenFromRequest(req) {
  const h = req.get('authorization') || req.get('Authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(String(h).trim());
  return m ? m[1] : null;
}

function signToken(user) {
  const tv = Number(user.token_version ?? user.tv ?? 0);
  return jwt.sign(
    { uid: user.id, role: user.role, email: user.email, tv },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(process.env.COOKIE_SECURE || 'false') === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Seconds until JWT expiry (from decoded `exp`), or undefined if unknown. */
function jwtExpiresInSeconds(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded.exp !== 'number') return undefined;
    return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
  } catch {
    return undefined;
  }
}

async function loadUser(req, _res, next) {
  req.user = null;
  const ms = Number(process.env.AUTH_LOAD_USER_TIMEOUT_MS || 8000);
  /** Cookie wins over Authorization Bearer when both present (browser + accidental header). */
  let token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) token = bearerTokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Promise.race([
      q.getUserById(payload.uid),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('getUserById timeout')), ms);
      }),
    ]);
    if (user) {
      const tvClaim = payload.tv !== undefined ? Number(payload.tv) : 0;
      const tvDb = Number(user.token_version ?? 0);
      if (tvClaim !== tvDb) {
        req.user = null;
      } else {
        req.user = user;
      }
    }
  } catch (err) {
    if (err && err.message === 'getUserById timeout') {
      console.warn('[loadUser] DB lambat atau tidak jalan — lanjut sebagai tamu (cek MySQL & .env).');
    }
    // token invalid / DB error / timeout → tamu
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.accepts('html') && !req.xhr) return res.redirect('/login');
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) {
      if (req.accepts('html') && !req.xhr) {
        return res.status(403).render('errors/403', {
          title: '403 — Akses ditolak',
          user: req.user,
          adminPath: req.path || '',
        });
      }
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

async function requireActivePlan(req, res, next) {
  if (!req.user) {
    if (req.accepts('html') && !req.xhr) return res.redirect('/login');
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (req.user.role === 'super_admin') return next();

  const paidOrder = await q.getLatestPaidOrderByUser(req.user.id);
  if (!paidOrder) {
    if (req.accepts('html') && !req.xhr) {
      return res.redirect('/billing?required=1');
    }
    return res.status(402).json({ error: 'payment_required' });
  }

  // Business rule: one paid order unlocks one invitation site (one event).
  const isCreateSiteRoute = req.path === '/sites/new' && (req.method === 'GET' || req.method === 'POST');
  if (isCreateSiteRoute) {
    const paidCount = await q.countPaidOrdersByUser(req.user.id);
    const usedCount = await q.countInvitationSitesByOwner(req.user.id);
    if (usedCount >= paidCount) {
      if (req.accepts('html') && !req.xhr) {
        return res.redirect('/billing?required=1&reason=quota');
      }
      return res.status(402).json({ error: 'payment_quota_exhausted' });
    }
  }

  req.activePlan = paidOrder;
  return next();
}

/**
 * When REQUIRE_EMAIL_VERIFIED=true: clients must have email_verified_at before billing / checkout / create site.
 * GET /billing?verify_required=1 is allowed so they see instructions without redirect loop.
 */
function requireVerifiedEmailForClient(req, res, next) {
  if (String(process.env.REQUIRE_EMAIL_VERIFIED || '').trim() !== 'true') return next();
  if (!req.user || req.user.role !== 'client') return next();
  if (req.user.email_verified_at) return next();

  const allowBillingExplain =
    req.method === 'GET' &&
    req.path === '/billing' &&
    String(req.query.verify_required || '') === '1';

  if (allowBillingExplain) return next();

  if (req.accepts('html') && !req.xhr) {
    return res.redirect('/billing?verify_required=1');
  }
  return res.status(403).json({
    error: 'email_verification_required',
    message: 'Verify your email address before continuing.',
  });
}

async function ensureSiteOwnership(req, res, next) {
  const siteId = Number(req.params.siteId || req.params.id);
  if (!siteId) return res.status(400).json({ error: 'missing site id' });
  const site = await q.getSiteById(siteId);
  if (!site) return res.status(404).json({ error: 'site not found' });

  if (req.params.table === 'gift_accounts' && req.method === 'PATCH') {
    console.log('[api gift] ensureSiteOwnership OK', {
      siteId,
      siteSlug: site.slug,
      table: req.params.table,
      itemId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
  }

  if (req.user.role === 'super_admin') {
    req.site = site;
    return next();
  }
  if (site.owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.site = site;
  next();
}

module.exports = {
  COOKIE_NAME,
  bearerTokenFromRequest,
  signToken,
  jwtExpiresInSeconds,
  setAuthCookie,
  clearAuthCookie,
  loadUser,
  requireAuth,
  requireRole,
  requireVerifiedEmailForClient,
  requireActivePlan,
  ensureSiteOwnership,
};
