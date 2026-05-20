/**
 * Default konten publik (beranda, pricing, CTA, footer, SEO).
 * mergePublicCms() menggabungkan isi DB di atas default ini.
 */

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv === undefined) continue;
    if (Array.isArray(sv)) {
      target[key] = sv.map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? deepClone(item) : item));
    } else if (sv !== null && typeof sv === 'object') {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], sv);
    } else {
      target[key] = sv;
    }
  }
}

const DEFAULT_PUBLIC_CMS = {
  seo: {
    homeTitle: 'Undangan Digital — Platform Undangan Pernikahan Modern',
    pricingTitle: 'Harga — Undangan Digital',
    catalogTitle: 'Katalog Tema — Undangan Digital',
    defaultMetaDescription:
      'Platform undangan pernikahan digital modern. Buat undangan elegan, kirim via WhatsApp, pantau RSVP tamu — semua dalam satu platform.',
  },
  footer: {
    brandName: 'Undangan Digital',
    tagline: 'Platform undangan pernikahan digital modern untuk pasangan Indonesia.',
    col1Title: 'Produk',
    col1LinkCatalog: 'Katalog Tema',
    col1LinkPricing: 'Paket Harga',
    col2Title: 'Akun',
    col2LinkLogin: 'Masuk',
    col2LinkRegister: 'Daftar Gratis',
    bottomLine1: '© Undangan Digital. Dibuat dengan ❤ untuk pasangan Indonesia.',
    bottomLine2: 'Platform undangan pernikahan digital #1',
  },
  cta: {
    home: {
      titleLines: ['Siap membuat undangan', 'yang berkesan?'],
      subtitle: 'Bergabung dengan ratusan pasangan yang telah mempercayai platform kami untuk hari spesial mereka.',
      primaryLabel: 'Mulai Gratis Sekarang',
      secondaryLabel: 'Lihat Katalog Tema',
    },
    pricing: {
      titleLines: ['Siap membuat undangan', 'yang berkesan?'],
      subtitle: 'Pilih paket Anda dan mulai dalam hitungan menit. Tidak butuh kartu kredit.',
      primaryLabel: 'Mulai Gratis Sekarang',
      secondaryLabel: 'Lihat Katalog Tema',
    },
  },
  home: {
    hero: {
      eyebrow: 'Platform undangan pernikahan digital #1',
      titleLine1: 'Undangan pernikahan',
      titleEmphasis: 'impian',
      titleLine2: ', hanya dalam',
      titleLine3: 'hitungan menit',
      subtitle:
        'Buat undangan digital yang elegan, kirim via WhatsApp, dan pantau konfirmasi kehadiran tamu — semua dalam satu platform yang mudah digunakan.',
      ctaPrimary: 'Lihat Katalog Tema',
      ctaSecondary: 'Mulai Gratis →',
    },
    stats: [
      { val: '500+', label: 'Pasangan bahagia', useThemeCount: false },
      { val: '', label: 'Tema premium', useThemeCount: true },
      { val: '10rb+', label: 'RSVP terkumpul', useThemeCount: false },
      { val: '24/7', label: 'Support tim lokal', useThemeCount: false },
    ],
    featuresSection: {
      eyebrow: 'Kenapa kami?',
      titleLines: ['Semua yang Anda butuhkan', 'dalam satu platform'],
      subtitle: 'Dari pembuatan undangan hingga manajemen tamu, kami tangani semuanya.',
    },
    features: [
      {
        icon: '🎨',
        title: 'Tema Siap Pakai',
        desc: 'Pilih dari koleksi tema pernikahan yang indah dan dapat dikustomisasi sesuai identitas pasangan.',
      },
      {
        icon: '📱',
        title: 'RSVP Digital',
        desc: 'Tamu konfirmasi kehadiran secara online. Pantau daftar tamu secara real-time dan ekspor ke CSV.',
      },
      {
        icon: '💌',
        title: 'Blast via WhatsApp',
        desc: 'Kirim undangan ke seluruh tamu sekaligus melalui WhatsApp dengan mudah dan cepat.',
      },
      {
        icon: '🔗',
        title: 'Link Personal',
        desc: 'Setiap pasangan mendapat link unik dan custom domain. Mudah dibagikan di mana saja kapan saja.',
      },
    ],
    aboutSection: {
      eyebrow: 'Tentang kami',
      titleLines: ['Tim kecil yang berkomitmen', 'pada hari spesial Anda'],
      body:
        'Undangan Digital lahir dari kecintaan kami pada cerita pernikahan. Kami membantu pasangan Indonesia menciptakan undangan digital yang elegan, mudah disebarkan, dan menyenangkan untuk dibagikan ke keluarga & sahabat.',
      highlights: [
        { icon: '✨', title: 'Desain elegan', desc: 'Tema dirancang oleh tim desainer dengan estetika pernikahan modern.' },
        { icon: '🤝', title: 'Pendampingan ramah', desc: 'Tim support yang responsif menjawab pertanyaan Anda di jam kerja.' },
        { icon: '🇮🇩', title: 'Buatan Indonesia', desc: 'Dibuat untuk pasangan Indonesia, lengkap dengan dukungan bahasa & adat lokal.' },
      ],
    },
    stepsSection: {
      eyebrow: 'Cara kerja',
      title: 'Cara kerjanya sederhana',
      subtitle: 'Tiga langkah mudah untuk undangan pernikahan digital yang memukau.',
    },
    steps: [
      {
        title: 'Pilih Tema',
        desc: 'Jelajahi koleksi tema dan pilih yang paling sesuai dengan gaya pernikahan Anda. Semua bisa dicoba demo live.',
      },
      {
        title: 'Isi Konten',
        desc: 'Tambahkan nama, tanggal, cerita cinta, foto, dan informasi acara pernikahan Anda dengan mudah.',
      },
      {
        title: 'Bagikan ke Tamu',
        desc: 'Dapatkan link unik dan kirim ke seluruh tamu via WhatsApp, Instagram, atau media sosial lainnya.',
      },
    ],
    themesSection: {
      eyebrow: 'Koleksi tema',
      titleLines: ['Tema indah untuk hari spesial Anda'],
      subtitle: 'Semua tema responsif, cepat, dan bisa dikustomisasi warna, teks, serta foto sesuai keinginan.',
      emptyMessage: 'Tema sedang disiapkan. Cek kembali nanti.',
      linkAllThemes: 'Lihat semua tema',
    },
    testimonialsSection: {
      eyebrow: 'Testimoni',
      title: 'Kata mereka tentang kami',
    },
    testimonials: [
      {
        stars: '★★★★★',
        text: 'Kami sangat terkesan dengan kemudahan platform ini. Undangan digital kami jadi dalam waktu 2 jam saja! Tampilannya elegan dan semua tamu memuji desainnya.',
        initials: 'BS',
        name: 'Budi & Sari',
        location: 'Jakarta, Maret 2025',
      },
      {
        stars: '★★★★★',
        text: 'Tema-temanya cantik dan responsif di HP. Fitur RSVP digital sangat membantu, tidak perlu repot menelepon satu per satu untuk konfirmasi kehadiran.',
        initials: 'RD',
        name: 'Rizky & Dewi',
        location: 'Surabaya, Januari 2025',
      },
      {
        stars: '★★★★★',
        text: 'WhatsApp blast langsung ke ratusan tamu jadi sangat mudah. Undangan kami viral di grup keluarga karena tampilannnya begitu profesional dan memukau.',
        initials: 'AN',
        name: 'Ahmad & Nisa',
        location: 'Bandung, Februari 2025',
      },
    ],
    pricingPreviewSection: {
      eyebrow: 'Harga',
      titleLines: ['Paket harga terjangkau'],
      subtitle: 'Bayar sekali untuk satu acara. Tidak ada biaya berlangganan, tidak ada biaya tersembunyi.',
      linkDetail: 'Lihat detail semua paket',
    },
    planCardCtas: {
      starter: 'Pilih Starter',
      standard: 'Pilih Standar',
      premium: 'Pilih Premium',
    },
  },
  pricing: {
    hero: {
      eyebrow: 'Transparan & terjangkau',
      titleLines: ['Pilih paket yang tepat', 'untuk hari spesial Anda'],
      subtitle: 'Bayar sekali untuk satu acara pernikahan. Tidak ada biaya berlangganan, tidak ada biaya tersembunyi.',
      promise: 'Dirancang untuk pasangan modern yang ingin undangan elegan, romantis, dan praktis.',
      ctaPrimary: 'Mulai Gratis',
      ctaSecondary: 'Lihat Paket',
      photoBadge: 'Romantic Theme',
      photoAlt: 'Preview undangan romantis',
    },
    toggle: {
      primaryLabel: 'Bayar per acara',
      secondaryLabel: 'Berlangganan',
      secondaryHint: '(segera)',
    },
    plans: {
      starter: {
        badge: 'Starter',
        displayName: 'Paket Dasar',
        subtitle: 'Untuk kebutuhan undangan yang sederhana namun tetap elegan.',
        ctaLabel: 'Mulai dengan Starter',
      },
      standard: {
        badge: 'Paling Populer',
        displayName: 'Paket Standar',
        subtitle: 'Pilihan terbaik untuk undangan lengkap yang berkesan.',
        ctaLabel: 'Mulai dengan Standar',
      },
      premium: {
        badge: 'Premium',
        displayName: 'Paket Premium',
        subtitle: 'Fitur paling lengkap untuk undangan yang benar-benar istimewa.',
        ctaLabel: 'Mulai dengan Premium',
      },
    },
    compareSectionTitle: 'Perbandingan lengkap fitur',
    compareTableHeaderFeature: 'Fitur',
    compareRows: [
      { feature: 'Harga per acara', starter: 'Rp 299.000', standard: 'Rp 499.000', premium: 'Rp 799.000', standardStrong: true },
      { feature: 'Masa aktif', starter: '6 bulan', standard: '12 bulan', premium: 'Selamanya' },
      { feature: 'Pilihan tema', starter: '1 tema dasar', standard: 'Semua tema', premium: 'Semua + eksklusif' },
      { feature: 'Link undangan unik', starter: '✓', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'RSVP digital (konfirmasi tamu)', starter: 'Maks 100', standard: 'Maks 300', premium: 'Unlimited' },
      { feature: 'Galeri foto', starter: '10 foto', standard: '30 foto', premium: 'Unlimited' },
      { feature: 'Musik latar', starter: '✓', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'Cerita pertemuan', starter: '✓', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'Info acara & peta', starter: '✓', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'Rekening gift', starter: '✓', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'WhatsApp blast', starter: '✗', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'Subdomain custom', starter: '✗', standard: '✓', premium: '✓', isCheck: true },
      { feature: 'Custom domain sendiri', starter: '✗', standard: '✗', premium: '✓', isCheck: true },
      { feature: 'Prioritas support', starter: '✗', standard: '✗', premium: '✓', isCheck: true },
    ],
    faqSection: {
      eyebrow: 'FAQ',
      title: 'Pertanyaan yang sering ditanyakan',
    },
    faq: [
      {
        q: 'Apakah bisa ganti tema setelah membeli?',
        a: 'Ya, Anda bisa mengganti tema kapan saja selama masa aktif. Untuk Paket Starter yang hanya mendapat 1 tema, Anda bisa upgrade ke Standar atau Premium untuk mengakses semua tema.',
      },
      {
        q: 'Berapa lama undangan aktif setelah pembelian?',
        a: 'Masa aktif tergantung paket: Starter 6 bulan, Standar 12 bulan, dan Premium aktif selamanya. Undangan tetap bisa diakses tamu selama masa aktif tersebut.',
      },
      {
        q: 'Bagaimana cara melakukan pembayaran?',
        a: 'Pembayaran dapat dilakukan melalui transfer bank (BCA, Mandiri, BNI, BRI), dompet digital (GoPay, OVO, DANA, ShopeePay), atau QRIS. Konfirmasi pembayaran biasanya diproses dalam 1x24 jam.',
      },
      {
        q: 'Apakah ada garansi uang kembali?',
        a: 'Ya, kami memberikan garansi uang kembali 7 hari setelah pembelian jika Anda belum pernah mempublikasikan undangan. Hubungi tim support kami untuk proses refund.',
      },
      {
        q: 'Apa itu custom domain dan bagaimana cara menggunakannya?',
        a: 'Custom domain memungkinkan undangan Anda diakses melalui domain pribadi, misalnya budi-sari.com atau undangan.budi-sari.com. Fitur ini tersedia di Paket Premium. Tim kami akan membantu proses konfigurasi domain Anda.',
      },
      {
        q: 'Berapa kapasitas tamu untuk RSVP digital?',
        a: 'Starter menampung hingga 100 konfirmasi tamu, Standar hingga 300 tamu, dan Premium tidak terbatas. Perlu diingat, kapasitas ini untuk jumlah tamu yang mengisi RSVP online, bukan total undangan yang dikirim.',
      },
    ],
  },
};

function mergePublicCms(dbContent) {
  const base = deepClone(DEFAULT_PUBLIC_CMS);
  if (dbContent && typeof dbContent === 'object') deepMerge(base, dbContent);
  return base;
}

module.exports = {
  DEFAULT_PUBLIC_CMS,
  mergePublicCms,
  deepClone,
};
