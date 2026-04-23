import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// Normalize a tail to its canonical form for comparison: uppercase + trim.
// The stored form on customers.tail_numbers mirrors this for new rows; older
// rows may still have mixed-case values, so comparisons always normalize both
// sides.
function normTail(s) {
  return String(s ?? '').toUpperCase().trim();
}

async function loadCustomer(supabase, detailerId, customerId) {
  // Explicit select — never pull password_hash, stripe_*, ach_*, or
  // webauthn_challenge (none live on customers today but keep the
  // allowlist discipline).
  const { data, error } = await supabase
    .from('customers')
    .select('id, detailer_id, name, tail_numbers')
    .eq('id', customerId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Customer not found', status: 404 };
  if (data.detailer_id !== detailerId) return { error: 'Forbidden', status: 403 };
  return { customer: data };
}

// GET — list the customer's saved aircraft.
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const detailerId = user.detailer_id || user.id;
  const supabase = getSupabase();

  const result = await loadCustomer(supabase, detailerId, id);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  const aircraft = Array.isArray(result.customer.tail_numbers) ? result.customer.tail_numbers : [];
  return Response.json({ aircraft });
}

// POST — append a new aircraft to the customer's tail_numbers array.
// Body: { model, tail }. Tail is uppercased + trimmed. De-dupes case-insensitive
// on tail — if the incoming tail already exists on the customer, the existing
// entry is left as-is and returned unchanged.
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const detailerId = user.detailer_id || user.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const model = String(body?.model ?? '').trim();
  const tail = normTail(body?.tail);
  if (!tail) {
    return Response.json({ error: 'tail is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const result = await loadCustomer(supabase, detailerId, id);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  const existing = Array.isArray(result.customer.tail_numbers) ? result.customer.tail_numbers : [];
  const already = existing.find(a => normTail(a?.tail) === tail);
  if (already) {
    return Response.json({ aircraft: existing, added: false });
  }

  const next = [...existing, { model, tail, added_at: new Date().toISOString() }];
  const { error: updateErr } = await supabase
    .from('customers')
    .update({ tail_numbers: next })
    .eq('id', id);
  if (updateErr) {
    console.error('[customers/aircraft] POST update failed:', updateErr.message, 'customer=', id);
    return Response.json({ error: 'Failed to save aircraft' }, { status: 500 });
  }

  return Response.json({ aircraft: next, added: true });
}
