import { createClient } from '@supabase/supabase-js';
import { sendJobReminderSms } from '@/lib/sms';

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Find quotes scheduled for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];

  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('*, detailers(*)')
    .eq('scheduled_date', tomorrowDate)
    .in('status', ['paid', 'scheduled', 'accepted'])
    .not('client_phone', 'is', null);

  if (error) {
    console.error('Job reminder SMS cron error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const quote of quotes || []) {
    const detailer = quote.detailers;

    if (detailer?.plan !== 'business') { skipped++; continue; }
    if (detailer?.sms_enabled === false) { skipped++; continue; }

    const settings = detailer.notification_settings || {};
    if (settings.jobReminderSms === false) { skipped++; continue; }

    try {
      const result = await sendJobReminderSms({
        clientPhone: quote.client_phone,
        clientName: quote.client_name || '',
        aircraftDisplay: quote.aircraft_model || quote.aircraft_type || 'aircraft',
        companyName: detailer.company || detailer.name || '',
        scheduledTime: quote.scheduled_time || '',
      });
      if (result.success) sent++;
    } catch (e) {
      console.error(`Job reminder SMS failed for quote ${quote.id}:`, e);
    }
  }

  return new Response(JSON.stringify({ sent, skipped, total: (quotes || []).length }), { status: 200 });
}
