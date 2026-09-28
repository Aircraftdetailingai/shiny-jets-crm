import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { pinCustomerAircraft } from '@/lib/pin-customer-aircraft';
import { aircraftDisplayName, aircraftMakeModel } from '@/lib/aircraft-labels';
import { selectWithRetry } from '@/lib/select-with-retry';

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

async function loadCustomer(supabase, detailerId, customerId) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, detailer_id, name, email, phone, company_name, tail_numbers')
    .eq('id', customerId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Customer not found', status: 404 };
  if (data.detailer_id !== detailerId) return { error: 'Forbidden', status: 403 };
  return { customer: data };
}

// GET — list the customer's aircraft from customer_aircraft using the new
// customer_id FK (added by migration add_customer_id_to_customer_aircraft
// and backfilled across the network). customer_account_id is preserved on
// the table for portal-side queries; this endpoint reads via customer_id
// because the page URL :id is a customers.id, not a customer_accounts.id —
// and many customers (like Lance Ricotta) have no customer_accounts row
// at all, which is exactly why the prior email→account_id chain failed.
//
// Falls back to the legacy customers.tail_numbers JSON if customer_aircraft
// has no rows for this customer yet (e.g. a customer not covered by the
// backfill).
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  const { id } = await params;
  const supabase = getSupabase();
  const detailerId = await resolveDetailerId(supabase, user);

  const result = await loadCustomer(supabase, detailerId, id);
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers: NO_STORE });
  }

  const customer = result.customer;

  let aircraft = [];
  const { data: rows, error: acErr } = await supabase
    .from('customer_aircraft')
    .select('id, tail_number, manufacturer, model, year, nickname, engine_type, storage_type, storage_location, annual_due_date, last_service_date, notes, home_airport, created_at')
    .eq('detailer_id', detailerId)
    .eq('customer_id', id)
    .order('created_at', { ascending: false });
  if (acErr) {
    console.error('[customers/aircraft] customer_aircraft GET error:', acErr.message);
  } else {
    aircraft = (rows || []).map((r) => ({
      id: r.id,
      tail_number: r.tail_number,
      aircraft_model: aircraftMakeModel(r.manufacturer, r.model) || r.model || null,
      manufacturer: r.manufacturer || null,
      model: r.model || null,
      year: r.year || null,
      nickname: r.nickname || null,
      home_airport: r.home_airport || null,
      notes: r.notes || null,
      last_service_date: r.last_service_date || null,
      created_at: r.created_at || null,
    }));
  }

  // Fallback: legacy customers.tail_numbers JSON. Surfaces tails for
  // customers whose rows weren't covered by the backfill.
  if (aircraft.length === 0) {
    const legacy = Array.isArray(customer.tail_numbers) ? customer.tail_numbers : [];
    aircraft = legacy.map((l) => ({
      id: null,
      tail_number: normTail(l?.tail),
      aircraft_model: l?.model || null,
      manufacturer: null,
      model: l?.model || null,
    })).filter((a) => !!a.tail_number);
  }

  // Aircraft that only appear on this customer's quotes / jobs (e.g. a
  // quote for a Piper M500 with no saved tail) used to be invisible — the
  // tab said "Aircraft (0)". Merge them in, de-duped by tail (or by model
  // when there's no tail), and attach per-aircraft job/revenue rollups so
  // the page no longer has to guess from an unfiltered quotes list.
  const email = String(customer.email || '').trim();
  const [quotesRes, jobsRes] = email ? await Promise.all([
    selectWithRetry(supabase, 'quotes',
      'id, tail_number, aircraft_type, aircraft_model, total_price, status, created_at, scheduled_date, completed_at',
      (q) => q.eq('detailer_id', detailerId).ilike('client_email', email).order('created_at', { ascending: false }).limit(500),
      { label: 'customers/aircraft' }),
    selectWithRetry(supabase, 'jobs',
      'id, quote_id, tail_number, aircraft_make, aircraft_model, total_price, status, created_at, scheduled_date, completed_at',
      (q) => q.eq('detailer_id', detailerId).ilike('customer_email', email).order('created_at', { ascending: false }).limit(500),
      { label: 'customers/aircraft' }),
  ]) : [{ data: [] }, { data: [] }];

  const quoteIds = new Set((quotesRes.data || []).map((q) => q.id));
  const workRows = [
    ...(quotesRes.data || []).map((q) => ({ ...q, _kind: 'quote' })),
    ...(jobsRes.data || []).filter((j) => !j.quote_id || !quoteIds.has(j.quote_id)).map((j) => ({ ...j, _kind: 'job' })),
  ];

  const keyFor = (tail, model) => (tail ? `T:${normTail(tail)}` : (model ? `M:${String(model).toLowerCase().trim()}` : null));
  const byKey = new Map();
  for (const a of aircraft) {
    const k = keyFor(a.tail_number, a.aircraft_model);
    if (k && !byKey.has(k)) byKey.set(k, { ...a, jobs: 0, total_revenue: 0, last_service: null, source: a.id ? 'saved' : 'legacy' });
  }
  const DONE = new Set(['accepted', 'approved', 'deposit_paid', 'paid', 'scheduled', 'in_progress', 'completed', 'complete']);
  for (const w of workRows) {
    // Only a real model counts as an identity; a bare category ("Turboprop")
    // is not an aircraft.
    const label = aircraftDisplayName(w);
    const model = w.aircraft_model && label && label !== 'Aircraft' ? label : null;
    const k = keyFor(w.tail_number, model);
    if (!k) continue;
    if (!byKey.has(k)) {
      byKey.set(k, {
        id: null,
        tail_number: w.tail_number ? normTail(w.tail_number) : null,
        aircraft_model: model,
        manufacturer: null,
        model,
        jobs: 0,
        total_revenue: 0,
        last_service: null,
        source: w._kind === 'job' ? 'job' : 'quote',
      });
    }
    const entry = byKey.get(k);
    if (!entry.aircraft_model && model) entry.aircraft_model = model;
    const st = String(w.status || '').toLowerCase();
    if (DONE.has(st) || w._kind === 'job') {
      entry.jobs += 1;
      entry.total_revenue += parseFloat(w.total_price || 0) || 0;
      const d = w.completed_at || w.scheduled_date || w.created_at;
      if (d && (!entry.last_service || d > entry.last_service)) entry.last_service = d;
    }
    entry.quotes = (entry.quotes || 0) + (w._kind === 'quote' ? 1 : 0);
  }

  return new Response(JSON.stringify({ aircraft: [...byKey.values()] }), { status: 200, headers: NO_STORE });
}

// POST — append a new aircraft to the customer's tail_numbers array.
// Body: { model, tail }. Tail is uppercased + trimmed. De-dupes case-insensitive
// on tail — if the incoming tail already exists on the customer, the existing
// entry is left as-is and returned unchanged.
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: NO_STORE });
  }

  const model = String(body?.model ?? '').trim();
  const tail = normTail(body?.tail);
  if (!tail) {
    return new Response(JSON.stringify({ error: 'tail is required' }), { status: 400, headers: NO_STORE });
  }

  const supabase = getSupabase();
  const detailerId = await resolveDetailerId(supabase, user);

  const result = await loadCustomer(supabase, detailerId, id);
  if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers: NO_STORE });

  // Canonical write goes through pinCustomerAircraft → customer_accounts +
  // customer_aircraft. Keep the legacy customers.tail_numbers JSON in sync
  // so older code paths that still read from it (portal aircraft snippet,
  // some quote builders) keep working without a flag day.
  const customer = result.customer;
  const pin = await pinCustomerAircraft(supabase, {
    detailerId,
    customerEmail: customer.email,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerCompany: customer.company_name,
    tailNumber: tail,
    aircraftModel: model,
  });
  if (!pin.ok) {
    console.error('[customers/aircraft] POST pin failed:', pin.reason, 'customer=', id);
  }

  const existing = Array.isArray(customer.tail_numbers) ? customer.tail_numbers : [];
  const already = existing.find(a => normTail(a?.tail) === tail);
  let next = existing;
  if (!already) {
    next = [...existing, { model, tail, added_at: new Date().toISOString() }];
    const { error: updateErr } = await supabase
      .from('customers')
      .update({ tail_numbers: next })
      .eq('id', id);
    if (updateErr) {
      console.error('[customers/aircraft] POST tail_numbers update failed:', updateErr.message, 'customer=', id);
    }
  }

  return new Response(JSON.stringify({ aircraft: next, added: !already }), { status: 200, headers: NO_STORE });
}
