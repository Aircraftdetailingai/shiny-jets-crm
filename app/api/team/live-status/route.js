import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Canonical "currently clocked in" source: time_entries WHERE clock_out IS NULL
// AND clock_in > NOW() - 24h. The previous version filtered by `date = today`,
// which silently dropped entries whose `date` column didn't match the server's
// UTC "today" (timezone drift, null dates, day-rollover) — leaving genuinely
// open time entries invisible on the owner Crew Status widget. Window of 24h
// also guards against forgotten/abandoned punches that should not paint
// someone as "clocked in" indefinitely.
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'team', { user: user });
  if (planGate) return planGate;

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, title, status')
    .eq('detailer_id', detailerId)
    .eq('status', 'active');

  const { data: openEntries } = await supabase
    .from('time_entries')
    .select('id, team_member_id, clock_in, job_id, quote_id')
    .eq('detailer_id', detailerId)
    .is('clock_out', null)
    .not('clock_in', 'is', null)
    .gte('clock_in', since24h)
    .order('clock_in', { ascending: false });

  const jobIds = (openEntries || []).map(e => e.job_id).filter(Boolean);
  const quoteIds = (openEntries || []).map(e => e.quote_id).filter(Boolean);

  const tailMap = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, tail_number')
      .in('id', jobIds);
    for (const j of jobs || []) tailMap[j.id] = j.tail_number || null;
  }
  if (quoteIds.length > 0) {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, tail_number')
      .in('id', quoteIds);
    for (const q of quotes || []) tailMap[q.id] = q.tail_number || null;
  }

  // Keep only the most recent open entry per member (already sorted DESC).
  const entryMap = {};
  for (const e of openEntries || []) {
    if (entryMap[e.team_member_id]) continue;
    const ref = e.job_id || e.quote_id;
    const tail = tailMap[e.job_id] || tailMap[e.quote_id] || null;
    entryMap[e.team_member_id] = {
      clock_in: e.clock_in,
      job_id: ref,
      tail_number: tail,
      job_label: tail ? `On ${tail}` : 'Working',
    };
  }

  // Today's completed hours — keep using calendar date for the daily summary;
  // falls back to clock_in date if `date` isn't populated.
  const today = new Date().toISOString().split('T')[0];
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
      tail_number: entry?.tail_number || null,
      job_label: entry?.job_label || null,
      job_id: entry?.job_id || null,
    };
  });

  // Sort: clocked-in members first (by most recent clock_in), then everyone else by name.
  statuses.sort((a, b) => {
    if (a.clocked_in && !b.clocked_in) return -1;
    if (!a.clocked_in && b.clocked_in) return 1;
    if (a.clocked_in && b.clocked_in) {
      return new Date(b.clock_in_time).getTime() - new Date(a.clock_in_time).getTime();
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  return Response.json(
    {
      members: statuses,
      clocked_in_count: statuses.filter(s => s.clocked_in).length,
      today_hours: Math.round(todayHours * 100) / 100,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
