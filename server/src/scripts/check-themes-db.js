/**
 * Compare themes on disk vs DB: preview-* catalog sites and invitation slug = theme key (read-only).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const themeLoader = require('../services/themeLoader');
const { query } = require('../db');

function dirsWithManifest(themesRoot) {
  if (!fs.existsSync(themesRoot)) return [];
  return fs
    .readdirSync(themesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(themesRoot, name, 'theme.json')))
    .sort();
}

async function main() {
  const roots = themeLoader.THEMES_ROOTS || [];
  const themesRoot = roots.find((r) => fs.existsSync(r)) || path.resolve(__dirname, '../../../themes');
  const onDisk = dirsWithManifest(themesRoot);
  const loaded = themeLoader.getThemeList().filter((t) => !t.broken);

  const rows = await query(
    "SELECT id, slug, theme_key, site_type FROM sites WHERE slug LIKE 'preview-%' ORDER BY slug"
  );

  const previewSlugs = new Set(rows.map((r) => r.slug));
  const keysInDb = new Set(rows.map((r) => r.theme_key));

  console.log('THEMES_DIR (resolved):', themeLoader.THEMES_DIR);
  console.log('Folders with theme.json:', onDisk.join(', ') || '(none)');
  console.log('themeLoader.getThemeList() keys:', loaded.map((t) => t.key).join(', ') || '(none)');
  console.log('');
  console.log('DB preview-* sites (' + rows.length + '):');
  rows.forEach((r) => console.log(' ', r.slug, '→ theme_key=', r.theme_key, 'id=', r.id));

  const expectedSlugs = loaded.map((t) => `preview-${t.key}`);
  const missingInDb = expectedSlugs.filter((s) => !previewSlugs.has(s));
  const extraInDb = rows.filter((r) => !expectedSlugs.includes(r.slug));

  console.log('');
  if (missingInDb.length) console.log('MISSING in DB (run npm run sync-theme-previews):', missingInDb.join(', '));
  else console.log('MISSING in DB: (none)');
  if (extraInDb.length) console.log('EXTRA in DB (slug not in current theme list):', extraInDb.map((r) => r.slug).join(', '));
  else console.log('EXTRA in DB: (none)');

  const expectedInviteSlugs = loaded.map((t) => t.key);
  let inviteRows = [];
  if (expectedInviteSlugs.length) {
    const ph = expectedInviteSlugs.map(() => '?').join(',');
    inviteRows = await query(
      `SELECT id, slug, theme_key, site_type FROM sites WHERE slug IN (${ph})`,
      expectedInviteSlugs
    );
  }
  const inviteBySlug = new Set(inviteRows.map((r) => r.slug));
  console.log('');
  console.log('DB invitation sites slug=theme key (' + inviteRows.length + ' of ' + expectedInviteSlugs.length + '):');
  inviteRows.forEach((r) => console.log(' ', r.slug, '→', r.theme_key, r.site_type, 'id=', r.id));
  const missingInvite = expectedInviteSlugs.filter((s) => !inviteBySlug.has(s));
  if (missingInvite.length) {
    console.log('MISSING invitation slug:', missingInvite.join(', '), '→ run: npm run sync-themes');
  } else {
    console.log('MISSING invitation slug: (none)');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
