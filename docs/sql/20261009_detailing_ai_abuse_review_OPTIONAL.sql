-- OPTIONAL (not required by the code): speeds up the Detailing AI abuse queries on webhook_logs
-- once the table gets large. The chat works the same with or without it. Safe to re-run.
-- Queries it helps: lib/detailing-ai-abuse-server.js (countRecentFlags, recordSeen) and
-- GET /api/admin/detailing-ai-abuse.
CREATE INDEX IF NOT EXISTS webhook_logs_detailing_ai_review_idx
  ON public.webhook_logs (source, topic, created_at DESC)
  WHERE source = 'detailing_ai';

CREATE INDEX IF NOT EXISTS webhook_logs_detailing_ai_account_idx
  ON public.webhook_logs ((payload->>'account_id'), created_at DESC)
  WHERE source = 'detailing_ai';

CREATE INDEX IF NOT EXISTS webhook_logs_detailing_ai_user_idx
  ON public.webhook_logs ((payload->>'user_id'), created_at DESC)
  WHERE source = 'detailing_ai' AND topic = 'detailing_ai_seen';

-- Housekeeping you can run any time: 'seen' rows are only needed for 24 hours.
-- DELETE FROM public.webhook_logs WHERE source = 'detailing_ai' AND topic = 'detailing_ai_seen' AND created_at < now() - interval '7 days';
