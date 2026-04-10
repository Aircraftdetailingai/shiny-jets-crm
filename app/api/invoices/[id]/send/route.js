import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const FROM_EMAIL = 'Shiny Jets CRM <noreply@mail.shinyjets.com>';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Send invoice email to customer
export async function POST(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('detailer_id', user.id)
      .single();

    if (invoiceError || !invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!invoice.customer_email) {
      return Response.json({ error: 'No customer email on invoice' }, { status: 400 });
    }

    // Fetch detailer company name
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name, email')
      .eq('id', user.id)
      .single();

    const companyName = detailer?.company || detailer?.name || 'Your Service Provider';
    const invoiceLink = `https://crm.shinyjets.com/invoice/${invoice.share_link}`;
    const total = parseFloat(invoice.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    const subject = `Invoice from ${companyName}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
  <div style="background:linear-gradient(135deg,#007CB1 0%,#0a1520 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#fff;font-size:24px;font-weight:700;">${companyName}</span>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;margin:0 0 16px;">Hi ${invoice.customer_name || 'there'},</p>
    <p style="font-size:15px;color:#4a5568;margin-bottom:20px;">
      You have a new invoice from <strong>${companyName}</strong> for <strong>${total}</strong>.
    </p>
    ${invoice.aircraft_model ? `<p style="font-size:14px;color:#718096;">Aircraft: ${invoice.aircraft_model}${invoice.tail_number ? ` (${invoice.tail_number})` : ''}</p>` : ''}
    ${invoice.due_date ? `<p style="font-size:14px;color:#718096;">Due: ${new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>` : ''}
    <div style="text-align:center;margin:30px 0;">
      <a href="${invoiceLink}" style="display:inline-block;background:#007CB1;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:16px;">
        View &amp; Pay Invoice
      </a>
    </div>
    <p style="font-size:12px;color:#aaa;text-align:center;margin-top:20px;">
      If you have questions about this invoice, please reply to this email.
    </p>
  </div>
</body></html>`;

    const text = `Hi ${invoice.customer_name || 'there'},\n\nYou have a new invoice from ${companyName} for ${total}.\n\nView & Pay: ${invoiceLink}\n\nThank you.`;

    const fromDomain = (FROM_EMAIL.match(/<([^>]+)>/) || [null, FROM_EMAIL])[1];
    const brandedFrom = `${companyName} <${fromDomain}>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: brandedFrom,
      to: invoice.customer_email,
      subject,
      html,
      text,
      reply_to: detailer?.email || 'support@shinyjets.com',
    });

    if (emailError) {
      console.error('Invoice send email error:', emailError);
      return Response.json({ error: 'Failed to send email' }, { status: 500 });
    }

    // Update invoice status to 'sent', set issued_date if not set
    const updateFields = { status: 'sent' };
    if (!invoice.issued_date) {
      updateFields.issued_date = new Date().toISOString();
    }

    await supabase
      .from('invoices')
      .update(updateFields)
      .eq('id', id)
      .eq('detailer_id', user.id);

    return Response.json({ success: true });
  } catch (err) {
    console.error('Invoice send error:', err);
    return Response.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
}
