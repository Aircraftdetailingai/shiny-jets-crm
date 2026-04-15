-- Crew management migrations
-- team_members additions
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS owner_notes TEXT,
  ADD COLUMN IF NOT EXISTS pay_period_start DATE DEFAULT CURRENT_DATE;

-- jobs additions
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS crew_notes TEXT,
  ADD COLUMN IF NOT EXISTS standing_notes_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS delivery_preference VARCHAR DEFAULT 'day_before',
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

-- Aircraft standing notes
CREATE TABLE IF NOT EXISTS aircraft_standing_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id UUID NOT NULL REFERENCES detailers(id) ON DELETE CASCADE,
  tail_number VARCHAR NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_notes_tail
  ON aircraft_standing_notes(detailer_id, tail_number);
