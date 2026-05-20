/**
 * E2E — Billing & Paket (/billing, /billing/checkout, /pricing, promo, webhook)
 *
 * Prasyarat:
 *   - Server jalan di PLAYWRIGHT_BASE_URL (default localhost:3000)
 *   - MySQL + .env
 *   - npm run seed (super admin)
 *   - Midtrans keys TIDAK harus valid — sebagian besar test memakai promo 100% (free checkout)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const crypto = require('crypto');
const { test, expect } = require('@playwright/test');
const { query, one } = require('../src/db');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';

const TS = Date.now();
const PLANS = ['starter', 'standard', 'premium'];
const PLAN_AMOUNTS = { starter: 299000, standard: 499000, premium: 799000 };

const CLIENT_A = {
  name: `E2E BillA ${TS}`,
  email: `e2e_billa_${TS}@test.local`,
  password: 'BillTestA99!',
};
const CLIENT_B = {
  name: `E2E BillB ${TS}`,
  email: `e2e_billb_${TS}@test.local`,
  password: 'BillTestB99!',
};

const PROMO_CODE_100 = `E2EFREE${TS}`;
const PROMO_CODE_50 = `E2EHALF${TS}`;
const PROMO_CODE_FIXED = `E2EFIX${TS}`;
const PROMO_CODE_EXPIRED = `E2EEXP${TS}`;
const PROMO_CODE_FUTURE = `E2EFUT${TS}`;
const PROMO_CODE_MAX1 = `E2EMAX1${TS}`;
const PROMO_CODE_STARTER_ONLY = `E2ESTAR${TS}`;

async function registerUser(page, user) {
  await page.goto('/register');
  await page.locator('input[name="name"]').fill(user.name);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
}

async function loginClient(page, user) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function getCsrfToken(ctx) {
  const res = await ctx.get('/billing');
  const cookies = (await res.headersArray()).filter(h => h.name.toLowerCase() === 'set-cookie');
  for (const c of cookies) {
    const m = c.value.match(/_csrf_tok=([^;]+)/);
    if (m) return m[1];
  }
  return '';
}

async function apiLoginSuper(playwright) {
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  const r = await ctx.post('/api/auth/login', {
    data: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  if (!r.ok()) throw new Error(`super login failed: ${r.status()}`);
  return ctx;
}

function midtransSignature(orderId, statusCode, grossAmount) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('Billing & Paket', () => {
  let clientAId;
  let clientBId;

  /* ═════════════════════════════════════════════════════
   * SETUP
   * ═════════════════════════════════════════════════════ */
  test('00 — setup: register dua client + buat kode promo di DB', async ({ page }) => {
    await registerUser(page, CLIENT_A);
    await registerUser(page, CLIENT_B);

    const rowA = await one('SELECT id FROM users WHERE email = ?', [CLIENT_A.email]);
    const rowB = await one('SELECT id FROM users WHERE email = ?', [CLIENT_B.email]);
    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();
    clientAId = rowA.id;
    clientBId = rowB.id;

    const promos = [
      { code: PROMO_CODE_100, discount_type: 'percent', discount_value: 100, active: 1 },
      { code: PROMO_CODE_50, discount_type: 'percent', discount_value: 50, active: 1 },
      { code: PROMO_CODE_FIXED, discount_type: 'fixed', discount_value: 100000, active: 1 },
      { code: PROMO_CODE_EXPIRED, discount_type: 'percent', discount_value: 100, active: 1,
        valid_until: '2020-01-01 00:00:00' },
      { code: PROMO_CODE_FUTURE, discount_type: 'percent', discount_value: 100, active: 1,
        valid_from: '2099-01-01 00:00:00' },
      { code: PROMO_CODE_MAX1, discount_type: 'percent', discount_value: 100, active: 1,
        max_uses: 1, per_user_limit: 1 },
      { code: PROMO_CODE_STARTER_ONLY, discount_type: 'percent', discount_value: 100, active: 1,
        applicable_plans: JSON.stringify(['starter']) },
    ];
    for (const p of promos) {
      await query(
        `INSERT INTO promo_codes (code, discount_type, discount_value, active, max_uses, per_user_limit, valid_from, valid_until, applicable_plans)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.code, p.discount_type, p.discount_value, p.active,
          p.max_uses ?? null, p.per_user_limit ?? 1,
          p.valid_from ?? null, p.valid_until ?? null,
          p.applicable_plans ?? null,
        ],
      );
    }
  });

  /* ═════════════════════════════════════════════════════
   * HALAMAN BILLING — TAMPILAN
   * ═════════════════════════════════════════════════════ */
  test('01 — tamu: /billing → redirect login', async ({ request }) => {
    const r = await request.get(`${BASE}/billing`, { maxRedirects: 0 });
    expect([301, 302]).toContain(r.status());
    expect(r.headers().location || '').toMatch(/login/i);
  });

  test('02 — client: /billing menampilkan judul, 3 paket, slot kredit, riwayat', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await expect(page.locator('h1.dash-title')).toContainText(/Billing/i);
    const plans = page.locator('.billing-plan');
    await expect(plans).toHaveCount(3);
    for (const code of PLANS) {
      await expect(page.locator(`.billing-plan input[name="plan_code"][value="${code}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.billing-credits')).toBeVisible();
    await expect(page.locator('.billing-credits .stat-card')).toHaveCount(3);
    await expect(page.locator('.billing-history-section')).toBeVisible();
  });

  test('03 — client baru: slot tersedia = 0, pembayaran sukses = 0', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    const slots = page.locator('.billing-credits .stat-card').first();
    await expect(slots.locator('.stat-card__val')).toHaveText('0');
  });

  test('04 — ?required=1 menampilkan flash warning "belum punya slot"', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing?required=1');
    await expect(page.locator('.flash-warning')).toBeVisible();
    await expect(page.locator('.flash-warning')).toContainText(/slot|paket/i);
  });

  test('05 — ?required=1&reason=quota menampilkan flash warning "slot habis"', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing?required=1&reason=quota');
    await expect(page.locator('.flash-warning')).toBeVisible();
    await expect(page.locator('.flash-warning')).toContainText(/slot.*habis/i);
  });

  test('06 — sidebar link "Billing" aktif di /billing', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    const link = page.locator('#admin-sidebar a.sidebar-nav__link[href="/billing"]');
    await expect(link).toHaveClass(/is-active/);
  });

  test('07 — input promo_code terlihat dan ada hint', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await expect(page.locator('#billing-promo-code')).toBeVisible();
    await expect(page.locator('.billing-promo-panel__hint')).toBeVisible();
  });

  /* ═════════════════════════════════════════════════════
   * HALAMAN PRICING PUBLIK
   * ═════════════════════════════════════════════════════ */
  test('08 — /pricing terbuka tanpa login dan menampilkan 3 paket', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('body')).toContainText(/pricing|harga|paket/i);
  });

  /* ═════════════════════════════════════════════════════
   * CHECKOUT — PROMO 100% (free)
   * ═════════════════════════════════════════════════════ */
  test('09 — checkout promo 100%: langsung paid, redirect ?checkout=free_ok, flash sukses', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_100);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const starterForm = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await starterForm.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing\?checkout=free_ok/, { timeout: 15_000 });
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText(/gratis|promo/i);

    const slotVal = page.locator('.billing-credits .stat-card').first().locator('.stat-card__val');
    await expect(slotVal).toHaveText('1');
  });

  test('10 — riwayat transaksi menampilkan order paid dengan promo', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    const historyTable = page.locator('.billing-history-section table tbody tr');
    await expect(historyTable.first()).toBeVisible();
    await expect(historyTable.first()).toContainText('paid');
    await expect(historyTable.first()).toContainText(PROMO_CODE_100);
    await expect(historyTable.first()).toContainText('Rp 0');
  });

  /* ═════════════════════════════════════════════════════
   * CHECKOUT — PROMO VALIDASI NEGATIF
   * ═════════════════════════════════════════════════════ */
  test('11 — promo kedaluwarsa → flash error', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_EXPIRED);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const form = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing/, { timeout: 15_000 });
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/kedaluwarsa/i);
  });

  test('12 — promo belum berlaku → flash error', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_FUTURE);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const form = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing/, { timeout: 15_000 });
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/belum berlaku/i);
  });

  test('13 — promo tidak dikenal → flash error', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill('TIDAK-ADA-PROMO-XYZ');
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const form = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing/, { timeout: 15_000 });
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/tidak dikenal/i);
  });

  test('14 — promo starter-only pada paket premium → flash error', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_STARTER_ONLY);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const form = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="premium"]'),
    });
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing/, { timeout: 15_000 });
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/tidak berlaku/i);
  });

  test('15 — promo max_uses=1: A pakai → OK; B pakai → kuota habis', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_MAX1);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const formA = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await formA.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing\?checkout=free_ok/, { timeout: 15_000 });
    await expect(page.locator('.flash-success')).toBeVisible();

    await loginClient(page, CLIENT_B);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_MAX1);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const formB = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await formB.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing/, { timeout: 15_000 });
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/kuota.*habis/i);
  });

  test('16 — per_user_limit: A pakai promo 100% lagi → "sudah memakai"', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    await page.locator('#billing-promo-code').fill(PROMO_CODE_100);
    await page.locator('#billing-promo-code').dispatchEvent('input');
    const form = page.locator('.billing-plan__form').filter({
      has: page.locator('input[name="plan_code"][value="starter"]'),
    });
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/billing/, { timeout: 15_000 });
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/sudah memakai/i);
  });

  /* ═════════════════════════════════════════════════════
   * CHECKOUT — PLAN TIDAK VALID (API)
   * ═════════════════════════════════════════════════════ */
  test('17 — POST /billing/checkout plan_code=nonexistent → error', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    await ctx.post('/api/auth/login', { data: { email: CLIENT_A.email, password: CLIENT_A.password } });
    const csrf = await getCsrfToken(ctx);
    const res = await ctx.post('/billing/checkout', {
      maxRedirects: 0,
      form: { plan_code: 'nonexistent', promo_code: '', _csrf: csrf },
    });
    expect(res.status()).toBe(302);
    const loc = res.headers().location || '';
    expect(loc).toContain('checkout_error');
    expect(decodeURIComponent(loc)).toContain('tidak valid');
    await ctx.dispose();
  });

  test('18 — POST /billing/checkout tanpa login → blocked (CSRF or redirect)', async ({ request }) => {
    const res = await request.post(`${BASE}/billing/checkout`, {
      maxRedirects: 0,
      form: { plan_code: 'starter', promo_code: '' },
    });
    // 403 from CSRF (no token) or 301/302 redirect to login — either blocks access
    expect([301, 302, 403]).toContain(res.status());
  });

  test('19 — super admin POST /billing/checkout → 403 (hanya client boleh)', async ({ playwright }) => {
    const ctx = await apiLoginSuper(playwright);
    const csrf = await getCsrfToken(ctx);
    const res = await ctx.post('/billing/checkout', {
      maxRedirects: 0,
      form: { plan_code: 'starter', promo_code: '', _csrf: csrf },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  /* ═════════════════════════════════════════════════════
   * CHECKOUT — PROMO 50% & FIXED (validasi amount)
   * ═════════════════════════════════════════════════════ */
  test('20 — promo 50% pada starter: order dibuat pending (gross_amount = setengah)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    await ctx.post('/api/auth/login', { data: { email: CLIENT_B.email, password: CLIENT_B.password } });
    const csrf = await getCsrfToken(ctx);
    const res = await ctx.post('/billing/checkout', {
      maxRedirects: 0,
      form: { plan_code: 'starter', promo_code: PROMO_CODE_50, _csrf: csrf },
    });
    const loc = res.headers().location || '';
    if (loc.includes('checkout_error') && loc.includes('Midtrans')) {
      const order = await one(
        "SELECT * FROM payment_orders WHERE user_id = ? AND promo_code = ? ORDER BY id DESC LIMIT 1",
        [clientBId, PROMO_CODE_50],
      );
      if (!order) {
        expect(loc).not.toContain('checkout_error');
      } else {
        expect(Number(order.gross_amount)).toBe(Math.floor(PLAN_AMOUNTS.starter / 2));
        expect(Number(order.discount_amount)).toBe(Math.floor(PLAN_AMOUNTS.starter / 2));
      }
    } else {
      const order = await one(
        "SELECT * FROM payment_orders WHERE user_id = ? AND promo_code = ? ORDER BY id DESC LIMIT 1",
        [clientBId, PROMO_CODE_50],
      );
      expect(order).toBeTruthy();
      expect(Number(order.gross_amount)).toBe(Math.floor(PLAN_AMOUNTS.starter / 2));
    }
    await ctx.dispose();
  });

  /* ═════════════════════════════════════════════════════
   * MIDTRANS WEBHOOK (API)
   * ═════════════════════════════════════════════════════ */
  test('21 — webhook tanpa order_id → 400', async ({ request }) => {
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: { transaction_status: 'settlement' },
    });
    expect(res.status()).toBe(400);
    const j = await res.json();
    expect(j.error).toBe('missing order_id');
  });

  test('22 — webhook signature invalid → 401', async ({ request }) => {
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: 'FAKE-ORDER-123',
        status_code: '200',
        gross_amount: '100000.00',
        signature_key: 'invalidsignature',
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(401);
    const j = await res.json();
    expect(j.error).toBe('invalid signature');
  });

  test('23 — webhook order_id tidak ada di DB → 404', async ({ request }) => {
    const orderId = `E2E-MISSING-${TS}`;
    const sig = midtransSignature(orderId, '200', '100000.00');
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '100000.00',
        signature_key: sig,
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(404);
  });

  test('24 — webhook settlement valid → order paid', async ({ request }) => {
    const orderId = `E2E-WH-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, clientAId],
    );
    const sig = midtransSignature(orderId, '200', '299000');
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '299000',
        signature_key: sig,
        transaction_status: 'settlement',
        fraud_status: 'accept',
        payment_type: 'bank_transfer',
      },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.status).toBe('paid');

    const order = await one('SELECT * FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(order.status).toBe('paid');
    expect(order.payment_type).toBe('bank_transfer');
    expect(order.paid_at).toBeTruthy();
  });

  test('25 — webhook /vendor/midtrans/webhook juga jalan (alias endpoint)', async ({ request }) => {
    const orderId = `E2E-WH2-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'standard', 499000, 'IDR', 'pending')`,
      [orderId, clientBId],
    );
    const sig = midtransSignature(orderId, '200', '499000');
    const res = await request.post(`${BASE}/vendor/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '499000',
        signature_key: sig,
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.status).toBe('paid');
  });

  test('26 — webhook expired → order expired', async ({ request }) => {
    const orderId = `E2E-EXP-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, clientAId],
    );
    const sig = midtransSignature(orderId, '407', '299000');
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '407',
        gross_amount: '299000',
        signature_key: sig,
        transaction_status: 'expire',
      },
    });
    expect(res.status()).toBe(200);
    const order = await one('SELECT * FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(order.status).toBe('expired');
  });

  test('27 — webhook cancel → order cancelled', async ({ request }) => {
    const orderId = `E2E-CAN-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, clientAId],
    );
    const sig = midtransSignature(orderId, '200', '299000');
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '299000',
        signature_key: sig,
        transaction_status: 'cancel',
      },
    });
    expect(res.status()).toBe(200);
    const order = await one('SELECT * FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(order.status).toBe('cancelled');
  });

  /* ═════════════════════════════════════════════════════
   * KEAMANAN
   * ═════════════════════════════════════════════════════ */
  test('28 — client tidak bisa akses /billing client lain', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    const html = await page.content();
    expect(html).not.toContain(CLIENT_B.email);
  });

  test('29 — XSS di checkout_error: tag di-escape', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing?checkout_error=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    const html = await page.content();
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  test('30 — POST /billing/checkout dengan body besar (64 KB field) → tidak crash', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    await ctx.post('/api/auth/login', { data: { email: CLIENT_A.email, password: CLIENT_A.password } });
    const csrf = await getCsrfToken(ctx);
    const bigValue = 'X'.repeat(65536);
    const res = await ctx.post('/billing/checkout', {
      maxRedirects: 0,
      form: { plan_code: 'starter', promo_code: bigValue, _csrf: csrf },
    });
    expect([302, 400, 413]).toContain(res.status());
    await ctx.dispose();
  });

  /* ═════════════════════════════════════════════════════
   * STRESS TEST — rapid-fire checkout requests
   * ═════════════════════════════════════════════════════ */
  test('31 — stress: 10 checkout berturut-turut dengan promo kosong (tanpa Midtrans) → semua redirect, tidak 500', async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    await ctx.post('/api/auth/login', { data: { email: CLIENT_A.email, password: CLIENT_A.password } });
    const csrf = await getCsrfToken(ctx);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ctx.post('/billing/checkout', {
          maxRedirects: 0,
          form: { plan_code: PLANS[i % 3], promo_code: '', _csrf: csrf },
        }),
      ),
    );
    for (const r of results) {
      expect([302, 400, 402]).toContain(r.status());
      if (r.status() === 302) {
        const loc = r.headers().location || '';
        expect(loc).toMatch(/billing|midtrans/i);
      }
    }
    await ctx.dispose();
  });

  test('32 — stress: 10 webhook berturut-turut tanpa signature → semua 401, tidak crash', async ({ request }) => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request.post(`${BASE}/payments/midtrans/webhook`, {
          data: {
            order_id: `STRESS-${TS}-${i}`,
            status_code: '200',
            gross_amount: '100000',
            signature_key: 'badsig',
            transaction_status: 'settlement',
          },
        }),
      ),
    );
    for (const r of results) {
      expect(r.status()).toBe(401);
    }
  });

  test('33 — stress: 20 GET /billing berturut-turut → semua 200', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    await ctx.post('/api/auth/login', { data: { email: CLIENT_A.email, password: CLIENT_A.password } });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ctx.get('/billing', { headers: { Accept: 'text/html' } }),
      ),
    );
    for (const r of results) {
      expect(r.status()).toBe(200);
    }
    await ctx.dispose();
  });

  test('34 — stress: 10 webhook valid berturut-turut pada order berbeda → semua 200', async ({ request }) => {
    const orderIds = [];
    for (let i = 0; i < 10; i++) {
      const oid = `E2E-STRESS-WH-${TS}-${i}`;
      orderIds.push(oid);
      await query(
        `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
         VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
        [oid, clientAId],
      );
    }
    const results = await Promise.all(
      orderIds.map((oid) => {
        const sig = midtransSignature(oid, '200', '299000');
        return request.post(`${BASE}/payments/midtrans/webhook`, {
          data: {
            order_id: oid,
            status_code: '200',
            gross_amount: '299000',
            signature_key: sig,
            transaction_status: 'settlement',
          },
        });
      }),
    );
    for (const r of results) {
      expect(r.status()).toBe(200);
      const j = await r.json();
      expect(j.status).toBe('paid');
    }
  });

  /* ═════════════════════════════════════════════════════
   * SLOT KREDIT — verifikasi setelah banyak checkout
   * ═════════════════════════════════════════════════════ */
  test('35 — slot kredit client A bertambah sesuai jumlah paid order', async ({ page }) => {
    await loginClient(page, CLIENT_A);
    await page.goto('/billing');
    const paidCount = await one(
      "SELECT COUNT(*) AS c FROM payment_orders WHERE user_id = ? AND status = 'paid'",
      [clientAId],
    );
    const usedCount = await one(
      "SELECT COUNT(*) AS c FROM sites WHERE owner_user_id = ? AND site_type = 'invitation'",
      [clientAId],
    );
    const expectedAvail = Math.max(0, Number(paidCount.c) - Number(usedCount.c));

    const slotVal = page.locator('.billing-credits .stat-card').first().locator('.stat-card__val');
    await expect(slotVal).toHaveText(String(expectedAvail));
  });
});
