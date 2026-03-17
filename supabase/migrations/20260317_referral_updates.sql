-- Add referrer_id to detailers for tracking who referred whom
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES detailers(id);
-- Ensure referral_code column exists
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;
