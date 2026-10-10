import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { buildLaborReport, entryBelongsToShop, inRange, isoToday, payableHours } from '@/lib/labor-summary';
import { fetchShopTimeEntries } from '@/lib/shop-time-entries';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Aggregated payroll for a date range.
// With no dates, the range matches Team: current pay period when it has closed
// shifts, otherwise the shop's full recorded labor window.
// Query: start_date, end_date (YYYY-MM-DD) or range=labor_window|pay_period|last_90
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'team', { user: user });
  if (planGate) return planGate;
  const detailerId = user.detailer_id || user.id;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start_date') || '';
  const endDate = searchParams.get('end_date') || '';
  const range = searchParams.get('range') || '';
  const today = isoToday();
  const supabase = getSupabase();

  const { data: members, error: memberErr } = await supabase
    .from('team_members')
    .select('id, name, title, type, hourly_pay, status, pay_period_frequency, pay_period_start, created_at')
    .eq('detailer_id', detailerId);
  if (memberErr) {
    console.error('[payroll] team members error:', memberErr.message);
    return Response.json({ error: 'Failed to load payroll' }, { status: 500 });
  }

  const memberList = members || [];
  let entries = [];
  try {
    entries = await fetchShopTimeEntries(supabase, memberList.map((m) => m.id));
  } catch (err) {
    console.error('[payroll] time entries error:', err.message);
    return Response.json({ error: 'Failed to load payroll' }, { status: 500 });
  }

  const report = buildLaborReport({
    entries,
    members: memberList,
    detailerId,
    today,
    startDate,
    endDate,
    range,
  });

  const memberIds = new Set(memberList.map((m) => m.id));
  const payable = entries.filter((e) =>
    entryBelongsToShop(e, detailerId, memberIds)
    && inRange(e, report.start_date, report.end_date)
    && payableHours(e) > 0
    && (e.job_id || e.quote_id)
  );
  const jobIds = [...new Set(payable.map((e) => e.job_id).filter(Boolean))];
  const quoteIds = [...new Set(payable.map((e) => e.quote_id).filter(Boolean))];
  const jobLabels = {};

  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, aircraft_make, aircraft_model, tail_number, customer_name')
      .in('id', jobIds);
    for (const j of (jobs || [])) {
      const aircraft = [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ');
      jobLabels[j.id] = aircraft || j.tail_number || j.customer_name || 'Job';
    }
  }
  if (quoteIds.length > 0) {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, aircraft_model, aircraft_type, tail_number, client_name')
      .in('id', quoteIds);
    for (const q of (quotes || [])) {
      jobLabels[q.id] = q.aircraft_model || q.aircraft_type || q.tail_number || q.client_name || 'Quote';
    }
  }

  for (const member of report.members) {
    for (const job of member.jobs) {
      if (jobLabels[job.job_id]) job.label = jobLabels[job.job_id];
    }
  }

  return Response.json({
    start_date: report.start_date,
    end_date: report.end_date,
    range_kind: report.range_kind,
    range_label: report.range_label,
    fallback_reason: report.fallback_reason,
    period_note: report.period_note,
    pay_period: report.pay_period,
    labor_window: report.labor_window,
    labor_totals: report.labor_totals,
    suggested_range: report.suggested_range,
    total_hours: report.total_hours,
    total_pay: report.total_pay,
    members: report.members,
    entry_count: report.payable_entry_count,
    open_entries: report.open_entries,
    open_shift_policy: report.open_shift_policy,
    includes_open_shifts_in_totals: false,
  });
}
