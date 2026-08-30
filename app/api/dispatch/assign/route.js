import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { sendCrewBriefing } from '@/lib/send-crew-briefing';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

const ALLOWED_PLANS = ['business', 'enterprise'];
const CREW_URL = 'https://crm.shinyjets.com/crew';

async function requireOwnerWithPlan(request) {
  const user = await getAuthUser(request);
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  const supabase = getSupabase();
  const { data: detailer, error } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  if (error || !detailer) {
    return { error: Response.json({ error: 'Detailer not found' }, { status: 404 }) };
  }

  const plan = detailer.plan || 'free';
  if (!ALLOWED_PLANS.includes(plan)) {
    return {
      error: Response.json(
        { error: 'plan_required', upgrade_required: true },
        { status: 403 },
      ),
    };
  }

  return { user, supabase, plan };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAssignmentEmail(job) {
  const aircraft = [job.aircraft_make, job.aircraft_model].filter(Boolean).join(' ') || 'Aircraft';
  const tail = job.tail_number || '—';
  const airport = job.airport || '—';
  const date = job.scheduled_date || 'TBD';
  const time = job.scheduled_time ? ` at ${job.scheduled_time}` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a2236;max-width:600px;margin:0 auto;padding:20px;background:#f7f7f5;">
  <div style="background:#0a1520;padding:28px 30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#C9A84C;font-size:22px;font-weight:700;letter-spacing:-0.3px;">New Job Assigned</span>
  </div>
  <div style="background:#fff;padding:28px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:15px;margin:0 0 16px;">You have been assigned to a new job.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#718096;font-size:13px;width:40%;">Aircraft</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${escapeHtml(aircraft)}</td></tr>
      <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Tail Number</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${escapeHtml(tail)}</td></tr>
      <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Airport</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${escapeHtml(airport)}</td></tr>
      <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Scheduled</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${escapeHtml(date)}${escapeHtml(time)}</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${CREW_URL}" style="display:inline-block;background:#C9A84C;color:#0a1520;text-decoration:none;padding:14px 36px;border-radius:6px;font-weight:700;font-size:15px;">View Assignment &rarr;</a>
    </div>
  </div>
</body></html>`;

  const text = `New job assigned.\n\nAircraft: ${aircraft}\nTail: ${tail}\nAirport: ${airport}\nScheduled: ${date}${time}\n\nView: ${CREW_URL}`;

  return { html, text };
}

// POST — assign one or more team members to a job
export async function POST(request) {
  const gate = await requireOwnerWithPlan(request);
  if (gate.error) return gate.error;
  const { user, supabase } = gate;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { job_id, team_member_ids } = body || {};
  if (!job_id || !Array.isArray(team_member_ids) || team_member_ids.length === 0) {
    return Response.json({ error: 'job_id and team_member_ids[] are required' }, { status: 400 });
  }

  // Verify the job belongs to this detailer
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', job_id)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (jobErr || !job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Verify ALL team members belong to this detailer
  const { data: members, error: mErr } = await supabase
    .from('team_members')
    .select('id, name, email')
    .eq('detailer_id', user.detailer_id || user.id)
    .in('id', team_member_ids);

  if (mErr) {
    console.error('[dispatch/assign] team member lookup error:', mErr);
    return Response.json({ error: mErr.message }, { status: 500 });
  }

  const validIds = new Set((members || []).map((m) => m.id));
  let assignedCount = 0;

  const { html, text } = buildAssignmentEmail(job);

  for (const member of members || []) {
    if (!validIds.has(member.id)) continue;

    const { error: upsertErr } = await supabase
      .from('job_assignments')
      .upsert(
        {
          job_id,
          team_member_id: member.id,
          detailer_id: user.detailer_id || user.id,
          status: 'pending',
          notified_at: new Date().toISOString(),
        },
        { onConflict: 'job_id,team_member_id' },
      );

    if (upsertErr) {
      console.error('[dispatch/assign] upsert error:', upsertErr);
      continue;
    }

    assignedCount += 1;

    // Send email
    if (member.email) {
      try {
        await sendEmail({
          to: member.email,
          subject: 'New job assigned',
          html,
          text,
        });
      } catch (emailErr) {
        console.error('[dispatch/assign] email error:', emailErr);
      }
    }

    // Activity log
    try {
      await supabase.from('crew_activity_log').insert({
        detailer_id: user.detailer_id || user.id,
        team_member_id: member.id,
        team_member_name: member.name || null,
        job_id,
        action_type: 'job_assigned',
        action_details: {
          job_id,
          team_member_id: member.id,
          dispatched_by: user.id,
        },
      });
    } catch (logErr) {
      console.error('[dispatch/assign] activity log error:', logErr);
    }
  }

  // On-dispatch catch-up: if crew-briefing auto-send is on and the briefing
  // window has already been reached (a job/assignment created after its
  // scheduled send moment), send the briefing now so it still goes out without
  // a manual tap. Idempotency (crew_briefing_sent_at) keeps this from
  // double-sending with the cron.
  let briefingChannels = null;
  if (
    assignedCount > 0 &&
    !job.crew_briefing_sent_at &&
    job.crew_briefing_send &&
    job.crew_briefing_send !== 'off' &&
    job.scheduled_date
  ) {
    const todayDate = new Date().toISOString().split('T')[0];
    // Send window = the intended day: day-before opens the day before the job;
    // morning-of opens on the job day itself.
    let windowDate = job.scheduled_date;
    if (job.crew_briefing_send === 'day_before') {
      const d = new Date(job.scheduled_date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      windowDate = d.toISOString().split('T')[0];
    }
    if (todayDate >= windowDate) {
      try {
        const r = await sendCrewBriefing(supabase, { detailerId: user.detailer_id || user.id, jobId: job_id });
        if (r.ok && !r.already_sent) briefingChannels = r.channels;
      } catch (e) {
        console.error('[dispatch/assign] catch-up briefing failed:', e?.message || e);
      }
    }
  }

  return Response.json({ success: true, assigned_count: assignedCount, briefing_sent: briefingChannels });
}

// DELETE — unassign a crew member from a job
export async function DELETE(request) {
  const gate = await requireOwnerWithPlan(request);
  if (gate.error) return gate.error;
  const { user, supabase } = gate;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { job_id, team_member_id } = body || {};
  if (!job_id || !team_member_id) {
    return Response.json({ error: 'job_id and team_member_id are required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('job_assignments')
    .delete()
    .eq('job_id', job_id)
    .eq('team_member_id', team_member_id)
    .eq('detailer_id', user.detailer_id || user.id);

  if (error) {
    console.error('[dispatch/assign] delete error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
