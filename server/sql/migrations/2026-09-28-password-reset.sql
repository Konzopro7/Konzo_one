CREATE TABLE password_reset_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  credential_hash VARCHAR(64) NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '20 minutes',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_expiry ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);
