const q = require('../models/queries');
const { PROMO_CODE_COLUMNS, LIMIT_ONE } = require('../models/sqlColumns');

function normalizePromoCode(raw) {
  if (raw == null) return '';
  return String(raw).trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * @param {number} planAmount IDR
 * @param {{ discount_type: string, discount_value: number }} promo
 */
function computeDiscount(planAmount, promo) {
  const amt = Math.max(0, Math.floor(Number(planAmount) || 0));
  if (!promo || amt <= 0) return { discount: 0, final: amt };

  let discount = 0;
  if (promo.discount_type === 'fixed') {
    discount = Math.min(amt, Math.max(0, Math.floor(Number(promo.discount_value) || 0)));
  } else {
    const pct = Math.min(100, Math.max(0, Math.floor(Number(promo.discount_value) || 0)));
    discount = Math.floor((amt * pct) / 100);
    discount = Math.min(discount, amt);
  }
  const final = Math.max(0, amt - discount);
  return { discount, final };
}

function parseApplicablePlans(promo) {
  let plans = null;
  if (promo.applicable_plans != null) {
    if (Array.isArray(promo.applicable_plans)) {
      plans = promo.applicable_plans;
    } else if (typeof promo.applicable_plans === 'string') {
      try { plans = JSON.parse(promo.applicable_plans); } catch (_) { plans = null; }
    } else if (typeof promo.applicable_plans === 'object') {
      plans = promo.applicable_plans;
    }
  }
  if (plans != null && !Array.isArray(plans)) plans = null;
  return plans;
}

/**
 * Validate promo code with row-level locking to prevent TOCTOU race conditions.
 * Must be called within a DB transaction (conn from pool.getConnection()).
 *
 * @param {object} opts
 * @param {string} opts.codeRaw
 * @param {string} opts.planCode
 * @param {number} opts.planAmount
 * @param {number} opts.userId
 * @param {import('mysql2/promise').PoolConnection} opts.conn  DB connection (inside BEGIN)
 */
async function validatePromoForCheckout({ codeRaw, planCode, planAmount, userId, conn }) {
  const code = normalizePromoCode(codeRaw);
  if (!code) {
    return { ok: false, error: 'Masukkan kode promo.', code: '' };
  }

  const queryFn = conn
    ? async (sql, params) => { const [rows] = await conn.query(sql, params); return rows; }
    : async (sql, params) => q._query(sql, params);
  const oneFn = async (sql, params) => { const rows = await queryFn(sql, params); return rows[0] || null; };

  const promo = conn
    ? await oneFn(`SELECT ${PROMO_CODE_COLUMNS} FROM promo_codes WHERE code = ? LIMIT ? FOR UPDATE`, [
        code,
        LIMIT_ONE,
      ])
    : await q.getPromoCodeByCode(code);

  if (!promo) {
    return { ok: false, error: 'Kode promo tidak dikenal.', code };
  }
  if (!(promo.active == 1 || promo.active === true)) {
    return { ok: false, error: 'Kode promo tidak aktif.', code };
  }

  const now = new Date();
  if (promo.valid_from) {
    const from = new Date(promo.valid_from);
    if (!isNaN(from.getTime()) && now < from) {
      return { ok: false, error: 'Kode promo belum berlaku.', code };
    }
  }
  if (promo.valid_until) {
    const until = new Date(promo.valid_until);
    if (!isNaN(until.getTime()) && now > until) {
      return { ok: false, error: 'Kode promo sudah kedaluwarsa.', code };
    }
  }

  const plans = parseApplicablePlans(promo);
  if (Array.isArray(plans) && plans.length > 0) {
    const set = new Set(plans.map((p) => String(p).toLowerCase()));
    if (!set.has(String(planCode).toLowerCase())) {
      return { ok: false, error: 'Kode promo tidak berlaku untuk paket ini.', code };
    }
  }

  const maxUses = promo.max_uses != null ? Number(promo.max_uses) : null;
  if (maxUses != null && !Number.isNaN(maxUses) && maxUses >= 0) {
    const row = await oneFn(
      "SELECT COUNT(*) AS c FROM payment_orders WHERE promo_code = ? AND status = 'paid'",
      [code],
    );
    if (Number(row.c) >= maxUses) {
      return { ok: false, error: 'Kuota kode promo sudah habis.', code };
    }
  }

  const perUser = Math.max(1, Math.floor(Number(promo.per_user_limit) || 1));
  const userRow = await oneFn(
    "SELECT COUNT(*) AS c FROM payment_orders WHERE user_id = ? AND promo_code = ? AND status = 'paid'",
    [userId, code],
  );
  if (Number(userRow.c) >= perUser) {
    return { ok: false, error: 'Anda sudah memakai kode promo ini.', code };
  }

  const { discount, final } = computeDiscount(planAmount, promo);
  return {
    ok: true,
    code,
    promo,
    originalAmount: planAmount,
    discountAmount: discount,
    finalAmount: final,
  };
}

module.exports = {
  normalizePromoCode,
  computeDiscount,
  validatePromoForCheckout,
};
