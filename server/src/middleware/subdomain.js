const q = require('../models/queries');

const RESERVED_SUBDOMAINS = new Set(['admin', 'api', 'www', '']);

/** Hostname saja, lowercase, tanpa port (dukung IPv6 [addr]:port). */
function hostNoPort(hostHeader) {
  if (!hostHeader || typeof hostHeader !== 'string') return '';
  const s = hostHeader.trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end > 1) return s.slice(1, end);
    return s;
  }
  const colon = s.lastIndexOf(':');
  if (colon > 0) {
    const tail = s.slice(colon + 1);
    if (/^\d+$/.test(tail)) return s.slice(0, colon);
  }
  return s;
}

function parseHost(hostHeader, baseDomain) {
  const base = hostNoPort(baseDomain || 'localhost');
  if (!hostHeader) return { host: '', subdomain: '', baseHost: base };

  const host = hostNoPort(hostHeader);
  const localLoopbacks = new Set(['127.0.0.1', '::1']);
  const isMainDevHost =
    host === base ||
    host === `www.${base}` ||
    (base === 'localhost' && localLoopbacks.has(host));

  if (isMainDevHost) {
    return { host, subdomain: '', baseHost: base };
  }
  if (host.endsWith('.' + base)) {
    const sub = host.slice(0, -1 - base.length);
    return { host, subdomain: sub, baseHost: base };
  }
  return { host, subdomain: '', baseHost: base, custom: true };
}

/**
 * Attach one of:
 *  - req.routeKind = 'landing' | 'admin' | 'api' | 'site' | 'unknown'
 *  - req.site      = site row (only when routeKind === 'site')
 *
 * Resolution via hostname subdomain, with dev fallback:
 *  - ?site=<slug>   (force rendering a specific site in dev)
 *  - ?panel=admin   (force admin panel in dev)
 */
async function resolveHost(req, res, next) {
  const baseDomain = process.env.BASE_DOMAIN || 'localhost:3000';

  try {
    const { subdomain, host, custom } = parseHost(req.headers.host, baseDomain);
    req.hostInfo = { subdomain, host, baseDomain };

    const devPanel = req.query && req.query.panel;
    const devSite = req.query && req.query.site;

    if (devPanel === 'admin' || subdomain === 'admin') {
      req.routeKind = 'admin';
      return next();
    }
    if (devPanel === 'api' || subdomain === 'api') {
      req.routeKind = 'api';
      return next();
    }

    let slug = null;
    if (devSite) {
      slug = String(devSite).toLowerCase();
    } else if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      slug = subdomain;
    } else if (custom) {
      const bySite = await q.getSiteByCustomDomain(host);
      if (bySite) {
        req.site = bySite;
        req.routeKind = 'site';
        return next();
      }
    }

    if (slug) {
      let site = await q.getSiteBySlug(slug);
      if (site) {
        req.site = site;
        req.routeKind = 'site';
        return next();
      }
      /**
       * Katalog tema lists themes from disk; demo links use ?site=preview-{key}. If seed/sync never ran for a new theme,
       * create the preview row on first request so "Open live demo" works without manual DB steps.
       */
      if (slug.startsWith('preview-')) {
        const themeKey = slug.slice('preview-'.length);
        if (themeKey && /^[a-z0-9_-]+$/i.test(themeKey)) {
          try {
            const seed = require('../scripts/seed');
            const ownerId = await seed.resolvePreviewSitesOwnerId();
            await seed.ensureSinglePreviewSite(ownerId, themeKey);
            site = await q.getSiteBySlug(slug);
            if (site) {
              req.site = site;
              req.routeKind = 'site';
              return next();
            }
          } catch (err) {
            console.error('[resolveHost] lazy preview site:', err.message || err);
          }
        }
      }
      req.routeKind = 'unknown';
      return next();
    }

    req.routeKind = 'landing';
    return next();
  } catch (err) {
    console.error('[resolveHost]', err.message || err);
    req.hostInfo = { subdomain: '', host: '', baseDomain };
    req.routeKind = 'landing';
    return next();
  }
}

module.exports = { resolveHost, parseHost, hostNoPort };
