import { createClient } from '@supabase/supabase-js';
import { sendExpirationAlertSms, sendExpirationWarningSms } from '@/lib/sms';
import { sendQuoteExpiringEmail, sendQuoteExpiredDetailerEmail } from '@/lib/email';
import { hasPremiumAccess } from '@/lib/pricing-tiers';
import { notifyQuoteExpired } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

function verifySecret(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === process.env.CRON_SECRET;
}

// POST - Process quote expirations (called by cron)
export async function POST(request) {
  if (!verifySecret(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const nowISO = now.toISOString();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let warningsSent = 0;
  let expiredProcessed = 0;

  // --- 1. Send 24-hour expiration warnings ---
  const { data: expiringQuotes, error: expiringErr } = await supabase
    .from('quotes')
    .select('*')
    .gte('valid_until', nowISO)
    .lte('valid_until', in24h)
    .in('status', ['sent', 'viewed'])
    .is('expiration_warning_sent', null);

  if (expiringErr) {
    console.error('Expiring quotes fetch error:', expiringErr.message);
  }

  for (const quote of expiringQuotes || []) {
    try {
      const { data: detailer } = await supabase
        .from('detailers')
        .select('*')
        .eq('id', quote.detailer_id)
        .single();
      if (!detailer) continue;

      const settings = detailer.notification_settings || {};
      const plan = detailer.plan || 'free';

      // Email to customer (always - all plans)
      if (quote.client_email) {
        sendQuoteExpiringEmail({ quote, detailer }).catch(err =>
          console.error(`Expiring email failed for ${quote.id}:`, err.message)
        );
      }

      // SMS to detailer (pro+)
      if ((plan === 'pro' || hasPremiumAccess(plan)) && settings.smsQuoteExpiring && detailer.phone) {
        try {
          const statusText = quote.status === 'viewed' ? 'viewed' : 'not viewed';
          await sendExpirationAlertSms({
            detailerPhone: detailer.phone,
            clientName: quote.client_name || '',
            aircraft: quote.aircraft_type || '',
            statusText,
          });
        } catch (err) {
          // ignore sms errors
        }
      }

      // SMS to client (business+)
      if (hasPremiumAccess(plan) && detailer.sms_enabled !== false && settings.smsClientExpiration && quote.client_phone) {
        try {
          const link = `https://app.vectorav.ai/q/${quote.share_link}`;
          await sendExpirationWarningSms({
            clientPhone: quote.client_phone,
            clientName: quote.client_name || '',
            aircraft: quote.aircraft_type || '',
            link,
          });
        } catch (err) {
          // ignore sms errors
        }
      }

      // Mark warning as sent
      await supabase.from('quotes').update({ expiration_warning_sent: nowISO }).eq('id', quote.id);
      warningsSent++;
    } catch (err) {
      console.error(`Warning processing failed for ${quote.id}:`, err.message);
    }
  }

  // --- 2. Process newly expired quotes (notify detailer) ---
  const { data: expiredQuotes, error: expiredErr } = await supabase
    .from('quotes')
    .select('*')
    .lt('valid_until', nowISO)
    .in('status', ['sent', 'viewed']);

  if (expiredErr) {
    console.error('Expired quotes fetch error:', expiredErr.message);
  }

  for (const quote of expiredQuotes || []) {
    try {
      const { data: detailer } = await supabase
        .from('detailers')
        .select('*')
        .eq('id', quote.detailer_id)
        .single();
      if (!detailer) continue;

      // Update status to expired
      await supabase
        .from('quotes')
        .update({ status: 'expired' })
        .eq('id', quote.id);

      // Email detailer about expiration
      if (detailer.email) {
        sendQuoteExpiredDetailerEmail({ quote, detailer }).catch(err =>
          console.error(`Expired email failed for ${quote.id}:`, err.message)
        );
      }

      // In-app notification
      notifyQuoteExpired({ detailerId: detailer.id, quote }).catch(console.error);

      expiredProcessed++;
    } catch (err) {
      console.error(`Expiration processing failed for ${quote.id}:`, err.message);
    }
  }

  return Response.json({
    warningsSent,
    expiredProcessed,
    timestamp: nowISO,
  });
}
