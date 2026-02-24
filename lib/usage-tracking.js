import { createClient } from '@supabase/supabase-js';
import { PLATFORM_FEES, calculateUpgradeSavings, getNextTier, TIERS } from './pricing-tiers';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// Get usage stats for a detailer
export async function getUsageStats(detailerId) {
  const supabase = getSupabase();

  // Get current month boundaries
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get detailer info including quota columns
  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan, stripe_account_id, quotes_this_month, quote_reset_date')
    .eq('id', detailerId)
    .single();

  const tier = detailer?.plan || 'free';

  // Use detailers.quotes_this_month with auto-reset logic
  let quotesThisMonth = detailer?.quotes_this_month || 0;
  const resetDate = detailer?.quote_reset_date ? new Date(detailer.quote_reset_date) : null;

  // Auto-reset if quote_reset_date is before this month
  if (!resetDate || resetDate < startOfMonth) {
    quotesThisMonth = 0;
    await supabase
      .from('detailers')
      .update({ quotes_this_month: 0, quote_reset_date: startOfMonth.toISOString().slice(0, 10) })
      .eq('id', detailerId);
  }

  // Get revenue this month (from completed jobs)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('revenue, platform_fee')
    .eq('detailer_id', detailerId)
    .gte('completed_at', startOfMonth.toISOString())
    .lte('completed_at', endOfMonth.toISOString());

  const revenueThisMonth = jobs?.reduce((sum, job) => sum + (job.revenue || 0), 0) || 0;
  const feesThisMonth = jobs?.reduce((sum, job) => sum + (job.platform_fee || 0), 0) || 0;

  // Get historical data (last 6 months)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const { data: historicalJobs } = await supabase
    .from('jobs')
    .select('revenue, platform_fee, completed_at')
    .eq('detailer_id', detailerId)
    .gte('completed_at', sixMonthsAgo.toISOString());

  // Calculate monthly averages
  const monthlyRevenues = {};
  historicalJobs?.forEach(job => {
    const month = new Date(job.completed_at).toISOString().slice(0, 7);
    monthlyRevenues[month] = (monthlyRevenues[month] || 0) + (job.revenue || 0);
  });

  const revenues = Object.values(monthlyRevenues);
  const avgMonthlyRevenue = revenues.length > 0
    ? revenues.reduce((a, b) => a + b, 0) / revenues.length
    : revenueThisMonth;

  const tierConfig = TIERS[tier];
  const quotesRemaining = tierConfig.quotesPerMonth === Infinity
    ? Infinity
    : Math.max(0, tierConfig.quotesPerMonth - (quotesThisMonth || 0));

  return {
    tier,
    quotesThisMonth: quotesThisMonth || 0,
    quotesLimit: tierConfig.quotesPerMonth,
    quotesRemaining,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
    feesThisMonth: Math.round(feesThisMonth * 100) / 100,
    feeRate: PLATFORM_FEES[tier],
    avgMonthlyRevenue: Math.round(avgMonthlyRevenue * 100) / 100,
    stripeConnected: !!detailer?.stripe_account_id,
  };
}

// Get upgrade analysis with AI-style recommendations
export async function getUpgradeAnalysis(detailerId) {
  const stats = await getUsageStats(detailerId);
  const nextTier = getNextTier(stats.tier);

  if (!nextTier) {
    return {
      currentTier: stats.tier,
      recommendation: null,
      message: "You're on our highest tier. You're getting the best rates!",
      stats,
    };
  }

  const savings = calculateUpgradeSavings(
    stats.tier,
    nextTier,
    stats.avgMonthlyRevenue
  );

  const nextTierConfig = TIERS[nextTier];

  // Determine recommendation strength
  let recommendation = 'none';
  let message = '';
  let urgency = 'low';

  // Check if at or near quote limit
  const quotesUsedPercent = stats.quotesLimit === Infinity
    ? 0
    : (stats.quotesThisMonth / stats.quotesLimit) * 100;

  if (quotesUsedPercent >= 100) {
    recommendation = 'strong';
    urgency = 'high';
    message = `You've hit your ${stats.quotesLimit} quote limit! Upgrade to ${nextTierConfig.name} to keep sending quotes.`;
  } else if (quotesUsedPercent >= 80) {
    recommendation = 'strong';
    urgency = 'medium';
    message = `You've used ${stats.quotesThisMonth} of ${stats.quotesLimit} quotes. Upgrade soon to avoid hitting your limit.`;
  } else if (savings.netMonthlySavings > 0) {
    recommendation = 'strong';
    urgency = 'medium';
    message = `Based on your revenue, upgrading to ${nextTierConfig.name} would save you $${savings.netMonthlySavings.toFixed(2)}/month in fees!`;
  } else if (stats.avgMonthlyRevenue > savings.breakevenRevenue * 0.7) {
    recommendation = 'moderate';
    urgency = 'low';
    message = `You're approaching the revenue level where ${nextTierConfig.name} pays for itself. Consider upgrading soon.`;
  } else {
    recommendation = 'none';
    message = `Your current ${TIERS[stats.tier].name} plan is the best value for your usage.`;
  }

  return {
    currentTier: stats.tier,
    nextTier,
    recommendation,
    urgency,
    message,
    savings: {
      ...savings,
      nextTierPrice: nextTierConfig.price,
      nextTierName: nextTierConfig.name,
    },
    stats,
    quotesUsedPercent: Math.round(quotesUsedPercent),
  };
}

// Record platform fee for a job
export async function recordPlatformFee(jobId, detailerId, revenue) {
  const supabase = getSupabase();

  // Get detailer's tier
  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', detailerId)
    .single();

  const tier = detailer?.plan || 'free';
  const feeRate = PLATFORM_FEES[tier];
  const platformFee = Math.round(revenue * feeRate * 100) / 100;

  // Update job with platform fee
  await supabase
    .from('jobs')
    .update({
      platform_fee: platformFee,
      platform_fee_rate: feeRate,
    })
    .eq('id', jobId);

  return { platformFee, feeRate };
}

// Increment quote count (call when quote is created)
export async function incrementQuoteCount(detailerId) {
  const supabase = getSupabase();

  // Get current month key
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Upsert usage record
  const { data, error } = await supabase
    .from('usage_tracking')
    .upsert({
      detailer_id: detailerId,
      month: monthKey,
      quotes_created: 1,
    }, {
      onConflict: 'detailer_id,month',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error && error.code === '23505') {
    // Duplicate - increment instead
    await supabase.rpc('increment_quote_count', {
      p_detailer_id: detailerId,
      p_month: monthKey,
    });
  }

  // Also increment detailers.quotes_this_month
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const { data: detailer } = await supabase
    .from('detailers')
    .select('quotes_this_month, quote_reset_date')
    .eq('id', detailerId)
    .single();

  let currentCount = detailer?.quotes_this_month || 0;
  const resetDate = detailer?.quote_reset_date ? new Date(detailer.quote_reset_date) : null;
  if (!resetDate || resetDate < firstOfMonth) {
    currentCount = 0;
  }

  await supabase
    .from('detailers')
    .update({
      quotes_this_month: currentCount + 1,
      quote_reset_date: firstOfMonth.toISOString().slice(0, 10),
    })
    .eq('id', detailerId);

  return data;
}
