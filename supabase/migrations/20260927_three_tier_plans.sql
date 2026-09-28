-- ============================================================================
-- Three-tier plans (Free / Lite / Business) — OPTIONAL, idempotent migration.
--
-- NOT applied automatically. The application code already aliases legacy plan
-- values at read time (pro → lite, enterprise → business, starter → free), and
-- every write path falls back to the legacy value if the database rejects
-- 'lite'. So the app works without this file. Run it (in the Supabase SQL
-- editor) when you want the database to store the new values natively.
--
-- Safe to run more than once.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- (a) Allow the new plan value 'lite' anywhere a CHECK constraint restricts
--     plan values. Only constraints that mention plan + 'pro' but not 'lite'
--     are replaced; a permissive constraint that still accepts every legacy
--     value is added back (NOT VALID, so existing rows are not re-checked).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  r record;
  cname text;
BEGIN
  FOREACH t IN ARRAY ARRAY['detailers', 'beta_invites', 'comp_invites', 'plan_limits'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'plan'
    ) THEN CONTINUE; END IF;

    FOR r IN
      SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      WHERE c.conrelid = ('public.' || t)::regclass
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%plan%'
        AND pg_get_constraintdef(c.oid) ILIKE '%''pro''%'
        AND pg_get_constraintdef(c.oid) NOT ILIKE '%''lite''%'
    LOOP
      RAISE NOTICE 'Dropping % on %: %', r.conname, t, r.def;
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, r.conname);

      cname := t || '_plan_three_tier_check';
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (plan IS NULL OR plan IN (''free'',''starter'',''lite'',''pro'',''business'',''enterprise'')) NOT VALID',
          t, cname
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- (b) plan_limits rows for the new values (the code already falls back
--     lite → pro and business → enterprise, so this is just tidiness).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.plan_limits') IS NOT NULL THEN
    INSERT INTO public.plan_limits (plan, primary_limit, secondary_limit)
    SELECT 'lite', primary_limit, secondary_limit
    FROM public.plan_limits
    WHERE plan = 'pro'
      AND NOT EXISTS (SELECT 1 FROM public.plan_limits WHERE plan = 'lite')
    LIMIT 1;

    INSERT INTO public.plan_limits (plan, primary_limit, secondary_limit)
    SELECT 'business', primary_limit, secondary_limit
    FROM public.plan_limits
    WHERE plan = 'enterprise'
      AND NOT EXISTS (SELECT 1 FROM public.plan_limits WHERE plan = 'business')
    LIMIT 1;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- (c) app_access.product_type: allow 'crm_business' (Business → Pricing Tool)
--     if a CHECK constraint restricts product_type values.
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.app_access') IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'public.app_access'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%product_type%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%crm_business%'
  LOOP
    RAISE NOTICE 'Dropping % on app_access (product_type restricted): %', r.conname, r.def;
    EXECUTE format('ALTER TABLE public.app_access DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- OPTIONAL BACKFILLS — review, then uncomment and run individually.
-- ============================================================================

-- (d) Business (incl. legacy enterprise) accounts with a dated term: give them
--     an active Pricing Tool row for the same term without shortening any
--     longer existing row. (New Business purchases/renewals do this
--     automatically in the Shopify webhook.)
--
-- INSERT INTO public.app_access (email, product_type, access_start, access_end, status, updated_at)
-- SELECT lower(d.email), 'crm_business', now(), d.plan_expires_at, 'active', now()
-- FROM public.detailers d
-- WHERE d.plan IN ('business', 'enterprise')
--   AND d.plan_expires_at > now()
--   AND d.email IS NOT NULL
-- ON CONFLICT (email) DO UPDATE
--   SET access_end = GREATEST(public.app_access.access_end, EXCLUDED.access_end),
--       status = 'active',
--       updated_at = now()
--   WHERE public.app_access.access_end IS NULL
--      OR public.app_access.access_end < EXCLUDED.access_end
--      OR public.app_access.status <> 'active';

-- (e) Active quarterly Pricing Tool subscribers who already have a CRM account
--     on Free: grant Lite through their Pricing Tool access_end. (New
--     quarterly orders do this automatically; signup does it for new accounts.)
--
-- UPDATE public.detailers d
-- SET plan = 'lite',                      -- use 'pro' if (a) was not run
--     plan_expires_at = a.access_end,
--     subscription_source = 'pricing_quarterly',
--     subscription_status = 'active',
--     plan_updated_at = now()
-- FROM public.app_access a
-- WHERE lower(a.email) = lower(d.email)
--   AND a.product_type = 'quarterly'
--   AND a.status = 'active'
--   AND a.access_end > now()
--   AND coalesce(d.plan, 'free') IN ('free', 'starter');

-- (f) Legacy default platform fee on Business: the code already treats a
--     stored 1% on a business row as the old default and charges 0%. To make
--     the data match:
--
-- UPDATE public.detailers SET platform_fee_percent = 0
-- WHERE plan = 'business' AND platform_fee_percent = 1;

-- (g) Rename legacy plan values (only after (a) succeeded). Not required —
--     the app treats them identically. End dates are untouched.
--
-- UPDATE public.detailers SET plan = 'lite' WHERE plan = 'pro';
-- UPDATE public.detailers SET plan = 'business' WHERE plan = 'enterprise';
