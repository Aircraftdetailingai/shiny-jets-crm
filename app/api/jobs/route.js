import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const JOB_STATUSES = ['completed', 'paid', 'scheduled', 'in_progress'];

// GET - Fetch job completions for profitability analysis
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '30';

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));

  let jobs = [];

  // Try job_completions table first
  const { data: jcData, error: jcError } = await supabase
    .from('job_completions')
    .select('*, quotes (aircraft_model, aircraft_type, client_name, services, line_items)')
    .eq('detailer_id', user.id)
    .gte('completed_at', startDate.toISOString())
    .order('completed_at', { ascending: false });

  if (!jcError && jcData) {
    jobs = jcData;
  } else {
    // Fallback: derive jobs from quotes with column-stripping retry
    console.log('[jobs] job_completions table unavailable, falling back to quotes. Error:', jcError?.message);
    let selectCols = 'id, aircraft_model, aircraft_type, client_name, total_price, status, completed_at, created_at, services, line_items';
    let completedQuotes = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('quotes')
        .select(selectCols)
        .eq('detailer_id', user.id)
        .in('status', JOB_STATUSES)
        .order('created_at', { ascending: false });

      if (!error) { completedQuotes = data; break; }

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

    jobs = (completedQuotes || []).map(q => ({
      id: q.id,
      quote_id: q.id,
      revenue: parseFloat(q.total_price) || 0,
      actual_hours: 0,
      labor_rate: 0,
      product_cost: 0,
      profit: parseFloat(q.total_price) || 0,
      margin_percent: 100,
      completed_at: q.completed_at || q.created_at,
      notes: null,
      quotes: {
        aircraft_model: q.aircraft_model,
        aircraft_type: q.aircraft_type,
        client_name: q.client_name,
        services: q.services,
        line_items: q.line_items,
      },
    }));
  }

  console.log('[jobs] Returning', jobs.length, 'jobs for detailer', user.id);

  const stats = {
    totalJobs: jobs.length,
    totalRevenue: jobs.reduce((sum, j) => sum + parseFloat(j.revenue || 0), 0),
    totalProfit: jobs.reduce((sum, j) => sum + parseFloat(j.profit || 0), 0),
    totalHours: jobs.reduce((sum, j) => sum + parseFloat(j.actual_hours || 0), 0),
    avgMargin: jobs.length > 0
      ? jobs.reduce((sum, j) => sum + parseFloat(j.margin_percent || 0), 0) / jobs.length
      : 0,
  };

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
