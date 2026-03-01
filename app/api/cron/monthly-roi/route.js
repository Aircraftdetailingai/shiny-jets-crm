import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// This cron runs on the 1st of each month
export async function GET(request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get all detailers with ROI emails enabled
    const { data: detailers } = await supabase
      .from('detailers')
      .select('id, email, company, roi_email_enabled, default_labor_rate')
      .eq('roi_email_enabled', true);

    if (!detailers || detailers.length === 0) {
      return Response.json({ message: 'No detailers to email', sent: 0 });
    }

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const monthName = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let emailsSent = 0;
    const errors = [];

    for (const detailer of detailers) {
      try {
        // Get last month's quotes
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, status, total_price, creation_seconds, sent_at')
          .eq('detailer_id', detailer.id)
          .gte('created_at', lastMonth.toISOString())
          .lte('created_at', lastMonthEnd.toISOString());

        // Get last month's recommendations
        const { data: recs } = await supabase
          .from('smart_recommendations')
          .select('id')
          .eq('detailer_id', detailer.id)
          .eq('acted_on', true)
          .gte('acted_on_at', lastMonth.toISOString())
          .lte('acted_on_at', lastMonthEnd.toISOString());

        // Get last month's points
        const { data: points } = await supabase
          .from('points_history')
          .select('points')
          .eq('detailer_id', detailer.id)
          .gte('created_at', lastMonth.toISOString())
          .lte('created_at', lastMonthEnd.toISOString());

        // Get baseline for time calculations
        const { data: baseline } = await supabase
          .from('detailer_baselines')
          .select('quote_creation_time_minutes')
          .eq('detailer_id', detailer.id)
          .single();

        // Calculate metrics
        const quotesArr = quotes || [];
        const quotesSent = quotesArr.filter(q => q.sent_at).length;
        const jobsBooked = quotesArr
          .filter(q => ['paid', 'completed'].includes(q.status))
          .reduce((sum, q) => sum + (q.total_price || 0), 0);

        const quotesWithTime = quotesArr.filter(q => q.creation_seconds);
        const avgQuoteTime = quotesWithTime.length > 0
          ? quotesWithTime.reduce((sum, q) => sum + q.creation_seconds, 0) / quotesWithTime.length / 60
          : 3;

        const baselineQuoteTime = baseline?.quote_creation_time_minutes || 15;
        const timeSavedPerQuote = Math.max(0, baselineQuoteTime - avgQuoteTime);
        const timeSavedHours = Math.round((quotesArr.length * timeSavedPerQuote) / 60 * 10) / 10;

        const tipsActedOn = (recs || []).length;
        const pointsEarned = (points || []).reduce((sum, p) => sum + p.points, 0);

        // Calculate estimated extra revenue (simplified)
        const hourlyRate = detailer.default_labor_rate || 75;
        const extraRevenue = Math.round(timeSavedHours * hourlyRate + (tipsActedOn * 200));

        // Only send if there's activity
        if (quotesSent === 0 && pointsEarned === 0) {
          continue;
        }

        // Build email content
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #0f172a; margin-bottom: 5px;">Your Vector Month in Review</h1>
    <p style="color: #6b7280; margin: 0;">${monthName}</p>
  </div>

  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px;">
    <h2 style="margin: 0 0 20px 0; color: #92400e; font-size: 18px;">Monthly Highlights</h2>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
      <div style="background: white; border-radius: 8px; padding: 15px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 12px;">Quotes Sent</p>
        <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: #0f172a;">${quotesSent}</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 15px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 12px;">Jobs Booked</p>
        <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: #0f172a;">$${jobsBooked.toLocaleString()}</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 15px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 12px;">Time Saved</p>
        <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: #0f172a;">${timeSavedHours}h</p>
      </div>
      <div style="background: white; border-radius: 8px; padding: 15px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 12px;">Points Earned</p>
        <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: #f59e0b;">${pointsEarned.toLocaleString()}</p>
      </div>
    </div>
  </div>

  <div style="background: #ecfdf5; border-radius: 12px; padding: 20px; margin-bottom: 25px; text-align: center;">
    <p style="margin: 0; color: #065f46; font-size: 14px;">Smart Tips Acted On</p>
    <p style="margin: 5px 0; font-size: 32px; font-weight: bold; color: #047857;">${tipsActedOn}</p>
    <p style="margin: 0; color: #065f46; font-size: 14px;">
      Estimated Extra Revenue: <strong>$${extraRevenue.toLocaleString()}</strong>
    </p>
  </div>

  <div style="text-align: center; margin-top: 30px;">
    <a href="https://app.aircraftdetailing.ai/roi" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
      View Full ROI Dashboard
    </a>
  </div>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
    <p>You're receiving this because you have monthly ROI emails enabled.</p>
    <p><a href="https://app.aircraftdetailing.ai/settings" style="color: #6b7280;">Manage email preferences</a></p>
  </div>
</body>
</html>
        `;

        await getResend().emails.send({
          from: 'Vector <noreply@aircraftdetailing.ai>',
          to: detailer.email,
          subject: `Your Vector Month in Review - ${monthName}`,
          html: emailHtml,
        });

        // Update last ROI email sent
        await supabase
          .from('detailers')
          .update({ last_roi_email_sent: new Date().toISOString() })
          .eq('id', detailer.id);

        emailsSent++;

      } catch (detailerError) {
        errors.push({ detailerId: detailer.id, error: detailerError.message });
      }
    }

    return Response.json({
      success: true,
      emailsSent,
      totalDetailers: detailers.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (err) {
    console.error('Monthly ROI cron error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
