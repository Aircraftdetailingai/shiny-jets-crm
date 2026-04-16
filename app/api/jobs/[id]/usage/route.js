import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Products actually used on this job (from job_product_usage + product_usage fallback)
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detailerId = user.detailer_id || user.id;
  const supabase = getSupabase();

  // job_product_usage (newer table)
  const { data: jpu } = await supabase
    .from('job_product_usage')
    .select('id, product_id, product_name, actual_quantity, amount_used, unit, notes, created_at, logged_at, team_member_id')
    .or(`job_id.eq.${id},quote_id.eq.${id}`)
    .eq('detailer_id', detailerId);

  // Legacy product_usage table
  let legacy = [];
  try {
    const { data } = await supabase
      .from('product_usage')
      .select('id, product_id, amount_used, unit, notes, created_at')
      .or(`quote_id.eq.${id},job_id.eq.${id}`);
    legacy = data || [];
  } catch {}

  // Need product names for legacy entries that lack product_name
  const allProductIds = [...new Set([
    ...(jpu || []).map(u => u.product_id),
    ...legacy.map(u => u.product_id),
  ].filter(Boolean))];
  let productMap = {};
  if (allProductIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', allProductIds);
    for (const p of products || []) productMap[p.id] = p.name;
  }

  // Team member names
  const memberIds = [...new Set((jpu || []).map(u => u.team_member_id).filter(Boolean))];
  let memberMap = {};
  if (memberIds.length > 0) {
    const { data: members } = await supabase.from('team_members').select('id, name').in('id', memberIds);
    for (const m of members || []) memberMap[m.id] = m.name;
  }

  const usage = [
    ...(jpu || []).map(u => ({
      id: u.id,
      product_name: u.product_name || productMap[u.product_id] || 'Unknown product',
      quantity: u.actual_quantity || u.amount_used,
      unit: u.unit,
      notes: u.notes,
      logged_by: memberMap[u.team_member_id] || null,
      logged_at: u.logged_at || u.created_at,
    })),
    ...legacy.map(u => ({
      id: u.id,
      product_name: productMap[u.product_id] || 'Unknown product',
      quantity: u.amount_used,
      unit: u.unit,
      notes: u.notes,
      logged_by: null,
      logged_at: u.created_at,
    })),
  ].sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));

  return Response.json({ usage, count: usage.length });
}
