-- WhatsApp blast (riwayat + daftar penerima per blast)
CREATE TABLE IF NOT EXISTS wa_blasts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id         INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NULL,
  message         TEXT NOT NULL,
  recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_wa_blasts_site (site_id),
  KEY ix_wa_blasts_user (user_id),
  CONSTRAINT fk_wa_blasts_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_blasts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wa_blast_recipients (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  blast_id    INT UNSIGNED NOT NULL,
  phone_raw   VARCHAR(64) NOT NULL,
  phone_e164  VARCHAR(32) NOT NULL,
  wa_link     TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY ix_wa_blast_recipients_blast (blast_id),
  CONSTRAINT fk_wa_blast_recipients_blast FOREIGN KEY (blast_id) REFERENCES wa_blasts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
