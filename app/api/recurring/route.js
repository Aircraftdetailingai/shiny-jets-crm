import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('quotes')
      .select('*')
      .eq('detailer_id', user.id)
      .eq('is_recurring', true)
      .order('next_service_date', { ascending: true });

    if (status === 'active') {
      query = query.eq('recurring_enabled', true);
    } else if (status === 'paused') {
      query = query.eq('recurring_enabled', false);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42703' || error.message?.includes('does not exist')) {
        return Response.json({ recurring: [], message: 'Recurring columns not yet added. Run the SQL migration.' });
      }
      console.error('Recurring fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ recurring: data || [] });

  } catch (err) {
    console.error('Recurring API error:', err);
    return Response.json({ error: 'Failed to fetch recurring services' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { quote_id, recurring_enabled, recurring_interval, next_service_date } = body;

    if (!quote_id) {
      return Response.json({ error: 'quote_id is required' }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('quotes')
      .select('id')
      .eq('id', quote_id)
      .eq('detailer_id', user.id)
      .single();

    if (!existing) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    const updates = { is_recurring: true };
    if (recurring_enabled !== undefined) updates.recurring_enabled = recurring_enabled;
    if (recurring_interval !== undefined) updates.recurring_interval = recurring_interval;
    if (next_service_date !== undefined) updates.next_service_date = next_service_date;

    const { data, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('id', quote_id)
      .select()
      .single();

    if (error) {
      console.error('Recurring update error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data);

  } catch (err) {
    console.error('Recurring PATCH error:', err);
    return Response.json({ error: 'Failed to update recurring service' }, { status: 500 });
  }
}
