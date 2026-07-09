// Single source of truth for resolving a service_calibrations
// `reference_service_type` to real hours off an aircraft_hours row.
//
// WHY THIS EXISTS
// The calibration *preview* (/api/services/calibration-preview) understood the
// full set of reference types + a detailer's own-service ("svc:<uuid>")
// references, but the *apply* path (lib/calibrate-hours.js + the quote builder
// and invoice inline resolvers) only knew wash|polish|wax. So a calibration
// against ceramic / compound / spray_ceramic / interior / leather / decon /
// an own-service reference would preview correctly, then silently flatline to
// the service default in real quotes and invoices. Centralizing the mapping
// here means preview and apply can never drift again.
//
// This module operates on aircraft_hours rows (the `*_hrs` columns). The
// legacy `aircraft` table (ext_wash_hours, ...) used by the calibration POST
// precompute is a separate dialect and is intentionally NOT handled here.

// reference_service_type -> aircraft_hours column. Mirrors the preview's
// ANCHOR_HOURS_COLUMN, extended to every type the preview/UI can produce.
// `detail_interior` is the legacy key CalibrationModal + existing DB rows use;
// `interior` is its canonical alias — both resolve to carpet_hrs so refactoring
// the preview to import this map is a zero-behavior change.
export const REF_TO_HRS_COL = {
  wash: 'maintenance_wash_hrs',
  polish: 'one_step_polish_hrs',
  compound: 'one_step_polish_hrs',
  wax: 'wax_hrs',
  spray_ceramic: 'spray_ceramic_hrs',
  ceramic: 'ceramic_coating_hrs',
  interior: 'carpet_hrs',
  detail_interior: 'carpet_hrs',
  leather: 'leather_hrs',
  decon: 'decon_paint_hrs',
};

// services.hours_field is named for the legacy `aircraft` table, so an
// own-service ("svc:<uuid>") reference resolves through this bridge to the
// matching aircraft_hours column.
export const HOURS_FIELD_TO_HRS_COL = {
  ext_wash_hours: 'maintenance_wash_hrs',
  polish_hours: 'one_step_polish_hrs',
  wax_hours: 'wax_hrs',
  spray_ceramic_hours: 'spray_ceramic_hrs',
  ceramic_hours: 'ceramic_coating_hrs',
  // int_detail_hours intentionally has NO entry — interior detail has no
  // aircraft_hours equivalent (carpet_hrs is carpet only, not the full
  // interior). An own-service reference pointing at an interior-detail service
  // therefore falls through to the wash column below rather than mis-claiming
  // carpet hours.
  carpet_hours: 'carpet_hrs',
  leather_hours: 'leather_hrs',
  decon_hours: 'decon_paint_hrs',
  brightwork_hours: 'brightwork_hrs',
};

// Anchor column for the data-gap ratio. Ratios are expressed relative to
// one_step_polish_hrs; when that is also missing we fall back to the
// maintenance wash column as the multiplicand (per spec).
const ANCHOR_COL = 'one_step_polish_hrs';
const ANCHOR_FALLBACK_COL = 'maintenance_wash_hrs';

// Snapshot of avg(column / one_step_polish_hrs) across all aircraft_hours rows
// (209 rows, computed 2026-07-09). Used when a reference column is NULL/0 for
// an aircraft AND the caller did not pass ctx.allHoursRows for a live
// computation (the browser apply paths). Still ratio-based — never a flat
// default. Regenerate with:
//   avg over aircraft_hours where col>0 AND one_step_polish_hrs>0 of
//   (col / one_step_polish_hrs)
const FALLBACK_RATIOS = {
  maintenance_wash_hrs: 0.3983,
  one_step_polish_hrs: 1.0,
  wax_hrs: 0.5703,
  spray_ceramic_hrs: 1.012,
  ceramic_coating_hrs: 1.7763,
  leather_hrs: 0.1973,
  carpet_hrs: 0.0894,
  decon_paint_hrs: 0.3789,
};

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

// reference_service_type -> aircraft_hours column name. Handles standard types
// and own-service ("svc:<uuid>") references via ctx.services. Falls back to the
// wash column for anything unresolvable, exactly like the preview did.
export function resolveReferenceColumn(referenceServiceType, ctx = {}) {
  const t = typeof referenceServiceType === 'string' ? referenceServiceType : '';
  if (t.startsWith('svc:')) {
    const svcId = t.slice(4);
    const services = Array.isArray(ctx.services) ? ctx.services : [];
    const svc = services.find((s) => s && String(s.id) === svcId);
    const bridged = svc && svc.hours_field ? HOURS_FIELD_TO_HRS_COL[svc.hours_field] : null;
    return bridged || REF_TO_HRS_COL.wash;
  }
  return REF_TO_HRS_COL[t] || REF_TO_HRS_COL.wash;
}

// avg(col / one_step_polish_hrs). Live when ctx.allHoursRows is supplied,
// otherwise the baked snapshot. Returns null when neither yields a ratio.
function ratioForColumn(col, ctx) {
  const rows = Array.isArray(ctx.allHoursRows) ? ctx.allHoursRows : null;
  if (rows && rows.length) {
    let sum = 0;
    let n = 0;
    for (const r of rows) {
      const a = num(r[col]);
      const b = num(r[ANCHOR_COL]);
      if (a > 0 && b > 0) {
        sum += a / b;
        n += 1;
      }
    }
    if (n > 0) return { ratio: sum / n, ratioSource: 'live' };
  }
  const snap = FALLBACK_RATIOS[col];
  if (Number.isFinite(snap) && snap > 0) return { ratio: snap, ratioSource: 'snapshot' };
  return null;
}

// Resolve real reference hours for an aircraft_hours row.
//   { hours, source: 'column' | 'derived' | 'none', column, ratio }
// - 'column': the reference column is populated for this aircraft.
// - 'derived': column is NULL/0, so hours = anchorHours × community ratio.
// - 'none': aircraft has neither the column nor any anchor hours (caller
//   should fall back to its own default). Never returns a flat default itself.
export function resolveReferenceHours(aircraftHoursRow, referenceServiceType, ctx = {}) {
  const col = resolveReferenceColumn(referenceServiceType, ctx);
  const row = aircraftHoursRow || {};

  const direct = num(row[col]);
  if (direct > 0) {
    return { hours: direct, source: 'column', column: col, ratio: null };
  }

  // Data gap: derive from the anchor column × community ratio.
  const r = ratioForColumn(col, ctx);
  const anchor = num(row[ANCHOR_COL]) > 0 ? num(row[ANCHOR_COL]) : num(row[ANCHOR_FALLBACK_COL]);
  if (r && Number.isFinite(anchor) && anchor > 0) {
    const hours = Math.round(anchor * r.ratio * 1000) / 1000;
    return { hours, source: 'derived', column: col, ratio: r.ratio };
  }

  return { hours: 0, source: 'none', column: col, ratio: null };
}
