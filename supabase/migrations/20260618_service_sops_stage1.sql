-- Stage 1 — Service SOPs: Level 1 (service default) + Level 2 (aircraft override).
-- Job-level overrides, removal flows, role gating beyond owner-only, and the
-- promotion path (job override -> aircraft override -> service default) are
-- Stage 2 and 3 respectively and intentionally not built here.

-- Level 1 — service default SOP. Owner sets these per-service in
-- /settings/services. Crew + brief email read the default when no aircraft
-- override exists.
ALTER TABLE services ADD COLUMN IF NOT EXISTS sop_url TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS sop_summary TEXT;

-- Level 2 — per-aircraft SOP override. The owner pins a specific procedure
-- for a specific tail (e.g. brightwork cut on N27RA uses a non-default
-- wool pad pressure). aircraft_id references customer_aircraft.id —
-- intentionally soft (no FK) so deleting a customer_aircraft row leaves
-- orphan overrides for audit rather than cascade-deleting them.
CREATE TABLE IF NOT EXISTS aircraft_service_sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id uuid NOT NULL,
  aircraft_id uuid NOT NULL,
  service_id uuid NOT NULL,
  sop_url text NOT NULL,
  sop_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (aircraft_id, service_id)
);

CREATE INDEX IF NOT EXISTS aircraft_service_sops_detailer_aircraft_idx
  ON aircraft_service_sops(detailer_id, aircraft_id);

CREATE INDEX IF NOT EXISTS aircraft_service_sops_detailer_service_idx
  ON aircraft_service_sops(detailer_id, service_id);
