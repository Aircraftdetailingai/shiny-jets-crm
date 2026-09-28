import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { upsertCustomerAircraft } from '@/lib/upsertCustomerAircraft';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  // Resolve detailer_id: for crew tokens, use detailer_id field; for detailer tokens, use id
  const detailerId = user.detailer_id || user.id;

  const body = await request.json();
  const {
    customer_id, customer_name, customer_email,
    aircraft_make, aircraft_model, tail_number, airport,
    services, scheduled_date, scheduled_time,
    schedule_override,
    assigned_crew, payment_method, total_price, notes,
  } = body;

  console.log('[jobs/create] detailer_id:', detailerId, 'user.id:', user.id, 'role:', user.role, 'received:', { customer_name, aircraft_make, aircraft_model, payment_method, total_price });

  if (!customer_name || !aircraft_make) {
    return Response.json({ error: 'Customer name and aircraft required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const isPaid = payment_method && payment_method !== 'unpaid';

  // Create job
  const jobData = {
    detailer_id: detailerId,
    customer_id: customer_id || null,
    customer_name: customer_name || '',
    customer_email: customer_email || null,
    tail_number: tail_number || null,
    aircraft_make: aircraft_make || null,
    aircraft_model: aircraft_model || null,
    airport: airport || null,
    services: services ? JSON.stringify(services) : null,
    scheduled_date: scheduled_date || null,
    scheduled_time: scheduled_time || null,
    schedule_override: !!schedule_override,
    customer_phone: body.customer_phone || null,
    payment_method: payment_method || null,
    total_price: parseFloat(total_price) || 0,
    status: isPaid ? 'scheduled' : 'scheduled',
    completion_notes: notes || null,
  };

  let job = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error: jobErr } = await supabase.from('jobs').insert(jobData).select().single();
    if (!jobErr) { job = data; break; }

    const colMatch = jobErr.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      console.log(`[jobs/create] Stripping column: ${colMatch[1]}`);
      delete jobData[colMatch[1]];
      continue;
    }
    console.error('[jobs/create] Insert error:', jobErr.message, 'code:', jobErr.code, 'detailer_id:', user.id);
    return Response.json({ error: jobErr.message }, { status: 500 });
  }

  if (!job) {
    return Response.json({ error: 'Failed to create job after retries' }, { status: 500 });
  }
  console.log('[jobs/create] Created job:', job.id);

  // Assign crew members
  if (assigned_crew?.length > 0 && job) {
    for (const crewId of assigned_crew) {
      try {
        await supabase.from('job_assignments').insert({
          job_id: job.id,
          team_member_id: crewId,
          detailer_id: detailerId,
        });
      } catch {}
    }
  }

  // Auto-pin to customer_aircraft (CRM-side, via customer_id). Direct job
  // creates land here; jobs spawned from an invoice are pinned by the
  // invoice route already, so we don't need to double up on that path.
  // Prefer customer_id when the client sent it; fall back to email lookup.
  if (job?.tail_number) {
    try {
      let resolvedCustomerId = customer_id || null;
      if (!resolvedCustomerId && customer_email) {
        const { data: customerRow } = await supabase
          .from('customers')
          .select('id')
          .eq('detailer_id', detailerId)
          .ilike('email', customer_email)
          .maybeSingle();
        if (customerRow?.id) resolvedCustomerId = customerRow.id;
      }
      if (resolvedCustomerId) {
        await upsertCustomerAircraft(supabase, {
          detailer_id: detailerId,
          customer_id: resolvedCustomerId,
          tail_number: job.tail_number,
          model: job.aircraft_model,
          manufacturer: job.aircraft_make ?? null,
        });
      }
    } catch (e) {
      console.error('[jobs/create] customer-aircraft upsert failed:', e?.message || e);
    }
  }

  return Response.json({ success: true, job });
}
