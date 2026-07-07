import { createClient } from '@supabase/supabase-js';
import { notifyNewQuoteRequest } from '@/lib/push';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const supabase = getSupabase();

  try {
    const { originalQuoteId, shareLink } = await request.json();

    if (!originalQuoteId || !shareLink) {
      return new Response(JSON.stringify({ error: 'Quote ID and share link required' }), { status: 400 });
    }

    // Fetch original quote - require share_link match to prevent enumeration
    const { data: originalQuote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, client_name, client_email, client_phone, aircraft_type, aircraft_model, services, total_price, valid_until, share_link, metadata')
      .eq('id', originalQuoteId)
      .eq('share_link', shareLink)
      .single();

    if (quoteError || !originalQuote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
    }

    // NOTE: there is no `quote_requests` table in this project (verified live),
    // so the request is anchored on the original quote via quotes.metadata.
    // Dedupe: a second click for the same quote is a no-op that reports
    // already_requested — no duplicate detailer notification.
    if (originalQuote.metadata?.new_quote_requested_at) {
      return new Response(JSON.stringify({ success: true, already_requested: true }), { status: 200 });
    }

    // Record the request on the quote BEFORE emailing. If this stamp fails we
    // return 500 and do NOT notify the detailer or claim success.
    const stampedMeta = { ...(originalQuote.metadata || {}), new_quote_requested_at: new Date().toISOString() };
    const { error: stampError } = await supabase
      .from('quotes')
      .update({ metadata: stampedMeta })
      .eq('id', originalQuoteId)
      .eq('share_link', shareLink);
    if (stampError) {
      console.error(`[request-new] failed to record request for quote ${originalQuoteId}:`, stampError.message);
      return new Response(JSON.stringify({ error: 'Could not record your request. Please try again.' }), { status: 500 });
    }

    // Fetch detailer for notification
    const { data: detailer } = await supabase
      .from('detailers')
      .select('email, phone, company, notification_settings, fcm_token')
      .eq('id', originalQuote.detailer_id)
      .single();

    // Send push notification
    if (detailer?.fcm_token) {
      notifyNewQuoteRequest({ fcmToken: detailer.fcm_token, quote: originalQuote }).catch(console.error);
    }

    // Send notification to detailer
    if (detailer?.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
            to: detailer.email,
            subject: 'Customer Requested Updated Quote',
            text: `A customer has requested an updated quote!\n\nCustomer: ${originalQuote.client_name || 'Unknown'}\nAircraft: ${originalQuote.aircraft_model || originalQuote.aircraft_type}\nOriginal Price: $${originalQuote.total_price}\n\nThe original quote expired on ${new Date(originalQuote.valid_until).toLocaleDateString()}.\n\nLog in to Shiny Jets CRM to send them an updated quote.`
          })
        });
      } catch (e) {
        console.error('Failed to send notification email:', e);
      }
    }

    // Send SMS if business plan and phone configured
    if (detailer?.phone && detailer?.notification_settings?.quoteRequested !== false) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_FROM_NUMBER;

        if (accountSid && authToken && fromNumber) {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`)
            },
            body: new URLSearchParams({
              From: fromNumber,
              To: detailer.phone,
              Body: `New quote request! ${originalQuote.client_name || 'A customer'} wants an updated quote for ${originalQuote.aircraft_model || originalQuote.aircraft_type}. Check your dashboard.`
            }).toString()
          });
        }
      } catch (e) {
        console.error('Failed to send SMS:', e);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Request new quote error:', err);
    return new Response(JSON.stringify({ error: 'Failed to request quote' }), { status: 500 });
  }
}
