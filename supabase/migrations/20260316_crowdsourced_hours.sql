-- Crowdsourced Hours Contribution System
-- Tracks anonymized hours contributions from completed jobs

-- 1. hours_contributions: stores individual hour contributions from job completions
CREATE TABLE IF NOT EXISTS hours_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make VARCHAR(255),
  model VARCHAR(255),
  service_type VARCHAR(100) NOT NULL,
  contributed_hrs DECIMAL(8,2) NOT NULL,
  aircraft_hours_default DECIMAL(8,2),
  detailer_hash VARCHAR(64) NOT NULL,
  quote_id UUID,
  accepted BOOLEAN DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hours_contributions_aircraft_service
  ON hours_contributions (make, model, service_type);
CREATE INDEX IF NOT EXISTS idx_hours_contributions_created
  ON hours_contributions (created_at);

-- 2. suggested_services: tracks service types not in aircraft_hours reference
CREATE TABLE IF NOT EXISTS suggested_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(255),
  service_key VARCHAR(100),
  detailer_hash VARCHAR(64) NOT NULL,
  make VARCHAR(255),
  model VARCHAR(255),
  contributed_hrs DECIMAL(8,2),
  status VARCHAR(20) DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. hours_update_log: audit trail for when aircraft_hours defaults are updated
CREATE TABLE IF NOT EXISTS hours_update_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make VARCHAR(255),
  model VARCHAR(255),
  service_type VARCHAR(100) NOT NULL,
  old_hrs DECIMAL(8,2),
  new_hrs DECIMAL(8,2),
  contribution_count INT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
