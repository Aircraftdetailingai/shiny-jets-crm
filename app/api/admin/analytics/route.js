import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
];

const PLATFORM_FEES = {
  free: 0.05,
  pro: 0.02,
  business: 0.01,
  enterprise: 0.00,
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split('T')[0];
}

export async function GET(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    // Fetch quotes in range
    const { data: quotes } = await supabase
      .from('quotes')
      .select('created_at, status, total_price, aircraft_type, aircraft_model, airport, line_items, detailer_id, sent_at, paid_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true });

    // Fetch all detailers for tier info
    const { data: detailers } = await supabase
      .from('detailers')
      .select('id, plan, created_at');

    const allQuotes = quotes || [];
    const allDetailers = detailers || [];

    // Build detailer plan lookup
    const detailerPlan = {};
    for (const d of allDetailers) {
      detailerPlan[d.id] = d.plan || 'free';
    }

    // 1. Quote volume by week
    const weekCounts = {};
    for (const q of allQuotes) {
      const week = getWeekStart(q.created_at);
      weekCounts[week] = (weekCounts[week] || 0) + 1;
    }
    const quoteVolume = Object.entries(weekCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    // 2. Average quote value by aircraft type
    const aircraftValues = {};
    for (const q of allQuotes) {
      const type = q.aircraft_type || 'Unknown';
      if (!q.total_price) continue;
      if (!aircraftValues[type]) aircraftValues[type] = { sum: 0, count: 0 };
      aircraftValues[type].sum += parseFloat(q.total_price);
      aircraftValues[type].count += 1;
    }
    const avgByAircraft = Object.entries(aircraftValues)
      .map(([type, v]) => ({ type, avg: Math.round(v.sum / v.count), count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 3. Most common services
    const serviceCounts = {};
    for (const q of allQuotes) {
      if (Array.isArray(q.line_items)) {
        for (const item of q.line_items) {
          const name = item.service || item.description || item.name;
          if (name) {
            serviceCounts[name] = (serviceCounts[name] || 0) + 1;
          }
        }
      }
    }
    const topServices = Object.entries(serviceCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 4. Geographic distribution by airport
    const airportCounts = {};
    for (const q of allQuotes) {
      if (q.airport) {
        airportCounts[q.airport] = (airportCounts[q.airport] || 0) + 1;
      }
    }
    const geoDistribution = Object.entries(airportCounts)
      .map(([airport, count]) => ({ airport, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 5. Subscription tier breakdown
    const tierBreakdown = { free: 0, pro: 0, business: 0, enterprise: 0 };
    for (const d of allDetailers) {
      const plan = d.plan || 'free';
      tierBreakdown[plan] = (tierBreakdown[plan] || 0) + 1;
    }

    // 6. Platform revenue by week (fees from paid quotes)
    const revenueWeeks = {};
    for (const q of allQuotes) {
      if ((q.status === 'paid' || q.status === 'approved' || q.status === 'completed') && q.total_price) {
        const week = getWeekStart(q.paid_at || q.created_at);
        const plan = detailerPlan[q.detailer_id] || 'free';
        const fee = parseFloat(q.total_price) * (PLATFORM_FEES[plan] || 0.05);
        revenueWeeks[week] = (revenueWeeks[week] || 0) + fee;
      }
    }
    const revenueByWeek = Object.entries(revenueWeeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, revenue]) => ({ week, revenue: Math.round(revenue * 100) / 100 }));

    // 7. Aircraft type frequency
    const aircraftCounts = {};
    for (const q of allQuotes) {
      const type = q.aircraft_type || 'Unknown';
      aircraftCounts[type] = (aircraftCounts[type] || 0) + 1;
    }
    const aircraftFrequency = Object.entries(aircraftCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 8. Quote acceptance rate (status funnel)
    const statusCounts = { draft: 0, sent: 0, viewed: 0, accepted: 0, paid: 0, completed: 0, expired: 0 };
    for (const q of allQuotes) {
      const s = q.status || 'draft';
      if (statusCounts[s] !== undefined) {
        statusCounts[s] += 1;
      }
    }
    // Paid includes approved
    statusCounts.paid += allQuotes.filter(q => q.status === 'approved').length;

    // Summary metrics
    const totalQuotes = allQuotes.length;
    const totalValue = allQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
    const avgValue = totalQuotes > 0 ? Math.round(totalValue / totalQuotes) : 0;
    const sentCount = allQuotes.filter(q => ['sent', 'viewed', 'accepted', 'paid', 'approved', 'completed'].includes(q.status)).length;
    const convertedCount = allQuotes.filter(q => ['accepted', 'paid', 'approved', 'completed'].includes(q.status)).length;
    const acceptanceRate = sentCount > 0 ? Math.round((convertedCount / sentCount) * 100) : 0;
    const totalRevenue = revenueByWeek.reduce((sum, w) => sum + w.revenue, 0);

    // 9. Community hours intelligence
    let community = { totalContributions: 0, thisMonth: 0, pendingSuggestions: 0, defaultsUpdated: 0, topAircraft: [] };
    try {
      const { data: contribs } = await supabase
        .from('hours_contributions')
        .select('make, model, created_at');
      if (contribs) {
        community.totalContributions = contribs.length;
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        community.thisMonth = contribs.filter(c => new Date(c.created_at) >= monthStart).length;

        // Top contributed aircraft
        const acCounts = {};
        for (const c of contribs) {
          const key = `${c.make} ${c.model}`;
          acCounts[key] = (acCounts[key] || 0) + 1;
        }
        community.topAircraft = Object.entries(acCounts)
          .map(([aircraft, count]) => ({ aircraft, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      const { count: pendingCount } = await supabase
        .from('suggested_services')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      community.pendingSuggestions = pendingCount || 0;

      const { count: updatesCount } = await supabase
        .from('hours_update_log')
        .select('id', { count: 'exact', head: true });
      community.defaultsUpdated = updatesCount || 0;
    } catch (e) {
      console.error('Community stats error:', e);
    }

    // Count unique aircraft in contributions
    let uniqueAircraft = 0;
    try {
      const { data: uniqueData } = await supabase
        .from('hours_contributions')
        .select('make, model');
      if (uniqueData) {
        const uniq = new Set(uniqueData.map(d => `${d.make}::${d.model}`));
        uniqueAircraft = uniq.size;
      }
    } catch (e) {}
    community.uniqueAircraft = uniqueAircraft;

    return Response.json({
      summary: { totalQuotes, avgValue, acceptanceRate, totalRevenue: Math.round(totalRevenue * 100) / 100 },
      quoteVolume,
      avgByAircraft,
      topServices,
      geoDistribution,
      tierBreakdown,
      revenueByWeek,
      aircraftFrequency,
      acceptanceRate: statusCounts,
      community,
      days,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
