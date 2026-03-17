-- Add missing timestamp columns to quotes table
-- These are referenced by analytics, dashboard stats, reports, stripe webhook, and jobs/complete routes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill from status where possible
UPDATE quotes SET paid_at = accepted_at WHERE status IN ('paid', 'completed') AND paid_at IS NULL AND accepted_at IS NOT NULL;
UPDATE quotes SET completed_at = accepted_at WHERE status = 'completed' AND completed_at IS NULL AND accepted_at IS NOT NULL;
