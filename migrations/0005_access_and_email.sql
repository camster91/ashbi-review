INSERT OR IGNORE INTO users(id,email,name) VALUES('cameron','cameron@ashbi.ca','Cameron'),('bianca','bianca@ashbi.ca','Bianca');
CREATE TABLE login_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE login_throttle(user_id TEXT PRIMARY KEY REFERENCES users(id),requested_at INTEGER NOT NULL);
CREATE TABLE email_batches(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,sent_at INTEGER,provider_id TEXT);
CREATE TABLE notification_queue(comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,batch_id TEXT REFERENCES email_batches(id));
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX login_tokens_expiry ON login_tokens(expires_at);
CREATE INDEX notification_batch ON notification_queue(batch_id);
