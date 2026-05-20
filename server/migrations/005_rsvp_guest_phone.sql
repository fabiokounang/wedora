-- Nomor HP tamu untuk RSVP (opsional)
ALTER TABLE rsvps
  ADD COLUMN guest_phone VARCHAR(40) NULL AFTER guest_name;
