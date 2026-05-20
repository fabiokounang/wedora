-- invitation = real wedding sites in admin dashboard; theme_catalog = public theme demos (preview-theme*)
ALTER TABLE sites
  ADD COLUMN site_type ENUM('invitation', 'theme_catalog') NOT NULL DEFAULT 'invitation' AFTER slug;

UPDATE sites SET site_type = 'theme_catalog' WHERE slug LIKE 'preview-%';
