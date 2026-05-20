-- Invalidate JWT sessions server-side after logout / password change via token_version claim

ALTER TABLE users
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER email_verified_at;
