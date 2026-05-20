-- Extend site status for admin workflow: draft -> in_review -> approved -> published
ALTER TABLE sites
  MODIFY COLUMN status ENUM('draft','in_review','approved','published','archived') NOT NULL DEFAULT 'draft';

