import { createClient } from '@supabase/supabase-js';
import { sendJobReminderSms } from '@/lib/sms';
import { hasPremiumAccess } from '@/lib/pricing-tiers';
import { notifyJobReminder } from '@/lib/notifications';

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
    .in('status', ['paid', 'scheduled', 'accepted']);

  if (error) {
    console.error('Job reminder SMS cron error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const quote of quotes || []) {
    const detailer = quote.detailers;

    // In-app notification for all detailers
    if (detailer?.id) {
      notifyJobReminder({
        detailerId: detailer.id,
        quote,
        scheduledDate: tomorrowDate,
      }).catch(console.error);
    }

    // SMS temporarily disabled pending 10DLC approval
    skipped++;
  }

  return new Response(JSON.stringify({ sent, skipped, total: (quotes || []).length }), { status: 200 });
}

// Vercel Cron sends GET requests; expose the same handler for GET.
export const GET = POST;
