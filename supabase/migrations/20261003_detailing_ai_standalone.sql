-- Standalone Detailing AI (sold on aircraftdetailing.ai via the Shiny Jets Shopify
-- product "Aircraft Detailing AI", SKUs SJ-AI-STANDALONE / SJ-AI-STANDALONE-YEARLY).
-- A paid order stacks days onto ai_access_until (see lib/detailing-ai-access.js and
-- handleDetailingAiAccess in app/api/webhooks/shopify/route.js). While it is in the
-- future the account can use Detailing AI regardless of its CRM plan.
-- Safe to apply before the product exists: nullable, no default, no backfill.
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS ai_access_until timestamptz;
