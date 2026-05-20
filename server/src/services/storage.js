const fs = require('fs');
const path = require('path');
const multer = require('multer');

/** Folder fisik: default `../uploads` dari folder `server/` → sibling folder `uploads/` di root project (sejajar `server/`). */
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || '../uploads');
const PUBLIC_URL = process.env.PUBLIC_UPLOAD_URL || '/uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.heic', '.heif', '.bmp']);

function guessExtFromMime(mime) {
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg') || m === 'image/jpg') return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  if (m.includes('svg')) return '.svg';
  if (m.includes('heic')) return '.heic';
  if (m.includes('heif')) return '.heif';
  if (m.includes('bmp')) return '.bmp';
  return '.png';
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (_req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    let ext = path.extname(file.originalname || '').toLowerCase();
    const origBase = file.originalname || 'file';
    const base = path.basename(origBase, path.extname(origBase)).replace(/[^a-z0-9-_]/gi, '').slice(0, 40) || 'file';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    if (mime.startsWith('audio/') || ext === '.mp3') {
      if (ext !== '.mp3') ext = '.mp3';
      return cb(null, `${base}-${unique}${ext}`);
    }
    if (!ext || !IMAGE_EXT.has(ext)) {
      ext = guessExtFromMime(mime);
      if (!IMAGE_EXT.has(ext)) ext = '.png';
    }
    cb(null, `${base}-${unique}${ext}`);
  },
});

/** Browsers (esp. Windows) often send PNG/JPEG as application/octet-stream — accept known image extensions too. */
function isAllowedImageUpload(file) {
  if (!file) return false;
  const mime = (file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (IMAGE_EXT.has(ext)) {
    if (mime === 'application/octet-stream' || mime === 'binary/octet-stream' || mime === '') return true;
  }
  if (!ext && (mime === 'application/octet-stream' || mime === 'binary/octet-stream' || mime === '')) {
    return true;
  }
  return false;
}

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    if (isAllowedImageUpload(file)) return cb(null, true);
    cb(new Error('only image uploads are allowed'));
  },
});

function isMp3File(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3') return true;
  if (ext === '.mp3' && (file.mimetype === 'application/octet-stream' || /^audio\//.test(file.mimetype))) {
    return true;
  }
  return false;
}

const uploadAudio = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    if (isMp3File(file)) return cb(null, true);
    cb(new Error('Only MP3 files (.mp3, audio/mpeg) are allowed for background music.'));
  },
});

function publicUrlFor(filename) {
  return `${PUBLIC_URL}/${filename}`;
}

module.exports = { upload, uploadAudio, UPLOAD_DIR, PUBLIC_URL, publicUrlFor };
