/**
 * Creates/updates nothing by ID — only inserts `sites` rows for themes that exist
 * on disk (theme.json + template.ejs) but are missing a `preview-{themeKey}` catalog site.
 * Safe to run repeatedly.
 */
require('dotenv').config();
const { upsertSuperAdmin, ensureThemePreviewSites } = require('./seed');

async function main() {
  const ownerId = await upsertSuperAdmin();
  await ensureThemePreviewSites(ownerId);
  console.log('sync theme previews done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
