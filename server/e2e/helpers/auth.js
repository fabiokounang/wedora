const { expect } = require('@playwright/test');

/**
 * Login via the HTML form at /login.
 * After success the browser will be on /dashboard (or /billing for new clients).
 */
async function login(page, email, password) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

/**
 * Register a brand-new account via /register, then verify redirect to /login?registered=1.
 * Does NOT auto-login — call login() afterwards if needed.
 */
async function register(page, { name, email, password }) {
  await page.goto('/register');
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/login?registered=1', { timeout: 10_000 });
}

/**
 * Logout via POST /logout (clicks the logout form/button present in the admin layout).
 * Falls back to a programmatic POST if no button is found.
 */
async function logout(page) {
  const logoutBtn = page.locator('form[action="/logout"] button, a[href="/logout"]').first();
  if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await logoutBtn.click();
  } else {
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find(c => c.name === '_csrf_tok');
    await page.request.post('/logout', {
      form: { _csrf: csrfCookie ? csrfCookie.value : '' },
    });
    await page.goto('/login');
  }
  await page.waitForURL('**/login', { timeout: 10_000 });
}

module.exports = { login, register, logout };
