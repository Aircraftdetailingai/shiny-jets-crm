// Derive a service_calibrations.adjustment_pct from a detailer's real-world
// hours on an aircraft they've actually detailed.
//
// This is the exact inverse of how the calibration is applied in
// lib/calibrate-hours.js:
//   calibratedHours = referenceHours * (1 + pct / 100)
// so, given the reference aircraft's baseline hours for the chosen reference
// type and the detailer's real hours for the service on that same aircraft:
//   pct = (realHours / referenceHours - 1) * 100
//
// Returns null when the inputs can't produce a meaningful percentage (missing
// or non-positive reference baseline, non-finite real hours). Callers should
// treat null as "can't derive — fall back to manual entry".
//
// @param {number|string} realHours       detailer's actual hours for the service
// @param {number|string} referenceHours  baseline hours for the reference type on that aircraft
// @returns {number|null} adjustment percentage, rounded to 0.1%
export function derivePctFromHours(realHours, referenceHours) {
  const real = parseFloat(realHours);
  const ref = parseFloat(referenceHours);
  if (!Number.isFinite(real) || real < 0) return null;
  if (!Number.isFinite(ref) || ref <= 0) return null;
  const pct = (real / ref - 1) * 100;
  return Math.round(pct * 10) / 10;
}
