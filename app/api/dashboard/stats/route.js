import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { aircraftDisplayName } from '@/lib/aircraft-labels';
import { selectWithRetry } from '@/lib/select-with-retry';
import { isCollected, collectedAt, isDone, amountOf, startOfMonthIso } from '@/lib/revenue';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

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

    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('total_points, lifetime_points, tips_enabled')
      .eq('id', user.id)
      .single();

    // Time ranges
    const now = new Date();
    // "This month" in the owner's time zone (dashboard passes ?tz=…).
    const tz = new URL(request.url).searchParams.get('tz');
    const startOfMonth = startOfMonthIso(tz, now);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const nowISO = now.toISOString();

    // Fetch all data in parallel for speed
    const [weekQuotesRes, weekPointsRes, monthQuotesRes, allQuotesRes, pendingRes, todayJobsRes, recentActivityRes, feedbackRes, expiringRes, expiredRes] = await Promise.all([
      // This week's quotes
      supabase
        .from('quotes')
        .select('id, total_price, status')
        .eq('detailer_id', user.detailer_id || user.id)
        .gte('created_at', weekAgo),

      // This week's points
      supabase
        .from('points_history')
        .select('points')
        .eq('detailer_id', user.detailer_id || user.id)
        .gte('created_at', weekAgo),

      // This month's quotes (from start of month)
      supabase
        .from('quotes')
        .select('id, total_price, status')
        .eq('detailer_id', user.detailer_id || user.id)
        .gte('created_at', startOfMonth),

      // All time stats. accepted_at is a soft column — if it's missing on
      // this deployment the old plain select errored and every revenue
      // figure silently became $0.
      selectWithRetry(supabase, 'quotes', 'id, total_price, status, created_at, paid_at, accepted_at, completed_at, scheduled_date', (q) => q
        .eq('detailer_id', user.detailer_id || user.id), { label: 'dashboard' }),

      // Pending quotes (sent but not accepted/paid)
      supabase
        .from('quotes')
        .select('id, total_price')
        .eq('detailer_id', user.detailer_id || user.id)
        .in('status', ['sent', 'viewed']),

      // Today's scheduled jobs
      supabase
        .from('quotes')
        .select('id')
        .eq('detailer_id', user.detailer_id || user.id)
        .gte('scheduled_date', todayStart)
        .lt('scheduled_date', todayEnd)
        .in('status', ['paid', 'scheduled', 'in_progress']),

      // Recent activity (last 5 quotes updated)
      supabase
        .from('quotes')
        .select('id, aircraft_model, aircraft_type, client_name, total_price, status, created_at, accepted_at, paid_at, completed_at, sent_at, viewed_at')
        .eq('detailer_id', user.detailer_id || user.id)
        .order('created_at', { ascending: false })
        .limit(10),

      // Average feedback rating
      supabase
        .from('feedback')
        .select('rating')
        .eq('detailer_id', user.detailer_id || user.id),

      // Quotes expiring within 24h
      supabase
        .from('quotes')
        .select('id, client_name, aircraft_model, aircraft_type, total_price, valid_until, status, share_link')
        .eq('detailer_id', user.detailer_id || user.id)
        .gte('valid_until', nowISO)
        .lte('valid_until', in24h)
        .in('status', ['sent', 'viewed']),

      // Recently expired quotes (last 7 days)
      supabase
        .from('quotes')
        .select('id, client_name, aircraft_model, aircraft_type, total_price, valid_until, status, share_link')
        .eq('detailer_id', user.detailer_id || user.id)
        .eq('status', 'expired')
        .gte('valid_until', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('valid_until', { ascending: false })
        .limit(10),
    ]);

    const weekQuotes = weekQuotesRes.data || [];
    const weekPoints = weekPointsRes.data || [];
    const monthQuotes = monthQuotesRes.data || [];
    const allQuotes = allQuotesRes.data || [];

    // Manually created jobs (jobs table). Rows spawned from a quote are
    // skipped so a job is never counted twice.
    const { data: manualJobRows } = await selectWithRetry(supabase, 'jobs', 'id, quote_id, total_price, status, created_at, completed_at, paid_at, scheduled_date', (q) => q
      .eq('detailer_id', user.detailer_id || user.id), { label: 'dashboard' });
    const quoteIdSet = new Set(allQuotes.map((q) => q.id));
    const manualJobs = (manualJobRows || []).filter((j) => !j.quote_id || !quoteIdSet.has(j.quote_id));
    const pendingQuotes = pendingRes.data || [];
    const todayJobs = todayJobsRes.data || [];
    const feedbackData = feedbackRes.data || [];
    const expiringQuotes = expiringRes.data || [];
    const recentlyExpired = expiredRes.data || [];

    // Recent activity - retry without accepted_at if column doesn't exist
    let recentQuotesRaw = recentActivityRes.data || [];
    if (recentActivityRes.error && !recentActivityRes.data) {
      console.log('[dashboard] recent activity query failed, retrying without accepted_at:', recentActivityRes.error.message);
      const retryRes = await supabase
        .from('quotes')
        .select('id, aircraft_model, aircraft_type, client_name, total_price, status, created_at, paid_at, completed_at, sent_at, viewed_at')
        .eq('detailer_id', user.detailer_id || user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      recentQuotesRaw = retryRes.data || [];
    }

    // Calculate stats — include all revenue-generating statuses
    const REVENUE_STATUSES = ['accepted', 'approved', 'paid', 'scheduled', 'in_progress', 'completed', 'deposit_paid'];
    const isRevenue = (q) => REVENUE_STATUSES.includes(q.status);
    const weekPaidQuotes = weekQuotes.filter(isRevenue);
    // Month revenue: prefer conversion timestamp (paid/accepted/completed) falling
    // in this calendar month — not merely quotes *created* this month (which left
    // live businesses at $0 when older quotes converted later).
    const monthPaidQuotes = allQuotes.filter(q => {
      if (!isRevenue(q)) return false;
      const ts = q.paid_at || q.completed_at || q.accepted_at || q.created_at;
      return ts && ts >= startOfMonth;
    });
    // Collected revenue this month = paid or completed work (quotes + manual
    // jobs), dated by payment / completion. Same definition the Jobs page
    // uses for its "Collected" figure (lib/revenue.js).
    const inMonth = (ts) => !!ts && new Date(ts).getTime() >= new Date(startOfMonth).getTime();
    const monthCollectedRows = [...allQuotes, ...manualJobs].filter((r) => isCollected(r) && inMonth(collectedAt(r)));
    const monthCollected = monthCollectedRows.reduce((sum, r) => sum + amountOf(r), 0);
    const monthCompletedQuotes = [...allQuotes, ...manualJobs].filter(q => {
      if (!isDone(q)) return false;
      const ts = q.completed_at || q.paid_at || q.scheduled_date || q.created_at;
      return inMonth(ts);
    });
    const allPaidQuotes = allQuotes.filter(isRevenue);

    const weekBooked = weekPaidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
    const monthBooked = monthPaidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
    const allTimeBooked = allPaidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);

    const weekPointsTotal = weekPoints.reduce((sum, p) => sum + (p.points || 0), 0);

    // Calculate average job value
    const avgJobValue = allPaidQuotes.length > 0
      ? allTimeBooked / allPaidQuotes.length
      : 0;

    // Outstanding: prefer real invoices (sent/viewed/overdue), fall back to unpaid quotes
    let outstandingInvoicesCount = pendingQuotes.length;
    let outstandingTotal = pendingQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
    try {
      const { data: invRows } = await supabase
        .from('invoices')
        .select('id, status, total, balance_due, job_id, quote_id')
        .eq('detailer_id', user.detailer_id || user.id)
        .not('status', 'eq', 'draft')
        .not('status', 'eq', 'paid');
      if (invRows && invRows.length > 0) {
        // Deduplicate by job/quote like /api/invoices
        const best = {};
        const noJob = [];
        for (const inv of invRows) {
          const key = inv.job_id || inv.quote_id;
          if (!key) { noJob.push(inv); continue; }
          if (!best[key]) best[key] = inv;
        }
        const deduped = [...Object.values(best), ...noJob];
        outstandingInvoicesCount = deduped.length;
        outstandingTotal = deduped.reduce((sum, i) => sum + parseFloat(i.balance_due || i.total || 0), 0);
      }
    } catch (e) {
      console.log('[dashboard] invoices outstanding fallback:', e?.message || e);
    }

    // Average feedback rating
    const avgRating = feedbackData.length > 0
      ? feedbackData.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackData.length
      : null;
    const totalReviews = feedbackData.length;

    // Build recent activity feed from quote events
    const recentActivity = [];
    for (const q of recentQuotesRaw) {
      const name = q.client_name || 'Customer';
      const aircraft = aircraftDisplayName(q);
      const price = parseFloat(q.total_price) || 0;

      if (q.completed_at) {
        recentActivity.push({ type: 'completed', name, aircraft, price, date: q.completed_at });
      } else if (q.paid_at) {
        recentActivity.push({ type: 'paid', name, aircraft, price, date: q.paid_at });
      } else if (q.accepted_at) {
        recentActivity.push({ type: 'accepted', name, aircraft, price, date: q.accepted_at });
      } else if (q.viewed_at) {
        recentActivity.push({ type: 'viewed', name, aircraft, price, date: q.viewed_at });
      } else if (q.sent_at) {
        recentActivity.push({ type: 'sent', name, aircraft, price, date: q.sent_at });
      } else {
        recentActivity.push({ type: 'created', name, aircraft, price, date: q.created_at });
      }
    }
    // Sort by date descending and take 5
    recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));
    const activityFeed = recentActivity.slice(0, 5);

    // Get today's tip
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const tips = [
      { id: 1, title: 'Review Your Pricing Quarterly', category: 'pricing' },
      { id: 2, title: 'Track Your Product Usage', category: 'efficiency' },
      { id: 3, title: 'Before & After Photos', category: 'marketing' },
      { id: 4, title: 'Follow Up After Every Job', category: 'customer_service' },
      { id: 5, title: 'Build Your Product Inventory', category: 'operations' },
    ];
    const todaysTip = tips[dayOfYear % tips.length];

    return Response.json({
      // Quick stats format (for dashboard quick stats bar)
      // monthRevenue = collected (paid + completed) this month.
      // monthBooked = accepted/scheduled pipeline converted this month.
      monthRevenue: monthCollected,
      monthCollected,
      monthBooked,
      monthStart: startOfMonth,
      weekRevenue: weekBooked,
      monthJobs: monthCompletedQuotes.length,
      pendingQuotes: pendingQuotes.length,
      avgJobValue: avgJobValue,
      todayScheduledJobs: todayJobs.length,
      outstandingInvoices: outstandingInvoicesCount,
      outstandingTotal: outstandingTotal,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      totalReviews: totalReviews,
      activityFeed: activityFeed,

      // Legacy format (for backwards compatibility)
      points: {
        total: detailer?.total_points || 0,
        lifetime: detailer?.lifetime_points || 0,
        thisWeek: weekPointsTotal,
      },
      thisWeek: {
        jobs: weekPaidQuotes.length,
        booked: weekBooked,
        quotes: weekQuotes.length,
        points: weekPointsTotal,
      },
      thisMonth: {
        jobs: monthPaidQuotes.length,
        booked: monthBooked,
        quotes: monthQuotes.length,
      },
      allTime: {
        jobs: allPaidQuotes.length,
        booked: allTimeBooked,
        bookedCount: allPaidQuotes.length,
        quotes: allQuotes.length,
      },
      tipsEnabled: detailer?.tips_enabled,
      todaysTip: detailer?.tips_enabled ? todaysTip : null,

      // Expiration data
      expiringQuotes,
      recentlyExpired,
      expiringCount: expiringQuotes.length,
      recentlyExpiredCount: recentlyExpired.length,
    });

  } catch (err) {
    console.error('Dashboard stats error:', err);
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
