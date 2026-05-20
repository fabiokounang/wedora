const { z } = require('zod');

const MAX = {
  short: 120,
  line: 500,
  para: 4000,
  title: 200,
};

function stripHtml(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function lim(n) {
  return z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => stripHtml(v == null ? '' : String(v)).trim().slice(0, n));
}

const statRow = z.object({
  val: lim(MAX.short),
  label: lim(MAX.short),
  useThemeCount: z.any().transform((v) => v === true || v === 'true' || v === '1' || v === 1),
});

const featureRow = z.object({
  icon: lim(16),
  title: lim(MAX.line),
  desc: lim(MAX.para),
});

const stepRow = z.object({
  title: lim(MAX.line),
  desc: lim(MAX.para),
});

const testimonialRow = z.object({
  stars: lim(32),
  text: lim(MAX.para),
  initials: lim(8),
  name: lim(MAX.line),
  location: lim(MAX.line),
});

const faqRow = z.object({
  q: lim(MAX.line),
  a: lim(MAX.para),
});

const compareRow = z.object({
  feature: lim(MAX.line),
  starter: lim(MAX.line),
  standard: lim(MAX.line),
  premium: lim(MAX.line),
  standardStrong: z.coerce.boolean().optional(),
  isCheck: z.coerce.boolean().optional(),
});

const planCopy = z.object({
  badge: lim(MAX.short),
  displayName: lim(MAX.line),
  subtitle: lim(MAX.para),
  ctaLabel: lim(MAX.line),
  featureLines: z.array(lim(MAX.line)).max(40).optional(),
});

const publicCmsSchema = z.object({
  seo: z.object({
    homeTitle: lim(MAX.title),
    pricingTitle: lim(MAX.title),
    catalogTitle: lim(MAX.title),
    defaultMetaDescription: lim(600),
  }),
  footer: z.object({
    brandName: lim(MAX.short),
    tagline: lim(MAX.para),
    col1Title: lim(MAX.short),
    col1LinkCatalog: lim(MAX.short),
    col1LinkPricing: lim(MAX.short),
    col2Title: lim(MAX.short),
    col2LinkLogin: lim(MAX.short),
    col2LinkRegister: lim(MAX.short),
    bottomLine1: lim(MAX.para),
    bottomLine2: lim(MAX.para),
  }),
  cta: z.object({
    home: z.object({
      titleLines: z.array(lim(MAX.line)).max(4),
      subtitle: lim(MAX.para),
      primaryLabel: lim(MAX.short),
      secondaryLabel: lim(MAX.short),
    }),
    pricing: z.object({
      titleLines: z.array(lim(MAX.line)).max(4),
      subtitle: lim(MAX.para),
      primaryLabel: lim(MAX.short),
      secondaryLabel: lim(MAX.short),
    }),
  }),
  home: z.object({
    hero: z.object({
      eyebrow: lim(MAX.line),
      titleLine1: lim(MAX.line),
      titleEmphasis: lim(MAX.short),
      titleLine2: lim(MAX.line),
      titleLine3: lim(MAX.line),
      subtitle: lim(MAX.para),
      ctaPrimary: lim(MAX.short),
      ctaSecondary: lim(MAX.short),
    }),
    stats: z.array(statRow).max(8),
    featuresSection: z.object({
      eyebrow: lim(MAX.line),
      titleLines: z.array(lim(MAX.line)).max(4),
      subtitle: lim(MAX.para),
    }),
    features: z.array(featureRow).max(24),
    aboutSection: z.object({
      eyebrow: lim(MAX.line),
      titleLines: z.array(lim(MAX.line)).max(4),
      body: lim(MAX.para),
      highlights: z.array(featureRow).max(6),
    }),
    stepsSection: z.object({
      eyebrow: lim(MAX.line),
      title: lim(MAX.line),
      subtitle: lim(MAX.para),
    }),
    steps: z.array(stepRow).max(12),
    themesSection: z.object({
      eyebrow: lim(MAX.line),
      titleLines: z.array(lim(MAX.line)).max(4),
      subtitle: lim(MAX.para),
      emptyMessage: lim(MAX.para),
      linkAllThemes: lim(MAX.short),
    }),
    testimonialsSection: z.object({
      eyebrow: lim(MAX.line),
      title: lim(MAX.line),
    }),
    testimonials: z.array(testimonialRow).max(20),
    pricingPreviewSection: z.object({
      eyebrow: lim(MAX.line),
      titleLines: z.array(lim(MAX.line)).max(4),
      subtitle: lim(MAX.para),
      linkDetail: lim(MAX.short),
    }),
    planCardCtas: z.object({
      starter: lim(MAX.short),
      standard: lim(MAX.short),
      premium: lim(MAX.short),
    }),
  }),
  pricing: z.object({
    hero: z.object({
      eyebrow: lim(MAX.line),
      titleLines: z.array(lim(MAX.line)).max(4),
      subtitle: lim(MAX.para),
      promise: lim(MAX.para),
      ctaPrimary: lim(MAX.short),
      ctaSecondary: lim(MAX.short),
      photoBadge: lim(MAX.short),
      photoAlt: lim(MAX.line),
    }),
    toggle: z.object({
      primaryLabel: lim(MAX.short),
      secondaryLabel: lim(MAX.short),
      secondaryHint: lim(MAX.short),
    }),
    plans: z.object({
      starter: planCopy,
      standard: planCopy,
      premium: planCopy,
    }),
    compareSectionTitle: lim(MAX.line),
    compareTableHeaderFeature: lim(MAX.short),
    compareRows: z.array(compareRow).max(40),
    faqSection: z.object({
      eyebrow: lim(MAX.line),
      title: lim(MAX.line),
    }),
    faq: z.array(faqRow).max(40),
  }),
});

function safeParsePublicCms(data) {
  return publicCmsSchema.safeParse(data);
}

module.exports = {
  publicCmsSchema,
  safeParsePublicCms,
  stripHtml,
};
