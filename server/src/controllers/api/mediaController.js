const q = require('../../models/queries');
const { publicUrlFor } = require('../../services/storage');

async function upload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const media = await q.createMedia(req.site.id, {
    filename: req.file.filename,
    original_name: req.file.originalname,
    mime_type: req.file.mimetype,
    size: req.file.size,
    url: publicUrlFor(req.file.filename),
  });
  await q.logActivity(req.site.id, req.user.id, 'media.upload', { id: media.id });
  res.status(201).json({ media });
}

async function list(req, res) {
  const items = await q.listMediaBySite(req.site.id, 500);
  res.json({ media: items });
}

module.exports = { upload, list };
