import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Profitability statistics and service rankings
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const planGate = await requireFeature(request, 'reports', { user: user });
  if (planGate) return planGate;

  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '90'; // days

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));

  // Get all job completions for the period
  const { data: jobs, error } = await supabase
    .from('job_completions')
    .select('*')
    .eq('detailer_id', user.detailer_id || user.id)
    .gte('completed_at', startDate.toISOString());

  if (error) {
    console.error('Failed to fetch jobs:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch stats' }), { status: 500 });
  }

  // Overall stats
  const overall = {
    totalJobs: jobs.length,
    totalRevenue: jobs.reduce((sum, j) => sum + parseFloat(j.revenue || 0), 0),
    totalProfit: jobs.reduce((sum, j) => sum + parseFloat(j.profit || 0), 0),
    totalLaborCost: jobs.reduce((sum, j) => sum + parseFloat(j.labor_cost || 0), 0),
    totalProductCost: jobs.reduce((sum, j) => sum + parseFloat(j.product_cost || 0), 0),
    totalHours: jobs.reduce((sum, j) => sum + parseFloat(j.actual_hours || 0), 0),
    avgMargin: 0,
    avgRevenuePerJob: 0,
    avgProfitPerJob: 0,
    avgHoursPerJob: 0,
  };

  if (jobs.length > 0) {
    overall.avgMargin = jobs.reduce((sum, j) => sum + parseFloat(j.margin_percent || 0), 0) / jobs.length;
    overall.avgRevenuePerJob = overall.totalRevenue / jobs.length;
    overall.avgProfitPerJob = overall.totalProfit / jobs.length;
    overall.avgHoursPerJob = overall.totalHours / jobs.length;
  }

  // Service profitability analysis
  const serviceStats = {};

  jobs.forEach(job => {
    if (job.service_breakdown && Array.isArray(job.service_breakdown)) {
      job.service_breakdown.forEach(svc => {
        if (!serviceStats[svc.service_key]) {
          serviceStats[svc.service_key] = {
            service_key: svc.service_key,
            service_name: svc.service_name || svc.service_key,
            jobCount: 0,
            totalRevenue: 0,
            totalHoursEstimated: 0,
            totalHoursActual: 0,
            totalProfit: 0,
          };
        }
        serviceStats[svc.service_key].jobCount++;
        serviceStats[svc.service_key].totalRevenue += parseFloat(svc.revenue || 0);
        serviceStats[svc.service_key].totalHoursEstimated += parseFloat(svc.estimated_hours || 0);
        serviceStats[svc.service_key].totalHoursActual += parseFloat(svc.actual_hours || 0);
        serviceStats[svc.service_key].totalProfit += parseFloat(svc.profit || 0);
      });
    }
  });

  // Convert to array and calculate averages
  const serviceRankings = Object.values(serviceStats)
    .map(s => ({
      ...s,
      avgMargin: s.totalRevenue > 0 ? (s.totalProfit / s.totalRevenue * 100) : 0,
      avgProfitPerJob: s.jobCount > 0 ? s.totalProfit / s.jobCount : 0,
      hoursAccuracy: s.totalHoursEstimated > 0
        ? (s.totalHoursActual / s.totalHoursEstimated * 100)
        : 100,
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit); // Sort by total profit

  // Monthly trend (last 6 months)
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - i);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const monthJobs = jobs.filter(j => {
      const date = new Date(j.completed_at);
      return date >= monthStart && date < monthEnd;
    });

    monthlyTrend.push({
      month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      jobs: monthJobs.length,
      revenue: monthJobs.reduce((sum, j) => sum + parseFloat(j.revenue || 0), 0),
      profit: monthJobs.reduce((sum, j) => sum + parseFloat(j.profit || 0), 0),
      margin: monthJobs.length > 0
        ? monthJobs.reduce((sum, j) => sum + parseFloat(j.margin_percent || 0), 0) / monthJobs.length
        : 0,
    });
  }

  return new Response(JSON.stringify({
    overall,
    serviceRankings,
    monthlyTrend,
    period: parseInt(period),
  }), { status: 200 });
}
