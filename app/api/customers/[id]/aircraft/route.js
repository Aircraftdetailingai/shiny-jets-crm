import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { pinCustomerAircraft } from '@/lib/pin-customer-aircraft';

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

// GET — list the customer's aircraft from customer_aircraft (the canonical
// portal table) via the email → customer_accounts.id chain. Falls back to
// the older customers.tail_numbers JSON column for customers whose portal
// account wasn't created yet.
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
  const email = (customer.email || '').toLowerCase().trim();

  // Try to resolve a portal account row for this email so we can read the
  // canonical customer_aircraft list. If no portal account exists yet,
  // there's no row to fetch — return the legacy tail_numbers JSON shape.
  let aircraft = [];
  if (email) {
    const { data: account } = await supabase
      .from('customer_accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (account?.id) {
      const { data: rows, error: acErr } = await supabase
        .from('customer_aircraft')
        .select('id, tail_number, manufacturer, model, year, nickname, engine_type, storage_type, storage_location, annual_due_date, last_service_date, notes, home_airport, created_at')
        .eq('customer_account_id', account.id)
        .order('created_at', { ascending: true });
      if (acErr) {
        console.error('[customers/aircraft] customer_aircraft GET error:', acErr.message);
      } else {
        aircraft = (rows || []).map((r) => ({
          id: r.id,
          tail_number: r.tail_number,
          aircraft_model: [r.manufacturer, r.model].filter(Boolean).join(' ') || r.model || null,
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
    }
  }

  // Fallback: legacy customers.tail_numbers JSON. If a customer was created
  // pre-portal and has no customer_accounts row, surface what we know.
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

  return new Response(JSON.stringify({ aircraft }), { status: 200, headers: NO_STORE });
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
