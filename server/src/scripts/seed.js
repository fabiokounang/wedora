require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, one } = require('../db');
const { LIMIT_ONE } = require('../models/sqlColumns');
const themeLoader = require('../services/themeLoader');

async function upsertSuperAdmin() {
  const email = 'admin@wedding.local';
  const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    console.log(`super_admin ${email} already exists (id=${existing.id})`);
    return existing.id;
  }
  const hash = await bcrypt.hash('admin123', 10);
  const res = await query(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)',
    [email, hash, 'Super Admin', 'super_admin']
  );
  console.log(`created super_admin ${email} / admin123 (id=${res.insertId})`);
  return res.insertId;
}

async function ensureDemoSite(ownerId) {
  const slug = 'demo';
  const existing = await one('SELECT id FROM sites WHERE slug = ?', [slug]);
  if (existing) {
    console.log(`demo site already exists (id=${existing.id})`);
    return existing.id;
  }
  const res = await query(
    `INSERT INTO sites (owner_user_id, slug, site_type, theme_key, managed_by, status, published_at)
     VALUES (?,?,?,?,?,?, NOW())`,
    [ownerId, slug, 'invitation', 'theme3', 'admin', 'published']
  );
  const siteId = res.insertId;

  const demoContent = {
    partner_one: 'Elena',
    partner_two: 'Gabriel',
    wedding_date: '2026-09-14T18:00:00',
    hero_quote: 'Two souls, one flame. Everlasting love.',
    story_title: 'Our Journey',
    gift_message: 'Restu dan doa Anda sudah lebih dari cukup. Jika ingin memberi tanda kasih, silakan melalui berikut ini.',
    brand: 'E & G',
    location_short: 'Jakarta',
    venue_ceremony: 'Saint Gabriel Cathedral',
    venue_ceremony_address: 'Jl. Anggrek No. 12, Jakarta',
    venue_reception: 'The Grand Ballroom',
    venue_reception_address: 'Hotel Indonesia Kempinski, Jakarta',
  };

  await query(
    'INSERT INTO site_content (site_id, data) VALUES (?, CAST(? AS JSON))',
    [siteId, JSON.stringify(demoContent)]
  );

  const defaultSections = [
    { key: 'hero', order: 1 },
    { key: 'story', order: 2 },
    { key: 'events', order: 3 },
    { key: 'gallery', order: 4 },
    { key: 'rsvp', order: 5 },
    { key: 'gift', order: 6 },
    { key: 'wishes', order: 7 },
  ];
  for (const s of defaultSections) {
    await query(
      'INSERT INTO site_sections (site_id, section_key, enabled, sort_order) VALUES (?,?,?,?)',
      [siteId, s.key, 1, s.order]
    );
  }

  await query(
    'INSERT INTO story_items (site_id, date_label, title, description, sort_order) VALUES (?,?,?,?,?)',
    [siteId, 'January 2020', 'Pertemuan Pertama', 'Kami bertemu di sebuah acara komunitas musik klasik.', 1]
  );
  await query(
    'INSERT INTO story_items (site_id, date_label, title, description, sort_order) VALUES (?,?,?,?,?)',
    [siteId, 'June 2023', 'Lamaran', 'Di bawah lilin temaram, sebuah janji seumur hidup diikrarkan.', 2]
  );

  await query(
    `INSERT INTO events (site_id, event_type, title, venue_name, address, datetime, map_url, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`,
    [siteId, 'akad', 'Akad Nikah', 'Saint Gabriel Cathedral', 'Jl. Anggrek No. 12, Jakarta', '2026-09-14 10:00:00', 'https://maps.google.com', 1]
  );
  await query(
    `INSERT INTO events (site_id, event_type, title, venue_name, address, datetime, map_url, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`,
    [siteId, 'reception', 'Resepsi', 'The Grand Ballroom', 'Hotel Indonesia Kempinski, Jakarta', '2026-09-14 18:00:00', 'https://maps.google.com', 2]
  );

  const galleryUrls = [
    'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200',
    'https://images.unsplash.com/photo-1606800052052-a08af7148866?w=1200',
    'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200',
    'https://images.unsplash.com/photo-1529636798458-92182e662485?w=1200',
  ];
  for (let i = 0; i < galleryUrls.length; i++) {
    await query(
      'INSERT INTO gallery_items (site_id, image_url, thumbnail_url, sort_order) VALUES (?,?,?,?)',
      [siteId, galleryUrls[i], galleryUrls[i] + '&q=60&w=400', i + 1]
    );
  }

  await query(
    `INSERT INTO gift_accounts (site_id, bank_name, account_name, account_number, sort_order)
     VALUES (?,?,?,?,?)`,
    [siteId, 'BCA', 'Elena Putri', '1234567890', 1]
  );

  console.log(`created demo site slug=${slug} (id=${siteId})`);
  return siteId;
}

function buildDemoContentForManifest(manifest) {
  const samples = {
    partner_one: 'Alex',
    partner_two: 'Jordan',
    wedding_date: '2026-09-14T18:00:00',
    story_title: 'Our journey',
    hero_tagline: 'Together & forever',
    hero_quote: 'Love is composed of a single soul inhabiting two bodies.',
    gift_message: 'Your presence is our greatest gift.',
    footer_message: 'Thank you for celebrating with us.',
    how_we_met_text:
      'A chance meeting that turned into forever. This is a sample story — replace it in the admin content tab.',
    proposal_text:
      'Under the stars, a question and a joyful yes. Replace this text with your own story in the admin panel.',
    closing_message: "We can't wait to celebrate with you.",
  };
  const data = {};
  for (const f of manifest.content_fields || []) {
    const k = f.key;
    if (Object.prototype.hasOwnProperty.call(samples, k)) {
      data[k] = samples[k];
      continue;
    }
    if (f.type === 'datetime') data[k] = '2026-09-14T18:00:00';
    else if (f.type === 'textarea') data[k] = `Sample text for ${f.label || k}.`;
    else if (f.type === 'color') data[k] = '#c4a874';
    else data[k] = `Sample ${k}`;
  }
  return data;
}

async function insertSharedDemoCollections(siteId) {
  await query(
    'INSERT INTO story_items (site_id, date_label, title, description, sort_order) VALUES (?,?,?,?,?)',
    [siteId, 'January 2020', 'First meeting', 'We met at a community gathering.', 1]
  );
  await query(
    'INSERT INTO story_items (site_id, date_label, title, description, sort_order) VALUES (?,?,?,?,?)',
    [siteId, 'June 2023', 'Engagement', 'A promise for a lifetime together.', 2]
  );

  await query(
    `INSERT INTO events (site_id, event_type, title, venue_name, address, datetime, map_url, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`,
    [siteId, 'akad', 'Ceremony', 'Sample Venue', 'Jl. Contoh No. 1', '2026-09-14 10:00:00', 'https://maps.google.com', 1]
  );
  await query(
    `INSERT INTO events (site_id, event_type, title, venue_name, address, datetime, map_url, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`,
    [siteId, 'reception', 'Reception', 'Grand Hall', 'Jl. Contoh No. 2', '2026-09-14 18:00:00', 'https://maps.google.com', 2]
  );

  const galleryUrls = [
    'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200',
    'https://images.unsplash.com/photo-1606800052052-a08af7148866?w=1200',
    'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200',
    'https://images.unsplash.com/photo-1529636798458-92182e662485?w=1200',
  ];
  for (let i = 0; i < galleryUrls.length; i++) {
    await query(
      'INSERT INTO gallery_items (site_id, image_url, thumbnail_url, sort_order) VALUES (?,?,?,?)',
      [siteId, galleryUrls[i], `${galleryUrls[i]}&q=60&w=400`, i + 1]
    );
  }

  await query(
    `INSERT INTO gift_accounts (site_id, bank_name, account_name, account_number, sort_order)
     VALUES (?,?,?,?,?)`,
    [siteId, 'BCA', 'Alex Jordan', '1234567890', 1]
  );
}

/** Owner for seeded/lazy preview sites: prefer existing super_admin, else bootstrap admin user. */
async function resolvePreviewSitesOwnerId() {
  const row = await one("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT ?", [LIMIT_ONE]);
  if (row) return row.id;
  return upsertSuperAdmin();
}

/**
 * Creates slug preview-{themeKey} + demo rows if missing. Used by seed/sync and lazy-first-hit from public demo links.
 * @returns {Promise<number|null>} site id or null if theme invalid
 */
async function ensureSinglePreviewSite(ownerId, themeKey) {
  const slug = `preview-${themeKey}`;
  const existing = await one('SELECT id FROM sites WHERE slug = ?', [slug]);
  if (existing) return existing.id;

  let manifest;
  try {
    manifest = themeLoader.getManifest(themeKey);
  } catch (e) {
    console.warn(`ensureSinglePreviewSite skip ${slug}:`, e.message);
    return null;
  }

  const res = await query(
    `INSERT INTO sites (owner_user_id, slug, site_type, theme_key, managed_by, status, published_at)
     VALUES (?,?,?,?,?,?, NOW())`,
    [ownerId, slug, 'theme_catalog', themeKey, 'admin', 'published']
  );
  const siteId = res.insertId;

  const demoContent = buildDemoContentForManifest(manifest);
  await query('INSERT INTO site_content (site_id, data) VALUES (?, CAST(? AS JSON))', [siteId, JSON.stringify(demoContent)]);

  let order = 1;
  for (const section of manifest.sections || []) {
    await query(
      'INSERT INTO site_sections (site_id, section_key, enabled, sort_order) VALUES (?,?,?,?)',
      [siteId, section.key, 1, order++]
    );
  }

  await insertSharedDemoCollections(siteId);
  console.log(`created preview site slug=${slug} theme=${themeKey} (id=${siteId})`);
  return siteId;
}

/** One published site per theme: slug preview-{themeKey} — used for public /theme-gallery demos (?site=preview-theme1). */
async function ensureThemePreviewSites(ownerId) {
  const list = themeLoader.getThemeList();
  for (const t of list) {
    if (t.broken) continue;
    const slug = `preview-${t.key}`;
    const existing = await one('SELECT id FROM sites WHERE slug = ?', [slug]);
    if (existing) {
      console.log(`preview site ${slug} already exists (id=${existing.id})`);
      continue;
    }
    await ensureSinglePreviewSite(ownerId, t.key);
  }
}

/**
 * One invitation site per theme with slug = theme key (e.g. theme7, theme8) — same demo data as preview-*.
 * Skips if a site with that slug already exists (any type).
 */
async function ensureThemeSlugInvitationSites(ownerId) {
  const list = themeLoader.getThemeList();
  for (const t of list) {
    if (t.broken) continue;
    const themeKey = t.key;
    const slug = themeKey;
    const existing = await one('SELECT id FROM sites WHERE slug = ?', [slug]);
    if (existing) {
      console.log(`invitation site slug=${slug} already exists (id=${existing.id})`);
      continue;
    }

    let manifest;
    try {
      manifest = themeLoader.getManifest(themeKey);
    } catch (e) {
      console.warn(`skip invitation ${slug}:`, e.message);
      continue;
    }

    const res = await query(
      `INSERT INTO sites (owner_user_id, slug, site_type, theme_key, managed_by, status, published_at)
       VALUES (?,?,?,?,?,?, NOW())`,
      [ownerId, slug, 'invitation', themeKey, 'admin', 'published']
    );
    const siteId = res.insertId;

    const demoContent = buildDemoContentForManifest(manifest);
    await query('INSERT INTO site_content (site_id, data) VALUES (?, CAST(? AS JSON))', [siteId, JSON.stringify(demoContent)]);

    let order = 1;
    for (const section of manifest.sections || []) {
      await query(
        'INSERT INTO site_sections (site_id, section_key, enabled, sort_order) VALUES (?,?,?,?)',
        [siteId, section.key, 1, order++]
      );
    }

    await insertSharedDemoCollections(siteId);
    console.log(`created invitation site slug=${slug} theme=${themeKey} (id=${siteId})`);
  }
}

async function run() {
  const ownerId = await upsertSuperAdmin();
  await ensureDemoSite(ownerId);
  await ensureThemePreviewSites(ownerId);
  await ensureThemeSlugInvitationSites(ownerId);
  console.log('seed done.');
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  upsertSuperAdmin,
  resolvePreviewSitesOwnerId,
  ensureSinglePreviewSite,
  ensureThemePreviewSites,
  ensureThemeSlugInvitationSites,
  run,
};
