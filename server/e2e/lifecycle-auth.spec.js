const { test, expect } = require('@playwright/test');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

test.describe.serial('Account lifecycle (password reset + verify + Google)', () => {
  let captureReady = false;

  test.beforeAll(async ({ request }) => {
    const r = await request.get(`${BASE}/__e2e/last-mail-links?reset=1`);
    captureReady = r.status() === 200;
  });

  test('01 — API password reset using captured reset URL (test mail capture)', async ({ request }) => {
    test.skip(!captureReady, 'Run Playwright with server NODE_ENV=test and E2E_CAPTURE_MAIL=1 (see playwright.config webServer).');
    const ts = Date.now();
    const email = `lc_${ts}@test.local`;
    const password = 'Test1234!';
    const reg = await request.post(`${BASE}/api/auth/register`, {
      data: { email, password, name: 'Lifecycle User' },
    });
    expect(reg.status()).toBe(201);

    await request.get(`${BASE}/__e2e/last-mail-links?reset=1`);
    const fp = await request.post(`${BASE}/api/auth/forgot-password`, { data: { email } });
    expect(fp.status()).toBe(200);

    const cap = await request.get(`${BASE}/__e2e/last-mail-links`);
    expect(cap.status()).toBe(200);
    const links = await cap.json();
    expect(links.lastPasswordResetUrl).toBeTruthy();
    const u = new URL(links.lastPasswordResetUrl);
    const rawToken = u.searchParams.get('token');
    expect(rawToken).toBeTruthy();

    const rst = await request.post(`${BASE}/api/auth/reset-password`, {
      data: { token: rawToken, password: 'NewPass99!' },
    });
    expect(rst.status()).toBe(200);

    const bad = await request.post(`${BASE}/api/auth/login`, { data: { email, password } });
    expect(bad.status()).toBe(401);

    const ok = await request.post(`${BASE}/api/auth/login`, { data: { email, password: 'NewPass99!' } });
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.token).toBeTruthy();
  });

  test('02 — GET /auth/verify-email confirms address (captured link)', async ({ request }) => {
    test.skip(!captureReady, 'Requires test mail capture endpoint.');
    const ts = Date.now();
    const email = `ev_${ts}@test.local`;
    const password = 'Test1234!';
    await request.get(`${BASE}/__e2e/last-mail-links?reset=1`);
    const reg = await request.post(`${BASE}/api/auth/register`, {
      data: { email, password, name: 'Verify User' },
    });
    expect(reg.status()).toBe(201);
    const cap = await request.get(`${BASE}/__e2e/last-mail-links`);
    const links = await cap.json();
    expect(links.lastVerifyEmailUrl).toBeTruthy();
    const u = new URL(links.lastVerifyEmailUrl);
    const raw = u.searchParams.get('token');
    const verify = await request.get(`${BASE}/auth/verify-email?token=${encodeURIComponent(raw)}`, {
      maxRedirects: 0,
    });
    expect([302, 301, 307]).toContain(verify.status());
    const loc = verify.headers().location || '';
    expect(loc).toMatch(/verified=1/);
  });

  test('03 — PATCH /api/auth/me with Bearer', async ({ playwright }) => {
    const ts = Date.now();
    const email = `me_${ts}@test.local`;
    const password = 'Test1234!';
    const regCtx = await playwright.request.newContext({ baseURL: BASE });
    const reg = await regCtx.post('/api/auth/register', {
      data: { email, password, name: 'Me Patch' },
    });
    expect(reg.ok()).toBeTruthy();
    const { token } = await reg.json();
    const ctx = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const patch = await ctx.patch('/api/auth/me', { data: { name: 'Me Patched' } });
    expect(patch.status()).toBe(200);
    const j = await patch.json();
    expect(j.user.name).toBe('Me Patched');
    await regCtx.dispose();
    await ctx.dispose();
  });

  test('04 — /auth/google responds (503 if OAuth not configured)', async ({ request }) => {
    const r = await request.get(`${BASE}/auth/google`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 503]).toContain(r.status());
  });
});
