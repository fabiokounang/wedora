const themeLoader = require('../../src/services/themeLoader');

/** Semua tema yang punya `theme.json` (sama seperti seed / katalog). */
function getValidThemeKeys() {
  return themeLoader
    .getThemeList()
    .filter((t) => !t.broken)
    .map((t) => t.key);
}

module.exports = { getValidThemeKeys, themeLoader };
