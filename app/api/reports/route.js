import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const REVENUE_STATUSES = ['paid', 'approved', 'accepted', 'scheduled', 'in_progress', 'completed'];

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const reportType = searchParams.get('type') || 'all';

    // Column-stripping retry for quotes
    let selectCols = 'id, aircraft_type, aircraft_model, tail_number, total_price, status, created_at, paid_at, completed_at, scheduled_date, client_name, client_email, customer_company, line_items, selected_services, services, share_link';
    let quotes = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('quotes').select(selectCols).eq('detailer_id', user.id);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      query = query.order('created_at', { ascending: true });

      const { data, error } = await query;
      if (!error) { quotes = data; break; }

      const colMatch = error.message?.match(/column [\w.]+\"?(\w+)\"? does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column/)
        || error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) {
        selectCols = selectCols.split(',').map(c => c.trim()).filter(c => c !== colMatch[1]).join(', ');
        continue;
      }
      console.log('[reports] Query error:', error.message);
      break;
    }

    quotes = quotes || [];
    const paidQuotes = quotes.filter(q => REVENUE_STATUSES.includes(q.status));
    const allQuotes = quotes;

    // Detailer info for fee calculations
    const { data: detailer } = await supabase
      .from('detailers')
      .select('plan, pass_fee_to_customer')
      .eq('id', user.id)
      .single();

    const plan = detailer?.plan || 'free';
    const PLATFORM_FEES = { free: 0.05, pro: 0.02, business: 0.01, enterprise: 0.00 };
    const feeRate = PLATFORM_FEES[plan] || 0.05;

    const result = {};

    // REVENUE REPORT
    if (reportType === 'all' || reportType === 'revenue') {
      const revenueRows = paidQuotes.map(q => {
        const total = parseFloat(q.total_price) || 0;
        const fee = Math.round(total * feeRate * 100) / 100;
        const services = getServicesLabel(q);
        return {
          date: q.paid_at || q.completed_at || q.created_at,
          customer: q.customer_company || q.client_name || '',
          email: q.client_email || '',
          aircraft: q.aircraft_model || q.aircraft_type || '',
          tail_number: q.tail_number || '',
          services,
          subtotal: total,
          fees: fee,
          total: total - fee,
          status: q.status,
        };
      });

      const totalRevenue = paidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
      const totalFees = Math.round(totalRevenue * feeRate * 100) / 100;

      result.revenue = {
        rows: revenueRows,
        summary: {
          totalRevenue,
          totalFees,
          netRevenue: totalRevenue - totalFees,
          jobCount: paidQuotes.length,
          avgJobValue: paidQuotes.length > 0 ? totalRevenue / paidQuotes.length : 0,
        },
      };
    }

    // CUSTOMER REPORT
    if (reportType === 'all' || reportType === 'customers') {
      const customerMap = {};
      for (const q of allQuotes) {
        const key = (q.client_email || q.client_name || 'unknown').toLowerCase();
        if (!customerMap[key]) {
          customerMap[key] = {
            name: q.customer_company || q.client_name || 'Unknown',
            contact: q.client_name || '',
            email: q.client_email || '',
            totalValue: 0,
            quoteCount: 0,
            paidCount: 0,
            lastServiceDate: null,
            firstQuoteDate: q.created_at,
          };
        }
        const c = customerMap[key];
        c.quoteCount++;
        if (REVENUE_STATUSES.includes(q.status)) {
          c.totalValue += parseFloat(q.total_price) || 0;
          c.paidCount++;
          const serviceDate = q.completed_at || q.scheduled_date || q.paid_at;
          if (serviceDate && (!c.lastServiceDate || serviceDate > c.lastServiceDate)) {
            c.lastServiceDate = serviceDate;
          }
        }
        if (q.created_at < c.firstQuoteDate) c.firstQuoteDate = q.created_at;
      }

      const now = new Date();
      const customerRows = Object.values(customerMap).map(c => {
        let retention = 'New';
        if (c.paidCount >= 3) retention = 'Loyal';
        else if (c.paidCount >= 1) {
          const lastDate = c.lastServiceDate ? new Date(c.lastServiceDate) : null;
          if (lastDate && (now - lastDate) > 180 * 24 * 60 * 60 * 1000) retention = 'At Risk';
          else retention = 'Active';
        }
        return { ...c, retention };
      }).sort((a, b) => b.totalValue - a.totalValue);

      result.customers = {
        rows: customerRows,
        summary: {
          totalCustomers: customerRows.length,
          activeCustomers: customerRows.filter(c => c.retention === 'Active' || c.retention === 'Loyal').length,
          atRiskCustomers: customerRows.filter(c => c.retention === 'At Risk').length,
          avgLifetimeValue: customerRows.length > 0 ? customerRows.reduce((s, c) => s + c.totalValue, 0) / customerRows.length : 0,
        },
      };
    }

    // SERVICES REPORT
    if (reportType === 'all' || reportType === 'services') {
      const serviceMap = {};
      for (const q of paidQuotes) {
        const items = q.line_items || [];
        if (items.length > 0) {
          for (const item of items) {
            const name = item.description || item.service || 'Other';
            if (!serviceMap[name]) serviceMap[name] = { name, timesBooked: 0, totalHours: 0, totalRevenue: 0 };
            serviceMap[name].timesBooked++;
            serviceMap[name].totalHours += parseFloat(item.hours) || 0;
            serviceMap[name].totalRevenue += parseFloat(item.amount) || 0;
          }
        } else {
          const svcList = getServicesList(q);
          const total = parseFloat(q.total_price) || 0;
          const perService = svcList.length > 0 ? total / svcList.length : total;
          for (const name of (svcList.length > 0 ? svcList : ['General Detail'])) {
            if (!serviceMap[name]) serviceMap[name] = { name, timesBooked: 0, totalHours: 0, totalRevenue: 0 };
            serviceMap[name].timesBooked++;
            serviceMap[name].totalRevenue += perService;
          }
        }
      }

      const serviceRows = Object.values(serviceMap)
        .map(s => ({ ...s, avgTicket: s.timesBooked > 0 ? s.totalRevenue / s.timesBooked : 0 }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      result.services = {
        rows: serviceRows,
        summary: {
          totalServices: serviceRows.length,
          topService: serviceRows[0]?.name || 'N/A',
          totalBookings: serviceRows.reduce((s, r) => s + r.timesBooked, 0),
        },
      };
    }

    // TAX SUMMARY REPORT
    if (reportType === 'all' || reportType === 'tax') {
      const monthMap = {};
      for (const q of paidQuotes) {
        const date = new Date(q.paid_at || q.completed_at || q.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = { month: key, revenue: 0, fees: 0, net: 0, jobCount: 0 };
        const total = parseFloat(q.total_price) || 0;
        const fee = Math.round(total * feeRate * 100) / 100;
        monthMap[key].revenue += total;
        monthMap[key].fees += fee;
        monthMap[key].net += (total - fee);
        monthMap[key].jobCount++;
      }

      const taxRows = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
      const totalRevenue = taxRows.reduce((s, r) => s + r.revenue, 0);
      const totalFees = taxRows.reduce((s, r) => s + r.fees, 0);

      result.tax = {
        rows: taxRows,
        summary: {
          totalRevenue,
          totalFees,
          netRevenue: totalRevenue - totalFees,
          monthCount: taxRows.length,
        },
      };
    }

    // Legacy summary for backwards compatibility
    const totalRevenue = paidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
    result.summary = {
      totalRevenue,
      totalQuotes: allQuotes.length,
      totalPaid: paidQuotes.length,
      avgJobValue: paidQuotes.length > 0 ? totalRevenue / paidQuotes.length : 0,
      conversionRate: allQuotes.length > 0 ? (paidQuotes.length / allQuotes.length) * 100 : 0,
      pendingRevenue: allQuotes.filter(q => q.status === 'sent' || q.status === 'viewed').reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0),
    };

    return Response.json(result);
  } catch (err) {
    console.error('Reports API error:', err);
    return Response.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

function getServicesLabel(q) {
  if (q.line_items && Array.isArray(q.line_items) && q.line_items.length > 0) {
    return q.line_items.map(i => i.description || i.service).filter(Boolean).join(', ');
  }
  return getServicesList(q).join(', ') || '—';
}

function getServicesList(q) {
  if (q.services && typeof q.services === 'object' && !Array.isArray(q.services)) {
    return Object.entries(q.services).filter(([, v]) => v === true).map(([k]) => k);
  }
  if (q.selected_services && Array.isArray(q.selected_services)) {
    return q.selected_services.map(s => typeof s === 'string' ? s : s.name || s.service).filter(Boolean);
  }
  return [];
}
