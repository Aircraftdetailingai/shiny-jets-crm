-- Detailing AI becomes Business-only (Brett, Oct 3 2026).
-- Lite accounts that are paying when this runs keep Detailing AI ("grandfathered")
-- for as long as they stay on Lite or higher. New Lite accounts don't get it;
-- they can upgrade to Business or buy Detailing AI on its own (aircraftdetailing.ai,
-- detailers.ai_access_until).
--
-- The app reads this column in its own query (lib/plan-gate.js loadDetailingAiExtras).
-- Until this migration runs, Lite keeps Detailing AI (old rule), so the code can
-- deploy first and nobody loses access early.
--
-- Run ONCE, at the cutover. Review the counts first (preview queries at the bottom).

BEGIN;

ALTER TABLE public.detailers
  ADD COLUMN IF NOT EXISTS detailing_ai_grandfathered_at timestamptz;

COMMENT ON COLUMN public.detailers.detailing_ai_grandfathered_at IS
  'Set once when Detailing AI moved to Business-only: this Lite account keeps Detailing AI while on Lite or higher.';

-- Grandfather every Lite (incl. legacy ''pro'') account that is current today:
-- open-ended (no end date) or dated into the future, and not cancelled/expired.
-- Includes Lite granted by a quarterly Pricing Tool subscription and admin comps.
UPDATE public.detailers
SET detailing_ai_grandfathered_at = now()
WHERE detailing_ai_grandfathered_at IS NULL
  AND lower(coalesce(plan, '')) IN ('lite', 'pro')
  AND (plan_expires_at IS NULL OR plan_expires_at > now())
  AND coalesce(lower(subscription_status), 'active') NOT IN ('cancelled', 'canceled', 'expired');

COMMIT;

-- ============================================================================
-- PREVIEW (read-only) — run these before the migration to see who is affected.
-- ============================================================================
-- How many Lite accounts would be grandfathered, by status and source:
--
-- SELECT coalesce(subscription_status, '(null)') AS status,
--        coalesce(subscription_source, '(null)') AS source,
--        count(*)
-- FROM public.detailers
-- WHERE lower(coalesce(plan, '')) IN ('lite', 'pro')
--   AND (plan_expires_at IS NULL OR plan_expires_at > now())
--   AND coalesce(lower(subscription_status), 'active') NOT IN ('cancelled', 'canceled', 'expired')
-- GROUP BY 1, 2
-- ORDER BY 3 DESC;
--
-- Lite accounts that would NOT be grandfathered (already cancelled/expired):
--
-- SELECT count(*) FROM public.detailers
-- WHERE lower(coalesce(plan, '')) IN ('lite', 'pro')
--   AND NOT ((plan_expires_at IS NULL OR plan_expires_at > now())
--        AND coalesce(lower(subscription_status), 'active') NOT IN ('cancelled', 'canceled', 'expired'));
--
-- To exclude admin comps or quarterly Pricing Tool Lite, add e.g.
--   AND coalesce(subscription_status, '') <> 'comped'
--   AND coalesce(subscription_source, '') <> 'pricing_quarterly'
-- to the UPDATE above.
