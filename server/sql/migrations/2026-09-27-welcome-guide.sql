-- Existing accounts retain their current login experience. New accounts receive
-- the welcome guide, including users added through the existing team module.
ALTER TABLE users ADD COLUMN onboarding_status VARCHAR(20) NOT NULL DEFAULT 'existing'
  CHECK (onboarding_status IN ('existing', 'pending', 'seen'));
ALTER TABLE users ALTER COLUMN onboarding_status SET DEFAULT 'pending';
