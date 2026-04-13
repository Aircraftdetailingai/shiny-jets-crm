import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { lead_id, reason, note, send_email } = await request.json();
  if (!lead_id) return Response.json({ error: 'lead_id required' }, { status: 400 });

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

  // Verify lead belongs to this detailer
  const { data: lead } = await supabase
    .from('intake_leads')
    .select('id, detailer_id, name, email, aircraft_model, tail_number')
    .eq('id', lead_id)
    .eq('detailer_id', detailerId)
    .single();

  if (!lead) return Response.json({ error: 'Request not found' }, { status: 404 });

  // Update status to declined
  await supabase.from('intake_leads').update({ status: 'declined' }).eq('id', lead_id);

  // Get detailer info for email signature
  const { data: detailer } = await supabase
    .from('detailers')
    .select('name, company, email, phone')
    .eq('id', detailerId)
    .single();

  // Send professional decline email — NO internal reason exposed to customer
  if (send_email !== false && lead.email && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const firstName = (lead.name || '').split(' ')[0] || 'there';
    const companyName = detailer?.company || detailer?.name || 'our team';
    const sigName = detailer?.name || 'The Team';
    const sigPhone = detailer?.phone || '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="background:#fff;padding:32px 28px;border-radius:12px;border:1px solid #e5e7eb;">
    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 16px;">Thank you for reaching out to ${companyName} regarding your aircraft detailing needs.</p>
    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 16px;">After reviewing your request, we are unfortunately unable to accommodate your service at this time.</p>
    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 24px;">We wish you the best in finding the right detailing solution for your aircraft, and hope to have the opportunity to serve you in the future.</p>
    <p style="font-size:15px;color:#333;line-height:1.5;margin:0;">Best regards,<br><strong>${sigName}</strong><br>${companyName}${sigPhone ? '<br>' + sigPhone : ''}</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">Shiny Jets CRM</p>
</div></body></html>`;

    const text = `Hi ${firstName},\n\nThank you for reaching out to ${companyName} regarding your aircraft detailing needs.\n\nAfter reviewing your request, we are unfortunately unable to accommodate your service at this time.\n\nWe wish you the best in finding the right detailing solution for your aircraft, and hope to have the opportunity to serve you in the future.\n\nBest regards,\n${sigName}\n${companyName}${sigPhone ? '\n' + sigPhone : ''}`;

    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || `${companyName} <noreply@mail.shinyjets.com>`;
      await resend.emails.send({
        from: fromEmail,
        to: lead.email,
        subject: 'Re: Your Aircraft Detailing Request',
        html,
        text,
        reply_to: detailer?.email || undefined,
      });
      console.log('[decline] Email sent to:', lead.email);
    } catch (err) {
      console.error('[decline] Email error:', err.message);
    }
  }

  // Log internally (non-blocking)
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: detailerId,
      team_member_id: user.id,
      team_member_name: user.name || detailer?.name || 'Owner',
      action_type: 'request_declined',
      action_details: {
        lead_id, customer_name: lead.name, customer_email: lead.email,
        reason: reason || null, note: note || null,
        email_sent: send_email !== false && !!lead.email,
      },
    });
  } catch {}

  return Response.json({ success: true });
}
