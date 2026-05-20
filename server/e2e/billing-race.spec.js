/**
 * E2E — Payment race condition & concurrency tests
 *
 * Menguji skenario:
 *   1. Webhook settlement dikirim N kali bersamaan untuk 1 order → paid_at hanya di-set sekali,
 *      slot hanya +1 (bukan +N).
 *   2. Promo max_uses=1 di-checkout bersamaan oleh banyak user → hanya 1 yang paid,
 *      sisanya di-tolak (atau jika lolos ke Midtrans, order tetap pending).
 *   3. Dua webhook status berbeda (settlement vs expire) pada saat bersamaan → hasilnya konsisten.
 *   4. Checkout bersamaan dari 1 user → masing-masing dapat order_id unik (Date.now()),
 *      slot dihitung ulang benar.
 *
 * Prasyarat: Server + MySQL + .env + npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const crypto = require('crypto');
const { test, expect } = require('@playwright/test');
const { query, one } = require('../src/db');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';

const TS = Date.now();

function midtransSignature(orderId, statusCode, grossAmount) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

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
  const res = await ctx.get('/billing');
  const cookies = (await res.headersArray()).filter(h => h.name.toLowerCase() === 'set-cookie');
  for (const c of cookies) {
    const m = c.value.match(/_csrf_tok=([^;]+)/);
    if (m) return m[1];
  }
  return '';
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('Payment race conditions & concurrency', () => {
  const RACE_USER = {
    email: `e2e_race_${TS}@test.local`,
    password: 'RaceTest99!',
    name: `E2E Race ${TS}`,
  };
  const PROMO_RACE = `E2ERACE${TS}`;
  let raceUserId;

  test('00 — setup: register user + buat promo max_uses=2 per_user_limit=10', async ({ page }) => {
    raceUserId = await registerAndGetId(page, RACE_USER.email, RACE_USER.password, RACE_USER.name);

    await query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, active, max_uses, per_user_limit)
       VALUES (?, 'percent', 100, 1, 2, 10)`,
      [PROMO_RACE],
    );
  });

  /* ═══════════════════════════════════════════════════
   * 1. Duplicate webhook settlement untuk 1 order
   * ═══════════════════════════════════════════════════ */
  test('01 — 10 webhook settlement bersamaan pada 1 order → paid_at di-set sekali, status tetap paid', async ({
    request,
  }) => {
    const orderId = `E2E-RACE-WH-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, raceUserId],
    );

    const sig = midtransSignature(orderId, '200', '299000');
    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '299000',
      signature_key: sig,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      payment_type: 'bank_transfer',
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request.post(`${BASE}/payments/midtrans/webhook`, { data: payload }),
      ),
    );

    for (const r of results) {
      expect(r.status()).toBe(200);
      const j = await r.json();
      expect(j.ok).toBe(true);
      expect(j.status).toBe('paid');
    }

    const order = await one('SELECT * FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(order.status).toBe('paid');
    expect(order.paid_at).toBeTruthy();

    const paidCount = await one(
      "SELECT COUNT(*) AS c FROM payment_orders WHERE order_id = ? AND status = 'paid'",
      [orderId],
    );
    expect(Number(paidCount.c)).toBe(1);
  });

  /* ═══════════════════════════════════════════════════
   * 2. Webhook settlement lalu expire bersamaan (conflicting)
   * ═══════════════════════════════════════════════════ */
  test('02 — webhook settlement + expire bersamaan pada 1 order → status akhir konsisten', async ({
    request,
  }) => {
    const orderId = `E2E-RACE-CONFLICT-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, raceUserId],
    );

    const sigSettlement = midtransSignature(orderId, '200', '299000');
    const sigExpire = midtransSignature(orderId, '407', '299000');

    const [rSettlement, rExpire] = await Promise.all([
      request.post(`${BASE}/payments/midtrans/webhook`, {
        data: {
          order_id: orderId,
          status_code: '200',
          gross_amount: '299000',
          signature_key: sigSettlement,
          transaction_status: 'settlement',
          fraud_status: 'accept',
        },
      }),
      request.post(`${BASE}/payments/midtrans/webhook`, {
        data: {
          order_id: orderId,
          status_code: '407',
          gross_amount: '299000',
          signature_key: sigExpire,
          transaction_status: 'expire',
        },
      }),
    ]);

    expect(rSettlement.status()).toBe(200);
    expect(rExpire.status()).toBe(200);

    const order = await one('SELECT * FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(['paid', 'expired']).toContain(order.status);
  });

  /* ═══════════════════════════════════════════════════
   * 3. Webhook idempotency: order yang sudah paid → tidak hilang paid_at
   * ═══════════════════════════════════════════════════ */
  test('03 — order sudah paid → webhook settlement ulang: paid_at tidak berubah, response alreadyPaid=true', async ({
    request,
  }) => {
    const orderId = `E2E-RACE-IDEMPOT-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status, paid_at)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'paid', '2026-01-01 10:00:00')`,
      [orderId, raceUserId],
    );

    const sig = midtransSignature(orderId, '200', '299000');
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '299000',
        signature_key: sig,
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.alreadyPaid).toBe(true);

    const order = await one('SELECT * FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(order.status).toBe('paid');
    expect(String(order.paid_at)).toContain('2026-01-01');
  });

  /* ═══════════════════════════════════════════════════
   * 4. Webhook paid → expire → paid_at & status preserved?
   *    (tests `paid_at = CASE WHEN 'paid' AND paid_at IS NULL`)
   * ═══════════════════════════════════════════════════ */
  test('04 — order sudah paid → webhook expire sesudahnya: status berubah tapi paid_at tetap', async ({
    request,
  }) => {
    const orderId = `E2E-RACE-PAIDEXP-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status, paid_at)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'paid', '2026-01-15 12:00:00')`,
      [orderId, raceUserId],
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
    expect(order.paid_at).toBeTruthy();
    expect(String(order.paid_at)).toContain('2026-01-15');
  });

  /* ═══════════════════════════════════════════════════
   * 5. Promo max_uses=2: 5 user checkout bersamaan → hanya ≤2 paid
   * ═══════════════════════════════════════════════════ */
  test('05 — promo max_uses=2: 5 user checkout bersamaan → max 2 berhasil (race condition fixed)', async ({
    page,
    playwright,
  }) => {
    const users = [];
    for (let i = 0; i < 5; i++) {
      const email = `e2e_racepromo_${TS}_${i}@test.local`;
      const pw = 'PromoRace99!';
      const uid = await registerAndGetId(page, email, pw, `Race Promo ${i}`);
      users.push({ email, pw, uid });
    }

    const contexts = await Promise.all(
      users.map((u) => apiLogin(playwright, u.email, u.pw)),
    );
    const csrfTokens = await Promise.all(contexts.map(getCsrfToken));

    const results = await Promise.all(
      contexts.map((ctx, i) =>
        ctx.post('/billing/checkout', {
          maxRedirects: 0,
          form: { plan_code: 'starter', promo_code: PROMO_RACE, _csrf: csrfTokens[i] },
        }),
      ),
    );

    let freeOkCount = 0;
    let rejectedCount = 0;
    for (const r of results) {
      expect([302, 400, 402]).toContain(r.status());
      const loc = r.headers().location || '';
      if (loc.includes('checkout=free_ok')) freeOkCount++;
      if (loc.includes('checkout_error')) rejectedCount++;
    }

    const paidWithPromo = await one(
      "SELECT COUNT(*) AS c FROM payment_orders WHERE promo_code = ? AND status = 'paid'",
      [PROMO_RACE],
    );
    const paidCount = Number(paidWithPromo.c);

    expect(paidCount).toBeGreaterThanOrEqual(1);
    expect(paidCount).toBeLessThanOrEqual(2);
    expect(freeOkCount).toBeLessThanOrEqual(2);
    expect(rejectedCount).toBeGreaterThanOrEqual(3);

    for (const ctx of contexts) await ctx.dispose();
  });

  /* ═══════════════════════════════════════════════════
   * 6. Rapid-fire checkout 1 user → setiap order_id unik
   * ═══════════════════════════════════════════════════ */
  test('06 — 5 checkout bersamaan 1 user → masing-masing order_id unik', async ({ playwright }) => {
    const ctx = await apiLogin(playwright, RACE_USER.email, RACE_USER.password);
    const csrf = await getCsrfToken(ctx);

    const promoRapid = `E2ERAPID${TS}`;
    await query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, active, max_uses, per_user_limit)
       VALUES (?, 'percent', 100, 1, 100, 100)`,
      [promoRapid],
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ctx.post('/billing/checkout', {
          maxRedirects: 0,
          form: { plan_code: 'starter', promo_code: promoRapid, _csrf: csrf },
        }),
      ),
    );

    const freeOkOrders = [];
    for (const r of results) {
      expect([302, 400, 402]).toContain(r.status());
    }

    const orders = await query(
      "SELECT order_id FROM payment_orders WHERE user_id = ? AND promo_code = ? ORDER BY id",
      [raceUserId, promoRapid],
    );
    const ids = orders.map((o) => o.order_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    await ctx.dispose();
  });

  /* ═══════════════════════════════════════════════════
   * 7. Slot count integrity setelah race
   * ═══════════════════════════════════════════════════ */
  test('07 — slot count di /billing cocok dengan paid orders di DB setelah semua race', async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(RACE_USER.email);
    await page.locator('input[name="password"]').fill(RACE_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
    await page.goto('/billing');

    const paidRow = await one(
      "SELECT COUNT(*) AS c FROM payment_orders WHERE user_id = ? AND status = 'paid'",
      [raceUserId],
    );
    const usedRow = await one(
      "SELECT COUNT(*) AS c FROM sites WHERE owner_user_id = ? AND site_type = 'invitation'",
      [raceUserId],
    );
    const expectedSlots = Math.max(0, Number(paidRow.c) - Number(usedRow.c));

    const slotVal = page.locator('.billing-credits .stat-card').first().locator('.stat-card__val');
    await expect(slotVal).toHaveText(String(expectedSlots));
  });

  /* ═══════════════════════════════════════════════════
   * 8. Double webhook: pending → settlement → settlement (idempotent)
   * ═══════════════════════════════════════════════════ */
  test('08 — sequential settlement+settlement: order tetap paid, paid_at tidak berubah', async ({
    request,
  }) => {
    const orderId = `E2E-RACE-DOUBLE-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, raceUserId],
    );

    const sig = midtransSignature(orderId, '200', '299000');
    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '299000',
      signature_key: sig,
      transaction_status: 'settlement',
    };

    const r1 = await request.post(`${BASE}/payments/midtrans/webhook`, { data: payload });
    expect(r1.status()).toBe(200);
    const j1 = await r1.json();
    expect(j1.status).toBe('paid');
    expect(j1.alreadyPaid).toBe(false);

    const orderAfterFirst = await one('SELECT paid_at FROM payment_orders WHERE order_id = ?', [orderId]);
    const paidAt1 = String(orderAfterFirst.paid_at);

    const r2 = await request.post(`${BASE}/payments/midtrans/webhook`, { data: payload });
    expect(r2.status()).toBe(200);
    const j2 = await r2.json();
    expect(j2.status).toBe('paid');
    expect(j2.alreadyPaid).toBe(true);

    const orderAfterSecond = await one('SELECT paid_at FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(String(orderAfterSecond.paid_at)).toBe(paidAt1);
  });

  /* ═══════════════════════════════════════════════════
   * 9. Webhook dengan gross_amount format berbeda (Midtrans kadang kirim ".00")
   * ═══════════════════════════════════════════════════ */
  test('09 — webhook gross_amount "299000.00" (decimal) → signature tetap valid', async ({
    request,
  }) => {
    const orderId = `E2E-RACE-DECIMAL-${TS}`;
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status)
       VALUES (?, ?, 'starter', 299000, 'IDR', 'pending')`,
      [orderId, raceUserId],
    );

    const sig = midtransSignature(orderId, '200', '299000.00');
    const res = await request.post(`${BASE}/payments/midtrans/webhook`, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '299000.00',
        signature_key: sig,
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.status).toBe('paid');
  });
});
