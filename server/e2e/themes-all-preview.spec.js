const { test, expect } = require('@playwright/test');
const { getValidThemeKeys } = require('./helpers/themeKeys');

/**
 * Undangan demo publik per tema: `/?site=preview-{key}` (situs seed `preview-{key}`).
 * Pastikan DB sudah di-seed: `npm run seed`
 */
test.describe('Semua tema — halaman pratinjau demo (?site=preview-*)', () => {
  for (const key of getValidThemeKeys()) {
    test(`GET /?site=preview-${key} mengembalikan HTML undangan (200, bukan error server)`, async ({ request }) => {
      const resp = await request.get(`/?site=preview-${encodeURIComponent(key)}`, {
        headers: { Accept: 'text/html' },
      });
      expect(resp.status(), `theme ${key}`).toBe(200);
      const html = await resp.text();
      expect(html.length, `theme ${key} empty body`).toBeGreaterThan(500);
      expect(html, `theme ${key}`).not.toMatch(/Internal Server Error|500 — Kesalahan server/i);
      expect(html, `theme ${key}`).not.toMatch(/\bSQLSTATE\b|syntax error near|You have an error in your SQL syntax/i);
    });
  }
});
