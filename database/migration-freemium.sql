-- Freemium system migration
-- Run this in Supabase SQL Editor

-- Add subscription fields to detailers table
ALTER TABLE detailers
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- Add platform fee tracking to jobs table
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(8,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS platform_fee_rate DECIMAL(4,4) DEFAULT 0.05,
ADD COLUMN IF NOT EXISTS platform_fee_percent DECIMAL(4,2) DEFAULT 5.00;

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id UUID REFERENCES detailers(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- YYYY-MM format
  quotes_created INTEGER DEFAULT 0,
  revenue_total DECIMAL(10,2) DEFAULT 0,
  fees_total DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(detailer_id, month)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_detailer_month
ON usage_tracking(detailer_id, month);

-- Function to increment quote count
CREATE OR REPLACE FUNCTION increment_quote_count(
  p_detailer_id UUID,
  p_month VARCHAR(7)
)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking (detailer_id, month, quotes_created)
  VALUES (p_detailer_id, p_month, 1)
  ON CONFLICT (detailer_id, month)
  DO UPDATE SET
    quotes_created = usage_tracking.quotes_created + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update revenue tracking
CREATE OR REPLACE FUNCTION update_revenue_tracking(
  p_detailer_id UUID,
  p_month VARCHAR(7),
  p_revenue DECIMAL(10,2),
  p_fee DECIMAL(8,2)
)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking (detailer_id, month, revenue_total, fees_total)
  VALUES (p_detailer_id, p_month, p_revenue, p_fee)
  ON CONFLICT (detailer_id, month)
  DO UPDATE SET
    revenue_total = usage_tracking.revenue_total + p_revenue,
    fees_total = usage_tracking.fees_total + p_fee,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Set existing users to starter plan (optional - remove if you want them on free)
-- UPDATE detailers SET plan = 'starter' WHERE plan IS NULL OR plan = 'free';

-- Add RLS policies for usage_tracking
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
ON usage_tracking FOR SELECT
USING (detailer_id = auth.uid());

CREATE POLICY "Service role can manage usage"
ON usage_tracking FOR ALL
USING (true)
WITH CHECK (true);

-- Grant access to service role
GRANT ALL ON usage_tracking TO service_role;
GRANT EXECUTE ON FUNCTION increment_quote_count TO service_role;
GRANT EXECUTE ON FUNCTION update_revenue_tracking TO service_role;
