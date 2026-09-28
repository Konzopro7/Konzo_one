CREATE TABLE newsletter_subscriptions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email VARCHAR(254) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'subscribed', 'unsubscribed')),
  confirmation_hash VARCHAR(64),
  confirmation_expires_at TIMESTAMPTZ,
  unsubscribe_hash VARCHAR(64),
  requested_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  prompt_dismissed_at TIMESTAMPTZ,
  consent_version VARCHAR(40),
  consent_proof JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_newsletter_confirmation ON newsletter_subscriptions(confirmation_hash) WHERE confirmation_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_newsletter_unsubscribe ON newsletter_subscriptions(unsubscribe_hash) WHERE unsubscribe_hash IS NOT NULL;
CREATE INDEX idx_newsletter_subscribers ON newsletter_subscriptions(status, user_id);
ALTER TABLE agencies ADD COLUMN newsletter_coupon_id TEXT;
ALTER TABLE agencies ADD COLUMN newsletter_discount_redeemed_at TIMESTAMPTZ;
ALTER TABLE platform_settings ADD COLUMN support_phone VARCHAR(40);
