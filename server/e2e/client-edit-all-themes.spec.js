/**
 * Client yang sudah bayar: untuk SETIAP tema, buat undangan → isi SEMUA content_fields
 * dari manifest → simpan → reload → verifikasi setiap field tersimpan.
 *
 * Juga verifikasi sections tab menampilkan semua section dari manifest,
 * dan setiap collection tab yang ada di manifest benar-benar muncul.
 *
 * Prasyarat:
 *   - Server jalan di PLAYWRIGHT_BASE_URL (default localhost:3000)
 *   - MySQL + .env
 *   - npm run seed (untuk super admin)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { test, expect } = require('@playwright/test');
const { getValidThemeKeys, themeLoader } = require('./helpers/themeKeys');
const { query, one } = require('../src/db');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';

const TS = Date.now();
const themeKeys = getValidThemeKeys();

const CLIENT = {
  name: `E2E AllThemes ${TS}`,
  email: `e2e_allthemes_${TS}@test.local`,
  password: 'AllThemes99!',
};

function sampleValue(field, marker) {
  const k = field.key;
  const t = field.type;
  if (t === 'datetime') return '2026-09-14T18:00';
  if (t === 'color') return '#e2e100';
  if (t === 'textarea') return `${marker} — teks panjang untuk ${k}`;
  return `${marker}-${k}`;
}

async function openTab(page, tab) {
  await page.locator(`nav.site-tabs a.tab-link[data-tab="${tab}"]`).click();
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/tab-pane-active/);
}

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('Client edit semua tema — verifikasi SEMUA field manifest', () => {
  let clientUserId;
  const siteIds = {};

  test('00 — setup: daftar client, insert paid orders (1 per tema), buat site per tema via API', async ({
    page,
    playwright,
  }) => {
    await page.goto('/register');
    await page.locator('input[name="name"]').fill(CLIENT.name);
    await page.locator('input[name="email"]').fill(CLIENT.email);
    await page.locator('input[name="password"]').fill(CLIENT.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });

    const row = await one('SELECT id FROM users WHERE email = ?', [CLIENT.email]);
    expect(row).toBeTruthy();
    clientUserId = row.id;

    for (let i = 0; i < themeKeys.length; i++) {
      await query(
        `INSERT INTO payment_orders (order_id, user_id, plan_code, gross_amount, currency, status, paid_at)
         VALUES (?, ?, 'starter', 199000, 'IDR', 'paid', NOW())`,
        [`e2e-cet-${TS}-${i}`, clientUserId],
      );
    }

    const superCtx = await playwright.request.newContext({ baseURL: BASE });
    const loginRes = await superCtx.post('/api/auth/login', {
      data: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    const dashRes = await superCtx.get('/dashboard');
    let csrf = '';
    for (const h of await dashRes.headersArray()) {
      if (h.name.toLowerCase() === 'set-cookie') {
        const m = h.value.match(/_csrf_tok=([^;]+)/);
        if (m) csrf = m[1];
      }
    }

    for (const key of themeKeys) {
      const slug = `e2e-ct-${key}-${TS}`;
      const createRes = await superCtx.post('/sites/new', {
        maxRedirects: 0,
        form: {
          slug,
          theme_key: key,
          owner_user_id: String(clientUserId),
          managed_by: 'self',
          _csrf: csrf,
        },
      });
      expect(createRes.status()).toBe(302);
      const loc = createRes.headers().location || '';
      const m = loc.match(/\/sites\/(\d+)/);
      expect(m).toBeTruthy();
      siteIds[key] = Number(m[1]);
    }
    await superCtx.dispose();
  });

  for (const themeKey of themeKeys) {
    test(`[${themeKey}] isi SEMUA content_fields, sections, koleksi — verifikasi persisten`, async ({ page }) => {
      await page.goto('/login');
      await page.locator('input[name="email"]').fill(CLIENT.email);
      await page.locator('input[name="password"]').fill(CLIENT.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

      const siteId = siteIds[themeKey];
      const manifest = themeLoader.getManifest(themeKey);
      const marker = `CT-${themeKey}-${TS}`;

      await page.goto(`/sites/${siteId}`);
      await expect(page.locator('h1.site-show-header__slug')).toBeVisible();

      /* ── Content: isi SETIAP field dari manifest ── */
      await openTab(page, 'content');
      const contentForm = page.locator(`form[action="/sites/${siteId}/content"]`);
      await expect(contentForm).toBeVisible();

      const expectedValues = {};
      for (const f of manifest.content_fields || []) {
        const val = sampleValue(f, marker);
        expectedValues[f.key] = val;

        const el = contentForm.locator(`[name="${f.key}"]`);
        const count = await el.count();
        expect(count, `field ${f.key} harus ada di form content`).toBe(1);

        if (f.type === 'color') {
          await el.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, val);
        } else {
          await el.fill(val);
        }
      }

      await contentForm.locator('button[type="submit"]').click();
      await page.waitForURL(new RegExp(`/sites/${siteId}#content`));
      await page.waitForLoadState('networkidle');

      /* ── Reload & verifikasi SETIAP field tersimpan ── */
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await openTab(page, 'content');

      const reloadedForm = page.locator(`form[action="/sites/${siteId}/content"]`);
      for (const f of manifest.content_fields || []) {
        const el = reloadedForm.locator(`[name="${f.key}"]`);
        const saved = await el.inputValue();
        const expected = expectedValues[f.key];
        if (f.type === 'color') {
          expect(saved.toLowerCase(), `color field ${f.key}`).toBe(expected.toLowerCase());
        } else {
          expect(saved, `field ${f.key} harus tersimpan`).toBe(expected);
        }
      }

      /* ── Sections: setiap section dari manifest harus tampil ── */
      await openTab(page, 'sections');
      const secForm = page.locator(`form[action="/sites/${siteId}/sections"]`);
      for (const sec of manifest.sections || []) {
        const sectionRow = secForm.locator(`.section-row`).filter({
          has: page.locator(`input[name="section_key[]"][value="${sec.key}"]`),
        });
        await expect(sectionRow, `section ${sec.key} harus ada`).toBeVisible();
        const checkbox = sectionRow.locator(`input[name="enabled_${sec.key}"]`);
        await expect(checkbox).toBeVisible();
      }

      /* ── Collection tabs: setiap collection di manifest harus punya tab ── */
      for (const sec of manifest.sections || []) {
        if (!sec.collection) continue;
        const col = sec.collection;
        const tabLink = page.locator(`nav.site-tabs a.tab-link[data-tab="${col}"]`);
        await expect(tabLink, `tab koleksi ${col} harus ada`).toBeVisible();
        await openTab(page, col);
        await expect(page.locator(`#tab-${col}`)).toBeVisible();
        await expect(
          page.locator(`#tab-${col} .collection-add__form`),
          `form tambah item di ${col} harus ada`,
        ).toBeVisible();
      }

      /* ── Settings tab harus tampil ── */
      await openTab(page, 'settings');
      const setForm = page.locator(`form.settings-form[action^="/sites/${siteId}/settings"]`);
      await expect(setForm).toBeVisible();
      await expect(setForm.locator('input[name="music_enabled"]')).toBeVisible();
    });
  }

  test('cleanup — verifikasi jumlah site client benar', async () => {
    const row = await one('SELECT COUNT(*) AS c FROM sites WHERE owner_user_id = ?', [clientUserId]);
    expect(Number(row.c)).toBeGreaterThanOrEqual(themeKeys.length);
  });
});
