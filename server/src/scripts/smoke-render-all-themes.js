/**
 * Render setiap template.ejs dengan data dummy lengkap dari manifest (sections + collections).
 * Tanpa DB — memastikan tidak ada error EJS runtime.
 *
 * Usage: node src/scripts/smoke-render-all-themes.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const themeLoader = require('../services/themeLoader');
const { helpers } = require('../services/renderer.js');

function walkEjsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkEjsFiles(p, acc);
    else if (ent.name.endsWith('.ejs')) acc.push(p);
  }
  return acc;
}

function buildContentFromManifest(manifest) {
  const c = {};
  for (const f of manifest.content_fields || []) {
    const k = f.key;
    const t = f.type || 'text';
    if (t === 'datetime') c[k] = '2026-09-20 14:30:00';
    else if (t === 'textarea') {
      c[k] =
        k.includes('html') || k.endsWith('_html')
          ? '<p>Contoh isi <strong>' +
            k +
            '</strong> — paragraf untuk uji render.</p>'
          : 'Contoh teks untuk ' + k + '.';
    } else if (t === 'color') c[k] = '#C4967A';
    else c[k] = 'Contoh ' + k;
  }
  if (c.partner_one == null) c.partner_one = 'Mempelai A';
  if (c.partner_two == null) c.partner_two = 'Mempelai B';
  if (c.wedding_date == null) c.wedding_date = '2026-09-20 14:30:00';
  return c;
}

function buildSections(manifest) {
  const rows = [];
  let order = 1;
  for (const s of manifest.sections || []) {
    rows.push({ section_key: s.key, enabled: 1, sort_order: order++ });
  }
  return rows;
}

function minimalStory() {
  return [
    {
      date_label: '2021',
      title: 'Bertemu',
      description: '<p>Cerita singkat untuk smoke test.</p>',
      sort_order: 0,
    },
  ];
}

function minimalEvents() {
  return [
    {
      id: 1,
      event_type: 'resepsi',
      title: 'Resepsi',
      venue_name: 'Gedung Smoke',
      address: 'Jl. Contoh No. 1',
      datetime: '2026-09-20 15:00:00',
      map_url: 'https://www.google.com/maps/embed?pb=smoke',
      notes: null,
      sort_order: 0,
    },
  ];
}

function minimalGallery() {
  return [
    {
      image_url: 'https://placehold.co/400x400/e8e8e8/666?text=Photo',
      thumbnail_url: '',
      caption: 'Smoke',
      sort_order: 0,
    },
  ];
}

function minimalGifts() {
  return [
    {
      id: 1,
      bank_name: 'BCA',
      account_number: '1234567890',
      account_name: 'Nama Rekening',
      qr_image_url: null,
      sort_order: 0,
    },
  ];
}

function minimalWishes() {
  return [
    {
      id: 1,
      guest_name: 'Tamu',
      message: 'Selamat menempuh hidup baru!',
      created_at: new Date().toISOString(),
    },
  ];
}

async function renderTheme(themeKey, themesRoot) {
  const manifestPath = path.join(themesRoot, themeKey, 'theme.json');
  const tplPath = path.join(themesRoot, themeKey, 'template.ejs');
  if (!fs.existsSync(tplPath)) throw new Error('no template.ejs');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const content = buildContentFromManifest(manifest);
  const sections = buildSections(manifest);

  const needed = new Set();
  for (const s of manifest.sections || []) {
    if (s.collection) needed.add(s.collection);
  }

  const data = {
    site: {
      id: 999,
      slug: 'smoke-' + themeKey,
      music_enabled: needed.has('gift') ? 0 : 0,
      music_url: null,
      music_autoplay: 0,
    },
    content,
    overrides: {},
    sections,
    manifest,
    helpers,
    apiBase: '/api',
    story: needed.has('story_items') ? minimalStory() : [],
    events: needed.has('events') ? minimalEvents() : [],
    gallery: needed.has('gallery_items') ? minimalGallery() : [],
    gifts: needed.has('gift_accounts') ? minimalGifts() : [],
    wishes: minimalWishes(),
  };

  const html = await ejs.renderFile(tplPath, data, { async: false });
  return html.length;
}

async function main() {
  const roots = themeLoader.THEMES_ROOTS || [];
  const themesRoot = roots.find((r) => fs.existsSync(r)) || path.resolve(__dirname, '../../../themes');

  const dirs = fs
    .readdirSync(themesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(themesRoot, name, 'theme.json')))
    .sort();

  let failed = false;
  for (const key of dirs) {
    try {
      const len = await renderTheme(key, themesRoot);
      console.log('[' + key + '] OK — rendered', len, 'chars');
    } catch (e) {
      failed = true;
      console.error('[' + key + '] FAIL:', e.message);
      if (e.stack) console.error(e.stack.split('\n').slice(0, 8).join('\n'));
    }
  }

  if (failed) {
    console.error('\nsmoke-render-all-themes: FAILED');
    process.exit(1);
  }
  console.log('\nsmoke-render-all-themes: PASSED (' + dirs.length + ' themes)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
