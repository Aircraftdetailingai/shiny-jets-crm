// Match a detailer's saved per-model hour pins to the aircraft open in a quote.
//
// Pins are written from two places that do not share ids:
//   - the quote builder stores aircraft.id (the `aircraft` table)
//   - Settings → Services stores aircraft_hours.id
// Matching only the first id dropped pins made on the services screen, so the
// quote kept the learned/catalog number. A pin wins over both.

export function pinsForAircraft(overrides, {
  aircraftId = null,
  customAircraftId = null,
  aircraftHoursId = null,
  services = [],
} = {}) {
  const byName = new Map();
  for (const s of services || []) {
    const name = String(s?.name || '').toLowerCase().trim();
    if (name && s?.id) byName.set(name, s.id);
  }

  const map = {};
  for (const ov of overrides || []) {
    if (!ov) continue;
    const matchesCustom = !!(customAircraftId && ov.custom_aircraft_id === customAircraftId);
    const matchesAircraft = !!(!customAircraftId && aircraftId && ov.aircraft_id === aircraftId);
    const matchesHours = !!(!customAircraftId && aircraftHoursId && ov.aircraft_id === aircraftHoursId);
    if (!matchesCustom && !matchesAircraft && !matchesHours) continue;

    const hours = typeof ov.hours === 'number' ? ov.hours : parseFloat(ov.hours);
    if (!Number.isFinite(hours) || hours < 0) continue;

    const sid = ov.service_id || byName.get(String(ov.service_name || '').toLowerCase().trim());
    if (!sid) continue;
    map[sid] = hours;
  }
  return map;
}
