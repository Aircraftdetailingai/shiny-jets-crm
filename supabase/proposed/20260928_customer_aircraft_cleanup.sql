-- PROPOSED — NOT APPLIED. Review, then run manually in the Supabase SQL editor.
-- Lives outside supabase/migrations on purpose so no tooling runs it.
--
-- Context (Brett's fleet showed tails twice, e.g. N60LD under
-- "GULFSTREAM G4" and "LARGE_JET GULFSTREAM G4"):
--   * /api/quotes wrote the quote's size category (quotes.aircraft_type,
--     e.g. 'large_jet') into customer_aircraft.manufacturer.
--   * The CRM upsert (customer_id) and the portal pin (customer_account_id)
--     each inserted their own row for the same tail.
-- Code fixes in this PR stop both. The display now merges duplicates by
-- tail, so nothing below is required for the UI. It only tidies stored data.

-- ── 1. Inspect: duplicate rows per shop + tail ─────────────────────────────
SELECT detailer_id,
       upper(trim(tail_number))                  AS tail,
       count(*)                                  AS rows,
       array_agg(id ORDER BY created_at)         AS ids,
       array_agg(coalesce(manufacturer, '∅') || ' / ' || coalesce(model, '∅') ORDER BY created_at) AS labels,
       array_agg(customer_id ORDER BY created_at)          AS customer_ids,
       array_agg(customer_account_id ORDER BY created_at)  AS account_ids
FROM customer_aircraft
WHERE coalesce(trim(tail_number), '') <> ''
GROUP BY detailer_id, upper(trim(tail_number))
HAVING count(*) > 1
ORDER BY rows DESC;

-- ── 2. Inspect: rows whose manufacturer is really a size category ─────────
SELECT id, detailer_id, tail_number, manufacturer, model
FROM customer_aircraft
WHERE lower(replace(trim(manufacturer), ' ', '_')) IN (
  'piston','single_engine','multi_engine','twin_piston','turboprop','single_turboprop','twin_turboprop',
  'very_light_jet','light_jet','small_jet','midsize_jet','mid_size_jet','medium_jet','super_midsize_jet',
  'large_jet','heavy_jet','ultra_long_range','bizliner','airliner','helicopter','light_helicopter',
  'medium_helicopter','heavy_helicopter','jet','other','unknown');

-- ── 3. Fix: clear category slugs out of manufacturer (non-destructive) ────
-- BEGIN;
-- UPDATE customer_aircraft
--    SET manufacturer = NULL
--  WHERE lower(replace(trim(manufacturer), ' ', '_')) IN (
--   'piston','single_engine','multi_engine','twin_piston','turboprop','single_turboprop','twin_turboprop',
--   'very_light_jet','light_jet','small_jet','midsize_jet','mid_size_jet','medium_jet','super_midsize_jet',
--   'large_jet','heavy_jet','ultra_long_range','bizliner','airliner','helicopter','light_helicopter',
--   'medium_helicopter','heavy_helicopter','jet','other','unknown');
-- -- Normalise tail casing so future lookups match
-- UPDATE customer_aircraft SET tail_number = upper(trim(tail_number))
--  WHERE tail_number IS NOT NULL AND tail_number <> upper(trim(tail_number));
-- COMMIT;

-- ── 4. Optional merge of duplicates (only after reviewing query 1) ────────
-- Keeps the oldest row per shop+tail, copies any missing links/fields onto
-- it, and re-points photos/references before removing the extras. Check
-- which tables reference customer_aircraft.id in your schema first
-- (e.g. SELECT conrelid::regclass, conname FROM pg_constraint
--        WHERE confrelid = 'customer_aircraft'::regclass;)
--
-- BEGIN;
-- CREATE TEMP TABLE ca_dupes AS
-- SELECT id, detailer_id, upper(trim(tail_number)) AS tail,
--        first_value(id) OVER (PARTITION BY detailer_id, upper(trim(tail_number)) ORDER BY created_at) AS keep_id
--   FROM customer_aircraft
--  WHERE coalesce(trim(tail_number), '') <> '';
-- DELETE FROM ca_dupes WHERE id = keep_id;
--
-- UPDATE customer_aircraft k SET
--   customer_id         = coalesce(k.customer_id, d.customer_id),
--   customer_account_id = coalesce(k.customer_account_id, d.customer_account_id),
--   manufacturer        = coalesce(k.manufacturer, d.manufacturer),
--   model               = coalesce(k.model, d.model),
--   year                = coalesce(k.year, d.year),
--   home_airport        = coalesce(k.home_airport, d.home_airport),
--   notes               = coalesce(k.notes, d.notes)
-- FROM (SELECT c.*, x.keep_id FROM customer_aircraft c JOIN ca_dupes x ON x.id = c.id) d
-- WHERE k.id = d.keep_id;
--
-- -- re-point references here, e.g.:
-- -- UPDATE <referencing_table> SET customer_aircraft_id = x.keep_id FROM ca_dupes x WHERE customer_aircraft_id = x.id;
--
-- DELETE FROM customer_aircraft WHERE id IN (SELECT id FROM ca_dupes);
-- COMMIT;

-- ── 5. Global aircraft reference data typo: "Commanche" → "Comanche" ─────
-- (Piper PA-24 / PA-30 Comanche). Shared reference table, not customer data.
-- SELECT id, manufacturer, model FROM aircraft WHERE model ILIKE '%Commanche%';
-- UPDATE aircraft SET model = replace(model, 'Commanche', 'Comanche') WHERE model LIKE '%Commanche%';
