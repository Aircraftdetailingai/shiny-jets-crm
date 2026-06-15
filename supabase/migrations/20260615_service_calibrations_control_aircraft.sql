-- Control aircraft anchor for service calibrations.
-- The control is the single airframe the detailer actually measured a service
-- against; every other aircraft's calibrated hours derive from it proportionally.
ALTER TABLE service_calibrations
  ADD COLUMN IF NOT EXISTS control_aircraft_id uuid REFERENCES aircraft_hours(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_calibrations_control_aircraft
  ON service_calibrations(control_aircraft_id) WHERE control_aircraft_id IS NOT NULL;
