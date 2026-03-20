-- Track when detailer accepted chargeback responsibility terms
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS chargeback_terms_accepted_at TIMESTAMPTZ;
