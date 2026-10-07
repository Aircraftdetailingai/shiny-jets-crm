-- One missing-email alert per Shopify course order.
--
-- Phone-only course checkouts (no email on the order or customer) used to be
-- skipped. The orders/paid webhook now emails sales@shinyjets.com, texts
-- ADMIN_PHONE when Twilio is configured, and writes webhook_logs
-- (source = shopify, topic = course_missing_email_alerted).
--
-- Shopify retries the same webhook. The app checks for an existing row before
-- sending, which stops a sequential retry. This unique index also stops two
-- overlapping deliveries from both inserting and both alerting.
--
-- APPLY MANUALLY in the Supabase SQL editor for prod project
-- wvdwgiouwjvdcsuvwshd. Safe to re-run. Provisioning still dedupes sequential
-- retries before this index exists.

CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_course_missing_email_order_uidx
  ON public.webhook_logs (source, topic, (payload->>'order_id'))
  WHERE source = 'shopify'
    AND topic = 'course_missing_email_alerted'
    AND coalesce(payload->>'order_id', '') <> '';
