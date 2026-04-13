import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getUser(request) {
  // Try owner auth first
  const user = await getAuthUser(request);
  if (user) return { ...user, role: user.role || 'owner' };
  // Try crew auth
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const payload = await verifyToken(authHeader.slice(7));
    if (payload?.role === 'crew') return payload;
  }
  return null;
}

// GET — product selections for a job's services
export async function GET(request, { params }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: jobId } = await params;
  const supabase = getSupabase();

  // Get job's service product selections
  const { data: selections } = await supabase
    .from('job_service_products')
    .select('service_id, product_id, changed_by_name')
    .eq('job_id', jobId);

  // Get available products per service (from service_products)
  const detailerId = user.detailer_id || user.id;
  const { data: serviceProducts } = await supabase
    .from('service_products')
    .select('service_id, product_id, is_default, products(id, name, brand, unit, size)')
    .eq('detailer_id', detailerId);

  return Response.json({
    selections: selections || [],
    serviceProducts: (serviceProducts || []).map(sp => ({
      service_id: sp.service_id,
      product_id: sp.product_id,
      is_default: sp.is_default,
      product: sp.products,
    })),
  });
}

// POST — set product for a service on a job
export async function POST(request, { params }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: jobId } = await params;
  const { service_id, product_id } = await request.json();

  if (!service_id || !product_id) {
    return Response.json({ error: 'service_id and product_id required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const userName = user.name || user.email || 'Unknown';

  const { error } = await supabase
    .from('job_service_products')
    .upsert({
      job_id: jobId,
      service_id,
      product_id,
      changed_by: user.id,
      changed_by_name: userName,
    }, { onConflict: 'job_id,service_id' });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Log to activity
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: user.detailer_id || user.id,
      team_member_id: user.role === 'crew' ? user.id : null,
      team_member_name: userName,
      job_id: jobId,
      action_type: 'product_change',
      action_details: { service_id, product_id },
    });
  } catch {}

  return Response.json({ success: true });
}
