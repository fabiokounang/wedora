ALTER TABLE payment_orders
  ADD COLUMN va_number VARCHAR(64) NULL AFTER payment_type,
  ADD COLUMN qris_image_url TEXT NULL AFTER va_number;
