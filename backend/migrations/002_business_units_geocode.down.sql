DROP INDEX IF EXISTS idx_business_units_lat_lon;
DROP INDEX IF EXISTS idx_business_units_office;

ALTER TABLE business_units
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS geocode_provider,
  DROP COLUMN IF EXISTS geocode_display_name,
  DROP COLUMN IF EXISTS geocode_confidence,
  DROP COLUMN IF EXISTS geocoded_at;

ALTER TABLE business_units
  ALTER COLUMN lat SET NOT NULL,
  ALTER COLUMN lon SET NOT NULL;
