import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const JOB_STATUSES = ['paid', 'approved', 'accepted', 'scheduled', 'in_progress', 'completed'];

// GET - Fetch all jobs (quotes at job stage)
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Query quotes directly with column-stripping retry
  let selectCols = 'id, client_name, client_email, customer_company, aircraft_model, aircraft_type, tail_number, total_price, status, scheduled_date, created_at, completed_at, services, line_items, share_link';
  let jobs = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('quotes')
      .select(selectCols)
      .eq('detailer_id', user.id)
      .in('status', JOB_STATUSES)
      .order('scheduled_date', { ascending: true, nullsFirst: false });

    if (!error) { jobs = data; break; }

    const colMatch = error.message?.match(/column [\w.]+"?(\w+)"? does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column/)
      || error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      selectCols = selectCols.split(',').map(c => c.trim()).filter(c => c !== colMatch[1]).join(', ');
      console.log(`[jobs] Stripped missing column '${colMatch[1]}', retrying...`);
      continue;
    }
    console.log('[jobs] Quote query error:', error.message);
    break;
  }

  jobs = jobs || [];

  // Also fetch from jobs table (manually created jobs)
  try {
    const { data: manualJobs } = await supabase
      .from('jobs')
      .select('id, customer_name, customer_email, aircraft_make, aircraft_model, tail_number, airport, services, total_price, status, scheduled_date, schedule_override, created_at, completed_at, completion_notes')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: false });

    if (manualJobs?.length > 0) {
      // Merge — avoid duplicates by quote_id
      const quoteIds = new Set(jobs.map(j => j.id));
      for (const mj of manualJobs) {
        if (mj.quote_id && quoteIds.has(mj.quote_id)) continue; // already in quotes list
        jobs.push({
          id: mj.id,
          client_name: mj.customer_name,
          client_email: mj.customer_email,
          aircraft_model: mj.aircraft_model,
          aircraft_type: mj.aircraft_make,
          tail_number: mj.tail_number,
          airport: mj.airport,
          total_price: mj.total_price,
          status: mj.status || 'scheduled',
          scheduled_date: mj.scheduled_date,
          schedule_override: !!mj.schedule_override,
          created_at: mj.created_at,
          completed_at: mj.completed_at,
          services: typeof mj.services === 'string' ? (() => { try { return JSON.parse(mj.services); } catch { return mj.services; } })() : mj.services,
          _source: 'jobs_table',
        });
      }
    }
  } catch (e) {
    console.log('[jobs] Manual jobs query error:', e.message);
  }

  // Sort by scheduled_date
  jobs.sort((a, b) => {
    const da = a.scheduled_date ? new Date(a.scheduled_date) : new Date('9999-12-31');
    const db = b.scheduled_date ? new Date(b.scheduled_date) : new Date('9999-12-31');
    return da - db;
  });

  const stats = {
    total: jobs.length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => ['completed', 'complete'].includes(j.status)).length,
    totalRevenue: jobs.reduce((sum, j) => sum + (parseFloat(j.total_price) || 0), 0),
  };

  console.log(`[jobs] Returning ${jobs.length} jobs (${jobs.filter(j => j._source === 'jobs_table').length} from jobs table, ${jobs.filter(j => !j._source).length} from quotes)`);
  return Response.json({ jobs, stats });
}

// POST - Record a job completion
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { quote_id, actual_hours, labor_rate, product_cost, service_breakdown, notes } = body;

  if (!quote_id || !actual_hours) {
    return new Response(JSON.stringify({ error: 'Quote ID and actual hours are required' }), { status: 400 });
  }

  const supabase = getSupabase();

  // Get the quote to verify ownership and get revenue
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id, detailer_id, total_price, status')
    .eq('id', quote_id)
    .single();

  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }

  if (quote.detailer_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
  }

  // Get detailer's default labor rate if not provided
  const { data: detailer } = await supabase
    .from('detailers')
    .select('default_labor_rate')
    .eq('id', user.id)
    .single();

  const effectiveLaborRate = labor_rate || detailer?.default_labor_rate || 25;

  // Insert job completion
  const { data: job, error } = await supabase
    .from('job_completions')
    .insert({
      quote_id,
      detailer_id: user.id,
      revenue: quote.total_price,
      actual_hours: parseFloat(actual_hours),
      labor_rate: parseFloat(effectiveLaborRate),
      product_cost: parseFloat(product_cost) || 0,
      service_breakdown: service_breakdown || [],
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to record job:', error);
    return new Response(JSON.stringify({ error: 'Failed to record job completion' }), { status: 500 });
  }

  // Update quote status to completed
  await supabase
    .from('quotes')
    .update({ status: 'completed' })
    .eq('id', quote_id);

  return new Response(JSON.stringify({ job }), { status: 201 });
}
