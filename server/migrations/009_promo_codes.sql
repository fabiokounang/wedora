-- Promo / voucher codes for billing (percent or fixed IDR off; 100% = free checkout without Midtrans)

CREATE TABLE IF NOT EXISTS promo_codes (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                  VARCHAR(64)  NOT NULL,
  description           VARCHAR(255) NULL,
  discount_type         ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
  discount_value        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'percent 0-100 or IDR off for fixed',
  max_uses              INT UNSIGNED NULL COMMENT 'NULL = unlimited paid redemptions',
  per_user_limit        INT UNSIGNED NOT NULL DEFAULT 1,
  valid_from            DATETIME NULL,
  valid_until           DATETIME NULL,
  applicable_plans      JSON NULL COMMENT 'JSON array of plan codes, or NULL for all plans',
  active                TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_codes_code (code),
  KEY ix_promo_codes_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE payment_orders
  ADD COLUMN promo_code VARCHAR(64) NULL AFTER plan_code;
ALTER TABLE payment_orders
  ADD COLUMN original_amount INT UNSIGNED NULL COMMENT 'plan list price before discount' AFTER gross_amount;
ALTER TABLE payment_orders
  ADD COLUMN discount_amount INT UNSIGNED NOT NULL DEFAULT 0 AFTER original_amount;
