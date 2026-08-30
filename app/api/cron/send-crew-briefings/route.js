import { createClient } from '@supabase/supabase-js';
import { sendCrewBriefing } from '@/lib/send-crew-briefing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Day-before / morning-of crew-briefing auto-send.
//
// Runs twice daily (see vercel.json: 01:00 & 15:00 UTC ≈ 6pm & 8am PT). Uses a
// catch-up WINDOW rather than an exact date+hour so a job created after its
// briefing moment has passed still goes out on the next run without a manual
// tap:
//   - morning_of: scheduled_date == today
//   - day_before: scheduled_date in [today, tomorrow]
// Guards: never double-send (crew_briefing_sent_at), skip 'off', skip
// cancelled/completed (only scheduled|confirmed are selected), require crew.
export async function GET(request) {
  // Same CRON_SECRET check the gcal cron uses.
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !process.env.VERCEL_URL?.includes('localhost')) {
    if (process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  const now = new Date();
  const todayDate = now.toISOString().split('T')[0];
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];

  const results = { considered: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, detailer_id, scheduled_date, crew_briefing_send, crew_briefing_sent_at, status')
    .is('crew_briefing_sent_at', null)
    .in('status', ['scheduled', 'confirmed'])
    .in('crew_briefing_send', ['day_before', 'morning_of'])
    .gte('scheduled_date', todayDate)
    .lte('scheduled_date', tomorrowDate);

  if (error) {
    console.error('[cron/send-crew-briefings] query failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  for (const job of jobs || []) {
    results.considered++;

    const inWindow = job.crew_briefing_send === 'morning_of'
      ? job.scheduled_date === todayDate
      : (job.scheduled_date === todayDate || job.scheduled_date === tomorrowDate);
    if (!inWindow) { results.skipped++; continue; }

    // Require at least one active crew assignment (sendCrewBriefing also checks,
    // but skip quietly here to avoid failure noise).
    const { data: asg } = await supabase
      .from('job_assignments')
      .select('team_member_id')
      .eq('job_id', job.id)
      .in('status', ['pending', 'accepted'])
      .limit(1);
    if (!asg || asg.length === 0) { results.skipped++; continue; }

    try {
      const r = await sendCrewBriefing(supabase, { detailerId: job.detailer_id, jobId: job.id });
      if (r.ok && !r.already_sent) {
        results.sent++;
      } else if (r.already_sent) {
        results.skipped++;
      } else {
        results.failed++;
        results.errors.push(`${job.id}: ${r.error}`);
      }
    } catch (e) {
      console.error('[cron/send-crew-briefings] send failed for', job.id, e?.message || e);
      results.failed++;
      results.errors.push(`${job.id}: ${e.message}`);
    }
  }

  return Response.json({ message: 'Crew briefings processed', ...results });
}
