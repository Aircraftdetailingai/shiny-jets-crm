import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;
  const today = new Date().toISOString().split('T')[0];

  // Get all active team members
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, title, status')
    .eq('detailer_id', detailerId)
    .eq('status', 'active');

  // Get open time entries (clocked in now) — filter to today + order by most recent
  const { data: openEntries } = await supabase
    .from('time_entries')
    .select('id, team_member_id, clock_in, job_id, quote_id')
    .eq('detailer_id', detailerId)
    .eq('date', today)
    .is('clock_out', null)
    .not('clock_in', 'is', null)
    .order('clock_in', { ascending: false });

  // Get job details for open entries
  const jobIds = (openEntries || []).map(e => e.job_id).filter(Boolean);
  const quoteIds = (openEntries || []).map(e => e.quote_id).filter(Boolean);

  let jobMap = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, aircraft_model, aircraft_make, tail_number')
      .in('id', jobIds);
    for (const j of jobs || []) {
      jobMap[j.id] = `${j.aircraft_make || ''} ${j.aircraft_model || ''}`.trim() + (j.tail_number ? ` ${j.tail_number}` : '');
    }
  }
  if (quoteIds.length > 0) {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, aircraft_model, tail_number')
      .in('id', quoteIds);
    for (const q of quotes || []) {
      jobMap[q.id] = (q.aircraft_model || '') + (q.tail_number ? ` ${q.tail_number}` : '');
    }
  }

  // Build entry map by member — keep only the most recent open entry per member
  // (entries already sorted by clock_in DESC, so first match wins)
  const entryMap = {};
  for (const e of openEntries || []) {
    if (entryMap[e.team_member_id]) continue; // skip older entries for same member
    entryMap[e.team_member_id] = {
      clock_in: e.clock_in,
      job_id: e.job_id || e.quote_id,
      job_label: jobMap[e.job_id] || jobMap[e.quote_id] || null,
    };
  }

  // Today's stats
  const { data: todayEntries } = await supabase
    .from('time_entries')
    .select('hours_worked')
    .eq('detailer_id', detailerId)
    .eq('date', today)
    .not('clock_out', 'is', null);
  const todayHours = (todayEntries || []).reduce((s, e) => s + (parseFloat(e.hours_worked) || 0), 0);

  const statuses = (members || []).map(m => {
    const entry = entryMap[m.id];
    return {
      id: m.id,
      name: m.name,
      title: m.title,
      clocked_in: !!entry,
      clock_in_time: entry?.clock_in || null,
      job_label: entry?.job_label || null,
      job_id: entry?.job_id || null,
    };
  });

  return Response.json({
    members: statuses,
    clocked_in_count: statuses.filter(s => s.clocked_in).length,
    today_hours: Math.round(todayHours * 100) / 100,
  });
}
