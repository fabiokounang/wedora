const path = require("path");
const ejs = require(path.join(__dirname, "..", "..", "..", "server", "node_modules", "ejs"));
const p = path.join(__dirname, "..", "template.ejs");
const helpers = {
  formatDate: (v) => (v ? String(v).slice(0, 10) : ""),
  toDate: (v) => (v ? new Date(String(v).replace(" ", "T")) : null),
};
ejs.renderFile(
  p,
  {
    site: { id: 1, slug: "test", music_enabled: 0, music_url: "", music_autoplay: 0 },
    content: { partner_one: "A", partner_two: "B", wedding_date: "2026-05-01 12:00:00", stream_youtube_id: "abc", gift_message: "Terima kasih." },
    sections: [
      { section_key: "hero", enabled: 1 },
      { section_key: "story", enabled: 1 },
      { section_key: "events", enabled: 1 },
      { section_key: "rsvp", enabled: 1 },
      { section_key: "gift", enabled: 1 },
    ],
    events: [
      {
        id: 1,
        title: "R",
        venue_name: "V",
        address: "x",
        datetime: "2026-05-01 18:00:00",
        notes: "<p>n</p>",
        map_url: "https://maps.google.com/maps?q=test&output=embed",
      },
    ],
    gallery: [],
    gifts: [{ id: 1, bank_name: "BCA", account_number: "1234567890", account_name: "A & B", qr_image_url: null, sort_order: 0 }],
    story: [],
    wishes: [],
    helpers,
    apiBase: "/api",
    manifest: {},
  },
  (e, h) => {
    if (e) {
      console.error(e);
      process.exit(1);
    }
    console.log("ok", h.length);
  }
);
