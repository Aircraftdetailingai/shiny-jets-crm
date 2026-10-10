// Quote hour priority for one service on one aircraft.
//
//   manual (this quote) > pin (this model) > learned calibration
//   > aircraft catalog > shop default hours > community > 1h estimate
//
// Shop default_hours is the starting number from service import. It must
// not hide the per-model catalog, a learned ratio, or a pin.

export function resolveServiceHours({
  service,
  hasCustom = false,
  customHours,
  hasPin = false,
  pinnedHours,
  calibrated,
  aircraftHours,
  communityHours,
} = {}) {
  if (hasCustom) {
    const n = parseFloat(customHours);
    return { hours: Number.isFinite(n) && n >= 0 ? n : 0, source: 'manual' };
  }
  if (hasPin) {
    const n = parseFloat(pinnedHours);
    if (Number.isFinite(n) && n >= 0) return { hours: n, source: 'pin' };
  }
  if (calibrated && calibrated.source === 'calibrated') {
    const n = parseFloat(calibrated.hours);
    if (Number.isFinite(n) && n >= 0) return { hours: n, source: 'calibrated' };
  }
  const aircraft = parseFloat(aircraftHours);
  if (Number.isFinite(aircraft) && aircraft > 0) return { hours: aircraft, source: 'aircraft' };
  const fallback = parseFloat(service?.default_hours);
  if (Number.isFinite(fallback) && fallback > 0) return { hours: fallback, source: 'default' };
  const community = parseFloat(communityHours);
  if (Number.isFinite(community) && community > 0) return { hours: community, source: 'community' };
  return { hours: 1, source: 'fallback' };
}
