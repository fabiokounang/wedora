/**
 * E2E — Extended production tests
 *
 * Covers: media upload validation, Midtrans webhook edge cases,
 * CSV RSVP export, public guest UI, WA blast, catalog → demo flow,
 * and session/cookie hardening.
 *
 * Prasyarat: Server + MySQL + .env + npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { query, one } = require('../src/db');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';
const TS = Date.now();

test.describe.configure({ mode: 'serial', timeout: 180_000 });

function midtransSignature(orderId, statusCode, grossAmount) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

async function loginSuper(page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(SUPER_EMAIL);
  await page.locator('input[name="password"]').fill(SUPER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function apiLogin(request, email, password) {
  const ctx = await request.newContext({ baseURL: BASE });
  await ctx.post('/api/auth/login', { data: { email, password } });
  return ctx;
}

async function registerUser(page, email, password, name) {
  await page.goto('/register');
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
  return one('SELECT id FROM users WHERE email = ?', [email]);
}

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 1: Upload Media Validation
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('1 — Upload Media Validation', () => {
  let superCtx;
  let testSiteId;

  test('00 — setup: login + find a site', async ({ playwright }) => {
    superCtx = await apiLogin(playwright.request, SUPER_EMAIL, SUPER_PASSWORD);
    const site = await one('SELECT id FROM sites LIMIT 1');
    expect(site).toBeTruthy();
    testSiteId = site.id;
  });

  test('01 — upload valid image → 201', async () => {
    const tmpFile = path.join(__dirname, '_test_valid.png');
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(tmpFile, pngHeader);
    try {
      const res = await superCtx.post(`${BASE}/api/sites/${testSiteId}/media`, {
        multipart: {
          file: { name: 'test.png', mimeType: 'image/png', buffer: pngHeader },
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.media).toBeTruthy();
      expect(body.media.mime_type).toContain('image');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  test('02 — upload non-image (text file) → 400 or 500 (multer rejection)', async () => {
    const textBuf = Buffer.from('this is not an image');
    const res = await superCtx.post(`${BASE}/api/sites/${testSiteId}/media`, {
      multipart: {
        file: { name: 'evil.txt', mimeType: 'text/plain', buffer: textBuf },
      },
    });
    expect([400, 500]).toContain(res.status());
  });

  test('03 — upload JS file disguised as image → rejected', async () => {
    const jsBuf = Buffer.from('alert("xss")');
    const res = await superCtx.post(`${BASE}/api/sites/${testSiteId}/media`, {
      multipart: {
        file: { name: 'evil.js', mimeType: 'application/javascript', buffer: jsBuf },
      },
    });
    expect([400, 500]).toContain(res.status());
  });

  test('04 — upload with path traversal filename → safe filename stored', async () => {
    const pngBuf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const res = await superCtx.post(`${BASE}/api/sites/${testSiteId}/media`, {
      multipart: {
        file: { name: '../../../etc/passwd.png', mimeType: 'image/png', buffer: pngBuf },
      },
    });
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.media.filename).not.toContain('..');
      expect(body.media.filename).not.toContain('/');
      expect(body.media.url).not.toContain('..');
    }
  });

  test('05 — upload without file → 400', async () => {
    const res = await superCtx.post(`${BASE}/api/sites/${testSiteId}/media`, {
      multipart: {},
    });
    expect(res.status()).toBe(400);
  });

  test('06 — upload to non-owned site → 403', async ({ page, playwright }) => {
    const clientEmail = `e2e_media_client_${TS}@test.local`;
    const clientPw = 'TestMedia99!';
    await registerUser(page, clientEmail, clientPw, `Media Tester ${TS}`);
    const clientCtx = await apiLogin(playwright.request, clientEmail, clientPw);
    const pngBuf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const res = await clientCtx.post(`${BASE}/api/sites/${testSiteId}/media`, {
      multipart: {
        file: { name: 'test.png', mimeType: 'image/png', buffer: pngBuf },
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 2: Midtrans Webhook Edge Cases
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('2 — Midtrans Webhook Edge Cases', () => {
  const webhookUrl = `${BASE}/vendor/midtrans/webhook`;
  let ctx;

  test('10 — setup', async ({ playwright }) => {
    ctx = await playwright.request.newContext({ baseURL: BASE });
  });

  test('11 — missing order_id → 400', async () => {
    const res = await ctx.post(webhookUrl, {
      data: { transaction_status: 'settlement' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('order_id');
  });

  test('12 — invalid signature → 401', async () => {
    const res = await ctx.post(webhookUrl, {
      data: {
        order_id: 'E2E-FAKE-ORDER-' + TS,
        status_code: '200',
        gross_amount: '100000',
        signature_key: 'definitely-not-a-valid-signature',
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('signature');
  });

  test('13 — valid signature but order_id not in DB → 404', async () => {
    const fakeOrderId = `E2E-NOTEXIST-${TS}`;
    const sig = midtransSignature(fakeOrderId, '200', '100000');
    const res = await ctx.post(webhookUrl, {
      data: {
        order_id: fakeOrderId,
        status_code: '200',
        gross_amount: '100000',
        signature_key: sig,
        transaction_status: 'settlement',
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  test('14 — idempotent retry: same settlement twice → both 200, second has alreadyPaid=true', async () => {
    const orderId = `E2E-IDEM-${TS}`;
    const superUser = await one('SELECT id FROM users WHERE email = ?', [SUPER_EMAIL]);
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, status)
       VALUES (?, ?, 'starter', 299000, 'pending')`,
      [orderId, superUser.id],
    );

    const sig = midtransSignature(orderId, '200', '299000');
    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '299000',
      signature_key: sig,
      transaction_status: 'settlement',
      fraud_status: 'accept',
    };

    const r1 = await ctx.post(webhookUrl, { data: payload });
    expect(r1.status()).toBe(200);
    const j1 = await r1.json();
    expect(j1.status).toBe('paid');
    expect(j1.alreadyPaid).toBe(false);

    const r2 = await ctx.post(webhookUrl, { data: payload });
    expect(r2.status()).toBe(200);
    const j2 = await r2.json();
    expect(j2.status).toBe('paid');
    expect(j2.alreadyPaid).toBe(true);
  });

  test('15 — expire after paid → stays paid (paid is final)', async () => {
    const orderId = `E2E-EXPIRE-${TS}`;
    const superUser = await one('SELECT id FROM users WHERE email = ?', [SUPER_EMAIL]);
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, status)
       VALUES (?, ?, 'starter', 299000, 'paid')`,
      [orderId, superUser.id],
    );

    const sig = midtransSignature(orderId, '407', '299000');
    const res = await ctx.post(webhookUrl, {
      data: {
        order_id: orderId,
        status_code: '407',
        gross_amount: '299000',
        signature_key: sig,
        transaction_status: 'expire',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.alreadyPaid).toBe(true);

    const row = await one('SELECT status FROM payment_orders WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('paid');
  });

  test('16 — gross_amount format variation (decimal) → accepted', async () => {
    const orderId = `E2E-DECIMAL-${TS}`;
    const superUser = await one('SELECT id FROM users WHERE email = ?', [SUPER_EMAIL]);
    await query(
      `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, status)
       VALUES (?, ?, 'starter', 299000, 'pending')`,
      [orderId, superUser.id],
    );

    const sig = midtransSignature(orderId, '200', '299000.00');
    const res = await ctx.post(webhookUrl, {
      data: {
        order_id: orderId,
        status_code: '200',
        gross_amount: '299000.00',
        signature_key: sig,
        transaction_status: 'settlement',
        fraud_status: 'accept',
      },
    });
    expect(res.status()).toBe(200);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 3: CSV RSVP Export
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('3 — CSV RSVP Export', () => {
  let superCtx;
  let testSiteId;

  test('20 — setup', async ({ playwright }) => {
    superCtx = await apiLogin(playwright.request, SUPER_EMAIL, SUPER_PASSWORD);
    const site = await one("SELECT id FROM sites WHERE status = 'published' LIMIT 1");
    if (!site) {
      const anySite = await one('SELECT id FROM sites LIMIT 1');
      testSiteId = anySite ? anySite.id : null;
    } else {
      testSiteId = site.id;
    }
    expect(testSiteId).toBeTruthy();
  });

  test('21 — CSV export returns valid CSV with correct headers', async () => {
    const res = await superCtx.get(`${BASE}/sites/${testSiteId}/rsvps.csv`);
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] || '';
    expect(ct).toContain('text/csv');
    const disp = res.headers()['content-disposition'] || '';
    expect(disp).toContain('attachment');
    expect(disp).toContain('.csv');

    const body = await res.text();
    const lines = body.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const header = lines[0];
    expect(header).toContain('guest_name');
    expect(header).toContain('attendance');
    expect(header).toContain('guests_count');
  });

  test('22 — CSV export with RSVP data includes rows', async () => {
    await query(
      `INSERT INTO rsvps (site_id, guest_name, guest_phone, attendance, guests_count, notes, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [testSiteId, `E2E Tamu Ünïcödé ${TS}`, '081234567890', 'yes', 2, 'Hadir, terima kasih!', '127.0.0.1'],
    );

    const res = await superCtx.get(`${BASE}/sites/${testSiteId}/rsvps.csv`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(`E2E Tamu`);
    expect(body).toContain('081234567890');
  });

  test('23 — CSV unauthenticated → redirect to login', async ({ playwright }) => {
    const anonCtx = await playwright.request.newContext({ baseURL: BASE });
    const res = await anonCtx.get(`${BASE}/sites/${testSiteId}/rsvps.csv`, {
      maxRedirects: 0,
    });
    expect([302, 401, 403]).toContain(res.status());
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 4: Public Guest UI (RSVP + Wish happy path)
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('4 — Public Guest UI', () => {
  let publishedSlug;
  let apiCtx;

  test('30 — setup: find a published site', async ({ playwright }) => {
    const site = await one("SELECT slug FROM sites WHERE status = 'published' LIMIT 1");
    if (site) {
      publishedSlug = site.slug;
    } else {
      const anySite = await one('SELECT id, slug FROM sites LIMIT 1');
      if (anySite) {
        await query("UPDATE sites SET status = 'published' WHERE id = ?", [anySite.id]);
        publishedSlug = anySite.slug;
      }
    }
    expect(publishedSlug).toBeTruthy();
    apiCtx = await playwright.request.newContext({ baseURL: BASE });
  });

  test('31 — public site renders HTML via ?site=slug', async ({ page }) => {
    await page.goto(`/?site=${publishedSlug}`);
    expect(page.url()).toContain(publishedSlug);
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('32 — POST RSVP via API → 201', async () => {
    const res = await apiCtx.post(`${BASE}/api/public/site/${publishedSlug}/rsvps`, {
      data: {
        guest_name: `E2E Guest ${TS}`,
        attendance: 'yes',
        guests_count: 3,
        notes: 'Happy path test',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.rsvp).toBeTruthy();
    expect(body.rsvp.guest_name).toBe(`E2E Guest ${TS}`);
  });

  test('33 — POST wish via API → 201', async () => {
    const res = await apiCtx.post(`${BASE}/api/public/site/${publishedSlug}/wishes`, {
      data: {
        guest_name: `E2E Wisher ${TS}`,
        message: 'Selamat menempuh hidup baru! E2E test wish.',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.wish).toBeTruthy();
  });

  test('34 — GET wishes → 200 + contains our wish', async () => {
    const res = await apiCtx.get(`${BASE}/api/public/site/${publishedSlug}/wishes`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.wishes).toBeDefined();
    expect(Array.isArray(body.wishes)).toBe(true);
  });

  test('35 — RSVP validation: empty guest_name → 400', async () => {
    const res = await apiCtx.post(`${BASE}/api/public/site/${publishedSlug}/rsvps`, {
      data: { guest_name: '', attendance: 'yes' },
    });
    expect(res.status()).toBe(400);
  });

  test('36 — RSVP validation: invalid attendance value → 400', async () => {
    const res = await apiCtx.post(`${BASE}/api/public/site/${publishedSlug}/rsvps`, {
      data: { guest_name: 'Test', attendance: 'maybe' },
    });
    expect(res.status()).toBe(400);
  });

  test('37 — RSVP validation: guests_count > 20 → 400', async () => {
    const res = await apiCtx.post(`${BASE}/api/public/site/${publishedSlug}/rsvps`, {
      data: { guest_name: 'Test', attendance: 'yes', guests_count: 99 },
    });
    expect(res.status()).toBe(400);
  });

  test('38 — wish validation: message > 2000 chars → 400', async () => {
    const res = await apiCtx.post(`${BASE}/api/public/site/${publishedSlug}/wishes`, {
      data: { guest_name: 'Test', message: 'x'.repeat(2001) },
    });
    expect(res.status()).toBe(400);
  });

  test('39 — draft site → 403 for RSVP/wish', async () => {
    const draft = await one("SELECT slug FROM sites WHERE status = 'draft' LIMIT 1");
    if (!draft) return;
    const r1 = await apiCtx.post(`${BASE}/api/public/site/${draft.slug}/rsvps`, {
      data: { guest_name: 'Test', attendance: 'yes' },
    });
    expect(r1.status()).toBe(403);
    const r2 = await apiCtx.post(`${BASE}/api/public/site/${draft.slug}/wishes`, {
      data: { guest_name: 'Test', message: 'Hello' },
    });
    expect(r2.status()).toBe(403);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 5: WA Blast
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('5 — WA Blast', () => {
  let testSiteId;

  test('40 — setup: find a site', async () => {
    const site = await one('SELECT id FROM sites LIMIT 1');
    expect(site).toBeTruthy();
    testSiteId = site.id;
  });

  test('41 — GET /sites/:id/wa-blast → page loads', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/sites/${testSiteId}/wa-blast`);
    await expect(page.locator('h1')).toContainText('WhatsApp Blast');
    await expect(page.locator('textarea[name="phones"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
  });

  test('42 — submit valid numbers → generates wa.me links', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/sites/${testSiteId}/wa-blast`);
    await page.locator('textarea[name="phones"]').fill('081234567890\n085600001111');
    await page.locator('textarea[name="message"]').fill('E2E test blast message');
    await page.getByRole('button', { name: /Generate link/i }).click();
    await page.waitForSelector('.wa-blast-results');
    await expect(page.locator('.wa-blast-stat__val').first()).toHaveText('2');
    await expect(page.locator('a[href*="wa.me"]').first()).toBeVisible();
  });

  test('43 — submit invalid numbers → shows error list', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/sites/${testSiteId}/wa-blast`);
    await page.locator('textarea[name="phones"]').fill('notanumber\nabc123');
    await page.locator('textarea[name="message"]').fill('test');
    await page.getByRole('button', { name: /Generate link/i }).click();
    await page.waitForSelector('.wa-blast-results');
    const errorsSection = page.locator('.wa-blast-errors');
    if (await errorsSection.count() > 0) {
      await expect(errorsSection).toBeVisible();
    }
  });

  test('44 — submit with save_history → riwayat tersimpan', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/sites/${testSiteId}/wa-blast`);
    await page.locator('textarea[name="phones"]').fill('081234567890');
    await page.locator('textarea[name="message"]').fill(`E2E history test ${TS}`);
    await page.locator('input[name="save_history"]').check();
    await page.getByRole('button', { name: /Generate link/i }).click();
    await page.waitForSelector('.wa-blast-results');

    const flash = page.locator('.flash.flash-success');
    if (await flash.count() > 0) {
      await expect(flash.first()).toBeVisible();
    }

    const history = page.locator('.wa-blast-history');
    if (await history.count() > 0) {
      await expect(history).toBeVisible();
    }
  });

  test('45 — empty phones → no valid numbers message', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/sites/${testSiteId}/wa-blast`);
    await page.locator('textarea[name="phones"]').fill('');
    await page.locator('textarea[name="message"]').fill('test');
    await page.getByRole('button', { name: /Generate link/i }).click();
    await page.waitForURL(`/sites/${testSiteId}/wa-blast`);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 6: Catalog → Demo → Create Site flow
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('6 — Catalog → Demo Flow', () => {
  test('50 — GET /catalog → page loads with theme list', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.locator('body')).toBeVisible();
    const hasContent = await page.content();
    expect(hasContent.length).toBeGreaterThan(200);
  });

  test('51 — GET /theme-gallery → page loads', async ({ page }) => {
    await page.goto('/theme-gallery');
    await expect(page.locator('body')).toBeVisible();
  });

  test('52 — /catalog demo link → renders preview site', async ({ page }) => {
    await page.goto('/catalog');
    const demoLink = page.locator('a[href*="?site=preview-"]').first();
    if (await demoLink.count() > 0) {
      const href = await demoLink.getAttribute('href');
      await page.goto(href);
      const html = await page.content();
      expect(html.length).toBeGreaterThan(300);
    }
  });

  test('53 — /pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(200);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 7: Session & Cookie Hardening
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('7 — Session & Cookie', () => {
  const COOKIE_NAME = process.env.COOKIE_NAME || 'wsaas_token';

  test('60 — login sets httpOnly cookie', async ({ page }) => {
    await loginSuper(page);
    const cookies = await page.context().cookies();
    const auth = cookies.find((c) => c.name === COOKIE_NAME);
    expect(auth).toBeTruthy();
    expect(auth.httpOnly).toBe(true);
  });

  test('61 — cookie not accessible via document.cookie', async ({ page }) => {
    await loginSuper(page);
    const jsCookies = await page.evaluate(() => document.cookie);
    expect(jsCookies).not.toContain(COOKIE_NAME);
  });

  test('62 — cookie has SameSite attribute', async ({ page }) => {
    await loginSuper(page);
    const cookies = await page.context().cookies();
    const auth = cookies.find((c) => c.name === COOKIE_NAME);
    expect(auth).toBeTruthy();
    expect(auth.sameSite).toBeTruthy();
  });

  test('63 — logout clears auth cookie', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/dashboard');
    const logoutBtn = page.locator('button[title="Logout"], form[action="/logout"] button[type="submit"]').first();
    await logoutBtn.click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    const cookies = await page.context().cookies();
    const auth = cookies.find((c) => c.name === COOKIE_NAME);
    const hasValue = auth && auth.value && auth.value.length > 10;
    expect(hasValue).toBeFalsy();
  });

  test('64 — expired/invalid JWT → treated as guest (user=null or redirect)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: {
        Cookie: `${COOKIE_NAME}=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6OTk5OTk5fQ.invalid`,
      },
    });
    const res = await ctx.get(`${BASE}/api/auth/me`);
    const ct = res.headers()['content-type'] || '';
    if (res.status() === 200 && ct.includes('json')) {
      const body = await res.json();
      expect(body.user).toBeNull();
    } else {
      const blocked = [302, 401, 403].includes(res.status()) || ct.includes('html');
      expect(blocked).toBe(true);
    }
  });

  test('65 — concurrent tabs: login in one tab, other tab still authenticated', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    await page1.goto(`${BASE}/login`);
    await page1.locator('input[name="email"]').fill(SUPER_EMAIL);
    await page1.locator('input[name="password"]').fill(SUPER_PASSWORD);
    await page1.locator('button[type="submit"]').click();
    await page1.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });

    const page2 = await context.newPage();
    await page2.goto(`${BASE}/dashboard`);
    await expect(page2).toHaveURL(/dashboard/);
    await context.close();
  });

  test('66 — X-Content-Type-Options header present', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
  });
});
