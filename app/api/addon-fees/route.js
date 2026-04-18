import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get all add-on fees for a detailer
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

    const { data: fees, error } = await supabase
      .from('addon_fees')
      .select('*')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      // Table might not exist yet — return empty
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return Response.json({ fees: [] });
      }
      console.error('Failed to fetch addon fees:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fees: fees || [] });

  } catch (err) {
    console.error('Addon fees GET error:', err);
    return Response.json({ error: 'Failed to fetch addon fees' }, { status: 500 });
  }
}

// POST - Create a new add-on fee
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
    const { name, description, fee_type, amount } = body;

    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data: fee, error } = await supabase
      .from('addon_fees')
      .insert({
        detailer_id: user.id,
        name,
        description: description || '',
        fee_type: fee_type || 'flat',
        amount: parseFloat(amount) || 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create addon fee:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fee }, { status: 201 });

  } catch (err) {
    console.error('Addon fees POST error:', err);
    return Response.json({ error: 'Failed to create addon fee' }, { status: 500 });
  }
}
