import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    customer_id, customer_name, customer_email,
    aircraft_make, aircraft_model, tail_number, airport,
    services, scheduled_date, scheduled_time,
    assigned_crew, payment_method, total_price, notes,
  } = body;

  console.log('[jobs/create] received:', { customer_name, aircraft_make, aircraft_model, payment_method, total_price });

  if (!customer_name || !aircraft_make) {
    return Response.json({ error: 'Customer name and aircraft required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const isPaid = payment_method && payment_method !== 'unpaid';

  // Create job
  const jobData = {
    detailer_id: user.id,
    customer_id: customer_id || null,
    customer_name: customer_name || '',
    customer_email: customer_email || null,
    tail_number: tail_number || null,
    aircraft_make: aircraft_make || null,
    aircraft_model: aircraft_model || null,
    airport: airport || null,
    services: services ? JSON.stringify(services.map(s => s.name).filter(Boolean)) : null,
    scheduled_date: scheduled_date || null,
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
    console.error('[jobs/create] Insert error:', jobErr);
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
          detailer_id: user.id,
        });
      } catch {}
    }
  }

  return Response.json({ success: true, job });
}
