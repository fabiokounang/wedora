const { test, expect } = require('@playwright/test');
const { getValidThemeKeys, themeLoader } = require('./helpers/themeKeys');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';

const TS = Date.now();

async function loginSuperPage(page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(SUPER_EMAIL);
  await page.locator('input[name="password"]').fill(SUPER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.describe.serial('Katalog Tema (/theme-gallery)', () => {
  const themeKeys = getValidThemeKeys();

  test('01 — halaman /theme-gallery terbuka tanpa login', async ({ page }) => {
    await page.goto('/theme-gallery');
    await expect(page.locator('h1')).toContainText(/Katalog tema/i);
    await expect(page.locator('.theme-catalog')).toBeVisible();
  });

  test('02 — menampilkan semua tema yang valid (tidak broken)', async ({ page }) => {
    await page.goto('/theme-gallery');
    const cards = page.locator('.theme-catalog .card--with-thumb');
    await expect(cards).toHaveCount(themeKeys.length);
  });

  test('03 — setiap kartu punya nama, badge key, tombol "Open live demo"', async ({ page }) => {
    await page.goto('/theme-gallery');
    for (const key of themeKeys) {
      const card = page.locator('.card--with-thumb').filter({ has: page.locator(`.badge-key:text-is("${key}")`) });
      await expect(card).toBeVisible();
      const manifest = themeLoader.getManifest(key);
      await expect(card.locator('.card-head h3')).toContainText(manifest.name);
      await expect(card.getByRole('link', { name: /Open live demo/i })).toBeVisible();
    }
  });

  test('04 — tamu (tanpa login): tombol "Create new site" TIDAK tampil', async ({ page }) => {
    await page.goto('/theme-gallery');
    const createBtns = page.locator('.theme-catalog a[href*="/sites/new"]');
    await expect(createBtns).toHaveCount(0);
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });

  test('05 — super admin: tombol "Create new site" tampil di setiap kartu', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/theme-gallery');
    for (const key of themeKeys) {
      const card = page.locator('.card--with-thumb').filter({ has: page.locator(`.badge-key:text-is("${key}")`) });
      const createLink = card.getByRole('link', { name: /Create new site/i });
      await expect(createLink).toBeVisible();
      const href = await createLink.getAttribute('href');
      expect(href).toContain(`/sites/new?theme_key=${key}`);
    }
  });

  test('06 — klik "Create new site" dari katalog → /sites/new?theme_key=… → tema terpilih', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/theme-gallery');
    const firstKey = themeKeys[0];
    const card = page.locator('.card--with-thumb').filter({ has: page.locator(`.badge-key:text-is("${firstKey}")`) });
    await card.getByRole('link', { name: /Create new site/i }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/new\\?theme_key=${firstKey}`));
    await expect(page.locator('#theme_key')).toHaveValue(firstKey);
    await expect(page.locator('.callout--info')).toContainText(firstKey);
  });

  test('07 — klik "Create new site" lalu submit langsung → site dibuat', async ({ page }) => {
    await loginSuperPage(page);
    const useKey = themeKeys[themeKeys.length - 1];
    await page.goto(`/sites/new?theme_key=${useKey}`);
    const slug = `e2e-katalog-${TS}`;
    await page.locator('#form-new-site input[name="slug"]').fill(slug);
    await page.locator('#form-new-site').evaluate((form) => form.submit());
    await page.waitForURL(/\/sites\/\d+\?new=1/, { timeout: 15_000 });
    await expect(page.locator('h1.site-show-header__slug')).toContainText(slug);
    await expect(page.locator('.site-show-header__meta')).toContainText(useKey);
  });

  for (const key of themeKeys) {
    test(`08-demo [${key}] — "Open live demo" link valid, halaman 200, ada HTML`, async ({ request }) => {
      const res = await request.get(`${BASE}/?site=preview-${key}`, {
        headers: { Accept: 'text/html' },
      });
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body.length).toBeGreaterThan(500);
      expect(body.toLowerCase()).not.toContain('internal server error');
    });
  }

  test('09 — sidebar link "Katalog tema" aktif di /theme-gallery', async ({ page }) => {
    await loginSuperPage(page);
    await page.goto('/theme-gallery');
    const link = page.locator('#admin-sidebar a.sidebar-nav__link[href="/theme-gallery"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveClass(/is-active/);
  });

  test('10 — callout perbedaan Katalog vs Undangan tampil', async ({ page }) => {
    await page.goto('/theme-gallery');
    await expect(page.locator('.callout--hint')).toBeVisible();
    await expect(page.locator('.callout--hint')).toContainText(/Katalog/);
    await expect(page.locator('.callout--hint')).toContainText(/Undangan/);
  });

  test('11 — setiap kartu punya gambar preview', async ({ page }) => {
    await page.goto('/theme-gallery');
    for (const key of themeKeys) {
      const card = page.locator('.card--with-thumb').filter({ has: page.locator(`.badge-key:text-is("${key}")`) });
      const img = card.locator('.card-thumb img');
      await expect(img).toBeVisible();
      const src = await img.getAttribute('src');
      expect(src).toBeTruthy();
    }
  });

  test('12 — URL demo format: /?site=preview-{key}', async ({ page }) => {
    await page.goto('/theme-gallery');
    for (const key of themeKeys) {
      const card = page.locator('.card--with-thumb').filter({ has: page.locator(`.badge-key:text-is("${key}")`) });
      const demoLink = card.getByRole('link', { name: /Open live demo/i });
      const href = await demoLink.getAttribute('href');
      expect(href).toMatch(new RegExp(`\\?site=preview-${key}$`));
      await expect(demoLink).toHaveAttribute('target', '_blank');
    }
  });
});
