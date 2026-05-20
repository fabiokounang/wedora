const { z } = require('zod');
const q = require('../../models/queries');

const rsvpBodySchema = z.object({
  guest_name: z.string().min(1).max(190),
  guest_phone: z.preprocess((v) => {
    if (v == null || v === '') return null;
    const s = String(v).trim().slice(0, 40);
    return s || null;
  }, z.union([z.string().max(40), z.null()])),
  attendance: z.enum(['yes', 'no']),
  guests_count: z.number().int().min(1).max(20).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const wishBodySchema = z.object({
  guest_name: z.string().min(1).max(190),
  message: z.string().min(1).max(2000),
});

function normalizeSlug(raw) {
  try {
    return decodeURIComponent(String(raw || '')).trim().toLowerCase();
  } catch (_) {
    return String(raw || '').trim().toLowerCase();
  }
}

async function createRsvpForSlug(req, res) {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'invalid slug' });

  const parsed = rsvpBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });

  const site = await q.getSiteBySlug(slug);
  if (!site) return res.status(404).json({ error: 'site not found' });
  if (site.status !== 'published') return res.status(403).json({ error: 'site not published' });

  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const rsvp = await q.createRsvp(site.id, {
    guest_name: parsed.data.guest_name,
    guest_phone: parsed.data.guest_phone,
    attendance: parsed.data.attendance,
    guests_count: parsed.data.guests_count || 1,
    notes: parsed.data.notes || null,
    ip,
  });
  res.status(201).json({ rsvp });
}

async function createWishForSlug(req, res) {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'invalid slug' });

  const parsed = wishBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });

  const site = await q.getSiteBySlug(slug);
  if (!site) return res.status(404).json({ error: 'site not found' });
  if (site.status !== 'published') return res.status(403).json({ error: 'site not published' });

  const wish = await q.createWish(site.id, {
    guest_name: parsed.data.guest_name,
    message: parsed.data.message,
  });
  res.status(201).json({ wish });
}

async function listWishesBySlug(req, res) {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'invalid slug' });

  const site = await q.getSiteBySlug(slug);
  if (!site) return res.status(404).json({ error: 'site not found' });
  if (site.status !== 'published') return res.status(403).json({ error: 'site not published' });

  const wishes = await q.listWishes(site.id, { approvedOnly: true, limit: 100 });
  res.json({ wishes });
}

module.exports = { createRsvpForSlug, createWishForSlug, listWishesBySlug };
