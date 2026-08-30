-- Persist a "needs reconnect" signal for Google Calendar connections.
--
-- Before this, /api/google-calendar/status inferred needsReconnect purely
-- from a missing refresh_token. But a refresh_token that Google has REVOKED
-- (invalid_grant) still exists on the row, so status kept reporting
-- "connected" while the hourly sync cron silently 401'd forever. The cron
-- now stamps needs_reconnect=true when a token refresh or Calendar API call
-- fails with an auth error, and clears it on a successful sync. Status reads
-- the flag so the UI can prompt the owner to reconnect.

ALTER TABLE google_calendar_connections
  ADD COLUMN IF NOT EXISTS needs_reconnect BOOLEAN DEFAULT false;

ALTER TABLE google_calendar_connections
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
