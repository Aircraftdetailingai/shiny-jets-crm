import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const VALID_STATUSES = ['scheduled', 'accepted', 'paid', 'in_progress'];

async function fetchJobsByPreference(supabase, table, date, preference) {
  const { data } = await supabase.from(table)
    .select('*')
    .eq('scheduled_date', date)
    .eq('delivery_preference', preference)
    .is('reminder_sent_at', null)
    .in('status', VALID_STATUSES);
  return (data || []).map(j => ({ ...j, _source: table }));
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();
  const utcHour = now.getUTCHours();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];
  const todayDate = now.toISOString().split('T')[0];

  const jobsToNotify = [];

  // day_before: only fire at UTC 18 (11am Pacific / 2pm Eastern)
  if (utcHour === 18) {
    const dbJobs = await fetchJobsByPreference(supabase, 'jobs', tomorrowDate, 'day_before');
    const dbQuotes = await fetchJobsByPreference(supabase, 'quotes', tomorrowDate, 'day_before');
    jobsToNotify.push(...dbJobs, ...dbQuotes);
  }

  // morning_of: only fire at UTC 13 (6am Pacific / 9am Eastern)
  if (utcHour === 13) {
    const moJobs = await fetchJobsByPreference(supabase, 'jobs', todayDate, 'morning_of');
    const moQuotes = await fetchJobsByPreference(supabase, 'quotes', todayDate, 'morning_of');
    jobsToNotify.push(...moJobs, ...moQuotes);
  }

  // 1_hour_before: scheduled_date = today AND scheduled_start_time within 55-65 min from now
  {
    const tables = ['jobs', 'quotes'];
    for (const table of tables) {
      const { data } = await supabase.from(table)
        .select('*')
        .eq('scheduled_date', todayDate)
        .eq('delivery_preference', '1_hour_before')
        .is('reminder_sent_at', null)
        .in('status', VALID_STATUSES)
        .not('scheduled_start_time', 'is', null);

      for (const job of data || []) {
        const startTime = job.scheduled_start_time; // e.g. "09:00" or "14:30"
        if (!startTime) continue;
        const [h, m] = startTime.split(':').map(Number);
        const jobStart = new Date(now);
        jobStart.setUTCHours(h, m, 0, 0);
        const diffMin = (jobStart - now) / 60000;
        if (diffMin >= 55 && diffMin <= 65) {
          jobsToNotify.push({ ...job, _source: table });
        }
      }
    }
  }

  if (jobsToNotify.length === 0) {
    return Response.json({ sent: 0, message: `No briefings needed (UTC hour: ${utcHour})` });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'Email not configured' }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let totalSent = 0;
  let totalJobs = 0;

  for (const job of jobsToNotify) {
    const detailerId = job.detailer_id;
    if (!detailerId) continue;

    const { data: assignments } = await supabase.from('job_assignments')
      .select('team_member_id')
      .eq('job_id', job.id)
      .in('status', ['pending', 'accepted']);

    const memberIds = (assignments || []).map(a => a.team_member_id).filter(Boolean);
    if (memberIds.length === 0) continue;

    const { data: members } = await supabase.from('team_members').select('id, name, email').in('id', memberIds);
    const crewWithEmail = (members || []).filter(m => m.email);
    if (crewWithEmail.length === 0) continue;

    const aircraft = job._source === 'jobs'
      ? [job.aircraft_make, job.aircraft_model].filter(Boolean).join(' ')
      : (job.aircraft_model || job.aircraft_type || 'Aircraft');
    const tailDisplay = aircraft + (job.tail_number ? ` · ${job.tail_number}` : '');

    let services = [];
    try {
      if (job.services) {
        const parsed = typeof job.services === 'string' ? JSON.parse(job.services) : job.services;
        services = Array.isArray(parsed) ? parsed.map(s => typeof s === 'string' ? s : (s.name || s.description || '')).filter(Boolean) : [];
      } else if (job.line_items) {
        services = (job.line_items || []).map(li => li.description || li.service).filter(Boolean);
      }
    } catch {}

    let standingNotes = [];
    if (job.tail_number) {
      const { data } = await supabase.from('aircraft_notes').select('note').eq('detailer_id', detailerId).eq('tail_number', job.tail_number.toUpperCase());
      standingNotes = (data || []).map(n => n.note);
    }

    const dateStr = job.scheduled_date ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
    const servicesStr = services.length > 0 ? services.join(', ') : 'See job details';
    const standingHtml = standingNotes.length > 0 ? standingNotes.map(n => `<li style="margin-bottom:6px;">${n}</li>`).join('') : '<li style="color:#999;">No standing notes</li>';
    const crewNotesText = job.crew_notes || 'No additional notes';

    const subject = `Job Briefing — ${tailDisplay} · ${dateStr}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0ee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="background:#0D1B2A;padding:28px 24px;border-radius:12px 12px 0 0;color:#fff;">
    <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.6);">Job Briefing</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">${tailDisplay}</h1>
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

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
    let sentCount = 0;

    for (const m of crewWithEmail) {
      try {
        await resend.emails.send({ from: fromEmail, to: m.email, subject, html });
        sentCount++;
      } catch (e) {
        console.error('[cron/job-reminders] Failed for', m.email, e.message);
      }
    }

    if (sentCount > 0) {
      totalSent += sentCount;
      totalJobs++;
      const table = job._source === 'jobs' ? 'jobs' : 'quotes';
      await supabase.from(table).update({ reminder_sent_at: new Date().toISOString() }).eq('id', job.id).catch(() => {});
    }
  }

  return Response.json({ sent: totalSent, jobs: totalJobs, total: jobsToNotify.length });
}

// Vercel Cron sends GET requests; expose the same handler for GET.
export const GET = POST;
