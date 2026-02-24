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

  // Find quotes completed 1-3 days ago that haven't had feedback requested
  const now = new Date();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();

  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('id, client_name, client_email, aircraft_model, aircraft_type, total_price, detailer_id, share_link')
    .eq('status', 'completed')
    .is('feedback_token', null)
    .not('client_email', 'is', null)
    .lte('completed_at', oneDayAgo)
    .gte('completed_at', threeDaysAgo)
    .limit(50);

  if (error) {
    console.error('Feedback cron query error:', error);
    return Response.json({ error: 'Query failed' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const quote of quotes || []) {
    try {
      // Get detailer info
      const { data: detailer } = await supabase
        .from('detailers')
        .select('id, name, email, company')
        .eq('id', quote.detailer_id)
        .single();

      // Generate feedback token
      const feedbackToken = crypto.randomBytes(16).toString('hex');

      // Save token to quote
      await supabase
        .from('quotes')
        .update({
          feedback_token: feedbackToken,
          feedback_requested_at: new Date().toISOString(),
        })
        .eq('id', quote.id);

      // Send email
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

  return Response.json({
    processed: (quotes || []).length,
    sent,
    failed,
  });
}
