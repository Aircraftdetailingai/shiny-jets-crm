-- Repo parity only. These changes are ALREADY applied to the live database
-- (project wvdwgiouwjvdcsuvwshd) — this file exists so a fresh clone or a
-- branch DB matches prod. It is idempotent and safe to re-run.
--
-- 1. Backfill detailer_id from the owning service for any orphan link rows.
-- 2. Add unique constraints so upsert(onConflict=...) works for both link
--    tables. Without these, idempotent linking from the settings UI silently
--    fails (constraint name shows up in PG error 23505 / 42P10).

UPDATE service_products sp
SET detailer_id = s.detailer_id
FROM services s
WHERE sp.service_id = s.id AND sp.detailer_id IS NULL;

UPDATE service_equipment se
SET detailer_id = s.detailer_id
FROM services s
WHERE se.service_id = s.id AND se.detailer_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_products_service_product_uniq') THEN
    ALTER TABLE service_products ADD CONSTRAINT service_products_service_product_uniq UNIQUE (service_id, product_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_equipment_service_equipment_uniq') THEN
    ALTER TABLE service_equipment ADD CONSTRAINT service_equipment_service_equipment_uniq UNIQUE (service_id, equipment_id);
  END IF;
END $$;
