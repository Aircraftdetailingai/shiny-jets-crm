-- detailers.must_change_password
-- Login, Shopify course provisioning, and password reset already read and
-- write this column. Run only if an environment was created without it.
-- ADD COLUMN IF NOT EXISTS is a no-op when the column is already present.
-- Do not execute this from application code.

ALTER TABLE public.detailers
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
