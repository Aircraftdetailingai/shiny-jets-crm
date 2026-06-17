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
export const PER_DAY = 'per_day';
export const PER_STAFF_PER_DAY = 'per_staff_per_day';

// Compound fees: a parent fee (is_compound=true) has no single amount — its
// value is the SUM of its sub_items. Each sub-item is itself a plain fee
// ({ id, name, fee_type, amount, calculated, note }) with no buffer/quantity.
// Customer-facing views show only the parent name + total; the breakdown is
// for the detailer's internal records.

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
  { value: PER_DAY, label: 'Per day', unitLabel: 'per day', usesQuantity: false, usesBuffer: false, usesStaff: false, usesDays: true },
  { value: PER_STAFF_PER_DAY, label: 'Per staff, per day', unitLabel: 'per staff / day', usesQuantity: false, usesBuffer: false, usesStaff: true, usesDays: true },
];

export const feeTypeMeta = (type) => FEE_TYPES.find((t) => t.value === type) || FEE_TYPES[0];

// Fee types valid for a compound sub-item (no buffer/quantity/nesting).
export const SUB_ITEM_TYPES = FEE_TYPES.filter((t) =>
  [FLAT, PERCENT, PER_STAFF, PER_DAY, PER_STAFF_PER_DAY].includes(t.value));

// Quick-add presets for the sub-item palette (Settings + quote builder).
export const SUB_ITEM_PRESETS = [
  { name: 'Per Diem', fee_type: PER_STAFF_PER_DAY, amount: 50 },
  { name: 'Travel Day', fee_type: PER_STAFF, amount: 500 },
  { name: 'Lodging', fee_type: PER_DAY, amount: 200 },
  { name: 'Flight', fee_type: FLAT, amount: 500 },
  { name: 'Rental', fee_type: FLAT, amount: 500 },
  { name: 'Custom', fee_type: FLAT, amount: 0 },
];

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
  // Compound parent = sum of its sub-items (sub-items are never compound).
  if (fee?.is_compound) {
    return round2((fee.sub_items || []).reduce((s, si) => s + computeAddonAmount(si, ctx), 0));
  }

  const amount = num(fee?.amount);
  const staff = Math.max(1, Math.round(num(ctx.staffCount, 1)) || 1);
  const qty = Math.max(0, num(fee?.quantity, 1) || 1);
  const subtotal = Math.max(0, num(ctx.subtotal));
  const span = feeSpanDays(ctx.jobDays, fee);
  const days = Math.max(0, num(ctx.jobDays)); // raw job days (sub-items have no buffer)

  switch (fee?.fee_type) {
    case PER_STAFF:         return round2(amount * staff);
    case PER_NIGHT:         return round2(amount * span * staff);
    case PER_UNIT_DAY:      return round2(amount * qty * span);
    case PER_DAY:           return round2(amount * days);
    case PER_STAFF_PER_DAY: return round2(amount * days * staff);
    case PERCENT:           return round2(subtotal * amount / 100);
    case FLAT:
    default:                return round2(amount);
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
  // Compound parent: persist the sub-item breakdown + snapshot each sub-item's
  // calculated value and the parent total. The parent has no single amount.
  if (fee.is_compound) {
    const sub_items = (fee.sub_items || []).map((si) => ({
      id: si.id,
      name: si.name,
      fee_type: si.fee_type || FLAT,
      amount: round2(num(si.amount)),
      note: si.note || '',
      calculated: computeAddonAmount(si, ctx),
    }));
    return {
      id: fee.id,
      name: fee.name,
      fee_type: fee.fee_type || FLAT,
      is_compound: true,
      sub_items,
      amount: 0,
      calculated: round2(sub_items.reduce((s, si) => s + (si.calculated || 0), 0)),
    };
  }

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
  if (fee?.is_compound) {
    const n = (fee.sub_items || []).length;
    return `${n} sub-item${n !== 1 ? 's' : ''}`;
  }
  const amount = num(fee?.amount);
  const staff = Math.max(1, Math.round(num(ctx.staffCount, 1)) || 1);
  const qty = Math.max(0, num(fee?.quantity, 1) || 1);
  const span = feeSpanDays(ctx.jobDays, fee);
  const days = Math.max(0, num(ctx.jobDays));
  switch (fee?.fee_type) {
    case PER_STAFF:         return `${sym}${amount} × ${staff} staff`;
    case PER_NIGHT:         return `${sym}${amount} × ${span} nights × ${staff} staff`;
    case PER_UNIT_DAY:      return `${sym}${amount} × ${qty} × ${span} days`;
    case PER_DAY:           return `${sym}${amount} × ${days} days`;
    case PER_STAFF_PER_DAY: return `${sym}${amount} × ${days} days × ${staff} staff`;
    case PERCENT:           return `${amount}% of subtotal`;
    default:                return `${sym}${amount} flat`;
  }
}
