import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const { lead_id } = await request.json();
  if (!lead_id) return Response.json({ error: 'Lead ID required' }, { status: 400 });

  const supabase = getSupabase();

  // Update lead status back to viewed (photos received)
  await supabase.from('intake_leads').update({ status: 'viewed' }).eq('id', lead_id);

  // Notify detailer
  const { data: lead } = await supabase.from('intake_leads').select('detailer_id, name, aircraft_model').eq('id', lead_id).single();
  if (!lead) return Response.json({ success: true });

  const { data: detailer } = await supabase.from('detailers').select('email').eq('id', lead.detailer_id).single();

  if (detailer?.email && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@vectorav.ai>',
      to: detailer.email,
      subject: `Photos received from ${lead.name || 'customer'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007CB1;">Photos Received</h2>
          <p><strong>${lead.name || 'A customer'}</strong> uploaded photos for their ${lead.aircraft_model || 'aircraft'} quote request.</p>
          <a href="${appUrl}/requests/${lead_id}" style="display: inline-block; padding: 12px 24px; background: #007CB1; color: white; text-decoration: none; border-radius: 8px; margin-top: 15px;">
            View Photos & Create Quote
          </a>
        </div>
      `,
    }).catch(() => {});
  }

  return Response.json({ success: true });
}
