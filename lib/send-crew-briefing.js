import { Resend } from 'resend';
import { logNotification } from '@/lib/notification-log';
import { createNotification } from '@/lib/notifications';
import { resolveAircraftIdByTail } from '@/lib/resolve-aircraft';
import { loadSopContext } from '@/lib/resolve-sop';
import { signSopUrl, BRIEFING_EXPIRY_SECONDS } from '@/lib/sop-signed-url';

// Escape user-supplied service names before inlining into the email HTML.
// jobs.services often holds raw strings entered by the owner, so naive
// concatenation is an HTML injection trap.
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Update a job/quote row while dropping columns the current schema lacks
// (crew_briefing_sent_at may not be deployed everywhere yet). Falls back to
// reminder_sent_at so the "already sent" guard keeps working on older schemas.
async function stampSent(supabase, table, id, field) {
  const value = new Date().toISOString();
  const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id);
  if (!error) return field;
  const missing = /column "([^"]+)".*does not exist/i.test(error.message) || /Could not find the '([^']+)' column/i.test(error.message);
  if (missing && field !== 'reminder_sent_at') {
    const { error: fbErr } = await supabase.from(table).update({ reminder_sent_at: value }).eq('id', id);
    if (fbErr) console.error('[crew-briefing] stamp fallback failed:', fbErr.message);
    return 'reminder_sent_at';
  }
  if (error) console.error('[crew-briefing] stamp failed:', error.message);
  return null;
}

/**
 * Send the crew job-briefing email (+ in-app notification) for a job/quote.
 *
 * Shared by the manual "Send Briefing Now" route, the day-before/morning-of
 * cron, and the on-dispatch catch-up. Does NOT do auth — callers are
 * responsible (route checks the user; cron/dispatch run trusted).
 *
 * SMS is intentionally omitted: it's globally disabled pending 10DLC, so the
 * briefing goes out over email + an in-app notification.
 *
 * @returns {Promise<{ok:boolean,status:number,sent?:number,emails?:string[],channels?:string[],already_sent?:boolean,sent_at?:string,error?:string,source?:string}>}
 */
export async function sendCrewBriefing(supabase, { detailerId, jobId, forceResend = false }) {
  // Resolve the record from jobs first, then quotes.
  let job = null;
  let source = 'jobs';
  const { data: manualJob } = await supabase.from('jobs').select('*').eq('id', jobId).eq('detailer_id', detailerId).maybeSingle();
  if (manualJob) {
    job = { ...manualJob, aircraft: [manualJob.aircraft_make, manualJob.aircraft_model].filter(Boolean).join(' '), client_name: manualJob.customer_name };
  } else {
    const { data: quote } = await supabase.from('quotes').select('*').eq('id', jobId).eq('detailer_id', detailerId).maybeSingle();
    if (quote) { job = { ...quote, aircraft: quote.aircraft_model || quote.aircraft_type, client_name: quote.client_name }; source = 'quotes'; }
  }
  if (!job) return { ok: false, status: 404, error: 'Job not found' };

  // Idempotency: jobs dedup on crew_briefing_sent_at, quotes keep the legacy
  // reminder_sent_at key. Prevents rapid-fire and cron/dispatch double-sends.
  const sentField = source === 'jobs' ? 'crew_briefing_sent_at' : 'reminder_sent_at';
  const priorSentAt = job[sentField] ?? job.reminder_sent_at ?? null;
  if (!forceResend && priorSentAt) {
    return { ok: true, status: 200, already_sent: true, sent_at: priorSentAt, sent: 0, emails: [], channels: [], source };
  }

  // Parse services (shape-ambiguous in prod: bare strings, objects, mixed).
  let serviceItems = [];
  try {
    if (job.services) {
      const parsed = typeof job.services === 'string' ? JSON.parse(job.services) : job.services;
      if (Array.isArray(parsed)) {
        serviceItems = parsed.filter(s => s !== null && s !== undefined && (typeof s !== 'string' || s.trim().length > 0));
      }
    } else if (Array.isArray(job.line_items)) {
      serviceItems = job.line_items;
    }
  } catch {}

  // Stage 1 SOP context — L1 service default + L2 aircraft override per item.
  const aircraftId = job.tail_number
    ? await resolveAircraftIdByTail(supabase, { detailer_id: detailerId, tail_number: job.tail_number })
    : null;
  const sopCtx = await loadSopContext(supabase, { detailer_id: detailerId, aircraft_id: aircraftId });

  // Standing notes for this tail.
  let standingNotes = [];
  if (job.tail_number) {
    const { data } = await supabase.from('aircraft_notes').select('note').eq('detailer_id', detailerId).eq('tail_number', job.tail_number.toUpperCase());
    standingNotes = (data || []).map(n => n.note);
  }

  // Assigned crew with emails.
  const { data: assignments } = await supabase.from('job_assignments').select('team_member_id').eq('job_id', jobId).in('status', ['pending', 'accepted']);
  const memberIds = (assignments || []).map(a => a.team_member_id).filter(Boolean);
  if (memberIds.length === 0) return { ok: false, status: 400, error: 'No crew assigned to this job' };

  const { data: members } = await supabase.from('team_members').select('id, name, email').in('id', memberIds);
  const crewWithEmail = (members || []).filter(m => m.email);
  const crewNames = (members || []).map(m => m.name).filter(Boolean);

  // Email is the only channel that actually reaches crew (SMS is disabled and
  // crew have no per-user in-app inbox), so no email means we can't brief them.
  // Return an error rather than stamping a false "sent".
  if (crewWithEmail.length === 0) return { ok: false, status: 400, error: 'No crew members have email addresses' };
  if (!process.env.RESEND_API_KEY) return { ok: false, status: 500, error: 'Email not configured' };

  // Build email body.
  const dateStr = job.scheduled_date ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
  const aircraft = (job.aircraft || 'Aircraft') + (job.tail_number ? ` · ${job.tail_number}` : '');

  let servicesHtml;
  if (serviceItems.length === 0) {
    servicesHtml = '<span style="color:#666;">See job details</span>';
  } else {
    const rows = await Promise.all(serviceItems.map(async (item) => {
      const displayName = typeof item === 'string'
        ? item
        : (item?.name || item?.description || item?.service_name || 'Service');
      const { default: def, override } = sopCtx.resolve(item);

      let defHref = null;
      if (def?.file_path) defHref = await signSopUrl(supabase, def.file_path, { expiresIn: BRIEFING_EXPIRY_SECONDS });
      if (!defHref && def?.url) defHref = def.url;

      let ovHref = null;
      if (override?.file_path) ovHref = await signSopUrl(supabase, override.file_path, { expiresIn: BRIEFING_EXPIRY_SECONDS });
      if (!ovHref && override?.url) ovHref = override.url;

      const defLink = defHref ? ` &middot; <a href="${escapeHtml(defHref)}" style="color:#007CB1;text-decoration:none;font-weight:600;">📖 SOP</a>` : '';
      const ovLink = ovHref ? ` &middot; <a href="${escapeHtml(ovHref)}" style="color:#b45309;text-decoration:none;font-weight:600;">⚠️ Aircraft SOP</a>` : '';
      const ovSummary = override?.summary ? `<div style="font-size:12px;color:#92400e;margin-top:2px;">${escapeHtml(override.summary)}</div>` : '';
      return `<li style="margin-bottom:6px;">${escapeHtml(displayName)}${defLink}${ovLink}${ovSummary}</li>`;
    }));
    servicesHtml = '<ul style="margin:0;padding-left:18px;font-size:14px;color:#333;line-height:1.7;">' + rows.join('') + '</ul>';
  }

  const standingHtml = standingNotes.length > 0 ? standingNotes.map(n => `<li style="margin-bottom:6px;">${escapeHtml(n)}</li>`).join('') : '<li style="color:#999;">No standing notes</li>';
  const crewNotesText = escapeHtml(job.crew_notes || 'No additional notes');

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
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">Airport</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(job.airport || 'TBD')}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;vertical-align:top;">Services</td><td style="padding:6px 0;font-size:14px;">${servicesHtml}</td></tr>
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

  // Email channel — the channel that actually reaches crew.
  const sent = [];
  const channels = [];
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
  for (const m of crewWithEmail) {
    try {
      const r = await resend.emails.send({ from: fromEmail, to: m.email, subject, html });
      sent.push(m.email);
      await logNotification({
        detailer_id: detailerId,
        notification_type: 'crew_briefing',
        recipient: m.email,
        channel: 'email',
        status: 'sent',
        resend_id: r?.data?.id || r?.id || null,
        message_preview: subject,
        // Job briefings are keyed to a job, not a quote. Writing the job id
        // into quote_id (as the old route did) is wrong; keep them separate.
        job_id: source === 'jobs' ? jobId : null,
        quote_id: source === 'quotes' ? jobId : null,
      });
    } catch (e) {
      console.error('[crew-briefing] email failed for', m.email, e.message);
      await logNotification({
        detailer_id: detailerId,
        notification_type: 'crew_briefing',
        recipient: m.email,
        channel: 'email',
        status: 'failed',
        error_message: e.message,
        message_preview: subject,
        job_id: source === 'jobs' ? jobId : null,
        quote_id: source === 'quotes' ? jobId : null,
      });
    }
  }

  // Every email failed → don't stamp, so it can be retried.
  if (sent.length === 0) {
    return { ok: false, status: 502, error: 'Briefing email could not be delivered to any crew member', source };
  }
  channels.push('email');

  // In-app channel. Crew members have no per-user in-app inbox in this app
  // (they see assignments in /crew), so the in-app surface is the owner's
  // notification feed — a confirmation of what went out, naming the crew.
  try {
    const crewLabel = crewNames.length ? crewNames.join(', ') : `${sent.length} crew member${sent.length !== 1 ? 's' : ''}`;
    await createNotification({
      detailerId,
      type: 'crew_briefing',
      title: 'Crew briefing sent',
      message: `Briefing for ${aircraft} (${dateStr}) sent to ${crewLabel}`,
      link: source === 'jobs' ? `/jobs/${jobId}` : '/quotes',
      metadata: { job_id: source === 'jobs' ? jobId : null, quote_id: source === 'quotes' ? jobId : null, crew: crewNames, emailed: sent.length },
    });
    channels.push('in_app');
  } catch (e) {
    console.error('[crew-briefing] in-app notification failed:', e?.message || e);
  }

  const stampedField = await stampSent(supabase, source, jobId, sentField);
  const sentAt = new Date().toISOString();

  return { ok: true, status: 200, sent: sent.length, emails: sent, channels, sent_at: sentAt, stamped_field: stampedField, source };
}
