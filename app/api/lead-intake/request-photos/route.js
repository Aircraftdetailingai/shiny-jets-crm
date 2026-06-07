import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { lead_id } = await request.json();
  if (!lead_id) return Response.json({ error: 'Lead ID required' }, { status: 400 });

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

  const { data: lead } = await supabase
    .from('intake_leads')
    .select('id, name, email, aircraft_model, photo_request_token, photo_request_sent_at')
    .eq('id', lead_id)
    .eq('detailer_id', detailerId)
    .single();
  if (!lead) return Response.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.email) return Response.json({ error: 'Lead has no email on file' }, { status: 400 });

  // 24h rate limit — block re-sends unless ?force=1
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && lead.photo_request_sent_at) {
    const ageMs = Date.now() - new Date(lead.photo_request_sent_at).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const hoursAgo = Math.floor(ageMs / (60 * 60 * 1000));
      return Response.json({
        error: 'rate_limited',
        message: `Photo request already sent ${hoursAgo}h ago. Pass ?force=1 to resend.`,
        sent_at: lead.photo_request_sent_at,
      }, { status: 429 });
    }
  }

  // Re-use existing token if present; otherwise mint a new one.
  const token = lead.photo_request_token || randomBytes(18).toString('base64url');

  const { data: detailer } = await supabase
    .from('detailers')
    .select('company, name')
    .eq('id', user.id)
    .single();
  const companyName = detailer?.company || detailer?.name || 'Your detailer';
  const firstName = (lead.name || '').split(' ')[0] || 'there';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
  const aircraftName = lead.aircraft_model || 'aircraft';
  const uploadUrl = `${appUrl}/upload-photos/${token}`;

  // Stamp token + sent_at + bump status to awaiting_photos.
  await supabase
    .from('intake_leads')
    .update({
      photo_request_token: token,
      photo_request_sent_at: new Date().toISOString(),
      status: 'awaiting_photos',
    })
    .eq('id', lead_id);

  // Send via Resend — fail loudly so retries surface in logs.
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
        replyTo: 'brett@shinyjets.com',
        to: lead.email,
        subject: `Photos needed for your ${aircraftName} detail quote`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
            <h2 style="color: #007CB1; margin: 0 0 16px;">Photos needed for your quote</h2>
            <p>Hi ${firstName},</p>
            <p><strong>${companyName}</strong> needs a few photos of your ${aircraftName} to finalize an accurate quote.</p>
            <p style="margin: 24px 0;">
              <a href="${uploadUrl}" style="display: inline-block; padding: 14px 28px; background: #007CB1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Upload Photos
              </a>
            </p>
            <p style="color: #666; font-size: 13px;">Or just reply to this email with photos attached.</p>
            <p style="color: #999; font-size: 11px; margin-top: 24px;">Photos are used for documentation and quote accuracy only. Never shared publicly.</p>
          </div>
        `,
      });
    } catch (e) {
      console.error('[request-photos] Resend send failed:', e?.message || e);
      return Response.json({ error: 'Email send failed', detail: e?.message }, { status: 500 });
    }
  } else {
    console.warn('[request-photos] RESEND_API_KEY missing — email NOT sent');
  }

  // Audit row in notification_log so the dashboard has proof of send.
  // quote_id stays null — this notification is bound to a lead, not a quote.
  await supabase.from('notification_log').insert({
    detailer_id: detailerId,
    notification_type: 'photo_request',
    channel: 'email',
    recipient: lead.email,
    message_preview: `Photos requested for ${aircraftName} (${firstName})`,
    sent_at: new Date().toISOString(),
  }).then(({ error: nErr }) => {
    if (nErr) console.warn('[request-photos] notification_log insert failed:', nErr.message);
  });

  return Response.json({ success: true, token, upload_url: uploadUrl });
}
