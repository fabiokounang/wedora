/** Daftar kolom eksplisit — jangan pakai SELECT * di query aplikasi. */

const SITES_COLUMNS =
  'id, owner_user_id, slug, site_type, custom_domain, theme_key, managed_by, status, published_at, expires_at, music_enabled, music_autoplay, music_url, created_at, updated_at';

const SITES_SELECT_PREFIXED = SITES_COLUMNS.split(', ')
  .map((c) => `sites.${c.trim()}`)
  .join(', ');

const PAYMENT_ORDER_COLUMNS =
  'id, order_id, user_id, plan_code, promo_code, gross_amount, original_amount, discount_amount, currency, status, snap_token, snap_redirect_url, midtrans_transaction_id, midtrans_order_id, payment_type, transaction_status, fraud_status, va_number, qris_image_url, paid_at, last_notified_at, raw_notification, created_at, updated_at';

const PROMO_CODE_COLUMNS =
  'id, code, description, discount_type, discount_value, max_uses, per_user_limit, valid_from, valid_until, applicable_plans, active, created_at, updated_at';

const MEDIA_COLUMNS = 'id, site_id, filename, original_name, mime_type, size, url, created_at';

const COLLECTION_COLUMNS = {
  story_items: 'id, site_id, date_label, title, description, sort_order',
  events: 'id, site_id, event_type, title, venue_name, address, datetime, map_url, notes, sort_order',
  gallery_items: 'id, site_id, image_url, thumbnail_url, caption, sort_order, created_at',
  gift_accounts: 'id, site_id, bank_name, account_name, account_number, qr_image_url, sort_order',
};

/** Parameter untuk LIMIT 1 (selalu ter-parameterisasi). */
const LIMIT_ONE = 1;

function collectionColumns(table) {
  const cols = COLLECTION_COLUMNS[table];
  if (!cols) throw new Error(`unknown collection table for columns: ${table}`);
  return cols;
}

module.exports = {
  SITES_COLUMNS,
  SITES_SELECT_PREFIXED,
  PAYMENT_ORDER_COLUMNS,
  PROMO_CODE_COLUMNS,
  MEDIA_COLUMNS,
  COLLECTION_COLUMNS,
  collectionColumns,
  LIMIT_ONE,
};
