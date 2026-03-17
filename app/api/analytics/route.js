import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '90', 10);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const supabase = getSupabase();

  // Debug: log what detailer_id we're querying with
  console.log('[analytics] user.id (detailer_id):', user.id, '| days:', days, '| since:', since);

  // Fetch quotes and customers in parallel
  const [quotesRes, customersRes] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, status, total_price, created_at, sent_at, viewed_at, accepted_at, paid_at, completed_at, scheduled_date, client_name, client_email, aircraft_model, aircraft_type, services')
      .eq('detailer_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabase
      .from('customers')
      .select('id, name, email, total_revenue, quote_count, last_service_date')
      .eq('detailer_id', user.id)
      .order('total_revenue', { ascending: false }),
  ]);

  if (quotesRes.error) console.error('[analytics] quotes query error:', quotesRes.error);
  if (customersRes.error) console.error('[analytics] customers query error:', customersRes.error);

  const allQuotes = quotesRes.data || [];
  const allCustomers = customersRes.data || [];

  console.log('[analytics] quotes found:', allQuotes.length, '| statuses:', allQuotes.map(q => q.status));

  // --- Conversion funnel ---
  const SENT_STATUSES = ['sent', 'viewed', 'accepted', 'approved', 'paid', 'scheduled', 'in_progress', 'completed'];
  const VIEWED_STATUSES = ['viewed', 'accepted', 'approved', 'paid', 'scheduled', 'in_progress', 'completed'];
  const PAID_STATUSES = ['paid', 'accepted', 'approved', 'scheduled', 'in_progress', 'completed'];
  const REVENUE_STATUSES = ['accepted', 'approved', 'paid', 'scheduled', 'in_progress', 'completed'];

  const totalCreated = allQuotes.length;
  const totalSent = allQuotes.filter(q => q.sent_at || SENT_STATUSES.includes(q.status)).length;
  const totalViewed = allQuotes.filter(q => q.viewed_at || VIEWED_STATUSES.includes(q.status)).length;
  const totalPaid = allQuotes.filter(q => q.accepted_at || PAID_STATUSES.includes(q.status)).length;
  const totalCompleted = allQuotes.filter(q => q.status === 'completed').length;

  // Total revenue from all accepted/paid/completed quotes
  const totalRevenue = allQuotes
    .filter(q => REVENUE_STATUSES.includes(q.status))
    .reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);

  // --- Conversion rate over time (weekly buckets) ---
  const weeklyData = {};
  for (const q of allQuotes) {
    const d = new Date(q.created_at);
    // Week start (Monday)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    const key = weekStart.toISOString().split('T')[0];
    if (!weeklyData[key]) weeklyData[key] = { week: key, created: 0, sent: 0, converted: 0, revenue: 0 };
    weeklyData[key].created++;
    if (q.sent_at || SENT_STATUSES.includes(q.status)) weeklyData[key].sent++;
    if (PAID_STATUSES.includes(q.status)) {
      weeklyData[key].converted++;
      weeklyData[key].revenue += parseFloat(q.total_price) || 0;
    }
  }
  const conversionTrend = Object.values(weeklyData)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(w => ({
      ...w,
      rate: w.sent > 0 ? Math.round((w.converted / w.sent) * 100) : 0,
    }));

  // --- Average job value trend (weekly) ---
  const valueTrend = conversionTrend.map(w => ({
    week: w.week,
    avgValue: w.converted > 0 ? Math.round(w.revenue / w.converted) : 0,
    jobs: w.converted,
  }));

  // --- Busiest days ---
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCount = [0, 0, 0, 0, 0, 0, 0];
  const paidQuotes = allQuotes.filter(q => REVENUE_STATUSES.includes(q.status));
  for (const q of paidQuotes) {
    const date = q.scheduled_date || q.accepted_at || q.created_at;
    if (date) {
      const d = new Date(date);
      dayCount[d.getDay()]++;
    }
  }
  const busiestDays = dayNames.map((name, i) => ({ day: name, jobs: dayCount[i] }));

  // --- Busiest hours (from scheduled_time or created_at) ---
  const hourCount = new Array(24).fill(0);
  for (const q of paidQuotes) {
    const d = new Date(q.accepted_at || q.created_at);
    hourCount[d.getHours()]++;
  }
  const busiestHours = hourCount.map((count, h) => ({
    hour: h,
    label: h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`,
    jobs: count,
  })).filter(h => h.jobs > 0);

  // --- Top services by revenue ---
  const serviceRevenue = {};
  for (const q of paidQuotes) {
    const services = q.services || [];
    const svcList = Array.isArray(services) ? services : (typeof services === 'string' ? (() => { try { return JSON.parse(services); } catch { return []; } })() : []);
    for (const svc of svcList) {
      const name = svc.name || svc.service_name || 'Unknown';
      if (!serviceRevenue[name]) serviceRevenue[name] = { name, revenue: 0, count: 0 };
      serviceRevenue[name].revenue += svc.price || svc.total || 0;
      serviceRevenue[name].count++;
    }
  }
  const topServices = Object.values(serviceRevenue)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // --- Customer retention ---
  // Group paid quotes by client email/name
  const customerJobs = {};
  for (const q of paidQuotes) {
    const key = q.client_email || q.client_name || 'unknown';
    if (!customerJobs[key]) customerJobs[key] = [];
    customerJobs[key].push(q);
  }
  const totalCustomers = Object.keys(customerJobs).length;
  const repeatCustomers = Object.values(customerJobs).filter(jobs => jobs.length > 1).length;
  const retentionRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

  // --- Monthly revenue trend ---
  const monthlyRevenue = {};
  for (const q of paidQuotes) {
    const d = new Date(q.accepted_at || q.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyRevenue[key]) monthlyRevenue[key] = { month: key, revenue: 0, jobs: 0 };
    monthlyRevenue[key].revenue += parseFloat(q.total_price) || 0;
    monthlyRevenue[key].jobs++;
  }
  const revenueTrend = Object.values(monthlyRevenue).sort((a, b) => a.month.localeCompare(b.month));

  // --- Daily revenue (last 30 days for Revenue Velocity widget) ---
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
  const dailyRevenueMap = {};
  let previousPeriodTotal = 0;
  for (const q of paidQuotes) {
    const paidDate = q.paid_at || q.accepted_at || q.created_at;
    const d = new Date(paidDate);
    const dateKey = d.toISOString().split('T')[0];
    const price = parseFloat(q.total_price) || 0;
    if (d >= thirtyDaysAgo) {
      if (!dailyRevenueMap[dateKey]) dailyRevenueMap[dateKey] = { date: dateKey, revenue: 0, count: 0 };
      dailyRevenueMap[dateKey].revenue += price;
      dailyRevenueMap[dateKey].count++;
    } else if (d >= sixtyDaysAgo) {
      previousPeriodTotal += price;
    }
  }
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().split('T')[0];
    if (!dailyRevenueMap[key]) dailyRevenueMap[key] = { date: key, revenue: 0, count: 0 };
  }
  const dailyRevenue = {
    current: Object.values(dailyRevenueMap).sort((a, b) => a.date.localeCompare(b.date)),
    previousPeriodTotal,
  };

  // --- Cash collected today ---
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
  let todayCash = 0, yesterdayCash = 0, last7Cash = 0;
  for (const q of paidQuotes) {
    const paidDate = q.paid_at || q.accepted_at || q.created_at;
    const dateKey = new Date(paidDate).toISOString().split('T')[0];
    const price = parseFloat(q.total_price) || 0;
    if (dateKey === todayStr) todayCash += price;
    if (dateKey === yesterdayStr) yesterdayCash += price;
    if ((now.getTime() - new Date(paidDate).getTime()) / 86400000 <= 7) last7Cash += price;
  }
  const cashCollectedToday = { today: todayCash, yesterday: yesterdayCash, sevenDayAvg: Math.round(last7Cash / 7) };

  // --- Leads to close rate ---
  const leadsToCloseRate = { sent: totalSent, closed: totalPaid, rate: totalSent > 0 ? Math.round((totalPaid / totalSent) * 100) : 0 };

  // --- Revenue by aircraft type ---
  const aircraftRevMap = {};
  for (const q of paidQuotes) {
    const type = q.aircraft_type || q.aircraft_model || 'Other';
    if (!aircraftRevMap[type]) aircraftRevMap[type] = { type, revenue: 0, count: 0 };
    aircraftRevMap[type].revenue += parseFloat(q.total_price) || 0;
    aircraftRevMap[type].count++;
  }
  const revenueByAircraftType = Object.values(aircraftRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // --- Daily job heatmap (day of week × week of year) ---
  const heatmapData = {};
  for (const q of paidQuotes) {
    const date = q.scheduled_date || q.paid_at || q.accepted_at || q.created_at;
    const d = new Date(date);
    const day = d.getDay();
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const week = Math.floor((d.getTime() - startOfYear.getTime()) / (7 * 86400000));
    const key = `${day}-${week}`;
    if (!heatmapData[key]) heatmapData[key] = { day, week, count: 0 };
    heatmapData[key].count++;
  }
  const dailyJobHeatmap = Object.values(heatmapData);

  // --- Customer LTV (top 10) ---
  const customerLTV = allCustomers
    .filter(c => (c.total_revenue || 0) > 0)
    .slice(0, 10)
    .map(c => ({ name: c.name || c.email || 'Unknown', email: c.email, total_revenue: c.total_revenue || 0, quote_count: c.quote_count || 0, last_service_date: c.last_service_date }));

  // --- Churn risk ---
  const churnRisk = allCustomers
    .filter(c => c.last_service_date)
    .map(c => {
      const daysSince = Math.floor((now.getTime() - new Date(c.last_service_date).getTime()) / 86400000);
      const riskLevel = daysSince >= 120 ? 'critical' : daysSince >= 90 ? 'danger' : daysSince >= 60 ? 'warning' : null;
      return riskLevel ? { name: c.name || c.email || 'Unknown', email: c.email, lastServiceDate: c.last_service_date, daysSinceService: daysSince, riskLevel } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSinceService - a.daysSinceService)
    .slice(0, 20);

  return Response.json({
    funnel: { totalCreated, totalSent, totalViewed, totalPaid, totalCompleted, totalRevenue },
    conversionTrend,
    valueTrend,
    busiestDays,
    busiestHours,
    topServices,
    retention: { totalCustomers, repeatCustomers, retentionRate },
    revenueTrend,
    period: days,
    dailyRevenue,
    cashCollectedToday,
    leadsToCloseRate,
    revenueByAircraftType,
    dailyJobHeatmap,
    customerLTV,
    churnRisk,
  });
}
