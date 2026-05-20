const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// Unique test user — timestamp ensures no collision with real data
const TS = Date.now();
const TEST_USER = {
  name: `E2E Tester ${TS}`,
  email: `e2e_${TS}@test.local`,
  password: 'Test1234!',
};

/* ────────────────────────────────────────────────────
 * 0. SETUP — register a fresh user for the login tests
 * ──────────────────────────────────────────────────── */
test.describe.serial('Login E2E', () => {
  test('00 — register test user via /register', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h2.auth-welcome')).toContainText('Buat akun');
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1');
    await expect(page.locator('.flash-success')).toBeVisible();
  });

  /* ──────────────────────────────────────────────────
   * 1. HAPPY PATH
   * ────────────────────────────────────────────────── */
  test('01 — login page loads correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Sign In|Masuk/i);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });

  test('02 — successful login redirects to /billing or /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    // New client without paid order → /billing; with paid order → /dashboard
    await page.waitForURL(url => {
      const p = url.pathname;
      return p === '/billing' || p === '/dashboard';
    }, { timeout: 10_000 });
    const url = new URL(page.url());
    expect(['/billing', '/dashboard']).toContain(url.pathname);
  });

  test('03 — logged-in user visiting /login gets redirected to /dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    // Now visit /login again
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('04 — logout clears session and redirects to /login', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    // Logout
    const logoutBtn = page.locator('form[action="/logout"] button').first();
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
    } else {
      const cookies = await page.context().cookies();
      const csrfCookie = cookies.find(c => c.name === '_csrf_tok');
      await page.request.post(`${BASE}/logout`, {
        form: { _csrf: csrfCookie ? csrfCookie.value : '' },
      });
      await page.goto('/login');
    }
    await page.waitForURL('**/login');
    // Confirm session is cleared — /dashboard should redirect back to /login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  /* ──────────────────────────────────────────────────
   * 2. VALIDATION & EDGE CASES
   * ────────────────────────────────────────────────── */
  test('05 — empty form submission stays on /login with error', async ({ page }) => {
    await page.goto('/login');
    // Browser validation blocks empty submit; bypass with JS
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').removeAttribute('required');
      document.querySelector('input[name="password"]').removeAttribute('required');
    });
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('06 — wrong password shows "Invalid credentials"', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill('WrongPassword99');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.flash-error')).toContainText(/invalid/i);
    // Should stay on /login, not redirect
    await expect(page).toHaveURL(/\/login/);
  });

  test('07 — non-existent email shows "Invalid credentials" (no user enumeration)', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('nobody_exists_here@fake.test');
    await page.locator('input[name="password"]').fill('SomePass123');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.flash-error')).toContainText(/invalid/i);
  });

  test('08 — password too short (< 6 chars) is rejected by Zod', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill('abc');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('09 — malformed email is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
    });
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.locator('input[name="password"]').fill('SomePass123');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  /* ──────────────────────────────────────────────────
   * 3. SECURITY ATTACKS
   * ────────────────────────────────────────────────── */

  test('10 — SQL injection in email field', async ({ page }) => {
    const sqli = [
      "' OR 1=1 --",
      "admin@test.com' OR '1'='1",
      "'; DROP TABLE users;--",
      "1' UNION SELECT * FROM users--",
    ];
    for (const payload of sqli) {
      await page.goto('/login');
      await page.evaluate(() => {
        document.querySelector('input[name="email"]').setAttribute('type', 'text');
      });
      await page.locator('input[name="email"]').fill(payload);
      await page.locator('input[name="password"]').fill('anything123');
      await page.locator('button[type="submit"]').click();
      // Must NOT reach /dashboard — should show error or stay on login
      const url = new URL(page.url());
      expect(url.pathname).not.toBe('/dashboard');
      // Page should not have a server error
      const title = await page.title();
      expect(title).not.toMatch(/500|Internal Server Error/i);
    }
  });

  test('11 — SQL injection in password field', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill("' OR '1'='1' --");
    await page.locator('button[type="submit"]').click();
    const url = new URL(page.url());
    expect(url.pathname).not.toBe('/dashboard');
  });

  test('12 — XSS in email field (reflected)', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
    });
    const xssPayload = '<script>alert("xss")</script>@evil.com';
    await page.locator('input[name="email"]').fill(xssPayload);
    await page.locator('input[name="password"]').fill('anything123');
    await page.locator('button[type="submit"]').click();
    // Ensure no raw <script> tag is rendered in response
    const html = await page.content();
    expect(html).not.toContain('<script>alert("xss")</script>');
  });

  test('13 — XSS in password field', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill('<img src=x onerror=alert(1)>');
    await page.locator('button[type="submit"]').click();
    const html = await page.content();
    expect(html).not.toContain('onerror=alert(1)');
  });

  test('14 — auth cookie is httpOnly (not accessible via JS)', async ({ context, page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    const cookies = await context.cookies(BASE);
    const authCookie = cookies.find(c => c.name === 'wsaas_token');
    expect(authCookie).toBeDefined();
    expect(authCookie.httpOnly).toBe(true);
    expect(authCookie.sameSite).toBe('Lax');
  });

  test('15 — forged/tampered JWT cookie is rejected', async ({ context, page }) => {
    // Set a fake JWT
    await context.addCookies([{
      name: 'wsaas_token',
      value: 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjEsInJvbGUiOiJzdXBlcl9hZG1pbiJ9.INVALIDSIG',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }]);
    await page.goto('/dashboard');
    // Should redirect to /login since token is invalid
    await expect(page).toHaveURL(/\/login/);
  });

  test('16 — accessing protected routes without login redirects to /login', async ({ page }) => {
    const protectedPaths = ['/dashboard', '/billing', '/sites/new', '/landing-cms', '/users'];
    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('17 — extra/unknown fields in POST body are ignored', async ({ page }) => {
    await page.goto('/login');
    // Inject extra hidden fields via JS before submit
    await page.evaluate((u) => {
      const form = document.querySelector('form[action="/login"]');
      const extra = document.createElement('input');
      extra.type = 'hidden';
      extra.name = 'role';
      extra.value = 'super_admin';
      form.appendChild(extra);
      const extra2 = document.createElement('input');
      extra2.type = 'hidden';
      extra2.name = '__proto__';
      extra2.value = '{"admin":true}';
      form.appendChild(extra2);
      document.querySelector('input[name="email"]').value = u.email;
      document.querySelector('input[name="password"]').value = u.password;
    }, TEST_USER);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    // Should login normally, extra fields ignored
    const url = new URL(page.url());
    expect(['/billing', '/dashboard']).toContain(url.pathname);
  });

  test('18 — oversized payload does not crash server', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
      document.querySelector('input[name="email"]').removeAttribute('required');
      document.querySelector('input[name="password"]').removeAttribute('required');
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    const longStr = 'A'.repeat(50_000);
    await page.locator('input[name="email"]').fill(longStr + '@evil.com');
    await page.locator('input[name="password"]').fill(longStr);
    await page.locator('button[type="submit"]').click();
    // Server should respond — not crash or timeout
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
    const content = await page.content();
    expect(content).not.toMatch(/502|503|504|Cannot POST/);
  });

  test('19 — CRLF injection in email header', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
    });
    await page.locator('input[name="email"]').fill('test@evil.com\r\nSet-Cookie: hacked=true');
    await page.locator('input[name="password"]').fill('Test1234!');
    await page.locator('button[type="submit"]').click();
    const cookies = await page.context().cookies(BASE);
    const hackedCookie = cookies.find(c => c.name === 'hacked');
    expect(hackedCookie).toBeUndefined();
  });

  test('20 — NoSQL/object injection via crafted body (prototype pollution)', async ({ request }) => {
    const resp = await request.post(`${BASE}/login`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'email[$gt]=&password[$gt]=',
    });
    // Should NOT return 302 to /dashboard
    const loc = resp.headers()['location'] || '';
    expect(loc).not.toContain('/dashboard');
  });

  test('21 — rapid successive login attempts do not crash server', async ({ request }) => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        request.post(`${BASE}/login`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: `email=brute_${i}@test.local&password=WrongPass${i}`,
        })
      );
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      // 200/302 if CSRF passes, 403 if CSRF blocks — all valid, server must not crash
      expect([200, 302, 403, 429]).toContain(r.status());
    }
  });

  /* ──────────────────────────────────────────────────
   * 4. API LOGIN (/api/auth/login) ATTACKS
   * ────────────────────────────────────────────────── */
  test('22 — API: valid login returns 200 + user object', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.user).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.user.email).toBe(TEST_USER.email);
    expect(body.user.role).toBe('client');
    // Should NOT expose password hash
    expect(body.user.password_hash).toBeUndefined();
    expect(body.user.password).toBeUndefined();
  });

  test('22b — API: GET /api/auth/me with Authorization Bearer only (no cookie)', async ({ playwright }) => {
    const loginCtx = await playwright.request.newContext({ baseURL: BASE });
    const loginResp = await loginCtx.post('/api/auth/login', {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    expect(loginResp.ok()).toBeTruthy();
    const { token } = await loginResp.json();
    expect(token).toBeTruthy();
    const meCtx = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const me = await meCtx.get('/api/auth/me');
    expect(me.status()).toBe(200);
    const j = await me.json();
    expect(j.user.email).toBe(TEST_USER.email);
    await loginCtx.dispose();
    await meCtx.dispose();
  });

  test('23 — API: wrong credentials return 401', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/login`, {
      data: { email: TEST_USER.email, password: 'WrongPass99' },
    });
    expect(resp.status()).toBe(401);
  });

  test('24 — API: SQL injection in JSON body', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/login`, {
      data: { email: "' OR 1=1 --", password: "' OR 1=1 --" },
    });
    expect([400, 401]).toContain(resp.status());
    const text = await resp.text();
    expect(text).not.toContain('syntax error');
    expect(text).not.toContain('ER_PARSE_ERROR');
  });

  test('25 — API: missing fields return 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/login`, {
      data: {},
    });
    expect(resp.status()).toBe(400);
  });

  test('26 — API: GET /api/auth/me without auth returns 401', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      extraHTTPHeaders: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const resp = await ctx.get(`${BASE}/api/auth/me`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body.error).toBe('unauthorized');
    await ctx.dispose();
  });
});
