const { renderSite } = require('../services/renderer');

async function renderPublicSite(req, res, next) {
  try {
    if (req.routeKind !== 'site' || !req.site) {
      return res.status(404).send('Site not found');
    }
    if (req.site.status === 'archived') {
      return res.status(410).send('This invitation has been archived.');
    }
    const html = await renderSite(req.site, { apiBase: '/api' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
}

module.exports = { renderPublicSite };
