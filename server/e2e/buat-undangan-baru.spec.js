require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { test, expect } = require('@playwright/test');
const { query, one } = require('../src/db');
const { getValidThemeKeys } = require('./helpers/themeKeys');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';

const TS = Date.now();
const SLUG_SUCCESS = `e2e-new-${TS}`;
const SLUG_CLIENT_PAID = `e2e-clientpaid-${TS}`;

const USER_NO_PLAN = {
  name: `E2E BuatUndangan ${TS}`,
  email: `e2e_buat_${TS}@test.local`,
  password: 'BuatUndangan99!',
};

const USER_A = {
  name: `E2E OwnerA ${TS}`,
  email: `e2e_ownera_${TS}@test.local`,
  password: 'OwnerATest99!',
};

const USER_B = {
  name: `E2E OwnerB ${TS}`,
  email: `e2e_ownerb_${TS}@test.local`,
  password: 'OwnerBTest99!',
};

async function loginSuperPage(page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(SUPER_EMAIL);
  await page.locator('input[name="password"]').fill(SUPER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function loginEmailPassword(page, email, password) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function apiLogin(playwright, email, password) {
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  const login = await ctx.post('/api/auth/login', {
    data: { email, password },
  });
  if (!login.ok()) {
    const t = await login.text();
    throw new Error(`Login failed (${login.status()}): ${t.slice(0, 200)}`);
  }
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

async function insertPaidOrderForUser(userId, suffix = '') {
  const orderId = `e2e-paid-${TS}-${userId}${suffix}`;
  await query(
    `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status, paid_at)
     VALUES (?, ?, 'starter', 199000, 'IDR', 'paid', NOW())`,
    [orderId, userId],
  );
}

test.describe.serial('Buat undangan baru (/sites/new)', () => {
  test('00 — daftar klien (tanpa bayar) untuk skenario billing', async ({ page }) => {
    await page.goto('/register');
    await page.locator('input[name="name"]').fill(USER_NO_PLAN.name);
    await page.locator('input[name="email"]').fill(USER_NO_PLAN.email);
    await page.locator('input[name="password"]').fill(USER_NO_PLAN.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
  });

  test('01 — tamu: GET /sites/new → redirect login', async ({ request }) => {
    const res = await request.get(`${BASE}/sites/new`, { maxRedirects: 0 });
    expect([301, 302]).toContain(res.status());
    expect(res.headers().location || '').toMatch(/login/i);
  });

  test('02 — tamu: POST /sites/new → blocked (CSRF or redirect login)', async ({ request }) => {
    const res = await request.post(`${BASE}/sites/new`, {
      maxRedirects: 0,
      form: { slug: 'hack-slug', theme_key: 'theme1' },
    });
    // 403 from CSRF (no token) or 301/302 redirect to login — either blocks access
    expect([301, 302, 403]).toContain(res.status());
  });

  test('03 — super: halaman /sites/new (form, judul, tema)', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new');
    await expect(page.locator('h1')).toContainText(/Buat undangan baru/i);
    await expect(page.locator('#form-new-site')).toBeVisible();
    await expect(page.locator('#form-new-site input[name="slug"]')).toBeVisible();
    await expect(page.locator('#theme_key')).toBeVisible();
    await expect(page.locator('#owner_user_id')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Create site/i })).toBeVisible();
  });

  test('04 — super: ?theme_key=theme3 memilih tema di form', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new?theme_key=theme3');
    await expect(page.locator('.callout--info')).toContainText(/theme3/i);
    await expect(page.locator('#theme_key')).toHaveValue('theme3');
  });

  test('05 — super: ?theme_key=tidak-ada tidak memaksa tema invalid', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new?theme_key=tidak-ada-theme-xyz');
    await expect(page.locator('.callout--info')).toHaveCount(0);
    const v = await page.locator('#theme_key').inputValue();
    expect(getValidThemeKeys()).toContain(v);
  });

  test('06 — super: submit valid → redirect kelola situs (?new=1)', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new');
    await page.locator('#form-new-site input[name="slug"]').fill(SLUG_SUCCESS);
    await page.locator('#theme_key').selectOption(getValidThemeKeys()[0]);
    await page.locator('#form-new-site').evaluate((form) => form.submit());
    await page.waitForURL(/\/sites\/\d+\?new=1/, { timeout: 15_000 });
    await expect(page.locator('h1.site-show-header__slug')).toContainText(SLUG_SUCCESS);
  });

  test('07 — super: slug duplikat → pesan error di halaman', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new');
    await page.locator('#form-new-site input[name="slug"]').fill(SLUG_SUCCESS);
    await page.locator('#theme_key').selectOption(getValidThemeKeys()[0]);
    await page.locator('#form-new-site').evaluate((form) => form.submit());
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/slug|used|pakai/i);
  });

  test('08 — super: slug tidak valid (huruf besar) → error validasi', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new');
    await page.locator('#form-new-site input[name="slug"]').fill('BadSlugCaps');
    await page.locator('#theme_key').selectOption(getValidThemeKeys()[0]);
    await page.locator('#form-new-site').evaluate((form) => form.submit());
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('09 — super: dari /dashboard, sidebar "Buat undangan baru" → /sites/new', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/dashboard');
    await page.locator('#admin-sidebar a.sidebar-nav__link[href="/sites/new"]').click();
    await expect(page).toHaveURL(/\/sites\/new$/);
    await expect(page.locator('#form-new-site')).toBeVisible();
  });

  test('10 — super: tombol Cancel → /dashboard', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/sites/new');
    await page.getByRole('link', { name: /Cancel/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('11 — klien tanpa pembayaran: /sites/new → /billing', async ({ page }) => {
    await loginEmailPassword(page, USER_NO_PLAN.email, USER_NO_PLAN.password);
    await page.goto('/sites/new');
    await expect(page).toHaveURL(/\/billing/);
  });

  test('12 — daftar dua klien + bayar untuk A (DB) — lalu A buat undangan dari form', async ({ page, playwright }) => {
    await page.goto('/register');
    await page.locator('input[name="name"]').fill(USER_A.name);
    await page.locator('input[name="email"]').fill(USER_A.email);
    await page.locator('input[name="password"]').fill(USER_A.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });

    await page.goto('/register');
    await page.locator('input[name="name"]').fill(USER_B.name);
    await page.locator('input[name="email"]').fill(USER_B.email);
    await page.locator('input[name="password"]').fill(USER_B.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });

    const rowA = await one('SELECT id FROM users WHERE email = ?', [USER_A.email]);
    expect(rowA).toBeTruthy();
    await insertPaidOrderForUser(rowA.id);
    await insertPaidOrderForUser(rowA.id, '-slot2');

    await loginEmailPassword(page, USER_A.email, USER_A.password);
    await page.goto('/sites/new');
    await expect(page.locator('#form-new-site')).toBeVisible();
    await page.locator('#form-new-site input[name="slug"]').fill(SLUG_CLIENT_PAID);
    await page.locator('#theme_key').selectOption(getValidThemeKeys()[0]);
    await page.locator('#form-new-site').evaluate((form) => form.submit());
    await page.waitForURL(/\/sites\/\d+\?new=1/, { timeout: 15_000 });
    await expect(page.locator('h1.site-show-header__slug')).toContainText(SLUG_CLIENT_PAID);

    const rowB = await one('SELECT id FROM users WHERE email = ?', [USER_B.email]);
    const ctx = await apiLogin(playwright, USER_A.email, USER_A.password);
    const csrf = await getCsrfToken(ctx);
    const resTamper = await ctx.post('/sites/new', {
      maxRedirects: 0,
      form: {
        slug: `e2e-tamper-${TS}`,
        theme_key: getValidThemeKeys()[0],
        owner_user_id: String(rowB.id),
        managed_by: 'self',
        _csrf: csrf,
      },
    });
    expect(resTamper.status()).toBe(302);
    const loc = resTamper.headers().location || '';
    const m = loc.match(/\/sites\/(\d+)/);
    expect(m).toBeTruthy();
    const newSiteId = Number(m[1]);
    const siteRow = await one('SELECT owner_user_id FROM sites WHERE id = ?', [newSiteId]);
    expect(siteRow.owner_user_id).toBe(rowA.id);
    await ctx.dispose();
  });
});
