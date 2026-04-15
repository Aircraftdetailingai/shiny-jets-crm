-- Customer portal migrations

-- Extend customer_accounts with role, profile, and onboarding fields
ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'aircraft_owner',
  ADD COLUMN IF NOT EXISTS first_name VARCHAR,
  ADD COLUMN IF NOT EXISTS last_name VARCHAR,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS company_name VARCHAR,
  ADD COLUMN IF NOT EXISTS certificate_number VARCHAR,
  ADD COLUMN IF NOT EXISTS certificate_type VARCHAR,
  ADD COLUMN IF NOT EXISTS preferred_notification VARCHAR DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"quote_ready":true,"job_scheduled":true,"job_completed":true,"service_reminder":true,"promotions":false}',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
  ADD COLUMN IF NOT EXISTS magic_token VARCHAR,
  ADD COLUMN IF NOT EXISTS magic_token_expires TIMESTAMP;

-- Extend customer_aircraft with detail fields
ALTER TABLE customer_aircraft
  ADD COLUMN IF NOT EXISTS nickname VARCHAR,
  ADD COLUMN IF NOT EXISTS engine_type VARCHAR,
  ADD COLUMN IF NOT EXISTS storage_type VARCHAR,
  ADD COLUMN IF NOT EXISTS storage_location VARCHAR,
  ADD COLUMN IF NOT EXISTS home_airport VARCHAR,
  ADD COLUMN IF NOT EXISTS annual_due_date DATE,
  ADD COLUMN IF NOT EXISTS last_service_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for magic token lookups
CREATE INDEX IF NOT EXISTS idx_customer_accounts_magic_token
  ON customer_accounts(magic_token) WHERE magic_token IS NOT NULL;

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_customer_accounts_email
  ON customer_accounts(email);
