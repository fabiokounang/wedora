/**
 * Ensures (1) preview-{key} catalog sites and (2) invitation sites slug = theme key
 * for every valid theme on disk. Idempotent.
 */
require('dotenv').config();
const {
  upsertSuperAdmin,
  ensureThemePreviewSites,
  ensureThemeSlugInvitationSites,
} = require('./seed');

async function main() {
  const ownerId = await upsertSuperAdmin();
  await ensureThemePreviewSites(ownerId);
  await ensureThemeSlugInvitationSites(ownerId);
  console.log('sync themes (preview + slug invites) done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
