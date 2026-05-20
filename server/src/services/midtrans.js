const crypto = require('crypto');
const midtransClient = require('midtrans-client');

function getSnapClient() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!serverKey || !clientKey) {
    throw new Error('Midtrans is not configured. Set MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY.');
  }
  return new midtransClient.Snap({
    isProduction: String(process.env.MIDTRANS_IS_PRODUCTION || 'false') === 'true',
    serverKey,
    clientKey,
  });
}

function grossAmountSignatureCandidates(raw) {
  if (raw == null || raw === '') return [];
  const s = String(raw).trim();
  const out = [s];
  const n = Number(s);
  if (Number.isFinite(n)) {
    out.push(n.toFixed(2));
    out.push(String(Math.trunc(n)));
  }
  return [...new Set(out)];
}

function verifySignature(payload) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return false;
  const orderId = String(payload.order_id || '');
  const statusCode = String(payload.status_code || '');
  const signatureKey = String(payload.signature_key || '').toLowerCase();
  if (!orderId || !statusCode || !signatureKey) return false;

  const candidates = grossAmountSignatureCandidates(payload.gross_amount);
  for (const grossAmount of candidates) {
    const expected = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex')
      .toLowerCase();
    if (signatureKey === expected) return true;
  }
  return false;
}

function mapTransactionToOrderStatus(transactionStatus, fraudStatus) {
  const tx = String(transactionStatus || '').toLowerCase();
  const fraud = String(fraudStatus || '').toLowerCase();
  if (tx === 'settlement') return 'paid';
  if (tx === 'capture') {
    return fraud === 'accept' ? 'paid' : 'pending';
  }
  if (tx === 'pending') return 'pending';
  if (tx === 'deny' || tx === 'failure') return 'failed';
  if (tx === 'expire') return 'expired';
  if (tx === 'cancel') return 'cancelled';
  if (tx === 'refund' || tx === 'partial_refund' || tx === 'chargeback' || tx === 'partial_chargeback') {
    return 'failed';
  }
  return 'pending';
}

function extractVaNumber(payload) {
  const vaList = Array.isArray(payload.va_numbers) ? payload.va_numbers : [];
  const firstVa = vaList[0] && vaList[0].va_number ? String(vaList[0].va_number).trim() : '';
  if (firstVa) return firstVa;
  const permata = payload.permata_va_number ? String(payload.permata_va_number).trim() : '';
  if (permata) return permata;
  return null;
}

function extractQrisImageUrl(payload) {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const byName = actions.find((a) => {
    const name = String(a && a.name ? a.name : '').toLowerCase();
    return name === 'generate-qr-code' || name === 'generate-qrcode' || name.includes('qr');
  });
  if (byName && byName.url) return String(byName.url).trim() || null;
  const byUrl = actions.find((a) => {
    const u = String(a && a.url ? a.url : '');
    return u.includes('qris') || u.includes('qr-code') || u.includes('qrcode');
  });
  return byUrl && byUrl.url ? String(byUrl.url).trim() : null;
}

module.exports = {
  getSnapClient,
  verifySignature,
  mapTransactionToOrderStatus,
  extractVaNumber,
  extractQrisImageUrl,
};
