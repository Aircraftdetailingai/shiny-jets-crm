import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

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

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // Fetch all quotes for the detailer within date range
    let query = supabase
      .from('quotes')
      .select('id, aircraft_type, aircraft_model, total_price, status, created_at, paid_at, completed_at, client_name, client_email, line_items, selected_services')
      .eq('detailer_id', user.id);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    query = query.order('created_at', { ascending: true });

    const { data: quotes, error } = await query;

    if (error) {
      console.error('Reports fetch error:', error);
      return Response.json({ error: 'Failed to fetch report data' }, { status: 500 });
    }

    const allQuotes = quotes || [];
    const paidQuotes = allQuotes.filter(q => q.status === 'paid' || q.status === 'completed');
    const pendingQuotes = allQuotes.filter(q => q.status === 'sent' || q.status === 'viewed');

    // 1. Revenue summary
    const totalRevenue = paidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
    const totalQuotes = allQuotes.length;
    const totalPaid = paidQuotes.length;
    const avgJobValue = paidQuotes.length > 0 ? totalRevenue / paidQuotes.length : 0;
    const conversionRate = totalQuotes > 0 ? (totalPaid / totalQuotes) * 100 : 0;
    const pendingRevenue = pendingQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);

    // 2. Revenue by month (time series)
    const revenueByMonth = {};
    for (const q of paidQuotes) {
      const date = new Date(q.paid_at || q.completed_at || q.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth[key] = (revenueByMonth[key] || 0) + (parseFloat(q.total_price) || 0);
    }
    const revenueTimeline = Object.entries(revenueByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));

    // 3. Jobs by service type
    const serviceTypeCounts = {};
    for (const q of paidQuotes) {
      const items = q.line_items || [];
      if (items.length > 0) {
        for (const item of items) {
          const name = item.description || item.service || 'Other';
          serviceTypeCounts[name] = (serviceTypeCounts[name] || 0) + 1;
        }
      } else {
        // Fallback to aircraft type as service proxy
        const type = q.aircraft_type || 'Unknown';
        serviceTypeCounts[type] = (serviceTypeCounts[type] || 0) + 1;
      }
    }
    const jobsByService = Object.entries(serviceTypeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 4. Revenue by aircraft type
    const aircraftRevenue = {};
    for (const q of paidQuotes) {
      const type = q.aircraft_model || q.aircraft_type || 'Unknown';
      if (!aircraftRevenue[type]) aircraftRevenue[type] = { revenue: 0, count: 0 };
      aircraftRevenue[type].revenue += parseFloat(q.total_price) || 0;
      aircraftRevenue[type].count += 1;
    }
    const revenueByAircraft = Object.entries(aircraftRevenue)
      .map(([name, data]) => ({ name, revenue: data.revenue, count: data.count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // 5. Customer acquisition over time
    const customerFirstSeen = {};
    for (const q of allQuotes) {
      const email = q.client_email || '';
      if (!email) continue;
      const date = new Date(q.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!customerFirstSeen[email] || key < customerFirstSeen[email]) {
        customerFirstSeen[email] = key;
      }
    }
    const acquisitionByMonth = {};
    for (const month of Object.values(customerFirstSeen)) {
      acquisitionByMonth[month] = (acquisitionByMonth[month] || 0) + 1;
    }
    const customerAcquisition = Object.entries(acquisitionByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // 6. All quotes for CSV export
    const exportData = allQuotes.map(q => ({
      date: q.created_at,
      customer: q.client_name || '' || '',
      email: q.client_email || '' || '',
      aircraft: q.aircraft_model || q.aircraft_type || '',
      status: q.status,
      amount: parseFloat(q.total_price) || 0,
      paid_at: q.paid_at || '',
    }));

    return Response.json({
      summary: {
        totalRevenue,
        totalQuotes,
        totalPaid,
        avgJobValue,
        conversionRate,
        pendingRevenue,
      },
      revenueTimeline,
      jobsByService,
      revenueByAircraft,
      customerAcquisition,
      exportData,
    });

  } catch (err) {
    console.error('Reports API error:', err);
    return Response.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
