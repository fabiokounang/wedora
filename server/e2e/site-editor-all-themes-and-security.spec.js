const { test, expect } = require('@playwright/test');
const { getValidThemeKeys, themeLoader } = require('./helpers/themeKeys');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL || 'admin@wedding.local';
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD || 'admin123';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function getCsrfToken(ctx) {
  const res = await ctx.get('/dashboard');
  for (const h of await res.headersArray()) {
    if (h.name.toLowerCase() === 'set-cookie') {
      const m = h.value.match(/_csrf_tok=([^;]+)/);
      if (m) return m[1];
    }
  }
  return '';
}

async function apiLoginSuper(playwright) {
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  const login = await ctx.post('/api/auth/login', {
    data: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  if (!login.ok()) {
    const t = await login.text();
    throw new Error(
      `Super admin login failed (${login.status()}): ${t.slice(0, 200)}. Pastikan MySQL jalan dan jalankan: npm run seed`,
    );
  }
  return ctx;
}

async function resolveSiteIdsBySlug(apiContext) {
  const res = await apiContext.get('/api/sites');
  expect(res.ok(), 'GET /api/sites').toBeTruthy();
  const { sites } = await res.json();
  const keys = getValidThemeKeys();
  const map = {};
  for (const k of keys) {
    const row = sites.find((s) => s.slug === k);
    if (!row) {
      throw new Error(
        `Situs undangan dengan slug="${k}" tidak ada di DB. Jalankan: npm run seed (membuat satu situs per tema, slug = theme key).`,
      );
    }
    map[k] = row.id;
  }
  return { map, sites };
}

async function applyApiCookiesToContext(context, apiContext) {
  const st = await apiContext.storageState();
  if (st.cookies && st.cookies.length) {
    await context.addCookies(st.cookies);
  }
}

async function openTab(page, tab) {
  await page.locator(`nav.site-tabs a.tab-link[data-tab="${tab}"]`).click();
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/tab-pane-active/);
}

async function fillEmptyRequiredInContentForm(contentForm) {
  const fields = contentForm.locator('input[required], textarea[required]');
  const n = await fields.count();
  for (let i = 0; i < n; i++) {
    const el = fields.nth(i);
    const v = await el.inputValue();
    if (v && String(v).trim() !== '') continue;
    const type = await el.getAttribute('type');
    const tag = await el.evaluate((e) => e.tagName);
    if (type === 'datetime-local') {
      await el.fill('2026-09-14T18:00');
    } else if (tag === 'TEXTAREA') {
      await el.fill('Teks contoh e2e.');
    } else {
      await el.fill('E2E');
    }
  }
}

test.describe('Kelola konten — semua tema + keamanan', () => {
  /** @type {import('@playwright/test').APIRequestContext} */
  let apiContext;
  /** @type {Record<string, number>} */
  let siteIdBySlug;
  /** @type {number} */
  let anySiteId;
  let csrf = '';

  test.beforeAll(async ({ playwright }) => {
    apiContext = await apiLoginSuper(playwright);
    csrf = await getCsrfToken(apiContext);
    const { map } = await resolveSiteIdsBySlug(apiContext);
    siteIdBySlug = map;
    anySiteId = map[getValidThemeKeys()[0]];
  });

  test.afterAll(async () => {
    if (apiContext) await apiContext.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await applyApiCookiesToContext(context, apiContext);
  });

  for (const themeKey of getValidThemeKeys()) {
    test(`[${themeKey}] Content + Sections + Settings + koleksi (manifest)`, async ({ page }) => {
      const siteId = siteIdBySlug[themeKey];
      const manifest = themeLoader.getManifest(themeKey);
      const marker = `E2E-${themeKey}-${Date.now()}`;

      await page.goto(`/sites/${siteId}`);
      await expect(page.locator('h1.site-show-header__slug')).toContainText(themeKey);

      /* ── Content ── */
      await openTab(page, 'content');
      const contentForm = page.locator(`form[action="/sites/${siteId}/content"]`);
      await expect(contentForm).toBeVisible();
      const partner = contentForm.locator('input[name="partner_one"]');
      if (await partner.count()) {
        await partner.fill(marker);
      } else {
        const firstText = contentForm.locator('input[type="text"][name]').first();
        await firstText.fill(marker);
      }
      await fillEmptyRequiredInContentForm(contentForm);
      await contentForm.locator('button[type="submit"]').click();
      await page.waitForURL(new RegExp(`/sites/${siteId}#content`));
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await openTab(page, 'content');
      const contentFormReloaded = page.locator(`form[action="/sites/${siteId}/content"]`);
      const partnerAfter = contentFormReloaded.locator('input[name="partner_one"]');
      if (await partnerAfter.count()) {
        await expect(partnerAfter).toHaveValue(marker);
      } else {
        await expect(contentFormReloaded.locator('input[type="text"][name]').first()).toHaveValue(marker);
      }

      /* ── Sections (kirim ulang tanpa ubah struktur wajib) ── */
      await openTab(page, 'sections');
      const secForm = page.locator(`form[action="/sites/${siteId}/sections"]`);
      await secForm.locator('button[type="submit"]').click();
      await page.waitForURL(new RegExp(`/sites/${siteId}#sections`));

      /* ── Koleksi per manifest ── */
      for (const sec of manifest.sections || []) {
        if (!sec.collection) continue;
        const col = sec.collection;
        await openTab(page, col);
        await expect(page.locator(`#tab-${col}`)).toBeVisible();

        if (col === 'story_items') {
          await page.locator('#new-story_items-title').fill(`Story ${marker}`);
          await page.locator('#new-story_items-date_label').fill('2026-01');
          await page.locator('#new-story_items-description').fill('Deskripsi e2e.');
          await page.locator('#tab-story_items .collection-add__form button[type="submit"]').click();
          await page.waitForURL(/#story_items/);

          const storyCard = page
            .locator('#tab-story_items form.collection-card')
            .filter({ has: page.locator(`input[name="title"][value="Story ${marker}"]`) });
          await storyCard.locator('textarea[name="description"]').fill('Deskripsi e2e — diperbarui.');
          await storyCard.getByRole('button', { name: 'Save changes' }).click();
          await page.waitForURL(/#story_items/);
          await page.reload();
          await page.waitForLoadState('domcontentloaded');
          await openTab(page, 'story_items');
          const storyReloaded = page
            .locator('#tab-story_items form.collection-card')
            .filter({ has: page.locator(`input[name="title"][value="Story ${marker}"]`) });
          await expect(storyReloaded.locator('textarea[name="description"]')).toHaveValue('Deskripsi e2e — diperbarui.');
        } else if (col === 'events') {
          await page.locator('#new-events-event_type').fill('akad');
          await page.locator('#new-events-title').fill(`Event ${marker}`);
          await page.locator('#new-events-venue_name').fill('Gedung E2E');
          await page.locator('#new-events-address').fill('Jl. Test 1');
          await page.locator('#new-events-datetime').fill('2026-06-01T10:00');
          await page.locator('#new-events-map_url').fill('https://maps.example.com/e2e');
          await page.locator('#tab-events .collection-add__form button[type="submit"]').click();
          await page.waitForURL(/#events/);

          const eventCard = page
            .locator('#tab-events form.collection-card')
            .filter({ has: page.locator(`input[name="title"][value="Event ${marker}"]`) });
          await eventCard.locator('input[name="venue_name"]').fill('Gedung E2E — diperbarui');
          await eventCard.getByRole('button', { name: 'Save changes' }).click();
          await page.waitForURL(/#events/);
          await page.reload();
          await page.waitForLoadState('domcontentloaded');
          await openTab(page, 'events');
          const eventReloaded = page
            .locator('#tab-events form.collection-card')
            .filter({ has: page.locator(`input[name="title"][value="Event ${marker}"]`) });
          await expect(eventReloaded.locator('input[name="venue_name"]')).toHaveValue('Gedung E2E — diperbarui');
        } else if (col === 'gallery_items') {
          const imgBase = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800';
          const url = `${imgBase}&e2e=${encodeURIComponent(marker)}`;
          const thumb = `${imgBase}&w=400&e2e=${encodeURIComponent(marker)}`;
          await page.locator('#new-gallery_items-image_url').fill(url);
          await page.locator('#new-gallery_items-thumbnail_url').fill(thumb);
          await page.locator('#tab-gallery_items .collection-add__form button[type="submit"]').click();
          await page.waitForURL(/#gallery_items/);

          const galleryCard = page.locator('#tab-gallery_items .collection-list form.collection-card').last();
          await galleryCard.locator('input[name="caption"]').fill(`Caption ${marker}`);
          await galleryCard.getByRole('button', { name: 'Save changes' }).click();
          await page.waitForURL(/#gallery_items/);
          await page.reload();
          await page.waitForLoadState('domcontentloaded');
          await openTab(page, 'gallery_items');
          const galleryReloaded = page.locator('#tab-gallery_items .collection-list form.collection-card').last();
          await expect(galleryReloaded.locator('input[name="caption"]')).toHaveValue(`Caption ${marker}`);
        } else if (col === 'gift_accounts') {
          await page.locator('#new-gift_accounts-bank_name').fill(`Bank ${marker}`);
          await page.locator('#new-gift_accounts-account_name').fill('Nama Rek');
          await page.locator('#new-gift_accounts-account_number').fill('1234567890123');
          await page.locator('#tab-gift_accounts .collection-add__form button[type="submit"]').click();
          await page.waitForURL(/#gift_accounts/);

          const giftCard = page
            .locator('#tab-gift_accounts form.collection-card')
            .filter({ has: page.locator(`input[name="bank_name"][value="Bank ${marker}"]`) });
          await giftCard.locator('input[name="account_name"]').fill(`Nama Rek — diperbarui ${marker}`);
          await giftCard.getByRole('button', { name: 'Save changes' }).click();
          await page.waitForURL(/#gift_accounts/);
          await page.reload();
          await page.waitForLoadState('domcontentloaded');
          await openTab(page, 'gift_accounts');
          const giftReloaded = page
            .locator('#tab-gift_accounts form.collection-card')
            .filter({ has: page.locator(`input[name="bank_name"][value="Bank ${marker}"]`) });
          await expect(giftReloaded.locator('input[name="account_name"]')).toHaveValue(`Nama Rek — diperbarui ${marker}`);
        }
      }

      /* ── RSVPs / Wishes (baca) ── */
      await openTab(page, 'rsvps');
      await expect(page.getByRole('heading', { name: /RSVPs/i })).toBeVisible();
      await openTab(page, 'wishes');
      await expect(page.getByRole('heading', { name: /Wishes/i })).toBeVisible();

      /* ── Settings: simpan tanpa mengaktifkan musik kosong ── */
      await openTab(page, 'settings');
      const setForm = page.locator(`form.settings-form[action^="/sites/${siteId}/settings"]`);
      await setForm.locator('input[name="music_enabled"]').setChecked(false);
      await setForm.locator('input[name="music_url"]').fill('');
      await setForm.getByRole('button', { name: 'Simpan Settings' }).click();
      await page.waitForURL(new RegExp(`/sites/${siteId}#settings`));
    });
  }

  test('Keamanan: POST /sites/999999999/content → 404', async () => {
    const res = await apiContext.post('/sites/999999999/content', {
      form: { partner_one: 'hack', _csrf: csrf },
      headers: { Accept: 'text/html' },
    });
    expect(res.status()).toBe(404);
  });

  test('Keamanan: POST settings theme_key tidak valid → 400', async () => {
    const id = anySiteId;
    const res = await apiContext.post(`/sites/${id}/settings?_csrf=${csrf}`, {
      form: {
        theme_key: 'not-a-real-theme-xyz-999',
        music_enabled: '0',
        music_url: '',
        music_start: 'tap',
      },
    });
    expect(res.status()).toBe(400);
    const t = await res.text();
    expect(t).toMatch(/not found|theme/i);
  });

  test('Keamanan: POST koleksi tabel tidak dikenal → 404', async () => {
    const id = anySiteId;
    const res = await apiContext.post(`/sites/${id}/collections/hackers_table`, {
      form: { title: 'x', _csrf: csrf },
    });
    expect(res.status()).toBe(404);
  });

  test('Keamanan: injeksi field ekstra pada content diabaikan (hanya field manifest)', async ({ page, context }) => {
    await applyApiCookiesToContext(context, apiContext);
    const id = anySiteId;
    const res = await apiContext.post(`/sites/${id}/content`, {
      form: {
        partner_one: 'Nilai aman e2e',
        role: 'super_admin',
        owner_user_id: '1',
        is_admin: 'true',
        __proto__: '[object Object]',
        _csrf: csrf,
      },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    const loc = res.headers().location || '';
    expect(loc).toContain(`/sites/${id}`);
    await page.goto(`/sites/${id}#content`);
    await openTab(page, 'content');
    await expect(page.locator('input[name="partner_one"]').first()).toHaveValue('Nilai aman e2e');
  });

  test('Keamanan: musik aktif tanpa URL → 400', async () => {
    const id = anySiteId;
    const res = await apiContext.post(`/sites/${id}/settings?_csrf=${csrf}`, {
      form: {
        music_enabled: 'on',
        music_url: '',
        music_start: 'tap',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.text();
    expect(body).toMatch(/Music URL is required|musik/i);
  });

  test('Keamanan: music_url tidak http(s) atau / → 400', async () => {
    const id = anySiteId;
    const res = await apiContext.post(`/sites/${id}/settings?_csrf=${csrf}`, {
      form: {
        music_enabled: '0',
        music_url: 'javascript:alert(1)',
        music_start: 'tap',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('Keamanan: klien lain tidak boleh GET kelola situs super (403)', async ({ playwright }) => {
    const ts = Date.now();
    const cli = await playwright.request.newContext({ baseURL: BASE });
    const reg = await cli.post('/api/auth/register', {
      data: {
        email: `e2e_isolation_${ts}@test.local`,
        password: 'ClientE2E99!',
        name: 'E2E Client',
      },
    });
    expect(reg.status()).toBe(201);
    const targetId = anySiteId;
    const hit = await cli.get(`/sites/${targetId}`, {
      headers: { Accept: 'text/html' },
      maxRedirects: 0,
    });
    expect(hit.status()).toBe(403);
    await cli.dispose();
  });

  test('Keamanan: story_items — tambah lalu hapus (dialog konfirmasi)', async ({ page, context }) => {
    await applyApiCookiesToContext(context, apiContext);
    const themeKey = getValidThemeKeys()[0];
    const siteId = siteIdBySlug[themeKey];
    const manifest = themeLoader.getManifest(themeKey);
    const hasStory = (manifest.sections || []).some((s) => s.collection === 'story_items');
    if (!hasStory) test.skip(true, 'theme tanpa story_items');

    const delTitle = `E2E-DELETE-${Date.now()}`;
    await page.goto(`/sites/${siteId}`);
    await openTab(page, 'story_items');
    await page.locator('#new-story_items-title').fill(delTitle);
    await page.locator('#new-story_items-date_label').fill('2026-02');
    await page.locator('#tab-story_items .collection-add__form button[type="submit"]').click();
    await page.waitForURL(/#story_items/);

    const card = page.locator('.collection-card').filter({ has: page.locator(`input[name="title"][value="${delTitle}"]`) });
    await expect(card).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await card.getByRole('button', { name: /Delete/i }).click();
    await page.waitForURL(/#story_items/);
    await expect(page.locator(`input[name="title"][value="${delTitle}"]`)).toHaveCount(0);
  });
});
