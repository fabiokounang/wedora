/**
 * HTTP smoke: GET publik untuk setiap slug preview-{themeKey} (hasil seed / sync-theme-previews).
 * Jalankan server: npm start   lalu (disarankan): npm run seed
 *
 * Usage: node src/scripts/e2e-http-preview-themes.js [--base http://127.0.0.1:3000]
 */
require('dotenv').config();

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].replace(/\/$/, '');
  return process.env.E2E_BASE || 'http://127.0.0.1:3000';
})();

const themeLoader = require('../services/themeLoader');

async function fetchHtml(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const themes = themeLoader.getThemeList().filter((t) => !t.broken);
  console.log('e2e-http-preview-themes — base:', BASE);
  console.log('Themes:', themes.map((t) => t.key).join(', '));

  let failed = false;
  for (const t of themes) {
    const slug = `preview-${t.key}`;
    const url = `${BASE}/?site=${encodeURIComponent(slug)}`;
    try {
      const { status, text } = await fetchHtml(url);
      const ok = status === 200 && text && text.length > 400 && /<!DOCTYPE/i.test(text);
      if (!ok) {
        failed = true;
        console.error(`[${t.key}] FAIL status=${status} len=${text ? text.length : 0} url=${url}`);
        if (text && text.length < 800) console.error(text.slice(0, 500));
      } else {
        console.log(`[${t.key}] OK preview-${t.key} (${text.length} chars)`);
      }
    } catch (e) {
      failed = true;
      console.error(`[${t.key}] FAIL`, e.message);
    }
  }

  if (failed) {
    console.error('\ne2e-http-preview-themes: FAILED (pastikan server & npm run seed)');
    process.exit(1);
  }
  console.log('\ne2e-http-preview-themes: PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
