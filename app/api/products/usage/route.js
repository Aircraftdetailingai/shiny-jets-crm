import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Get product usage for a quote or all usage
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get('quoteId');

  let query = supabase
    .from('product_usage')
    .select(`
      *,
      products (id, name, category, cost_per_oz),
      quotes (id, aircraft_model, client_name, total_price)
    `)
    .order('created_at', { ascending: false });

  // Always scope to user's own quotes
  const { data: userQuotes } = await supabase
    .from('quotes')
    .select('id')
    .eq('detailer_id', user.id);

  const quoteIds = userQuotes?.map(q => q.id) || [];
  if (quoteIds.length === 0) {
    return Response.json({ usage: [] });
  }

  if (quoteId) {
    // Verify the requested quote belongs to this user
    if (!quoteIds.includes(quoteId)) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }
    query = query.eq('quote_id', quoteId);
  } else {
    query = query.in('quote_id', quoteIds);
  }

  const { data: usage } = await query.limit(100);

  // Calculate totals
  let totalCost = 0;
  for (const u of usage || []) {
    if (u.products?.cost_per_oz && u.amount_used) {
      totalCost += u.products.cost_per_oz * u.amount_used;
    }
  }

  return Response.json({
    usage: usage || [],
    totalCost,
  });
}

// POST - Log product usage
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { quoteId, productId, amountUsed, unit, notes } = await request.json();

  if (!quoteId || !productId) {
    return Response.json({ error: 'Quote ID and Product ID required' }, { status: 400 });
  }

  // Verify quote belongs to user
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, detailer_id')
    .eq('id', quoteId)
    .single();

  if (!quote || quote.detailer_id !== user.id) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Insert usage
  const { data: usage, error } = await supabase
    .from('product_usage')
    .insert({
      quote_id: quoteId,
      product_id: productId,
      amount_used: amountUsed || 0,
      unit: unit || 'oz',
      notes: notes || '',
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Award points for logging product usage
  const { data: detailer } = await supabase
    .from('detailers')
    .select('total_points, lifetime_points')
    .eq('id', user.id)
    .single();

  const points = 10;
  await supabase
    .from('points_history')
    .insert({
      detailer_id: user.id,
      points,
      reason: 'log_product_usage',
      metadata: { quoteId, productId },
    });

  await supabase
    .from('detailers')
    .update({
      total_points: (detailer?.total_points || 0) + points,
      lifetime_points: (detailer?.lifetime_points || 0) + points,
    })
    .eq('id', user.id);

  return Response.json({
    usage,
    pointsAwarded: points,
  });
}

// DELETE - Remove usage log
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'Usage ID required' }, { status: 400 });
  }

  // Verify ownership through quote
  const { data: usage } = await supabase
    .from('product_usage')
    .select('id, quotes(detailer_id)')
    .eq('id', id)
    .single();

  if (!usage || usage.quotes?.detailer_id !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('product_usage')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
