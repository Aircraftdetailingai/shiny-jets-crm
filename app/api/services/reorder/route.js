import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

// POST - Save new service order
export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { order } = await request.json();

    if (!Array.isArray(order) || order.length === 0) {
      return Response.json({ error: 'order array is required' }, { status: 400 });
    }

    // Update sort_order for each service
    const updates = order.map((id, index) =>
      supabase
        .from('services')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('detailer_id', user.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);

    if (failed?.error) {
      // If sort_order column doesn't exist, try adding it via a single update to trigger the column
      if (failed.error.message?.includes('sort_order')) {
        return Response.json({ error: 'sort_order column not found — run migration' }, { status: 500 });
      }
      console.error('Failed to reorder services:', failed.error);
      return Response.json({ error: failed.error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Services reorder error:', err);
    return Response.json({ error: 'Failed to reorder services' }, { status: 500 });
  }
}
