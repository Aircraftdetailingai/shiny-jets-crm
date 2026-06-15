import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';
import { logNotification } from '@/lib/notification-log';

export const dynamic = 'force-dynamic';

const FROM_EMAIL = 'Shiny Jets CRM <noreply@mail.shinyjets.com>';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Send payment reminder email (owner auth)
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
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (invoiceError || !invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!invoice.customer_email) {
      return Response.json({ error: 'No customer email on invoice' }, { status: 400 });
    }

    // Fetch detailer info for From block + Remit To block (opt-in per invoice)
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name, email, phone, home_airport, logo_url, logo_light_url, mailing_address_line1, mailing_address_line2, mailing_city, mailing_state, mailing_zip, mailing_country, ach_routing_number, ach_account_number, ach_account_name, ach_bank_name')
      .eq('id', user.id)
      .single();

    const companyName = detailer?.company || detailer?.name || 'Your Service Provider';
    const invoiceLink = `https://crm.shinyjets.com/invoice/${invoice.share_link}`;
    const total = parseFloat(invoice.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'N/A';
    const invLabel = invoice.invoice_number || `#${String(invoice.id).slice(0, 8).toUpperCase()}`;
    const fromLogo = detailer?.logo_light_url || detailer?.logo_url || '';

    const subject = `Payment Reminder: Invoice ${invLabel} from ${companyName}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
  <div style="background:linear-gradient(135deg,#007CB1 0%,#0a1520 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#fff;font-size:24px;font-weight:700;">${companyName}</span>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;margin:0 0 16px;">Hi ${invoice.customer_name || 'there'},</p>
    <p style="font-size:15px;color:#4a5568;margin-bottom:12px;">
      This is a friendly reminder that you have an outstanding invoice (${invLabel}) from <strong>${companyName}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="margin:4px 0;font-size:14px;"><strong>Amount Due:</strong> ${total}</p>
      <p style="margin:4px 0;font-size:14px;"><strong>Due Date:</strong> ${dueDate}</p>
      ${invoice.aircraft_model ? `<p style="margin:4px 0;font-size:14px;"><strong>Aircraft:</strong> ${invoice.aircraft_model}${invoice.tail_number ? ` (${invoice.tail_number})` : ''}</p>` : ''}
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">From</p>
      ${fromLogo ? `<img src="${fromLogo}" alt="" style="height:36px;max-width:180px;object-fit:contain;display:block;margin:6px 0 4px" />` : ''}
      ${detailer?.company ? `<p style="margin:4px 0 0;font-weight:600;color:#1f2937;font-size:14px;">${detailer.company}</p>` : ''}
      ${detailer?.name && detailer.name !== detailer?.company ? `<p style="margin:0;color:#6b7280;font-size:13px;">${detailer.name}</p>` : ''}
      ${detailer?.email ? `<p style="margin:0;color:#6b7280;font-size:13px;">${detailer.email}</p>` : ''}
      ${detailer?.phone ? `<p style="margin:0;color:#6b7280;font-size:13px;">${detailer.phone}</p>` : ''}
      ${detailer?.home_airport ? `<p style="margin:0;color:#6b7280;font-size:13px;">${detailer.home_airport}</p>` : ''}
    </div>
    ${((invoice.show_mailing_address && detailer?.mailing_address_line1) || (invoice.show_ach_info && detailer?.ach_routing_number)) ? `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Remit To</p>
        ${invoice.show_mailing_address && detailer?.mailing_address_line1 ? `
          <div style="margin-top:6px;margin-bottom:8px;">
            <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;">By mail</p>
            <p style="margin:2px 0 0;font-weight:600;color:#1f2937;font-size:13px;">${detailer.company || detailer.name || ''}</p>
            <p style="margin:0;color:#4b5563;font-size:13px;">${detailer.mailing_address_line1}</p>
            ${detailer.mailing_address_line2 ? `<p style="margin:0;color:#4b5563;font-size:13px;">${detailer.mailing_address_line2}</p>` : ''}
            <p style="margin:0;color:#4b5563;font-size:13px;">${[detailer.mailing_city, detailer.mailing_state].filter(Boolean).join(', ')}${detailer.mailing_zip ? ` ${detailer.mailing_zip}` : ''}</p>
            ${detailer.mailing_country && detailer.mailing_country !== 'US' ? `<p style="margin:0;color:#4b5563;font-size:13px;">${detailer.mailing_country}</p>` : ''}
          </div>
        ` : ''}
        ${invoice.show_ach_info && detailer?.ach_routing_number ? `
          <div>
            <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;">By ACH / Wire</p>
            ${detailer.ach_bank_name ? `<p style="margin:2px 0 0;font-weight:600;color:#1f2937;font-size:13px;">${detailer.ach_bank_name}</p>` : ''}
            ${detailer.ach_account_name ? `<p style="margin:0;color:#4b5563;font-size:13px;">Account name: ${detailer.ach_account_name}</p>` : ''}
            <p style="margin:0;color:#4b5563;font-size:13px;font-family:monospace">Routing: ${detailer.ach_routing_number}</p>
            ${detailer.ach_account_number ? `<p style="margin:0;color:#4b5563;font-size:13px;font-family:monospace">Account: ${detailer.ach_account_number}</p>` : ''}
          </div>
        ` : ''}
      </div>
    ` : ''}
    <div style="text-align:center;margin:30px 0;">
      <a href="${invoiceLink}" style="display:inline-block;background:#007CB1;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:16px;">
        View &amp; Pay Invoice
      </a>
    </div>
    <p style="font-size:12px;color:#aaa;text-align:center;margin-top:20px;">
      If you have already made this payment, please disregard this reminder.
    </p>
  </div>
</body></html>`;

    const text = `Hi ${invoice.customer_name || 'there'},\n\nThis is a friendly reminder that you have an outstanding invoice (${invLabel}) from ${companyName}.\n\nAmount Due: ${total}\nDue Date: ${dueDate}\n\nView & Pay: ${invoiceLink}\n\nIf you have already made this payment, please disregard this reminder.`;

    const fromDomain = (FROM_EMAIL.match(/<([^>]+)>/) || [null, FROM_EMAIL])[1];
    const brandedFrom = `${companyName} <${fromDomain}>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: brandedFrom,
      to: invoice.customer_email,
      subject,
      html,
      text,
      reply_to: detailer?.email || 'support@shinyjets.com',
    });

    if (emailError) {
      console.error('Invoice reminder email error:', emailError);
      await logNotification({
        detailer_id: invoice.detailer_id,
        notification_type: 'invoice_remind',
        recipient: invoice.customer_email,
        channel: 'email',
        status: 'failed',
        error_message: emailError.message || JSON.stringify(emailError),
        message_preview: subject,
        invoice_id: invoice.id,
      });
      return Response.json({ error: 'Failed to send reminder' }, { status: 500 });
    }

    await logNotification({
      detailer_id: invoice.detailer_id,
      notification_type: 'invoice_remind',
      recipient: invoice.customer_email,
      channel: 'email',
      status: 'sent',
      resend_id: emailData?.id || null,
      message_preview: subject,
      invoice_id: invoice.id,
    });
    return Response.json({ success: true, resend_id: emailData?.id || null });
  } catch (err) {
    console.error('Invoice remind error:', err);
    return Response.json({ error: 'Failed to send reminder' }, { status: 500 });
  }
}
