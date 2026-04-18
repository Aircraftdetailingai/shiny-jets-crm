import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get all packages for a detailer
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    let { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .eq('detailer_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    // Retry without sort_order if column doesn't exist
    if (error && error.message?.includes('sort_order')) {
      const retry = await supabase.from('packages').select('*').eq('detailer_id', user.id).order('created_at', { ascending: true });
      packages = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Failed to fetch packages:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ packages: packages || [] });

  } catch (err) {
    console.error('Packages GET error:', err);
    return Response.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
}

// POST - Create a new package
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { name, description, discount_percent, service_ids } = body;

    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const row = {
      detailer_id: user.id,
      name,
      description: description || '',
      service_ids: service_ids || [],
    };

    // Try with discount_percent; fall back without if column doesn't exist
    row.discount_percent = parseFloat(discount_percent) || 0;

    let { data: pkg, error } = await supabase
      .from('packages')
      .insert(row)
      .select()
      .single();

    if (error && error.message?.includes('discount_percent')) {
      delete row.discount_percent;
      const retry = await supabase.from('packages').insert(row).select().single();
      pkg = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Failed to create package:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ package: pkg }, { status: 201 });

  } catch (err) {
    console.error('Packages POST error:', err);
    return Response.json({ error: 'Failed to create package' }, { status: 500 });
  }
}
