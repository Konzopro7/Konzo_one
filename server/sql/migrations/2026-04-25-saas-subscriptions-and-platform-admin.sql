CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(20) NOT NULL DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agencies_plan_tier_check'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_plan_tier_check CHECK (plan_tier IN ('pro', 'premium'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agencies_subscription_status_check'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_subscription_status_check
      CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'agencies_stripe_customer_id_key'
  ) THEN
    CREATE UNIQUE INDEX agencies_stripe_customer_id_key ON agencies(stripe_customer_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'agencies_stripe_subscription_id_key'
  ) THEN
    CREATE UNIQUE INDEX agencies_stripe_subscription_id_key ON agencies(stripe_subscription_id);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS api_request_logs (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(255) NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agencies_subscription_status ON agencies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_agency_id ON api_request_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_id ON api_request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_path ON api_request_logs(path);

DROP TRIGGER IF EXISTS trg_agencies_updated_at ON agencies;
CREATE TRIGGER trg_agencies_updated_at
BEFORE UPDATE ON agencies
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();
