import { createClient } from '@supabase/supabase-js';
import { sendQuoteSentEmail } from '@/lib/email';
import { sendQuoteSms } from '@/lib/sms';
import { hasPremiumAccess } from '@/lib/pricing-tiers';

export const dynamic = 'force-dynamic';

// POST - Cron job to send scheduled quotes
export async function POST(request) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );

  const now = new Date().toISOString();

  // Fetch all pending scheduled quotes where send_at has passed
  const { data: scheduled, error } = await supabase
    .from('scheduled_quotes')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .is('cancelled_at', null);

  if (error) {
    console.error('Scheduled quotes cron error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  let errors = 0;

  for (const sq of scheduled || []) {
    try {
      // Fetch the quote
      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', sq.quote_id)
        .single();

      if (qErr || !quote) {
        await supabase.from('scheduled_quotes').update({
          status: 'failed',
          error_message: 'Quote not found',
        }).eq('id', sq.id);
        errors++;
        continue;
      }

      // Skip if already sent
      if (quote.status === 'sent' || quote.status === 'paid' || quote.status === 'completed') {
        await supabase.from('scheduled_quotes').update({
          status: 'sent',
          sent_at: now,
          error_message: 'Quote already sent/paid',
        }).eq('id', sq.id);
        continue;
      }

      // Fetch detailer info
      const { data: detailer } = await supabase
        .from('detailers')
        .select('id, name, email, phone, company, plan, sms_enabled')
        .eq('id', sq.detailer_id)
        .single();

      // Update quote with client info and mark as sent
      let updateFields = {
        client_name: sq.client_name,
        client_email: sq.client_email,
        client_phone: sq.client_phone || null,
        customer_id: sq.customer_id || null,
        airport: sq.airport || null,
        status: 'sent',
        sent_at: now,
        scheduled_date: null,
      };

      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await supabase
          .from('quotes')
          .update(updateFields)
          .eq('id', sq.quote_id)
          .select()
          .single();

        if (!result.error) break;

        const colMatch = result.error.message?.match(/column "([^"]+)" of relation "quotes" does not exist/)
          || result.error.message?.match(/Could not find the '([^']+)' column of 'quotes'/);
        if (colMatch) {
          delete updateFields[colMatch[1]];
          continue;
        }
        break;
      }

      // Send email
      let emailSent = false;
      if (sq.client_email) {
        try {
          const emailQuote = { ...quote, ...updateFields, share_link: quote.share_link };
          const result = await sendQuoteSentEmail({ quote: emailQuote, detailer });
          emailSent = result.success;
        } catch (e) {
          console.error('Scheduled quote email error:', e.message);
        }
      }

      // Send SMS for business plan
      let smsSent = false;
      if (hasPremiumAccess(detailer?.plan) && detailer?.sms_enabled !== false && sq.client_phone) {
        try {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';
          const result = await sendQuoteSms({
            clientPhone: sq.client_phone,
            clientName: sq.client_name,
            aircraftDisplay: quote.aircraft_model || quote.aircraft_type || 'aircraft',
            quoteLink: `${APP_URL}/q/${quote.share_link}`,
            companyName: detailer?.company || detailer?.name || '',
          });
          smsSent = result.success;
        } catch (e) {
          console.error('Scheduled quote SMS error:', e.message);
        }
      }

      // Mark scheduled quote as sent
      await supabase.from('scheduled_quotes').update({
        status: 'sent',
        sent_at: now,
        email_sent: emailSent,
        sms_sent: smsSent,
      }).eq('id', sq.id);

      processed++;
    } catch (err) {
      console.error('Scheduled quote processing error:', err);
      await supabase.from('scheduled_quotes').update({
        status: 'failed',
        error_message: err.message || 'Unknown error',
      }).eq('id', sq.id);
      errors++;
    }
  }

  return Response.json({
    processed,
    errors,
    total: (scheduled || []).length,
  });
}
