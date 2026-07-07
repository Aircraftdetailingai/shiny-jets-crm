-- Bugfix bundle — repo parity for schema already applied + verified LIVE.
-- Idempotent: safe to re-run.

-- intake_leads: allow the 'awaiting_photos' status used by the photo-request flow.
ALTER TABLE intake_leads DROP CONSTRAINT IF EXISTS intake_leads_status_check;
ALTER TABLE intake_leads ADD CONSTRAINT intake_leads_status_check
  CHECK (status = ANY (ARRAY['new','reviewed','quoted','won','lost','archived','awaiting_photos']::text[]));

-- quotes: Stripe identifiers written by the checkout + webhook path.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- invoices: denormalized fields written by the deposit auto-invoice / invoice flow.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS aircraft text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS detailer_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS detailer_email text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS detailer_company text;
