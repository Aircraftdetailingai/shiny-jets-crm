import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET — fetch recommendations for a customer or all
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customer_id');
  const tailNumber = searchParams.get('tail_number');

  const supabase = getSupabase();
  let query = supabase.from('customer_recommendations').select('*').eq('detailer_id', user.id);
  if (customerId) query = query.eq('customer_id', customerId);
  if (tailNumber) query = query.eq('tail_number', tailNumber);
  query = query.order('next_due_date', { ascending: true });

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ recommendations: data || [] });
}

// POST — create or update a recommendation
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, customer_id, tail_number, service_name, status, interval_days, last_service_date, notes } = body;

  if (!service_name) return Response.json({ error: 'Service name required' }, { status: 400 });

  const supabase = getSupabase();
  const nextDue = last_service_date && interval_days
    ? new Date(new Date(last_service_date).getTime() + interval_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : null;

  const record = {
    detailer_id: user.id,
    customer_id: customer_id || null,
    tail_number: tail_number || null,
    service_name,
    status: status || 'maintain',
    interval_days: interval_days || 90,
    last_service_date: last_service_date || null,
    next_due_date: nextDue,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (id) {
    const { data, error } = await supabase.from('customer_recommendations').update(record).eq('id', id).eq('detailer_id', user.id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    result = data;
  } else {
    record.created_at = new Date().toISOString();
    const { data, error } = await supabase.from('customer_recommendations').insert(record).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return Response.json({ success: true, recommendation: result });
}

// DELETE — remove a recommendation
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'ID required' }, { status: 400 });

  const supabase = getSupabase();
  await supabase.from('customer_recommendations').delete().eq('id', id).eq('detailer_id', user.id);

  return Response.json({ success: true });
}
