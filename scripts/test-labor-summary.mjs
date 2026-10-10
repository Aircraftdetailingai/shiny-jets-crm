/**
 * Team and Payroll share one labor window and one closed-shift calculation.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-labor-summary.mjs
 */
import {
  addDays,
  buildLaborReport,
  daysBetween,
  entryBelongsToShop,
  hoursBetween,
  isOpenShift,
  payableHours,
  payPeriodWindow,
  rollingRange,
  validateShiftClose,
} from '../lib/labor-summary.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const TODAY = '2026-10-10';
const SHOP = 'shop-1';

function member(id, name, rate, extra = {}) {
  return {
    id,
    name,
    hourly_pay: rate,
    status: 'active',
    type: 'employee',
    title: 'Detailer',
    pay_period_frequency: 'biweekly',
    pay_period_start: '2026-01-05',
    detailer_id: SHOP,
    ...extra,
  };
}

const members = [
  member('m1', 'Alex', 50),
  member('m2', 'Blake', 50),
  member('m3', 'Casey', 45),
];

// Closed labor sits before the rolling 90-day window (2026-07-13). Two shifts
// were never clocked out and land inside that window, which is why Payroll
// showed $0 until the range was expanded.
function closed(id, teamMemberId, date, hours, extra = {}) {
  return {
    id,
    team_member_id: teamMemberId,
    detailer_id: SHOP,
    date,
    hours_worked: hours,
    clock_in: `${date}T13:00:00.000Z`,
    clock_out: `${date}T21:00:00.000Z`,
    job_id: extra.job_id || null,
    quote_id: extra.quote_id || null,
    ...extra,
  };
}

const entries = [
  closed('c1', 'm1', '2026-04-13', 8),
  closed('c2', 'm1', '2026-04-20', 7.5),
  closed('c3', 'm2', '2026-05-01', 8),
  closed('c4', 'm2', '2026-05-11', 6),
  closed('c5', 'm3', '2026-05-18', 8),
  closed('c6', 'm3', '2026-06-02', 4.6),
  closed('c7', 'm1', '2026-06-15', 8),
  closed('c8', 'm2', '2026-06-22', 8),
  closed('c9', 'm3', '2026-07-01', 8),
  closed('c10', 'm1', '2026-07-06', 5),
  closed('c11', 'm2', '2026-07-10', 8),
  closed('c12', 'm3', '2026-07-12', 5),
  // Manual log: hours entered by the shop, never a clock punch. Counts.
  {
    id: 'manual',
    team_member_id: 'm1',
    detailer_id: SHOP,
    date: '2026-06-01',
    hours_worked: 3,
    clock_in: null,
    clock_out: null,
  },
  // Open shifts. One even has stored hours — those hours must not count.
  {
    id: 'o1',
    team_member_id: 'm1',
    detailer_id: SHOP,
    date: '2026-08-15',
    hours_worked: 8,
    clock_in: '2026-08-15T13:00:00.000Z',
    clock_out: null,
  },
  {
    id: 'o2',
    team_member_id: 'm2',
    detailer_id: SHOP,
    date: '2026-08-30',
    hours_worked: 0,
    clock_in: '2026-08-30T14:00:00.000Z',
    clock_out: null,
  },
  // Another shop's row, even if it reuses a member id, never counts.
  closed('foreign', 'm1', '2026-05-02', 100, { detailer_id: 'other-shop' }),
  // A member who is not on this crew.
  closed('stranger', 'other-member', '2026-05-02', 40),
];

const closedHours = 8 + 7.5 + 8 + 6 + 8 + 4.6 + 8 + 8 + 8 + 5 + 8 + 5 + 3; // 87.1
const expectedPay = Math.round((8 + 7.5 + 8 + 3 + 5) * 50 * 100) / 100
  + Math.round((8 + 6 + 8 + 8) * 50 * 100) / 100
  + Math.round((8 + 4.6 + 8 + 5) * 45 * 100) / 100;

console.log('date helpers');
const rolling = rollingRange(TODAY, 90);
check('90-day window is 07/13 through 10/10', rolling.start_date === '2026-07-13' && rolling.end_date === '2026-10-10', JSON.stringify(rolling));
check('addDays crosses months', addDays('2026-10-10', -89) === '2026-07-13');

console.log('pay period');
const biweekly = payPeriodWindow({ pay_period_frequency: 'biweekly', pay_period_start: '2026-01-05' }, TODAY);
check('biweekly window is 14 days and contains today', daysBetween(biweekly.start_date, biweekly.end_date) === 13 && biweekly.start_date <= TODAY && biweekly.end_date >= TODAY, JSON.stringify(biweekly));
check('August labor is outside the October pay period', '2026-08-30' < biweekly.start_date);
const semi = payPeriodWindow({ pay_period_frequency: 'semi_monthly' }, TODAY);
check('semi-monthly on the 10th is the 1st–15th', semi.start_date === '2026-10-01' && semi.end_date === '2026-10-15', JSON.stringify(semi));
const monthly = payPeriodWindow({ pay_period_frequency: 'monthly' }, TODAY);
check('monthly October ends on the 31st', monthly.start_date === '2026-10-01' && monthly.end_date === '2026-10-31');
const weekly = payPeriodWindow({ pay_period_frequency: 'weekly', pay_period_start: '2026-01-05' }, TODAY);
check('weekly window is 7 days', daysBetween(weekly.start_date, weekly.end_date) === 6);

console.log('open vs payable');
check('clocked-in row is an open shift', isOpenShift(entries.find((e) => e.id === 'o1')));
check('manual log is not an open shift', !isOpenShift(entries.find((e) => e.id === 'manual')));
check('open shift hours do not count', payableHours(entries.find((e) => e.id === 'o1')) === 0);
check('manual hours count', payableHours(entries.find((e) => e.id === 'manual')) === 3);
check('closed hours count', payableHours(entries[0]) === 8);
check('foreign detailer is rejected', !entryBelongsToShop(entries.find((e) => e.id === 'foreign'), SHOP, new Set(['m1'])));
check('unstamped row for our member is kept', entryBelongsToShop({ team_member_id: 'm1', hours_worked: 1, date: '2026-05-01' }, SHOP, new Set(['m1'])));

console.log('team and payroll defaults');
const team = buildLaborReport({ entries, members, detailerId: SHOP, today: TODAY });
const payroll = buildLaborReport({ entries, members, detailerId: SHOP, today: TODAY });
check('both pages pick the same range', team.start_date === payroll.start_date && team.end_date === payroll.end_date && team.range_kind === payroll.range_kind);
check('empty pay period falls back to the labor window', team.range_kind === 'labor_window' && team.fallback_reason === 'no_payable_entries_in_pay_period');
check('labor window spans the first and last entry', team.start_date === '2026-04-13' && team.end_date === '2026-08-30', `${team.start_date} ${team.end_date}`);
check('range is labeled', team.range_label.startsWith('All recorded labor · ') && team.range_label.includes('Apr 13, 2026') && team.range_label.includes('Aug 30, 2026'), team.range_label);
check('hours match the closed + manual total', team.total_hours === payroll.total_hours && team.total_hours === roundKnown(closedHours), `${team.total_hours} vs ${closedHours}`);
check('pay matches on both pages', team.total_pay === payroll.total_pay && team.total_pay === expectedPay, `${team.total_pay} vs ${expectedPay}`);
check('three members have hours', team.members.length === 3 && payroll.members.length === 3);
check('open shifts are listed and not in the totals', team.open_entries.length === 2 && team.includes_open_shifts_in_totals === false);
check('stored hours on an open shift are excluded', team.total_hours === roundKnown(closedHours));
check('other shop hours are excluded', team.total_hours < 100);
check('policy is explicit', /not included in hours or pay/i.test(team.open_shift_policy));

console.log('rolling 90 days');
const last90 = buildLaborReport({ entries, members, detailerId: SHOP, today: TODAY, range: 'last_90' });
check('last 90 days is Jul 13–Oct 10', last90.start_date === '2026-07-13' && last90.end_date === '2026-10-10');
check('last 90 days payable total is $0', last90.total_hours === 0 && last90.total_pay === 0 && last90.members.length === 0);
check('empty 90-day view still points at the labor window', last90.suggested_range?.start_date === '2026-04-13' && last90.suggested_range?.end_date === '2026-08-30');
check('open shifts in the 90-day window are listed but not paid', last90.open_entries.length === 2 && last90.open_entries.every((o) => o.in_range) && last90.payable_entry_count === 0);
check('all-recorded totals stay available beside a narrower range', last90.labor_totals.total_hours === team.total_hours && last90.labor_totals.total_pay === team.total_pay);

console.log('current pay period when it has closed shifts');
const live = [
  closed('now', 'm1', TODAY, 4, { detailer_id: SHOP }),
  ...entries,
];
const periodReport = buildLaborReport({ entries: live, members, detailerId: SHOP, today: TODAY });
check('defaults to the pay period when it has closed hours', periodReport.range_kind === 'pay_period' && periodReport.total_hours === 4, `${periodReport.range_kind} ${periodReport.total_hours}`);
check('labor-window preset still returns the full total', buildLaborReport({ entries: live, members, detailerId: SHOP, today: TODAY, range: 'labor_window' }).total_hours === roundKnown(closedHours + 4));

console.log('explicit custom range');
const custom = buildLaborReport({
  entries,
  members,
  detailerId: SHOP,
  today: TODAY,
  startDate: '2026-06-01',
  endDate: '2026-06-30',
});
check('June custom range sums only June closed + manual hours', custom.range_kind === 'custom' && custom.total_hours === roundKnown(4.6 + 8 + 8 + 3), String(custom.total_hours));
check('swapped dates are ordered', buildLaborReport({ entries, members, detailerId: SHOP, today: TODAY, startDate: '2026-06-30', endDate: '2026-06-01' }).start_date === '2026-06-01');

console.log('closing an open shift');
check('8 hour close', hoursBetween('2026-08-30T14:00:00.000Z', '2026-08-30T22:00:00.000Z') === 8);
const now = new Date('2026-10-10T18:00:00.000Z');
const ok = validateShiftClose({
  clockIn: '2026-08-30T14:00:00.000Z',
  clockOut: '2026-08-30T22:00:00.000Z',
  now,
});
check('a same-day close is accepted', ok.ok && ok.hours === 8, JSON.stringify(ok));
const long = validateShiftClose({
  clockIn: '2026-08-30T06:00:00.000Z',
  clockOut: '2026-08-31T00:00:00.000Z',
  now,
});
check('over 16 hours needs confirmation', !long.ok && long.code === 'long_shift');
const confirmed = validateShiftClose({
  clockIn: '2026-08-30T06:00:00.000Z',
  clockOut: '2026-08-31T00:00:00.000Z',
  confirmLongShift: true,
  now,
});
check('confirmed long shift closes', confirmed.ok && confirmed.hours === 18);
const tooLong = validateShiftClose({
  clockIn: '2026-04-13T13:00:00.000Z',
  clockOut: '2026-10-10T13:00:00.000Z',
  confirmLongShift: true,
  now,
});
check('multi-month forgotten clock is rejected', !tooLong.ok && /24 hours/.test(tooLong.error));
const future = validateShiftClose({
  clockIn: '2026-10-10T12:00:00.000Z',
  clockOut: '2026-10-10T20:00:00.000Z',
  now,
});
check('future clock-out is rejected', !future.ok && /future/.test(future.error));

console.log('date values stored with a time still fall on that day');
const stamped = buildLaborReport({
  entries: [{
    id: 't',
    team_member_id: 'm1',
    detailer_id: SHOP,
    date: '2026-06-01T00:00:00.000Z',
    hours_worked: 2,
    clock_in: null,
    clock_out: null,
  }],
  members: [members[0]],
  detailerId: SHOP,
  today: TODAY,
  startDate: '2026-06-01',
  endDate: '2026-06-01',
});
check('timestamp date counts inside that calendar day', stamped.total_hours === 2 && stamped.labor_window.start_date === '2026-06-01', String(stamped.total_hours));

console.log('per-member agreement');
const byId = Object.fromEntries(team.member_totals.map((m) => [m.team_member_id, m]));
check('Alex excludes the open 8h', byId.m1.total_hours === roundKnown(8 + 7.5 + 8 + 5 + 3) && byId.m1.open_shifts === 1, String(byId.m1.total_hours));
check('Blake has an open shift and closed hours', byId.m2.open_shifts === 1 && byId.m2.total_hours === roundKnown(8 + 6 + 8 + 8));
check('Casey has no open shift', byId.m3.open_shifts === 0 && byId.m3.total_pay === Math.round(byId.m3.total_hours * 45 * 100) / 100);

function roundKnown(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
