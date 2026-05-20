const path = require('path');
const ejs = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'ejs'));
const { helpers } = require(path.join(__dirname, '..', '..', '..', 'server', 'src', 'services', 'renderer.js'));
const p = path.join(__dirname, '..', 'template.ejs');
ejs.renderFile(
  p,
  {
    site: {
      id: 1,
      slug: 'demo-theme12',
      music_enabled: 0,
      music_url: '',
      music_autoplay: 0,
    },
    content: {
      partner_one: 'Amelia Rose',
      partner_two: 'James William',
      wedding_date: '2026-06-14 10:00:00',
      cover_subtitle: 'THE WEDDING OF',
      couple_quote: 'Dua jiwa, satu irama.',
      partner_one_bio: 'Bio satu.',
      partner_two_bio: 'Bio dua.',
      footer_text: 'Terima kasih.',
      footer_hashtag: 'AmeliaJames',
      gift_message: 'Amplop digital.',
      location_note: 'Parkir tersedia di area B.',
    },
    sections: [
      { section_key: 'hero', enabled: 1 },
      { section_key: 'story', enabled: 1 },
      { section_key: 'events', enabled: 1 },
      { section_key: 'location', enabled: 1 },
      { section_key: 'rsvp', enabled: 1 },
      { section_key: 'gallery', enabled: 1 },
      { section_key: 'wishes', enabled: 1 },
      { section_key: 'gift', enabled: 1 },
    ],
    events: [
      {
        id: 1,
        title: 'Resepsi',
        venue_name: 'Garden Pavilion',
        address: 'Jl. Contoh 1',
        datetime: '2026-06-14 11:00:00',
        map_url: 'https://www.google.com/maps/embed?pb=1',
        sort_order: 0,
      },
    ],
    gallery: [{ image_url: 'https://placehold.co/400x400/e8d5c8/5c4a3a?text=Foto', caption: 'Pre-wedding', sort_order: 0 }],
    gifts: [{ id: 1, bank_name: 'BCA', account_number: '123', account_name: 'A & B', qr_image_url: null, sort_order: 0 }],
    story: [],
    wishes: [{ id: 1, guest_name: 'Budi', message: 'Selamat ya!', created_at: new Date().toISOString() }],
    helpers,
    apiBase: '/api',
    manifest: {},
  },
  (err, html) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('ok', html.length);
  }
);
