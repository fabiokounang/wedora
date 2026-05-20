require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const { pool } = require('./db');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { UPLOAD_DIR, PUBLIC_URL } = require('./services/storage');

const { loadUser } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { resolveHost } = require('./middleware/subdomain');
const { renderPublicSite } = require('./controllers/renderController');
const adminRoute = require('./routes/admin');
const authWebRoute = require('./routes/authWeb');
const { googleConfigured } = require('./controllers/authGoogleController');
const apiAuth = require('./routes/api/auth');
const apiSites = require('./routes/api/sites');
const apiCollections = require('./routes/api/collections');
const apiPublic = require('./routes/api/public');
const apiMedia = require('./routes/api/media');

const themeLoader = require('./services/themeLoader');
const { checkSchemaUpToDate } = require('./services/schemaCheck');
const mailService = require('./services/mail');
const adminController = require('./controllers/adminController');

const app = express();

let setupSentryExpressErrors = null;
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
      integrations: [Sentry.expressIntegration()],
    });
    setupSentryExpressErrors = () => Sentry.setupExpressErrorHandler(app);
  } catch (err) {
    console.warn('[sentry] optional init failed:', err.message);
  }
}

app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

const isProduction = process.env.NODE_ENV === 'production';
const enableHsts = isProduction && String(process.env.COOKIE_SECURE || 'false') === 'true';
const themePublicMaxAge = Number(process.env.THEME_PUBLIC_MAX_AGE_MS || (isProduction ? 3600000 : 0));
const themeStaticBase =
  themePublicMaxAge > 0 ? { maxAge: themePublicMaxAge, etag: true, immutable: false } : {};
const themeStaticOpts = {
  ...themeStaticBase,
  setHeaders(res, filePath) {
    if (String(filePath || '').toLowerCase().endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline');
    }
  },
};

app.use(helmet({
  contentSecurityPolicy: false,
  hsts: enableHsts ? { maxAge: 63072000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  dnsPrefetchControl: { allow: false },
}));

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
/** Tanpa DB / loadUser — untuk cek port & stack (buka /health jika / macet). */
app.get('/health', (_req, res) => {
  res.status(200).type('text/plain').send('ok');
});

/** Ping MySQL pool (tanpa CSRF / session). Use untuk probe dependency DB; 503 jika DB mati. */
app.get('/health/deep', async (_req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    res.status(200).json({ ok: true, db: true });
  } catch (err) {
    const expose = process.env.NODE_ENV !== 'production';
    res.status(503).json({
      ok: false,
      db: false,
      error: expose ? err.message : 'unavailable',
    });
  }
});
app.use(csrfProtection);
app.use(loadUser);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(process.env.PUBLIC_UPLOAD_URL || PUBLIC_URL, express.static(UPLOAD_DIR));

app.use('/themes/:themeKey/public', (req, res, next) => {
  const key = req.params.themeKey;
  try {
    const dir = themeLoader.getPublicDir(key);
    return express.static(dir, themeStaticOpts)(req, res, next);
  } catch (_) {
    res.status(404).end();
  }
});

app.use('/admin/static', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/web/static', express.static(path.join(__dirname, '..', 'public', 'web')));

app.use('/api/auth', apiAuth);
app.use('/api/sites', apiSites);
app.use('/api/sites', apiCollections);
app.use('/api/sites', apiMedia);
app.use('/api', apiPublic);

app.use(authWebRoute);

app.use(resolveHost);

app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.adminPath = req.path || '';
  res.locals.googleOAuthEnabled = googleConfigured();
  next();
});

app.use((req, res, next) => {
  /** HTML undangan tamu di `/` — hanya GET, hanya jika `resolveHost` sudah set `req.site`. */
  if (req.method !== 'GET' || req.path !== '/') return next();
  if (req.routeKind !== 'site' || !req.site) return next();
  return renderPublicSite(req, res, next);
});

app.use((req, res, next) => {
  if (req.routeKind === 'site' && req.site) {
    return express.static(
      path.join(__dirname, '..', '..', 'themes', req.site.theme_key, 'public'),
      themeStaticOpts,
    )(req, res, next);
  }
  next();
});

/** Landing marketing (HTML). Subdomain undangan / `?site=` valid tidak lewat sini (sudah di middleware di atas). */
app.get('/', (req, res, next) => {
  if (req.routeKind === 'site') return next();
  return adminController.root(req, res, next);
});

if (process.env.NODE_ENV === 'test' && String(process.env.E2E_CAPTURE_MAIL || '') === '1') {
  const mailSvc = require('./services/mail');
  app.get('/__e2e/last-mail-links', (req, res) => {
    if (String(req.query.reset) === '1') mailSvc.resetCapturedLinks();
    res.json(mailSvc.getCapturedLinks());
  });
}

app.use(adminRoute);

if (setupSentryExpressErrors) setupSentryExpressErrors();

app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).render('errors/404', {
      title: '404 — Tidak ditemukan',
      user: req.user || null,
      adminPath: req.path || '',
    });
  }
  res.status(404).json({ error: 'not found' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  if (req.accepts('html')) {
    const code = err.status || 500;
    const template = code === 403 ? 'errors/403' : 'errors/500';
    const titles = { 403: '403 — Akses ditolak', 500: '500 — Kesalahan server' };
    return res.status(code).render(template, {
      title: titles[code] || 'Error',
      user: req.user || null,
      adminPath: req.path || '',
    });
  }
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

async function boot() {
  const strictSchema = process.env.STRICT_SCHEMA_CHECK === '1';
  try {
    const state = await checkSchemaUpToDate();
    if (!state.ok) {
      const msg =
        `[schema-check] ${state.reason}. pending: ` +
        (state.pending && state.pending.length ? state.pending.join(', ') : '(none)');
      if (strictSchema) {
        throw new Error(msg + '. Run: npm run migrate');
      }
      console.warn(msg + '. Run: npm run migrate');
    }
  } catch (err) {
    if (strictSchema) throw err;
    console.warn('[schema-check] skipped due to error:', err.message);
  }

  const port = Number(process.env.PORT || 3000);
  const baseDomain = process.env.BASE_DOMAIN || `localhost:${port}`;
  const basePortMatch = String(baseDomain).match(/:(\d+)\s*$/);
  const basePort = basePortMatch ? Number(basePortMatch[1]) : null;
  if (basePort != null && basePort !== port) {
    console.warn(
      `[config] BASE_DOMAIN=${baseDomain} (port ${basePort}) tidak sama dengan PORT=${port}. ` +
        `Sesuaikan keduanya di .env, atau buka http://127.0.0.1:${port}/ di browser.`
    );
  }

  await mailService.verifySmtpOnBoot();

  app.listen(port, () => {
    console.log(`wedding-saas listening on http://127.0.0.1:${port}`);
    console.log(`Buka di browser: http://127.0.0.1:${port}/`);
    console.log(`base domain (subdomain routing): ${baseDomain}`);
    console.log(`uploads: ${UPLOAD_DIR} (served at ${process.env.PUBLIC_UPLOAD_URL || PUBLIC_URL}/)`);
    console.log(`themes loaded: ${themeLoader.getThemeList().map((t) => t.key).join(', ') || '(none)'}`);
    console.log('GET /health = server OK tanpa DB; GET /health/deep = ping MySQL. Kalau / macet, pastikan MySQL jalan (npm run migrate).');
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[boot] Port ${port} sudah dipakai proses lain. Tutup proses itu atau ubah PORT di .env. ` +
          `(Windows: netstat -ano | findstr :${port} lalu taskkill /PID <pid> /F)`
      );
    } else {
      console.error('[boot] listen error:', err.message);
    }
    process.exit(1);
  });
}

boot().catch((err) => {
  console.error('[boot] failed:', err.message);
  process.exit(1);
});
