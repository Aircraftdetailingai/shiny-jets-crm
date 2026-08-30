-- Crew-briefing auto-send support.
--
-- The jobs columns below were already applied to production ahead of this
-- change (see the Aug 30 fix spec §0); they are re-declared here with
-- IF NOT EXISTS so a fresh database provisioned from migrations matches prod.
--
--   crew_briefing_send    — per-job auto-send preference for the crew briefing
--                           ('day_before' | 'morning_of' | 'off'). Distinct
--                           from delivery_preference, which drives the separate
--                           customer job-reminder cron.
--   crew_briefing_sent_at — idempotency stamp so the cron / on-dispatch
--                           catch-up never double-sends a briefing.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS crew_briefing_send TEXT DEFAULT 'day_before';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS crew_briefing_sent_at TIMESTAMPTZ;

-- Crew briefings are keyed to a job, not a quote. notification_log gains a
-- job_id so briefing audit rows stop overloading quote_id with job ids.
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS job_id UUID;
