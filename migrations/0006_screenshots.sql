ALTER TABLE reviews ADD COLUMN screenshot_key TEXT;
ALTER TABLE reviews ADD COLUMN screenshot_width INTEGER;
ALTER TABLE reviews ADD COLUMN screenshot_path TEXT;
ALTER TABLE reviews ADD COLUMN captured_at INTEGER;
ALTER TABLE pins ADD COLUMN screenshot_status TEXT NOT NULL DEFAULT 'pending' CHECK(screenshot_status IN('pending','saved','failed'));
