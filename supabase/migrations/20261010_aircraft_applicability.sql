-- Central aircraft attributes and per-shop model offers.
-- Run in the Supabase SQL editor. Shops do not configure each model;
-- these columns are the shared starting point. A shop override
-- (model_offer_overrides) can still force a service on or off.

ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS has_polished_brightwork boolean;
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS has_deice_boots boolean;

-- Helicopters have no polished brightwork. So does any model whose
-- catalog brightwork hours are zero (ag aircraft, some helicopters).
UPDATE aircraft
SET has_polished_brightwork = false
WHERE category = 'helicopter'
   OR COALESCE(brightwork_hours, 0) <= 0;

UPDATE aircraft
SET has_polished_brightwork = true
WHERE has_polished_brightwork IS NULL;

-- De-ice boots: turboprops, plus piston types that commonly carry them.
-- Jets (including the Gulfstream IV, stored as G4) and helicopters do not.
UPDATE aircraft SET has_deice_boots = false;

UPDATE aircraft
SET has_deice_boots = true
WHERE category = 'turboprop';

UPDATE aircraft
SET has_deice_boots = true
WHERE category = 'piston'
  AND model ~* '(baron|bonanza|duke|malibu|mirage|matrix|seneca|navajo|chieftain|mojave|aerostar|pa-46|\m310\M|\m340\M|\m414\M|\m421\M)';

UPDATE aircraft
SET has_deice_boots = false
WHERE manufacturer ILIKE '%gulfstream%'
  AND (
    model ~* '^(g-?4|g-?iv|iv)([^0-9]|$)'
    OR model ~* 'gulfstream[[:space:]]+iv'
    OR model ~* '^g-?iv([^a-z0-9]|$)'
  );

ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_brightwork boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_deice_boots boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS allowed_categories text[];

ALTER TABLE packages ADD COLUMN IF NOT EXISTS requires_brightwork boolean NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS requires_deice_boots boolean NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS allowed_categories text[];

UPDATE services
SET requires_brightwork = true
WHERE COALESCE(requires_brightwork, false) = false
  AND (
    hours_field = 'brightwork_hours'
    OR name ILIKE '%brightwork%'
    OR name ILIKE '%chrome%'
  );

UPDATE services
SET requires_deice_boots = true
WHERE COALESCE(requires_deice_boots, false) = false
  AND name ~* '(de-?ice|deice|boot dressing|leading[- ]edge boot)';

UPDATE packages
SET requires_brightwork = true
WHERE COALESCE(requires_brightwork, false) = false
  AND (name ILIKE '%brightwork%' OR name ILIKE '%chrome%');

UPDATE packages
SET requires_deice_boots = true
WHERE COALESCE(requires_deice_boots, false) = false
  AND name ~* '(de-?ice|deice|boot dressing|leading[- ]edge boot)';

-- Per-shop, per-model pins, on/off, and chemical usage. Tenant key is detailer_id.
CREATE TABLE IF NOT EXISTS model_offer_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id uuid NOT NULL,
  aircraft_id uuid,
  custom_aircraft_id uuid,
  make text,
  model text,
  service_id uuid,
  package_id uuid,
  enabled boolean,
  pinned_hours numeric,
  pinned_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS model_offer_service_aircraft
  ON model_offer_overrides (detailer_id, aircraft_id, service_id)
  WHERE aircraft_id IS NOT NULL AND service_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS model_offer_service_custom
  ON model_offer_overrides (detailer_id, custom_aircraft_id, service_id)
  WHERE custom_aircraft_id IS NOT NULL AND service_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS model_offer_package_aircraft
  ON model_offer_overrides (detailer_id, aircraft_id, package_id)
  WHERE aircraft_id IS NOT NULL AND package_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS model_offer_package_custom
  ON model_offer_overrides (detailer_id, custom_aircraft_id, package_id)
  WHERE custom_aircraft_id IS NOT NULL AND package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS model_offer_detailer ON model_offer_overrides (detailer_id);

CREATE TABLE IF NOT EXISTS model_service_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id uuid NOT NULL,
  aircraft_id uuid,
  custom_aircraft_id uuid,
  service_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  quantity numeric,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_service_usage_lookup
  ON model_service_usage (detailer_id, service_id);

ALTER TABLE model_offer_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_service_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'model_offer_overrides' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON model_offer_overrides FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'model_service_usage' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON model_service_usage FOR ALL USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
