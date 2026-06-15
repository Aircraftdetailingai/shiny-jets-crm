-- Add audit columns to notification_log so every customer-facing email can
-- be cross-referenced back to its Resend delivery, its outcome, and the
-- entity it belongs to. Previously the only writer was the photo-request
-- flow and the table had only detailer_id + recipient + type + sent_at.
-- After this migration the table is the canonical audit trail for all
-- customer-facing sends (quote, invoice, change-order, etc.).
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS quote_id uuid;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS invoice_id uuid;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS lead_id uuid;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS resend_id text;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS error_message text;

-- Partial indexes on the FKs — most rows will have exactly one of these
-- populated, so the partial WHERE keeps the index small + fast.
CREATE INDEX IF NOT EXISTS notification_log_quote_id_idx
  ON notification_log(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_log_invoice_id_idx
  ON notification_log(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_log_lead_id_idx
  ON notification_log(lead_id) WHERE lead_id IS NOT NULL;

-- Hot-path index for the "did this detailer's customer get any email"
-- dashboard query.
CREATE INDEX IF NOT EXISTS notification_log_detailer_sent_at_idx
  ON notification_log(detailer_id, sent_at DESC);

-- Lookup-by-resend-id for cross-referencing back from Resend dashboard.
CREATE INDEX IF NOT EXISTS notification_log_resend_id_idx
  ON notification_log(resend_id) WHERE resend_id IS NOT NULL;
