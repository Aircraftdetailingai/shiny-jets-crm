import { createClient } from '@supabase/supabase-js';
import { sendWeeklyDigestEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function verifySecret(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === process.env.CRON_SECRET;
}

// POST - Send weekly digest emails (called Monday mornings by cron)
export async function POST(request) {
  if (!verifySecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  // Calculate this week's Monday-Sunday range
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Next 14 days for staffing needs
  const in14Days = new Date(now);
  in14Days.setDate(now.getDate() + 14);

  // Fetch detailers who want weekly digest
  const { data: detailers, error: detailersErr } = await supabase
    .from('detailers')
    .select('id, name, email, notify_weekly_digest')
    .neq('status', 'inactive');

  if (detailersErr) {
    console.error('[weekly-digest] detailers fetch error:', detailersErr.message);
    return Response.json({ error: 'Failed to fetch detailers' }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  const JOB_STATUSES = ['paid', 'approved', 'accepted', 'scheduled', 'in_progress', 'completed'];

  for (const detailer of (detailers || [])) {
    // Skip if opted out
    if (detailer.notify_weekly_digest === false) {
      skipped++;
      continue;
    }
    if (!detailer.email) {
      skipped++;
      continue;
    }

    try {
      // 1. Jobs scheduled this week
      const { data: thisWeekJobs } = await supabase
        .from('quotes')
        .select('id, client_name, aircraft_model, aircraft_type, scheduled_date, status, total_price')
        .eq('detailer_id', detailer.id)
        .gte('scheduled_date', monday.toISOString())
        .lte('scheduled_date', sunday.toISOString())
        .in('status', JOB_STATUSES)
        .order('scheduled_date', { ascending: true });

      // 2. Jobs in next 14 days needing staff (empty assigned_team_member_ids)
      const { data: upcomingJobs } = await supabase
        .from('quotes')
        .select('id, client_name, aircraft_model, aircraft_type, scheduled_date, status, assigned_team_member_ids')
        .eq('detailer_id', detailer.id)
        .gte('scheduled_date', now.toISOString())
        .lte('scheduled_date', in14Days.toISOString())
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true });

      const needsStaffJobs = (upcomingJobs || []).filter(j => {
        const assigned = j.assigned_team_member_ids;
        return !assigned || (Array.isArray(assigned) && assigned.length === 0);
      });

      // 3. Unscheduled accepted quotes
      const { data: unscheduledJobs } = await supabase
        .from('quotes')
        .select('id, client_name, aircraft_model, aircraft_type, status, total_price, created_at')
        .eq('detailer_id', detailer.id)
        .in('status', ['paid', 'accepted', 'approved'])
        .is('scheduled_date', null)
        .order('created_at', { ascending: false });

      // Skip if nothing to report
      if (!(thisWeekJobs?.length) && !needsStaffJobs.length && !(unscheduledJobs?.length)) {
        skipped++;
        continue;
      }

      await sendWeeklyDigestEmail({
        detailer,
        thisWeekJobs: thisWeekJobs || [],
        needsStaffJobs,
        unscheduledJobs: unscheduledJobs || [],
      });

      sent++;
    } catch (err) {
      console.error(`[weekly-digest] failed for ${detailer.id}:`, err.message);
    }
  }

  return Response.json({
    sent,
    skipped,
    total: (detailers || []).length,
    timestamp: now.toISOString(),
  });
}
