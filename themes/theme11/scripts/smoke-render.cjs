const path = require('path');
const ejs = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'ejs'));
const { helpers } = require(path.join(__dirname, '..', '..', '..', 'server', 'src', 'services', 'renderer.js'));
const p = path.join(__dirname, '..', 'template.ejs');
ejs.renderFile(
  p,
  {
    site: {
      id: 1,
      slug: 'test',
      music_enabled: 1,
      music_url: 'https://example.com/song.mp3',
      music_autoplay: 0,
    },
    content: {
      partner_one: 'A',
      partner_two: 'B',
      wedding_date: '2026-05-01 12:00:00',
      cover_subtitle: 'The Wedding of',
      story_title: 'Our Story',
      couple_story: 'Cerita kami.',
      gift_message: 'Terima kasih.',
      footer_text: 'Sampai jumpa.',
      location_note: 'Catatan peta.',
    },
    sections: [
      { section_key: 'hero', enabled: 1 },
      { section_key: 'story', enabled: 1 },
      { section_key: 'countdown', enabled: 1 },
      { section_key: 'events', enabled: 1 },
      { section_key: 'gallery', enabled: 1 },
      { section_key: 'rsvp', enabled: 1 },
      { section_key: 'wishes', enabled: 1 },
      { section_key: 'gift', enabled: 1 },
      { section_key: 'location', enabled: 1 },
    ],
    events: [
      {
        id: 1,
        title: 'Akad',
        venue_name: 'Gedung',
        address: 'Jl. Contoh',
        datetime: '2026-05-01 15:00:00',
        sort_order: 0,
        map_url: 'https://www.google.com/maps/embed?pb=test',
      },
    ],
    gallery: [{ image_url: 'https://placehold.co/400', caption: 'Foto', sort_order: 0 }],
    gifts: [{ id: 1, bank_name: 'BCA', account_number: '123', account_name: 'A & B', qr_image_url: null, sort_order: 0 }],
    story: [],
    wishes: [{ id: 1, guest_name: 'Tamu', message: 'Selamat!', created_at: new Date().toISOString() }],
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
