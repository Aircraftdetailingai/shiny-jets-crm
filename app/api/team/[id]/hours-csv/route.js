import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return new Response('Database not configured', { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }
    const planGate = await requireFeature(request, 'team', { user: user });
    if (planGate) return planGate;

    const { id } = await params;

    // Verify ownership and get pay_period_start
    const { data: member, error: memberErr } = await supabase
      .from('team_members')
      .select('id, name, pay_period_start')
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (memberErr || !member) {
      return new Response('Team member not found', { status: 404 });
    }

    const url = new URL(request.url);
    const defaultFrom = member.pay_period_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const from = url.searchParams.get('from') || defaultFrom;
    const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];

    // Fetch time entries in range
    const { data: entries } = await supabase
      .from('time_entries')
      .select('date, clock_in, clock_out, hours_worked, job_id')
      .eq('team_member_id', id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    const rows = entries || [];

    // Fetch job details
    const jobIds = [...new Set(rows.filter(e => e.job_id).map(e => e.job_id))];
    let jobMap = {};
    if (jobIds.length > 0) {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, tail_number, aircraft_model')
        .in('id', jobIds);
      if (jobs) {
        for (const j of jobs) jobMap[j.id] = j;
      }
    }

    // Build CSV
    const csvLines = ['Date,Clock In,Clock Out,Hours,Job,Aircraft'];
    for (const e of rows) {
      const job = e.job_id && jobMap[e.job_id];
      const jobLabel = job ? (job.tail_number || job.id.slice(0, 8)) : '';
      const aircraft = job ? (job.aircraft_model || '') : '';
      const clockIn = e.clock_in ? new Date(e.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const clockOut = e.clock_out ? new Date(e.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const hours = parseFloat(e.hours_worked || 0).toFixed(2);

      csvLines.push(
        [e.date, clockIn, clockOut, hours, csvEscape(jobLabel), csvEscape(aircraft)].join(',')
      );
    }

    const csv = csvLines.join('\n');
    const safeName = (member.name || 'employee').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_hours_${from}_to_${to}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Hours CSV error:', err);
    return new Response('Failed to generate CSV', { status: 500 });
  }
}

function csvEscape(val) {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
