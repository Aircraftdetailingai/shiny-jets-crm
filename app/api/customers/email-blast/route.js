import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { customerIds, subject, message } = await request.json();
    if (!customerIds?.length || !subject || !message) {
      return Response.json({ error: 'customerIds, subject, and message are required' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Fetch detailer info for branded from address
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name')
      .eq('id', user.id)
      .single();

    const companyName = detailer?.company || detailer?.name || 'Shiny Jets CRM';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
    const fromDomain = (fromEmail.match(/<([^>]+)>/) || [null, fromEmail])[1];
    const from = `${companyName} <${fromDomain}>`;

    // Fetch customers that belong to this detailer
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, email, name')
      .eq('detailer_id', user.id)
      .in('id', customerIds);

    if (error || !customers?.length) {
      return Response.json({ error: 'No valid customers found' }, { status: 404 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const customer of customers) {
      if (!customer.email) { failed++; continue; }
      try {
        await resend.emails.send({
          from,
          to: customer.email,
          subject,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <p>Hi ${customer.name || 'there'},</p>
            <div style="white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
            <p style="color:#999;font-size:12px;">Sent by ${companyName} via Shiny Jets CRM</p>
          </div>`,
        });
        sent++;
      } catch (e) {
        failed++;
        errors.push({ email: customer.email, error: e.message });
      }
    }

    return Response.json({ sent, failed, total: customers.length, errors: errors.slice(0, 5) });
  } catch (err) {
    console.error('Email blast error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
