-- Add direct job_id reference to time_entries alongside existing quote_id
-- Crew members now clock into specific jobs (from the jobs table) when they start work
-- quote_id remains for legacy/quote-based entries; new entries use job_id
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

-- Index for labor queries (all entries for a given job)
CREATE INDEX IF NOT EXISTS idx_time_entries_job_id
  ON time_entries(job_id)
  WHERE job_id IS NOT NULL;

-- Index for open entries lookup (fast "currently clocked in" check per team member)
CREATE INDEX IF NOT EXISTS idx_time_entries_open
  ON time_entries(team_member_id, date)
  WHERE clock_out IS NULL;
