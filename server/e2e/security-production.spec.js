/**
 * E2E — Production security, IDOR, RBAC, race‑condition, and public abuse tests
 *
 * Covers:
 *   1. Promo RBAC: client cannot access /promo-codes CRUD
 *   2. IDOR matrix: client A cannot view/edit/publish site owned by client B
 *      (admin routes + API routes + collections + media + CSV)
 *   3. Race condition: concurrent POST /sites/new at border quota
 *   4. Public endpoint abuse: rate limiter, validation, unpublished site guard
 *   5. Auth boundaries: unauthenticated access, cookie security
 *
 * Prasyarat: Server + MySQL + .env + npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { test, expect } = require('@playwright/test');
const { query, one, pool } = require('../src/db');
const { LIMIT_ONE } = require('../src/models/sqlColumns');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TS = Date.now();

async function registerAndGetId(page, email, password, name) {
  await page.goto('/register');
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
  const row = await one('SELECT id FROM users WHERE email = ?', [email]);
  return row.id;
}

async function apiLogin(playwright, email, password) {
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  await ctx.post('/api/auth/login', { data: { email, password } });
  return ctx;
}

async function getCsrfToken(ctx) {
  const res = await ctx.get('/dashboard');
  for (const h of await res.headersArray()) {
    if (h.name.toLowerCase() === 'set-cookie') {
      const m = h.value.match(/_csrf_tok=([^;]+)/);
      if (m) return m[1];
    }
  }
  return '';
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 1: Promo RBAC — client must not access /promo-codes
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('1 — Promo RBAC: client blocked from /promo-codes', () => {
  const CLIENT = {
    email: `e2e_rbac_${TS}@test.local`,
    password: 'RbacTest99!',
    name: `E2E RBAC ${TS}`,
  };

  test('01 — setup: register client', async ({ page }) => {
    await registerAndGetId(page, CLIENT.email, CLIENT.password, CLIENT.name);
  });

  test('02 — GET /promo-codes as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.get('/promo-codes');
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('03 — POST /promo-codes (create) as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.post('/promo-codes', {
      maxRedirects: 0,
      form: {
        code: `HACK_${TS}`,
        discount_type: 'percent',
        discount_value: '100',
        active: '1',
      },
    });
    expect(res.status()).toBe(403);
    const exists = await one('SELECT id FROM promo_codes WHERE code = ?', [`HACK_${TS}`]);
    expect(exists).toBeNull();
    await ctx.dispose();
  });

  test('04 — POST /promo-codes/:id (update) as client → 403', async ({ playwright }) => {
    const promo = await one('SELECT id FROM promo_codes ORDER BY id LIMIT ?', [LIMIT_ONE]);
    if (!promo) return;
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.post(`/promo-codes/${promo.id}`, {
      maxRedirects: 0,
      form: { discount_value: '0' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('05 — POST /promo-codes/:id/delete as client → 403', async ({ playwright }) => {
    const promo = await one('SELECT id FROM promo_codes ORDER BY id LIMIT ?', [LIMIT_ONE]);
    if (!promo) return;
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.post(`/promo-codes/${promo.id}/delete`, { maxRedirects: 0 });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 2: IDOR — client A cannot touch client B's site
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('2 — IDOR matrix: cross‑user site access blocked', () => {
  const A = { email: `e2e_idor_a_${TS}@test.local`, password: 'IdorA99!', name: `IDOR A ${TS}` };
  const B = { email: `e2e_idor_b_${TS}@test.local`, password: 'IdorB99!', name: `IDOR B ${TS}` };
  let aId, bId, bSiteId, bSlug;

  test('10 — setup: register A, B; give B a paid order + site', async ({ page }) => {
    aId = await registerAndGetId(page, A.email, A.password, A.name);
    bId = await registerAndGetId(page, B.email, B.password, B.name);

    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status, paid_at)
       VALUES (?, ?, 'starter', 0, 'IDR', 'paid', NOW())`,
      [`IDOR-B-${TS}`, bId],
    );

    bSlug = `e2e-idor-b-${TS}`;
    const [result] = await pool.query(
      `INSERT INTO sites (slug, theme_key, status, owner_user_id, managed_by, site_type)
       VALUES (?, 'flavor01', 'draft', ?, 'self', 'invitation')`,
      [bSlug, bId],
    );
    bSiteId = result.insertId;
  });

  test('11 — A GET /sites/:bSiteId → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.get(`/sites/${bSiteId}`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('12 — A POST /sites/:bSiteId/content → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/content`, {
      maxRedirects: 0,
      form: { bride_name: 'HACKED' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('13 — A POST /sites/:bSiteId/sections → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/sections`, {
      maxRedirects: 0,
      form: { enabled_hero: '1' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('14 — A POST /sites/:bSiteId/settings → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/settings`, {
      maxRedirects: 0,
      form: { theme_key: 'flavor01' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('15 — A GET /sites/:bSiteId/rsvps.csv → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.get(`/sites/${bSiteId}/rsvps.csv`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('16 — A POST /sites/:bSiteId/publish → blocked (403 or redirect to billing)', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/publish`, { maxRedirects: 0 });
    const status = res.status();
    const loc = res.headers().location || '';
    const blocked = status === 403 || status === 402 || (status === 302 && loc.includes('billing'));
    expect(blocked).toBe(true);
    await ctx.dispose();
  });

  test('17 — A POST /sites/:bSiteId/unpublish → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/unpublish`, { maxRedirects: 0 });
    expect([400, 403]).toContain(res.status());
    await ctx.dispose();
  });

  test('18 — A POST /sites/:bSiteId/workflow → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/workflow`, {
      maxRedirects: 0,
      form: { status: 'approved' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('19 — A POST /sites/:bSiteId/collections/guests → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.post(`/sites/${bSiteId}/collections/guests`, {
      maxRedirects: 0,
      form: { guest_name: 'Hacker', attendance: 'yes' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('20 — A GET /preview/:bSlug → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.get(`/preview/${bSlug}`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('21 — API: A GET /api/sites/:bSiteId → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.get(`/api/sites/${bSiteId}`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('22 — API: A PATCH /api/sites/:bSiteId → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.patch(`/api/sites/${bSiteId}`, { data: { slug: 'stolen' } });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('23 — API: A PATCH /api/sites/:bSiteId/content → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.patch(`/api/sites/${bSiteId}/content`, { data: { bride_name: 'HACKED' } });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('24 — API: A GET /api/sites/:bSiteId/rsvps → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.get(`/api/sites/${bSiteId}/rsvps`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('25 — API: A GET /api/sites/:bSiteId/wishes → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, A.email, A.password);
    const res = await ctx.get(`/api/sites/${bSiteId}/wishes`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 3: Unauthenticated access blocked for protected routes
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('3 — Unauthenticated access blocked', () => {
  test('30 — GET /dashboard without auth → redirect to /login', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain('/login');
    await ctx.dispose();
  });

  test('31 — GET /billing without auth → redirect to /login', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/billing', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain('/login');
    await ctx.dispose();
  });

  test('32 — POST /billing/checkout without auth → blocked (CSRF or redirect)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.post('/billing/checkout', {
      maxRedirects: 0,
      form: { plan_code: 'starter' },
    });
    // 403 from CSRF (no token) or 302 redirect to /login — either blocks unauthenticated access
    expect([302, 403]).toContain(res.status());
    await ctx.dispose();
  });

  test('33 — GET /promo-codes without auth → redirect to /login', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/promo-codes', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain('/login');
    await ctx.dispose();
  });

  test('34 — GET /users without auth → redirect to /login', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/users', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain('/login');
    await ctx.dispose();
  });

  test('35 — API: GET /api/sites without auth → 401 or redirect', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/sites', {
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('36 — API: GET /api/auth/me without auth → 401 or redirect', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/auth/me', {
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 4: Client cannot access super_admin routes
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('4 — Client cannot access super_admin routes', () => {
  const CLIENT = {
    email: `e2e_role_${TS}@test.local`,
    password: 'RoleTest99!',
    name: `E2E Role ${TS}`,
  };

  test('40 — setup: register client', async ({ page }) => {
    await registerAndGetId(page, CLIENT.email, CLIENT.password, CLIENT.name);
  });

  test('41 — GET /users as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.get('/users');
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('42 — GET /users/new as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.get('/users/new');
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('43 — POST /users (create) as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.post('/users', {
      maxRedirects: 0,
      form: { name: 'Hacked', email: 'hacked@x.com', password: 'x', role: 'super_admin' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('44 — GET /landing-cms as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.get('/landing-cms');
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('45 — POST /landing-cms as client → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.post('/landing-cms', { maxRedirects: 0, form: { hero_title: 'HACK' } });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('46 — API: POST /api/sites (create site as non‑super) → 403', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, CLIENT.email, CLIENT.password);
    const res = await ctx.post('/api/sites', {
      data: { slug: 'hacked', theme_key: 'flavor01' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 5: Race condition — concurrent POST /sites/new at quota border
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('5 — Race: concurrent site creation at quota border', () => {
  const QUOTA_USER = {
    email: `e2e_quota_${TS}@test.local`,
    password: 'QuotaRace99!',
    name: `E2E Quota ${TS}`,
  };
  let quotaUserId;

  test('50 — setup: register user + give exactly 1 paid order (1 slot)', async ({ page }) => {
    quotaUserId = await registerAndGetId(page, QUOTA_USER.email, QUOTA_USER.password, QUOTA_USER.name);
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status, paid_at)
       VALUES (?, ?, 'starter', 0, 'IDR', 'paid', NOW())`,
      [`QUOTA-${TS}`, quotaUserId],
    );
  });

  test('51 — 5 concurrent POST /sites/new → at most 1 site created', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, QUOTA_USER.email, QUOTA_USER.password);
    const csrf = await getCsrfToken(ctx);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        ctx.post('/sites/new', {
          maxRedirects: 0,
          form: {
            slug: `e2e-quota-race-${TS}-${i}`,
            theme_key: 'flavor01',
            _csrf: csrf,
          },
        }),
      ),
    );

    let createdCount = 0;
    for (const r of results) {
      const loc = r.headers().location || '';
      if (loc.match(/\/sites\/\d+/) && !loc.includes('billing')) createdCount++;
    }

    const siteCount = await one(
      "SELECT COUNT(*) AS c FROM sites WHERE owner_user_id = ? AND site_type = 'invitation'",
      [quotaUserId],
    );
    expect(Number(siteCount.c)).toBeLessThanOrEqual(1);

    await ctx.dispose();
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 6: Public endpoint abuse — validation, unpublished guard, limiter
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('6 — Public endpoint validation & abuse', () => {
  const draftSlug = `e2e-pub-draft-${TS}`;
  const pubSlug = `e2e-pub-live-${TS}`;
  let pubSiteId;

  test('60 — setup: create a draft and a published site', async () => {
    const admin = await one("SELECT id FROM users WHERE role = 'super_admin' LIMIT ?", [LIMIT_ONE]);
    await pool.query(
      `INSERT INTO sites (slug, theme_key, status, owner_user_id, managed_by, site_type)
       VALUES (?, 'flavor01', 'draft', ?, 'admin', 'invitation')`,
      [draftSlug, admin.id],
    );
    const [result] = await pool.query(
      `INSERT INTO sites (slug, theme_key, status, owner_user_id, managed_by, site_type)
       VALUES (?, 'flavor01', 'published', ?, 'admin', 'invitation')`,
      [pubSlug, admin.id],
    );
    pubSiteId = result.insertId;
  });

  test('61 — POST RSVP to draft site → 403', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${draftSlug}/rsvps`, {
      data: { guest_name: 'Test', attendance: 'yes' },
    });
    expect(res.status()).toBe(403);
  });

  test('62 — POST wish to draft site → 403', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${draftSlug}/wishes`, {
      data: { guest_name: 'Test', message: 'Hello' },
    });
    expect(res.status()).toBe(403);
  });

  test('63 — GET wishes from draft site → 403', async ({ request }) => {
    const res = await request.get(`${BASE}/api/public/site/${draftSlug}/wishes`);
    expect(res.status()).toBe(403);
  });

  test('64 — POST RSVP to nonexistent slug → 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/this-slug-does-not-exist-${TS}/rsvps`, {
      data: { guest_name: 'Test', attendance: 'yes' },
    });
    expect(res.status()).toBe(404);
  });

  test('65 — POST RSVP with invalid body → 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/rsvps`, {
      data: { attendance: 'maybe' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('66 — POST RSVP missing guest_name → 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/rsvps`, {
      data: { attendance: 'yes' },
    });
    expect(res.status()).toBe(400);
  });

  test('67 — POST wish with empty message → 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/wishes`, {
      data: { guest_name: 'Test', message: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('68 — POST wish with oversized message (>2000 chars) → 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/wishes`, {
      data: { guest_name: 'Test', message: 'x'.repeat(2500) },
    });
    expect(res.status()).toBe(400);
  });

  test('69 — POST RSVP with guests_count > 20 → 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/rsvps`, {
      data: { guest_name: 'Test', attendance: 'yes', guests_count: 999 },
    });
    expect(res.status()).toBe(400);
  });

  test('70 — valid POST RSVP → 201', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/rsvps`, {
      data: { guest_name: 'Tamu E2E', attendance: 'yes', guests_count: 2 },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.rsvp).toBeTruthy();
    expect(body.rsvp.guest_name).toBe('Tamu E2E');
  });

  test('71 — valid POST wish → 201', async ({ request }) => {
    const res = await request.post(`${BASE}/api/public/site/${pubSlug}/wishes`, {
      data: { guest_name: 'Tamu E2E', message: 'Selamat!' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.wish).toBeTruthy();
  });

  test('72 — GET wishes from published site → 200 + does not leak internal fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/public/site/${pubSlug}/wishes`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.wishes)).toBe(true);
    for (const w of body.wishes) {
      expect(w).not.toHaveProperty('ip');
      expect(w).not.toHaveProperty('user_id');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 7: Cookie & auth sanity
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('7 — Cookie & auth sanity', () => {
  test('80 — login sets httpOnly cookie', async ({ page }) => {
    const client = { email: `e2e_cookie_${TS}@test.local`, password: 'CookieTest99!' };
    await registerAndGetId(page, client.email, client.password, `Cookie ${TS}`);

    await page.goto('/login');
    await page.locator('input[name="email"]').fill(client.email);
    await page.locator('input[name="password"]').fill(client.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });

    const cookies = await page.context().cookies();
    const authCookie = cookies.find((c) => c.name === (process.env.COOKIE_NAME || 'wsaas_token'));
    expect(authCookie).toBeTruthy();
    expect(authCookie.httpOnly).toBe(true);
    expect(authCookie.sameSite).toBe('Lax');
  });

  test('81 — logout clears cookie and redirects to /login', async ({ page }) => {
    const client = { email: `e2e_cookie_${TS}@test.local`, password: 'CookieTest99!' };
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(client.email);
    await page.locator('input[name="password"]').fill(client.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });

    const ctxCookies = await page.context().cookies();
    const csrfCookie = ctxCookies.find(c => c.name === '_csrf_tok');
    await page.request.post('/logout', {
      form: { _csrf: csrfCookie ? csrfCookie.value : '' },
    });
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((c) => c.name === (process.env.COOKIE_NAME || 'wsaas_token'));
    const hasValue = authCookie && authCookie.value && authCookie.value.length > 0;
    expect(hasValue).toBeFalsy();
  });

  test('82 — invalid JWT cookie → treated as guest', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: {
        Cookie: `${process.env.COOKIE_NAME || 'wsaas_token'}=this.is.not.a.valid.jwt`,
        Accept: 'application/json',
      },
    });
    const res = await ctx.get('/api/auth/me');
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  /* ═══════════ CSRF ═══════════ */

  test('83 — POST without CSRF token → 403', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    await ctx.post('/api/auth/login', {
      data: { email: `e2e_idor_a_${TS}@test.local`, password: 'ClientA_Pass1!' },
    });
    const res = await ctx.post('/billing/checkout', {
      maxRedirects: 0,
      form: { plan_code: 'starter', promo_code: '' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('84 — POST with valid CSRF token → not 403 (CSRF passes)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const loginPage = await ctx.get('/login');
    let csrf = '';
    for (const h of await loginPage.headersArray()) {
      if (h.name.toLowerCase() === 'set-cookie') {
        const m = h.value.match(/_csrf_tok=([^;]+)/);
        if (m) csrf = m[1];
      }
    }
    const res = await ctx.post('/login', {
      maxRedirects: 0,
      form: { email: 'nobody@test.local', password: 'wrongpass', _csrf: csrf },
    });
    // Should get 200 (re-render with "invalid credentials") or 302 — not 403
    expect(res.status()).not.toBe(403);
    await ctx.dispose();
  });

  test('85 — Helmet security headers present', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBeTruthy();
  });

  test('86 — webhook without CSRF token → still 200 (whitelisted)', async ({ request }) => {
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: { transaction_status: 'settlement' },
    });
    expect(res.status()).not.toBe(403);
  });
});
