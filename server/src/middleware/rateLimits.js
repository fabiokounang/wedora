const rateLimit = require('express-rate-limit');

function isTestEnv() {
  return process.env.NODE_ENV === 'test';
}

function envNum(name, testFallback, prodFallback) {
  const raw = process.env[name];
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : prodFallback;
  }
  return isTestEnv() ? testFallback : prodFallback;
}

/** Per IP + undangan (slug): cegah spam ke satu acara tanpa mem-blokir IP di undangan lain. */
function publicSiteKey(req) {
  const slug = req.params && req.params.slug != null ? String(req.params.slug) : '';
  return `${req.ip || 'unknown'}|${slug}`;
}

const publicRsvpWishWriteLimiter = rateLimit({
  windowMs: envNum('PUBLIC_RSVP_WISH_WRITE_WINDOW_MS', 900_000, 900_000),
  max: envNum('PUBLIC_RSVP_WISH_WRITE_MAX', 10_000, 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: publicSiteKey,
  message: { error: 'too many requests, please try again later' },
});

const publicWishesReadLimiter = rateLimit({
  windowMs: envNum('PUBLIC_WISHES_READ_WINDOW_MS', 600_000, 600_000),
  max: envNum('PUBLIC_WISHES_READ_MAX', 50_000, 300),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: publicSiteKey,
  message: { error: 'too many requests, please try again later' },
});

function loginRateHandler(req, res, _next, options) {
  if (req.accepts('html')) {
    return res.redirect('/login?err=rate_limit');
  }
  res.status(options.statusCode).json(options.message);
}

function registerRateHandler(req, res, _next, options) {
  if (req.accepts('html')) {
    return res.redirect('/register?err=rate_limit');
  }
  res.status(options.statusCode).json(options.message);
}

const loginLimiter = rateLimit({
  windowMs: envNum('AUTH_LOGIN_WINDOW_MS', 900_000, 900_000),
  max: envNum('AUTH_LOGIN_MAX', 10_000, 45),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many login attempts, try again later' },
  handler: loginRateHandler,
});

const registerLimiter = rateLimit({
  windowMs: envNum('AUTH_REGISTER_WINDOW_MS', 3_600_000, 3_600_000),
  max: envNum('AUTH_REGISTER_MAX', 10_000, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many registration attempts, try again later' },
  handler: registerRateHandler,
});

const resendVerifyEmailLimiter = rateLimit({
  windowMs: envNum('RESEND_VERIFY_WINDOW_MS', 3_600_000, 3_600_000),
  max: envNum('RESEND_VERIFY_MAX', 500, 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user && req.user.id ? req.user.id : req.ip || 'unknown'),
  message: { error: 'too many resend requests' },
  handler: (req, res, _next, options) => {
    if (req.accepts('html')) {
      return res.redirect('/settings?err=verify_rate');
    }
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = {
  publicRsvpWishWriteLimiter,
  publicWishesReadLimiter,
  loginLimiter,
  registerLimiter,
  resendVerifyEmailLimiter,
};
