/**
 * One-off extractor: reads index.html and writes verbatim partials for theme10.
 * Run from theme10: node scripts/extract-partials.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");
const outDir = path.join(root, "partials");
fs.mkdirSync(outDir, { recursive: true });

function slice(startMarker, endMarker, label) {
  const i = src.indexOf(startMarker);
  if (i === -1) throw new Error(`Missing start [${label}]: ${startMarker.slice(0, 80)}`);
  const j = endMarker ? src.indexOf(endMarker, i + startMarker.length) : src.length;
  if (j === -1) throw new Error(`Missing end [${label}]: ${String(endMarker).slice(0, 80)}`);
  return src.slice(i, j);
}

const parts = [
  ["head.ejs", "<head>", "</head>"],
  ["shell-top.ejs", "<body>", "<!-- Envelope Section -->"],
  ["cover.ejs", "<!-- Envelope Section -->", "<!-- Header section -->"],
  ["header-section.ejs", "<!-- Header section -->", "<div class=\"moveable_section_wrapper position-relative\">"],
  ["moveable-couple.ejs", "<div class=\"moveable_section_wrapper position-relative\">", "<section class=\"moveable-section\" data-id=\"4\">"],
  ["venue-rsvp.ejs", "<section class=\"moveable-section\" data-id=\"4\">", "<!-- Wishes section -->"],
  ["wishes.ejs", "<!-- Wishes section -->", "<!-- Apology section -->"],
  ["apology.ejs", "<!-- Apology section -->", "<!-- Gallery Section -->"],
  ["gallery.ejs", "<!-- Gallery Section -->", "<section class=\"stream-section"],
  ["stream.ejs", "<section class=\"stream-section", "<section class=\"thank-section"],
  ["thank.ejs", "<section class=\"thank-section", "<footer class=\"footer"],
  ["footer.ejs", "<footer class=\"footer", "</footer>"],
  ["after-footer.ejs", "</footer>", "<audio id=\"audio_file\""],
  ["modals.ejs", "    <!-- Modal -->", "<svg style=\"position: absolute"],
  ["svg-clip.ejs", "<svg style=\"position: absolute", "  <!-- script add robot field -->"],
  ["scripts-body.ejs", "  <!-- script add robot field -->", "</body></html>"],
];

for (const [name, a, b] of parts) {
  const body = slice(a, b, name);
  fs.writeFileSync(path.join(outDir, name), body, "utf8");
  console.log("wrote", name, body.length);
}

const a0 = src.indexOf("<audio id=\"audio_file\"");
if (a0 === -1) throw new Error("audio tag missing");
const a1 = src.indexOf("</audio>", a0);
if (a1 === -1) throw new Error("</audio> missing");
fs.writeFileSync(path.join(outDir, "audio.ejs"), src.slice(a0, a1 + "</audio>".length), "utf8");
console.log("wrote audio.ejs (custom)", a1 + 8 - a0);

console.log("done");
