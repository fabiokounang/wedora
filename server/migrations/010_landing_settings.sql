-- CMS konten publik: beranda, pricing, CTA, footer, SEO (satu baris JSON)

CREATE TABLE IF NOT EXISTS landing_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  content JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO landing_settings (id, content)
VALUES (1, CAST('{}' AS JSON))
ON DUPLICATE KEY UPDATE id = id;
