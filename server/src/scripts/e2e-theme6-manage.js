/**
 * E2E smoke: login → site baru theme6 → isi content, sections, koleksi, gift+QR PNG, settings.
 * Jalankan server dulu: npm start  (default http://127.0.0.1:3000)
 * Usage: node src/scripts/e2e-theme6-manage.js [--base http://127.0.0.1:3000]
 */
require('dotenv').config();
const path = require('path');

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].replace(/\/$/, '');
  return process.env.E2E_BASE || 'http://127.0.0.1:3000';
})();

const EMAIL = process.env.E2E_EMAIL || 'admin@wedding.local';
const PASSWORD = process.env.E2E_PASSWORD || 'admin123';

/** 1×1 transparent PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function parseSetCookieHeader(setCookie) {
  if (!setCookie) return {};
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  const out = {};
  for (const h of headers) {
    const first = String(h).split(';')[0].trim();
    const eq = first.indexOf('=');
    if (eq > 0) out[first.slice(0, eq)] = first.slice(eq + 1);
  }
  return out;
}

function mergeCookieJar(jar, setCookie) {
  const merged = {};
  for (const part of String(jar || '').split(';')) {
    const p = part.trim();
    const eq = p.indexOf('=');
    if (eq > 0) merged[p.slice(0, eq)] = p.slice(eq + 1);
  }
  Object.assign(merged, parseSetCookieHeader(setCookie));
  return Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function csrfFromJar(jar) {
  const m = jar && jar.match(/_csrf_tok=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function withCsrf(params, jar) {
  const csrf = csrfFromJar(jar);
  if (csrf) params.set('_csrf', csrf);
  return params;
}

async function fetchWithCookie(url, options = {}, jar) {
  const headers = { ...options.headers };
  if (jar) headers.Cookie = jar;
  const res = await fetch(url, { ...options, headers, redirect: 'manual' });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie');
  const next = mergeCookieJar(jar, sc);
  return { res, jar: next };
}

async function login() {
  let jar = '';
  const pre = await fetchWithCookie(`${BASE}/login`, { method: 'GET' }, jar);
  jar = pre.jar;
  const body = withCsrf(new URLSearchParams({ email: EMAIL, password: PASSWORD }), jar);
  const { res, jar: j } = await fetchWithCookie(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`login expected redirect, got ${res.status}: ${t.slice(0, 200)}`);
  }
  return j;
}

function siteIdFromLocation(loc) {
  const m = loc && loc.match(/\/sites\/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function createSiteTheme6(jar) {
  const warm = await fetchWithCookie(`${BASE}/sites/new`, { method: 'GET' }, jar);
  jar = warm.jar || jar;
  const slug = `e2e-t6-${Date.now()}`;
  const body = withCsrf(
    new URLSearchParams({
      slug,
      theme_key: 'theme6',
    }),
    jar
  );
  const { res, jar: j } = await fetchWithCookie(`${BASE}/sites/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  const loc = res.headers.get('location') || '';
  const id = siteIdFromLocation(loc);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`create site expected redirect, got ${res.status}: ${t.slice(0, 300)}`);
  }
  if (!id) throw new Error(`no site id in Location: ${loc}`);
  return { siteId: id, slug, jar: j || jar };
}

async function postContent(jar, siteId) {
  const fields = {
    partner_one: 'E2E Mempelai A',
    partner_two: 'E2E Mempelai B',
    wedding_date: '2026-12-31T15:00',
    hero_tagline: 'E2E tagline',
    hero_message: 'E2E pesan hero panjang sedikit.',
    story_title: 'E2E Judul Story',
    story_subtitle: 'E2E Subtitle',
    events_subtitle: 'E2E Events subtitle',
    gift_message: 'E2E Pesan gift untuk tamu.',
  };
  const body = withCsrf(new URLSearchParams(fields), jar);
  const { res } = await fetchWithCookie(`${BASE}/sites/${siteId}/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`content ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function postSections(jar, siteId) {
  const keys = ['hero', 'story', 'events', 'rsvp', 'gallery', 'gift', 'wishes'];
  const body = new URLSearchParams();
  keys.forEach((k, i) => {
    body.append(`enabled_${k}`, 'on');
    body.append(`sort_order_${k}`, String(i + 1));
  });
  withCsrf(body, jar);
  const { res } = await fetchWithCookie(`${BASE}/sites/${siteId}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`sections ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function postStoryItem(jar, siteId) {
  const body = withCsrf(
    new URLSearchParams({
      date_label: '2020',
      title: 'E2E Story milestone',
      description: 'Kami bertemu di uji E2E.',
      sort_order: '1',
    }),
    jar
  );
  const { res } = await fetchWithCookie(`${BASE}/sites/${siteId}/collections/story_items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`story_items ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function postEvent(jar, siteId) {
  const body = withCsrf(
    new URLSearchParams({
      event_type: 'resepsi',
      title: 'E2E Resepsi',
      venue_name: 'Gedung E2E',
      address: 'Jl. Test No 1',
      datetime: '2026-12-31T16:00',
      map_url: 'https://maps.google.com',
      notes: 'E2E notes',
      sort_order: '1',
    }),
    jar
  );
  const { res } = await fetchWithCookie(`${BASE}/sites/${siteId}/collections/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`events ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function postGallery(jar, siteId) {
  const body = withCsrf(
    new URLSearchParams({
      image_url: 'https://example.com/e2e-gallery.jpg',
      thumbnail_url: '',
      caption: 'E2E foto',
      sort_order: '1',
    }),
    jar
  );
  const { res } = await fetchWithCookie(`${BASE}/sites/${siteId}/collections/gallery_items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`gallery_items ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function postGiftWithQr(jar, siteId) {
  const fd = new FormData();
  fd.append('bank_name', 'BCA E2E');
  fd.append('account_name', 'E2E Nama');
  fd.append('account_number', '889900112233');
  fd.append('sort_order', '0');
  fd.append('qr_image_url', '');
  const csrf = csrfFromJar(jar);
  if (csrf) fd.append('_csrf', csrf);
  const blob = new Blob([PNG_1X1], { type: 'image/png' });
  fd.append('qr_image_file', blob, 'qr-e2e.png');

  const giftUrl = csrf
    ? `${BASE}/sites/${siteId}/collections/gift_accounts?_csrf=${encodeURIComponent(csrf)}`
    : `${BASE}/sites/${siteId}/collections/gift_accounts`;
  const { res } = await fetchWithCookie(giftUrl, {
    method: 'POST',
    body: fd,
  }, jar);

  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`gift_accounts create ${res.status}: ${t.slice(0, 500)}`);
  }
}

async function postSettings(jar, siteId) {
  const fd = new FormData();
  fd.append('theme_key', 'theme6');
  fd.append('music_enabled', '');
  fd.append('music_url', '');
  fd.append('music_start', 'tap');
  const csrf = csrfFromJar(jar);
  if (csrf) fd.append('_csrf', csrf);
  const settingsUrl = csrf
    ? `${BASE}/sites/${siteId}/settings?_csrf=${encodeURIComponent(csrf)}`
    : `${BASE}/sites/${siteId}/settings`;
  const { res } = await fetchWithCookie(settingsUrl, {
    method: 'POST',
    body: fd,
  }, jar);
  if (res.status !== 302 && res.status !== 303) {
    const t = await res.text();
    throw new Error(`settings ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function verifyGiftQrInDb(siteId) {
  const { query } = require('../db');
  const { LIMIT_ONE } = require('../models/sqlColumns');
  const rows = await query(
    'SELECT id, qr_image_url FROM gift_accounts WHERE site_id = ? ORDER BY id DESC LIMIT ?',
    [siteId, LIMIT_ONE]
  );
  const row = rows[0];
  if (!row) throw new Error('no gift_accounts row');
  if (!row.qr_image_url || !String(row.qr_image_url).startsWith('/uploads/')) {
    throw new Error(`qr_image_url not set or not /uploads/: ${row.qr_image_url}`);
  }
  return row.qr_image_url;
}

async function main() {
  console.log('E2E theme6 manage — base:', BASE);
  let jar = await login();
  console.log('OK login');

  const created = await createSiteTheme6(jar);
  jar = created.jar || jar;
  const { siteId, slug } = created;
  console.log('OK create site', siteId, slug);

  await postContent(jar, siteId);
  console.log('OK content');

  await postSections(jar, siteId);
  console.log('OK sections');

  await postStoryItem(jar, siteId);
  console.log('OK story_items');

  await postEvent(jar, siteId);
  console.log('OK events');

  await postGallery(jar, siteId);
  console.log('OK gallery_items');

  await postGiftWithQr(jar, siteId);
  console.log('OK gift_accounts + QR upload');

  await postSettings(jar, siteId);
  console.log('OK settings');

  const urlPath = await verifyGiftQrInDb(siteId);
  console.log('OK DB qr_image_url:', urlPath);

  const pngUrl = `${BASE}${urlPath}`;
  const imgRes = await fetch(pngUrl, { redirect: 'manual' });
  if (imgRes.status !== 200) {
    throw new Error(`public upload URL not 200: ${pngUrl} → ${imgRes.status}`);
  }
  console.log('OK GET uploaded file:', pngUrl);

  console.log('\n=== E2E PASSED ===');
  console.log('Site id:', siteId, 'slug:', slug);
}

main().catch((err) => {
  console.error('\n=== E2E FAILED ===');
  console.error(err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
