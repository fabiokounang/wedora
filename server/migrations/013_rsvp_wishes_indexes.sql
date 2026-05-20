-- Composite indexes for guest traffic: list by site + recency / filter approved.
-- Replaces single-column site_id indexes (leftmost prefix covers site-only lookups).

ALTER TABLE rsvps ADD INDEX ix_rsvps_site_created (site_id, created_at);
ALTER TABLE rsvps DROP INDEX ix_rsvps_site;

ALTER TABLE wishes ADD INDEX ix_wishes_site_approved_created (site_id, approved, created_at);
ALTER TABLE wishes DROP INDEX ix_wishes_site;
