import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// Column-stripping retry — survives older deployments where the column the
// route asks for doesn't exist yet. Modeled after /api/user/profile (8f7165e).
async function selectWithRetry(supabase, table, cols, filterFn) {
  let current = cols;
  for (let attempt = 0; attempt < 6; attempt++) {
    let q = supabase.from(table).select(current);
    q = filterFn(q);
    const { data, error } = await q;
    if (!error) return data || [];
    const colMatch = error.message?.match(/column [\w.]+"?(\w+)"? does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column/)
      || error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      const bad = colMatch[1];
      current = current.split(',').map(c => c.trim()).filter(c => c !== bad).join(', ');
      if (!current) return [];
      continue;
    }
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    console.log(`[customer-details] ${table} err:`, error.message);
    return [];
  }
  return [];
}

export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  const supabase = getSupabase();
  const detailerId = await resolveDetailerId(supabase, user);

  // Load the customer first — gates everything else on ownership.
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('detailer_id', detailerId)
    .maybeSingle();

  if (custErr || !customer) {
    console.log('[customer-details] not found', { id, detailerId });
    return Response.json({ error: 'Customer not found' }, { status: 404, headers: NO_STORE });
  }

  const email = (customer.email || '').toLowerCase().trim();
  const aircraft = Array.isArray(customer.tail_numbers) ? customer.tail_numbers : [];
  const notes = customer.notes || '';

  // Fetch all activity sources in parallel. Quotes + invoices link by email
  // (no FK column on those tables); jobs has a direct customer_id FK.
  const [quotes, invoices, jobsByCustId, jobsByEmail, leads] = await Promise.all([
    selectWithRetry(
      supabase,
      'quotes',
      'id, status, total_price, tail_number, aircraft_model, created_at, scheduled_date, paid_at, completed_at',
      q => q.eq('detailer_id', detailerId).ilike('client_email', email).order('created_at', { ascending: false }).limit(50),
    ),
    selectWithRetry(
      supabase,
      'invoices',
      'id, status, total, tail_number, aircraft_model, created_at, due_date, paid_at',
      q => q.eq('detailer_id', detailerId).ilike('customer_email', email).order('created_at', { ascending: false }).limit(50),
    ),
    selectWithRetry(
      supabase,
      'jobs',
      'id, status, total_price, tail_number, aircraft_model, scheduled_date, created_at, completed_at',
      q => q.eq('detailer_id', detailerId).eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    ),
    selectWithRetry(
      supabase,
      'jobs',
      'id, status, total_price, tail_number, aircraft_model, scheduled_date, created_at, completed_at',
      q => q.eq('detailer_id', detailerId).ilike('customer_email', email).order('created_at', { ascending: false }).limit(50),
    ),
    selectWithRetry(
      supabase,
      'intake_leads',
      'id, photo_urls, created_at, tail_number, aircraft_model',
      q => q.eq('detailer_id', detailerId).ilike('email', email).order('created_at', { ascending: false }).limit(20),
    ),
  ]);

  // Photos: only intake_leads.photo_urls exists in this schema. Each entry is
  // a string URL or an object with a .url field.
  const photos = [];
  for (const lead of leads) {
    const arr = Array.isArray(lead.photo_urls) ? lead.photo_urls : [];
    for (const p of arr) {
      const url = typeof p === 'string' ? p : (p?.url || p?.publicUrl || null);
      if (url) {
        photos.push({
          url,
          source: 'lead',
          source_id: lead.id,
          taken_at: lead.created_at,
          aircraft: lead.tail_number || lead.aircraft_model || null,
        });
      }
    }
  }

  // Merge jobs by id (avoid double-counting rows that match both customer_id
  // and customer_email).
  const jobsMap = new Map();
  for (const j of [...jobsByCustId, ...jobsByEmail]) {
    if (j?.id && !jobsMap.has(j.id)) jobsMap.set(j.id, j);
  }
  const jobs = Array.from(jobsMap.values());

  const activity = [];
  for (const q of quotes) {
    activity.push({
      kind: 'quote',
      id: q.id,
      href: `/quotes/${q.id}`,
      status: q.status || 'draft',
      amount: parseFloat(q.total_price) || 0,
      label: q.aircraft_model || q.tail_number || 'Quote',
      date: q.created_at,
    });
  }
  for (const inv of invoices) {
    activity.push({
      kind: 'invoice',
      id: inv.id,
      href: `/invoices?view=${inv.id}`,
      status: inv.status || 'draft',
      amount: parseFloat(inv.total) || 0,
      label: inv.aircraft_model || inv.tail_number || 'Invoice',
      date: inv.created_at,
    });
  }
  for (const j of jobs) {
    activity.push({
      kind: 'job',
      id: j.id,
      href: `/jobs/${j.id}`,
      status: j.status || 'pending',
      amount: parseFloat(j.total_price) || 0,
      label: j.aircraft_model || j.tail_number || 'Job',
      date: j.scheduled_date || j.created_at,
    });
  }

  activity.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return Response.json(
    {
      customer,
      aircraft,
      notes,
      photos,
      activity: activity.slice(0, 20),
      counts: {
        quotes: quotes.length,
        invoices: invoices.length,
        jobs: jobs.length,
        photos: photos.length,
      },
    },
    { headers: NO_STORE },
  );
}
