// One definition of "revenue" shared by the Dashboard, Jobs and Analytics.
//
//   Collected revenue — work that has been paid for or completed
//                       (paid_at set, or status paid / completed).
//   Scheduled value   — open jobs that are booked but not finished yet
//                       (accepted / approved / deposit paid / paid /
//                       scheduled / in progress). This is pipeline, not
//                       money in the bank, and is labeled as such.
//
// Works for both quote rows and rows from the manual `jobs` table.

export const COLLECTED_STATUSES = ['paid', 'completed', 'complete'];
export const DONE_STATUSES = ['completed', 'complete'];
export const OPEN_JOB_STATUSES = ['accepted', 'approved', 'deposit_paid', 'paid', 'scheduled', 'in_progress'];
export const CLOSED_STATUSES = ['cancelled', 'canceled', 'expired', 'declined', 'draft', 'refunded'];

const norm = (s) => String(s || '').toLowerCase().trim();

export function amountOf(row) {
  const n = parseFloat(row?.total_price ?? row?.total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isCollected(row) {
  if (!row) return false;
  const st = norm(row.status);
  if (st === 'refunded' || st === 'cancelled' || st === 'canceled') return false;
  return !!row.paid_at || COLLECTED_STATUSES.includes(st);
}

/** When the money counts: payment time, else completion, else schedule/creation. */
export function collectedAt(row) {
  return row?.paid_at || row?.completed_at || row?.scheduled_date || row?.created_at || null;
}

export function isDone(row) {
  return DONE_STATUSES.includes(norm(row?.status));
}

/** Booked but not finished (counts toward "Scheduled value"). */
export function isOpenJob(row) {
  const st = norm(row?.status);
  if (!st) return false;
  if (DONE_STATUSES.includes(st) || CLOSED_STATUSES.includes(st)) return false;
  return OPEN_JOB_STATUSES.includes(st);
}

export function sumAmounts(rows) {
  return (rows || []).reduce((sum, r) => sum + amountOf(r), 0);
}

/**
 * First instant of the current calendar month in an IANA time zone
 * (falls back to server time when the zone is missing/invalid). Keeps
 * "this month" aligned with the owner's wall clock instead of UTC.
 */
export function startOfMonthIso(timeZone, now = new Date()) {
  try {
    if (!timeZone) throw new Error('no tz');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]));
    const guess = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, 1, 0, 0, 0));
    const asTz = new Date(guess.toLocaleString('en-US', { timeZone }));
    const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = asTz.getTime() - asUtc.getTime();
    return new Date(guess.getTime() - offsetMs).toISOString();
  } catch {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
}
