CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
END$$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'commercial', 'finance', 'readonly'));

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS quote_email_subject TEXT NOT NULL DEFAULT 'Votre devis {{documentNumber}} - {{agencyName}}',
  ADD COLUMN IF NOT EXISTS quote_email_body TEXT NOT NULL DEFAULT '<p>Bonjour {{clientName}},</p><p>Votre devis {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>',
  ADD COLUMN IF NOT EXISTS invoice_email_subject TEXT NOT NULL DEFAULT 'Votre facture {{documentNumber}} - {{agencyName}}',
  ADD COLUMN IF NOT EXISTS invoice_email_body TEXT NOT NULL DEFAULT '<p>Bonjour {{clientName}},</p><p>Votre facture {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>',
  ADD COLUMN IF NOT EXISTS reminder_email_subject TEXT NOT NULL DEFAULT 'Rappel {{documentNumber}} - {{agencyName}}',
  ADD COLUMN IF NOT EXISTS reminder_email_body TEXT NOT NULL DEFAULT '<p>Bonjour {{clientName}},</p><p>Ceci est un rappel concernant {{documentNumber}}.</p>';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS public_token VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_public_token ON quotes(public_token);

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

CREATE INDEX IF NOT EXISTS idx_prospects_agency_id ON prospects(agency_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_agency_id ON opportunities(agency_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

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
