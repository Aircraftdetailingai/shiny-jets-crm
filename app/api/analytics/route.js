import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { selectWithRetry } from '@/lib/select-with-retry';
import { isCollected } from '@/lib/revenue';
import { aircraftDisplayName, humanizeAircraftCategory } from '@/lib/aircraft-labels';

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
  const planGate = await requireFeature(request, 'reports', { user: user });
  if (planGate) return planGate;

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '90', 10);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const supabase = getSupabase();

  // Owner JWTs put detailer.id in user.id; crew JWTs put it in
  // user.detailer_id. Resolve once so analytics queries land on the right
  // detailer regardless of session shape.
  const detailerId = await resolveDetailerId(supabase, user);
  // Debug: log resolved detailer_id (the user.id was logged before, which
  // surfaced 500s when crew JWTs fell into this route).
  console.log('[analytics] detailerId:', detailerId, '| user.id:', user.id, '| role:', user.role || 'owner', '| days:', days, '| since:', since);

  // Quotes in the period. selectWithRetry strips soft columns that don't
  // exist on this deployment (the old inline regex never matched
  // PostgREST's "column quotes.x does not exist" message, so one missing
  // column zeroed the whole dashboard).
  const quoteCols = 'id, status, total_price, created_at, sent_at, viewed_at, accepted_at, paid_at, completed_at, scheduled_date, client_name, client_email, customer_company, aircraft_model, aircraft_type, line_items';
  const [periodRes, allTimeRes, customersRes, manualJobsRes] = await Promise.all([
    selectWithRetry(supabase, 'quotes', quoteCols, (q) => q
      .eq('detailer_id', detailerId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }), { label: 'analytics' }),
    // All-time quotes (no date filter) for LTV / churn. Filtered in memory
    // with the shared revenue definitions instead of a status list that
    // drifted from the real lifecycle (deposit_paid was missing).
    selectWithRetry(supabase, 'quotes', 'id, status, total_price, client_email, client_name, customer_company, paid_at, accepted_at, completed_at, scheduled_date, created_at', (q) => q
      .eq('detailer_id', detailerId), { label: 'analytics' }),
    selectWithRetry(supabase, 'customers', 'id, name, email, company_name', (q) => q
      .eq('detailer_id', detailerId), { label: 'analytics' }),
    // Manually created jobs (jobs table) are real work too. Rows linked to
    // a quote are skipped below so nothing is double counted.
    selectWithRetry(supabase, 'jobs', 'id, quote_id, customer_name, customer_email, aircraft_make, aircraft_model, services, total_price, status, scheduled_date, created_at, completed_at, paid_at', (q) => q
      .eq('detailer_id', detailerId), { label: 'analytics' }),
  ]);

  const allQuotes = periodRes.data;
  const allCustomers = customersRes.data;
  const quoteIds = new Set(allTimeRes.data.map((q) => q.id));
  const manualJobs = manualJobsRes.data
    .filter((j) => !j.quote_id || !quoteIds.has(j.quote_id))
    .map((j) => ({
      id: j.id,
      status: j.status === 'complete' ? 'completed' : (j.status || 'scheduled'),
      total_price: j.total_price,
      client_name: j.customer_name,
      client_email: j.customer_email,
      aircraft_model: j.aircraft_model,
      aircraft_type: j.aircraft_make,
      created_at: j.created_at,
      completed_at: j.completed_at,
      paid_at: j.paid_at,
      scheduled_date: j.scheduled_date,
      _services: (() => {
        if (Array.isArray(j.services)) return j.services;
        if (typeof j.services === 'string') { try { const v = JSON.parse(j.services); return Array.isArray(v) ? v : []; } catch { return []; } }
        return [];
      })(),
      _source: 'jobs_table',
    }));
  const periodManualJobs = manualJobs.filter((j) => (j.created_at || '') >= since || (j.completed_at || '') >= since);

  console.log('[analytics] quotes in period:', allQuotes.length, '| all-time quotes:', allTimeRes.data.length, '| manual jobs:', manualJobs.length, '| customers:', allCustomers.length);

  // --- Conversion funnel ---
  // "Accepted" = the customer said yes (accepted/approved/deposit/paid/
  // scheduled/in progress/completed) or accepted_at/paid_at is stamped.
  const SENT_STATUSES = ['sent', 'viewed', 'accepted', 'approved', 'deposit_paid', 'paid', 'scheduled', 'in_progress', 'completed'];
  const VIEWED_STATUSES = ['viewed', 'accepted', 'approved', 'deposit_paid', 'paid', 'scheduled', 'in_progress', 'completed'];
  const ACCEPTED_STATUSES = ['accepted', 'approved', 'deposit_paid', 'paid', 'scheduled', 'in_progress', 'completed'];
  const isAccepted = (q) => !!(q.accepted_at || q.paid_at) || ACCEPTED_STATUSES.includes(q.status);

  const totalCreated = allQuotes.length;
  const totalSent = allQuotes.filter(q => q.sent_at || SENT_STATUSES.includes(q.status) || isAccepted(q)).length;
  const totalViewed = allQuotes.filter(q => q.viewed_at || VIEWED_STATUSES.includes(q.status) || isAccepted(q)).length;
  const totalPaid = allQuotes.filter(isAccepted).length;
  const totalCompleted = allQuotes.filter(q => q.status === 'completed').length;

  // Booked revenue in the period: accepted-or-later quotes plus manual jobs.
  const totalRevenue = allQuotes
    .filter(isAccepted)
    .reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0)
    + periodManualJobs.filter((j) => j.status !== 'cancelled').reduce((sum, j) => sum + (parseFloat(j.total_price) || 0), 0);
  const collectedRevenue = [...allQuotes, ...periodManualJobs].filter(isCollected).reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);

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
    if (isAccepted(q)) {
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
  const paidQuotes = [
    ...allQuotes.filter(isAccepted),
    ...periodManualJobs.filter((j) => j.status !== 'cancelled'),
  ];
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
  // quotes.services is a settings object ({exterior: true, …}), not a list,
  // so the old code never found any services. The priced lines live in
  // quotes.line_items ({ description, amount }) and in jobs.services
  // ({ name, price }) for manually created jobs.
  const serviceRevenue = {};
  const addService = (rawName, amount) => {
    const name = String(rawName || '').replace(/\s*\(min applied\)\s*$/i, '').trim();
    if (!name) return;
    if (!serviceRevenue[name]) serviceRevenue[name] = { name, revenue: 0, count: 0 };
    serviceRevenue[name].revenue += parseFloat(amount) || 0;
    serviceRevenue[name].count++;
  };
  for (const q of paidQuotes) {
    if (q._source === 'jobs_table') {
      for (const svc of q._services || []) {
        if (typeof svc === 'string') addService(svc, 0);
        else addService(svc?.name || svc?.service_name || svc?.description, svc?.price ?? svc?.total ?? svc?.amount);
      }
      continue;
    }
    const items = Array.isArray(q.line_items) ? q.line_items
      : (typeof q.line_items === 'string' ? (() => { try { return JSON.parse(q.line_items); } catch { return []; } })() : []);
    for (const li of items || []) {
      addService(li?.description || li?.service || li?.name, li?.amount ?? li?.price ?? li?.total);
    }
  }
  for (const svc of Object.values(serviceRevenue)) svc.revenue = Math.round(svc.revenue * 100) / 100;
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
    const type = humanizeAircraftCategory(q.aircraft_type) || aircraftDisplayName(q) || 'Other';
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

  // --- Customer LTV (top 10) — computed from paid quotes ---
  const ltvByCustomer = {};
  const allTimePaidQuotes = [
    ...allTimeRes.data.filter((q) => isAccepted(q)),
    ...manualJobs.filter((j) => j.status !== 'cancelled'),
  ];
  for (const q of allTimePaidQuotes) {
    const key = (q.client_email || '').toLowerCase().trim() || (q.client_name || '').toLowerCase().trim() || 'unknown';
    if (!ltvByCustomer[key]) ltvByCustomer[key] = { name: q.client_name || q.customer_company || q.client_email || 'Unknown', email: q.client_email, total_revenue: 0, quote_count: 0, last_service_date: null };
    ltvByCustomer[key].total_revenue += parseFloat(q.total_price) || 0;
    ltvByCustomer[key].quote_count++;
    const qDate = q.completed_at || q.paid_at || q.accepted_at || q.created_at;
    if (qDate && (!ltvByCustomer[key].last_service_date || qDate > ltvByCustomer[key].last_service_date)) {
      ltvByCustomer[key].last_service_date = qDate;
    }
  }
  const customerLTV = Object.values(ltvByCustomer)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);

  // --- Churn risk — computed from paid quotes ---
  const churnRisk = Object.values(ltvByCustomer)
    .filter(c => c.last_service_date)
    .map(c => {
      const daysSince = Math.floor((now.getTime() - new Date(c.last_service_date).getTime()) / 86400000);
      const riskLevel = daysSince >= 120 ? 'critical' : daysSince >= 90 ? 'danger' : daysSince >= 60 ? 'warning' : null;
      return riskLevel ? { name: c.name, email: c.email, lastServiceDate: c.last_service_date, daysSinceService: daysSince, riskLevel } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSinceService - a.daysSinceService)
    .slice(0, 20);

  // --- Staffing alerts (unresolved) ---
  const { data: staffingAlerts, error: staffingAlertsErr } = await supabase
    .from('staffing_alerts')
    .select('id, quote_id, scheduled_date, alert_type, created_at, quotes(client_name, aircraft_model, aircraft_type, total_price, assigned_team_member_ids)')
    .eq('detailer_id', detailerId)
    .eq('resolved', false)
    .order('scheduled_date', { ascending: true });
  if (staffingAlertsErr) console.error('[analytics] staffing_alerts query failed:', staffingAlertsErr.message);

  return Response.json({
    funnel: { totalCreated, totalSent, totalViewed, totalPaid, totalCompleted, totalRevenue, collectedRevenue },
    customerCount: allCustomers.length,
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
    staffingAlerts: staffingAlerts || [],
  });
}
