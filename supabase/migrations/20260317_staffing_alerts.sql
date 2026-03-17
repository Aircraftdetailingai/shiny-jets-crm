-- Staffing alerts table for forward-booking awareness
CREATE TABLE IF NOT EXISTS staffing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id UUID NOT NULL REFERENCES detailers(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'needs_coverage',
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staffing_alerts_detailer ON staffing_alerts(detailer_id, resolved);

-- Staff assignment on quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_team_member_ids JSONB DEFAULT '[]';

-- Weekly digest preference
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS notify_weekly_digest BOOLEAN DEFAULT true;
