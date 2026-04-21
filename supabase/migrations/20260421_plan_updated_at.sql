-- Stamp every plan mutation with a timestamp so the client plan-sync hook
-- can short-circuit re-renders when nothing has changed since the last poll.
-- Written by the Shopify webhook updatePlan() path (and downgrade /
-- subscription-deleted paths) in app/api/webhooks/shopify/route.js.

ALTER TABLE detailers
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

COMMENT ON COLUMN detailers.plan_updated_at IS
  'Timestamp stamped by the Shopify webhook on every plan mutation (upgrade, downgrade, cancellation). Used by the client plan-sync hook to short-circuit re-renders when nothing has changed since the last poll.';

-- Backfill: seed plan_updated_at from updated_at for existing rows so the
-- client never sees a null value that might be interpreted as "brand new".
UPDATE detailers
SET plan_updated_at = updated_at
WHERE plan_updated_at IS NULL;
