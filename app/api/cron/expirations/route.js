import { createClient } from '@supabase/supabase-js';
import { sendExpirationAlertSms, sendExpirationWarningSms } from '@/lib/sms';
import { hasPremiumAccess } from '@/lib/pricing-tiers';

export async function POST(request) {
  // Verify CRON_SECRET from Authorization header
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const nowISO = now.toISOString();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('*')
    .gte('valid_until', nowISO)
    .lte('valid_until', in24h)
    .in('status', ['sent', 'viewed'])
    .is('expiration_warning_sent', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let processed = 0;

  for (const quote of quotes || []) {
    try {
      const { data: detailer, error: detailerErr } = await supabase
        .from('detailers')
        .select('*')
        .eq('id', quote.detailer_id)
        .single();
      if (detailerErr || !detailer) {
        continue;
      }
      const settings = detailer.notification_settings || {};
      const plan = detailer.plan || 'starter';
      const quoteViewed = quote.status === 'viewed';
      // SMS to detailer if plan is pro or business and smsQuoteExpiring enabled
      if ((plan === 'pro' || hasPremiumAccess(plan)) && settings.smsQuoteExpiring && detailer.phone) {
        try {
          const statusText = quoteViewed ? 'viewed' : 'not viewed';
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
      // SMS to client if plan is business, SMS enabled, and smsClientExpiration enabled
      if (hasPremiumAccess(plan) && detailer.sms_enabled !== false && settings.smsClientExpiration && quote.client_phone) {
        try {
          const link = `https://app.aircraftdetailing.ai/q/${quote.share_link}`;
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
      await supabase.from('quotes').update({ expiration_warning_sent: nowISO }).eq('id', quote.id);
      processed++;
    } catch (err) {
      // ignore errors
    }
  }
  return new Response(JSON.stringify({ processed }), { status: 200 });
}
