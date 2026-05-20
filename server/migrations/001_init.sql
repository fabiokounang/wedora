-- =====================================================
-- Wedding SaaS - Initial Schema
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  role            ENUM('super_admin','client') NOT NULL DEFAULT 'client',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sites (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id   INT UNSIGNED NULL,
  slug            VARCHAR(80)  NOT NULL,
  custom_domain   VARCHAR(190) NULL,
  theme_key       VARCHAR(40)  NOT NULL,
  managed_by      ENUM('self','admin') NOT NULL DEFAULT 'admin',
  status          ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at    DATETIME NULL,
  expires_at      DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sites_slug (slug),
  UNIQUE KEY uq_sites_custom_domain (custom_domain),
  KEY ix_sites_owner (owner_user_id),
  CONSTRAINT fk_sites_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_content (
  site_id          INT UNSIGNED NOT NULL,
  data             JSON NOT NULL,
  theme_overrides  JSON NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id),
  CONSTRAINT fk_site_content_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_sections (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id      INT UNSIGNED NOT NULL,
  section_key  VARCHAR(40)  NOT NULL,
  enabled      TINYINT(1) NOT NULL DEFAULT 1,
  sort_order   INT NOT NULL DEFAULT 0,
  config       JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_section (site_id, section_key),
  CONSTRAINT fk_site_sections_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS story_items (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id      INT UNSIGNED NOT NULL,
  date_label   VARCHAR(120) NULL,
  title        VARCHAR(190) NOT NULL,
  description  TEXT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_story_site (site_id),
  CONSTRAINT fk_story_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id      INT UNSIGNED NOT NULL,
  event_type   VARCHAR(40)  NULL,
  title        VARCHAR(190) NOT NULL,
  venue_name   VARCHAR(190) NULL,
  address      TEXT NULL,
  datetime     DATETIME NULL,
  map_url      TEXT NULL,
  notes        TEXT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_events_site (site_id),
  CONSTRAINT fk_events_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gallery_items (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id        INT UNSIGNED NOT NULL,
  image_url      TEXT NOT NULL,
  thumbnail_url  TEXT NULL,
  caption        VARCHAR(255) NULL,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gallery_site (site_id),
  CONSTRAINT fk_gallery_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gift_accounts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id         INT UNSIGNED NOT NULL,
  bank_name       VARCHAR(120) NOT NULL,
  account_name    VARCHAR(190) NOT NULL,
  account_number  VARCHAR(120) NOT NULL,
  qr_image_url    TEXT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_gift_site (site_id),
  CONSTRAINT fk_gift_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rsvps (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id        INT UNSIGNED NOT NULL,
  guest_name     VARCHAR(190) NOT NULL,
  attendance     ENUM('yes','no') NOT NULL,
  guests_count   INT NOT NULL DEFAULT 1,
  notes          TEXT NULL,
  ip             VARCHAR(64) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_rsvps_site (site_id),
  CONSTRAINT fk_rsvps_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wishes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id      INT UNSIGNED NOT NULL,
  guest_name   VARCHAR(190) NOT NULL,
  message      TEXT NOT NULL,
  approved     TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_wishes_site (site_id),
  CONSTRAINT fk_wishes_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id        INT UNSIGNED NULL,
  filename       VARCHAR(255) NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(120) NOT NULL,
  size           BIGINT UNSIGNED NOT NULL,
  url            TEXT NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_media_site (site_id),
  CONSTRAINT fk_media_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id    INT UNSIGNED NULL,
  user_id    INT UNSIGNED NULL,
  action     VARCHAR(80) NOT NULL,
  meta       JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_logs_site (site_id),
  KEY ix_logs_user (user_id),
  CONSTRAINT fk_logs_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
