CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS chatbot_channels (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER UNIQUE NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL DEFAULT 'whatsapp_cloud' CHECK (provider IN ('whatsapp_cloud')),
  display_phone_number VARCHAR(80),
  phone_number_id VARCHAR(120),
  business_account_id VARCHAR(120),
  access_token TEXT,
  verify_token VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_message TEXT NOT NULL DEFAULT 'Bonjour {{contactName}}, merci pour votre message. Nous revenons vers vous rapidement.',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES chatbot_channels(id) ON DELETE CASCADE,
  contact_phone VARCHAR(80) NOT NULL,
  contact_name VARCHAR(180),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, channel_id, contact_phone)
);

CREATE TABLE IF NOT EXISTS chatbot_messages (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  provider_message_id VARCHAR(255) UNIQUE,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  message_type VARCHAR(40) NOT NULL DEFAULT 'text',
  body TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed', 'simulated', 'queued')),
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  raw_payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_channels_agency_id ON chatbot_channels(agency_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_phone_number_id ON chatbot_channels(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_verify_token ON chatbot_channels(verify_token);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_agency_id ON chatbot_conversations(agency_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_last_message ON chatbot_conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_conversation_id ON chatbot_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_provider_message_id ON chatbot_messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at ON chatbot_messages(created_at);

DROP TRIGGER IF EXISTS trg_chatbot_channels_updated_at ON chatbot_channels;
CREATE TRIGGER trg_chatbot_channels_updated_at
BEFORE UPDATE ON chatbot_channels
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_chatbot_conversations_updated_at ON chatbot_conversations;
CREATE TRIGGER trg_chatbot_conversations_updated_at
BEFORE UPDATE ON chatbot_conversations
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();
