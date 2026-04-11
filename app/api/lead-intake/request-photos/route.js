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

  const { lead_id } = await request.json();
  if (!lead_id) return Response.json({ error: 'Lead ID required' }, { status: 400 });

  const supabase = getSupabase();

  const { data: lead } = await supabase.from('intake_leads').select('*').eq('id', lead_id).eq('detailer_id', user.id).single();
  if (!lead) return Response.json({ error: 'Lead not found' }, { status: 404 });

  const { data: detailer } = await supabase.from('detailers').select('company, name').eq('id', user.id).single();
  const companyName = detailer?.company || detailer?.name || 'Your detailer';
  const firstName = (lead.name || '').split(' ')[0] || 'there';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';

  // Update lead status
  await supabase.from('intake_leads').update({ status: 'awaiting_photos' }).eq('id', lead_id);

  // Send email to customer
  if (lead.email && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const aircraftName = lead.aircraft_model || 'aircraft';
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
      replyTo: `brett@shinyjets.com`,
      to: lead.email,
      subject: `Photos needed for your ${aircraftName} quote`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007CB1;">Photos Needed for Your Quote</h2>
          <p>Hi ${firstName},</p>
          <p><strong>${companyName}</strong> needs a few photos of your ${aircraftName} to complete your quote. Simply reply to this email with your photos attached and we'll get started right away.</p>
          <p style="color: #666; font-size: 14px; margin: 20px 0;">Or upload directly:</p>
          <a href="${appUrl}/upload-photos/${lead_id}" style="display: inline-block; padding: 14px 28px; background: #007CB1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Upload Photos
          </a>
          <p style="color: #999; font-size: 11px; margin-top: 20px;">Photos are used for documentation and quote accuracy only. Never shared publicly.</p>
        </div>
      `,
    });
  }

  return Response.json({ success: true });
}
