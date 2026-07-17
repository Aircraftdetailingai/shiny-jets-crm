import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const NO_STORE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };

function normTail(s) {
  return String(s ?? '').toUpperCase().trim();
}

// GET — detailer-scoped fleet index. Every customer_aircraft row for the
// authenticated detailer, joined with the owning customer's name/id, plus
// cheap per-tail rollups (jobs / revenue / last service) aggregated from the
// detailer's quotes. Auth + scoping mirror /api/customers/[id]/aircraft.
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  const supabase = getSupabase();
  const detailerId = await resolveDetailerId(supabase, user);

  const { data: rows, error: acErr } = await supabase
    .from('customer_aircraft')
    .select('id, tail_number, manufacturer, model, customer_id, last_service_date, home_airport, created_at')
    .eq('detailer_id', detailerId)
    .order('created_at', { ascending: false });

  if (acErr) {
    console.error('[api/aircraft] customer_aircraft GET error:', acErr.message);
    return new Response(JSON.stringify({ error: acErr.message }), { status: 500, headers: NO_STORE });
  }

  const aircraftRows = rows || [];

  // One lookup for customer names, scoped to this detailer.
  const customerIds = [...new Set(aircraftRows.map((r) => r.customer_id).filter(Boolean))];
  const nameById = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('detailer_id', detailerId)
      .in('id', customerIds);
    (customers || []).forEach((c) => { nameById[c.id] = c.name; });
  }

  // One scan over the detailer's quotes → per-tail rollups, aggregated in
  // memory by normalized tail. Same single-query shape the dashboards use.
  const rollupByTail = {};
  const { data: quotes } = await supabase
    .from('quotes')
    .select('tail_number, total_price, status, completed_at, scheduled_date')
    .eq('detailer_id', detailerId)
    .not('tail_number', 'is', null);
  (quotes || []).forEach((q) => {
    const t = normTail(q.tail_number);
    if (!t) return;
    const r = rollupByTail[t] || { job_count: 0, total_revenue: 0, last_service: null };
    r.job_count += 1;
    r.total_revenue += parseFloat(q.total_price) || 0;
    if (q.status === 'completed') {
      const svc = q.completed_at || q.scheduled_date;
      if (svc && (!r.last_service || new Date(svc) > new Date(r.last_service))) r.last_service = svc;
    }
    rollupByTail[t] = r;
  });

  const aircraft = aircraftRows.map((r) => {
    const roll = rollupByTail[normTail(r.tail_number)] || { job_count: 0, total_revenue: 0, last_service: null };
    return {
      id: r.id,
      tail_number: r.tail_number,
      aircraft_model: [r.manufacturer, r.model].filter(Boolean).join(' ') || r.model || null,
      manufacturer: r.manufacturer || null,
      model: r.model || null,
      customer_id: r.customer_id || null,
      customer_name: r.customer_id ? (nameById[r.customer_id] || null) : null,
      home_airport: r.home_airport || null,
      job_count: roll.job_count,
      total_revenue: roll.total_revenue,
      last_service: roll.last_service || r.last_service_date || null,
    };
  });

  return new Response(JSON.stringify({ aircraft }), { status: 200, headers: NO_STORE });
}
