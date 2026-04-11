import { createClient } from '@supabase/supabase-js';
import { sendFeedbackRequestEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// Dedicated review request cron — runs 7 days after job completion
// Queries jobs table directly. The existing feedback-requests cron
// handles quotes; this one handles the jobs table.
export async function POST(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();

  // Find jobs completed ~7 days ago that haven't had a review request sent
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const { data: jobs, error: jobsErr } = await supabase
    .from('jobs')
    .select('id, quote_id, detailer_id, customer_name, customer_email, aircraft_make, aircraft_model, tail_number')
    .eq('status', 'complete')
    .eq('review_request_sent', false)
    .not('customer_email', 'is', null)
    .lte('completed_at', sevenDaysAgo)
    .gte('completed_at', eightDaysAgo)
    .limit(100);

  if (jobsErr) {
    console.error('Review request cron query error:', jobsErr);
    return Response.json({ error: 'Query failed' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const job of jobs || []) {
    try {
      // Get detailer info
      const { data: detailer } = await supabase
        .from('detailers')
        .select('id, name, email, company, google_review_url')
        .eq('id', job.detailer_id)
        .single();

      if (!detailer) continue;

      // Get the associated quote for share_link
      let shareLink = null;
      if (job.quote_id) {
        const { data: quote } = await supabase
          .from('quotes')
          .select('share_link')
          .eq('id', job.quote_id)
          .single();
        shareLink = quote?.share_link;
      }

      const feedbackToken = crypto.randomBytes(16).toString('hex');
      const aircraft = [job.aircraft_make, job.aircraft_model].filter(Boolean).join(' ') || 'your aircraft';
      const companyName = detailer.company || detailer.name || 'Your detailer';

      // Build review request email
      const reviewUrl = detailer.google_review_url || `https://crm.shinyjets.com/feedback/${feedbackToken}`;
      const portalUrl = shareLink ? `https://crm.shinyjets.com/q/${shareLink}` : null;

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) continue;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: job.customer_email,
          from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
          reply_to: detailer.email,
          subject: `How did we do? - ${companyName}`,
          html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#333;">How did we do?</h2>
            <p>Hi ${job.customer_name || 'there'},</p>
            <p>It's been a week since <strong>${companyName}</strong> detailed ${aircraft}${job.tail_number ? ` (${job.tail_number})` : ''}. We'd love to hear how everything turned out.</p>
            <p style="margin:24px 0;">
              <a href="${reviewUrl}" style="background:#007CB1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Leave a Review</a>
            </p>
            <p style="color:#666;font-size:13px;">Your feedback helps other aircraft owners find quality detailing services and helps us improve.</p>
            ${portalUrl ? `<p style="margin-top:16px;"><a href="${portalUrl}" style="color:#007CB1;text-decoration:underline;font-size:13px;">View your job details</a></p>` : ''}
            <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
          </body></html>`,
        }),
      });

      // Mark as sent
      await supabase.from('jobs').update({
        review_request_sent: true,
        review_request_sent_at: now.toISOString(),
      }).eq('id', job.id);

      // Also update the quote if linked
      if (job.quote_id) {
        await supabase.from('quotes').update({
          feedback_token: feedbackToken,
          feedback_requested_at: now.toISOString(),
        }).eq('id', job.quote_id);
      }

      sent++;
    } catch (err) {
      console.error(`Review request error for job ${job.id}:`, err);
      failed++;
    }
  }

  return Response.json({ processed: sent + failed, sent, failed, jobs_checked: jobs?.length || 0 });
}
