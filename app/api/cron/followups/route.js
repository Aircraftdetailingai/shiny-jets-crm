import { createClient } from '@supabase/supabase-js';
import { sendFollowup3DaySms, sendFollowup7DaySms } from '@/lib/sms';
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

  const { data: followups, error } = await supabase
    .from('scheduled_followups')
    .select('*')
    .lte('scheduled_for', nowISO)
    .is('sent_at', null)
    .is('cancelled_at', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let processed = 0;

  for (const followup of followups || []) {
    try {
      // Fetch quote
      const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', followup.quote_id)
        .single();
      if (quoteErr || !quote) {
        continue;
      }
      // Fetch detailer
      const { data: detailer, error: detailerErr } = await supabase
        .from('detailers')
        .select('*')
        .eq('id', quote.detailer_id)
        .single();
      if (detailerErr || !detailer) {
        continue;
      }
      // Cancel if quote accepted or expired
      if (quote.status === 'accepted' || quote.status === 'expired') {
        await supabase.from('scheduled_followups').update({ cancelled_at: nowISO, cancel_reason: quote.status }).eq('id', followup.id);
        continue;
      }
      // Cancel if detailer plan is not business or SMS disabled
      if (!hasPremiumAccess(detailer.plan) || detailer.sms_enabled === false) {
        await supabase.from('scheduled_followups').update({ cancelled_at: nowISO, cancel_reason: 'downgraded' }).eq('id', followup.id);
        continue;
      }
      // Determine message
      let body = '';
      const clientName = quote.client_name || '';
      const aircraft = quote.aircraft_type || '';
      const link = `https://app.aircraftdetailing.ai/q/${quote.share_link}`;
      if (followup.followup_type === '3day') {
        body = `Hi ${clientName}, checking in on the quote for your ${aircraft}. ${link} - ${detailer.name || ''}`;
      } else if (followup.followup_type === '7day') {
        body = `Hi ${clientName}, following up one more time on the ${aircraft} quote. ${link} - ${detailer.name || ''}`;
      } else {
        await supabase.from('scheduled_followups').update({ cancelled_at: nowISO, cancel_reason: 'unsupported' }).eq('id', followup.id);
        continue;
      }
      // Send SMS
      try {
        const smsArgs = {
          clientPhone: followup.client_phone,
          clientName,
          aircraft,
          link,
          detailerName: detailer.name || '',
        };
        if (followup.followup_type === '3day') {
          await sendFollowup3DaySms(smsArgs);
        } else {
          await sendFollowup7DaySms(smsArgs);
        }
      } catch (err) {
        // ignore SMS errors
      }
      await supabase.from('scheduled_followups').update({ sent_at: nowISO }).eq('id', followup.id);
      processed++;
    } catch (err) {
      // continue on error
    }
  }
  return new Response(JSON.stringify({ processed }), { status: 200 });
}
