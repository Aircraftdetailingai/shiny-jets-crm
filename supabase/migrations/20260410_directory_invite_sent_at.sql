-- Track when each detailer was emailed about the new directory feature
-- Used by /api/cron/directory-invite to avoid sending duplicate invites
ALTER TABLE detailers
  ADD COLUMN IF NOT EXISTS directory_invite_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_detailers_directory_invite_sent_at
  ON detailers(directory_invite_sent_at)
  WHERE directory_invite_sent_at IS NULL;
