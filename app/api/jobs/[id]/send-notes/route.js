import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

/**
 * Build and send crew notes email for a job.
 * Exported so the cron job can reuse it.
 */
export async function sendCrewNotes(supabase, jobId) {
  // Fetch job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) return { success: false, error: 'Job not found' };

  // Fetch standing aircraft notes
  const { data: aircraftNotes } = await supabase
    .from('aircraft_notes')
    .select('note')
    .eq('detailer_id', job.detailer_id)
    .eq('tail_number', (job.tail_number || '').toUpperCase())
    .order('created_at', { ascending: true });

  // Fetch assigned crew with emails
  const { data: assignmentRows } = await supabase
    .from('job_assignments')
    .select('team_member_id')
    .eq('job_id', jobId);

  if (!assignmentRows || assignmentRows.length === 0) {
    return { success: false, error: 'No crew assigned' };
  }

  const memberIds = assignmentRows.map(a => a.team_member_id);
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, email')
    .in('id', memberIds);

  const recipients = (members || []).filter(m => m.email);
  if (recipients.length === 0) {
    return { success: false, error: 'No crew members with email addresses' };
  }

  // Parse services
  let services = [];
  try {
    services = typeof job.services === 'string' ? JSON.parse(job.services) : (job.services || []);
  } catch { services = []; }

  const servicesList = services.map(s => s.name || s.service_name || 'Service').join(', ');

  const dateStr = job.scheduled_date
    ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'TBD';

  const timeStr = job.scheduled_time || '';
  const aircraft = [job.aircraft_make, job.aircraft_model].filter(Boolean).join(' ') || 'Aircraft';
  const tail = job.tail_number || '';
  const airport = job.airport || '';

  // Build standing notes HTML
  const standingNotesHtml = (aircraftNotes || []).length > 0
    ? `<div style="margin:16px 0;padding:12px 16px;border-left:4px solid #C9A84C;background:#1a1a1a;border-radius:4px;">
        <p style="color:#C9A84C;font-weight:600;margin:0 0 8px;font-size:14px;">Standing Notes for ${tail}</p>
        <ul style="margin:0;padding-left:18px;color:#ccc;font-size:14px;">
          ${aircraftNotes.map(n => `<li style="margin-bottom:4px;">${n.note}</li>`).join('')}
        </ul>
      </div>`
    : '';

  // Build job notes HTML
  const jobNotesHtml = job.crew_notes
    ? `<div style="margin:16px 0;padding:12px 16px;background:#1a1a1a;border:1px solid #333;border-radius:4px;">
        <p style="color:#999;font-weight:600;margin:0 0 8px;font-size:14px;">Job Notes</p>
        <p style="color:#ccc;margin:0;font-size:14px;white-space:pre-wrap;">${job.crew_notes}</p>
      </div>`
    : '';

  const subject = `Job prep: ${aircraft} ${tail} on ${dateStr}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#111;color:#eee;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#1c1c1c;border-radius:12px;overflow:hidden;border:1px solid #333;">
    <div style="background:#C9A84C;padding:20px 24px;">
      <h1 style="margin:0;color:#111;font-size:18px;font-weight:700;">Job Prep Sheet</h1>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="color:#999;padding:6px 12px 6px 0;font-size:13px;white-space:nowrap;">Date</td><td style="color:#eee;padding:6px 0;font-size:14px;">${dateStr}${timeStr ? ' at ' + timeStr : ''}</td></tr>
        <tr><td style="color:#999;padding:6px 12px 6px 0;font-size:13px;white-space:nowrap;">Aircraft</td><td style="color:#eee;padding:6px 0;font-size:14px;">${aircraft}</td></tr>
        <tr><td style="color:#999;padding:6px 12px 6px 0;font-size:13px;white-space:nowrap;">Tail</td><td style="color:#eee;padding:6px 0;font-size:14px;">${tail}</td></tr>
        ${airport ? `<tr><td style="color:#999;padding:6px 12px 6px 0;font-size:13px;white-space:nowrap;">Airport</td><td style="color:#eee;padding:6px 0;font-size:14px;">${airport}</td></tr>` : ''}
        ${servicesList ? `<tr><td style="color:#999;padding:6px 12px 6px 0;font-size:13px;white-space:nowrap;">Services</td><td style="color:#eee;padding:6px 0;font-size:14px;">${servicesList}</td></tr>` : ''}
      </table>
      ${standingNotesHtml}
      ${jobNotesHtml}
      ${!standingNotesHtml && !jobNotesHtml ? '<p style="color:#666;font-size:13px;">No additional notes for this job.</p>' : ''}
    </div>
    <div style="padding:12px 24px;background:#151515;border-top:1px solid #333;">
      <p style="margin:0;color:#666;font-size:11px;">Sent by Vector Aviation</p>
    </div>
  </div>
</body></html>`;

  const text = `Job Prep: ${aircraft} ${tail} on ${dateStr}${timeStr ? ' at ' + timeStr : ''}
Airport: ${airport}
Services: ${servicesList}
${(aircraftNotes || []).length > 0 ? '\nStanding Notes:\n' + aircraftNotes.map(n => '- ' + n.note).join('\n') : ''}
${job.crew_notes ? '\nJob Notes:\n' + job.crew_notes : ''}`;

  // Send to each crew member
  let sentCount = 0;
  for (const member of recipients) {
    const result = await sendEmail({
      to: member.email,
      subject,
      html,
      text,
      from: 'Vector Aviation <noreply@vectorav.ai>',
      replyTo: 'brett@vectorav.ai',
    });
    if (result.success) sentCount++;
  }

  // Update notes_sent_at
  await supabase
    .from('jobs')
    .update({ notes_sent_at: new Date().toISOString() })
    .eq('id', jobId);

  return { success: true, sent_to: sentCount };
}

// POST — send crew notes now
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const { id: jobId } = await params;
  if (!jobId) return Response.json({ error: 'Job ID required' }, { status: 400 });

  const supabase = getSupabase();

  // Verify ownership
  const detailerId = user.detailer_id || user.id;
  const { data: job } = await supabase
    .from('jobs')
    .select('id, detailer_id')
    .eq('id', jobId)
    .single();

  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
  if (job.detailer_id !== detailerId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const result = await sendCrewNotes(supabase, jobId);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ success: true, sent_to: result.sent_to });
}
