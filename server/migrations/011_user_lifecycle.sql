-- User lifecycle: OAuth, email verification, password reset tokens

ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;

ALTER TABLE users
  ADD COLUMN auth_provider ENUM('local', 'google') NOT NULL DEFAULT 'local' AFTER password_hash,
  ADD COLUMN google_sub VARCHAR(255) NULL AFTER auth_provider,
  ADD COLUMN email_verified_at DATETIME NULL AFTER google_sub;

ALTER TABLE users ADD UNIQUE KEY uq_users_google_sub (google_sub);

UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS user_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('password_reset', 'email_verify') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_user_tokens_lookup (type, token_hash),
  KEY ix_user_tokens_user (user_id, type),
  CONSTRAINT fk_user_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
