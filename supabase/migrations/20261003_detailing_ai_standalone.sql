-- Standalone Detailing AI (sold on aircraftdetailing.ai through the Shiny Jets Shopify
-- product "Aircraft Detailing AI", product 15410802557113: monthly variant 67640132174009,
-- annual variant 67640132206777, renewed by Seal Subscriptions).
-- Each paid order (first order and every Seal renewal) stacks 30 / 365 days onto
-- detailers.ai_access_until (lib/detailing-ai-access.js, handleDetailingAiAccess in
-- app/api/webhooks/shopify/route.js). While it is in the future the account can use
-- Detailing AI on any CRM plan, including Free. Grants are logged (idempotent per order)
-- in the existing webhook_logs table, topic 'detailing_ai_access_granted'.
-- Nullable, no default, no backfill; safe to re-run.
ALTER TABLE public.detailers ADD COLUMN IF NOT EXISTS ai_access_until timestamptz;

COMMENT ON COLUMN public.detailers.ai_access_until IS
  'Standalone Detailing AI access (Shopify "Aircraft Detailing AI") runs until this time; NULL = none.';

-- Make PostgREST (supabase-js) see the new column immediately.
NOTIFY pgrst, 'reload schema';
