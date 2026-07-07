-- Widen quotes_status_check to include the payment/scheduling lifecycle statuses.
-- Repo parity for the constraint already applied + verified LIVE. Idempotent.

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status = ANY (ARRAY['draft','sent','viewed','accepted','expired','cancelled','paid','deposit_paid','scheduled','completed','approved']::text[]));
