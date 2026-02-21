CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  segment TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_json JSONB
);

CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  office TEXT NOT NULL,
  role TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  current_load INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT,
  sentiment TEXT,
  priority INT,
  language TEXT,
  summary TEXT,
  recommendation TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  manager_id TEXT NULL REFERENCES managers(id) ON DELETE SET NULL,
  office TEXT NOT NULL,
  status TEXT NOT NULL,
  reason_code TEXT,
  reason_text TEXT,
  reasoning JSONB,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  summary JSONB
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_managers_office ON managers(office);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_ticket_id ON ai_analysis(ticket_id);
