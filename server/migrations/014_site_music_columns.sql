-- Repair: kolom musik undangan (jika 002 belum benar-benar ter-apply di production)
ALTER TABLE sites ADD COLUMN music_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN music_autoplay TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN music_url VARCHAR(1024) NULL;
