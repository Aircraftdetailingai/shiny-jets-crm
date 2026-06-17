// Shared add-on fee calculation. Single source of truth for how a per-record
// add-on fee (stored in quotes.addon_fees / invoices.addon_fees jsonb) turns
// into a dollar amount. Used by the quote builder, the quote "Edit Fees" modal,
// the invoice edit modal, and the settings catalog editor so every surface
// agrees on the math.
//
// Fee types:
//   flat         — amount as-is
//   percent      — amount% of ctx.subtotal
//   per_staff    — amount × staff           (e.g. Travel: one trip per crew member)
//   per_night    — amount × nights × staff  (e.g. Lodging: a room per person per night)
//   per_unit_day — amount × quantity × days (e.g. Rental car: N cars over the job)
//
// For the stay-based types (per_night, per_unit_day) the span is:
//     span = jobDays + buffer_before + buffer_after
// buffer_before / buffer_after are the extra days tacked onto each end of the
// job (arrive the day before, leave the morning after). They are configured
// per-fee so e.g. lodging and a rental car can have different padding.

export const FLAT = 'flat';
export const PERCENT = 'percent';
export const PER_STAFF = 'per_staff';
export const PER_NIGHT = 'per_night';
export const PER_UNIT_DAY = 'per_unit_day';

// Display metadata for fee-type pickers.
//   usesQuantity — show a quantity field (e.g. # of rental cars)
//   usesBuffer   — show "extra days before / after" fields (stay-based fees)
//   usesStaff    — amount is multiplied by the record's staff count
//   usesDays     — amount depends on the record's job-day count
export const FEE_TYPES = [
  { value: FLAT, label: 'Flat', unitLabel: 'flat fee', usesQuantity: false, usesBuffer: false, usesStaff: false, usesDays: false },
  { value: PERCENT, label: 'Percent of subtotal', unitLabel: 'of subtotal', usesQuantity: false, usesBuffer: false, usesStaff: false, usesDays: false },
  { value: PER_STAFF, label: 'Per staff member', unitLabel: 'per staff', usesQuantity: false, usesBuffer: false, usesStaff: true, usesDays: false },
  { value: PER_NIGHT, label: 'Per night (× staff)', unitLabel: 'per night / person', usesQuantity: false, usesBuffer: true, usesStaff: true, usesDays: true },
  { value: PER_UNIT_DAY, label: 'Per unit, per day', unitLabel: 'per unit / day', usesQuantity: true, usesBuffer: true, usesStaff: false, usesDays: true },
];

export const feeTypeMeta = (type) => FEE_TYPES.find((t) => t.value === type) || FEE_TYPES[0];

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const int = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Total billable days/nights a stay-based fee spans.
export function feeSpanDays(jobDays, fee = {}) {
  return Math.max(0, num(jobDays)) + Math.max(0, int(fee.buffer_before)) + Math.max(0, int(fee.buffer_after));
}

// Dollar amount for a single fee row given the record context.
// ctx: { staffCount, jobDays, subtotal }
export function computeAddonAmount(fee, ctx = {}) {
  const amount = num(fee?.amount);
  const staff = Math.max(1, Math.round(num(ctx.staffCount, 1)) || 1);
  const qty = Math.max(0, num(fee?.quantity, 1) || 1);
  const subtotal = Math.max(0, num(ctx.subtotal));
  const span = feeSpanDays(ctx.jobDays, fee);

  switch (fee?.fee_type) {
    case PER_STAFF:    return round2(amount * staff);
    case PER_NIGHT:    return round2(amount * span * staff);
    case PER_UNIT_DAY: return round2(amount * qty * span);
    case PERCENT:      return round2(subtotal * amount / 100);
    case FLAT:
    default:           return round2(amount);
  }
}

// Sum of all fee rows. Returns a 2-decimal number.
export function computeAddonTotal(fees, ctx = {}) {
  return round2((fees || []).reduce((s, f) => s + computeAddonAmount(f, ctx), 0));
}

// Normalize a fee row for persistence: coerce numbers, carry only the fields a
// given type needs, and snapshot `calculated` so the stored total is stable
// even if the catalog defaults change later.
export function normalizeFee(fee, ctx = {}) {
  const meta = feeTypeMeta(fee.fee_type);
  const out = {
    id: fee.id,
    name: fee.name,
    fee_type: fee.fee_type || FLAT,
    amount: round2(num(fee.amount)),
    calculated: computeAddonAmount(fee, ctx),
  };
  if (meta.usesQuantity) out.quantity = Math.max(0, num(fee.quantity, 1) || 1);
  if (meta.usesBuffer) {
    out.buffer_before = Math.max(0, int(fee.buffer_before));
    out.buffer_after = Math.max(0, int(fee.buffer_after));
  }
  return out;
}

// Human-readable breakdown for one row, e.g. "$300 × 4 staff".
export function describeFee(fee, ctx = {}) {
  const sym = ctx.currencySymbol || '$';
  const amount = num(fee?.amount);
  const staff = Math.max(1, Math.round(num(ctx.staffCount, 1)) || 1);
  const qty = Math.max(0, num(fee?.quantity, 1) || 1);
  const span = feeSpanDays(ctx.jobDays, fee);
  switch (fee?.fee_type) {
    case PER_STAFF:    return `${sym}${amount} × ${staff} staff`;
    case PER_NIGHT:    return `${sym}${amount} × ${span} nights × ${staff} staff`;
    case PER_UNIT_DAY: return `${sym}${amount} × ${qty} × ${span} days`;
    case PERCENT:      return `${amount}% of subtotal`;
    default:           return `${sym}${amount} flat`;
  }
}
