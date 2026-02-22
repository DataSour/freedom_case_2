ALTER TABLE business_units
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS geocode_provider TEXT,
  ADD COLUMN IF NOT EXISTS geocode_display_name TEXT,
  ADD COLUMN IF NOT EXISTS geocode_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

ALTER TABLE business_units
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lon DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_office ON business_units(name);
CREATE INDEX IF NOT EXISTS idx_business_units_lat_lon ON business_units(lat, lon);
