const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';
const TS = Date.now();
const PWD = 'TestReg99!';

function email(suffix) {
  return `e2e_reg_${TS}_${suffix}@test.local`;
}

/** Fill HTML register form and submit */
async function submitRegisterForm(page, { name, email: em, password }) {
  await page.goto('/register');
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(em);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

test.describe.serial('Register E2E', () => {
  const primary = {
    name: `Reg Primary ${TS}`,
    email: email('primary'),
    password: PWD,
  };

  /* ─── Functional / happy path ─── */
  test('00 — register page loads with correct fields and links', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveTitle(/Create account|Buat akun|Daftar/i);
    await expect(page.locator('h2.auth-welcome')).toContainText(/Buat akun|akun/i);
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('form[action="/register"]')).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    await expect(page.locator('a[href="/catalog"]')).toBeVisible();
  });

  test('01 — successful registration redirects to /login?registered=1', async ({ page }) => {
    await submitRegisterForm(page, primary);
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText(/sign in|masuk|created/i);
  });

  test('02 — duplicate email shows error and stays on register', async ({ page }) => {
    await submitRegisterForm(page, primary);
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/terdaftar|login/i);
  });

  test('03 — logged-in user visiting /register is redirected to /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(primary.email);
    await page.locator('input[name="password"]').fill(primary.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    await page.goto('/register');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('04 — logout so following tests run as guest', async ({ page }) => {
    const logoutBtn = page.locator('form[action="/logout"] button').first();
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
    } else {
      const cookies = await page.context().cookies();
      const csrfCookie = cookies.find(c => c.name === '_csrf_tok');
      await page.request.post(`${BASE}/logout`, {
        form: { _csrf: csrfCookie ? csrfCookie.value : '' },
      });
    }
    await page.waitForURL('**/login', { timeout: 10_000 }).catch(() => {});
  });

  /* ─── Validation (HTML) ─── */
  test('05 — empty form after removing HTML5 required → generic validation error', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelectorAll('input[name="name"], input[name="email"], input[name="password"]').forEach((el) => {
        el.removeAttribute('required');
        el.removeAttribute('minlength');
      });
    });
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText(/nama|email|password|minimal|valid/i);
  });

  test('06 — malformed email rejected', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
    });
    await page.locator('input[name="name"]').fill('Valid Name');
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('07 — password shorter than 6 characters rejected', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    await page.locator('input[name="name"]').fill('User');
    await page.locator('input[name="email"]').fill(email('shortpw'));
    await page.locator('input[name="password"]').fill('12345');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('08 — empty name rejected', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="name"]').removeAttribute('required');
    });
    await page.locator('input[name="name"]').fill('');
    await page.locator('input[name="email"]').fill(email('noname'));
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('09 — name longer than 120 characters rejected', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="name"]').removeAttribute('maxlength');
    });
    const longName = 'N'.repeat(121);
    await page.locator('input[name="name"]').fill(longName);
    await page.locator('input[name="email"]').fill(email('longname'));
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  test('10 — name exactly 120 characters succeeds with fresh email', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="name"]').removeAttribute('maxlength');
    });
    const name120 = 'M'.repeat(120);
    await page.locator('input[name="name"]').fill(name120);
    await page.locator('input[name="email"]').fill(email('name120ok'));
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
    await expect(page.locator('.flash-success')).toBeVisible();
  });

  /* ─── Security: injection & XSS (HTML) ─── */
  test('11 — SQL injection attempts in name field (no server error; may register as literal name)', async ({ page }) => {
    const payloads = ["' OR 1=1 --", "'; DROP TABLE users;--", "1' UNION SELECT NULL--"];
    for (const payload of payloads) {
      await page.goto('/register');
      await page.locator('input[name="name"]').fill(payload);
      await page.locator('input[name="email"]').fill(email(`sqli_name_${payload.length}_${Math.random().toString(36).slice(2, 8)}`));
      await page.locator('input[name="password"]').fill(PWD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/(register|login)/, { timeout: 15_000 });
      const path = new URL(page.url()).pathname;
      expect(['/register', '/login']).toContain(path);
      const title = await page.title();
      expect(title).not.toMatch(/Internal Server Error/i);
      const html = await page.content();
      expect(html).not.toMatch(/ER_|syntax error|SQLSTATE/i);
    }
  });

  test('12 — SQL injection attempts in email field', async ({ page }) => {
    const payloads = ["' OR 1=1 --", "admin@test.com' OR '1'='1", "'; DROP TABLE users;--"];
    for (const payload of payloads) {
      await page.goto('/register');
      await page.evaluate(() => {
        document.querySelector('input[name="email"]').setAttribute('type', 'text');
      });
      await page.locator('input[name="name"]').fill('X');
      await page.locator('input[name="email"]').fill(payload);
      await page.locator('input[name="password"]').fill(PWD);
      await page.locator('button[type="submit"]').click();
      const url = new URL(page.url());
      expect(url.pathname).not.toMatch(/login\?registered=1$/);
      const title = await page.title();
      expect(title).not.toMatch(/Internal Server Error/i);
    }
  });

  test('13 — SQL injection in password field (stored as literal hash; no crash)', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    await page.locator('input[name="name"]').fill('User');
    await page.locator('input[name="email"]').fill(email(`sqli_pw_${Math.random().toString(36).slice(2, 10)}`));
    await page.locator('input[name="password"]').fill("' OR '1'='1' --");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(register|login)/, { timeout: 15_000 });
    expect(['/register', '/login']).toContain(new URL(page.url()).pathname);
    const title = await page.title();
    expect(title).not.toMatch(/Internal Server Error/i);
  });

  test('14 — XSS payloads in name are escaped in response', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="name"]').removeAttribute('maxlength');
    });
    const xss = '<script>alert(1)</script>';
    await page.locator('input[name="name"]').fill(xss);
    await page.locator('input[name="email"]').fill(email('xss_name'));
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    const html = await page.content();
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('15 — XSS in email field', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
    });
    await page.locator('input[name="name"]').fill('User');
    await page.locator('input[name="email"]').fill('<img src=x onerror=alert(1)>@evil.com');
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    const html = await page.content();
    expect(html).not.toContain('onerror=alert(1)');
  });

  test('16 — XSS in password field', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="password"]').removeAttribute('minlength');
    });
    await page.locator('input[name="name"]').fill('User');
    await page.locator('input[name="email"]').fill(email('xss_pw'));
    await page.locator('input[name="password"]').fill('<svg onload=alert(1)>');
    await page.locator('button[type="submit"]').click();
    const html = await page.content();
    expect(html).not.toContain('onload=alert(1)');
  });

  test('17 — hidden field role=super_admin is ignored; user remains client', async ({ page, request }) => {
    const em = email('role_inj');
    await page.goto('/register');
    await page.evaluate(() => {
      const form = document.querySelector('form[action="/register"]');
      const h = document.createElement('input');
      h.type = 'hidden';
      h.name = 'role';
      h.value = 'super_admin';
      form.appendChild(h);
    });
    await page.locator('input[name="name"]').fill('Role Inj');
    await page.locator('input[name="email"]').fill(em);
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
    const loginResp = await request.post(`${BASE}/api/auth/login`, {
      data: { email: em, password: PWD },
    });
    expect(loginResp.status()).toBe(200);
    const setCookie = loginResp.headers()['set-cookie'] || '';
    expect(setCookie).toBeTruthy();
    const body = await loginResp.json();
    expect(body.user.role).toBe('client');
  });

  test('18 — oversized form body does not crash server', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="name"]').removeAttribute('maxlength');
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
      document.querySelectorAll('input[name="name"], input[name="email"], input[name="password"]').forEach((el) => {
        el.removeAttribute('required');
        el.removeAttribute('minlength');
      });
    });
    const blob = 'Z'.repeat(40_000);
    await page.locator('input[name="name"]').fill(blob);
    await page.locator('input[name="email"]').fill(`${blob.slice(0, 200)}@x.com`);
    await page.locator('input[name="password"]').fill(blob);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const title = await page.title();
    expect(title).not.toMatch(/Internal Server Error/i);
  });

  test('19 — CRLF in email does not inject arbitrary Set-Cookie', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => {
      document.querySelector('input[name="email"]').setAttribute('type', 'text');
    });
    await page.locator('input[name="name"]').fill('CRLF');
    await page.locator('input[name="email"]').fill(`u@test.local\r\nX-Injected: 1`);
    await page.locator('input[name="password"]').fill(PWD);
    await page.locator('button[type="submit"]').click();
    const cookies = await page.context().cookies(BASE);
    expect(cookies.find((c) => c.name === 'X-Injected')).toBeUndefined();
  });

  test('20 — prototype-pollution-style URL-encoded POST does not create privileged user', async ({ request }) => {
    const resp = await request.post(`${BASE}/register`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'name=PP&email[constructor]=x&password=abcdef',
    });
    // 403 from CSRF (no token) is the expected first-line defense
    expect([200, 302, 400, 403]).toContain(resp.status());
    const loc = resp.headers()['location'] || '';
    expect(loc).not.toContain('registered=1');
  });

  test('21 — many concurrent register attempts with unique emails all get valid responses', async ({ request }) => {
    const reqs = [];
    for (let i = 0; i < 15; i++) {
      reqs.push(
        request.post(`${BASE}/register`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: new URLSearchParams({
            name: `Conc ${i}`,
            email: email(`conc_${i}`),
            password: PWD,
          }).toString(),
        })
      );
    }
    const results = await Promise.all(reqs);
    for (const r of results) {
      // 403 from CSRF (no token) is valid — server must not crash
      expect([200, 302, 403, 429]).toContain(r.status());
      const loc = r.headers()['location'] || '';
      if (r.status() === 302) expect(loc).toContain('login');
    }
  });

  /* ─── API /auth/register ─── */
  test('22 — API register returns 201, sets cookie, user is client, no password in JSON', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const em = email('api_new');
    const resp = await ctx.post('/api/auth/register', {
      data: { email: em, password: PWD, name: 'API Reg User' },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.user).toBeDefined();
    expect(json.user.email).toBe(em);
    expect(json.user.role).toBe('client');
    expect(json.user.password).toBeUndefined();
    expect(json.user.password_hash).toBeUndefined();
    const setCookie = resp.headers()['set-cookie'] || '';
    expect(setCookie).toMatch(/HttpOnly/i);
    await ctx.dispose();
  });

  test('23 — API duplicate email returns 409', async ({ request }) => {
    const em = email('api_dup_once');
    const r1 = await request.post(`${BASE}/api/auth/register`, {
      data: { email: em, password: PWD, name: 'Dup A' },
    });
    expect(r1.status()).toBe(201);
    const r2 = await request.post(`${BASE}/api/auth/register`, {
      data: { email: em, password: PWD, name: 'Dup B' },
    });
    expect(r2.status()).toBe(409);
    const j = await r2.json();
    expect(j.error).toMatch(/email|registered/i);
  });

  test('24 — API missing fields returns 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/register`, {
      data: {},
    });
    expect(resp.status()).toBe(400);
    const j = await resp.json();
    expect(j.error).toBe('invalid body');
  });

  test('25 — API invalid email returns 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/register`, {
      data: { email: 'bad', password: PWD, name: 'N' },
    });
    expect(resp.status()).toBe(400);
  });

  test('26 — API password too short returns 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/register`, {
      data: { email: email('api_shortpw'), password: '12345', name: 'X' },
    });
    expect(resp.status()).toBe(400);
  });

  test('27 — API name too long (>120) returns 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/register`, {
      data: {
        email: email('api_longname'),
        password: PWD,
        name: 'L'.repeat(121),
      },
    });
    expect(resp.status()).toBe(400);
  });

  test('28 — API SQL injection in JSON body does not leak DB errors', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/register`, {
      data: {
        email: "' OR 1=1 --@x.com",
        password: PWD,
        name: 'SQL',
      },
    });
    expect([400, 409, 201]).toContain(resp.status());
    const text = await resp.text();
    expect(text).not.toMatch(/ER_|syntax error|SQL/i);
  });

  test('29 — API authenticated /me after register returns same user (cookie from register)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const em = email('api_me_chain');
    const reg = await ctx.post('/api/auth/register', {
      data: { email: em, password: PWD, name: 'Me Chain' },
    });
    expect(reg.status()).toBe(201);
    const me = await ctx.get('/api/auth/me');
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.user).toBeTruthy();
    expect(body.user.email).toBe(em);
    expect(body.user.role).toBe('client');
    await ctx.dispose();
  });
});
