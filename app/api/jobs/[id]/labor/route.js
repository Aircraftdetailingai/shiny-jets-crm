import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Labor breakdown for a job (all crew time entries + estimated hours)
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const detailerId = user.detailer_id || user.id;
  const jobId = params?.id;
  if (!jobId) return Response.json({ error: 'job id required' }, { status: 400 });

  const supabase = getSupabase();

  // Verify the job belongs to this detailer — try jobs table first, fall back to quotes
  let jobType = 'job';
  let estimatedHours = 0;
  let jobLabel = 'Job';

  const { data: job } = await supabase
    .from('jobs')
    .select('id, detailer_id, aircraft_make, aircraft_model, tail_number, customer_name, services')
    .eq('id', jobId)
    .maybeSingle();

  if (job) {
    if (job.detailer_id !== detailerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const aircraft = [job.aircraft_make, job.aircraft_model].filter(Boolean).join(' ');
    jobLabel = aircraft || job.tail_number || job.customer_name || 'Job';
    // Estimated hours from services JSON
    try {
      const svcs = typeof job.services === 'string' ? JSON.parse(job.services) : job.services;
      if (Array.isArray(svcs)) {
        estimatedHours = svcs.reduce((sum, s) => sum + (parseFloat(s?.hours) || 0), 0);
      }
    } catch {}
  } else {
    // Try as quote
    jobType = 'quote';
    const { data: quote } = await supabase
      .from('quotes')
      .select('id, detailer_id, aircraft_model, aircraft_type, tail_number, client_name, line_items')
      .eq('id', jobId)
      .maybeSingle();
    if (!quote) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (quote.detailer_id !== detailerId) return Response.json({ error: 'Forbidden' }, { status: 403 });
    jobLabel = quote.aircraft_model || quote.aircraft_type || quote.tail_number || quote.client_name || 'Quote';
    try {
      const items = typeof quote.line_items === 'string' ? JSON.parse(quote.line_items) : quote.line_items;
      if (Array.isArray(items)) {
        estimatedHours = items.reduce((sum, i) => sum + (parseFloat(i?.hours) || 0), 0);
      }
    } catch {}
  }

  // Fetch time entries — match by job_id OR quote_id OR both
  // Column-stripping: if job_id column doesn't exist, fall back to quote_id only
  let entries = [];
  try {
    const { data } = await supabase
      .from('time_entries')
      .select('id, team_member_id, clock_in, clock_out, hours_worked, date, notes, job_id, quote_id')
      .or(`job_id.eq.${jobId},quote_id.eq.${jobId}`)
      .eq('detailer_id', detailerId)
      .order('clock_in', { ascending: true });
    entries = data || [];
  } catch {
    const { data } = await supabase
      .from('time_entries')
      .select('id, team_member_id, clock_in, clock_out, hours_worked, date, notes, quote_id')
      .eq('quote_id', jobId)
      .eq('detailer_id', detailerId)
      .order('clock_in', { ascending: true });
    entries = data || [];
  }

  // Fallback: if the above .or query errored (job_id column missing), try quote_id alone
  if (entries.length === 0 && jobType === 'quote') {
    const { data } = await supabase
      .from('time_entries')
      .select('id, team_member_id, clock_in, clock_out, hours_worked, date, notes, quote_id')
      .eq('quote_id', jobId)
      .eq('detailer_id', detailerId)
      .order('clock_in', { ascending: true });
    if (data) entries = data;
  }

  // Attach team member names + hourly rates
  const memberIds = [...new Set(entries.map(e => e.team_member_id).filter(Boolean))];
  let membersById = {};
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, hourly_pay, title')
      .in('id', memberIds);
    if (members) {
      for (const m of members) membersById[m.id] = m;
    }
  }

  // Group entries by team member
  const byMember = {};
  for (const e of entries) {
    const m = membersById[e.team_member_id];
    const key = e.team_member_id || 'unknown';
    if (!byMember[key]) {
      byMember[key] = {
        team_member_id: e.team_member_id,
        name: m?.name || 'Unknown',
        title: m?.title || null,
        hourly_pay: parseFloat(m?.hourly_pay) || 0,
        total_hours: 0,
        total_pay: 0,
        entries: [],
      };
    }
    const hrs = parseFloat(e.hours_worked) || 0;
    byMember[key].total_hours += hrs;
    byMember[key].total_pay += hrs * (parseFloat(m?.hourly_pay) || 0);
    byMember[key].entries.push({
      id: e.id,
      clock_in: e.clock_in,
      clock_out: e.clock_out,
      hours_worked: hrs,
      date: e.date,
      notes: e.notes,
    });
  }

  const members = Object.values(byMember).sort((a, b) => b.total_hours - a.total_hours);
  const totalHours = members.reduce((sum, m) => sum + m.total_hours, 0);
  const totalPay = members.reduce((sum, m) => sum + m.total_pay, 0);

  return Response.json({
    job_id: jobId,
    job_type: jobType,
    job_label: jobLabel,
    estimated_hours: estimatedHours,
    actual_hours: Math.round(totalHours * 100) / 100,
    over_estimate: estimatedHours > 0 && totalHours > estimatedHours,
    total_labor_cost: Math.round(totalPay * 100) / 100,
    members,
    entry_count: entries.length,
  });
}
