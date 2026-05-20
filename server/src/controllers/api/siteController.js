const { z } = require('zod');
const q = require('../../models/queries');
const themeLoader = require('../../services/themeLoader');

const WORKFLOW_NEXT = {
  draft: new Set(['in_review', 'archived']),
  in_review: new Set(['draft', 'approved', 'archived']),
  approved: new Set(['in_review', 'published', 'archived']),
  published: new Set(['approved', 'archived']),
  archived: new Set(['draft']),
};

const createSiteSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  theme_key: z.string().min(1),
  managed_by: z.enum(['self', 'admin']).default('admin'),
  owner_user_id: z.number().int().nullable().optional(),
  custom_domain: z.string().min(3).max(190).optional().nullable(),
});

const patchSiteSchema = z.object({
  theme_key: z.string().optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'published', 'archived']).optional(),
  managed_by: z.enum(['self', 'admin']).optional(),
  custom_domain: z.string().nullable().optional(),
  owner_user_id: z.number().int().nullable().optional(),
});

async function list(req, res) {
  const filter = req.user.role === 'super_admin' ? {} : { owner_user_id: req.user.id };
  const sites = await q.listSites(filter);
  res.json({ sites });
}

function listThemes(_req, res) {
  res.json({ themes: themeLoader.getThemeList() });
}

function getTheme(req, res) {
  try {
    const manifest = themeLoader.getManifest(req.params.key);
    res.json({ manifest });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

async function create(req, res) {
  const parsed = createSiteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  const { slug, theme_key, managed_by, owner_user_id, custom_domain } = parsed.data;

  try {
    themeLoader.getManifest(theme_key);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const existing = await q.getSiteBySlug(slug);
  if (existing) return res.status(409).json({ error: 'slug already used' });

  const site = await q.createSite({
    owner_user_id: owner_user_id || null,
    slug,
    theme_key,
    managed_by,
    status: 'draft',
    custom_domain: custom_domain || null,
  });

  const manifest = themeLoader.getManifest(theme_key);
  const defaults = {};
  for (const f of manifest.content_fields || []) {
    if (f.required) defaults[f.key] = '';
  }
  await q.upsertSiteContent(site.id, defaults, null);

  let order = 1;
  for (const section of manifest.sections || []) {
    await q.upsertSection(site.id, section.key, { enabled: 1, sort_order: order++ });
  }

  await q.logActivity(site.id, req.user.id, 'site.create', { slug, theme_key });
  res.status(201).json({ site });
}

async function detail(req, res) {
  const site = req.site;
  const content = await q.getSiteContent(site.id);
  const sections = await q.getSiteSections(site.id);
  let manifest = null;
  try {
    manifest = themeLoader.getManifest(site.theme_key);
  } catch (_) {}
  res.json({ site, content, sections, manifest });
}

async function update(req, res) {
  const parsed = patchSiteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });

  if (
    req.user.role !== 'super_admin' &&
    (parsed.data.managed_by || parsed.data.owner_user_id || parsed.data.custom_domain || parsed.data.status)
  ) {
    return res.status(403).json({ error: 'forbidden fields for non-admin' });
  }

  if (parsed.data.theme_key) {
    try {
      themeLoader.getManifest(parsed.data.theme_key);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const patch = { ...parsed.data };
  if (patch.status) {
    const allowed = WORKFLOW_NEXT[req.site.status] || new Set();
    if (!allowed.has(patch.status)) {
      return res.status(400).json({ error: `invalid workflow transition ${req.site.status} -> ${patch.status}` });
    }
  }
  if (patch.status === 'published') {
    patch.published_at = new Date();
  } else if (patch.status) {
    patch.published_at = null;
  }
  const site = await q.updateSiteById(req.site.id, patch);
  await q.logActivity(site.id, req.user.id, 'site.update', parsed.data);
  res.json({ site });
}

async function patchContent(req, res) {
  const body = req.body || {};
  if (!body.data || typeof body.data !== 'object') {
    return res.status(400).json({ error: 'data object required' });
  }

  let manifest;
  try {
    manifest = themeLoader.getManifest(req.site.theme_key);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const allowedKeys = new Set((manifest.content_fields || []).map((f) => f.key));
  const clean = {};
  for (const [k, v] of Object.entries(body.data)) {
    if (allowedKeys.has(k)) clean[k] = v;
  }

  for (const f of manifest.content_fields || []) {
    if (f.required && (clean[f.key] == null || clean[f.key] === '')) {
      return res.status(400).json({ error: `required field "${f.key}" is empty` });
    }
  }

  await q.upsertSiteContent(req.site.id, clean, body.theme_overrides);
  await q.logActivity(req.site.id, req.user.id, 'content.update', Object.keys(clean));
  const content = await q.getSiteContent(req.site.id);
  res.json({ content });
}

async function patchSections(req, res) {
  const body = req.body || {};
  if (!Array.isArray(body.sections)) return res.status(400).json({ error: 'sections array required' });
  const out = [];
  for (let i = 0; i < body.sections.length; i++) {
    const s = body.sections[i];
    if (!s || !s.section_key) continue;
    await q.upsertSection(req.site.id, s.section_key, {
      enabled: s.enabled === undefined ? null : (s.enabled ? 1 : 0),
      sort_order: s.sort_order !== undefined ? Number(s.sort_order) : i + 1,
      config: s.config || null,
    });
    out.push(s.section_key);
  }
  const sections = await q.getSiteSections(req.site.id);
  await q.logActivity(req.site.id, req.user.id, 'sections.update', out);
  res.json({ sections });
}

async function listRsvps(req, res) {
  const rsvps = await q.listRsvps(req.site.id);
  res.json({ rsvps });
}

async function listWishes(req, res) {
  const wishes = await q.listWishes(req.site.id, { approvedOnly: false, limit: 500 });
  res.json({ wishes });
}

module.exports = {
  list,
  listThemes,
  getTheme,
  create,
  detail,
  update,
  patchContent,
  patchSections,
  listRsvps,
  listWishes,
};
