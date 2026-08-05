CREATE TABLE IF NOT EXISTS agencies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(170) UNIQUE NOT NULL,
  plan_tier VARCHAR(20) NOT NULL DEFAULT 'pro' CHECK (plan_tier IN ('pro', 'premium')),
  subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled')),
  trial_ends_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  subscription_started_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  stripe_customer_id VARCHAR(120) UNIQUE,
  stripe_subscription_id VARCHAR(120) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('admin', 'commercial', 'finance', 'readonly')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agency_settings (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER UNIQUE NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  logo_url TEXT,
  agency_name VARCHAR(150) NOT NULL,
  agency_email VARCHAR(180),
  agency_phone VARCHAR(50),
  payment_terms TEXT NOT NULL DEFAULT 'Paiement sous 15 jours.',
  currency VARCHAR(8) NOT NULL DEFAULT 'CAD',
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quote_followup_days INTEGER NOT NULL DEFAULT 5,
  invoice_due_days_before INTEGER NOT NULL DEFAULT 3,
  quote_email_subject TEXT NOT NULL DEFAULT 'Votre devis {{documentNumber}} - {{agencyName}}',
  quote_email_body TEXT NOT NULL DEFAULT '<p>Bonjour {{clientName}},</p><p>Votre devis {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>',
  invoice_email_subject TEXT NOT NULL DEFAULT 'Votre facture {{documentNumber}} - {{agencyName}}',
  invoice_email_body TEXT NOT NULL DEFAULT '<p>Bonjour {{clientName}},</p><p>Votre facture {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>',
  reminder_email_subject TEXT NOT NULL DEFAULT 'Rappel {{documentNumber}} - {{agencyName}}',
  reminder_email_body TEXT NOT NULL DEFAULT '<p>Bonjour {{clientName}},</p><p>Ceci est un rappel concernant {{documentNumber}}.</p>',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  company VARCHAR(180),
  email VARCHAR(180) NOT NULL,
  phone VARCHAR(60),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  quote_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'refused')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.2,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  public_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, quote_number)
);

CREATE TABLE IF NOT EXISTS quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('paid', 'pending')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_method VARCHAR(80),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.2,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_link_token VARCHAR(64) UNIQUE,
  stripe_checkout_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('quote', 'invoice')),
  entity_id INTEGER NOT NULL,
  reminder_type VARCHAR(40) NOT NULL,
  recipient_email VARCHAR(180),
  sent_day DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, entity_type, entity_id, reminder_type, sent_day)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  company VARCHAR(180),
  email VARCHAR(180),
  phone VARCHAR(60),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'ordered', 'received', 'paid', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_method VARCHAR(80),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.2,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, purchase_number)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  expense_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(100) NOT NULL,
  payment_method VARCHAR(80),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  receipt_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, expense_number)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sku VARCHAR(60) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(120),
  unit VARCHAR(40) NOT NULL DEFAULT 'unite',
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_stock_alert NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, sku)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
  quantity NUMERIC(12, 2) NOT NULL,
  unit_cost NUMERIC(12, 2),
  reason VARCHAR(180),
  reference_type VARCHAR(40),
  reference_id INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  company VARCHAR(180),
  email VARCHAR(180),
  phone VARCHAR(60),
  source VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'lost', 'converted')),
  notes TEXT,
  converted_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  prospect_id INTEGER REFERENCES prospects(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  stage VARCHAR(30) NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'discovery', 'proposal', 'won', 'lost')),
  value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 25 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INTEGER,
  path VARCHAR(255) NOT NULL,
  status_code INTEGER NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_users_agency_id ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_agencies_subscription_status ON agencies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_quotes_agency_id ON quotes(agency_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_agency_id ON invoices(agency_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_link_token ON invoices(payment_link_token);
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON quotes(public_token);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_agency_id ON reminder_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_agency_id ON suppliers(agency_id);
CREATE INDEX IF NOT EXISTS idx_purchases_agency_id ON purchases(agency_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_agency_id ON expenses(agency_id);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_agency_id ON inventory_items(agency_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_agency_id ON stock_movements(agency_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON stock_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_prospects_agency_id ON prospects(agency_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_agency_id ON opportunities(agency_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_agency_id ON api_request_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_id ON api_request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_path ON api_request_logs(path);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_agency_id ON chatbot_channels(agency_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_phone_number_id ON chatbot_channels(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_verify_token ON chatbot_channels(verify_token);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_agency_id ON chatbot_conversations(agency_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_last_message ON chatbot_conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_conversation_id ON chatbot_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_provider_message_id ON chatbot_messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at ON chatbot_messages(created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_agencies_updated_at ON agencies;
CREATE TRIGGER trg_agencies_updated_at
BEFORE UPDATE ON agencies
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes;
CREATE TRIGGER trg_quotes_updated_at
BEFORE UPDATE ON quotes
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON agency_settings;
CREATE TRIGGER trg_settings_updated_at
BEFORE UPDATE ON agency_settings
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_purchases_updated_at ON purchases;
CREATE TRIGGER trg_purchases_updated_at
BEFORE UPDATE ON purchases
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_prospects_updated_at ON prospects;
CREATE TRIGGER trg_prospects_updated_at
BEFORE UPDATE ON prospects
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_opportunities_updated_at ON opportunities;
CREATE TRIGGER trg_opportunities_updated_at
BEFORE UPDATE ON opportunities
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

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
