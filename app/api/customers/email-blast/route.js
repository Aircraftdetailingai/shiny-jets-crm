import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendCustomerEmail } from '@/lib/email';
import { getBranding } from '@/lib/branding';

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

    // Fetch detailer info for plan-aware From + Reply-To
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name, email, plan, logo_url, logo_dark_url, logo_light_url, custom_email_domain, custom_email_verified_at')
      .eq('id', user.id)
      .single();

    const branding = getBranding(detailer);
    const companyName = detailer?.company || detailer?.name || 'Shiny Jets CRM';
    const platformAttribution = branding.showPoweredBy
      ? `<p style="color:#999;font-size:12px;">Sent by ${companyName} via Shiny Jets CRM</p>`
      : `<p style="color:#999;font-size:12px;">Sent by ${companyName}</p>`;

    // Fetch customers that belong to this detailer
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, email, name')
      .eq('detailer_id', user.detailer_id || user.id)
      .in('id', customerIds);

    if (error || !customers?.length) {
      return Response.json({ error: 'No valid customers found' }, { status: 404 });
    }

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const customer of customers) {
      if (!customer.email) { failed++; continue; }
      try {
        const result = await sendCustomerEmail({
          detailer,
          to: customer.email,
          subject,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <p>Hi ${customer.name || 'there'},</p>
            <div style="white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
            ${platformAttribution}
          </div>`,
        });
        if (result?.success) sent++; else { failed++; errors.push({ email: customer.email, error: result?.error }); }
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
