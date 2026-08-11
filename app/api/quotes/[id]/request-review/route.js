import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// Manually send a "How did we do?" review request for a completed quote/job.
// Fired by the dashboard Follow-ups "Send Review" button. Mirrors the 7-day
// cron in app/api/cron/review-requests so the on-demand and automatic emails
// look identical and both flow through lib/email (CAN-SPAM footer + unsubscribe
// headers applied).
export async function POST(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;
    const detailerId = user.detailer_id || user.id;

    const { data: quote, error } = await supabase
      .from('quotes')
      .select('id, detailer_id, client_name, client_email, aircraft_model, tail_number, share_link, feedback_token')
      .eq('id', id)
      .eq('detailer_id', detailerId)
      .maybeSingle();

    if (error || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (!quote.client_email) {
      return Response.json({ error: 'This customer has no email on file.' }, { status: 400 });
    }

    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, name, email, company, google_review_url')
      .eq('id', detailerId)
      .single();

    const feedbackToken = quote.feedback_token || crypto.randomBytes(16).toString('hex');
    const aircraft = quote.aircraft_model || 'your aircraft';
    const companyName = detailer?.company || detailer?.name || 'Your detailer';
    const reviewUrl = detailer?.google_review_url || `https://crm.shinyjets.com/feedback/${feedbackToken}`;
    const portalUrl = quote.share_link ? `https://crm.shinyjets.com/q/${quote.share_link}` : null;

    await sendEmail({
      to: quote.client_email,
      replyTo: detailer?.email,
      subject: `How did we do? - ${companyName}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#333;">How did we do?</h2>
          <p>Hi ${quote.client_name || 'there'},</p>
          <p>Thanks for choosing <strong>${companyName}</strong> to detail ${aircraft}${quote.tail_number ? ` (${quote.tail_number})` : ''}. We'd love to hear how everything turned out.</p>
          <p style="margin:24px 0;">
            <a href="${reviewUrl}" style="background:#007CB1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Leave a Review</a>
          </p>
          <p style="color:#666;font-size:13px;">Your feedback helps other aircraft owners find quality detailing services and helps us improve.</p>
          ${portalUrl ? `<p style="margin-top:16px;"><a href="${portalUrl}" style="color:#007CB1;text-decoration:underline;font-size:13px;">View your job details</a></p>` : ''}
          <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
        </body></html>`,
    });

    await supabase
      .from('quotes')
      .update({ feedback_token: feedbackToken, feedback_requested_at: new Date().toISOString() })
      .eq('id', id)
      .eq('detailer_id', detailerId);

    return Response.json({ success: true });
  } catch (err) {
    console.error('request-review error:', err);
    return Response.json({ error: 'Failed to send review request' }, { status: 500 });
  }
}
