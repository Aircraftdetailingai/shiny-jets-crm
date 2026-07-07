// Single source of truth for resolving a quote's validity window.
// Precedence: per-quote override -> detailer default -> fallback (30).
// The authoritative valid_until is written send-anchored (sent_at + resolvedDays),
// first-send-only — see app/api/quotes/[id]/send/route.js.

export const FALLBACK_VALIDITY_DAYS = 30;
export const MIN_VALIDITY_DAYS = 1;
export const MAX_VALIDITY_DAYS = 90;

// Coerce to an int within [MIN, MAX]; return null if not a usable number.
function toBoundedInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_VALIDITY_DAYS, Math.max(MIN_VALIDITY_DAYS, n));
}

// Resolve the number of days a quote is valid for.
// quoteValidityDays (per-quote override) wins; else detailer default; else 30.
export function resolveValidityDays({ quoteValidityDays, detailerDefaultDays } = {}) {
  const override = toBoundedInt(quoteValidityDays);
  if (override !== null) return override;
  const def = toBoundedInt(detailerDefaultDays);
  if (def !== null) return def;
  return FALLBACK_VALIDITY_DAYS;
}

// Absolute expiry = fromDate + days (UTC-safe; days is a whole-day offset).
export function computeValidUntil(fromDateISO, days) {
  const from = fromDateISO ? new Date(fromDateISO) : new Date();
  if (Number.isNaN(from.getTime())) {
    throw new Error(`computeValidUntil: invalid fromDate "${fromDateISO}"`);
  }
  const d = toBoundedInt(days) ?? FALLBACK_VALIDITY_DAYS;
  return new Date(from.getTime() + d * 24 * 60 * 60 * 1000).toISOString();
}

// Guard against past-dated expiries: if the computed date is already in the
// past (clock skew, zero/garbage input), clamp to now + 1 day. Returns both the
// (possibly clamped) ISO and a `clamped` flag so callers can surface a warning.
export function clampFuture(dateISO) {
  const target = new Date(dateISO);
  const now = new Date();
  if (Number.isNaN(target.getTime()) || target.getTime() <= now.getTime()) {
    return {
      validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      clamped: true,
    };
  }
  return { validUntil: target.toISOString(), clamped: false };
}
