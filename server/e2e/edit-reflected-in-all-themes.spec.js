/**
 * E2E — Edit panel → tercermin di halaman undangan (semua tema).
 *
 * Untuk setiap tema yang ada di repo (theme1–16 + theme21; theme9 tidak ada):
 *   - Buat situs, isi SEMUA content_fields manifest + koleksi
 *   - Buka /preview/:slug (auth) dan /?site=:slug (publik)
 *   - Assert teks/koleksi muncul di HTML
 *   - Verifikasi form admin masih menyimpan nilai yang sama
 *
 * Prasyarat: server + MySQL + npm run seed (super admin).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { test, expect } = require('@playwright/test');
const { query } = require('../src/db');
const { getValidThemeKeys, themeLoader } = require('./helpers/themeKeys');
const {
  getExpectedThemeKeys,
  buildFullContentData,
  buildSectionsPayload,
  seedCollectionsForTheme,
  assertContentFieldsInHtml,
  assertCollectionMarkersInHtml,
  publishSiteViaApi,
} = require('./helpers/themeReflection');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';
const TS = Date.now();

test.describe.configure({ mode: 'serial', timeout: 420_000 });

/** Pastikan super admin bisa login (tes lain kadang ganti password). */
async function ensureE2eSuperAdminPassword() {
  const hash = await bcrypt.hash(SUPER_PASSWORD, 10);
  await query('UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE email = ?', [
    hash,
    SUPER_EMAIL,
  ]);
  const row = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [SUPER_EMAIL]);
  if (!row.length) {
    throw new Error(`User ${SUPER_EMAIL} tidak ada. Jalankan: npm run seed`);
  }
}

async function apiLoginSuper(playwright) {
  await ensureE2eSuperAdminPassword();
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  const login = await ctx.post('/api/auth/login', {
    data: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  if (!login.ok()) {
    const t = await login.text();
    throw new Error(
      `Super admin login failed (${login.status()}): ${t.slice(0, 200)}. Jalankan: npm run seed`,
    );
  }
  return ctx;
}

async function applyApiCookiesToContext(browserContext, apiContext) {
  const st = await apiContext.storageState();
  if (st.cookies?.length) await browserContext.addCookies(st.cookies);
}

async function openTab(page, tab) {
  await page.locator(`nav.site-tabs a.tab-link[data-tab="${tab}"]`).click();
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/tab-pane-active/);
}

test.describe('Edit → undangan (semua tema, lengkap)', () => {
  /** @type {import('@playwright/test').APIRequestContext} */
  let api;
  const siteByTheme = {};

  test('00 — cakupan tema sesuai disk', async () => {
    const expected = getExpectedThemeKeys();
    const actual = getValidThemeKeys().sort();
    expect(actual).toEqual(expected.sort());
    expect(actual.length).toBe(20);
    for (const key of expected) {
      expect(() => themeLoader.getManifest(key)).not.toThrow();
    }
  });

  test('01 — setup API super admin', async ({ playwright }) => {
    api = await apiLoginSuper(playwright);
  });

  for (const themeKey of getExpectedThemeKeys()) {
    test(`[${themeKey}] isi DB lengkap → preview + publik + form admin`, async ({ page, context }) => {
      const manifest = themeLoader.getManifest(themeKey);
      const slug = `e2e-refl-${themeKey}-${TS}`;
      const contentData = buildFullContentData(manifest, themeKey, TS);

      const createRes = await api.post('/api/sites', {
        data: {
          slug,
          theme_key: themeKey,
          managed_by: 'admin',
        },
      });
      expect(createRes.status(), `create site ${themeKey}`).toBe(201);
      const { site } = await createRes.json();
      const siteId = site.id;
      siteByTheme[themeKey] = { siteId, slug, contentData };

      const contentRes = await api.patch(`/api/sites/${siteId}/content`, {
        data: { data: contentData },
      });
      expect(contentRes.ok(), `patch content ${themeKey}`).toBeTruthy();

      const secRes = await api.patch(`/api/sites/${siteId}/sections`, {
        data: { sections: buildSectionsPayload(manifest) },
      });
      expect(secRes.ok(), `patch sections ${themeKey}`).toBeTruthy();

      const collectionMarkers = await seedCollectionsForTheme(api, siteId, themeKey, TS);
      siteByTheme[themeKey].collectionMarkers = collectionMarkers;

      await publishSiteViaApi(api, siteId);

      /* ── /preview/:slug (butuh login, data undangan ini) ── */
      await applyApiCookiesToContext(context, api);
      await page.goto(`/preview/${slug}`);
      expect(page.url()).toContain(`/preview/${slug}`);
      const previewHtml = await page.content();
      expect(previewHtml.length).toBeGreaterThan(1000);
      expect(previewHtml).not.toMatch(/Internal Server Error|Site not found/i);
      assertContentFieldsInHtml(previewHtml, manifest, contentData, collectionMarkers);
      assertCollectionMarkersInHtml(previewHtml, collectionMarkers, themeKey, contentData);

      /* ── /?site=:slug (tamu, tanpa login) ── */
      const publicRes = await api.get(`/?site=${encodeURIComponent(slug)}`, {
        headers: { Accept: 'text/html' },
      });
      expect(publicRes.status(), `public HTML ${themeKey}`).toBe(200);
      const publicHtml = await publicRes.text();
      assertContentFieldsInHtml(publicHtml, manifest, contentData, collectionMarkers);
      assertCollectionMarkersInHtml(publicHtml, collectionMarkers, themeKey, contentData);

      /* ── Panel admin: form content masih sama setelah render ── */
      await page.goto(`/sites/${siteId}`);
      await expect(page.locator('h1.site-show-header__slug')).toContainText(slug);
      await openTab(page, 'content');
      const form = page.locator(`form[action="/sites/${siteId}/content"]`);
      for (const f of manifest.content_fields || []) {
        const el = form.locator(`[name="${f.key}"]`);
        await expect(el, `form field ${f.key}`).toHaveCount(1);
        const saved = await el.inputValue();
        const expected = contentData[f.key];
        if (f.type === 'datetime') {
          expect(saved.replace(' ', 'T').slice(0, 16)).toBe(expected.slice(0, 16));
        } else {
          expect(saved, `admin form ${f.key}`).toBe(expected);
        }
      }

      /* ── Koleksi di admin (judul tersimpan) ── */
      if (collectionMarkers.storyTitle) {
        await openTab(page, 'story_items');
        await expect(
          page.locator('#tab-story_items input[name="title"][value="' + collectionMarkers.storyTitle + '"]'),
        ).toHaveCount(1);
      }
      if (collectionMarkers.eventTitle) {
        await openTab(page, 'events');
        await expect(
          page.locator('#tab-events input[name="title"][value="' + collectionMarkers.eventTitle + '"]'),
        ).toHaveCount(1);
      }
      if (collectionMarkers.giftBank) {
        await openTab(page, 'gift_accounts');
        await expect(
          page.locator('#tab-gift_accounts input[name="bank_name"][value="' + collectionMarkers.giftBank + '"]'),
        ).toHaveCount(1);
      }
    });
  }

  test('99 — ringkasan: semua tema punya situs uji', async () => {
    const keys = getExpectedThemeKeys();
    for (const key of keys) {
      expect(siteByTheme[key], `missing setup for ${key}`).toBeTruthy();
      expect(siteByTheme[key].siteId).toBeGreaterThan(0);
    }
  });

  test.afterAll(async () => {
    if (api) await api.dispose();
  });
});
