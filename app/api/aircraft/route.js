import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { aircraftMakeModel, isAircraftCategory } from '@/lib/aircraft-labels';

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

  // One entry per tail. The same tail can have several customer_aircraft
  // rows (a portal-side row keyed on customer_account_id plus a CRM-side
  // row keyed on customer_id, or older rows whose manufacturer column holds
  // the quote's category slug such as "large_jet"). Showing every row
  // listed N60LD under both "GULFSTREAM G4" and "LARGE_JET GULFSTREAM G4".
  // Rows are merged here for display only; nothing is deleted.
  const byTail = new Map();
  const rank = (r) => (r.customer_id ? 2 : 0) + (r.manufacturer && !isAircraftCategory(r.manufacturer) ? 1 : 0);
  for (const r of aircraftRows) {
    const key = normTail(r.tail_number) || `id:${r.id}`;
    const prev = byTail.get(key);
    if (!prev) { byTail.set(key, { primary: r, rows: [r] }); continue; }
    prev.rows.push(r);
    if (rank(r) > rank(prev.primary)) prev.primary = r;
  }

  const aircraft = [...byTail.values()].map(({ primary, rows: group }) => {
    const pick = (field, ok = (v) => !!v) => {
      if (ok(primary[field])) return primary[field];
      const other = group.find((g) => ok(g[field]));
      return other ? other[field] : null;
    };
    const manufacturer = pick('manufacturer', (v) => !!v && !isAircraftCategory(v));
    const model = pick('model');
    const customerRow = group.find((g) => g.customer_id) || primary;
    const tail = normTail(primary.tail_number) || primary.tail_number;
    const roll = rollupByTail[normTail(tail)] || { job_count: 0, total_revenue: 0, last_service: null };
    const lastSvcDate = group.map((g) => g.last_service_date).filter(Boolean).sort().pop() || null;
    return {
      id: primary.id,
      tail_number: tail,
      aircraft_model: aircraftMakeModel(manufacturer, model) || null,
      manufacturer: manufacturer || null,
      model: model || null,
      customer_id: customerRow.customer_id || null,
      customer_name: customerRow.customer_id ? (nameById[customerRow.customer_id] || null) : null,
      home_airport: pick('home_airport'),
      job_count: roll.job_count,
      total_revenue: roll.total_revenue,
      last_service: roll.last_service || lastSvcDate,
      duplicate_rows: group.length > 1 ? group.length : undefined,
    };
  });

  return new Response(JSON.stringify({ aircraft }), { status: 200, headers: NO_STORE });
}
