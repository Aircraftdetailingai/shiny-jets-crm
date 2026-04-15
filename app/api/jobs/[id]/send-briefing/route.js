import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const detailerId = user.detailer_id || user.id;
  const jobId = params.id;

  const supabase = getSupabase();

  // Get job details — try jobs table first, then quotes
  let job = null;
  const { data: manualJob } = await supabase.from('jobs').select('*').eq('id', jobId).eq('detailer_id', detailerId).maybeSingle();
  if (manualJob) {
    job = { ...manualJob, aircraft: [manualJob.aircraft_make, manualJob.aircraft_model].filter(Boolean).join(' '), client_name: manualJob.customer_name };
  } else {
    const { data: quote } = await supabase.from('quotes').select('*').eq('id', jobId).eq('detailer_id', detailerId).maybeSingle();
    if (quote) job = { ...quote, aircraft: quote.aircraft_model || quote.aircraft_type, client_name: quote.client_name };
  }
  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Parse services
  let services = [];
  try {
    if (job.services) {
      const parsed = typeof job.services === 'string' ? JSON.parse(job.services) : job.services;
      services = Array.isArray(parsed) ? parsed.map(s => typeof s === 'string' ? s : (s.name || s.description || '')).filter(Boolean) : [];
    } else if (job.line_items) {
      services = (job.line_items || []).map(li => li.description || li.service).filter(Boolean);
    }
  } catch {}

  // Get standing notes for this tail
  let standingNotes = [];
  if (job.tail_number) {
    const { data } = await supabase.from('aircraft_notes').select('note').eq('detailer_id', detailerId).eq('tail_number', job.tail_number.toUpperCase());
    standingNotes = (data || []).map(n => n.note);
  }

  // Get assigned crew with emails
  const { data: assignments } = await supabase.from('job_assignments').select('team_member_id').eq('job_id', jobId).in('status', ['pending', 'accepted']);
  const memberIds = (assignments || []).map(a => a.team_member_id).filter(Boolean);
  if (memberIds.length === 0) return Response.json({ error: 'No crew assigned to this job' }, { status: 400 });

  const { data: members } = await supabase.from('team_members').select('id, name, email').in('id', memberIds);
  const crewWithEmail = (members || []).filter(m => m.email);
  if (crewWithEmail.length === 0) return Response.json({ error: 'No crew members have email addresses' }, { status: 400 });

  // Build email
  const dateStr = job.scheduled_date ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
  const aircraft = (job.aircraft || 'Aircraft') + (job.tail_number ? ` · ${job.tail_number}` : '');
  const servicesStr = services.length > 0 ? services.join(', ') : 'See job details';
  const standingHtml = standingNotes.length > 0 ? standingNotes.map(n => `<li style="margin-bottom:6px;">${n}</li>`).join('') : '<li style="color:#999;">No standing notes</li>';
  const crewNotesText = job.crew_notes || 'No additional notes';

  const subject = `Job Briefing — ${aircraft} · ${dateStr}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0ee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="background:#0D1B2A;padding:28px 24px;border-radius:12px 12px 0 0;color:#fff;">
    <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.6);">Job Briefing</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">${aircraft}</h1>
  </div>
  <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#666;font-size:13px;width:80px;">Date</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${dateStr}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">Airport</td><td style="padding:6px 0;font-size:14px;">${job.airport || 'TBD'}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">Services</td><td style="padding:6px 0;font-size:14px;">${servicesStr}</td></tr>
    </table>
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:16px;">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin:0 0 8px;">Aircraft Notes (Standing)</p>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#333;line-height:1.7;">${standingHtml}</ul>
    </div>
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:16px;">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin:0 0 8px;">Job Notes</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0;">${crewNotesText}</p>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://crm.shinyjets.com/crew" style="display:inline-block;background:#007CB1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Job</a>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:12px;">Shiny Jets CRM</p>
</div></body></html>`;

  // Send to each crew member
  if (!process.env.RESEND_API_KEY) return Response.json({ error: 'Email not configured' }, { status: 500 });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
  const sent = [];

  for (const m of crewWithEmail) {
    try {
      await resend.emails.send({ from: fromEmail, to: m.email, subject, html });
      sent.push(m.email);
    } catch (e) {
      console.error('[send-briefing] Failed for', m.email, e.message);
    }
  }

  // Mark as sent
  let updateData = { reminder_sent_at: new Date().toISOString() };
  if (manualJob) await supabase.from('jobs').update(updateData).eq('id', jobId).catch(() => {});
  else await supabase.from('quotes').update(updateData).eq('id', jobId).catch(() => {});

  return Response.json({ success: true, sent: sent.length, emails: sent });
}
