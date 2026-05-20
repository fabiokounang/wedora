function trimStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function orderedIndexKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.keys(obj)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
}

function truthyCheckbox(v) {
  return v === '1' || v === true || v === 'on' || v === 1;
}

/**
 * Gabungkan isi form POST ke objek CMS penuh (untuk validasi & simpan DB).
 * `base` = mergePublicCms(isi DB saat ini).
 */
function applyLandingFormToCms(base, body) {
  const out = JSON.parse(JSON.stringify(base));

  const assignIf = (path, val) => {
    if (val === undefined) return;
    let cur = out;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[path[path.length - 1]] = val;
  };

  const b = body || {};

  if (b.seo && typeof b.seo === 'object') {
    for (const k of ['homeTitle', 'pricingTitle', 'catalogTitle', 'defaultMetaDescription']) {
      if (b.seo[k] != null) assignIf(['seo', k], trimStr(b.seo[k]));
    }
  }
  if (b.footer && typeof b.footer === 'object') {
    for (const k of Object.keys(out.footer)) {
      if (b.footer[k] != null) assignIf(['footer', k], trimStr(b.footer[k]));
    }
  }
  if (b.cta && typeof b.cta === 'object') {
    ['home', 'pricing'].forEach((slot) => {
      if (!b.cta[slot] || typeof b.cta[slot] !== 'object') return;
      const src = b.cta[slot];
      if (src.titleLines != null) {
        const arr = Array.isArray(src.titleLines)
          ? src.titleLines
          : typeof src.titleLines === 'object'
            ? Object.keys(src.titleLines)
                .filter((x) => /^\d+$/.test(x))
                .sort((a, c) => Number(a) - Number(c))
                .map((i) => src.titleLines[i])
            : [src.titleLines];
        assignIf(
          ['cta', slot, 'titleLines'],
          arr.map((x) => trimStr(x)).filter(Boolean).slice(0, 4),
        );
      }
      for (const k of ['subtitle', 'primaryLabel', 'secondaryLabel']) {
        if (src[k] != null) assignIf(['cta', slot, k], trimStr(src[k]));
      }
    });
  }

  const heroKeys = [
    'eyebrow',
    'titleLine1',
    'titleEmphasis',
    'titleLine2',
    'titleLine3',
    'subtitle',
    'ctaPrimary',
    'ctaSecondary',
  ];
  if (b.home && b.home.hero && typeof b.home.hero === 'object') {
    for (const k of heroKeys) {
      if (b.home.hero[k] != null) assignIf(['home', 'hero', k], trimStr(b.home.hero[k]));
    }
  }

  if (b.home && b.home.featuresSection && typeof b.home.featuresSection === 'object') {
    const fs = b.home.featuresSection;
    if (fs.eyebrow != null) assignIf(['home', 'featuresSection', 'eyebrow'], trimStr(fs.eyebrow));
    if (fs.subtitle != null) assignIf(['home', 'featuresSection', 'subtitle'], trimStr(fs.subtitle));
    if (fs.titleLines != null) {
      const arr = Array.isArray(fs.titleLines)
        ? fs.titleLines
        : Object.keys(fs.titleLines || {})
            .filter((x) => /^\d+$/.test(x))
            .sort((a, c) => Number(a) - Number(c))
            .map((i) => (fs.titleLines || {})[i]);
      assignIf(
        ['home', 'featuresSection', 'titleLines'],
        arr.map((x) => trimStr(x)).filter(Boolean).slice(0, 4),
      );
    }
  }

  if (b.home && b.home.aboutSection && typeof b.home.aboutSection === 'object') {
    const a = b.home.aboutSection;
    if (a.eyebrow != null) assignIf(['home', 'aboutSection', 'eyebrow'], trimStr(a.eyebrow));
    if (a.body != null) assignIf(['home', 'aboutSection', 'body'], trimStr(a.body));
    if (a.titleLines != null) {
      const arr = Array.isArray(a.titleLines)
        ? a.titleLines
        : Object.keys(a.titleLines || {})
            .filter((x) => /^\d+$/.test(x))
            .sort((p, c) => Number(p) - Number(c))
            .map((i) => (a.titleLines || {})[i]);
      assignIf(
        ['home', 'aboutSection', 'titleLines'],
        arr.map((x) => trimStr(x)).filter(Boolean).slice(0, 4),
      );
    }
    if (a.highlights && typeof a.highlights === 'object' && !Array.isArray(a.highlights)) {
      const highlights = [];
      for (const k of orderedIndexKeys(a.highlights)) {
        const row = a.highlights[k];
        if (!row || typeof row !== 'object') continue;
        const icon = trimStr(row.icon);
        const title = trimStr(row.title);
        const desc = trimStr(row.desc);
        if (!icon && !title && !desc) continue;
        highlights.push({ icon, title, desc });
      }
      if (highlights.length > 0) {
        if (!out.home.aboutSection) out.home.aboutSection = {};
        out.home.aboutSection.highlights = highlights.slice(0, 6);
      }
    }
  }

  if (b.home && b.home.stepsSection && typeof b.home.stepsSection === 'object') {
    const ss = b.home.stepsSection;
    for (const k of ['eyebrow', 'title', 'subtitle']) {
      if (ss[k] != null) assignIf(['home', 'stepsSection', k], trimStr(ss[k]));
    }
  }

  if (b.home && b.home.themesSection && typeof b.home.themesSection === 'object') {
    const ts = b.home.themesSection;
    for (const k of ['eyebrow', 'subtitle', 'emptyMessage', 'linkAllThemes']) {
      if (ts[k] != null) assignIf(['home', 'themesSection', k], trimStr(ts[k]));
    }
    if (ts.titleLines != null) {
      const arr = Array.isArray(ts.titleLines)
        ? ts.titleLines
        : Object.keys(ts.titleLines || {})
            .filter((x) => /^\d+$/.test(x))
            .sort((a, c) => Number(a) - Number(c))
            .map((i) => (ts.titleLines || {})[i]);
      assignIf(
        ['home', 'themesSection', 'titleLines'],
        arr.map((x) => trimStr(x)).filter(Boolean).slice(0, 4),
      );
    }
  }

  if (b.home && b.home.testimonialsSection && typeof b.home.testimonialsSection === 'object') {
    const t = b.home.testimonialsSection;
    if (t.eyebrow != null) assignIf(['home', 'testimonialsSection', 'eyebrow'], trimStr(t.eyebrow));
    if (t.title != null) assignIf(['home', 'testimonialsSection', 'title'], trimStr(t.title));
  }

  if (b.home && b.home.pricingPreviewSection && typeof b.home.pricingPreviewSection === 'object') {
    const p = b.home.pricingPreviewSection;
    for (const k of ['eyebrow', 'subtitle', 'linkDetail']) {
      if (p[k] != null) assignIf(['home', 'pricingPreviewSection', k], trimStr(p[k]));
    }
    if (p.titleLines != null) {
      const arr = Array.isArray(p.titleLines)
        ? p.titleLines
        : Object.keys(p.titleLines || {})
            .filter((x) => /^\d+$/.test(x))
            .sort((a, c) => Number(a) - Number(c))
            .map((i) => (p.titleLines || {})[i]);
      assignIf(
        ['home', 'pricingPreviewSection', 'titleLines'],
        arr.map((x) => trimStr(x)).filter(Boolean).slice(0, 4),
      );
    }
  }

  if (b.home && b.home.planCardCtas && typeof b.home.planCardCtas === 'object') {
    for (const k of ['starter', 'standard', 'premium']) {
      if (b.home.planCardCtas[k] != null) assignIf(['home', 'planCardCtas', k], trimStr(b.home.planCardCtas[k]));
    }
  }

  if (b.home && b.home.stats && typeof b.home.stats === 'object' && !Array.isArray(b.home.stats)) {
    const stats = [];
    for (const k of orderedIndexKeys(b.home.stats)) {
      const row = b.home.stats[k];
      if (!row || typeof row !== 'object') continue;
      const val = trimStr(row.val);
      const label = trimStr(row.label);
      const useThemeCount = truthyCheckbox(row.useThemeCount);
      if (!label && !val && !useThemeCount) continue;
      stats.push({ val, label, useThemeCount });
    }
    if (stats.length > 0) out.home.stats = stats.slice(0, 8);
  }

  if (b.home && b.home.features && typeof b.home.features === 'object' && !Array.isArray(b.home.features)) {
    const features = [];
    for (const k of orderedIndexKeys(b.home.features)) {
      const row = b.home.features[k];
      if (!row || typeof row !== 'object') continue;
      const icon = trimStr(row.icon);
      const title = trimStr(row.title);
      const desc = trimStr(row.desc);
      if (!icon && !title && !desc) continue;
      features.push({ icon, title, desc });
    }
    if (features.length > 0) out.home.features = features.slice(0, 24);
  }

  if (b.home && b.home.steps && typeof b.home.steps === 'object' && !Array.isArray(b.home.steps)) {
    const steps = [];
    for (const k of orderedIndexKeys(b.home.steps)) {
      const row = b.home.steps[k];
      if (!row || typeof row !== 'object') continue;
      const title = trimStr(row.title);
      const desc = trimStr(row.desc);
      if (!title && !desc) continue;
      steps.push({ title, desc });
    }
    if (steps.length > 0) out.home.steps = steps.slice(0, 12);
  }

  if (b.home && b.home.testimonials && typeof b.home.testimonials === 'object' && !Array.isArray(b.home.testimonials)) {
    const testimonials = [];
    for (const k of orderedIndexKeys(b.home.testimonials)) {
      const row = b.home.testimonials[k];
      if (!row || typeof row !== 'object') continue;
      const stars = trimStr(row.stars);
      const text = trimStr(row.text);
      const initials = trimStr(row.initials);
      const name = trimStr(row.name);
      const location = trimStr(row.location);
      if (!text && !name) continue;
      testimonials.push({ stars, text, initials, name, location });
    }
    if (testimonials.length > 0) out.home.testimonials = testimonials.slice(0, 20);
  }

  if (b.pricing && b.pricing.hero && typeof b.pricing.hero === 'object') {
    const h = b.pricing.hero;
    for (const k of ['eyebrow', 'subtitle', 'promise', 'ctaPrimary', 'ctaSecondary', 'photoBadge', 'photoAlt']) {
      if (h[k] != null) assignIf(['pricing', 'hero', k], trimStr(h[k]));
    }
    if (h.titleLines != null) {
      const arr = Array.isArray(h.titleLines)
        ? h.titleLines
        : Object.keys(h.titleLines || {})
            .filter((x) => /^\d+$/.test(x))
            .sort((a, c) => Number(a) - Number(c))
            .map((i) => (h.titleLines || {})[i]);
      assignIf(
        ['pricing', 'hero', 'titleLines'],
        arr.map((x) => trimStr(x)).filter(Boolean).slice(0, 4),
      );
    }
  }

  if (b.pricing && b.pricing.toggle && typeof b.pricing.toggle === 'object') {
    for (const k of ['primaryLabel', 'secondaryLabel', 'secondaryHint']) {
      if (b.pricing.toggle[k] != null) assignIf(['pricing', 'toggle', k], trimStr(b.pricing.toggle[k]));
    }
  }

  if (b.pricing && b.pricing.plans && typeof b.pricing.plans === 'object') {
    for (const code of ['starter', 'standard', 'premium']) {
      const pl = b.pricing.plans[code];
      if (!pl || typeof pl !== 'object') continue;
      for (const k of ['badge', 'displayName', 'subtitle', 'ctaLabel']) {
        if (pl[k] != null) assignIf(['pricing', 'plans', code, k], trimStr(pl[k]));
      }
      const rawTxt = pl.featureLines_text;
      if (rawTxt !== undefined) {
        const lines = String(rawTxt)
          .split(/\r?\n/)
          .map((line) => trimStr(line))
          .filter(Boolean);
        if (lines.length === 0) delete out.pricing.plans[code].featureLines;
        else assignIf(['pricing', 'plans', code, 'featureLines'], lines.slice(0, 40));
      }
    }
  }

  if (b.pricing_compareSectionTitle != null) assignIf(['pricing', 'compareSectionTitle'], trimStr(b.pricing_compareSectionTitle));
  if (b.pricing_compareTableHeaderFeature != null) {
    assignIf(['pricing', 'compareTableHeaderFeature'], trimStr(b.pricing_compareTableHeaderFeature));
  }

  if (b.pricing && b.pricing.faqSection && typeof b.pricing.faqSection === 'object') {
    if (b.pricing.faqSection.eyebrow != null) assignIf(['pricing', 'faqSection', 'eyebrow'], trimStr(b.pricing.faqSection.eyebrow));
    if (b.pricing.faqSection.title != null) assignIf(['pricing', 'faqSection', 'title'], trimStr(b.pricing.faqSection.title));
  }

  if (
    b.pricing &&
    b.pricing.compareRows &&
    typeof b.pricing.compareRows === 'object' &&
    !Array.isArray(b.pricing.compareRows)
  ) {
    const rows = [];
    for (const k of orderedIndexKeys(b.pricing.compareRows)) {
      const row = b.pricing.compareRows[k];
      if (!row || typeof row !== 'object') continue;
      const feature = trimStr(row.feature);
      if (!feature) continue;
      rows.push({
        feature,
        starter: trimStr(row.starter),
        standard: trimStr(row.standard),
        premium: trimStr(row.premium),
        standardStrong: truthyCheckbox(row.standardStrong),
        isCheck: truthyCheckbox(row.isCheck),
      });
    }
    if (rows.length > 0) out.pricing.compareRows = rows.slice(0, 40);
  }

  if (b.pricing && b.pricing.faqItems && typeof b.pricing.faqItems === 'object' && !Array.isArray(b.pricing.faqItems)) {
    const faq = [];
    for (const k of orderedIndexKeys(b.pricing.faqItems)) {
      const row = b.pricing.faqItems[k];
      if (!row || typeof row !== 'object') continue;
      const q = trimStr(row.q);
      const a = trimStr(row.a);
      if (!q && !a) continue;
      faq.push({ q, a });
    }
    if (faq.length > 0) out.pricing.faq = faq.slice(0, 40);
  }

  return out;
}

module.exports = {
  applyLandingFormToCms,
};
