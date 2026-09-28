ALTER TABLE agencies ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ga4_enabled BOOLEAN NOT NULL DEFAULT false,
  ga4_measurement_id VARCHAR(30),
  ga4_property_id VARCHAR(30),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (id) VALUES (1);
