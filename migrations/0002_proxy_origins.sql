-- Only operator-saved origins may be fetched; there is no guest-facing mutation.
ALTER TABLE reviews ADD COLUMN allowed_origins TEXT NOT NULL DEFAULT '[]';
