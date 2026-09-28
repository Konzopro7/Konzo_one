-- Widen precision only: existing tax rates and historical amounts are preserved.
-- Allows 14.975% (0.14975) without silently storing 14.98%.
ALTER TABLE quotes ALTER COLUMN tax_rate TYPE NUMERIC(7, 5);
ALTER TABLE invoices ALTER COLUMN tax_rate TYPE NUMERIC(7, 5);
