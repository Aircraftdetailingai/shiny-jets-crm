-- Schedule override flag on jobs — lets a job appear on assigned crew
-- dashboards even when its date falls outside the detailer's normal
-- weekly availability (weekends, after-hours, one-off work).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS schedule_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jobs.schedule_override IS
  'When true, this job is visible to assigned crew and on dashboards regardless of the detailer''s weeklySchedule settings. Intended for weekend, after-hours, and other ad-hoc work.';
