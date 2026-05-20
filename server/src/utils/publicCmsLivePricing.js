const { listPlans } = require('../services/billingPlans');

function formatRpId(amount) {
  return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}

function formatValidityShort(plan) {
  const v = String(plan.validity_label || '');
  if (/selamanya/i.test(v)) return 'Selamanya';
  const m = v.match(/(\d+)\s*bulan/i);
  if (m) return `${m[1]} bulan`;
  return v.replace(/^aktif\s+/i, '').trim() || v;
}

/**
 * Isi baris "Harga per acara" dan "Masa aktif" dari billingPlans agar selaras checkout.
 */
function injectLiveCompareRows(compareRows) {
  const plans = listPlans();
  const byCode = {};
  for (const p of plans) byCode[p.code] = p;
  if (!byCode.starter || !byCode.standard || !byCode.premium) return compareRows || [];
  return (compareRows || []).map((row) => {
    if (!row || typeof row !== 'object') return row;
    const feature = String(row.feature || '').trim();
    if (feature === 'Harga per acara') {
      return {
        ...row,
        starter: formatRpId(byCode.starter.amount),
        standard: formatRpId(byCode.standard.amount),
        premium: formatRpId(byCode.premium.amount),
      };
    }
    if (feature === 'Masa aktif') {
      return {
        ...row,
        starter: formatValidityShort(byCode.starter),
        standard: formatValidityShort(byCode.standard),
        premium: formatValidityShort(byCode.premium),
      };
    }
    return row;
  });
}

module.exports = {
  injectLiveCompareRows,
  formatRpId,
  formatValidityShort,
};
