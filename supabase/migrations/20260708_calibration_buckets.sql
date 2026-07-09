-- Calibration engine — repo parity for schema already applied + verified LIVE.
-- Idempotent: safe to re-run.
--
-- services.bucket: coarse service grouping ('other' default, backfilled by
--   keyword LIVE) used by the calibration/analytics dashboards.
-- aircraft_hours.wingspan_ft: physical dimension used by the calibration
--   reference sheet (124/209 rows filled LIVE).

ALTER TABLE services ADD COLUMN IF NOT EXISTS bucket text DEFAULT 'other';

ALTER TABLE aircraft_hours ADD COLUMN IF NOT EXISTS wingspan_ft numeric;
