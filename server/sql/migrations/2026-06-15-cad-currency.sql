ALTER TABLE agency_settings
  ALTER COLUMN currency SET DEFAULT 'CAD';

UPDATE agency_settings
SET currency = 'CAD'
WHERE UPPER(COALESCE(currency, '')) <> 'CAD';
