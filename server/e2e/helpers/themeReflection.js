const { expect } = require('@playwright/test');
const { themeLoader } = require('./themeKeys');

/** Field disimpan di DB tetapi tidak ditampilkan sebagai teks di HTML (flag / perilaku). */
const SKIP_HTML_TEXT_KEYS = new Set(['keep_hero_visible_after_open']);

/**
 * Semua tema yang diharapkan ada di repo.
 * Tidak kontinu — theme9 tidak ada.
 */
function getExpectedThemeKeys() {
  const ranges = [
    [1, 8],   // theme1–8 (skip 9)
    [10, 21], // theme10–21
  ];
  const keys = [];
  for (const [lo, hi] of ranges) {
    for (let n = lo; n <= hi; n += 1) keys.push(`theme${n}`);
  }
  return keys;
}

/** @deprecated use getExpectedThemeKeys */
function getExpectedThemeKeysTheme1To16() {
  return getExpectedThemeKeys();
}

function sampleContentValue(field, themeKey, ts) {
  const tag = `REFL-${themeKey}-${field.key}-${ts}`;
  if (field.type === 'datetime') return '2026-12-31T15:00';
  if (field.type === 'textarea') return `${tag} — paragraf uji tampil di undangan.`;
  return tag;
}

function buildFullContentData(manifest, themeKey, ts) {
  const data = {};
  for (const f of manifest.content_fields || []) {
    data[f.key] = sampleContentValue(f, themeKey, ts);
  }
  return data;
}

function buildSectionsPayload(manifest) {
  return (manifest.sections || []).map((s, i) => ({
    section_key: s.key,
    enabled: true,
    sort_order: i + 1,
  }));
}

/**
 * @returns {Promise<{ storyTitle?: string, eventTitle?: string, eventVenue?: string, galleryCaption?: string, giftBank?: string, giftAccountName?: string }>}
 */
async function seedCollectionsForTheme(api, siteId, themeKey, ts) {
  const manifest = themeLoader.getManifest(themeKey);
  const collections = new Set();
  for (const s of manifest.sections || []) {
    if (s.collection) collections.add(s.collection);
  }

  const markers = {};

  if (collections.has('story_items')) {
    const title = `REFL-STORY-${themeKey}-${ts}`;
    const res = await api.post(`/api/sites/${siteId}/collections/story_items`, {
      data: {
        date_label: '2020',
        title,
        description: `Deskripsi ${title} untuk undangan.`,
        sort_order: 1,
      },
    });
    if (!res.ok()) throw new Error(`story_items create ${res.status()}: ${await res.text()}`);
    markers.storyTitle = title;
    markers.storyDescription = `Deskripsi ${title} untuk undangan.`;
  }

  if (collections.has('events')) {
    const title = `REFL-EVENT-${themeKey}-${ts}`;
    const eventType = `REFL-TYPE-${themeKey}-${ts}`;
    const venue = `Gedung REFL ${themeKey}`;
    const res = await api.post(`/api/sites/${siteId}/collections/events`, {
      data: {
        event_type: eventType,
        title,
        venue_name: venue,
        address: 'Jl. Refleksi 1',
        datetime: '2026-12-31T16:00',
        map_url: 'https://maps.example.com/refl',
        notes: `Catatan ${title}`,
        sort_order: 1,
      },
    });
    if (!res.ok()) throw new Error(`events create ${res.status()}: ${await res.text()}`);
    markers.eventTitle = title;
    markers.eventType = eventType;
    markers.eventVenue = venue;
  }

  if (collections.has('gallery_items')) {
    const caption = `REFL-GAL-${themeKey}-${ts}`;
    const img = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800';
    const res = await api.post(`/api/sites/${siteId}/collections/gallery_items`, {
      data: {
        image_url: img,
        thumbnail_url: `${img}&w=400`,
        caption,
        sort_order: 1,
      },
    });
    if (!res.ok()) throw new Error(`gallery_items create ${res.status()}: ${await res.text()}`);
    markers.galleryCaption = caption;
    markers.galleryImageUrl = img;
  }

  if (collections.has('gift_accounts')) {
    const bank = `Bank REFL ${themeKey}`;
    const accountName = `Nama Rek REFL ${ts}`;
    const res = await api.post(`/api/sites/${siteId}/collections/gift_accounts`, {
      data: {
        bank_name: bank,
        account_name: accountName,
        account_number: '1234567890123',
        qr_image_url: '',
        sort_order: 0,
      },
    });
    if (!res.ok()) throw new Error(`gift_accounts create ${res.status()}: ${await res.text()}`);
    markers.giftBank = bank;
    markers.giftAccountName = accountName;
  }

  return markers;
}

/**
 * Beberapa field hanya dipakai jika koleksi kosong; jika kita seed story_items, assert deskripsi timeline.
 */
function resolveHtmlNeedleForField(field, contentData, collectionMarkers) {
  if (field.key === 'couple_story' && collectionMarkers.storyDescription) {
    return String(collectionMarkers.storyDescription).trim();
  }
  return String(contentData[field.key] ?? '').trim();
}

function assertContentFieldsInHtml(html, manifest, contentData, collectionMarkers = {}) {
  for (const f of manifest.content_fields || []) {
    if (SKIP_HTML_TEXT_KEYS.has(f.key)) continue;

    const resolved = resolveHtmlNeedleForField(f, contentData, collectionMarkers);
    if (!resolved && f.type !== 'datetime') continue;

    if (f.type === 'datetime') {
      const raw = contentData[f.key];
      if (raw == null || raw === '') continue;
      expect(html, `datetime ${f.key} di HTML`).toMatch(/2026/);
      expect(html, `datetime ${f.key} bulan`).toMatch(/Desember/i);
      expect(html, `datetime ${f.key} tanggal`).toMatch(/31/);
      continue;
    }

    const short = resolved.length > 60 ? resolved.slice(0, 60) : resolved;
    expect(html, `konten "${f.key}" harus tampil di undangan (atau digantikan koleksi)`).toContain(short);
  }
}

function assertCollectionMarkersInHtml(html, markers, themeKey, contentData = {}) {
  if (markers.storyTitle || markers.storyDescription) {
    const descBit = markers.storyDescription ? markers.storyDescription.slice(0, 40) : '';
    const quoteBit =
      contentData.couple_quote && String(contentData.couple_quote).trim()
        ? String(contentData.couple_quote).trim().slice(0, 40)
        : '';
    const storyBodyBit =
      contentData.couple_story && String(contentData.couple_story).trim()
        ? String(contentData.couple_story).trim().slice(0, 40)
        : '';
    const hasStory =
      (markers.storyTitle && html.includes(markers.storyTitle)) ||
      (descBit && html.includes(descBit)) ||
      (quoteBit && html.includes(quoteBit)) ||
      (storyBodyBit && html.includes(storyBodyBit));
    expect(
      hasStory,
      `${themeKey} story (timeline, couple_quote, couple_story, atau deskripsi koleksi di HTML)`
    ).toBeTruthy();
  }
  if (markers.eventTitle || markers.eventType || markers.eventVenue) {
    const hasEvent =
      (markers.eventVenue && html.includes(markers.eventVenue)) ||
      (markers.eventTitle && html.includes(markers.eventTitle)) ||
      (markers.eventType && html.includes(markers.eventType));
    expect(
      hasEvent,
      `${themeKey} event (venue, judul, atau tipe acara di HTML — beberapa tema hanya menampilkan venue)`
    ).toBeTruthy();
  }
  if (markers.galleryCaption || markers.galleryImageUrl) {
    const hasGallery =
      (markers.galleryCaption && html.includes(markers.galleryCaption)) ||
      (markers.galleryImageUrl && html.includes('images.unsplash.com'));
    expect(hasGallery, `${themeKey} gallery (caption atau gambar di HTML)`).toBeTruthy();
  }
  if (markers.giftBank) {
    expect(html, `${themeKey} gift bank`).toContain(markers.giftBank);
  }
  if (markers.giftAccountName) {
    expect(html, `${themeKey} gift account name`).toContain(markers.giftAccountName);
  }
}

async function publishSiteViaApi(api, siteId) {
  for (const status of ['in_review', 'approved', 'published']) {
    const res = await api.patch(`/api/sites/${siteId}`, { data: { status } });
    if (!res.ok()) {
      throw new Error(`workflow ${status} failed ${res.status()}: ${await res.text()}`);
    }
  }
}

module.exports = {
  SKIP_HTML_TEXT_KEYS,
  getExpectedThemeKeys,
  /** @deprecated */ getExpectedThemeKeysTheme1To16: getExpectedThemeKeys,
  /** @deprecated */ getExpectedThemeKeysTheme1To15: getExpectedThemeKeys,
  /** @deprecated */ getExpectedThemeKeysTheme1To14: getExpectedThemeKeys,
  buildFullContentData,
  buildSectionsPayload,
  seedCollectionsForTheme,
  assertContentFieldsInHtml,
  assertCollectionMarkersInHtml,
  publishSiteViaApi,
  sampleContentValue,
};
