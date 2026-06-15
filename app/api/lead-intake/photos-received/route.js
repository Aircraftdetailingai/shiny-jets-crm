import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { logNotification } from '@/lib/notification-log';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const body = await request.json();
  // Accept either a real UUID or the photo_request_token.
  const ref = body.token || body.lead_id;
  if (!ref) return Response.json({ error: 'Lead ID or token required' }, { status: 400 });

  const supabase = getSupabase();

  // Resolve to the canonical lead row.
  const { data: lead } = UUID_RE.test(String(ref))
    ? await supabase.from('intake_leads').select('id, detailer_id, name, aircraft_model').eq('id', ref).single()
    : await supabase.from('intake_leads').select('id, detailer_id, name, aircraft_model').eq('photo_request_token', ref).single();
  if (!lead) return Response.json({ success: true });

  const lead_id = lead.id;

  // Update lead status back to new (green badge — photos received, ready to quote)
  await supabase.from('intake_leads').update({ status: 'new' }).eq('id', lead_id);

  const { data: detailer } = await supabase.from('detailers').select('email').eq('id', lead.detailer_id).single();

  if (detailer?.email && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
    const subj = `Photos received from ${lead.name || 'customer'}`;
    try {
      const r = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
        to: detailer.email,
        subject: subj,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #007CB1;">Photos Received</h2>
            <p><strong>${lead.name || 'A customer'}</strong> uploaded photos for their ${lead.aircraft_model || 'aircraft'} quote request.</p>
            <a href="${appUrl}/requests/${lead_id}" style="display: inline-block; padding: 12px 24px; background: #007CB1; color: white; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              View Photos & Create Quote
            </a>
          </div>
        `,
      });
      await logNotification({
        detailer_id: lead.detailer_id,
        notification_type: 'photos_received_detailer_notify',
        recipient: detailer.email,
        channel: 'email',
        status: r?.error ? 'failed' : 'sent',
        resend_id: r?.data?.id || r?.id || null,
        error_message: r?.error?.message || null,
        message_preview: subj,
        lead_id,
      });
    } catch (e) {
      await logNotification({
        detailer_id: lead.detailer_id,
        notification_type: 'photos_received_detailer_notify',
        recipient: detailer.email,
        channel: 'email',
        status: 'failed',
        error_message: e?.message || String(e),
        message_preview: subj,
        lead_id,
      });
    }
  }

  return Response.json({ success: true });
}
