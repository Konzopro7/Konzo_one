ALTER TABLE users
  ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mfa_secret TEXT,
  ADD COLUMN mfa_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN mfa_last_step BIGINT,
  ADD COLUMN mfa_recovery_hashes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN mfa_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN mfa_blocked_until TIMESTAMP;

CREATE TABLE auth_challenges (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  mfa_version INTEGER NOT NULL,
  credential_hash VARCHAR(64) NOT NULL,
  pending_secret TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_challenges_expiry ON auth_challenges(expires_at);
CREATE INDEX idx_audit_logs_security ON audit_logs(agency_id, entity_type, created_at DESC);
