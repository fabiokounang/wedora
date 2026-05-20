/**
 * E2E — Admin CRUD: Pengguna, Kode Promo, Konten Publik (CMS)
 *
 * Prasyarat: Server + MySQL + .env + npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { test, expect } = require('@playwright/test');
const { query, one } = require('../src/db');

const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';
const TS = Date.now();

test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function loginSuper(page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(SUPER_EMAIL);
  await page.locator('input[name="password"]').fill(SUPER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 1: CRUD Pengguna (/users)
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('1 — CRUD Pengguna', () => {
  const NEW_USER = {
    name: `E2E User ${TS}`,
    email: `e2e_admuser_${TS}@test.local`,
    password: 'TestUser99!',
  };
  let newUserId;

  test('00 — login super admin', async ({ page }) => {
    await loginSuper(page);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('01 — GET /users: daftar pengguna muncul tanpa error', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/users');
    await expect(page.locator('h1')).toHaveText('Users');
    await expect(page.locator('.data-table-wrap')).toBeVisible();
  });

  test('02 — filter: cari berdasarkan query, role, sort', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/users');
    await page.locator('#dt-q').fill('admin');
    await page.locator('#dt-role').selectOption('super_admin');
    await page.locator('#dt-sort').selectOption('email');
    await page.locator('#dt-order').selectOption('asc');
    await page.locator('#users-filters button[type="submit"]').click();
    await page.waitForURL(/users\?/);
    expect(page.url()).toContain('q=admin');
    expect(page.url()).toContain('role=super_admin');
  });

  test('03 — create: tambah client baru', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/users/new');
    await page.locator('#f-name').fill(NEW_USER.name);
    await page.locator('#f-email').fill(NEW_USER.email);
    await page.locator('#f-role').selectOption('client');
    await page.locator('#f-password').fill(NEW_USER.password);
    await page.getByRole('button', { name: 'Buat pengguna' }).click();
    await page.waitForURL(/\/users(\?|$)/);

    const row = await one('SELECT id FROM users WHERE email = ?', [NEW_USER.email]);
    expect(row).toBeTruthy();
    newUserId = row.id;
  });

  test('04 — read: user baru tampil di daftar', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/users?q=${encodeURIComponent(NEW_USER.email)}`);
    await expect(page.locator(`text=${NEW_USER.name}`).first()).toBeVisible();
  });

  test('05 — update: edit nama user', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/users/${newUserId}/edit`);
    const updatedName = `E2E Updated ${TS}`;
    await page.locator('#f-name').fill(updatedName);
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await page.waitForURL(/\/users(\?|$)/);

    const row = await one('SELECT name FROM users WHERE id = ?', [newUserId]);
    expect(row.name).toBe(updatedName);
  });

  test('06 — update negatif: email duplikat → error', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/users/${newUserId}/edit`);
    await page.locator('#f-email').fill(SUPER_EMAIL);
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(page.locator('.flash.flash-error')).toBeVisible();
  });

  test('07 — delete: hapus user tes', async ({ page }) => {
    await loginSuper(page);
    await page.goto(`/users?q=${encodeURIComponent(NEW_USER.email)}`);

    page.on('dialog', (d) => d.accept());
    const deleteForm = page.locator(`form[action="/users/${newUserId}/delete"]`);
    await deleteForm.locator('button[type="submit"]').click();
    await page.waitForURL(/\/users/);

    const row = await one('SELECT id FROM users WHERE id = ?', [newUserId]);
    expect(row).toBeNull();
  });

  test('08 — delete negatif: tidak bisa hapus diri sendiri', async ({ page }) => {
    await loginSuper(page);
    const me = await one('SELECT id FROM users WHERE email = ?', [SUPER_EMAIL]);
    await page.goto(`/users?q=${encodeURIComponent(SUPER_EMAIL)}`);
    const selfRow = page.locator(`tr:has(td:has-text("${SUPER_EMAIL}"))`);
    const deleteBtn = selfRow.locator('button:has-text("Hapus")');
    await expect(deleteBtn).toHaveCount(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 2: CRUD Kode Promo (/promo-codes)
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('2 — CRUD Kode Promo', () => {
  const PROMO_CODE = `E2EADM${TS}`;
  let promoId;

  test('10 — create: tambah kode promo baru (persen)', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/promo-codes');
    await page.locator('#pc-code').fill(PROMO_CODE);
    await page.locator('#pc-type').selectOption('percent');
    await page.locator('#pc-val').fill('25');
    await page.locator('#pc-max').fill('10');
    await page.locator('#pc-per').fill('2');
    await page.locator('form[action="/promo-codes"] button[type="submit"]').click();
    await page.waitForURL(/promo-codes\?notice=created/);

    await expect(page.locator('.flash-success, .flash.flash-success')).toBeVisible();
    const row = await one('SELECT * FROM promo_codes WHERE code = ?', [PROMO_CODE]);
    expect(row).toBeTruthy();
    expect(Number(row.discount_value)).toBe(25);
    expect(Number(row.max_uses)).toBe(10);
    promoId = row.id;
  });

  test('11 — read: kode muncul di tabel', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/promo-codes');
    await expect(page.locator(`text=${PROMO_CODE}`).first()).toBeVisible();
  });

  test('12 — update: ubah discount_value dan toggle active off', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/promo-codes');

    const detailsEl = page.locator(`tr:has(td:has-text("${PROMO_CODE}")) details.promo-admin-edit`);
    await detailsEl.locator('summary').click();
    await detailsEl.locator('input[name="discount_value"]').fill('50');
    await detailsEl.locator('input[name="active"]').uncheck();
    await detailsEl.locator('button[type="submit"]:has-text("Simpan")').click();
    await page.waitForURL(/promo-codes\?notice=updated/);

    const row = await one('SELECT * FROM promo_codes WHERE id = ?', [promoId]);
    expect(Number(row.discount_value)).toBe(50);
    expect(Number(row.active)).toBe(0);
  });

  test('13 — create negatif: kode duplikat → flash error', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/promo-codes');
    await page.locator('#pc-code').fill(PROMO_CODE);
    await page.locator('#pc-val').fill('10');
    await page.locator('form[action="/promo-codes"] button[type="submit"]').click();
    await page.waitForURL(/promo-codes\?err=duplicate/);
    await expect(page.locator('.flash-error, .flash.flash-error')).toBeVisible();
  });

  test('14 — delete: hapus kode promo', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/promo-codes');

    const detailsEl = page.locator(`tr:has(td:has-text("${PROMO_CODE}")) details.promo-admin-edit`);
    await detailsEl.locator('summary').click();

    page.on('dialog', (d) => d.accept());
    await detailsEl.locator('.promo-btn-delete').click();
    await page.waitForURL(/promo-codes\?notice=deleted/);

    const row = await one('SELECT id FROM promo_codes WHERE id = ?', [promoId]);
    expect(row).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 3: Konten Publik CMS (/landing-cms) — semua tab
 * ═══════════════════════════════════════════════════════════════════ */
test.describe('3 — Konten Publik CMS (semua tab)', () => {
  const S = `E2ECMS${TS}`;

  let originalBrand;

  test('20 — simpan: backup brand lama', async () => {
    const row = await one('SELECT content FROM landing_settings ORDER BY id DESC LIMIT 1');
    if (row && row.content) {
      try {
        const c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
        originalBrand = c?.footer?.brandName || null;
      } catch (_) {}
    }
  });

  test('21 — semua tab: isi field sentinel + simpan → notice=saved', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/landing-cms');

    const tabIds = [
      'seo', 'footer', 'cta', 'home-hero', 'home-stats',
      'home-about', 'home-mid', 'home-preview',
      'price-hero', 'price-cards', 'price-table',
    ];

    for (const tabId of tabIds) {
      await page.locator(`button[data-public-cms-tab="${tabId}"]`).click();
      await page.waitForTimeout(150);
    }

    // --- SEO ---
    await page.locator('button[data-public-cms-tab="seo"]').click();
    await page.locator('#seo-homeTitle').fill(`${S} Home`);
    await page.locator('#seo-pricingTitle').fill(`${S} Pricing`);

    // --- Footer ---
    await page.locator('button[data-public-cms-tab="footer"]').click();
    await page.locator('#ft-brand').fill(`${S} Brand`);
    await page.locator('#ft-tag').fill(`${S} tagline footer`);

    // --- CTA ---
    await page.locator('button[data-public-cms-tab="cta"]').click();
    await page.locator('#cta-h0').fill(`${S} CTA`);

    // --- Beranda Hero ---
    await page.locator('button[data-public-cms-tab="home-hero"]').click();
    await page.locator('#hh-ey').fill(`${S} Eyebrow`);
    await page.locator('#hh-t1').fill(`${S} HeroLine1`);

    // --- Beranda Statistik ---
    await page.locator('button[data-public-cms-tab="home-stats"]').click();
    await page.locator('#st-0-val').fill('999');
    await page.locator('#st-0-lab').fill(`${S} stat`);

    // --- Beranda Tentang ---
    await page.locator('button[data-public-cms-tab="home-about"]').click();
    await page.locator('#ab-ey').fill(`${S} About`);

    // --- Beranda Langkah & Testimoni ---
    await page.locator('button[data-public-cms-tab="home-mid"]').click();
    await page.locator('#hs-ey').fill(`${S} Steps`);

    // --- Beranda Pratinjau paket ---
    await page.locator('button[data-public-cms-tab="home-preview"]').click();
    await page.locator('#hpp-ey').fill(`${S} Preview`);

    // --- Harga Hero ---
    await page.locator('button[data-public-cms-tab="price-hero"]').click();
    await page.locator('#ph-ey').fill(`${S} PriceHero`);

    // --- Harga Kartu ---
    await page.locator('button[data-public-cms-tab="price-cards"]').click();

    // --- Harga Tabel & FAQ ---
    await page.locator('button[data-public-cms-tab="price-table"]').click();
    await page.locator('#pf-ey').fill(`${S} FAQ`);
    await page.locator('#pf-ti').fill(`${S} FAQ Title`);

    await page.locator('form[action="/landing-cms"] button[type="submit"]').click();
    await page.waitForURL(/landing-cms\?notice=saved/, { timeout: 15_000 });
    await expect(page.locator('.flash-success, .flash.flash-success').first()).toBeVisible();
  });

  test('22 — verifikasi: field tersimpan di DB', async () => {
    const row = await one('SELECT content FROM landing_settings ORDER BY id DESC LIMIT 1');
    expect(row).toBeTruthy();
    const c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    expect(c.seo.homeTitle).toBe(`${S} Home`);
    expect(c.footer.brandName).toBe(`${S} Brand`);
    expect(c.home.hero.eyebrow).toBe(`${S} Eyebrow`);
    expect(c.pricing.hero.eyebrow).toBe(`${S} PriceHero`);
    expect(c.pricing.faqSection.eyebrow).toBe(`${S} FAQ`);
  });

  test('23 — verifikasi: footer brand muncul di halaman publik', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator(`text=${S} Brand`).first()).toBeVisible();
  });

  test('24 — verifikasi: reload CMS page menampilkan nilai baru', async ({ page }) => {
    await loginSuper(page);
    await page.goto('/landing-cms');
    await expect(page.locator('#seo-homeTitle')).toHaveValue(`${S} Home`);
    await page.locator('button[data-public-cms-tab="footer"]').click();
    await expect(page.locator('#ft-brand')).toHaveValue(`${S} Brand`);
  });

  test('25 — cleanup: restore brand name', async ({ page }) => {
    if (originalBrand == null) return;
    await loginSuper(page);
    await page.goto('/landing-cms');
    await page.locator('button[data-public-cms-tab="footer"]').click();
    await page.locator('#ft-brand').fill(originalBrand);
    await page.locator('form[action="/landing-cms"] button[type="submit"]').click();
    await page.waitForURL(/landing-cms\?notice=saved/, { timeout: 15_000 });
  });
});
