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

  const { lead_id, reason } = await request.json();
  if (!lead_id) return Response.json({ error: 'Lead ID required' }, { status: 400 });

  const supabase = getSupabase();

  const { data: lead } = await supabase.from('intake_leads').select('*').eq('id', lead_id).eq('detailer_id', user.id).single();
  if (!lead) return Response.json({ error: 'Lead not found' }, { status: 404 });

  const { data: detailer } = await supabase.from('detailers').select('company, name').eq('id', user.id).single();
  const companyName = detailer?.company || detailer?.name || 'The detailing team';
  const firstName = (lead.name || '').split(' ')[0] || 'there';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';

  // Update lead status
  await supabase.from('intake_leads').update({ status: 'closed' }).eq('id', lead_id);

  // Send polite decline email
  if (lead.email && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
      to: lead.email,
      subject: `Regarding your quote request — ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0D1B2A;">Regarding Your Quote Request</h2>
          <p>Hi ${firstName},</p>
          <p>Thank you for reaching out to <strong>${companyName}</strong>. Unfortunately, we are unable to service your aircraft at this time.</p>
          ${reason ? `<p style="color: #666;">${reason}</p>` : ''}
          <p>We recommend checking our directory to find another certified detailer near you:</p>
          <a href="${appUrl}/find-a-detailer" style="display: inline-block; padding: 12px 24px; background: #007CB1; color: white; text-decoration: none; border-radius: 8px; margin: 15px 0;">
            Find a Detailer
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">Best regards,<br/>${companyName}</p>
        </div>
      `,
    });
  }

  return Response.json({ success: true });
}
