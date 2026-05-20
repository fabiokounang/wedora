-- Background music per site (optional URL, autoplay vs tap-to-play)
ALTER TABLE sites
  ADD COLUMN music_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER custom_domain,
  ADD COLUMN music_autoplay TINYINT(1) NOT NULL DEFAULT 0 AFTER music_enabled,
  ADD COLUMN music_url VARCHAR(1024) NULL AFTER music_autoplay;
