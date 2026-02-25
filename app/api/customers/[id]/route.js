import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Single customer with stats
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabase();

  // Fetch customer
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (error || !customer) {
    return Response.json({ error: 'Customer not found' }, { status: 404 });
  }

  // Get quote stats for this customer
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, total_price, status, created_at, paid_at, completed_at')
    .eq('detailer_id', user.id)
    .eq('client_email', customer.email)
    .order('created_at', { ascending: false });

  const allQuotes = quotes || [];
  const paidQuotes = allQuotes.filter(q => q.status === 'paid' || q.status === 'completed');
  const completedQuotes = allQuotes.filter(q => q.status === 'completed');
  const totalRevenue = paidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
  const lastCompleted = completedQuotes.length > 0 ? completedQuotes[0].completed_at : null;

  return Response.json({
    customer,
    stats: {
      totalQuotes: allQuotes.length,
      totalRevenue,
      completedJobs: completedQuotes.length,
      lastService: lastCompleted,
    },
  });
}

// PATCH - Update customer contact fields
export async function PATCH(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabase();
  const body = await request.json();

  // Verify ownership
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (!customer) {
    return Response.json({ error: 'Customer not found' }, { status: 404 });
  }

  const updates = { updated_at: new Date().toISOString() };
  const contactFields = ['poc_name', 'poc_phone', 'poc_email', 'poc_role',
    'emergency_contact_name', 'emergency_contact_phone', 'contact_notes'];
  for (const f of contactFields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  // Column-stripping retry
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error) return Response.json({ customer: data });

    const colMatch = error.message?.match(/column "([^"]+)" of relation "customers" does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column of 'customers'/);
    if (colMatch) {
      delete updates[colMatch[1]];
      continue;
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ error: 'Update failed' }, { status: 500 });
}
