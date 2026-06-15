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

// POST - Send invoice email to customer
export async function POST(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;
    const detailerId = user.detailer_id || user.id;

    // Parse body for forceResend flag — UI's "Resend" button sets resend:true
    // to bypass the idempotency check below.
    let parsedBody = {};
    try { parsedBody = await request.json(); } catch (_) { /* empty body is fine */ }
    const forceResend = parsedBody?.resend === true;
    console.log('[invoice/send] invoice_id:', id, 'detailer_id:', detailerId, 'resend:', forceResend);

    // Reject obviously bad IDs
    if (!id || id === 'undefined' || id === 'null') {
      return Response.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('detailer_id', detailerId)
      .single();

    if (invoiceError || !invoice) {
      console.error('[invoice/send] query error:', invoiceError?.message, 'invoice:', invoice);
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!invoice.customer_email) {
      return Response.json({ error: 'No customer email on invoice' }, { status: 400 });
    }

    // Idempotency: an invoice that's already been sent doesn't fire Resend
    // a second time unless { resend: true } is passed. The UI's "Resend"
    // button (rendered when invoice.sent_at IS NOT NULL) is the only path
    // that should opt in. Defense-in-depth against rapid-fire-click
    // double-sends.
    if (!forceResend && invoice.sent_at) {
      console.log(`[invoice/send] id=${id} already sent at ${invoice.sent_at} — skipping`);
      return Response.json({
        success: true,
        already_sent: true,
        sent_at: invoice.sent_at,
        message: 'Invoice already sent. Pass { resend: true } to send again.',
      }, { status: 200 });
    }

    // Fetch detailer info for From block (logo, company, contact details)
    // and Remit To block (mailing + ACH) when opted in on this invoice.
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name, email, phone, home_airport, logo_url, logo_light_url, mailing_address_line1, mailing_address_line2, mailing_city, mailing_state, mailing_zip, mailing_country, ach_routing_number, ach_account_number, ach_account_name, ach_bank_name')
      .eq('id', detailerId)
      .single();

    const companyName = detailer?.company || detailer?.name || 'Your Service Provider';
    const invoiceLink = `https://crm.shinyjets.com/invoice/${invoice.share_link}`;
    const total = parseFloat(invoice.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const invLabel = invoice.invoice_number || `#${String(invoice.id).slice(0, 8).toUpperCase()}`;
    const fromLogo = detailer?.logo_light_url || detailer?.logo_url || '';

    const subject = `Invoice ${invLabel} from ${companyName}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
  <div style="background:linear-gradient(135deg,#007CB1 0%,#0a1520 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#fff;font-size:24px;font-weight:700;">${companyName}</span>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;margin:0 0 16px;">Hi ${invoice.customer_name || 'there'},</p>
    <p style="font-size:15px;color:#4a5568;margin-bottom:20px;">
      You have a new invoice (${invLabel}) from <strong>${companyName}</strong> for <strong>${total}</strong>.
    </p>
    ${invoice.aircraft_model ? `<p style="font-size:14px;color:#718096;">Aircraft: ${invoice.aircraft_model}${invoice.tail_number ? ` (${invoice.tail_number})` : ''}</p>` : ''}
    ${invoice.due_date ? `<p style="font-size:14px;color:#718096;">Due: ${new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>` : ''}
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
      If you have questions about this invoice, please reply to this email.
    </p>
  </div>
</body></html>`;

    const text = `Hi ${invoice.customer_name || 'there'},\n\nYou have a new invoice (${invLabel}) from ${companyName} for ${total}.\n\nView & Pay: ${invoiceLink}\n\nThank you.`;

    // Sanitize company name for "from" header (only ASCII, no special chars that break SMTP)
    const safeName = (companyName || 'Shiny Jets CRM').replace(/[<>"]/g, '').replace(/[^\x20-\x7E]/g, '').trim() || 'Shiny Jets CRM';
    const fromDomain = (FROM_EMAIL.match(/<([^>]+)>/) || [null, FROM_EMAIL])[1];
    const brandedFrom = `${safeName} <${fromDomain}>`;
    const replyToEmail = detailer?.email || 'support@shinyjets.com';

    if (!process.env.RESEND_API_KEY) {
      console.error('[invoice/send] RESEND_API_KEY not configured');
      return Response.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let emailResult;
    try {
      // Resend SDK v3+ uses replyTo (camelCase). Try modern format first, fall back if needed.
      emailResult = await resend.emails.send({
        from: brandedFrom,
        to: invoice.customer_email,
        subject,
        html,
        text,
        replyTo: replyToEmail,
      });
    } catch (sendErr) {
      console.error('[invoice/send] Resend exception:', sendErr.message);
      await logNotification({
        detailer_id: detailerId,
        notification_type: forceResend ? 'invoice_resent' : 'invoice_sent',
        recipient: invoice.customer_email,
        channel: 'email',
        status: 'failed',
        error_message: sendErr.message,
        message_preview: subject,
        invoice_id: id,
      });
      return Response.json({ error: `Email failed: ${sendErr.message}` }, { status: 500 });
    }

    if (emailResult?.error) {
      console.error('[invoice/send] Resend returned error:', JSON.stringify(emailResult.error));
      await logNotification({
        detailer_id: detailerId,
        notification_type: forceResend ? 'invoice_resent' : 'invoice_sent',
        recipient: invoice.customer_email,
        channel: 'email',
        status: 'failed',
        error_message: emailResult.error.message || JSON.stringify(emailResult.error),
        message_preview: subject,
        invoice_id: id,
      });
      return Response.json({ error: emailResult.error.message || 'Failed to send email' }, { status: 500 });
    }

    // Update invoice status to 'sent', stamp sent_at (the audit-trail column,
    // previously not written here — caused the "did this go out?" question
    // mark on the invoice detail UI). Also set issued_date if unset.
    const updateFields = {
      status: 'sent',
      sent_at: new Date().toISOString(),
    };
    if (!invoice.issued_date) {
      updateFields.issued_date = new Date().toISOString();
    }

    // Column-stripping retry — sent_at may not exist on every deploy yet
    let updErr = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error } = await supabase
        .from('invoices')
        .update(updateFields)
        .eq('id', id)
        .eq('detailer_id', detailerId);
      if (!error) { updErr = null; break; }
      updErr = error;
      const colMatch = error.message?.match(/column "([^"]+)" of relation "invoices" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'invoices'/);
      if (colMatch && updateFields[colMatch[1]] !== undefined) {
        delete updateFields[colMatch[1]];
        continue;
      }
      break;
    }
    if (updErr) console.warn('[invoice/send] update warned (non-fatal):', updErr.message);

    // Audit row in notification_log — captures the Resend message id so the
    // dashboard "did this customer get this invoice" query has a single
    // source of truth keyed on resend_id.
    await logNotification({
      detailer_id: detailerId,
      notification_type: forceResend ? 'invoice_resent' : 'invoice_sent',
      recipient: invoice.customer_email,
      channel: 'email',
      status: 'sent',
      resend_id: emailResult?.data?.id || emailResult?.id || null,
      message_preview: subject,
      invoice_id: id,
    });

    return Response.json({ success: true, resend_id: emailResult?.data?.id || emailResult?.id || null });
  } catch (err) {
    console.error('Invoice send error:', err);
    return Response.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
}
