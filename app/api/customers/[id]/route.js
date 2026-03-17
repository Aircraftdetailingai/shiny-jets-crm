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

  // Get quote stats — column-stripping retry + case-insensitive email
  const email = customer.email?.toLowerCase().trim();
  console.log('[customer-detail] id:', id, '| email:', email, '| detailer_id:', user.id);

  let selectCols = 'id, total_price, status, created_at, paid_at, completed_at';
  let allQuotes = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error: qErr } = await supabase
      .from('quotes')
      .select(selectCols)
      .eq('detailer_id', user.id)
      .ilike('client_email', email)
      .order('created_at', { ascending: false });

    if (!qErr) { allQuotes = data || []; break; }
    const colMatch = qErr.message?.match(/column [\w.]+"?(\w+)"? does not exist/)
      || qErr.message?.match(/Could not find the '([^']+)' column/)
      || qErr.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      selectCols = selectCols.split(',').map(c => c.trim()).filter(c => c !== colMatch[1]).join(', ');
      console.log(`[customer-detail] Stripped missing column '${colMatch[1]}', retrying...`);
      continue;
    }
    console.log('[customer-detail] Quote query error:', qErr.message);
    break;
  }

  console.log('[customer-detail] quotes found:', allQuotes.length);

  const REVENUE_STATUSES = ['accepted', 'approved', 'paid', 'scheduled', 'in_progress', 'completed'];
  const revenueQuotes = allQuotes.filter(q => REVENUE_STATUSES.includes(q.status));
  const completedQuotes = allQuotes.filter(q => q.status === 'completed');
  const totalRevenue = revenueQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);
  const lastCompleted = completedQuotes.length > 0 ? completedQuotes[0].completed_at : null;

  return Response.json({
    customer,
    stats: {
      totalQuotes: allQuotes.length,
      totalRevenue,
      completedJobs: completedQuotes.length,
      lastService: lastCompleted || (allQuotes.length > 0 ? allQuotes[0].created_at : null),
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
  if (body.is_archived !== undefined) updates.is_archived = body.is_archived;

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

// DELETE - Remove a customer
export async function DELETE(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabase();

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

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('detailer_id', user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
