import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Calculate and return ROI metrics
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'year'; // year, month, all_time

    // Get baseline data
    const { data: baseline } = await supabase
      .from('detailer_baselines')
      .select('*')
      .eq('detailer_id', user.id)
      .single();

    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('created_at, default_labor_rate')
      .eq('id', user.id)
      .single();

    // Calculate date range
    const now = new Date();
    let startDate;
    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      startDate = new Date(detailer?.created_at || '2020-01-01');
    }

    // Get all quotes in period
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, status, total_price, created_at, sent_at, paid_at, creation_seconds')
      .eq('detailer_id', user.id)
      .gte('created_at', startDate.toISOString());

    // Get change orders (upsells)
    const { data: changeOrders } = await supabase
      .from('change_orders')
      .select('id, amount, status, created_at')
      .eq('detailer_id', user.id)
      .eq('status', 'approved')
      .gte('created_at', startDate.toISOString());

    // Get recommendations acted on
    const { data: recommendations } = await supabase
      .from('smart_recommendations')
      .select('id, type, data, acted_on_at')
      .eq('detailer_id', user.id)
      .eq('acted_on', true)
      .gte('acted_on_at', startDate.toISOString());

    // Get job completion logs (for recovered costs)
    const { data: completionLogs } = await supabase
      .from('job_completion_logs')
      .select('wait_time_minutes, repositioning_needed')
      .eq('detailer_id', user.id)
      .gte('created_at', startDate.toISOString());

    // Calculate metrics
    const quotesArr = quotes || [];
    const quotesCreated = quotesArr.length;
    const quotesSent = quotesArr.filter(q => q.sent_at).length;
    const quotesPaid = quotesArr.filter(q => ['paid', 'completed'].includes(q.status)).length;
    const totalRevenue = quotesArr
      .filter(q => ['paid', 'completed'].includes(q.status))
      .reduce((sum, q) => sum + (q.total_price || 0), 0);

    // Quote creation time
    const quotesWithTime = quotesArr.filter(q => q.creation_seconds);
    const avgQuoteCreationSeconds = quotesWithTime.length > 0
      ? Math.round(quotesWithTime.reduce((sum, q) => sum + q.creation_seconds, 0) / quotesWithTime.length)
      : null;

    // Conversion rate
    const conversionRate = quotesSent > 0
      ? Math.round((quotesPaid / quotesSent) * 100)
      : 0;

    // Upsells from change orders
    const changeOrdersArr = changeOrders || [];
    const upsellsCount = changeOrdersArr.length;
    const upsellsRevenue = changeOrdersArr.reduce((sum, co) => sum + (co.amount || 0), 0);

    // Calculate time saved
    const baselineQuoteTime = baseline?.quote_creation_time_minutes || 15; // default 15 min
    const vectorQuoteTime = avgQuoteCreationSeconds ? avgQuoteCreationSeconds / 60 : 3; // default 3 min
    const timeSavedPerQuote = Math.max(0, baselineQuoteTime - vectorQuoteTime);
    const totalTimeSavedHours = (quotesCreated * timeSavedPerQuote) / 60;

    // Calculate recovered costs from wait time fees and repositioning
    const logsArr = completionLogs || [];
    const totalWaitMinutes = logsArr.reduce((sum, l) => sum + (l.wait_time_minutes || 0), 0);
    const repositioningCount = logsArr.filter(l => l.repositioning_needed).length;
    const hourlyRate = detailer?.default_labor_rate || 75;
    const waitFeesRecovered = (totalWaitMinutes / 60) * hourlyRate;
    const repositioningFeesRecovered = repositioningCount * 75; // $75 per repositioning

    // Calculate rate increase revenue from recommendations
    const rateIncreaseRecs = (recommendations || []).filter(r => r.type === 'rate_increase');
    const rateIncreasesRevenue = rateIncreaseRecs.length * 500; // Estimate $500 per acted rate increase

    // Calculate total ROI
    const timeSavedValue = totalTimeSavedHours * hourlyRate;
    const extraRevenue = upsellsRevenue + rateIncreasesRevenue;
    const recoveredCosts = waitFeesRecovered + repositioningFeesRecovered;
    const totalValue = timeSavedValue + extraRevenue + recoveredCosts;

    // Subscription cost (estimate $79/month = $948/year)
    const monthsActive = Math.max(1, Math.ceil((now - new Date(detailer?.created_at || now)) / (1000 * 60 * 60 * 24 * 30)));
    const subscriptionCost = period === 'month' ? 79 : (period === 'year' ? Math.min(monthsActive, 12) * 79 : monthsActive * 79);

    const roi = subscriptionCost > 0 ? Math.round(totalValue / subscriptionCost) : 0;

    // Check for milestone achievements
    const milestones = [];
    if (totalRevenue >= 100000) milestones.push('first_100k');
    else if (totalRevenue >= 50000) milestones.push('first_50k');
    else if (totalRevenue >= 25000) milestones.push('first_25k');
    else if (totalRevenue >= 10000) milestones.push('first_10k');

    if (totalTimeSavedHours >= 100) milestones.push('time_saved_100h');

    // Check one year anniversary
    const daysSinceSignup = Math.floor((now - new Date(detailer?.created_at || now)) / (1000 * 60 * 60 * 24));
    if (daysSinceSignup >= 365) milestones.push('one_year');

    return Response.json({
      metrics: {
        period,
        startDate: startDate.toISOString(),
        quotesCreated,
        quotesSent,
        quotesPaid,
        totalRevenue,
        avgQuoteCreationSeconds,
        avgQuoteCreationMinutes: avgQuoteCreationSeconds ? (avgQuoteCreationSeconds / 60).toFixed(1) : null,
        conversionRate,
        upsellsCount,
        upsellsRevenue,
        timeSavedHours: Math.round(totalTimeSavedHours * 10) / 10,
        timeSavedValue: Math.round(timeSavedValue),
        waitFeesRecovered: Math.round(waitFeesRecovered),
        repositioningFeesRecovered: Math.round(repositioningFeesRecovered),
        rateIncreasesRevenue: Math.round(rateIncreasesRevenue),
        extraRevenue: Math.round(extraRevenue),
        recoveredCosts: Math.round(recoveredCosts),
        totalValue: Math.round(totalValue),
        subscriptionCost,
        roi,
        roiMultiple: `${roi}x`,
      },
      baseline,
      milestones,
      daysSinceSignup,
    });

  } catch (err) {
    console.error('ROI metrics error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
