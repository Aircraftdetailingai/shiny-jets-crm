// Shared hours/pay window for Team and Payroll.
//
// Open shifts (clocked in, never clocked out) are NOT included in hours or pay.
// Their hours are not final, and counting them would disagree with a closed-shift
// payroll. Manual logs (hours entered, no clock) and clocked-out shifts count.
// Both pages default to the current pay period when it has closed shifts, and to
// the shop's full recorded labor window when it does not.

export const OPEN_SHIFT_POLICY =
  'Open shifts are not included in hours or pay until they are clocked out.';

export const LONG_SHIFT_HOURS = 16;
export const MAX_SHIFT_HOURS = 24;

export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isoToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const t = parseIsoDate(iso);
  if (t == null) return '';
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(startIso, endIso) {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  if (a == null || b == null) return 0;
  return Math.round((b - a) / 86400000);
}

export function formatIsoDate(iso) {
  const t = parseIsoDate(iso);
  if (t == null) return '';
  return new Date(t + 12 * 3600000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function isOpenShift(entry) {
  if (!entry) return false;
  const clockIn = entry.clock_in;
  const clockOut = entry.clock_out;
  return Boolean(clockIn) && (clockOut == null || clockOut === '');
}

// Hours that count toward pay. Open shifts contribute 0 even if hours_worked was stored.
export function payableHours(entry) {
  if (!entry || isOpenShift(entry)) return 0;
  const hrs = parseFloat(entry.hours_worked);
  if (!Number.isFinite(hrs) || hrs <= 0) return 0;
  return hrs;
}

export function entryDate(entry) {
  const raw = entry?.date;
  if (raw == null || raw === '') return '';
  const s = String(raw);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export function inRange(entry, startDate, endDate) {
  const date = entryDate(entry);
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

// A row belongs to this shop when its crew member does. A detailer_id stamped
// with a different shop is rejected so another tenant's labor cannot leak in.
export function entryBelongsToShop(entry, detailerId, memberIds) {
  if (!entry?.team_member_id) return false;
  if (memberIds && !memberIds.has(entry.team_member_id)) return false;
  if (detailerId && entry.detailer_id && entry.detailer_id !== detailerId) return false;
  return true;
}

export function laborWindow(entries) {
  const dates = (entries || []).map(entryDate).filter(Boolean).slice().sort();
  if (!dates.length) return null;
  return {
    start_date: dates[0],
    end_date: dates[dates.length - 1],
    entry_count: dates.length,
    open_entries: (entries || []).filter((e) => entryDate(e) && isOpenShift(e)).length,
    kind: 'labor_window',
  };
}

export function rollingRange(today, days = 90) {
  const span = Math.max(1, Number(days) || 90);
  return {
    start_date: addDays(today, -(span - 1)),
    end_date: today,
    kind: 'last_90',
  };
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

// Inclusive pay-period window for one member. Date math is UTC so it matches
// the `date` column and does not shift across timezones.
export function payPeriodWindow(member, todayIso) {
  const freq = member?.pay_period_frequency || 'biweekly';
  const anchor = /^\d{4}-\d{2}-\d{2}/.test(member?.pay_period_start || '')
    ? member.pay_period_start.slice(0, 10)
    : (/^\d{4}-\d{2}-\d{2}/.test(member?.created_at || '')
      ? String(member.created_at).slice(0, 10)
      : todayIso);

  if (freq === 'weekly' || freq === 'biweekly') {
    const length = freq === 'weekly' ? 7 : 14;
    let diff = daysBetween(anchor, todayIso);
    if (diff < 0) diff = 0;
    const periods = Math.floor(diff / length);
    const start = addDays(anchor, periods * length);
    return {
      start_date: start,
      end_date: addDays(start, length - 1),
      frequency: freq,
    };
  }

  const [y, m, d] = todayIso.split('-').map(Number);
  if (freq === 'semi_monthly') {
    if (d <= 15) {
      return { start_date: iso(y, m, 1), end_date: iso(y, m, 15), frequency: freq };
    }
    return { start_date: iso(y, m, 16), end_date: iso(y, m, lastDayOfMonth(y, m)), frequency: freq };
  }

  return { start_date: iso(y, m, 1), end_date: iso(y, m, lastDayOfMonth(y, m)), frequency: freq };
}

export function shopPayPeriod(members, todayIso) {
  const active = (members || []).filter((m) => m && m.status !== 'inactive' && m.status !== 'archived');
  const list = active.length ? active : (members || []).filter(Boolean);
  if (!list.length) {
    const w = payPeriodWindow({ pay_period_frequency: 'monthly' }, todayIso);
    return { ...w, kind: 'pay_period', combined: false };
  }
  const windows = list.map((m) => payPeriodWindow(m, todayIso));
  const starts = windows.map((w) => w.start_date).slice().sort();
  const ends = windows.map((w) => w.end_date).slice().sort();
  const same = windows.every((w) => w.start_date === windows[0].start_date && w.end_date === windows[0].end_date);
  return {
    start_date: starts[0],
    end_date: ends[ends.length - 1],
    kind: 'pay_period',
    combined: !same,
    frequency: same ? windows[0].frequency : 'mixed',
  };
}

export function resolveDefaultRange({ entries, members, today }) {
  const period = shopPayPeriod(members, today);
  const window = laborWindow(entries);
  const payableInPeriod = (entries || []).some((e) =>
    inRange(e, period.start_date, period.end_date) && payableHours(e) > 0
  );
  if (payableInPeriod) {
    return {
      start_date: period.start_date,
      end_date: period.end_date,
      kind: 'pay_period',
      fallback_reason: null,
    };
  }
  if (window) {
    return {
      start_date: window.start_date,
      end_date: window.end_date,
      kind: 'labor_window',
      fallback_reason: 'no_payable_entries_in_pay_period',
    };
  }
  return {
    start_date: today,
    end_date: today,
    kind: 'labor_window',
    fallback_reason: 'no_labor',
  };
}

const KIND_TITLE = {
  labor_window: 'All recorded labor',
  pay_period: 'Current pay period',
  last_90: 'Last 90 days',
  custom: 'Custom range',
};

export function rangeLabel(kind, start, end, { combined = false } = {}) {
  const title = kind === 'pay_period' && combined ? 'Current pay periods' : (KIND_TITLE[kind] || KIND_TITLE.custom);
  if (!start || !end) return title;
  return `${title} · ${formatIsoDate(start)} – ${formatIsoDate(end)}`;
}

export function periodNote(resolved, payPeriod) {
  if (resolved?.fallback_reason === 'no_payable_entries_in_pay_period' && payPeriod) {
    const span = `${formatIsoDate(payPeriod.start_date)} – ${formatIsoDate(payPeriod.end_date)}`;
    return `No closed shifts in the current pay period (${span}), so this view shows all recorded labor.`;
  }
  if (resolved?.fallback_reason === 'no_labor') return 'No time entries yet for this shop.';
  if (resolved?.kind === 'labor_window') return 'All recorded labor for this shop.';
  if (resolved?.kind === 'pay_period') {
    return payPeriod?.combined
      ? 'Current pay periods combined across the crew (members use different schedules).'
      : 'Current pay period.';
  }
  if (resolved?.kind === 'last_90') return 'Last 90 days.';
  return 'Custom date range.';
}

function memberRate(member) {
  return parseFloat(member?.hourly_pay) || 0;
}

function jobKeyOf(entry) {
  return entry.job_id || entry.quote_id || 'unassigned';
}

export function summarizeLabor({
  entries,
  members,
  detailerId,
  startDate,
  endDate,
  jobLabels = {},
  now = new Date(),
}) {
  const memberList = members || [];
  const memberIds = new Set(memberList.map((m) => m.id));
  const byId = new Map(memberList.map((m) => [m.id, m]));
  const buckets = {};
  for (const m of memberList) buckets[m.id] = { hours: 0, jobs: {} };

  const openEntries = [];
  let payableEntryCount = 0;

  for (const entry of entries || []) {
    if (!entryBelongsToShop(entry, detailerId, memberIds)) continue;
    if (isOpenShift(entry)) {
      const member = byId.get(entry.team_member_id);
      openEntries.push({
        id: entry.id,
        team_member_id: entry.team_member_id,
        member_name: member?.name || 'Team member',
        date: entryDate(entry) || null,
        clock_in: entry.clock_in,
        in_range: inRange(entry, startDate, endDate),
        hourly_pay: memberRate(member),
      });
      continue;
    }
    if (!inRange(entry, startDate, endDate)) continue;
    const hrs = payableHours(entry);
    if (hrs <= 0) continue;
    const bucket = buckets[entry.team_member_id];
    if (!bucket) continue;
    payableEntryCount += 1;
    bucket.hours += hrs;
    const key = jobKeyOf(entry);
    if (!bucket.jobs[key]) {
      bucket.jobs[key] = {
        job_id: key,
        label: jobLabels[key] || (key === 'unassigned' ? 'Unassigned time' : 'Job'),
        hours: 0,
      };
    }
    bucket.jobs[key].hours += hrs;
  }

  openEntries.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.clock_in || '').localeCompare(String(b.clock_in || '')));

  const memberTotals = memberList.map((m) => {
    const hours = round2(buckets[m.id]?.hours || 0);
    const pay = round2(hours * memberRate(m));
    const jobs = Object.values(buckets[m.id]?.jobs || {}).map((j) => ({
      ...j,
      hours: round2(j.hours),
    })).sort((a, b) => b.hours - a.hours);
    return {
      team_member_id: m.id,
      name: m.name,
      title: m.title || null,
      type: m.type || null,
      hourly_pay: memberRate(m),
      total_hours: hours,
      total_pay: pay,
      open_shifts: openEntries.filter((o) => o.team_member_id === m.id).length,
      jobs,
    };
  });

  const withHours = memberTotals
    .filter((m) => m.total_hours > 0)
    .sort((a, b) => b.total_hours - a.total_hours);

  return {
    members: withHours,
    member_totals: memberTotals,
    total_hours: round2(withHours.reduce((sum, m) => sum + m.total_hours, 0)),
    total_pay: round2(withHours.reduce((sum, m) => sum + m.total_pay, 0)),
    open_entries: openEntries,
    payable_entry_count: payableEntryCount,
    includes_open_shifts_in_totals: false,
    open_shift_policy: OPEN_SHIFT_POLICY,
    as_of: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseIsoDate(value) != null;
}

export function buildLaborReport({
  entries,
  members,
  detailerId,
  today,
  startDate,
  endDate,
  range,
  jobLabels,
  now,
}) {
  const memberList = members || [];
  const memberIds = new Set(memberList.map((m) => m.id));
  const shopEntries = (entries || []).filter((e) => entryBelongsToShop(e, detailerId, memberIds));
  const period = shopPayPeriod(memberList, today);
  const window = laborWindow(shopEntries);

  let resolved;
  if (isIsoDate(startDate) && isIsoDate(endDate)) {
    const start = startDate <= endDate ? startDate : endDate;
    const end = startDate <= endDate ? endDate : startDate;
    resolved = { start_date: start, end_date: end, kind: 'custom', fallback_reason: null };
  } else if (range === 'labor_window') {
    resolved = window
      ? { start_date: window.start_date, end_date: window.end_date, kind: 'labor_window', fallback_reason: null }
      : { start_date: today, end_date: today, kind: 'labor_window', fallback_reason: 'no_labor' };
  } else if (range === 'last_90') {
    resolved = { ...rollingRange(today, 90), fallback_reason: null };
  } else if (range === 'pay_period') {
    resolved = {
      start_date: period.start_date,
      end_date: period.end_date,
      kind: 'pay_period',
      fallback_reason: null,
    };
  } else {
    resolved = resolveDefaultRange({ entries: shopEntries, members: memberList, today });
  }

  const summary = summarizeLabor({
    entries: shopEntries,
    members: memberList,
    detailerId,
    startDate: resolved.start_date,
    endDate: resolved.end_date,
    jobLabels,
    now,
  });

  let laborTotals = null;
  if (window) {
    const sameWindow = resolved.start_date === window.start_date && resolved.end_date === window.end_date;
    laborTotals = sameWindow
      ? { total_hours: summary.total_hours, total_pay: summary.total_pay, start_date: window.start_date, end_date: window.end_date }
      : {
        ...(() => {
          const full = summarizeLabor({
            entries: shopEntries,
            members: memberList,
            detailerId,
            startDate: window.start_date,
            endDate: window.end_date,
            now,
          });
          return { total_hours: full.total_hours, total_pay: full.total_pay, start_date: window.start_date, end_date: window.end_date };
        })(),
      };
  }

  const label = rangeLabel(resolved.kind, resolved.start_date, resolved.end_date, {
    combined: resolved.kind === 'pay_period' && period.combined,
  });

  return {
    start_date: resolved.start_date,
    end_date: resolved.end_date,
    range_kind: resolved.kind,
    range_label: label,
    fallback_reason: resolved.fallback_reason,
    period_note: periodNote(resolved, period),
    pay_period: {
      start_date: period.start_date,
      end_date: period.end_date,
      combined: !!period.combined,
      frequency: period.frequency,
    },
    labor_window: window,
    labor_totals: laborTotals,
    suggested_range: summary.payable_entry_count === 0 ? window : null,
    ...summary,
  };
}

export function hoursBetween(clockIn, clockOut) {
  const a = new Date(clockIn).getTime();
  const b = new Date(clockOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return round2((b - a) / 3600000);
}

export function validateShiftClose({ clockIn, clockOut, confirmLongShift = false, now = new Date() }) {
  const end = new Date(clockOut).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(end)) return { ok: false, error: 'Enter a valid clock-out time.' };
  if (Number.isFinite(nowMs) && end > nowMs + 5 * 60 * 1000) {
    return { ok: false, error: 'Clock-out cannot be in the future.' };
  }
  const hours = hoursBetween(clockIn, clockOut);
  if (hours == null) return { ok: false, error: 'Clock-out must be after clock-in.' };
  if (hours > MAX_SHIFT_HOURS) {
    return {
      ok: false,
      error: `That is ${hours} hours after clock-in. Enter when the shift actually ended (24 hours or less).`,
    };
  }
  if (hours > LONG_SHIFT_HOURS && !confirmLongShift) {
    return {
      ok: false,
      code: 'long_shift',
      hours,
      error: `This shift is ${hours} hours. Confirm to close it.`,
    };
  }
  return { ok: true, hours };
}
