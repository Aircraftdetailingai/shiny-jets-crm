-- Paid "Ask a Shiny Jets expert" button (Brett, Oct 3 2026): $4.99 buys ONE question.
-- The button saves the question as 'awaiting_payment' (Brett is not notified). The Shopify
-- orders/paid webhook moves it to 'open' and notifies Brett. Unpaid ones become 'expired' after
-- 24 h (payment_expires_at) and their photos are deleted. AI-initiated escalations stay free
-- and are created as 'open' exactly as before.
-- Run after 20261005_ask_brett_escalations.sql. Safe to re-run.

-- Drop the old status CHECK whatever it was named.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.detailing_ai_escalations'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.detailing_ai_escalations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.detailing_ai_escalations
  ADD CONSTRAINT detailing_ai_escalations_status_check
  CHECK (status IN ('awaiting_payment', 'open', 'answered', 'expired'));

ALTER TABLE public.detailing_ai_escalations ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;
ALTER TABLE public.detailing_ai_escalations ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.detailing_ai_escalations ADD COLUMN IF NOT EXISTS shopify_order_id text;
ALTER TABLE public.detailing_ai_escalations ADD COLUMN IF NOT EXISTS shopify_order_name text;

-- One Shopify order pays for exactly one question.
CREATE UNIQUE INDEX IF NOT EXISTS detailing_ai_escalations_shopify_order_uidx
  ON public.detailing_ai_escalations (shopify_order_id) WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS detailing_ai_escalations_unpaid_idx
  ON public.detailing_ai_escalations (payment_expires_at) WHERE status = 'awaiting_payment';
