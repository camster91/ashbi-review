ALTER TABLE reviews ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled review';
ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id);
CREATE INDEX comments_parent ON comments(parent_id);
