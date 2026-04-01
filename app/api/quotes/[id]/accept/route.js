import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { sendBookingConfirmedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST - Accept quote without online payment (request invoice / pay by check)
export async function POST(request, { params }) {
  const supabase = getSupabase();

  try {
    const { shareLink } = await request.json();
    const { id } = params;

    if (!id || !shareLink) {
      return Response.json({ error: 'Quote ID and share link required' }, { status: 400 });
    }

    // Fetch quote — require share_link match for security
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, total_price, aircraft_model, aircraft_type, status, client_name, client_email, share_link')
      .eq('id', id)
      .eq('share_link', shareLink)
      .single();

    if (quoteError || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.status === 'paid' || quote.status === 'approved' || quote.status === 'accepted') {
      return Response.json({ error: 'Quote already accepted or paid' }, { status: 400 });
    }

    // Update quote status to accepted
    await supabase
      .from('quotes')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', id);

    // Fetch detailer for notification + booking mode
    const { data: detailer } = await supabase
      .from('detailers')
      .select('email, company, name, phone, booking_mode, preferred_currency, theme_accent, theme_primary, theme_logo_url')
      .eq('id', quote.detailer_id)
      .single();

    // Store booking mode on quote + auto-create invoice for book_later
    if (detailer?.booking_mode === 'book_later') {
      await supabase
        .from('quotes')
        .update({
          booking_mode: 'book_later',
          amount_paid: 0,
          balance_due: quote.total_price,
        })
        .eq('id', id);

      // Auto-create unpaid invoice
      try {
        const { nanoid } = await import('nanoid');
        const invoiceNumber = `INV-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${nanoid(4).toUpperCase()}`;
        await supabase.from('invoices').insert({
          detailer_id: quote.detailer_id,
          quote_id: quote.id,
          invoice_number: invoiceNumber,
          status: 'unpaid',
          customer_name: quote.client_name || '',
          customer_email: quote.client_email || '',
          detailer_name: detailer.name || '',
          detailer_email: detailer.email || '',
          detailer_company: detailer.company || '',
          aircraft: quote.aircraft_model || quote.aircraft_type || '',
          total: quote.total_price || 0,
          subtotal: quote.total_price || 0,
          amount_paid: 0,
          balance_due: quote.total_price || 0,
          booking_mode: 'book_later',
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (e) { console.error('Auto-invoice creation failed:', e); }
    }

    // Send notification email to detailer via Resend
    if (detailer?.email) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@vectorav.ai>';
        const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'aircraft detail';
        const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(quote.total_price || 0);

        await resend.emails.send({
          from: fromEmail,
          to: detailer.email,
          subject: `Invoice Requested — ${aircraftDisplay}`,
          html: `<p>Hi ${detailer.name || detailer.company || ''},</p>
<p><strong>${quote.client_name || 'A customer'}</strong> accepted your quote for <strong>${aircraftDisplay}</strong> and requested an invoice.</p>
<p>They chose to pay by check/ACH instead of credit card. Please send them an invoice directly.</p>
<p>Quote total: <strong>${amount}</strong></p>
${quote.client_email ? `<p>Customer email: <a href="mailto:${quote.client_email}">${quote.client_email}</a></p>` : ''}
<p style="color:#999;font-size:12px;">— Shiny Jets</p>`,
        });
      } catch (emailErr) {
        console.error('Failed to send invoice request notification:', emailErr);
      }
    }

    // Send booking confirmation email to customer
    if (quote.client_email) {
      try {
        await sendBookingConfirmedEmail({ quote: { ...quote, share_link: quote.share_link }, detailer });
      } catch (e) {
        console.error('Failed to send booking confirmation:', e);
      }
    }

    // Create in-app notification
    try {
      await supabase.from('notifications').insert({
        detailer_id: quote.detailer_id,
        type: 'quote_accepted',
        title: 'Quote Accepted',
        message: `${quote.client_name || 'Customer'} accepted quote for ${quote.aircraft_model || quote.aircraft_type || 'detail'}`,
        link: '/quotes',
        metadata: { quote_id: id },
      });
    } catch {}

    // Push notification for quote accepted
    try {
      const { data: detailerPush } = await supabase
        .from('detailers')
        .select('fcm_token')
        .eq('id', quote.detailer_id)
        .single();
      if (detailerPush?.fcm_token) {
        const { sendPushNotification } = await import('@/lib/push');
        await sendPushNotification({
          fcmToken: detailerPush.fcm_token,
          title: 'Quote Accepted!',
          body: `${quote.client_name || 'Customer'} accepted your quote for ${quote.aircraft_model || quote.aircraft_type || 'detail'}`,
          data: { type: 'quote_accepted', quoteId: quote.id, url: '/quotes' },
        });
      }
    } catch {}

    return Response.json({ success: true, status: 'accepted' });
  } catch (err) {
    console.error('Accept quote error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
