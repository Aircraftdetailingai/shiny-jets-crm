// Apply service_calibrations + services.minimum_price at line-item create
// time. Centralized so the quote builder and the invoice builder both speak
// the same dialect — calibration logic that diverges between the two paths
// is one of the most common sources of "the quote says X but the invoice
// shows Y" support issues.
//
// Shared shape:
//   service:    { id, name, default_hours, minimum_price, hourly_rate, ... }
//   aircraftHoursRef: row from /api/aircraft-hours (the *_hrs columns)
//   calibrations: array of service_calibrations rows, fetched from
//                 /api/services/calibrations
//
// Returns { hours, baseline, pct, source, refSource }.

import { resolveReferenceHours } from './calibration-reference.js';

export function computeCalibratedHours({ service, aircraftHoursRef, calibrations, fallbackHours, services, allHoursRows }) {
  if (!service) return { hours: 0, baseline: null, pct: 0, source: 'none' };

  const cals = Array.isArray(calibrations) ? calibrations : [];
  const byId = service.id ? cals.find(c => c.service_id === service.id) : null;
  const byName = !byId && service.name
    ? cals.find(c => (c.service_name || '').toLowerCase().trim() === service.name.toLowerCase().trim())
    : null;
  const cal = byId || byName || null;

  if (!cal) {
    const dh = parseFloat(service.default_hours);
    if (Number.isFinite(dh) && dh > 0) return { hours: dh, baseline: null, pct: 0, source: 'default' };
    const fb = parseFloat(fallbackHours);
    return { hours: Number.isFinite(fb) ? fb : 0, baseline: null, pct: 0, source: 'fallback' };
  }

  const pct = parseFloat(cal.adjustment_pct) || 0;

  // Resolve reference hours through the shared module: full reference-type set,
  // own-service ("svc:<uuid>") references, and a data-gap ratio fallback when
  // the reference column is NULL/0 for this aircraft.
  const ref = resolveReferenceHours(aircraftHoursRef, cal.reference_service_type, { services, allHoursRows });

  if (!ref || !(ref.hours > 0)) {
    // Only reachable when the aircraft has neither the reference column nor any
    // anchor hours to derive from — genuinely no data. Fall back to the service
    // default rather than emit a bogus calibrated number.
    const dh = parseFloat(service.default_hours);
    const fb = Number.isFinite(dh) && dh > 0 ? dh : (parseFloat(fallbackHours) || 0);
    console.warn(
      `[calibrate] no reference hours for "${service.name}" (ref=${cal.reference_service_type}, col=${ref?.column}) — falling back to ${fb}h`,
    );
    return { hours: fb, baseline: null, pct, source: 'default_after_null_baseline' };
  }

  const hours = Math.round(ref.hours * (1 + pct / 100) * 1000) / 1000;
  return { hours, baseline: ref.hours, pct, source: 'calibrated', refSource: ref.source };
}

// Floor the computed price at service.minimum_price. Hours stay as-is —
// only the line item's price ratchets up.
export function applyMinimumPrice(price, minimumPrice) {
  const min = parseFloat(minimumPrice);
  const p = parseFloat(price) || 0;
  if (!Number.isFinite(min) || min <= 0) return { price: p, minApplied: false };
  if (p >= min) return { price: p, minApplied: false };
  return { price: min, minApplied: true };
}
