import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Aggregated payroll for a date range
// Query params: start_date, end_date (YYYY-MM-DD)
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const detailerId = user.detailer_id || user.id;

  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const startDate = searchParams.get('start_date') || defaultStart;
  const endDate = searchParams.get('end_date') || today;

  const supabase = getSupabase();

  // Fetch time entries for this detailer in range
  // Try with job_id first, fall back if column missing
  let entries = [];
  try {
    const result = await supabase
      .from('time_entries')
      .select('id, team_member_id, date, hours_worked, clock_in, clock_out, job_id, quote_id, approved')
      .eq('detailer_id', detailerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .not('clock_out', 'is', null)
      .order('date', { ascending: true });
    if (result.error) throw result.error;
    entries = result.data || [];
  } catch {
    const { data } = await supabase
      .from('time_entries')
      .select('id, team_member_id, date, hours_worked, clock_in, clock_out, quote_id, approved')
      .eq('detailer_id', detailerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .not('clock_out', 'is', null)
      .order('date', { ascending: true });
    entries = data || [];
  }

  // Fetch all team members for this detailer
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, title, type, hourly_pay, status')
    .eq('detailer_id', detailerId);
  const membersById = {};
  for (const m of (members || [])) membersById[m.id] = m;

  // Bulk-fetch job and quote labels for entries
  const jobIds = [...new Set(entries.map(e => e.job_id).filter(Boolean))];
  const quoteIds = [...new Set(entries.map(e => e.quote_id).filter(Boolean))];

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

  // Aggregate: per-member totals + per-job breakdown within each member
  const byMember = {};
  for (const e of entries) {
    const memberKey = e.team_member_id;
    if (!memberKey) continue;
    const member = membersById[memberKey];
    if (!member) continue;

    if (!byMember[memberKey]) {
      byMember[memberKey] = {
        team_member_id: memberKey,
        name: member.name,
        title: member.title,
        type: member.type,
        hourly_pay: parseFloat(member.hourly_pay) || 0,
        total_hours: 0,
        total_pay: 0,
        jobs: {},
      };
    }

    const hrs = parseFloat(e.hours_worked) || 0;
    byMember[memberKey].total_hours += hrs;

    const jobKey = e.job_id || e.quote_id || 'unassigned';
    const label = jobLabels[jobKey] || (jobKey === 'unassigned' ? 'Unassigned time' : 'Unknown');
    if (!byMember[memberKey].jobs[jobKey]) {
      byMember[memberKey].jobs[jobKey] = { job_id: jobKey, label, hours: 0 };
    }
    byMember[memberKey].jobs[jobKey].hours += hrs;
  }

  // Finalize pay calculations
  const payrollMembers = Object.values(byMember).map(m => {
    m.total_hours = Math.round(m.total_hours * 100) / 100;
    m.total_pay = Math.round(m.total_hours * m.hourly_pay * 100) / 100;
    m.jobs = Object.values(m.jobs).map(j => ({
      ...j,
      hours: Math.round(j.hours * 100) / 100,
    })).sort((a, b) => b.hours - a.hours);
    return m;
  }).sort((a, b) => b.total_hours - a.total_hours);

  const totalHours = payrollMembers.reduce((sum, m) => sum + m.total_hours, 0);
  const totalPay = payrollMembers.reduce((sum, m) => sum + m.total_pay, 0);

  return Response.json({
    start_date: startDate,
    end_date: endDate,
    total_hours: Math.round(totalHours * 100) / 100,
    total_pay: Math.round(totalPay * 100) / 100,
    members: payrollMembers,
    entry_count: entries.length,
  });
}
