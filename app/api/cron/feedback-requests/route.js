import { createClient } from '@supabase/supabase-js';
import { sendFeedbackRequestEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = getSupabase();

  // Get all detailers with review requests enabled
  const { data: detailers, error: dError } = await supabase
    .from('detailers')
    .select('id, name, email, company, review_request_enabled, review_request_delay_days')
    .neq('review_request_enabled', false);

  if (dError) {
    console.error('Feedback cron detailer query error:', dError);
    return Response.json({ error: 'Query failed' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const now = new Date();

  for (const detailer of detailers || []) {
    const delayDays = detailer.review_request_delay_days || 1;

    // Compute time window based on delay setting
    let fromDate, toDate;
    if (delayDays === 0) {
      // Immediate: catch anything completed in last 2 hours (backup for job completion trigger)
      fromDate = new Date(now - 2 * 60 * 60 * 1000).toISOString();
      toDate = now.toISOString();
    } else {
      // N days: completed between N+1 and N days ago
      fromDate = new Date(now - (delayDays + 1) * 24 * 60 * 60 * 1000).toISOString();
      toDate = new Date(now - delayDays * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('id, client_name, client_email, aircraft_model, aircraft_type, total_price, detailer_id, share_link')
      .eq('detailer_id', detailer.id)
      .eq('status', 'completed')
      .is('feedback_token', null)
      .not('client_email', 'is', null)
      .lte('completed_at', toDate)
      .gte('completed_at', fromDate)
      .limit(50);

    if (error) {
      console.error(`Feedback cron query error for detailer ${detailer.id}:`, error);
      continue;
    }

    for (const quote of quotes || []) {
      try {
        const feedbackToken = crypto.randomBytes(16).toString('hex');

        await supabase
          .from('quotes')
          .update({
            feedback_token: feedbackToken,
            feedback_requested_at: new Date().toISOString(),
          })
          .eq('id', quote.id);

        const result = await sendFeedbackRequestEmail({
          quote: { ...quote, feedback_token: feedbackToken },
          detailer,
        });

        if (result.success) {
          sent++;
        } else {
          failed++;
          console.error(`Feedback email failed for quote ${quote.id}:`, result.error);
        }
      } catch (err) {
        failed++;
        console.error(`Feedback request error for quote ${quote.id}:`, err);
      }
    }
  }

  return Response.json({
    processed: sent + failed,
    sent,
    failed,
  });
}
