-- Staff integrity — repo parity for the partial unique index already applied LIVE.
-- One active PIN per detailer (blanks/nulls excluded). Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS team_members_active_pin_per_detailer
  ON team_members (detailer_id, pin_code)
  WHERE status = 'active' AND pin_code IS NOT NULL AND pin_code <> '';
