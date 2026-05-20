/**
 * Bandingkan field `content.*` yang dipakai di semua .ejs tema vs keys di theme.json content_fields.
 * Exit 1 jika ada key dipakai di template tapi tidak ada di manifest (admin tidak bisa mengisi).
 *
 * Usage: node src/scripts/validate-theme-manifests.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const themeLoader = require('../services/themeLoader');

const CONTENT_KEY_RE = /\bcontent\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

function walkEjsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkEjsFiles(p, acc);
    else if (ent.name.endsWith('.ejs')) acc.push(p);
  }
  return acc;
}

function extractKeysFromSource(src) {
  const keys = new Set();
  let m;
  const re = new RegExp(CONTENT_KEY_RE.source, 'g');
  while ((m = re.exec(src))) keys.add(m[1]);
  return keys;
}

function main() {
  const roots = themeLoader.THEMES_ROOTS || [];
  const themesRoot = roots.find((r) => fs.existsSync(r)) || path.resolve(__dirname, '../../../themes');
  const dirs = fs
    .readdirSync(themesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(themesRoot, name, 'theme.json')))
    .sort();

  let failed = false;
  const report = [];

  for (const key of dirs) {
    const dir = path.join(themesRoot, key);
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'));
    } catch (e) {
      console.error(key, 'INVALID theme.json', e.message);
      failed = true;
      continue;
    }
    const manifestKeys = new Set((manifest.content_fields || []).map((f) => f.key));

    const ejsFiles = walkEjsFiles(dir).filter((p) => !p.includes(`${path.sep}scripts${path.sep}`));
    const usedKeys = new Set();
    for (const file of ejsFiles) {
      const src = fs.readFileSync(file, 'utf8');
      for (const k of extractKeysFromSource(src)) usedKeys.add(k);
    }

    const missingInManifest = [...usedKeys].filter((k) => !manifestKeys.has(k)).sort();
    const unusedInTemplates = [...manifestKeys].filter((k) => !usedKeys.has(k)).sort();

    const row = { key, missingInManifest, unusedInTemplates };
    report.push(row);

    if (missingInManifest.length) {
      failed = true;
      console.error('\n[' + key + '] FAIL — template uses content keys not in theme.json:');
      missingInManifest.forEach((k) => console.error('  -', k));
    } else {
      console.log('[' + key + '] OK — all used content.* keys have manifest entries.');
    }
    if (unusedInTemplates.length && process.env.VALIDATE_THEMES_VERBOSE === '1') {
      console.log('  (verbose) manifest keys never referenced in .ejs:', unusedInTemplates.join(', ') || '(none)');
    }
  }

  console.log('\nThemes checked:', dirs.length);
  if (failed) {
    console.error('\nvalidate-theme-manifests: FAILED');
    process.exit(1);
  }
  console.log('validate-theme-manifests: PASSED');
  process.exit(0);
}

main();
