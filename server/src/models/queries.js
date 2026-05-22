const { pool, query, one } = require('../db');
const {
  SITES_COLUMNS,
  SITES_SELECT_PREFIXED,
  PAYMENT_ORDER_COLUMNS,
  PROMO_CODE_COLUMNS,
  MEDIA_COLUMNS,
  collectionColumns,
  LIMIT_ONE,
} = require('./sqlColumns');

function selectSiteSql(whereClause) {
  return `SELECT ${SITES_COLUMNS} FROM sites WHERE ${whereClause}`;
}

async function getSiteById(id) {
  return one(selectSiteSql('id = ?'), [id]);
}

async function getSiteBySlug(slug) {
  return one(selectSiteSql('slug = ? LIMIT ?'), [slug, LIMIT_ONE]);
}

async function getSiteByCustomDomain(host) {
  return one(selectSiteSql('custom_domain = ? LIMIT ?'), [host, LIMIT_ONE]);
}

async function listSites(filter = {}) {
  const where = [];
  const params = [];
  if (filter.owner_user_id) {
    where.push('sites.owner_user_id = ?');
    params.push(filter.owner_user_id);
  }
  if (filter.invitation_only) {
    where.push("sites.site_type = 'invitation'");
  }
  /* "Punya client" = pemilik site adalah user ber-role client (bukan cuma owner_user_id terisi — seed/demo sering pakai super_admin) */
  if (filter.assign === 'client') {
    where.push("owner.role = 'client'");
  } else if (filter.assign === 'admin') {
    where.push("(sites.owner_user_id IS NULL OR owner.role IS NULL OR owner.role <> 'client')");
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT ${SITES_SELECT_PREFIXED}, owner.role AS owner_user_role,
      (SELECT COUNT(*) FROM rsvps r WHERE r.site_id = sites.id) AS rsvp_count,
      (SELECT COUNT(*) FROM wishes w WHERE w.site_id = sites.id) AS wish_count
    FROM sites
    LEFT JOIN users AS owner ON owner.id = sites.owner_user_id
    ${whereSql}
    ORDER BY sites.id DESC
  `;
  return query(sql, params);
}

async function createSite({
  owner_user_id = null,
  slug,
  site_type = 'invitation',
  theme_key,
  managed_by = 'admin',
  status = 'draft',
  custom_domain = null,
  music_enabled = 0,
  music_autoplay = 0,
  music_url = null,
}) {
  const st = site_type === 'theme_catalog' ? 'theme_catalog' : 'invitation';
  const res = await query(
    'INSERT INTO sites (owner_user_id, slug, site_type, theme_key, managed_by, status, custom_domain, music_enabled, music_autoplay, music_url) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [owner_user_id, slug, st, theme_key, managed_by, status, custom_domain, music_enabled ? 1 : 0, music_autoplay ? 1 : 0, music_url],
  );
  return one(selectSiteSql('id = ?'), [res.insertId]);
}

async function updateSiteById(siteId, patch = {}) {
  const allowed = [
    'site_type',
    'theme_key',
    'status',
    'managed_by',
    'custom_domain',
    'owner_user_id',
    'published_at',
    'expires_at',
    'music_enabled',
    'music_autoplay',
    'music_url',
  ];
  const fields = [];
  const params = [];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    fields.push(`${key} = ?`);
    params.push(patch[key]);
  }
  if (!fields.length) return getSiteById(siteId);
  params.push(siteId);
  await query(`UPDATE sites SET ${fields.join(', ')} WHERE id = ?`, params);
  return one(selectSiteSql('id = ?'), [siteId]);
}

async function publishSite(siteId) {
  await query("UPDATE sites SET status = 'published', published_at = NOW() WHERE id = ?", [siteId]);
  return one(selectSiteSql('id = ?'), [siteId]);
}

async function unpublishSite(siteId) {
  await query("UPDATE sites SET status = 'approved' WHERE id = ?", [siteId]);
  return one(selectSiteSql('id = ?'), [siteId]);
}

async function setSiteStatus(siteId, status) {
  const allowed = new Set(['draft', 'in_review', 'approved', 'published', 'archived']);
  if (!allowed.has(status)) throw new Error('invalid status');
  if (status === 'published') {
    return publishSite(siteId);
  }
  const patch = { status };
  if (status !== 'published') patch.published_at = null;
  await updateSiteById(siteId, patch);
  return one(selectSiteSql('id = ?'), [siteId]);
}

async function findUserByEmail(email) {
  return one(
    'SELECT id, email, password_hash, name, role, auth_provider, google_sub, email_verified_at, token_version FROM users WHERE email = ?',
    [email]
  );
}

async function findUserByGoogleSub(googleSub) {
  if (!googleSub) return null;
  return one(
    'SELECT id, email, password_hash, name, role, auth_provider, google_sub, email_verified_at, token_version FROM users WHERE google_sub = ?',
    [googleSub]
  );
}

async function createUser({
  email,
  password_hash,
  name,
  role = 'client',
  auth_provider = 'local',
  google_sub = null,
  email_verified_at = null,
}) {
  const res = await query(
    'INSERT INTO users (email, password_hash, name, role, auth_provider, google_sub, email_verified_at) VALUES (?,?,?,?,?,?,?)',
    [email, password_hash, name, role, auth_provider, google_sub, email_verified_at]
  );
  return one(
    'SELECT id, email, name, role, auth_provider, google_sub, email_verified_at, token_version FROM users WHERE id = ?',
    [res.insertId]
  );
}

async function createUserFromGoogle({ email, name, google_sub, email_verified }) {
  const verifiedAt = email_verified ? new Date() : null;
  const res = await query(
    `INSERT INTO users (email, password_hash, name, role, auth_provider, google_sub, email_verified_at)
     VALUES (?, NULL, ?, 'client', 'google', ?, ?)`,
    [email, name, google_sub, verifiedAt]
  );
  return one(
    'SELECT id, email, name, role, auth_provider, google_sub, email_verified_at, token_version FROM users WHERE id = ?',
    [res.insertId]
  );
}

async function getUserById(id) {
  return one(
    'SELECT id, email, name, role, auth_provider, google_sub, email_verified_at, token_version FROM users WHERE id = ?',
    [id]
  );
}

async function bumpUserTokenVersion(userId) {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
}

async function updateUserById(userId, { email, name, role, password_hash = undefined }) {
  if (password_hash != null) {
    await query('UPDATE users SET email = ?, name = ?, role = ?, password_hash = ? WHERE id = ?', [
      email,
      name,
      role,
      password_hash,
      userId,
    ]);
  } else {
    await query('UPDATE users SET email = ?, name = ?, role = ? WHERE id = ?', [email, name, role, userId]);
  }
  return getUserById(userId);
}

async function updateUserPasswordHash(userId, passwordHash) {
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

async function updateUserEmail(userId, email) {
  await query('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?', [email, userId]);
}

async function setUserEmailVerifiedNow(userId) {
  await query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [userId]);
}

async function linkGoogleToUser(userId, googleSub, verifiedFromGoogle) {
  if (verifiedFromGoogle) {
    await query(
      `UPDATE users SET auth_provider = 'google', google_sub = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?`,
      [googleSub, userId]
    );
  } else {
    await query(`UPDATE users SET auth_provider = 'google', google_sub = ? WHERE id = ?`, [googleSub, userId]);
  }
  return getUserById(userId);
}

async function deletePendingUserTokens(userId, type) {
  await query('DELETE FROM user_tokens WHERE user_id = ? AND type = ? AND used_at IS NULL', [userId, type]);
}

async function insertUserToken(userId, type, tokenHash, expiresAt) {
  const res = await query(
    'INSERT INTO user_tokens (user_id, type, token_hash, expires_at) VALUES (?,?,?,?)',
    [userId, type, tokenHash, expiresAt]
  );
  return res.insertId;
}

async function findValidUserToken(type, tokenHash) {
  return one(
    `SELECT id, user_id, type, expires_at, used_at FROM user_tokens
     WHERE type = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
    [type, tokenHash]
  );
}

async function markUserTokenUsed(id) {
  await query('UPDATE user_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [id]);
}

async function deleteUserById(userId) {
  await query('DELETE FROM users WHERE id = ?', [userId]);
}

async function countUsersByRole(role) {
  const row = await one('SELECT COUNT(*) AS c FROM users WHERE role = ?', [role]);
  return row ? Number(row.c) : 0;
}

/** @param {{ role?: string }} [filter] */
async function listUsers(filter = {}) {
  const where = [];
  const params = [];
  if (filter.role) {
    where.push('role = ?');
    params.push(filter.role);
  }
  const sql = `SELECT id, email, name, role FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC, id ASC`;
  return query(sql, params);
}

/**
 * @param {{ page?: number, limit?: number, search?: string, role?: string, sort?: string, order?: string }} [opts]
 */
async function listUsersPaged(opts = {}) {
  let page = parseInt(opts.page, 10);
  if (Number.isNaN(page) || page < 1) page = 1;
  let limit = parseInt(opts.limit, 10);
  if (Number.isNaN(limit) || limit < 1) limit = 10;
  limit = Math.min(limit, 100);

  const search = (opts.search && String(opts.search).trim()) || '';
  const role = opts.role === 'super_admin' || opts.role === 'client' ? opts.role : null;
  const sortKey = opts.sort || 'name';
  const order = opts.order === 'desc' ? 'DESC' : 'ASC';
  const sortColMap = { name: 'name', email: 'email', id: 'id', role: 'role', created: 'created_at' };
  const sortCol = sortColMap[sortKey] ? sortColMap[sortKey] : 'name';

  const where = [];
  const params = [];
  if (role) {
    where.push('role = ?');
    params.push(role);
  }
  if (search) {
    where.push('(name LIKE ? OR email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = await one(`SELECT COUNT(*) AS c FROM users ${whereSql}`, params);
  const total = countRow ? Number(countRow.c) : 0;

  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);
  if (page > totalPages) page = totalPages;

  const offset = (page - 1) * limit;
  const sql = `SELECT id, email, name, role, created_at FROM users ${whereSql} ORDER BY ${sortCol} ${order}, id ASC LIMIT ? OFFSET ?`;
  const rows = await query(sql, [...params, limit, offset]);

  return { rows, total, page, limit, totalPages };
}

async function getSiteContent(siteId) {
  const row = await one('SELECT data, theme_overrides, updated_at FROM site_content WHERE site_id = ?', [siteId]);
  if (!row) return { data: {}, theme_overrides: {} };
  return {
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {},
    theme_overrides: row.theme_overrides
      ? (typeof row.theme_overrides === 'string' ? JSON.parse(row.theme_overrides) : row.theme_overrides)
      : {},
    updated_at: row.updated_at,
  };
}

async function upsertSiteContent(siteId, data, themeOverrides) {
  const existing = await one('SELECT site_id FROM site_content WHERE site_id = ?', [siteId]);
  const dataJson = JSON.stringify(data || {});
  const overridesJson = themeOverrides == null ? null : JSON.stringify(themeOverrides);
  if (existing) {
    await query(
      'UPDATE site_content SET data = CAST(? AS JSON), theme_overrides = ' +
        (overridesJson == null ? 'theme_overrides' : 'CAST(? AS JSON)') +
        ' WHERE site_id = ?',
      overridesJson == null ? [dataJson, siteId] : [dataJson, overridesJson, siteId]
    );
  } else {
    await query(
      'INSERT INTO site_content (site_id, data, theme_overrides) VALUES (?, CAST(? AS JSON), ' +
        (overridesJson == null ? 'NULL' : 'CAST(? AS JSON)') +
        ')',
      overridesJson == null ? [siteId, dataJson] : [siteId, dataJson, overridesJson]
    );
  }
}

async function getSiteSections(siteId) {
  return query(
    'SELECT id, section_key, enabled, sort_order, config FROM site_sections WHERE site_id = ? ORDER BY sort_order ASC',
    [siteId]
  );
}

async function upsertSection(siteId, sectionKey, { enabled, sort_order, config }) {
  const existing = await one(
    'SELECT id FROM site_sections WHERE site_id = ? AND section_key = ?',
    [siteId, sectionKey]
  );
  if (existing) {
    await query(
      'UPDATE site_sections SET enabled = COALESCE(?, enabled), sort_order = COALESCE(?, sort_order), config = COALESCE(?, config) WHERE id = ?',
      [enabled, sort_order, config ? JSON.stringify(config) : null, existing.id]
    );
    return existing.id;
  }
  const res = await query(
    'INSERT INTO site_sections (site_id, section_key, enabled, sort_order, config) VALUES (?,?,?,?,?)',
    [siteId, sectionKey, enabled ?? 1, sort_order ?? 0, config ? JSON.stringify(config) : null]
  );
  return res.insertId;
}

const COLLECTION_TABLES = {
  story_items: { fields: ['date_label', 'title', 'description', 'sort_order'] },
  events: { fields: ['event_type', 'title', 'venue_name', 'address', 'datetime', 'map_url', 'notes', 'sort_order'] },
  gallery_items: { fields: ['image_url', 'thumbnail_url', 'caption', 'sort_order'] },
  gift_accounts: { fields: ['bank_name', 'account_name', 'account_number', 'qr_image_url', 'sort_order'] },
};

function getCollectionConfig(table) {
  if (!COLLECTION_TABLES[table]) throw new Error(`unknown collection: ${table}`);
  return COLLECTION_TABLES[table];
}

async function listCollection(table, siteId) {
  getCollectionConfig(table);
  const cols = collectionColumns(table);
  return query(`SELECT ${cols} FROM ${table} WHERE site_id = ? ORDER BY sort_order ASC, id ASC`, [siteId]);
}

async function createCollectionItem(table, siteId, values) {
  const cfg = getCollectionConfig(table);
  const fields = cfg.fields.filter((f) => Object.prototype.hasOwnProperty.call(values, f));
  const insertCols = ['site_id', ...fields];
  const placeholders = insertCols.map(() => '?').join(',');
  const params = [siteId, ...fields.map((f) => values[f])];
  const res = await query(`INSERT INTO ${table} (${insertCols.join(',')}) VALUES (${placeholders})`, params);
  const selectCols = collectionColumns(table);
  return one(`SELECT ${selectCols} FROM ${table} WHERE id = ?`, [res.insertId]);
}

async function updateCollectionItem(table, siteId, id, values) {
  const cfg = getCollectionConfig(table);
  const cols = collectionColumns(table);
  const fields = cfg.fields.filter((f) => Object.prototype.hasOwnProperty.call(values, f));
  if (fields.length === 0) {
    return one(`SELECT ${cols} FROM ${table} WHERE id = ? AND site_id = ?`, [id, siteId]);
  }
  const setSql = fields.map((f) => `${f} = ?`).join(', ');
  const params = [...fields.map((f) => values[f]), id, siteId];
  await query(`UPDATE ${table} SET ${setSql} WHERE id = ? AND site_id = ?`, params);
  return one(`SELECT ${cols} FROM ${table} WHERE id = ? AND site_id = ?`, [id, siteId]);
}

async function deleteCollectionItem(table, siteId, id) {
  getCollectionConfig(table);
  const res = await query(`DELETE FROM ${table} WHERE id = ? AND site_id = ?`, [id, siteId]);
  return res.affectedRows > 0;
}

async function listWishes(siteId, { approvedOnly = true, limit = 200 } = {}) {
  return query(
    `SELECT id, guest_name, message, approved, created_at
     FROM wishes
     WHERE site_id = ?${approvedOnly ? ' AND approved = 1' : ''}
     ORDER BY created_at DESC
     LIMIT ?`,
    [siteId, limit]
  );
}

async function createWish(siteId, { guest_name, message }) {
  const res = await query(
    'INSERT INTO wishes (site_id, guest_name, message, approved) VALUES (?,?,?,1)',
    [siteId, guest_name, message]
  );
  return one('SELECT id, guest_name, message, approved, created_at FROM wishes WHERE id = ?', [res.insertId]);
}

async function listRsvps(siteId) {
  try {
    return await query(
      'SELECT id, guest_name, guest_phone, attendance, guests_count, notes, ip, created_at FROM rsvps WHERE site_id = ? ORDER BY created_at DESC',
      [siteId]
    );
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      const rows = await query(
        'SELECT id, guest_name, attendance, guests_count, notes, ip, created_at FROM rsvps WHERE site_id = ? ORDER BY created_at DESC',
        [siteId]
      );
      return rows.map((r) => Object.assign({ guest_phone: null }, r));
    }
    throw err;
  }
}

async function createRsvp(siteId, { guest_name, guest_phone, attendance, guests_count, notes, ip }) {
  try {
    const res = await query(
      'INSERT INTO rsvps (site_id, guest_name, guest_phone, attendance, guests_count, notes, ip) VALUES (?,?,?,?,?,?,?)',
      [siteId, guest_name, guest_phone || null, attendance, guests_count || 1, notes || null, ip || null]
    );
    return one(
      'SELECT id, guest_name, guest_phone, attendance, guests_count, notes, created_at FROM rsvps WHERE id = ?',
      [res.insertId]
    );
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      const res = await query(
        'INSERT INTO rsvps (site_id, guest_name, attendance, guests_count, notes, ip) VALUES (?,?,?,?,?,?)',
        [siteId, guest_name, attendance, guests_count || 1, notes || null, ip || null]
      );
      const row = await one(
        'SELECT id, guest_name, attendance, guests_count, notes, created_at FROM rsvps WHERE id = ?',
        [res.insertId]
      );
      return Object.assign({ guest_phone: null }, row);
    }
    throw err;
  }
}

async function createMedia(siteId, { filename, original_name, mime_type, size, url }) {
  const res = await query(
    'INSERT INTO media (site_id, filename, original_name, mime_type, size, url) VALUES (?,?,?,?,?,?)',
    [siteId, filename, original_name, mime_type, size, url]
  );
  return one(`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`, [res.insertId]);
}

async function listMediaBySite(siteId, limit = 500) {
  return query(
    `SELECT ${MEDIA_COLUMNS} FROM media WHERE site_id = ? ORDER BY created_at DESC LIMIT ?`,
    [siteId, limit]
  );
}

async function logActivity(siteId, userId, action, meta) {
  try {
    await query(
      'INSERT INTO activity_logs (site_id, user_id, action, meta) VALUES (?,?,?,?)',
      [siteId || null, userId || null, action, meta ? JSON.stringify(meta) : null]
    );
  } catch (err) {
    console.error('activity_log failed', err.message);
  }
}

async function createWaBlastWithRecipients(siteId, userId, message, rows) {
  if (!rows || !rows.length) return null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      'INSERT INTO wa_blasts (site_id, user_id, message, recipient_count) VALUES (?,?,?,?)',
      [siteId, userId || null, message, rows.length]
    );
    const blastId = ins.insertId;
    for (const r of rows) {
      await conn.query(
        'INSERT INTO wa_blast_recipients (blast_id, phone_raw, phone_e164, wa_link) VALUES (?,?,?,?)',
        [blastId, r.phone_raw, r.phone_e164, r.wa_link]
      );
    }
    await conn.commit();
    return blastId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function listWaBlastsBySite(siteId, limit = 20) {
  return query(
    'SELECT id, message, recipient_count, created_at FROM wa_blasts WHERE site_id = ? ORDER BY created_at DESC LIMIT ?',
    [siteId, limit]
  );
}

async function createPaymentOrder(opts, conn) {
  const {
    order_id,
    user_id,
    plan_code,
    gross_amount,
    currency = 'IDR',
    status = 'pending',
    snap_token = null,
    snap_redirect_url = null,
    promo_code = null,
    original_amount = null,
    discount_amount = 0,
    paid_at = null,
  } = opts;
  const orig = original_amount != null ? Math.floor(Number(original_amount)) : null;
  const disc = Math.max(0, Math.floor(Number(discount_amount) || 0));
  const gross = Math.max(0, Math.floor(Number(gross_amount) || 0));
  const sql = `INSERT INTO payment_orders
      (order_id, user_id, plan_code, promo_code, gross_amount, original_amount, discount_amount, currency, status, snap_token, snap_redirect_url, paid_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
  const params = [
    order_id,
    user_id,
    plan_code,
    promo_code || null,
    gross,
    orig,
    disc,
    currency,
    status,
    snap_token,
    snap_redirect_url,
    paid_at || null,
  ];
  if (conn) {
    const [res] = await conn.query(sql, params);
    const [rows] = await conn.query(`SELECT ${PAYMENT_ORDER_COLUMNS} FROM payment_orders WHERE id = ?`, [
      res.insertId,
    ]);
    return rows[0] || null;
  }
  const res = await query(sql, params);
  return one(`SELECT ${PAYMENT_ORDER_COLUMNS} FROM payment_orders WHERE id = ?`, [res.insertId]);
}

async function updatePaymentOrderSnapFields(orderId, snapToken, snapRedirectUrl) {
  await query(
    'UPDATE payment_orders SET snap_token = ?, snap_redirect_url = ? WHERE order_id = ?',
    [snapToken, snapRedirectUrl, orderId],
  );
}

async function getPaymentOrderByOrderId(orderId) {
  return one(`SELECT ${PAYMENT_ORDER_COLUMNS} FROM payment_orders WHERE order_id = ? LIMIT ?`, [
    orderId,
    LIMIT_ONE,
  ]);
}

async function listPaymentOrdersByUser(userId, limit = 20) {
  return query(
    `SELECT ${PAYMENT_ORDER_COLUMNS} FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, limit]
  );
}

async function getLatestPaidOrderByUser(userId) {
  return one(
    `SELECT ${PAYMENT_ORDER_COLUMNS}
     FROM payment_orders
     WHERE user_id = ? AND status = 'paid'
     ORDER BY paid_at DESC, updated_at DESC, id DESC
     LIMIT ?`,
    [userId, LIMIT_ONE]
  );
}

async function countPaidOrdersByUser(userId) {
  const row = await one(
    `SELECT COUNT(*) AS c FROM payment_orders WHERE user_id = ? AND status = 'paid'`,
    [userId]
  );
  return row ? Number(row.c) : 0;
}

async function countInvitationSitesByOwner(userId) {
  const row = await one(
    `SELECT COUNT(*) AS c FROM sites WHERE owner_user_id = ? AND site_type = 'invitation'`,
    [userId]
  );
  return row ? Number(row.c) : 0;
}

async function updatePaymentOrderAfterMidtrans(
  orderId,
  {
    status,
    transaction_status,
    fraud_status,
    payment_type,
    midtrans_transaction_id,
    va_number,
    qris_image_url,
    raw_notification,
  }
) {
  await query(
    `UPDATE payment_orders
     SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE ? END,
         transaction_status = ?,
         fraud_status = ?,
         payment_type = ?,
         midtrans_transaction_id = ?,
         va_number = ?,
         qris_image_url = ?,
         raw_notification = CAST(? AS JSON),
         last_notified_at = NOW(),
         paid_at = CASE WHEN ? = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
     WHERE order_id = ?`,
    [
      status,
      transaction_status || null,
      fraud_status || null,
      payment_type || null,
      midtrans_transaction_id || null,
      va_number || null,
      qris_image_url || null,
      JSON.stringify(raw_notification || {}),
      status,
      orderId,
    ]
  );
  return getPaymentOrderByOrderId(orderId);
}

async function getPromoCodeByCode(code) {
  if (!code) return null;
  return one(`SELECT ${PROMO_CODE_COLUMNS} FROM promo_codes WHERE code = ? LIMIT ?`, [
    String(code).toUpperCase(),
    LIMIT_ONE,
  ]);
}

async function countPaidOrdersWithPromoCode(code) {
  if (!code) return 0;
  const row = await one(
    `SELECT COUNT(*) AS c FROM payment_orders WHERE promo_code = ? AND status = 'paid'`,
    [String(code).toUpperCase()]
  );
  return row ? Number(row.c) : 0;
}

async function countUserPaidOrdersWithPromoCode(userId, code) {
  if (!code || !userId) return 0;
  const row = await one(
    `SELECT COUNT(*) AS c FROM payment_orders WHERE user_id = ? AND promo_code = ? AND status = 'paid'`,
    [userId, String(code).toUpperCase()]
  );
  return row ? Number(row.c) : 0;
}

async function listPromoCodes() {
  return query(`SELECT ${PROMO_CODE_COLUMNS} FROM promo_codes ORDER BY id DESC`);
}

async function createPromoCode(row) {
  const plansVal = row.applicable_plans_json != null && row.applicable_plans_json !== '' ? row.applicable_plans_json : null;
  const res = await query(
    `INSERT INTO promo_codes
      (code, description, discount_type, discount_value, max_uses, per_user_limit, valid_from, valid_until, applicable_plans, active)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      row.code,
      row.description || null,
      row.discount_type === 'fixed' ? 'fixed' : 'percent',
      Math.max(0, Math.floor(Number(row.discount_value) || 0)),
      row.max_uses === '' || row.max_uses == null ? null : Math.max(0, Math.floor(Number(row.max_uses))),
      Math.max(1, Math.floor(Number(row.per_user_limit) || 1)),
      row.valid_from || null,
      row.valid_until || null,
      plansVal,
      row.active ? 1 : 0,
    ]
  );
  return one(`SELECT ${PROMO_CODE_COLUMNS} FROM promo_codes WHERE id = ?`, [res.insertId]);
}

async function updatePromoCode(id, row) {
  const plansVal = row.applicable_plans_json != null && row.applicable_plans_json !== '' ? row.applicable_plans_json : null;
  await query(
    `UPDATE promo_codes SET
       description = ?,
       discount_type = ?,
       discount_value = ?,
       max_uses = ?,
       per_user_limit = ?,
       valid_from = ?,
       valid_until = ?,
       applicable_plans = ?,
       active = ?
     WHERE id = ?`,
    [
      row.description || null,
      row.discount_type === 'fixed' ? 'fixed' : 'percent',
      Math.max(0, Math.floor(Number(row.discount_value) || 0)),
      row.max_uses === '' || row.max_uses == null ? null : Math.max(0, Math.floor(Number(row.max_uses))),
      Math.max(1, Math.floor(Number(row.per_user_limit) || 1)),
      row.valid_from || null,
      row.valid_until || null,
      plansVal,
      row.active ? 1 : 0,
      id,
    ]
  );
  return one(`SELECT ${PROMO_CODE_COLUMNS} FROM promo_codes WHERE id = ?`, [id]);
}

async function getPromoCodeById(id) {
  return one(`SELECT ${PROMO_CODE_COLUMNS} FROM promo_codes WHERE id = ?`, [id]);
}

async function deletePromoCode(id) {
  await query('DELETE FROM promo_codes WHERE id = ?', [id]);
}

async function getLandingSettings() {
  const ms = Number(process.env.LANDING_DB_TIMEOUT_MS || 8000);
  try {
    const row = await Promise.race([
      one('SELECT id, content, updated_at FROM landing_settings WHERE id = 1'),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('getLandingSettings timeout')), ms);
      }),
    ]);
    if (!row) return null;
    let content = row.content;
    if (content == null) return { content: {} };
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        content = {};
      }
    }
    return { content: typeof content === 'object' && content ? content : {} };
  } catch (err) {
    console.warn('[getLandingSettings]', err.message || err);
    return { content: {} };
  }
}

async function upsertLandingSettings(contentObj) {
  const json = JSON.stringify(contentObj == null ? {} : contentObj);
  await query(
    `INSERT INTO landing_settings (id, content) VALUES (1, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP`,
    [json]
  );
  return getLandingSettings();
}

module.exports = {
  COLLECTION_TABLES,
  getSiteById,
  getSiteBySlug,
  getSiteByCustomDomain,
  listSites,
  createSite,
  updateSiteById,
  publishSite,
  unpublishSite,
  setSiteStatus,
  findUserByEmail,
  findUserByGoogleSub,
  createUser,
  createUserFromGoogle,
  getUserById,
  updateUserById,
  updateUserPasswordHash,
  updateUserEmail,
  setUserEmailVerifiedNow,
  linkGoogleToUser,
  bumpUserTokenVersion,
  deletePendingUserTokens,
  insertUserToken,
  findValidUserToken,
  markUserTokenUsed,
  deleteUserById,
  countUsersByRole,
  listUsers,
  listUsersPaged,
  getSiteContent,
  upsertSiteContent,
  getSiteSections,
  upsertSection,
  listCollection,
  createCollectionItem,
  updateCollectionItem,
  deleteCollectionItem,
  listWishes,
  createWish,
  listRsvps,
  createRsvp,
  createMedia,
  listMediaBySite,
  logActivity,
  createWaBlastWithRecipients,
  listWaBlastsBySite,
  createPaymentOrder,
  getPromoCodeByCode,
  countPaidOrdersWithPromoCode,
  countUserPaidOrdersWithPromoCode,
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  getPromoCodeById,
  getPaymentOrderByOrderId,
  updatePaymentOrderSnapFields,
  listPaymentOrdersByUser,
  getLatestPaidOrderByUser,
  countPaidOrdersByUser,
  countInvitationSitesByOwner,
  updatePaymentOrderAfterMidtrans,
  getLandingSettings,
  upsertLandingSettings,
  _query: query,
};
