const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';
const TS = Date.now();
const USER = {
  name: `Dash E2E ${TS}`,
  email: `e2e_dash_${TS}@test.local`,
  password: 'DashTest99!',
};

/** Login; klien baru sering diarahkan ke /billing — buka /dashboard untuk uji menu. */
async function loginThenOpenDashboard(page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(USER.email);
  await page.locator('input[name="password"]').fill(USER.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  if (new URL(page.url()).pathname === '/billing') {
    await page.goto('/dashboard');
  }
  await expect(page).toHaveURL(/\/dashboard/);
}

function semuaUndanganLink(page) {
  return page.locator('#admin-sidebar nav.sidebar-nav a.sidebar-nav__link[href="/dashboard"]').first();
}

test.describe.serial('Dashboard — menu Semua undangan', () => {
  test('00 — daftar akun klien untuk skenario dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.locator('input[name="name"]').fill(USER.name);
    await page.locator('input[name="email"]').fill(USER.email);
    await page.locator('input[name="password"]').fill(USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/login?registered=1', { timeout: 15_000 });
  });

  test('01 — setelah login, membuka /dashboard menampilkan halaman Undangan', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await expect(page.locator('h1.dash-title')).toHaveText('Undangan');
    await expect(page).toHaveTitle(/Undangan/i);
  });

  test('02 — menu sidebar "Semua undangan" ada, href /dashboard, dalam grup Undangan', async ({ page }) => {
    await loginThenOpenDashboard(page);
    const link = semuaUndanganLink(page);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard');
    await expect(page.getByText('Undangan', { exact: false }).first()).toBeVisible();
  });

  test('03 — di /dashboard, link "Semua undangan" memiliki state aktif (is-active)', async ({ page }) => {
    await loginThenOpenDashboard(page);
    const link = semuaUndanganLink(page);
    await expect(link).toHaveClass(/is-active/);
  });

  test('04 — konten halaman: statistik, tombol sinkron tema, buat undangan baru', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await expect(page.locator('.stat-row')).toBeVisible();
    await expect(page.locator('.stat-card')).toHaveCount(5);
    await expect(page.locator('.stat-card__lab', { hasText: 'RSVP tamu (total)' })).toBeVisible();
    await expect(page.locator('.stat-card__lab', { hasText: 'Ucapan (total)' })).toBeVisible();
    await expect(page.locator('form[action="/themes/sync"]')).toBeVisible();
    await expect(page.locator('form[action="/themes/sync"] input[name="return_to"]')).toHaveValue('/dashboard');
    await expect(page.locator('.page-header__actions a[href="/sites/new"]').first()).toBeVisible();
    await expect(page.locator('.page-header__actions a[href="/theme-gallery"]').first()).toBeVisible();
  });

  test('05 — daftar undangan: empty state ATAU kartu situs (salah satu wajib tampil)', async ({ page }) => {
    await loginThenOpenDashboard(page);
    const empty = page.locator('.empty-state');
    const cards = page.locator('.cards--dashboard .card--site');
    const hasEmpty = await empty.isVisible().catch(() => false);
    const nCards = await cards.count();
    expect(hasEmpty || nCards > 0).toBe(true);
  });

  test('06 — dari /billing, klik "Semua undangan" kembali ke /dashboard', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/billing/);
    await semuaUndanganLink(page).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('h1.dash-title')).toHaveText('Undangan');
  });

  test('07 — dari /theme-gallery, klik "Semua undangan" ke /dashboard', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await page.goto('/theme-gallery');
    await expect(page).toHaveURL(/\/theme-gallery/);
    await semuaUndanganLink(page).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('h1.dash-title')).toHaveText('Undangan');
  });

  test('08 — klien tanpa slot bayar: klik "Buat undangan baru" di sidebar → /billing; lalu "Semua undangan" → /dashboard', async ({ page }) => {
    await loginThenOpenDashboard(page);
    const buatSidebar = page.locator('#admin-sidebar nav.sidebar-nav a.sidebar-nav__link[href="/sites/new"]');
    await expect(buatSidebar).toHaveAttribute('href', '/sites/new');
    await buatSidebar.click();
    await expect(page).toHaveURL(/\/billing/);
    await semuaUndanganLink(page).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(semuaUndanganLink(page)).toHaveClass(/is-active/);
  });

  test('09 — GET /dashboard tanpa cookie → redirect ke /login', async ({ request }) => {
    const resp = await request.get(`${BASE}/dashboard`, {
      maxRedirects: 0,
      headers: { Accept: 'text/html' },
    });
    expect([302, 301]).toContain(resp.status());
    const loc = resp.headers().location || '';
    expect(loc).toMatch(/login/i);
  });

  test('10 — GET /dashboard tanpa cookie + Accept JSON → 401', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const resp = await ctx.get('/dashboard', { maxRedirects: 0 });
    expect(resp.status()).toBe(401);
    const j = await resp.json();
    expect(j.error).toBe('unauthorized');
    await ctx.dispose();
  });

  test('11 — query aneh (?assign=evil) untuk klien tidak merusak halaman', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await page.goto('/dashboard?assign=evil&foo=<script>alert(1)</script>');
    await expect(page.locator('h1.dash-title')).toHaveText('Undangan');
    const html = await page.content();
    expect(html).not.toContain('<script>alert(1)</script>');
    await expect(page.locator('.filter-bar')).toHaveCount(0);
  });

  test('12 — theme_sync=1 menampilkan flash sukses sinkron (teks aman)', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await page.goto('/dashboard?theme_sync=1');
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText(/Tema disinkronkan|dimuat ulang/i);
    const html = await page.content();
    expect(html).not.toContain('alert(1)');
  });

  test('13 — grup sidebar pertama (Undangan) berisi dua link: Semua + Buat baru', async ({ page }) => {
    await loginThenOpenDashboard(page);
    const firstGroup = page.locator('#admin-sidebar .sidebar-nav__group').first();
    const links = firstGroup.getByRole('link');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toContainText(/Semua undangan/i);
    await expect(links.nth(1)).toContainText(/Buat undangan baru/i);
  });

  test('14 — tombol topbar "Buka menu" pada viewport sempit: sidebar bisa dibuka dan link Semua undangan terlihat', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/dashboard');
    const toggle = page.locator('#sidebar-toggle');
    await toggle.click();
    const link = semuaUndanganLink(page);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('15 — direct navigation: /dashboard memuat ulang stat dan judul', async ({ page }) => {
    await loginThenOpenDashboard(page);
    await page.reload();
    await expect(page.locator('h1.dash-title')).toHaveText('Undangan');
    await expect(page.locator('.stat-row')).toBeVisible();
  });

  test('16 — kartu situs atau empty state: tautan konsisten', async ({ page }) => {
    await loginThenOpenDashboard(page);
    const n = await page.locator('.cards--dashboard .card--site').count();
    if (n > 0) {
      const card = page.locator('.card--site').first();
      const kelola = card.getByRole('link', { name: /Kelola konten/i });
      const lihat = card.getByRole('link', { name: /Lihat undangan/i });
      await expect(kelola).toBeVisible();
      await expect(lihat).toBeVisible();
      await expect(lihat).toHaveAttribute('target', '_blank');
      const hrefKelola = await kelola.getAttribute('href');
      expect(hrefKelola).toMatch(/^\/sites\/\d+$/);
      const hrefPreview = await lihat.getAttribute('href');
      expect(hrefPreview).toMatch(/^\/preview\//);
    } else {
      await expect(page.locator('.empty-state')).toBeVisible();
      await expect(page.locator('.empty-state a[href="/sites/new"]')).toBeVisible();
    }
  });

  test('17 — metode POST ke /dashboard tidak didukung (bukan form login)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const loginResp = await ctx.post('/api/auth/login', {
      data: { email: USER.email, password: USER.password },
    });
    expect(loginResp.status()).toBe(200);
    const postDash = await ctx.post('/dashboard', {
      data: { hack: '1' },
    });
    expect([403, 404, 405]).toContain(postDash.status());
    await ctx.dispose();
  });
});
