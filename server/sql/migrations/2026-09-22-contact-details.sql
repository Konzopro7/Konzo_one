-- Additive extension of the existing client registry. Legacy names and relationships stay intact.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(150),
  ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(60),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(120),
  ADD COLUMN IF NOT EXISTS province VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10),
  ADD COLUMN IF NOT EXISTS source VARCHAR(120),
  ADD COLUMN IF NOT EXISTS crm_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_agency_status ON clients(agency_id, crm_status);
