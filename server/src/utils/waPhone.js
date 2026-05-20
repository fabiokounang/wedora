/**
 * Build https://wa.me/... with optional pre-filled text (max ~2000 chars safe for URL).
 */
function buildWaMeLink(phoneDigits, text) {
  const enc = text != null && String(text).trim() ? `?text=${encodeURIComponent(String(text))}` : '';
  return `https://wa.me/${phoneDigits}${enc}`;
}

/**
 * Parse one line into E.164-style digits (no +) for wa.me, Indonesia-first.
 */
function parsePhoneLine(line) {
  const raw = String(line).trim();
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length < 8) return { raw, error: 'Nomor terlalu pendek' };

  if (d.startsWith('62')) {
    if (d.length < 10 || d.length > 15) return { raw, error: 'Format 62... tidak valid' };
    return { raw, e164: d };
  }
  if (d.startsWith('0') && d.length >= 10 && d.length <= 13) {
    return { raw, e164: '62' + d.slice(1) };
  }
  if (d.startsWith('8') && d.length >= 9 && d.length <= 12) {
    return { raw, e164: '62' + d };
  }
  if (d.length >= 10 && d.length <= 15 && !d.startsWith('0')) {
    return { raw, e164: d };
  }
  return { raw, error: 'Tidak dikenali. Contoh: 0812…, 62812…, atau kode negara + nomor.' };
}

function parsePhoneList(text) {
  return String(text || '')
    .split(/[\r\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

module.exports = { buildWaMeLink, parsePhoneLine, parsePhoneList };
