const fs = require('fs');
const path = require('path');

function uniqueRoots(roots) {
  const out = [];
  const seen = new Set();
  for (const r of roots) {
    if (!r) continue;
    const abs = path.resolve(r);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

function resolveThemeRoots() {
  const fromEnv = process.env.THEMES_DIR ? path.resolve(process.cwd(), process.env.THEMES_DIR) : null;
  const fromPackage = path.resolve(__dirname, '..', '..', '..', 'themes');
  const fromCwd = path.resolve(process.cwd(), 'themes');
  const fromServerSibling = path.resolve(__dirname, '..', '..', 'themes');
  return uniqueRoots([fromEnv, fromPackage, fromCwd, fromServerSibling]);
}

const THEMES_ROOTS = resolveThemeRoots();
const THEMES_DIR = THEMES_ROOTS.find((r) => fs.existsSync(r)) || THEMES_ROOTS[0] || path.resolve(__dirname, '..', '..', '..', 'themes');

const cache = new Map();
const themeDirCache = new Map();
const isDev = () => process.env.NODE_ENV !== 'production';

function themePath(key, ...parts) {
  const root = themeDirCache.get(key) || THEMES_DIR;
  return path.join(root, key, ...parts);
}

function listThemeDirs() {
  const keys = new Map();
  for (const root of THEMES_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const name = d.name;
      const manifest = path.join(root, name, 'theme.json');
      if (!fs.existsSync(manifest)) continue;
      if (!keys.has(name)) keys.set(name, root);
    }
  }
  return keys;
}

function getManifest(key) {
  if (!isDev() && cache.has(key)) return cache.get(key);
  let manifestFile = themePath(key, 'theme.json');
  if (!fs.existsSync(manifestFile)) {
    let foundRoot = null;
    for (const root of THEMES_ROOTS) {
      const candidate = path.join(root, key, 'theme.json');
      if (fs.existsSync(candidate)) {
        foundRoot = root;
        manifestFile = candidate;
        break;
      }
    }
    if (!foundRoot) throw new Error(`theme "${key}" not found`);
    themeDirCache.set(key, foundRoot);
  }
  if (!fs.existsSync(manifestFile)) throw new Error(`theme "${key}" not found`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  cache.set(key, manifest);
  return manifest;
}

function getThemeList() {
  const dirByKey = listThemeDirs();
  const themes = [...dirByKey.entries()].map(([key, root]) => {
    try {
      themeDirCache.set(key, root);
      const m = getManifest(key);
      return { key: m.key || key, name: m.name || key, version: m.version, preview: m.preview };
    } catch {
      return { key, name: key, broken: true };
    }
  });
  return themes.sort((a, b) => a.key.localeCompare(b.key));
}

function getTemplatePath(key) {
  const p = themePath(key, 'template.ejs');
  if (!fs.existsSync(p)) throw new Error(`template.ejs missing for theme "${key}"`);
  return p;
}

function getPublicDir(key) {
  return themePath(key, 'public');
}

/** Public URL for dashboard / marketing thumbnails (served under `/themes/:key/public`). */
function getPreviewUrl(key) {
  const k = key && String(key).trim() ? String(key).trim() : 'theme1';
  const fallback = `/themes/${k}/public/preview.svg`;
  try {
    const m = getManifest(k);
    if (m.preview && String(m.preview).trim()) return String(m.preview).trim();
  } catch (_) {}
  return fallback;
}

function clearCache() {
  cache.clear();
  themeDirCache.clear();
}

module.exports = {
  THEMES_DIR,
  THEMES_ROOTS,
  getManifest,
  getThemeList,
  getTemplatePath,
  getPublicDir,
  getPreviewUrl,
  clearCache,
};
