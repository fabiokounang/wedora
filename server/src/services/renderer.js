const ejs = require('ejs');
const themeLoader = require('./themeLoader');
const q = require('../models/queries');

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(v) {
  const d = toDate(v);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(v) {
  const d = toDate(v);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)} · ${hh}:${mm}`;
}

const helpers = { formatDate, formatDateTime, toDate };

const COLLECTION_BY_SECTION = {
  story: 'story_items',
  events: 'events',
  gallery: 'gallery_items',
  gift: 'gift_accounts',
};

async function renderSite(site, { apiBase = '/api' } = {}) {
  const manifest = themeLoader.getManifest(site.theme_key);
  const contentRow = await q.getSiteContent(site.id);
  const sections = await q.getSiteSections(site.id);

  const perCollection = {};
  const needed = new Set();
  for (const s of manifest.sections || []) {
    if (s.collection) needed.add(s.collection);
  }
  for (const table of needed) {
    perCollection[table] = await q.listCollection(table, site.id);
  }

  const wishes = await q.listWishes(site.id, { approvedOnly: true, limit: 100 });

  const data = {
    site,
    content: contentRow.data || {},
    overrides: contentRow.theme_overrides || {},
    sections,
    manifest,
    helpers,
    apiBase,
    story: perCollection.story_items || [],
    events: perCollection.events || [],
    gallery: perCollection.gallery_items || [],
    gifts: perCollection.gift_accounts || [],
    wishes,
  };

  const templatePath = themeLoader.getTemplatePath(site.theme_key);
  // Do not pass `async: true` here: with async EJS, `include()` can yield Promises that
  // stringify to "[object Promise]" unless every include is awaited in-template.
  return ejs.renderFile(templatePath, data);
}

module.exports = { renderSite, helpers, COLLECTION_BY_SECTION };
